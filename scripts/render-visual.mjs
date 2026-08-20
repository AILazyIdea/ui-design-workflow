#!/usr/bin/env node
/** Optional Playwright renderer for full-page, font-ready screenshots. */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { artifactPath, resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

class EnvironmentError extends Error {}

function parse(argv) {
  const args = { root: process.cwd(), width: 1440, height: 900, dpr: 1, waitMs: 300, fullPage: true }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i]
    else if (argv[i] === '--output-name') args.outputName = argv[++i]
    else if (argv[i] === '--width') args.width = Number(argv[++i])
    else if (argv[i] === '--height') args.height = Number(argv[++i])
    else if (argv[i] === '--dpr') args.dpr = Number(argv[++i])
    else if (argv[i] === '--wait-ms') args.waitMs = Number(argv[++i])
    else if (argv[i] === '--viewport-only') args.fullPage = false
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if (!args.input) throw new Error('必须提供 --input；增强渲染不接受网络 URL')
  for (const [name, value, min, max, integer] of [['width', args.width, 320, 7680, true], ['height', args.height, 320, 16384, true], ['dpr', args.dpr, 1, 2, false], ['wait-ms', args.waitMs, 0, 10000, true]]) if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`--${name} 不合法`)
  return args
}
try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/render-visual.mjs --input <工作区相对 HTML> [--viewport-only] [--root <目录>]'); process.exit(0) }
  let playwright
  try { playwright = await import('playwright') } catch { throw new Error('未安装可选视觉依赖。运行 npm install --include=optional，然后执行 npx playwright install chromium。') }
  const root = resolveWorkspaceRoot(args.root); const input = resolveExistingInside(root, args.input, 'HTML 文件')
  if (!existsSync(input)) throw new Error('HTML 文件不存在')
  const output = artifactPath(root, args.outputName || 'screenshot-visual')
  let browser
  try {
    // A normal local Chrome keeps the optional layer useful without another large browser download.
    browser = await playwright.chromium.launch({ headless: true, channel: 'chrome' })
  } catch (systemChromeError) {
    try { browser = await playwright.chromium.launch({ headless: true }) }
    catch (bundledBrowserError) {
      throw new EnvironmentError(`无法启动 Chrome 或 Playwright Chromium。运行 npx playwright install chromium。${bundledBrowserError.message}`)
    }
  }
  try {
    const context = await browser.newContext({ viewport: { width: args.width, height: args.height }, deviceScaleFactor: args.dpr, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(pathToFileURL(input).href, { waitUntil: 'networkidle', timeout: 30000 })
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready })
    if (args.waitMs) await page.waitForTimeout(args.waitMs)
    await page.screenshot({ path: output, fullPage: args.fullPage })
    await context.close()
  } finally { await browser.close() }
  console.log(JSON.stringify({ output: path.relative(root, output), renderer: 'playwright', fullPage: args.fullPage, viewport: { width: args.width, height: args.height, dpr: args.dpr } }))
} catch (error) { console.error(`Error: ${error.message}`); process.exit(error instanceof EnvironmentError || /未安装可选视觉依赖/.test(error.message) ? 3 : 2) }
