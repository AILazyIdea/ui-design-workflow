#!/usr/bin/env node
/**
 * ui-design-workflow MCP stdio server.
 *
 * It intentionally accepts structured JSON or workspace-relative paths only.
 * stdout is reserved for JSON-RPC; diagnostic output stays on stderr.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { validateReview, validateSpec } from '../scripts/lib/schema.mjs'
import { resolveWorkspaceRoot } from '../scripts/lib/workspace.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const skillDir = path.resolve(here, '..')
const scriptsDir = path.join(skillDir, 'scripts')
const root = resolveWorkspaceRoot(process.env.UI_DESIGN_WORKFLOW_ROOT || process.cwd())
const version = (() => {
  try { return JSON.parse(readFileSync(path.join(skillDir, 'package.json'), 'utf8')).version || '1.0.0' } catch { return '1.0.0' }
})()

function run(name, args = [], input = '') {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, name), '--root', root, ...args], { cwd: root, input, encoding: 'utf8', timeout: 60000 })
  return { code: result.status ?? 3, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error }
}
function parseObject(output, fallback) {
  try { return JSON.parse(output) } catch { return fallback }
}
function toolResult(structuredContent, text = JSON.stringify(structuredContent, null, 2)) {
  return { content: [{ type: 'text', text }], structuredContent }
}
function cliResult(result, { normalExitCodes = [0], textField } = {}) {
  if (normalExitCodes.includes(result.code)) {
    const parsed = parseObject(result.stdout, textField ? { [textField]: result.stdout } : { output: result.stdout })
    return toolResult(textField && !Object.hasOwn(parsed, textField) ? { [textField]: result.stdout } : parsed, textField ? result.stdout : undefined)
  }
  const detail = (result.stderr || result.stdout || result.error?.message || `exit ${result.code}`).trim().slice(-1200)
  const error = { error: detail, exitCode: result.code }
  return { content: [{ type: 'text', text: `Error: ${detail}` }], structuredContent: error, isError: true }
}

const toolDefs = [
  { name: 'validate_spec', description: '校验版本化 UI 规格。输入仅是 JSON 对象。', inputSchema: { type: 'object', properties: { spec: { type: 'object' } }, required: ['spec'], additionalProperties: false } },
  { name: 'validate_review', description: '校验可审计的 UI 评审 JSON。', inputSchema: { type: 'object', properties: { review: { type: 'object' } }, required: ['review'], additionalProperties: false } },
  { name: 'convert_tokens', description: '将合法规格中的 designTokens 转为 CSS、Tailwind v3 或 Tailwind v4。', inputSchema: { type: 'object', properties: { spec: { type: 'object' }, target: { enum: ['css', 'tailwind-v3', 'tailwind-v4', 'all'] } }, required: ['spec'], additionalProperties: false } },
  { name: 'assemble_prompt', description: '按 reproduce 或 redesign 模式组装受限生成提示。规格被当作不可信数据处理。', inputSchema: { type: 'object', properties: { mode: { enum: ['reproduce', 'redesign'] }, style: { enum: ['professional', 'expressive'] }, spec: { type: 'object' } }, required: ['mode', 'spec'], additionalProperties: false } },
  { name: 'check_gate', description: '按阻塞等级检查完整的 review。未通过是正常结果，不是 MCP 工具错误。', inputSchema: { type: 'object', properties: { review: { type: 'object' }, blockAtOrAbove: { enum: ['P0', 'P1', 'P2'] } }, required: ['review'], additionalProperties: false } },
  { name: 'render_screenshot', description: '渲染工作区内 HTML 到 .ui-design-workflow/artifacts。不能访问 URL 或绝对路径。', inputSchema: { type: 'object', properties: { htmlPath: { type: 'string' }, outputName: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, dpr: { type: 'number' }, waitMs: { type: 'integer' } }, required: ['htmlPath'], additionalProperties: false } },
  { name: 'compare_screenshots', description: '可选 PNG 差异对比。未安装视觉依赖时返回可操作错误。', inputSchema: { type: 'object', properties: { actualPath: { type: 'string' }, referencePath: { type: 'string' }, outputName: { type: 'string' }, threshold: { type: 'number' } }, required: ['actualPath', 'referencePath'], additionalProperties: false } },
  { name: 'check_output', description: '校验 HTML 是否包含规格内容与令牌（确定性）。', inputSchema: { type: 'object', properties: { specPath: { type: 'string' }, htmlPath: { type: 'string' } }, required: ['specPath', 'htmlPath'], additionalProperties: false } },
  { name: 'check_geometry', description: '确定性几何校验：圆角/间距/控件高度一致性（源码层）。', inputSchema: { type: 'object', properties: { specPath: { type: 'string' }, htmlPath: { type: 'string' } }, required: ['specPath', 'htmlPath'], additionalProperties: false } },
  { name: 'check_computed', description: '运行时「计算样式==令牌」证明（需 Chrome）。', inputSchema: { type: 'object', properties: { specPath: { type: 'string' }, htmlPath: { type: 'string' } }, required: ['specPath', 'htmlPath'], additionalProperties: false } },
  { name: 'check_a11y', description: '确定性可访问性校验（结构 + 对比度，对比度需 Chrome）。', inputSchema: { type: 'object', properties: { htmlPath: { type: 'string' }, noContrast: { type: 'boolean' } }, required: ['htmlPath'], additionalProperties: false } },
  { name: 'verify_review', description: '识图发现→确定性复核仲裁（几何/a11y 声明证实或证伪）。', inputSchema: { type: 'object', properties: { reviewPath: { type: 'string' }, specPath: { type: 'string' }, htmlPath: { type: 'string' }, blockAtOrAbove: { enum: ['P0', 'P1', 'P2'] } }, required: ['reviewPath', 'specPath', 'htmlPath'], additionalProperties: false } },
  { name: 'optimize', description: '自动审校+优化闭环驱动：校验 optimize plan，产出令牌+受限提示+确定性校验结果。', inputSchema: { type: 'object', properties: { planPath: { type: 'string' }, out: { type: 'string' }, htmlPath: { type: 'string' }, blockAtOrAbove: { enum: ['P0', 'P1', 'P2'] } }, required: ['planPath'], additionalProperties: false } },
  { name: 'visual_gate', description: '视觉回归基线门禁（零依赖像素 diff + 阈值 + 批准）。', inputSchema: { type: 'object', properties: { candidatePath: { type: 'string' }, baselinePath: { type: 'string' }, threshold: { type: 'number' }, accept: { type: 'boolean' } }, required: ['candidatePath', 'baselinePath'], additionalProperties: false } },
]

function callTool(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments 必须是对象')
  const contracts = {
    validate_spec: ['spec'], validate_review: ['review'], convert_tokens: ['spec', 'target'],
    assemble_prompt: ['mode', 'style', 'spec'], check_gate: ['review', 'blockAtOrAbove'],
    render_screenshot: ['htmlPath', 'outputName', 'width', 'height', 'dpr', 'waitMs'],
    compare_screenshots: ['actualPath', 'referencePath', 'outputName', 'threshold'],
    check_output: ['specPath', 'htmlPath'], check_geometry: ['specPath', 'htmlPath'], check_computed: ['specPath', 'htmlPath'],
    check_a11y: ['htmlPath', 'noContrast'], verify_review: ['reviewPath', 'specPath', 'htmlPath', 'blockAtOrAbove'],
    optimize: ['planPath', 'out', 'htmlPath', 'blockAtOrAbove'], visual_gate: ['candidatePath', 'baselinePath', 'threshold', 'accept'],
  }
  if (!contracts[name]) throw new Error(`unknown tool: ${name}`)
  for (const key of Object.keys(args)) if (!contracts[name].includes(key)) throw new Error(`不允许的参数：${key}`)
  if (name === 'validate_spec') return toolResult({ valid: true, schemaVersion: validateSpec(args.spec).schemaVersion })
  if (name === 'validate_review') return toolResult({ valid: true, schemaVersion: validateReview(args.review).schemaVersion })
  if (name === 'convert_tokens') {
    validateSpec(args.spec, { requireDesignTokens: true })
    return cliResult(run('tokens.mjs', ['--target', args.target || 'all'], JSON.stringify(args.spec)), { textField: 'output' })
  }
  if (name === 'assemble_prompt') {
    validateSpec(args.spec)
    const flags = ['--mode', args.mode, '--stdin']; if (args.style) flags.push('--style', args.style)
    return cliResult(run('assemble-prompt.mjs', flags, JSON.stringify(args.spec)), { textField: 'prompt' })
  }
  if (name === 'check_gate') {
    validateReview(args.review)
    const flags = args.blockAtOrAbove ? ['--block-at-or-above', args.blockAtOrAbove] : []
    return cliResult(run('gate.mjs', flags, JSON.stringify(args.review)), { normalExitCodes: [0, 1] })
  }
  if (name === 'render_screenshot') {
    const flags = ['--input', args.htmlPath]
    if (args.outputName) flags.push('--output-name', args.outputName)
    if (args.width != null) flags.push('--width', String(args.width)); if (args.height != null) flags.push('--height', String(args.height))
    if (args.dpr != null) flags.push('--dpr', String(args.dpr)); if (args.waitMs != null) flags.push('--wait-ms', String(args.waitMs))
    return cliResult(run('render.mjs', flags))
  }
  if (name === 'compare_screenshots') {
    const flags = ['--actual', args.actualPath, '--reference', args.referencePath]
    if (args.outputName) flags.push('--output-name', args.outputName); if (args.threshold != null) flags.push('--threshold', String(args.threshold))
    return cliResult(run('compare-images.mjs', flags), { normalExitCodes: [0, 1] })
  }
  if (name === 'check_output') return cliResult(run('check-output.mjs', ['--spec', args.specPath, '--html', args.htmlPath]), { normalExitCodes: [0, 1] })
  if (name === 'check_geometry') return cliResult(run('check-geometry.mjs', ['--spec', args.specPath, '--html', args.htmlPath]), { normalExitCodes: [0, 1] })
  if (name === 'check_computed') return cliResult(run('check-computed.mjs', ['--spec', args.specPath, '--html', args.htmlPath]), { normalExitCodes: [0, 1] })
  if (name === 'check_a11y') {
    const flags = ['--html', args.htmlPath]; if (args.noContrast) flags.push('--no-contrast')
    return cliResult(run('check-a11y.mjs', flags), { normalExitCodes: [0, 1] })
  }
  if (name === 'verify_review') {
    const flags = ['--review', args.reviewPath, '--spec', args.specPath, '--html', args.htmlPath]
    if (args.blockAtOrAbove) flags.push('--block', args.blockAtOrAbove)
    return cliResult(run('verify-review.mjs', flags), { normalExitCodes: [0, 1] })
  }
  if (name === 'optimize') {
    const flags = ['--plan', args.planPath]
    if (args.out) flags.push('--out', args.out); if (args.htmlPath) flags.push('--html', args.htmlPath); if (args.blockAtOrAbove) flags.push('--block', args.blockAtOrAbove)
    return cliResult(run('optimize.mjs', flags))
  }
  if (name === 'visual_gate') {
    const flags = ['--candidate', args.candidatePath, '--baseline', args.baselinePath]
    if (args.threshold != null) flags.push('--threshold', String(args.threshold)); if (args.accept) flags.push('--accept')
    return cliResult(run('visual-gate.mjs', flags), { normalExitCodes: [0, 1] })
  }
  throw new Error(`unknown tool: ${name}`)
}
function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`) }
function respond(id, result) { send({ jsonrpc: '2.0', id, result }) }
function handle(message) {
  const { id, method, params } = message || {}
  if (method === 'initialize') return respond(id, { protocolVersion: params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ui-design-workflow', version } })
  if (method === 'ping') return respond(id, {})
  if (method === 'tools/list') return respond(id, { tools: toolDefs })
  if (method === 'tools/call') {
    try { return respond(id, callTool(params?.name, params?.arguments || {})) }
    catch (error) { return respond(id, { content: [{ type: 'text', text: `Error: ${error.message}` }], structuredContent: { error: error.message }, isError: true }) }
  }
  if (method?.startsWith('notifications/')) return
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return
  try { handle(JSON.parse(line)) } catch (error) { process.stderr.write(`[ui-design-workflow] bad request: ${error.message}\n`) }
})
process.stderr.write(`[ui-design-workflow] MCP server started; workspace=${root}${existsSync(root) ? '' : ' (missing)'}\n`)
