# 自动审校 + 优化闭环（optimize）

`optimize` 是本工作流在 DeepSeek Harness（或任何挂了识图 MCP 的 Agent）里的**自动闭环**：
用户说「优化这个 UI」，Agent 就自动反复「看图 → 定问题 → 改 → 再看 → 直到达标」，无需人手写规格。

它与单步模式的关系：

- `reproduce` / `redesign` / `review` 是**单步能力**，各自需要先有人/视觉模型把 `spec` / `review` 准备好。
- `optimize` 是**驱动循环**，把「识图」和「重建」连起来，直到门禁放行。

## 核心原则

- 识图能力来自 Agent 已挂载的视觉 MCP（豆包 / GPT / Claude / 任何识图插件）。本包**不调用、不内置、不代管**任何视觉模型或 Key。
- 视觉模型只做两件事：**看**（发现 P0/P1/P2 问题，带证据）和**给出改法**（输出一份 `redesign` 规格）。两者打包成一份 `optimize plan` JSON。
- 其余步骤（校验、令牌、受限提示、渲染、几何校验、门禁、产物落盘）全部由零依赖脚本确定性地完成，不依赖模型。
- **分工**：像素级一致性（圆角、间距、控件等高）用 `check-geometry.mjs` 源码证明；视觉层（层级、对比度、状态可辨、风格）用识图评审。识图不看源码，会以 ±2-6px 误差「猜」像素，因此几何一致性不交给识图。

## 闭环流程（Agent 自动执行）

1. **看**：Agent 用识图工具读输入（截图 / 已有 HTML 的渲染图 / 需求描述），按 [优化方案识图提示词](optimize-vision-prompt.md) 让模型一次性输出「优化方案」JSON（`mode: "optimize"`，含 `review` + `redesign` `spec`）。
2. **合**：`node scripts/optimize.mjs --plan <方案.json> [--out <输出目录>] [--block P0|P1|P2]` —— 校验方案、拆出 `spec.json` + `review.json`、跑门禁、产出令牌与受限 redesign 提示。
3. **改**：Agent 依据 `spec.prompt.txt` 生成/改写 HTML（遵循 `spec` 的令牌与布局事实，不编造产品事实）。
4. **验**（确定性，不靠识图）：`node scripts/check-output.mjs`（内容+令牌）+ `node scripts/check-geometry.mjs`（圆角/间距/控件高度，源码层）+ `node scripts/check-computed.mjs`（运行时「计算样式==令牌」证明，需 Chrome）+ `node scripts/check-a11y.mjs`（结构 + 对比度，需 Chrome 做对比度）——像素级一致性用证明，识图只负责「看起来对不对」。
5. **拍**：`node scripts/render.mjs --input <html> --output-name candidate` 截新图。
6. **再评**（视觉）：Agent 再次用识图工具读新图，产出新的 `optimize plan`（或纯 `review`）。把第 4 步的确定性结果（check-output / check-geometry）作为上下文一并交给识图模型，并要求它**不要**量像素、数元素、判圆角/间距精确值（这些已由源码证明），只做粗粒度的层级 / 对比度 / 状态可辨 / 审美判断。
7. **闸**（含确定性仲裁）：`node scripts/verify-review.mjs --review <review.json> --spec <spec.json> --html <html>` —— 识图的**几何类**发现会被 `check-geometry`/`check-computed` 证实或证伪；证伪的（识图误报）自动剔除，剩余无 P1 及以上 = 达标结束；否则把剩余问题作为下一轮修正输入，回到第 2 步。（不需要仲裁的纯门禁仍用 `gate.mjs`）

## 停止条件

- 默认 `gate.mjs` 在 `P1` 起阻塞（`--block-at-or-above P1`）。想更严可传 `--block P2`。
- 建议 Agent 设轮数上限（如 3 轮），避免无休止打磨；超限就如实报告「未完全达标」，不得谎报通过。

## 输入形态

- `screenshot`（含**原生 App / 桌面端截图**）：给一张现有界面截图 → 输出优化后的 HTML 设计稿（web 复刻/原型）。对原生 App 只能做视觉参考稿，改不了原生源码。
- `html`：给已有 HTML 源码 → 先渲染成图，再原地审校并改写。
- `description`：只有文字需求 → 先产 spec 走 redesign，跳过「看当前图」的第一步评审。

> **全自动**：把 [handoff/AUTO-OPTIMIZE-PROMPT.md](../handoff/AUTO-OPTIMIZE-PROMPT.md) 的「启动提示」交给装了本包 + 识图 MCP 的 DSH Agent，它会按输入类型自动跑完整闭环，无需手动命令。

## 视觉回归基线（可选）

有了稳定基线后可加一层像素门禁，防止后续改动悄悄破坏已达标界面：

```bash
# 首次：以当前候选图建立基线（自动）
node scripts/visual-gate.mjs --candidate <候选.png> --baseline <baseline.png>
# 之后：diff 超过阈值即 block（默认 0.01）
node scripts/visual-gate.mjs --candidate <候选.png> --baseline <baseline.png> --threshold 0.01
# 有意变更：批准后更新基线
node scripts/visual-gate.mjs --candidate <候选.png> --baseline <baseline.png> --accept
```

零依赖（内置最小 PNG 解码 + 像素 diff），不装 `pixelmatch`/`pngjs` 也能跑。

## 产物位置

`optimize.mjs` 默认写到 `<root>/.ui-design-workflow/optimize/`：`spec.json`、`review.json`、`spec.tokens.css`、`spec.prompt.txt`。可用 `--out` 改到其它工作区内目录。
