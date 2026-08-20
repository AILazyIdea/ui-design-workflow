# 优化方案识图提示词（optimize vision prompt）

把下面整段发给你的识图模型（豆包 / GPT / Claude / 任何视觉模型），让它一次性输出「优化方案」JSON。
之后把 JSON 落盘为工作区内文件，交给 `node scripts/optimize.mjs --plan <文件>` 驱动闭环。

## 中文版（复制即用）

```
你是资深 UI/UX 评审与设计师。下面有一张界面截图。请同时完成两件事，并只输出一个 JSON 对象：

1. review（评审）：只依据你在截图里真实看到的事实，列出问题清单。
2. spec（优化规格）：给出一份 mode="redesign" 的规格，用精确的设计令牌与布局事实，逐条修复上面列出的每个问题——尤其是：按钮尺寸统一、间距统一到 4px 基数、圆角与阴影统一、主次按钮层级区分、禁用态清晰可辨。

严格遵循：
- severity 只允许 P0 / P1 / P2；category 只允许 fidelity / functional / accessibility / responsive / content / visual。
- 每条 issue 必须给出：id（小写连字符）、severity、category、location、evidence（截图里看到的证据）、expected、actual、fix。
- 没有截图证据的问题不要写进 P0/P1；不要编造、不要为了凑数而降级或升级严重度。
- spec 必须带 schemaVersion "1.0.0"、mode "redesign"、meta（pageType、summary），并含 designTokens：background、colors、typography、spacing、radius、shadows、borders。
- 颜色用 #RRGGBB；spacing.observedValues 用 4 的倍数；radius.values 用统一刻度；shadows/borders 用合法 CSS 值。
- layout 用 regions 描述区块；content 用字段记录所有可见文案（不要编造不存在的产品事实）。

只输出一个 JSON 对象，不要任何解释文字。结构：

{
  "schemaVersion": "1.0.0",
  "mode": "optimize",
  "input": { "kind": "screenshot", "summary": "<一句话描述输入>", "reference": "<可选相对路径>" },
  "review": { "schemaVersion": "1.0.0", "mode": "review", "artifacts": { "candidate": "<截图相对路径>", "viewport": { "width": 1440, "height": 900, "dpr": 1 } }, "evaluator": { "kind": "model", "name": "<模型名>" }, "issues": [ { "id": "...", "severity": "P1", "category": "visual", "location": "...", "evidence": "...", "expected": "...", "actual": "...", "fix": "..." } ], "summary": "<一句话>" },
  "spec": { "schemaVersion": "1.0.0", "mode": "redesign", "meta": { "pageType": "...", "summary": "..." }, "designTokens": { ... }, "layout": { ... }, "content": { ... }, "interactions": { ... } }
}
```

## 后续评审轮注意（第 2 轮起）

第 2 轮起，候选页已通过 `check-geometry.mjs` 的确定性校验。把它的输出作为上下文一并交给识图模型，并明确要求它：

- **不要**测量像素、数元素、判断圆角/间距的精确值（这些已由源码证明；识图模型在低层几何任务上会系统性出错，见 arXiv 2407.06581）。
- 只做粗粒度判断：整体还原度、主次层级、对比度、交互状态是否可辨、风格审美。
- 有问题时给出「该查什么」的线索，让确定性检查去核实，而不是自己报精确像素。

## English version (copy-ready)

```
You are a senior UI/UX reviewer and designer. Below is a UI screenshot. Do two things at once, and output exactly one JSON object:

1. review: list issues based only on facts you can actually see in the screenshot.
2. spec: a mode="redesign" spec whose precise design tokens and layout facts fix every issue you listed — especially: unify button sizes, unify spacing on a 4px scale, unify radius/shadow, differentiate primary vs secondary actions, and make the disabled state legible.

Rules:
- severity must be one of P0 / P1 / P2; category must be one of fidelity / functional / accessibility / responsive / content / visual.
- Every issue needs: id (lowercase-hyphen), severity, category, location, evidence, expected, actual, fix.
- Do not put issues without screenshot evidence into P0/P1; do not invent or shift severities.
- spec must have schemaVersion "1.0.0", mode "redesign", meta (pageType, summary), and designTokens with background, colors, typography, spacing, radius, shadows, borders.
- Colors as #RRGGBB; spacing.observedValues as multiples of 4; radius.values as one consistent scale; shadows/borders as valid CSS.
- layout uses regions; content records every visible string (do not invent product facts).

Output one JSON object only, no prose. Shape: same as the Chinese version above.
```
