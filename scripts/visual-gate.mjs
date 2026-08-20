#!/usr/bin/env node
/**
 * Visual-regression baseline gate. Zero dependency (uses lib/png-diff.mjs).
 * Compares a rendered candidate against a baseline PNG and blocks when the
 * pixel-difference ratio exceeds --threshold. The baseline is a file in the
 * workspace; the first run (or --accept) establishes/updates it deliberately —
 * never silently.
 *
 * Exit 0 = pass (or baseline created/accepted); 1 = diff above threshold;
 * 2 = invalid input.
 */
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { decodePng, diffPixels } from './lib/png-diff.mjs'
import { assertRelativePath, resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

function parse(argv) {
  const args = { root: process.cwd(), threshold: 0.01 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--candidate') args.candidate = argv[++i]
    else if (argv[i] === '--baseline') args.baseline = argv[++i]
    else if (argv[i] === '--threshold') args.threshold = Number(argv[++i])
    else if (argv[i] === '--accept') args.accept = true
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!args.candidate || !args.baseline) throw new Error('必须提供 --candidate 和 --baseline')
  if (!Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 1) throw new Error('--threshold 必须在 0 到 1 之间')
  return args
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/visual-gate.mjs --candidate <PNG> --baseline <PNG> [--threshold 0.01] [--accept] [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const candidatePath = resolveExistingInside(root, args.candidate, 'candidate PNG')
  const baselineRel = assertRelativePath(args.baseline, 'baseline PNG')
  const baselinePath = path.join(root, baselineRel)

  if (args.accept || !existsSync(baselinePath)) {
    mkdirSync(path.dirname(baselinePath), { recursive: true })
    copyFileSync(candidatePath, baselinePath)
    console.log(JSON.stringify({ schemaVersion: '1.0.0', check: 'visual-gate', passed: true, baseline: baselineRel, action: args.accept ? 'accepted' : 'baseline-created' }))
    process.exit(0)
  }

  const candidate = decodePng(readFileSync(candidatePath))
  const baseline = decodePng(readFileSync(baselinePath))
  const result = diffPixels(candidate, baseline)
  const passed = !result.dimensionMismatch && result.ratio <= args.threshold
  console.log(JSON.stringify({
    schemaVersion: '1.0.0', check: 'visual-gate', passed, baseline: baselineRel,
    diffRatio: +result.ratio.toFixed(4), diffPixels: result.diffPixels, total: result.total, threshold: args.threshold,
    ...(result.dimensionMismatch ? { reason: 'dimension-mismatch' } : {})
  }))
  process.exit(passed ? 0 : 1)
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(2)
}
