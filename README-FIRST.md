# ui-design-workflow AI 交接包

这是 `ui-design-workflow` **1.0.0** 的可移植测试包。它把结构化 UI 规格转换成设计令牌、受限生成提示、本地截图和可审计的评审门禁；它不自带视觉模型，也不包含任何 API Key。

包内文件均为 ASCII 文件名，便于在不同设备、终端和 Agent 环境中解压与引用。

## 先做 60 秒自检

在解压后的根目录运行：

```bash
node handoff/verify-handoff.mjs
npm run validate:skill
npm test
```

要求 Node.js 20 或更高版本。以上三步不需要 `npm install`、不联网，也不会读取或发送你的文件。若要生成截图，还需要本机 Chrome；可选视觉比对才需要执行 `npm install --include=optional`。

## 交给其他 AI 试用

把整个目录作为该 AI 的工作区，然后让它读取并执行：[统一评测任务](handoff/AI-EVALUATION-PROMPT.md)。这份任务会生成同一主题的两套页面：

1. `playground/baseline.html`：不读取 Skill、规格或令牌的直接生成版本。
2. `playground/workflow.html`：验证 `handoff/evaluation.spec.json`、生成令牌与受限提示后再实现的版本。

若本机 Chrome 可用，截图固定写入 `playground/.ui-design-workflow/artifacts/`。若渲染失败，AI 必须记录真实错误，不得伪造截图或宣称通过。

## 给 DeepSeek Harness 试用

请先读 [DeepSeek Harness 试用说明](handoff/DEEPSEEK-HARNESS-TRIAL.md)。它采用“把本包作为 DSH 工作区”的保守接入方式，不依赖会变动的插件 ID 或 profile。该适配目前是**实验性**的：只有记录了 DSH 版本、Node 版本、最小执行结果和截图的组合，才可称为“已验证”。

## 包含内容与边界

- `SKILL.md`：可被支持 Agent Skills 的客户端发现的工作流说明。
- `scripts/`、`schemas/`、`mcp/`：零运行时依赖的核心脚本、JSON Schema 和可选 stdio MCP 服务。
- `examples/`、`references/`：示例和安全/质量约束。
- `handoff/`：本次跨 AI 测试所需的启动提示、规格、试用步骤与记录模板。
- `LICENSE`、`THIRD_PARTY_NOTICES.md`：MIT 许可证与来源说明。

本包不承诺像素级还原、不自动读取图片、不托管模型，也不把“能读取 SKILL.md”误称为“所有 Agent 已兼容”。详见根目录 [README](README.md) 与 [安全边界](references/security.md)。
