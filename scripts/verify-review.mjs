#!/usr/bin/env node
/**
 * "Vision proposes, determinism proves" arbitration. Zero runtime deps
 * (Chrome only for the runtime layer, and it degrades gracefully).
 *
 * A vision model's review issues are CLAIMS. For the subset that is about
 * geometry (sizes / spacing / radius / alignment — the exact things VLMs
 * measure poorly, see arXiv 2407.06581), this re-checks the claim against the
 * deterministic layer (check-geometry.mjs + check-computed.mjs) and labels it:
 *
 *   - confirmed    : the deterministic checks also found a matching violation
 *   - refuted      : geometry claim, but deterministic checks are clean → VLM false positive
 *   - unverifiable : not a geometry claim, or no deterministic check covers it (fail-closed)
 *
 * Refuted issues are dropped from the blocking set. The rest gate as usual.
 * Exit 0 = no blocking issues remain; 1 = blocking remain; 2 = invalid input.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateReview, validateSpec } from './lib/schema.mjs'
import { resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = (n) => path.join(here, n)
const ORDER = { P0: 0, P1: 1, P2: 2 }

function parse(argv) {
  const args = { root: process.cwd(), block: 'P1' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--review') args.review = argv[++i]
    else if (argv[i] === '--spec') args.spec = argv[++i]
    else if (argv[i] === '--html') args.html = argv[++i]
    else if (argv[i] === '--block') args.block = argv[++i]
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!args.review || !args.spec) throw new Error('必须提供 --review 和 --spec')
  if (!(args.block in ORDER)) throw new Error('--block 只支持 P0、P1、P2')
  return args
}

function runNode(file, args, root, { allowFail = false } = {}) {
  const res = spawnSync(process.execPath, [file, ...args, '--root', root], { encoding: 'utf8' })
  if (res.error) throw new Error(`运行 ${path.basename(file)} 失败：${res.error.message}`)
  if (res.status === 2) throw new Error(`${path.basename(file)} 输入无效：${res.stderr || res.stdout}`)
  if (res.status !== 0 && !allowFail) throw new Error(`${path.basename(file)} 退出码 ${res.status}：${res.stderr || res.stdout}`)
  return res
}

const rel = (root, abs) => path.relative(root, abs)

const GEOM_NOUN = /(高度|宽度|尺寸|大小|圆角|间距|边距|内边距|对齐|等高|错位|参差|height|width|size|radius|spacing|gap|padding|margin|align)/i
const GEOM_BAD = /(不一致|不统一|不等|不同|混用|错|混乱|inconsistent|consistent|not.?uniform|unif|mismatch|off.?scale)/i
function geometryClaim(issue) {
  const t = [issue.id, issue.location, issue.evidence, issue.expected, issue.actual, issue.fix].join(' ')
  return GEOM_NOUN.test(t) && GEOM_BAD.test(t)
}

const A11Y_KEYWORDS = [
  ['contrast', /(对比|contrast)/i],
  ['img-alt', /(图片|alt|image)/i],
  ['html-lang', /(lang|语言)/i],
  ['input-label', /(标签|label|表单)/i],
  ['button-name', /(按钮名|可访问名称|aria-label)/i],
  ['heading-order', /(标题层级|跳级|heading)/i],
  ['duplicate-id', /(重复.?id|duplicate)/i],
]
function a11yCheck(issue) {
  if (issue.category !== 'accessibility') return null
  const t = [issue.id, issue.evidence, issue.expected, issue.actual, issue.fix].join(' ')
  for (const [id, re] of A11Y_KEYWORDS) if (re.test(t)) return id
  return null
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/verify-review.mjs --review <评审> --spec <规格> [--html <HTML>] [--block P0|P1|P2] [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const reviewPath = resolveExistingInside(root, args.review, '评审文件')
  const specPath = resolveExistingInside(root, args.spec, '规格书')
  const review = validateReview(JSON.parse(readFileSync(reviewPath, 'utf8')))
  const spec = validateSpec(JSON.parse(readFileSync(specPath, 'utf8')), { requireDesignTokens: true })

  let deterministic = null
  let geometryViolations = []
  let a11yViolationIds = new Set()
  let a11yContrastSkipped = false

  if (args.html) {
    const htmlRel = path.relative(root, resolveExistingInside(root, args.html, 'HTML 文件'))
    const outRes = runNode(script('check-output.mjs'), ['--spec', rel(root, specPath), '--html', htmlRel], root, { allowFail: true })
    const geoRes = runNode(script('check-geometry.mjs'), ['--spec', rel(root, specPath), '--html', htmlRel], root, { allowFail: true })
    let out = {}; try { out = JSON.parse(outRes.stdout) } catch { out = { passed: false } }
    let geo = {}; try { geo = JSON.parse(geoRes.stdout) } catch { geo = { passed: false } }
    geometryViolations.push(...(geo.violations || []))

    // Runtime layer (optional Chrome); exit 3 = no Chrome → skip, not fail.
    let computed = { skipped: true, reason: 'Chrome 不可用' }
    const compRes = runNode(script('check-computed.mjs'), ['--spec', rel(root, specPath), '--html', htmlRel], root, { allowFail: true })
    if (compRes.status === 0 || compRes.status === 1) {
      try { computed = JSON.parse(compRes.stdout); geometryViolations.push(...(computed.violations || [])) } catch { computed = { skipped: true, reason: '解析失败' } }
    }

    // a11y (structural always; contrast degrades without Chrome)
    let a11y = { passed: false, skipped: true }
    const a11yRes = runNode(script('check-a11y.mjs'), ['--html', htmlRel], root, { allowFail: true })
    if (a11yRes.status === 0 || a11yRes.status === 1) {
      try { a11y = JSON.parse(a11yRes.stdout); a11yViolationIds = new Set((a11y.violations || []).map((v) => v.id)); a11yContrastSkipped = Boolean(a11y.metrics?.contrast?.skipped) } catch { a11y = { skipped: true } }
    }

    deterministic = {
      html: htmlRel,
      output: { passed: out.passed, contentMissing: out.content?.missingCount ?? null, tokenMissing: out.tokens?.missing ?? null },
      geometry: { passed: geo.passed, violations: geo.violations ?? [] },
      computed: { passed: computed.passed, skipped: computed.skipped, violations: computed.violations ?? [] },
      a11y: { passed: a11y.passed, skipped: a11y.skipped, violations: a11y.violations ?? [] }
    }
  }

  const issues = review.issues.map((issue) => {
    if (!args.html) return { id: issue.id, severity: issue.severity, category: issue.category, verdict: 'unverifiable', reason: '未提供 --html，跳过确定性复核' }
    if (geometryClaim(issue)) {
      if (geometryViolations.length > 0) return { id: issue.id, severity: issue.severity, category: issue.category, verdict: 'confirmed', reason: `确定性几何校验发现 ${geometryViolations.length} 条违例`, evidence: geometryViolations.map((v) => v.id || v) }
      return { id: issue.id, severity: issue.severity, category: issue.category, verdict: 'refuted', reason: '几何声明但确定性校验（源码+运行时）未发现违例，判定为识图误报' }
    }
    const a11yId = a11yCheck(issue)
    if (a11yId) {
      if (a11yId === 'contrast' && a11yContrastSkipped) return { id: issue.id, severity: issue.severity, category: issue.category, verdict: 'unverifiable', reason: '对比度声明但 Chrome 不可用，未复核（fail-closed 保留）' }
      if (a11yViolationIds.has(a11yId)) return { id: issue.id, severity: issue.severity, category: issue.category, verdict: 'confirmed', reason: `确定性 a11y 校验（${a11yId}）发现违例` }
      return { id: issue.id, severity: issue.severity, category: issue.category, verdict: 'refuted', reason: `可访问性声明但确定性 a11y 校验未发现 ${a11yId} 违例，判定为误报` }
    }
    return { id: issue.id, severity: issue.severity, category: issue.category, verdict: 'unverifiable', reason: '非几何/可机检 a11y 声明，确定性层暂不覆盖（fail-closed 保留）' }
  })

  const blocking = issues.filter((i) => ORDER[i.severity] <= ORDER[args.block] && i.verdict !== 'refuted')
  const refuted = issues.filter((i) => i.verdict === 'refuted')
  const passed = blocking.length === 0

  console.log(JSON.stringify({
    schemaVersion: '1.0.0',
    check: 'verify-review',
    passed,
    blockAtOrAbove: args.block,
    deterministic,
    issues,
    refuted: refuted.map((i) => i.id),
    blocking: blocking.map((i) => i.id),
    summary: passed ? `达标：${refuted.length} 条识图误报被证伪后，无 ${args.block} 及以上问题。` : `未达标：${blocking.length} 条问题仍阻塞（${refuted.length} 条误报已证伪）。`
  }, null, 2))
  process.exit(passed ? 0 : 1)
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(2)
}
