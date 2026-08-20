# DeepSeek Harness 试用说明（实验性）

本说明按 DeepSeek Harness 的“选择一个工作区，再让 Agent 读取和执行其中的文件”方式编排，而不依赖插件市场或特定 profile。这样对版本变化更耐受，但**不等于本包已经是 DSH 官方插件**。

DeepSeek Harness 官方仓库目前标注为 developer preview，并明确提示可能出现破坏性兼容变更。因此必须记录实际版本与结果，不能只因启动成功就宣传“兼容”。

## 试用前准备

1. 解压本包，进入它的根目录。
2. 确认 `node --version` 为 20 或更高。
3. 运行 `node handoff/verify-handoff.mjs`，再运行 `npm run validate:skill && npm test`。
4. 需要截图时，确认本机安装 Chrome。不要把任何 DeepSeek API Key 写进本包、截图、终端记录或 `trial-results.md`。

## 在 DSH 中运行

截至 2026-08-18，官方 README 的启动方式为：

```bash
npx @deepseek-ai/dsh web
```

从**本包根目录**执行该命令。它默认在 `http://127.0.0.1:3080` 提供 Web UI。打开 Web UI 后：

1. 在 Settings → Models 配置你自己的模型与凭证；密钥仅保存在 DSH 的配置处。
2. 点击 Choose workspace，选择这个已解压的包目录。
3. 新建会话，发送下面这一句：

   ```text
   Read handoff/AI-EVALUATION-PROMPT.md and execute it exactly. Keep all generated files inside playground/, run the listed validation commands, and report any real error instead of fabricating a pass.
   ```

4. 查看 DSH 的审批请求。它需要读取工作区、运行 Node 和写入 `playground/`；这符合本次试用范围。不要批准与此无关的网络、系统目录或凭证读取请求。
5. 完成后，保留 `playground/trial-results.md`、两个 HTML 和（若渲染成功）两张 PNG。

## 可选：MCP 连接冒烟测试

仅当你所使用的 DSH 版本在界面或文档中提供“添加 stdio MCP 服务”的入口时，再尝试本项。配置字段名可能随 DSH 版本变化；下列仅是服务进程的**稳定部分**，不是可直接粘贴的 DSH 配置文件：

```text
command: node
args: ["mcp/server.mjs"]
cwd: <本包绝对路径>
env: UI_DESIGN_WORKFLOW_ROOT=<本包绝对路径>
```

最小调用顺序应为 `validate_spec` → `convert_tokens` → `assemble_prompt`。MCP 只接受对象或工作区相对路径，并将截图写到工作区内；不要传绝对输入路径、远程 URL 或任意输出路径。

若 DSH 无法添加 MCP，不影响“工作区 + Node 脚本”试用结论。请在结果中标注“未测试 MCP”，而不是标注“DSH 不兼容”。

## 结论记录要求

使用 [试用记录模板](TRIAL-RESULT.template.md)，至少记录：DSH 显示的版本或 commit、系统、Node 版本、模型名称（不含 Key）、核心脚本结果、截图结果、MCP 是否实际测试。只有这些证据齐全，才可在后续 README 中将该组合称为“已验证”。

官方资料：<https://github.com/deepseek-ai/deepseek-harness>。启动与工作区步骤以当次官方文档为准。
