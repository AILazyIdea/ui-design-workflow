#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { validateReview } from './lib/schema.mjs'
import { resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

const ORDER = { P0: 0, P1: 1, P2: 2 }
function parse(argv) {
  const args = { root: process.cwd(), blockAtOrAbove: 'P1' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--review') args.review = argv[++i]
    else if (argv[i] === '--block-at-or-above') args.blockAtOrAbove = argv[++i]
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!(args.blockAtOrAbove in ORDER)) throw new Error('--block-at-or-above 只支持 P0、P1、P2')
  return args
}
try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/gate.mjs [--review <工作区相对路径>] [--block-at-or-above P0|P1|P2] [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const raw = args.review ? readFileSync(resolveExistingInside(root, args.review, '评审文件'), 'utf8') : readFileSync(0, 'utf8')
  const review = validateReview(JSON.parse(raw)); const counts = { P0: 0, P1: 0, P2: 0 }
  for (const issue of review.issues) counts[issue.severity] += 1
  const blockingIssues = review.issues.filter((issue) => ORDER[issue.severity] <= ORDER[args.blockAtOrAbove])
  const passed = blockingIssues.length === 0
  console.log(JSON.stringify({ schemaVersion: '1.0.0', passed, blockAtOrAbove: args.blockAtOrAbove, counts, blockingIssues, totalIssues: review.issues.length, summary: passed ? `达标：没有 ${args.blockAtOrAbove} 或更高等级的问题。` : `未达标：${blockingIssues.length} 条问题达到阻塞等级。` }, null, 2))
  process.exit(passed ? 0 : 1)
} catch (error) { console.error(`Error: ${error.message}`); process.exit(2) }
