#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { validateReview, validateSpec } from './lib/schema.mjs'
import { resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

function parse(argv) {
  const args = { root: process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--type') args.type = argv[++i]
    else if (argv[i] === '--file') args.file = argv[++i]
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  return args
}
try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/validate.mjs --type spec|review --file <工作区相对路径> [--root <目录>]'); process.exit(0) }
  if (!['spec', 'review'].includes(args.type) || !args.file) throw new Error('必须提供 --type 和 --file')
  const root = resolveWorkspaceRoot(args.root)
  const input = JSON.parse(readFileSync(resolveExistingInside(root, args.file, 'JSON 文件'), 'utf8'))
  if (args.type === 'spec') validateSpec(input); else validateReview(input)
  console.log(JSON.stringify({ valid: true, type: args.type, schemaVersion: '1.0.0' }))
} catch (error) { console.error(`Error: ${error.message}`); process.exit(2) }
