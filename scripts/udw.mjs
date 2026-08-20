#!/usr/bin/env node
/**
 * Single command-line entry point. `udw <command>` dispatches to the existing
 * scripts (which also remain callable directly as `node scripts/<name>.mjs`).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(here, '..')

const commands = {
  validate: { file: 'scripts/validate.mjs', desc: '校验 spec / review JSON' },
  tokens: { file: 'scripts/tokens.mjs', desc: '规格 → CSS / Tailwind 令牌' },
  prompt: { file: 'scripts/assemble-prompt.mjs', desc: '规格 → 受限生成提示' },
  render: { file: 'scripts/render.mjs', desc: '本地 HTML → 截图' },
  check: { file: 'scripts/check-output.mjs', desc: '校验产出是否符合规格（内容+令牌）' },
  geometry: { file: 'scripts/check-geometry.mjs', desc: '确定性几何校验（圆角/间距/控件高度一致性）' },
  computed: { file: 'scripts/check-computed.mjs', desc: '运行时计算样式==令牌校验（需 Chrome）' },
  a11y: { file: 'scripts/check-a11y.mjs', desc: '确定性可访问性校验（结构 + 对比度）' },
  'visual-gate': { file: 'scripts/visual-gate.mjs', desc: '视觉回归基线门禁（--candidate --baseline）' },
  verify: { file: 'scripts/verify-review.mjs', desc: '识图发现→确定性复核仲裁（--review --spec --html）' },
  review: { file: 'scripts/review.mjs', desc: '视觉评审调度（--template / --reviewer）' },
  optimize: { file: 'scripts/optimize.mjs', desc: '自动审校+优化闭环驱动（--plan 方案.json）' },
  gate: { file: 'scripts/gate.mjs', desc: '评审门禁（0=通过 1=阻塞 2=输入无效）' },
  mcp: { file: 'mcp/server.mjs', desc: '启动 stdio MCP 服务' }
}

function usage() {
  console.log('ui-design-workflow — 本地可审计的 UI 工作流')
  console.log('')
  console.log('用法：udw <命令> [参数...]')
  console.log('')
  for (const [name, c] of Object.entries(commands)) console.log(`  ${name.padEnd(9)} ${c.desc}`)
  console.log('')
  console.log('示例：')
  console.log('  udw validate --type spec --file examples/spec.example.json')
  console.log('  udw render --input demo/index.html --output-name candidate')
  console.log('  udw gate --review review.json')
  console.log('')
  console.log('等价于直接跑脚本：node scripts/<name>.mjs ...')
}

const argv = process.argv.slice(2)
const cmd = argv[0]
if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') { usage(); process.exit(0) }
const entry = commands[cmd]
if (!entry) { console.error(`未知命令：${cmd}\n`); usage(); process.exit(2) }
const result = spawnSync(process.execPath, [path.join(packageRoot, entry.file), ...argv.slice(1)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
