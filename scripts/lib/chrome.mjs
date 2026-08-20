/** Shared local-Chrome helpers for runtime checks (zero npm dependency). */
import { existsSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'

export const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
]

export function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  return CHROME_CANDIDATES.find(existsSync) || null
}

/**
 * Run `chrome --headless --dump-dom` over a file URL and return the serialized
 * DOM. Chrome (headless=new) may keep background helpers alive after printing,
 * so we resolve as soon as the marker string appears in stdout (or on close /
 * a 6s safety timeout) and then SIGTERM the process.
 */
export function dumpDom(chrome, args, marker) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
      resolve({ stdout, stderr })
    }
    child.stdout.on('data', (c) => { stdout += c.toString(); if (marker && stdout.includes(marker)) finish() })
    child.stderr.on('data', (c) => { stderr += c.toString() })
    child.once('error', (e) => { settled = true; clearTimeout(timer); reject(e) })
    child.once('close', finish)
    timer = setTimeout(finish, 6000)
  })
}

/** Remove a temp profile dir, retrying while Chrome background helpers release it. */
export async function rmrfRetry(dir) {
  let last
  for (let i = 0; i < 10; i++) {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 1, retryDelay: 50 }); last = null; break }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 100)) }
  }
  if (last) throw last
}
