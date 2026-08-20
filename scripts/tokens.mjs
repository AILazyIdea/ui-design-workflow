#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { safeFontStack, validateSpec } from './lib/schema.mjs'
import { resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

function parse(argv) {
  const args = { root: process.cwd(), target: 'all' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--spec') args.spec = argv[++i]
    else if (argv[i] === '--target') args.target = argv[++i]
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!['css', 'tailwind-v3', 'tailwind-v4', 'all'].includes(args.target)) throw new Error('--target 只支持 css、tailwind-v3、tailwind-v4、all')
  return args
}
function readSpec(args, root) {
  const source = args.spec ? readFileSync(resolveExistingInside(root, args.spec, '规格书'), 'utf8') : readFileSync(0, 'utf8')
  return validateSpec(JSON.parse(source), { requireDesignTokens: true })
}
function tokenName(name) { return String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() }
function css(tokens) {
  const lines = [':root {']
  if (tokens.background) lines.push(`  --ui-color-background: ${tokens.background.value};`)
  for (const color of tokens.colors || []) lines.push(`  --ui-color-${tokenName(color.name)}: ${color.hex};`)
  for (const font of tokens.typography?.fontFamilies || []) lines.push(`  --ui-font-${font.role}: ${safeFontStack(font)};`)
  for (const item of tokens.typography?.scale || []) {
    lines.push(`  --ui-text-${item.level}: ${item.size}px;`)
    lines.push(`  --ui-leading-${item.level}: ${item.lineHeight};`)
    lines.push(`  --ui-weight-${item.level}: ${item.weight};`)
    if (item.letterSpacing) lines.push(`  --ui-tracking-${item.level}: ${item.letterSpacing};`)
  }
  for (const value of tokens.spacing?.observedValues || []) lines.push(`  --ui-space-${value}: ${value}px;`)
  for (const value of tokens.radius?.values || []) lines.push(`  --ui-radius-${value}: ${value}px;`)
  for (const [name, size] of Object.entries(tokens.sizes || {})) lines.push(`  --ui-size-${name}: ${size}px;`)
  for (const item of tokens.shadows || []) lines.push(`  --ui-shadow-${item.name}: ${item.value};`)
  for (const item of tokens.borders || []) lines.push(`  --ui-border-${item.name}: ${item.value};`)
  lines.push('}')
  return lines.join('\n')
}
function tailwindV3(tokens) {
  const colors = Object.fromEntries((tokens.colors || []).map((item) => [tokenName(item.name), item.hex]))
  if (tokens.background) colors.background = tokens.background.value
  const fontFamily = Object.fromEntries((tokens.typography?.fontFamilies || []).map((item) => [item.role, [item.family, ...(item.fallback || [])]]))
  const fontSize = Object.fromEntries((tokens.typography?.scale || []).map((item) => [item.level, [`${item.size}px`, { lineHeight: String(item.lineHeight), fontWeight: String(item.weight), ...(item.letterSpacing ? { letterSpacing: item.letterSpacing } : {}) }]]))
  const spacing = Object.fromEntries((tokens.spacing?.observedValues || []).map((value) => [String(value), `${value}px`]))
  const borderRadius = Object.fromEntries((tokens.radius?.values || []).map((value) => [String(value), `${value}px`]))
  const boxShadow = Object.fromEntries((tokens.shadows || []).map((item) => [item.name, item.value]))
  return `module.exports = ${JSON.stringify({ theme: { extend: { colors, fontFamily, fontSize, spacing, borderRadius, boxShadow } } }, null, 2)}`
}
function tailwindV4(tokens) {
  const lines = ['@theme {']
  if (tokens.background) lines.push(`  --color-background: ${tokens.background.value};`)
  for (const color of tokens.colors || []) lines.push(`  --color-${tokenName(color.name)}: ${color.hex};`)
  for (const font of tokens.typography?.fontFamilies || []) lines.push(`  --font-${font.role}: ${safeFontStack(font)};`)
  for (const item of tokens.typography?.scale || []) lines.push(`  --text-${item.level}: ${item.size}px;`)
  for (const value of tokens.spacing?.observedValues || []) lines.push(`  --spacing-${value}: ${value}px;`)
  for (const value of tokens.radius?.values || []) lines.push(`  --radius-${value}: ${value}px;`)
  for (const item of tokens.shadows || []) lines.push(`  --shadow-${item.name}: ${item.value};`)
  lines.push('}')
  return lines.join('\n')
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/tokens.mjs [--spec <工作区相对路径>] [--target css|tailwind-v3|tailwind-v4|all] [--root <目录>]'); process.exit(0) }
  const spec = readSpec(args, resolveWorkspaceRoot(args.root)); const tokens = spec.designTokens
  const outputs = { css: css(tokens), 'tailwind-v3': tailwindV3(tokens), 'tailwind-v4': tailwindV4(tokens) }
  console.log(args.target === 'all' ? `/* CSS variables */\n${outputs.css}\n\n/* Tailwind v3 */\n${outputs['tailwind-v3']}\n\n/* Tailwind v4 */\n${outputs['tailwind-v4']}` : outputs[args.target])
} catch (error) { console.error(`Error: ${error.message}`); process.exit(2) }
