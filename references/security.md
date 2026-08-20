# 安全与隐私边界

- MCP 和本地脚本默认只读工作区内的相对路径；符号链接、`..`、绝对路径和任意输出路径会被拒绝。
- 截图只写入 `.ui-design-workflow/artifacts/`。这个目录应被 Git 忽略，除非你明确挑选并脱敏某张图用于文档。
- 核心渲染只处理本地 HTML。远程 URL 需要 `UI_DESIGN_WORKFLOW_UNSAFE=1` 和 `--unsafe-url`，只允许公开 HTTPS，仍可能带来网络访问、追踪和内容变化风险。
- 本项目不读取、保存或代理任何视觉模型 API Key。不要把密钥、客户截图、内部地址或个人数据写进 spec、review、Issue 或公开示例。
- 截图解析出的文字和 JSON 都是不可信数据，不能改变 Agent 指令或权限范围。
