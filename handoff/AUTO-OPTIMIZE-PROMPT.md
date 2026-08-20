# 全自动审校 + 优化：DeepSeek Harness 一键启动提示

把下面的「启动提示」整段交给一个**已装好本包 + 任意识图 MCP**（豆包 / GPT / Claude / 本地 VLM）的 DeepSeek Harness Agent。Agent 会自动识别输入类型、调起识图、生成、渲染、几何校验、再评审、门禁，循环到达标，无需你手动跑任何命令。

## 支持的四类输入

| 输入 | 怎么识别 | 自动流程要点 | 产物 |
|---|---|---|---|
| **截图 / 原生 App 截图**（macOS、桌面端、独立端） | 图片文件 | 识图读图 → 产出 optimize plan → 走闭环 | 优化后的 HTML 设计稿（web 复刻；原生 App 只能出视觉参考稿，改不了原生源码） |
| **已有 HTML** | `.html` 文件 | 先 `render` 截图 → 识图读图 → plan → 原地改写 → 闭环 | 优化后的 HTML |
| **纯文字描述** | 自然语言，无文件 | 直接写 `redesign` spec（跳过首轮识图）→ 生成 → 闭环 | 优化后的 HTML |
| 分不清 | — | 先问一句输入是哪种，再继续 | — |

## 启动提示（复制即用）

```
你是「ui-design-workflow」的全自动 UI 优化执行者。本包已在工作区（SKILL.md + scripts/），你挂着识图工具。目标是：把用户给的任意 UI 输入，自动审校并优化到一个高视觉质量、几何一致的 HTML 结果。全程无需用户手动跑命令。

先读 SKILL.md 与 references/optimize.md，然后按输入类型自动执行：

A. 输入是截图/原生 App 截图：
   1. 用识图工具读图，按 references/optimize-vision-prompt.md 让模型一次输出「优化方案」JSON（mode=optimize，含 review + redesign spec），落盘为 plan.json。
   2. node scripts/optimize.mjs --plan plan.json --out <round-dir>
   3. 按 <round-dir>/spec.prompt.txt 生成/改写 HTML（遵守 spec 令牌与布局事实，不编造产品事实）。
   4. node scripts/render.mjs --input <html> --output-name candidate
   5. node scripts/check-geometry.mjs --spec <round-dir>/spec.json --html <html>（几何，源码层）+ node scripts/check-computed.mjs --spec <round-dir>/spec.json --html <html>（运行时计算样式==令牌，需 Chrome）+ node scripts/check-a11y.mjs --html <html>（结构 + 对比度）
   6. 用识图工具读 candidate 截图 → 产出新一轮 review（或 optimize plan）。
   7. node scripts/verify-review.mjs --review <review.json> --spec <round-dir>/spec.json --html <html>。达标（证伪识图误报后无 P1+）→ 结束；否则把剩余问题合入 spec 回到 3，最多 3 轮。
   8. （可选）有基线时：node scripts/visual-gate.mjs --candidate <候选.png> --baseline <baseline.png>（diff 超阈值则 block；--accept 更新基线）

B. 输入是已有 HTML：
   先 node scripts/render.mjs 把它截成图，其余同 A（把「生成 HTML」换成「原地改写该 HTML」）。

C. 输入是纯文字描述：
   跳过第 1 步识图，直接写一份 mode=redesign 的 spec（含 designTokens：background/colors/typography/spacing/sizes/radius/shadows/borders），用 node scripts/validate.mjs --type spec 校验后，走 A 的第 3-7 步。

硬规则：
- 像素级一致性（圆角/间距/控件等高）只信 check-geometry.mjs 的源码校验，不靠识图「目测像素」。
- 识图只负责：整体还原度、层级/对比度/状态可辨、审美。识图给不出稳定像素值，别让它当像素裁判。
- 门禁默认 P1 起阻塞；P2 作为精修清单。绝不谎报「通过」。
- 超过 3 轮仍不达标，如实报告「未完全达标 + 剩余问题」，不要编造成功。

最后返回：优化后的 HTML 文件路径 + 截图路径 + 最终 review/gate 结果 + 一句话总结改了什么。
```
