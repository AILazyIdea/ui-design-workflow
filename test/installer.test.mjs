import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bashInstaller = path.join(root, 'install.sh')
const powershellInstaller = path.join(root, 'install.ps1')

test('install scripts require explicit non-interactive authorization and document the default refusal', () => {
  const bash = readFileSync(bashInstaller, 'utf8')
  const powershell = readFileSync(powershellInstaller, 'utf8')
  assert.match(bash, /--install-node --yes/)
  assert.match(bash, /是否继续自动安装？\[y\/N\]/)
  assert.match(bash, /当前不是交互式终端，已拒绝自动安装/)
  assert.doesNotMatch(bash, /nvm alias default/)
  assert.match(powershell, /\[switch\]\$InstallNode/)
  assert.match(powershell, /\[switch\]\$Yes/)
  assert.match(powershell, /Read-Host '是否继续自动安装？\[y\/N\]'/)
  assert.match(powershell, /当前不是交互式终端，已拒绝自动安装/)
})

test('bash installer refuses a missing Node in a non-interactive process before any download', { skip: process.platform === 'win32' }, () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'ui-design-workflow-installer-'))
  try {
    const bin = path.join(workspace, 'bin')
    const marker = path.join(workspace, 'curl-called')
    const fakeNode = path.join(bin, 'node')
    const fakeCurl = path.join(bin, 'curl')
    mkdirSync(bin)
    writeFileSync(fakeNode, '#!/usr/bin/env sh\nif [ "$1" = "-v" ]; then echo v18.0.0; exit 0; fi\nexit 1\n')
    writeFileSync(fakeCurl, '#!/usr/bin/env sh\nprintf called > "' + marker + '"\nexit 99\n')
    chmodSync(fakeNode, 0o755)
    chmodSync(fakeCurl, 0o755)
    const result = spawnSync('bash', [bashInstaller], {
      cwd: workspace,
      encoding: 'utf8',
      env: { ...process.env, HOME: workspace, PATH: bin + ':/usr/bin:/bin' },
      input: '',
    })
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stdout + result.stderr, /当前不是交互式终端，已拒绝自动安装/)
    assert.equal(existsSync(marker), false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})
