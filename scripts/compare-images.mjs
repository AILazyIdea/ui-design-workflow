#!/usr/bin/env node
/** Optional PNG comparator. Writes a diff only inside the workspace artifacts directory. */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { artifactPath, resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

function parse(argv) {
  const args = { root: process.cwd(), threshold: 0.01 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--actual') args.actual = argv[++i]
    else if (argv[i] === '--reference') args.reference = argv[++i]
    else if (argv[i] === '--threshold') args.threshold = Number(argv[++i])
    else if (argv[i] === '--output-name') args.outputName = argv[++i]
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!args.actual || !args.reference) throw new Error('必须提供 --actual 和 --reference')
  if (!Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 1) throw new Error('--threshold 必须在 0 到 1 之间')
  return args
}
try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/compare-images.mjs --actual <工作区相对 PNG> --reference <工作区相对 PNG> [--threshold 0.01] [--root <目录>]'); process.exit(0) }
  let PNG; let pixelmatch
  try { ({ PNG } = await import('pngjs')); pixelmatch = (await import('pixelmatch')).default } catch { throw new Error('未安装可选视觉依赖。运行 npm install --include=optional。') }
  const root = resolveWorkspaceRoot(args.root)
  const actual = PNG.sync.read(readFileSync(resolveExistingInside(root, args.actual, 'actual PNG')))
  const reference = PNG.sync.read(readFileSync(resolveExistingInside(root, args.reference, 'reference PNG')))
  if (actual.width !== reference.width || actual.height !== reference.height) {
    console.log(JSON.stringify({ passed: false, reason: 'dimension-mismatch', actual: { width: actual.width, height: actual.height }, reference: { width: reference.width, height: reference.height } }))
    process.exit(1)
  }
  const diff = new PNG({ width: actual.width, height: actual.height })
  const diffPixels = pixelmatch(actual.data, reference.data, diff.data, actual.width, actual.height, { threshold: 0.1 })
  const diffRatio = diffPixels / (actual.width * actual.height); const output = artifactPath(root, args.outputName || 'visual-diff')
  writeFileSync(output, PNG.sync.write(diff))
  const passed = diffRatio <= args.threshold
  console.log(JSON.stringify({ passed, diffPixels, diffRatio, threshold: args.threshold, diff: path.relative(root, output) }))
  process.exit(passed ? 0 : 1)
} catch (error) { console.error(`Error: ${error.message}`); process.exit(/未安装可选视觉依赖/.test(error.message) ? 3 : 2) }
