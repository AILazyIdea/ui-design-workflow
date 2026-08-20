#!/usr/bin/env node
/**
 * Deterministic accessibility checker. Zero runtime dependency; Chrome only for
 * the contrast pass (degrades gracefully without it). A focused, CI-gateable
 * subset of the WCAG checks that are machine-checkable (the same family as
 * axe-core / pa11y, not a full clone):
 *
 *   html-lang, img-alt, button-name, duplicate-id, heading-order, input-label
 *   (static, from source) + contrast (runtime, real fg/bg pairs).
 *
 * Exit 0 = no violations; 1 = violations; 2 = invalid input; 3 = no Chrome
 * (only when contrast was requested and Chrome is missing).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromePath, dumpDom, rmrfRetry } from './lib/chrome.mjs'
import { resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

function parse(argv) {
  const args = { root: process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--html') args.html = argv[++i]
    else if (argv[i] === '--no-contrast') args.noContrast = true
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!args.html) throw new Error('必须提供 --html')
  return args
}

const strip = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

function structural(html) {
  const violations = []
  const notes = []

  // html lang
  const htmlTag = /<html\b[^>]*>/i.exec(html)
  if (!htmlTag || !/\slang\s*=\s*["'][^"']+["']/i.test(htmlTag[0])) violations.push({ id: 'html-lang', detail: '<html> 缺少 lang 属性' })

  // img alt
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt\s*=/i.test(m[0])) violations.push({ id: 'img-alt', detail: `<img> 缺少 alt：${m[0].slice(0, 80)}` })
  }

  // button accessible name
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = m[1]
    const body = strip(m[2])
    if (!/\s(?:aria-label|title|aria-labelledby)\s*=/i.test(` ${attrs}`) && body.length === 0) violations.push({ id: 'button-name', detail: `<button> 无可访问名称：${attrs.slice(0, 80)}` })
  }

  // duplicate ids
  const ids = [...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
  const seen = new Set()
  const dupes = new Set()
  for (const id of ids) { if (seen.has(id)) dupes.add(id); seen.add(id) }
  for (const d of dupes) violations.push({ id: 'duplicate-id', detail: `重复 id：${d}` })

  // heading order (no jumps > 1)
  const levels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((m) => Number(m[1]))
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) violations.push({ id: 'heading-order', detail: `标题从 h${levels[i - 1]} 跳到 h${levels[i]}（跳级）` })
  }
  if (levels.length > 0 && levels[0] > 1) notes.push(`首个标题是 h${levels[0]}（建议从 h1 开始）`)

  // inputs implicitly labeled by a wrapping <label> (no `for`)
  const implicit = new Set()
  for (const lm of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    if (!/\bfor\s*=/.test(` ${lm[1]}`)) for (const im of lm[2].matchAll(/<input\b[^>]*>/gi)) implicit.add(im[0])
  }

  // input label association
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const attrs = m[1]
    if (implicit.has(m[0])) continue
    const type = /\stype\s*=\s*["']?([\w-]+)/i.exec(attrs)?.[1]?.toLowerCase()
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue
    if (/\s(?:aria-label|aria-labelledby)\s*=/i.test(` ${attrs}`)) continue
    const idm = /\sid\s*=\s*["']([^"']+)["']/i.exec(attrs)
    const hasLabelFor = idm && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${idm[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html)
    if (!hasLabelFor) violations.push({ id: 'input-label', detail: `<input> 缺少标签关联：${attrs.slice(0, 80)}` })
  }

  return { violations, notes }
}

function contrastScript() {
  return `
;(function () {
  function parseColor(s) {
    var m = /rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)/.exec(s);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  }
  function composite(src, dst) {
    var a = src.a + dst.a * (1 - src.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: (src.r * src.a + dst.r * dst.a * (1 - src.a)) / a, g: (src.g * src.a + dst.g * dst.a * (1 - src.a)) / a, b: (src.b * src.a + dst.b * dst.a * (1 - src.a)) / a, a: a };
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function effectiveBg(el) {
    var chain = [], node = el;
    while (node) { var c = parseColor(getComputedStyle(node).backgroundColor); if (c && c.a > 0) chain.push(c); node = node.parentElement; }
    var bg = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = chain.length - 1; i >= 0; i--) bg = composite(chain[i], bg);
    return bg;
  }
  function hasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i++) { var n = el.childNodes[i]; if (n.nodeType === 3 && n.textContent.trim()) return true; }
    return false;
  }
  function collect() {
    var results = [];
    var sel = 'h1,h2,h3,h4,h5,h6,p,span,a,button,label,li';
    document.querySelectorAll(sel).forEach(function (el) {
      if (!hasDirectText(el)) return;
      if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') return; // WCAG 1.4.3 豁免禁用态
      var cs = getComputedStyle(el);
      var color = parseColor(cs.color); if (!color) return;
      var bg = effectiveBg(el);
      var L1 = lum(color), L2 = lum(bg);
      var ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      var fs = parseFloat(cs.fontSize); var bold = parseInt(cs.fontWeight, 10) >= 600;
      var large = fs >= 24 || (fs >= 18.66 && bold); var min = large ? 3 : 4.5;
      if (ratio < min) results.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100, min: min, fontSize: fs });
    });
    var pre = document.createElement('pre'); pre.id = '__udw_a11y__';
    pre.textContent = JSON.stringify(results);
    document.body.appendChild(pre);
    var done = document.createElement('pre'); done.id = '__udw_done__'; done.textContent = '1'; document.body.appendChild(done);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', collect); else collect();
})();`
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/check-a11y.mjs --html <HTML> [--no-contrast] [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root)
  const html = readFileSync(resolveExistingInside(root, args.html, 'HTML 文件'), 'utf8')

  const { violations, notes } = structural(html)

  let contrast = { checked: 0, failed: 0, skipped: false, items: [] }
  if (!args.noContrast) {
    const chrome = chromePath()
    if (!chrome) {
      contrast.skipped = true
      notes.push('未找到 Chrome，跳过对比度检查（用 --no-contrast 可静默）')
    } else {
      const script = contrastScript()
      const augmented = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `<script>${script}<\/script></body>`) : `${html}<script>${script}<\/script>`
      const dir = mkdtempSync(path.join(tmpdir(), 'ui-design-workflow-a11y-'))
      const tmpFile = path.join(dir, 'page.html')
      writeFileSync(tmpFile, augmented)
      try {
        const { stdout } = await dumpDom(chrome, [
          '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-crash-reporter', '--disable-dev-shm-usage',
          '--disable-gpu', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--force-prefers-reduced-motion=reduce', '--run-all-compositor-stages-before-draw',
          `--user-data-dir=${path.join(dir, 'profile')}`, '--virtual-time-budget=750', '--dump-dom', pathToFileURL(tmpFile).href,
        ], '__udw_done__')
        const m = /<pre id="__udw_a11y__"[^>]*>([\s\S]*?)<\/pre>/.exec(stdout)
        if (m) {
          const items = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
          contrast.items = items
          contrast.failed = items.length
          for (const it of items) violations.push({ id: 'contrast', detail: `<${it.tag}>「${it.text}」对比度 ${it.ratio}:1 < ${it.min}:1（字号 ${it.fontSize}px）` })
        } else contrast.skipped = true
      } finally {
        await rmrfRetry(dir)
      }
    }
  }

  const passed = violations.length === 0
  console.log(JSON.stringify({
    schemaVersion: '1.0.0', check: 'a11y', passed, violations, notes,
    metrics: { structural: violations.filter((v) => v.id !== 'contrast').length, contrast: { failed: contrast.failed, skipped: contrast.skipped } },
    summary: passed ? '未发现可机器判定的可访问性问题。' : `${violations.length} 条可访问性违例。`
  }, null, 2))
  process.exit(passed ? 0 : 1)
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(/Chrome/.test(error.message) ? 3 : 2)
}
