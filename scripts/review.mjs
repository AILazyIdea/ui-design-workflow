#!/usr/bin/env node
/**
 * Vision-review dispatcher. No vendor lock-in: the only hard contract is the
 * `review` JSON (schemas/review.schema.json). Any vision-capable model, plugin,
 * MCP tool, or a human can produce it.
 *
 * Outcomes (fail-closed; never fabricate a pass):
 *   - `--template`       → print a valid review skeleton to fill in (exit 0).
 *   - no reviewer found  → print {"status":"skipped", ...} (exit 0; "skipped" is not "passed").
 *   - reviewer configured → run its adapter, validate stdout as a review, print the
 *                           review (exit 0) or a structured error (exit 2).
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateReview, validateSpec } from './lib/schema.mjs'
import { resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(here, '..')
const renderScript = path.join(here, 'render.mjs')
const registryPath = path.join(packageRoot, 'reviewers', 'registry.json')

function parse(argv) {
  const args = { root: process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--spec') args.spec = argv[++i]
    else if (argv[i] === '--candidate') args.candidate = argv[++i]
    else if (argv[i] === '--html') args.html = argv[++i]
    else if (argv[i] === '--output-name') args.outputName = argv[++i]
    else if (argv[i] === '--reference') args.reference = argv[++i]
    else if (argv[i] === '--reviewer') args.reviewer = argv[++i]
    else if (argv[i] === '--template') args.template = true
    else if (argv[i] === '--stdin') args.stdin = true
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  return args
}

function loadSpec(args, root) {
  if (args.stdin) return validateSpec(JSON.parse(readFileSync(0, 'utf8')))
  if (!args.spec) throw new Error('必须提供 --spec 或 --stdin')
  return validateSpec(JSON.parse(readFileSync(resolveExistingInside(root, args.spec, '规格书'), 'utf8')))
}

function renderHtml(args, root) {
  const outputName = args.outputName || 'review-candidate'
  const result = spawnSync(process.execPath, [renderScript, '--root', root, '--input', args.html, '--output-name', outputName], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`渲染失败：${(result.stderr || result.stdout || '').trim().slice(-600)}`)
  return path.join(root, JSON.parse(result.stdout).output)
}

function envelope(candidateAbs, referenceAbs, spec) {
  const viewport = (spec.meta && spec.meta.viewport) || { width: 1440, height: 900, dpr: 1 }
  return {
    imagePath: candidateAbs,
    ...(referenceAbs ? { referencePath: referenceAbs } : {}),
    viewport,
    spec,
    instructions: 'Review the candidate screenshot against the provided spec. Return a valid review JSON (schemaVersion "1.0.0", mode "review") with concrete evidence-backed issues. severity must be one of P0/P1/P2; category must be one of fidelity/functional/accessibility/responsive/content/visual. Do not invent or downgrade severities.'
  }
}

function skip(reason, hint) {
  console.log(JSON.stringify({ status: 'skipped', reason, hint }, null, 2))
  process.exit(0)
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) {
    console.log('用法: node scripts/review.mjs --spec <工作区相对规格> (--candidate <工作区相对 PNG>|--html <工作区相对 HTML>) [--reference <PNG>] [--template | --reviewer <名称>] [--output-name <名>] [--root <目录>]')
    process.exit(0)
  }
  const root = resolveWorkspaceRoot(args.root)
  const spec = loadSpec(args, root)

  let candidateAbs
  if (args.html) candidateAbs = renderHtml(args, root)
  else if (args.candidate) candidateAbs = resolveExistingInside(root, args.candidate, '候选截图')
  else throw new Error('必须提供 --candidate 或 --html')

  const referenceAbs = args.reference ? resolveExistingInside(root, args.reference, '参考截图') : null
  const viewport = (spec.meta && spec.meta.viewport) || { width: 1440, height: 900, dpr: 1 }

  if (args.template) {
    const skeleton = {
      schemaVersion: '1.0.0',
      mode: 'review',
      artifacts: {
        candidate: path.relative(root, candidateAbs),
        ...(referenceAbs ? { reference: path.relative(root, referenceAbs) } : {}),
        viewport
      },
      evaluator: { kind: 'model', name: 'vision-reviewer' },
      issues: [],
      summary: 'DRAFT — not yet reviewed; fill issues before running the gate.'
    }
    console.log(JSON.stringify(skeleton, null, 2))
    process.exit(0)
  }

  const reviewerName = args.reviewer || process.env.UI_DESIGN_WORKFLOW_REVIEWER
  if (!reviewerName) skip('no vision reviewer configured', 'Run with --template to draft a review yourself, or set UI_DESIGN_WORKFLOW_REVIEWER and provide reviewers/registry.json.')
  if (!existsSync(registryPath)) skip('reviewers/registry.json not found', 'Copy reviewers/registry.example.json to reviewers/registry.json and point a name at your own vision-capable reviewer command.')

  const entry = (JSON.parse(readFileSync(registryPath, 'utf8')).reviewers || {})[reviewerName]
  if (!entry || typeof entry.command !== 'string') { console.error(`Error: 未注册的 reviewer：${reviewerName}`); process.exit(2) }

  const result = spawnSync(entry.command, entry.args || [], {
    cwd: root,
    input: JSON.stringify(envelope(candidateAbs, referenceAbs, spec)),
    encoding: 'utf8',
    timeout: entry.timeoutMs || 120000,
    env: { ...process.env, ...(entry.env || {}) }
  })
  if (result.error) { console.error(`Error: 无法启动 reviewer 适配器：${result.error.message}`); process.exit(2) }
  if (result.status !== 0) { console.error(`Error: reviewer 适配器退出 ${result.status}：${(result.stderr || result.stdout || '').trim().slice(-600)}`); process.exit(2) }

  let review
  try { review = JSON.parse(result.stdout) } catch { console.error(`Error: reviewer 输出不是合法 JSON：${(result.stdout || '').trim().slice(-600)}`); process.exit(2) }
  try { validateReview(review) } catch (error) { console.error(`Error: reviewer 输出不是合法 review：${error.message}`); process.exit(2) }
  console.log(JSON.stringify(review, null, 2))
} catch (error) { console.error(`Error: ${error.message}`); process.exit(2) }
