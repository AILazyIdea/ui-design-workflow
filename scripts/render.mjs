#!/usr/bin/env node
/** Core renderer: local workspace HTML → viewport PNG, with no npm dependency. */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { artifactPath, resolveExistingInside, resolveWorkspaceRoot } from './lib/workspace.mjs'

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
]
class EnvironmentError extends Error {}
function parse(argv) {
  const args = { root: process.cwd(), width: 1440, height: 900, dpr: 1, waitMs: 750 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i]
    else if (argv[i] === '--unsafe-url') args.unsafeUrl = argv[++i]
    else if (argv[i] === '--output-name') args.outputName = argv[++i]
    else if (argv[i] === '--width') args.width = Number(argv[++i])
    else if (argv[i] === '--height') args.height = Number(argv[++i])
    else if (argv[i] === '--dpr') args.dpr = Number(argv[++i])
    else if (argv[i] === '--wait-ms') args.waitMs = Number(argv[++i])
    else if (argv[i] === '--root') args.root = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`未知参数：${argv[i]}`)
  }
  if ((args.input ? 1 : 0) + (args.unsafeUrl ? 1 : 0) !== 1) throw new Error('必须且只能提供 --input 或 --unsafe-url')
  for (const [name, value, min, max, integer] of [['width', args.width, 320, 7680, true], ['height', args.height, 320, 16384, true], ['dpr', args.dpr, 1, 2, false], ['wait-ms', args.waitMs, 0, 10000, true]]) {
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`--${name} 必须介于 ${min} 和 ${max} 之间`)
  }
  return args
}
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return true
  const match = host.match(/^172\.(\d+)\./); return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31)
}
function target(args, root) {
  if (args.input) return pathToFileURL(resolveExistingInside(root, args.input, 'HTML 文件')).href
  if (process.env.UI_DESIGN_WORKFLOW_UNSAFE !== '1') throw new Error('远程 URL 已禁用。确有必要时设置 UI_DESIGN_WORKFLOW_UNSAFE=1，并承担目标页面访问风险。')
  const url = new URL(args.unsafeUrl)
  if (url.protocol !== 'https:' || isBlockedHost(url.hostname)) throw new Error('unsafe URL 只允许公开 HTTPS 地址，且不能是本地或私有网络地址')
  return url.href
}
function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  return CANDIDATES.find(existsSync) || null
}
async function capture(chrome, url, output, args) {
  const profile = mkdtempSync(path.join(tmpdir(), 'ui-design-workflow-chrome-'))
  let child
  // Remove any stale screenshot first so a pre-existing file cannot mask a failed launch.
  rmSync(output, { force: true })
  try {
    await new Promise((resolve, reject) => {
      let stderr = ''; let settled = false; let timeout; let poll; let screenshotReady = false; let timedOut = false
      const finish = (error) => {
        if (settled) return; settled = true
        if (timeout) clearTimeout(timeout)
        if (poll) clearInterval(poll)
        if (error) reject(error); else resolve()
      }
      child = spawn(chrome, [
        // Render only local workspace HTML (remote URLs stay disabled unless UI_DESIGN_WORKFLOW_UNSAFE=1).
        // Disable Chrome's own sandbox + crash reporter so headless rendering also works inside
        // sandboxed agent environments (DeepSeek Harness, CI, containers), where Chrome otherwise
        // fails with "Failed to initialize sandbox" / crashpad "Operation not permitted".
        '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-crash-reporter', '--disable-dev-shm-usage',
        '--disable-gpu', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none', '--force-prefers-reduced-motion=reduce', '--run-all-compositor-stages-before-draw',
        `--user-data-dir=${profile}`, `--window-size=${args.width},${args.height}`, `--force-device-scale-factor=${args.dpr}`,
        `--virtual-time-budget=${args.waitMs}`, `--screenshot=${output}`, url,
      ], { stdio: ['ignore', 'ignore', 'pipe'] })
      child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
      child.once('error', (error) => finish(new EnvironmentError(`Chrome 无法启动：${error.message}`)))
      child.once('close', (code) => {
        if (screenshotReady || (existsSync(output) && statSync(output).size > 0)) finish(timedOut ? new EnvironmentError(`Chrome 截图超时（45s）：${stderr.slice(-600)}`) : undefined)
        else finish(new EnvironmentError(`Chrome 截图失败（exit ${code}）：${stderr.slice(-600)}`))
      })
      poll = setInterval(() => {
        if (!screenshotReady && existsSync(output) && statSync(output).size > 0) {
          screenshotReady = true
          // Some Chrome builds keep background helpers alive after writing the PNG.
          // Ask the parent process to exit, then wait for its close event before cleanup.
          if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
        }
      }, 100)
      timeout = setTimeout(() => {
        timedOut = true
        if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
        setTimeout(() => finish(new EnvironmentError(`Chrome 截图超时（45s）：${stderr.slice(-600)}`)), 1000)
      }, 45000)
    })
  } finally {
    if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM')
    let lastError
    for (let attempt = 0; attempt < 10; attempt++) {
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 1, retryDelay: 50 }); lastError = null; break }
      catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 100)) }
    }
    if (lastError) throw lastError
  }
}

try {
  const args = parse(process.argv.slice(2))
  if (args.help) { console.log('用法: node scripts/render.mjs --input <工作区相对 HTML> [--output-name <名称>] [--width 1440 --height 900 --dpr 1 --wait-ms 750] [--root <目录>]'); process.exit(0) }
  const root = resolveWorkspaceRoot(args.root); const chrome = chromePath()
  if (!chrome) { console.error('Error: 找不到 Chrome。请设置 CHROME_PATH，或安装增强渲染依赖。'); process.exit(3) }
  const output = artifactPath(root, args.outputName || 'screenshot')
  await capture(chrome, target(args, root), output, args)
  console.log(JSON.stringify({ output: path.relative(root, output), renderer: 'chrome-cli', viewport: { width: args.width, height: args.height, dpr: args.dpr }, unsafeNetwork: Boolean(args.unsafeUrl) }))
} catch (error) { console.error(`Error: ${error.message}`); process.exit(error instanceof EnvironmentError ? 3 : 2) }
