# DeepSeek Harness（实验性）

DeepSeek Harness 可以作为本项目的 MCP 客户端候选，但本仓库不把它作为默认或稳定集成。官方仓库标注其仍在 developer preview，可能出现破坏性兼容变更。

## 已验证的接入方式：工作区 + Node 脚本

不依赖插件市场或 profile，把本包作为 DSH 的工作区，让 Agent 直接读取并执行脚本：

1. 在 DSH 中选择本包根目录为 workspace。
2. 让 Agent 运行 `node handoff/verify-handoff.mjs`、`npm run validate:skill`、`npm test` 完成自检。
3. 让 Agent 执行完整流水线：`validate.mjs` → `tokens.mjs` → `assemble-prompt.mjs` → 生成 HTML → `render.mjs` 截图。

`render.mjs` 已经带上 `--no-sandbox` / `--disable-crash-reporter` 等参数，在 DSH 的受限沙箱内可以稳定截图（只渲染工作区本地 HTML，远程 URL 仍默认禁用）。

## 视觉评审

DSH 的 Agent 通常已经挂载了识图 MCP（例如豆包）。评审走 `review` JSON 契约，不绑定任何模型：

```bash
node scripts/render.mjs --input index.html --output-name candidate
# Agent 用其识图工具读 candidate.png，然后：
node scripts/review.mjs --spec spec.json --candidate .ui-design-workflow/artifacts/candidate.png --template > review.json
# 填 issues 后：
node scripts/gate.mjs --review review.json
```

详细流程与「脚本适配器」方式见 [视觉评审接入](../../references/reviewers.md)。

## MCP 连接（当 DSH 提供 stdio MCP 入口时）

仅当所用 DSH 版本在界面/文档中提供「添加 stdio MCP 服务」入口时再尝试。以下只是服务进程的稳定部分，不是可直接粘贴的 DSH 配置文件：

```text
command: node
args: ["mcp/server.mjs"]
cwd: <本包绝对路径>
env: UI_DESIGN_WORKFLOW_ROOT=<本包绝对路径>
```

最小调用顺序：`validate_spec` → `convert_tokens` → `assemble_prompt`。MCP 只接受对象或工作区相对路径，截图写入工作区内；不要传绝对输入路径、远程 URL 或任意输出路径。若 DSH 无法添加 MCP，不影响「工作区 + Node 脚本」的结论。

## 记录要求

每次适配都应在 Issue 中记录：DSH 版本、操作系统、Node 版本、最小 MCP 请求和截图结果。只有这些组合通过后，才能在 README 或发布说明中标注「已验证」。
