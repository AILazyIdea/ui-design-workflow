#!/usr/bin/env node
/**
 * Deterministic "computed style == token" verifier. Requires local Chrome
 * (same as render.mjs). Unlike check-geometry.mjs (which reads DECLARED CSS),
 * this loads the HTML in a real browser and reads the RESOLVED custom
 * properties and element computed styles. It proves the tokens are actually
 * defined, resolve, and reach the rendered controls — catching specificity
 * overrides, typo'd var() names, missing :root definitions, and inline-style
 * drift that static analysis cannot see.
 *
 * Checks (fail-closed):
 *   1. token-fidelity  — every expected `--ui-*` custom property is present
 *                        and its resolved value equals the spec token.
 *   2. control-uniform — rendered button/input heights are equal and on the
 *                        sizes scale; rendered button radii are on the radius scale.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromePath, dumpDom, rmrfRetry } from './lib/chrome.mjs'
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

function tokenName(name) { return String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() }

function expectedProps(spec) {
  const t = spec.designTokens || {}
  const props = {}
  if (t.background?.value) props['--ui-color-background'] = t.background.value
  for (const c of t.colors || []) props[`--ui-color-${tokenName(c.name)}`] = c.hex
  for (const [n, s] of Object.entries(t.sizes || {})) props[`--ui-size-${n}`] = `${s}px`
  for (const v of t.radius?.values || []) props[`--ui-radius-${v}`] = `${v}px`
  for (const v of t.spacing?.observedValues || []) props[`--ui-space-${v}`] = `${v}px`
  return props
}

function measureScript(wanted) {
  return `
;(function () {
  function px(v) { var m = /^([\\d.]+)px$/.exec(v); return m ? Math.round(parseFloat(m[1]) * 100) / 100 : v; }
  function collect() {
    var root = getComputedStyle(document.documentElement);
    var props = {};
    var wanted = ${JSON.stringify(wanted)};
    wanted.forEach(function (n) { var v = root.getPropertyValue(n).trim(); if (v) props[n] = v; });
    var buttons = [], inputs = [];
    document.querySelectorAll('button').forEach(function (el) { var cs = getComputedStyle(el); buttons.push({ h: px(cs.height), r: px(cs.borderTopLeftRadius) }); });
    document.querySelectorAll('input').forEach(function (el) { var cs = getComputedStyle(el); inputs.push({ h: px(cs.height), r: px(cs.borderTopLeftRadius) }); });
    var pre = document.createElement('pre'); pre.id = '__udw_computed__';
    pre.textContent = JSON.stringify({ props: props, buttons: buttons, inputs: inputs });
    document.body.appendChild(pre);
    var done = document.createElement('pre'); done.id = '__udw_done__'; done.textContent = '1'; document.body.appendChild(done);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', collect); else collect();
})();`
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/check-computed.mjs --spec <规格> --html <HTML> [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const spec = validateSpec(JSON.parse(readFileSync(resolveExistingInside(root, args.spec, '规格书'), 'utf8')), { requireDesignTokens: true })
  const html = readFileSync(resolveExistingInside(root, args.html, 'HTML 文件'), 'utf8')

  const chrome = chromePath()
  if (!chrome) { console.error('Error: 找不到 Chrome。请设置 CHROME_PATH。'); process.exit(3) }

  const expect = expectedProps(spec)
  const sizes = new Set(Object.values(spec.designTokens?.sizes || {}).map(Number))
  const radius = new Set(spec.designTokens?.radius?.values || [])

  const script = measureScript(Object.keys(expect))
  const augmented = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `<script>${script}<\/script></body>`)
    : `${html}<script>${script}<\/script>`
  const dir = mkdtempSync(path.join(tmpdir(), 'ui-design-workflow-computed-'))
  const tmpFile = path.join(dir, 'page.html')
  writeFileSync(tmpFile, augmented)
  try {
    const { stdout } = await dumpDom(chrome, [
      '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-crash-reporter', '--disable-dev-shm-usage',
      '--disable-gpu', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--force-prefers-reduced-motion=reduce', '--run-all-compositor-stages-before-draw',
      `--user-data-dir=${path.join(dir, 'profile')}`, '--virtual-time-budget=750', '--dump-dom', pathToFileURL(tmpFile).href,
    ], '__udw_done__')
    const m = /<pre id="__udw_computed__"[^>]*>([\s\S]*?)<\/pre>/.exec(stdout)
    if (!m) throw new Error('Chrome 输出里没有 __udw_computed__ 节点')
    const data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))

    const violations = []
    const missing = []
    const mismatched = []
    for (const [name, expected] of Object.entries(expect)) {
      const actual = data.props[name]
      if (actual == null) { missing.push(name); violations.push({ id: 'token-var-missing', name, expected }) }
      else if (String(actual).trim().toLowerCase() !== String(expected).trim().toLowerCase()) { mismatched.push({ name, expected, actual }); violations.push({ id: 'token-var-mismatch', name, expected, actual }) }
    }

    const btnH = [...new Set(data.buttons.map((b) => b.h))]
    const inH = [...new Set(data.inputs.map((i) => i.h))]
    if (btnH.length > 1) violations.push({ id: 'button-heights-not-uniform', values: btnH })
    if (inH.length > 1) violations.push({ id: 'control-heights-not-uniform', values: inH })
    if (btnH.length === 1 && inH.length === 1 && btnH[0] !== inH[0]) violations.push({ id: 'button-input-height-mismatch', button: btnH[0], control: inH[0] })
    if (sizes.size > 0) {
      for (const h of [...btnH, ...inH]) if (!sizes.has(Number(h))) violations.push({ id: 'height-off-scale', value: `${h}px`, expected: `sizes [${[...sizes].join(',')}]` })
    }
    if (radius.size > 0) {
      for (const r of [...new Set([...data.buttons.map((b) => b.r), ...data.inputs.map((i) => i.r)])]) {
        if (r === 0 || r >= 999) continue
        if (!radius.has(Number(r))) violations.push({ id: 'radius-off-scale', value: `${r}px`, expected: `radius [${[...radius].join(',')}]` })
      }
    }

    const passed = violations.length === 0
    console.log(JSON.stringify({
      schemaVersion: '1.0.0', check: 'computed', passed, violations,
      metrics: { props: { found: Object.keys(data.props).length, missing, mismatched }, buttonHeights: btnH, inputHeights: inH },
      summary: passed ? '计算样式与令牌一致。' : `${violations.length} 条计算样式违例。`
    }, null, 2))
    process.exit(passed ? 0 : 1)
  } finally {
    await rmrfRetry(dir)
  }
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(/Chrome/.test(error.message) ? 3 : 2)
}
