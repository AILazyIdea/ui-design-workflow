# 通用 Agent Skills 与 MCP

Skill 本体遵循 Agent Skills 的目录与 frontmatter 约定：目录名、`name` 和 `SKILL.md` 一致。客户端是否自动发现、安装到哪个目录、可调用哪些工具，取决于各自的官方文档。

MCP 使用本机 stdio。客户端必须：

1. 以项目根目录作为进程 `cwd`，或设置 `UI_DESIGN_WORKFLOW_ROOT`。
2. 允许启动 Node 20+。
3. 允许服务在工作区内创建 `.ui-design-workflow/artifacts/`。
4. 明确同意是否安装 Chrome/Playwright；不要把远程 URL 能力默认暴露给 Agent。

不要因为某个客户端能够读取 `SKILL.md` 就假设它也能运行 MCP、读取图片或显示本地产物。
