#!/usr/bin/env node
/**
 * Deterministic geometry checker. Zero dependency. Verifies that an HTML file's
 * DECLARED geometry conforms to the spec's token scale and is internally uniform
 * — exactly the things a screenshot-only vision reviewer can only estimate with
 * ±2-6px error and therefore keeps mis-flagging. Complements (never replaces)
 * the vision review and check-output.mjs.
 *
 * Fail-closed checks (exit 1):
 *   1. radius-conformance   — every non-pill `border-radius` is in spec radius.values
 *   2. spacing-conformance  — every gap/padding/margin magnitude is on the spacing scale
 *   3. control-uniformity   — all button heights equal; all control heights equal;
 *                             button height == control height
 * Reported, not failing: hardcoded literal geometry (not var()-backed), negative margins.
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

const PILL = new Set(['999px', '9999px'])

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, '') }
function extractStyles(html) {
  const out = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let m
  while ((m = re.exec(html))) out.push(m[1])
  return out.join('\n')
}
function parseRules(css) {
  const rules = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(css))) rules.push({ selector: m[1].trim(), body: m[2] })
  return rules
}
function parseDecls(body) {
  const decls = []
  for (const part of body.split(';')) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    decls.push({ prop: part.slice(0, idx).trim().toLowerCase(), value: part.slice(idx + 1).trim() })
  }
  return decls.filter((d) => d.prop)
}
function collectVars(rules) {
  const vars = new Map()
  for (const rule of rules) {
    if (!/:root/.test(rule.selector)) continue
    for (const d of parseDecls(rule.body)) {
      if (/^--[a-zA-Z0-9-]+$/.test(d.prop)) vars.set(d.prop, d.value)
    }
  }
  return vars
}
function resolveVar(value, vars, depth = 0) {
  if (depth > 4) return value
  return value.replace(/var\((--[a-zA-Z0-9-]+)(?:\s*,[^)]*)?\)/g, (_, name) => {
    const v = vars.get(name)
    return v == null ? `var(${name})` : resolveVar(v, vars, depth + 1)
  })
}
function pxNumbers(value) {
  const out = []
  const re = /-?\d+(?:\.\d+)?px/g
  let m
  while ((m = re.exec(value))) out.push(Number.parseFloat(m[0]))
  return out
}
function targets(selector, kind) {
  const s = selector.toLowerCase()
  if (kind === 'button') return /button|btn/.test(s)
  if (kind === 'control') return /input|control|field/.test(s)
  return false
}
function addUnique(list, v) { if (!list.includes(v)) list.push(v) }

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/check-geometry.mjs --spec <工作区相对规格> --html <工作区相对 HTML> [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const spec = validateSpec(JSON.parse(readFileSync(resolveExistingInside(root, args.spec, '规格书'), 'utf8')), { requireDesignTokens: true })
  const html = readFileSync(resolveExistingInside(root, args.html, 'HTML 文件'), 'utf8')

  const radiusSet = new Set((spec.designTokens?.radius?.values || []).map(String))
  const spacingSet = new Set((spec.designTokens?.spacing?.observedValues || []).map(String))
  const spacingUnit = spec.designTokens?.spacing?.unit || 4
  const spacingScale = spacingSet.size > 0 ? (v) => spacingSet.has(String(v)) : (v) => v % spacingUnit === 0

  const rules = parseRules(stripComments(extractStyles(html)))
  const vars = collectVars(rules)

  const violations = []
  const notes = []
  const metrics = { radiusValues: [], spacingValues: [], buttonHeights: [], controlHeights: [], hardcoded: [] }
  const buttonHeights = new Set()
  const controlHeights = new Set()

  for (const rule of rules) {
    if (/:root/.test(rule.selector)) continue
    const isButton = targets(rule.selector, 'button')
    const isControl = targets(rule.selector, 'control')
    for (const d of parseDecls(rule.body)) {
      const resolved = resolveVar(d.value, vars)
      const prop = d.prop

      if (prop === 'border-radius') {
        const pxs = pxNumbers(resolved)
        if (/%/.test(resolved)) addUnique(metrics.radiusValues, 'pill(%)')
        for (const px of pxs) {
          const v = `${px}px`
          addUnique(metrics.radiusValues, v)
          if (px === 0 || PILL.has(v)) continue
          if (radiusSet.size > 0 && !radiusSet.has(String(px))) violations.push({ id: 'radius-off-scale', selector: rule.selector, value: v, expected: `radius ∈ [${[...radiusSet].join(',')}]` })
        }
      } else if (prop === 'gap' || prop.startsWith('padding') || prop.startsWith('margin')) {
        for (const px of pxNumbers(resolved)) {
          const mag = Math.abs(px)
          addUnique(metrics.spacingValues, `${px}px`)
          if (mag === 0) continue
          if (!spacingScale(mag)) violations.push({ id: 'spacing-off-scale', selector: rule.selector, prop, value: `${px}px`, expected: `spacing ∈ [${[...spacingSet].join(',')}]（unit ${spacingUnit}）` })
          if (px < 0) notes.push(`负外边距：${rule.selector} ${prop}: ${px}px`)
        }
      } else if (prop === 'height') {
        const h = pxNumbers(resolved)
        if (h.length === 1) {
          const v = `${h[0]}px`
          if (isButton) buttonHeights.add(v)
          if (isControl) controlHeights.add(v)
          if (!/var\(/.test(d.value)) addUnique(metrics.hardcoded, `${rule.selector} { ${prop}: ${v} }`)
        }
      }
    }
  }

  const buttons = [...buttonHeights].sort()
  const controls = [...controlHeights].sort()
  if (buttons.length > 1) violations.push({ id: 'button-heights-not-uniform', values: buttons, expected: '所有按钮高度一致' })
  if (controls.length > 1) violations.push({ id: 'control-heights-not-uniform', values: controls, expected: '所有输入/控件高度一致' })
  if (buttons.length === 1 && controls.length === 1 && buttons[0] !== controls[0]) violations.push({ id: 'button-input-height-mismatch', button: buttons[0], control: controls[0], expected: '按钮与输入框等高' })
  const sizesSet = new Set(Object.values(spec.designTokens?.sizes || {}).map(String))
  if (sizesSet.size > 0) {
    for (const v of new Set([...buttons, ...controls])) {
      const n = v.replace(/px$/, '')
      if (!sizesSet.has(n)) violations.push({ id: 'height-off-scale', value: v, expected: `height ∈ sizes [${[...sizesSet].join(',')}]` })
    }
  }
  metrics.buttonHeights = buttons
  metrics.controlHeights = controls
  metrics.radiusValues.sort()
  metrics.spacingValues.sort()

  const passed = violations.length === 0
  console.log(JSON.stringify({
    schemaVersion: '1.0.0',
    check: 'geometry',
    passed,
    violations,
    metrics,
    notes,
    summary: passed ? '几何一致且符合令牌刻度。' : `${violations.length} 条几何违例。`
  }, null, 2))
  process.exit(passed ? 0 : 1)
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(2)
}
