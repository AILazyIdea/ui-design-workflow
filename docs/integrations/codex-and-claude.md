# Codex 与 Claude

## Codex

项目级安装时，保持目录名不变：

```text
<project>/.agents/skills/ui-design-workflow/
```

用 `npm run validate:skill` 检查 frontmatter，再在实际项目中验证 Skill 触发与本地 MCP 配置。Skill 不要求视觉模型；如果 Codex 已能看图，它应先产出并校验 spec。

## Claude

Claude 的 Skill 支持与安装路径随产品版本变化。复制整个 `ui-design-workflow` 目录到该版本官方文档指定的 Skills 位置，并在一个隔离项目中验证：spec 校验、MCP stdio 启动、受限截图和 artifacts 可见性。

不要把“兼容 Agent Skills 格式”宣传为“无需配置即可兼容所有 Claude 产品”。
