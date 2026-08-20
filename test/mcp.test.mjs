import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const spec = JSON.parse(readFileSync(path.join(root, 'examples/spec.example.json'), 'utf8'))
const review = JSON.parse(readFileSync(path.join(root, 'examples/review.failing.json'), 'utf8'))
function request(id, method, params) { return { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) } }

test('MCP server lists strict tools and returns structured non-passing gate result', () => {
  const input = [
    request(1, 'initialize', { protocolVersion: '2025-03-26' }),
    request(2, 'tools/list'),
    request(3, 'tools/call', { name: 'validate_spec', arguments: { spec } }),
    request(4, 'tools/call', { name: 'check_gate', arguments: { review, blockAtOrAbove: 'P1' } }),
    request(5, 'tools/call', { name: 'validate_spec', arguments: { spec, specPath: '/etc/passwd' } }),
  ].map(JSON.stringify).join('\n')
  const result = spawnSync(process.execPath, [path.join(root, 'mcp/server.mjs')], { cwd: root, input, encoding: 'utf8', env: { ...process.env, UI_DESIGN_WORKFLOW_ROOT: root } })
  assert.equal(result.status, 0, result.stderr)
  const messages = result.stdout.trim().split('\n').map(JSON.parse)
  assert.equal(messages[0].result.serverInfo.name, 'ui-design-workflow')
  assert.ok(messages[1].result.tools.some((tool) => tool.name === 'validate_review'))
  assert.ok(messages[1].result.tools.some((tool) => tool.name === 'check_geometry'))
  assert.ok(messages[1].result.tools.some((tool) => tool.name === 'visual_gate'))
  assert.equal(messages[2].result.structuredContent.valid, true)
  assert.equal(messages[3].result.structuredContent.passed, false)
  assert.equal(messages[3].result.isError, undefined)
  assert.equal(messages[4].result.isError, true)
  assert.match(messages[4].result.structuredContent.error, /不允许的参数/)
})
