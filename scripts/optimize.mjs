#!/usr/bin/env node
/**
 * Optimize-loop driver — deterministic glue between "seeing" and "rebuilding".
 *
 * Consumes one "optimize plan" (a vision model's one-shot output that bundles a
 * review of the current UI + a redesign spec fixing it), validates it, then
 * materializes the next loop round:
 *   1. writes spec.json + review.json into a workspace-relative output dir
 *   2. runs the gate over the review (fail-closed; blocking issues mean "keep going")
 *   3. emits the design tokens (css) and the constrained redesign prompt
 *   4. prints the next loop steps
 *
 * It never reads images and never calls a model: the Agent does the seeing
 * (vision MCP) and the generation (generation model). Zero runtime deps.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateOptimizePlan } from './lib/schema.mjs'
import { resolveWorkspaceRoot, assertRelativePath, resolveExistingInside } from './lib/workspace.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = (name) => path.join(here, name)

function parse(argv) {
  const args = { root: process.cwd(), out: '.ui-design-workflow/optimize', block: 'P1' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plan') args.plan = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
    else if (argv[i] === '--html') args.html = argv[++i]
    else if (argv[i] === '--block') args.block = argv[++i]
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!args.plan) throw new Error('必须提供 --plan <优化方案 JSON 工作区相对路径>')
  if (!['P0', 'P1', 'P2'].includes(args.block)) throw new Error('--block 只支持 P0、P1、P2')
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

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/optimize.mjs --plan <优化方案 JSON> [--out <输出目录>] [--block P0|P1|P2] [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const outDir = path.join(root, assertRelativePath(args.out, '输出目录'))
  mkdirSync(outDir, { recursive: true })

  // 1. read + validate the combined plan (fail-closed)
  const plan = validateOptimizePlan(JSON.parse(readFileSync(resolveExistingInside(root, args.plan, '优化方案'), 'utf8')))

  const specPath = path.join(outDir, 'spec.json')
  const reviewPath = path.join(outDir, 'review.json')
  writeFileSync(specPath, JSON.stringify(plan.spec, null, 2))
  writeFileSync(reviewPath, JSON.stringify(plan.review, null, 2))

  // 2. gate over the review (blocking issues => keep iterating)
  const gateRes = runNode(script('gate.mjs'), ['--review', rel(root, reviewPath), '--block-at-or-above', args.block], root, { allowFail: true })
  let gate
  try { gate = JSON.parse(gateRes.stdout) } catch { gate = { parseError: true, stdout: gateRes.stdout, stderr: gateRes.stderr } }

  // 3. tokens (css) + constrained redesign prompt
  const tokensRes = runNode(script('tokens.mjs'), ['--spec', rel(root, specPath), '--target', 'css'], root)
  const tokensPath = path.join(outDir, 'spec.tokens.css')
  writeFileSync(tokensPath, tokensRes.stdout)

  const promptRes = runNode(script('assemble-prompt.mjs'), ['--mode', 'redesign', '--style', 'professional', '--spec', rel(root, specPath)], root)
  const promptPath = path.join(outDir, 'spec.prompt.txt')
  writeFileSync(promptPath, promptRes.stdout)

  // 4. deterministic checks (only when an HTML candidate is provided)
  let checks = null
  if (args.html) {
    const htmlRel = path.relative(root, resolveExistingInside(root, args.html, 'HTML 文件'))
    const checkRes = runNode(script('check-output.mjs'), ['--spec', rel(root, specPath), '--html', htmlRel], root, { allowFail: true })
    const geoRes = runNode(script('check-geometry.mjs'), ['--spec', rel(root, specPath), '--html', htmlRel], root, { allowFail: true })
    let checkOut = {}; try { checkOut = JSON.parse(checkRes.stdout) } catch { checkOut = { passed: false, parseError: true } }
    let geo = {}; try { geo = JSON.parse(geoRes.stdout) } catch { geo = { passed: false, parseError: true } }
    checks = {
      html: htmlRel,
      output: { passed: checkOut.passed, contentMissing: checkOut.content?.missingCount ?? null, tokenMissing: checkOut.tokens?.missing ?? null },
      geometry: { passed: geo.passed, violations: geo.violations ?? null }
    }
  }

  const report = {
    schemaVersion: '1.0.0',
    check: 'optimize',
    plan: { valid: true, input: plan.input, issues: plan.review.issues.length },
    gate,
    files: {
      spec: rel(root, specPath),
      review: rel(root, reviewPath),
      tokensCss: rel(root, tokensPath),
      prompt: rel(root, promptPath)
    },
    ...(checks ? { checks } : {}),
    nextSteps: gate.passed
      ? ['评审已达标（无阻塞问题）。可结束；如需更严，用 --block P2 再跑一轮。']
      : [
          `仍有 ${gate.blockingIssues.length} 条阻塞问题（>=${args.block}）。`,
          '1. 阅读 spec.prompt.txt，据此生成/改写优化后的 HTML（遵守 spec 的令牌与布局事实，不编造产品事实）。',
          '2. node scripts/render.mjs --input <html> --output-name candidate 截图。',
          '3. 用识图工具读新图，产出新的优化方案（review + redesign spec），再跑本命令，循环直到门禁通过。'
        ]
  }
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(2)
}
