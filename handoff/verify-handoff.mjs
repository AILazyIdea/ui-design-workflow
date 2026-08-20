#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const required = [
  'README-FIRST.md',
  'SKILL.md',
  'LICENSE',
  'scripts/validate.mjs',
  'scripts/tokens.mjs',
  'scripts/assemble-prompt.mjs',
  'scripts/render.mjs',
  'mcp/server.mjs',
  'schemas/spec.schema.json',
  'handoff/AI-EVALUATION-PROMPT.md',
  'handoff/DEEPSEEK-HARNESS-TRIAL.md',
  'handoff/evaluation.spec.json'
]
const missing = required.filter((entry) => !existsSync(path.join(root, entry)))
const major = Number(process.versions.node.split('.')[0])
const skill = readFileSync(path.join(root, 'SKILL.md'), 'utf8')
const result = {
  valid: missing.length === 0 && major >= 20 && /^name: ui-design-workflow$/m.test(skill),
  package: 'ui-design-workflow-ai-handoff',
  sourceVersion: '1.0.0',
  node: process.versions.node,
  nodeSupported: major >= 20,
  missing,
  skillNameMatches: /^name: ui-design-workflow$/m.test(skill)
}
console.log(JSON.stringify(result))
if (!result.valid) process.exitCode = 2
