# 数据契约

`schemas/spec.schema.json` 和 `schemas/review.schema.json` 是公开格式（仅供人读的声明式参考）；`scripts/lib/schema.mjs` 是零依赖的运行时校验器，也是**唯一事实来源**——它比 JSON Schema 文件更严格（hex/字体/阴影/未知字段/尺寸与嵌套上限只在运行时校验）。两者不一致时，以运行时报错为准。

- `spec` 必须带 `schemaVersion: "1.0.0"`、`mode: "reproduce" | "redesign"` 与 `meta`。
- `tokens` 操作额外要求合法的 `designTokens`。颜色、字体、间距、圆角、阴影和边框均采用受限格式，避免把不可信字符串写入 CSS 或 JS。
- `review` 必须带 `mode: "review"`、候选产物、视口、评审者和完整证据。每条问题都有唯一 id、P0/P1/P2、类别、位置、证据、预期、现状和修复建议。
- 所有 JSON 最大 1 MiB；文本、数组和嵌套深度都有上限。未知字段会被拒绝，以避免静默误读。
