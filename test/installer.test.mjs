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
  assert.match(bash, /NODE_MIN=20/)
  assert.match(bash, /NODE_INSTALL_MAJOR=24/)
  assert.match(bash, /nvm install "\$NODE_INSTALL_MAJOR"/)
  assert.match(bash, /brew install "node@\$\{NODE_INSTALL_MAJOR\}"/)
  assert.match(bash, /setup_\$\{NODE_INSTALL_MAJOR\}\.x/)
  assert.doesNotMatch(bash, /node@20/)
  assert.doesNotMatch(bash, /nvm (?:install|use) "\$NODE_MIN"/)
  assert.match(powershell, /\$NODE_MIN = 20/)
  assert.match(powershell, /\$NODE_RECOMMENDED_LTS = 24/)
  assert.match(bash, /--install-node --yes/)
  assert.match(bash, /是否继续自动安装？\[y\/N\]/)
  assert.match(bash, /当前不是交互式终端，已拒绝自动安装/)
  assert.doesNotMatch(bash, /nvm alias default/)
  assert.match(powershell, /\[switch\]\$InstallNode/)
  assert.match(powershell, /\[switch\]\$Yes/)
  assert.match(powershell, /Read-Host '是否继续自动安装？\[y\/N\]'/)
  assert.match(powershell, /当前不是交互式终端，已拒绝自动安装/)
})

test('bash installer installs the recommended Node LTS through nvm after explicit approval', { skip: process.platform === 'win32' }, () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'ui-design-workflow-nvm-installer-'))
  try {
    const bin = path.join(workspace, 'bin')
    const nvmDir = path.join(workspace, '.nvm')
    const nodeState = path.join(workspace, 'node-major')
    const installLog = path.join(workspace, 'nvm.log')
    mkdirSync(bin)
    mkdirSync(nvmDir)
    writeFileSync(nodeState, '18')
    writeFileSync(path.join(bin, 'node'), `#!/usr/bin/env bash
major="$(cat \"$FAKE_NODE_STATE\")"
case "$1" in
  -v) printf 'v%s.0.0\\n' "$major" ;;
  -e) printf '%s' "$major" ;;
  *) [ "$major" -ge 24 ] ;;
esac
`)
    writeFileSync(path.join(nvmDir, 'nvm.sh'), `nvm() {
  printf '%s\\n' "$*" >> "$FAKE_INSTALL_LOG"
  case "$1" in
    install|use)
      [ "$2" = '24' ] || return 99
      printf '24' > "$FAKE_NODE_STATE"
      ;;
    *) return 99 ;;
  esac
}
`)
    chmodSync(path.join(bin, 'node'), 0o755)
    const result = spawnSync('bash', [bashInstaller, '--install-node', '--yes'], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: workspace,
        PATH: bin + ':/usr/bin:/bin',
        FAKE_NODE_STATE: nodeState,
        FAKE_INSTALL_LOG: installLog,
      },
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(readFileSync(nodeState, 'utf8'), '24')
    assert.equal(readFileSync(installLog, 'utf8'), 'install 24\nuse 24\n')
    assert.match(result.stdout + result.stderr, /安装与自检均已完成/)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('bash installer installs the recommended Node LTS through Homebrew without linking it', { skip: process.platform === 'win32' }, () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'ui-design-workflow-brew-installer-'))
  try {
    const bin = path.join(workspace, 'bin')
    const brewPrefix = path.join(workspace, 'node-24')
    const nodeState = path.join(workspace, 'node-major')
    const installLog = path.join(workspace, 'brew.log')
    mkdirSync(bin)
    writeFileSync(nodeState, '18')
    writeFileSync(path.join(bin, 'node'), `#!/usr/bin/env bash
major="$(cat \"$FAKE_NODE_STATE\")"
case "$1" in
  -v) printf 'v%s.0.0\\n' "$major" ;;
  -e) printf '%s' "$major" ;;
  *) [ "$major" -ge 24 ] ;;
esac
`)
    writeFileSync(path.join(bin, 'brew'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_INSTALL_LOG"
if [ "$1" = 'install' ] && [ "$2" = 'node@24' ]; then
  printf '24' > "$FAKE_NODE_STATE"
  mkdir -p "$FAKE_BREW_PREFIX/bin"
  ln -sf "$TEST_BIN/node" "$FAKE_BREW_PREFIX/bin/node"
  exit 0
fi
if [ "$1" = '--prefix' ] && [ "$2" = 'node@24' ]; then
  printf '%s\\n' "$FAKE_BREW_PREFIX"
  exit 0
fi
exit 99
`)
    chmodSync(path.join(bin, 'node'), 0o755)
    chmodSync(path.join(bin, 'brew'), 0o755)
    const result = spawnSync('bash', [bashInstaller, '--install-node', '--yes'], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: workspace,
        PATH: bin + ':/usr/bin:/bin',
        FAKE_NODE_STATE: nodeState,
        FAKE_INSTALL_LOG: installLog,
        FAKE_BREW_PREFIX: brewPrefix,
        TEST_BIN: bin,
      },
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(readFileSync(nodeState, 'utf8'), '24')
    assert.equal(readFileSync(installLog, 'utf8'), 'install node@24\n--prefix node@24\n')
    assert.doesNotMatch(readFileSync(installLog, 'utf8'), /link/)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
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
