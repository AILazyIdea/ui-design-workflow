# Changelog

## Unreleased

- 新增确定性校验层：`check-output`（内容+令牌）、`check-geometry`（源码几何）、`check-computed`（运行时「计算样式==令牌」，需 Chrome）、`check-a11y`（结构 + 对比度）。
- 新增 `verify-review`：识图发现 → 确定性复核仲裁（几何/a11y 声明证实或证伪），剔除识图像素估算误报。
- 新增 `optimize` 闭环驱动（`--plan`/`--html`，折叠令牌+受限提示+确定性校验）与 `visual-gate` 视觉回归基线门禁（零依赖 PNG 解码 + 像素 diff + 阈值 + 批准）。
- 设计令牌新增 `sizes`（组件尺寸，如控件高度）；`check-geometry`/`check-computed` 据此校验控件等高与尺寸刻度。
- MCP server 从 7 工具扩展为 14 工具，覆盖完整确定性工具链（`check_output`/`check_geometry`/`check_computed`/`check_a11y`/`verify_review`/`optimize`/`visual_gate`）。
- 新增 `install.sh`（macOS/Linux）与 `install.ps1`（Windows）：检测 Node ≥ 20，缺失/过旧自动安装（nvm/brew/apt/winget），再跑离线自检。
- 新增 `handoff/AUTO-OPTIMIZE-PROMPT.md`（DSH 全自动优化启动提示）、`references/optimize.md`、`references/optimize-vision-prompt.md`。
- 修复：Chrome `--dump-dom` 结果读取竞态（改在 JSON 后加哨兵）、a11y 隐式 `<label>` 误报、禁用态对比度豁免（WCAG 1.4.3）。

## 1.0.0

- 建立版本化 spec/review 契约与 fail-closed 门禁。
- 将还原、改造、评审拆为独立模式。
- 提供工作区受限渲染、可选 Playwright/PNG 差异对比和结构化 MCP 返回。
- 重写公开文档、贡献与安全资料；移除供应商绑定和无法验证的质量承诺。
