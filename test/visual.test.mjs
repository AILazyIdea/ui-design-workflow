import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runVisual = (script, args, workspace) => spawnSync(process.execPath, [path.join(root, 'scripts', script), '--root', workspace, ...args], { encoding: 'utf8' })

test('optional visual tools explain their missing dependency', { skip: process.env.RUN_VISUAL_TESTS === '1' }, () => {
  const result = runVisual('compare-images.mjs', ['--actual', 'a.png', '--reference', 'b.png'], root)
  assert.equal(result.status, 3)
  assert.match(result.stderr, /可选视觉依赖/)
})

test('visual renderer and comparator pass identical images and fail a changed page', { skip: process.env.RUN_VISUAL_TESTS !== '1' }, () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'ui-design-workflow-visual-'))
  try {
    const page = path.join(workspace, 'page.html')
    writeFileSync(page, '<!doctype html><style>body{margin:0;background:#fff}main{width:200px;height:120px;background:#136f63}</style><main></main>')
    assert.equal(runVisual('render-visual.mjs', ['--input', 'page.html', '--output-name', 'reference'], workspace).status, 0)
    assert.equal(runVisual('render-visual.mjs', ['--input', 'page.html', '--output-name', 'same'], workspace).status, 0)
    assert.equal(runVisual('compare-images.mjs', ['--actual', '.ui-design-workflow/artifacts/same.png', '--reference', '.ui-design-workflow/artifacts/reference.png', '--threshold', '0'], workspace).status, 0)
    writeFileSync(page, '<!doctype html><style>body{margin:0;background:#fff}main{width:200px;height:120px;background:#d9480f}</style><main></main>')
    assert.equal(runVisual('render-visual.mjs', ['--input', 'page.html', '--output-name', 'changed'], workspace).status, 0)
    assert.equal(runVisual('compare-images.mjs', ['--actual', '.ui-design-workflow/artifacts/changed.png', '--reference', '.ui-design-workflow/artifacts/reference.png', '--threshold', '0'], workspace).status, 1)
  } finally { rmSync(workspace, { recursive: true, force: true }) }
})
