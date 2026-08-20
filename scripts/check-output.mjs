#!/usr/bin/env node
/**
 * Output-compliance checker. Zero dependency. Verifies that a rendered HTML
 * actually contains the spec's product content and design tokens, and reports
 * contrast hints for token colors against the background.
 *
 * Fail-closed: exit 0 = content compliant, 1 = missing content, 2 = invalid input.
 * Token coverage and contrast hints are reported as metrics, not pass/fail.
 */
import { readFileSync } from 'node:fs'
import { validateSpec } from './lib/schema.mjs'
import { resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

function parse(argv) {
  const args = { root: process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--spec') args.spec = argv[++i]
    else if (argv[i] === '--html') args.html = argv[++i]
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!args.spec || !args.html) throw new Error('必须提供 --spec 和 --html')
  return args
}

// Keep only letters/digits so inline tags, list markup and punctuation spacing
// do not cause false "missing" results.
function canonical(text) {
  return text.toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^\p{L}\p{N}]/gu, '')
}
function stringLeaves(value, out = []) {
  if (typeof value === 'string') { out.push(value); return out }
  if (Array.isArray(value)) { for (const v of value) stringLeaves(v, out); return out }
  if (value && typeof value === 'object') { for (const v of Object.values(value)) stringLeaves(v, out); return out }
  return out
}
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  if (h.length < 6) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/check-output.mjs --spec <工作区相对规格> --html <工作区相对 HTML> [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const spec = validateSpec(JSON.parse(readFileSync(resolveExistingInside(root, args.spec, '规格书'), 'utf8')))
  const html = readFileSync(resolveExistingInside(root, args.html, 'HTML 文件'), 'utf8')
  const canon = canonical(html)
  const lower = html.toLowerCase()

  const required = [
    ...stringLeaves(spec.content || {}),
    ...(typeof spec.layout?.primaryAction === 'string' ? [spec.layout.primaryAction] : [])
  ].filter((s) => typeof s === 'string' && s.trim() && canonical(s).length > 0)

  const missing = required.filter((s) => !canon.includes(canonical(s)))

  const tokens = []
  if (spec.designTokens?.background?.value) tokens.push({ name: 'background', value: spec.designTokens.background.value })
  for (const c of spec.designTokens?.colors || []) tokens.push({ name: c.name, value: c.hex })
  const tokenMissing = tokens.filter((t) => !lower.includes(t.value.toLowerCase())).map((t) => t.name)

  const contrastHints = []
  if (spec.designTokens?.background?.value && spec.designTokens.colors?.length) {
    const bg = hexToRgb(spec.designTokens.background.value)
    if (bg) {
      for (const c of spec.designTokens.colors) {
        const fg = hexToRgb(c.hex)
        if (!fg) continue
        const ratio = contrast(fg, bg)
        if (ratio < 4.5) contrastHints.push({ color: c.name, against: 'background', ratio: +ratio.toFixed(2), below: ratio < 3 ? 'AA-large(3:1)' : 'AA-normal(4.5:1)' })
      }
    }
  }

  const report = {
    schemaVersion: '1.0.0',
    check: 'output',
    passed: missing.length === 0,
    content: { requiredCount: required.length, missing, missingCount: missing.length },
    tokens: { total: tokens.length, found: tokens.length - tokenMissing.length, missing: tokenMissing },
    contrastHints,
    note: 'contrastHints 仅供参考（surface/装饰色低于阈值属正常），不参与判定；退出码只由 content.missing 决定。'
  }
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.passed ? 0 : 1)
} catch (error) { console.error(`Error: ${error.message}`); process.exit(2) }
