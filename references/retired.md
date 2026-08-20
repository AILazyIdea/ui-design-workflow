# 已退役的设计与说明（历史存档）

以下内容在 1.0.0 已**不再作为公开指令**，也不会被复制进 Agent prompt。保留在此仅作历史透明，避免与旧版本或外部资料（anti-ai-slop、frontend-design 等）混淆。以 [SKILL.md](../SKILL.md) 与 [modes.md](modes.md) 为准。

## 技术栈

ui-design-workflow 不规定 React、Tailwind、组件库、字体或部署平台。它只消费结构化 spec，输出令牌和生成提示，并对本地 HTML 产物做受限截图与评审门禁。技术栈由宿主项目决定。

默认生成目标为**自包含静态 HTML**（配合 `render.mjs` 渲染）；`assemble-prompt.mjs --output react-tailwind` 可切换为 React + Tailwind 示例，使用者需自行确认入口与依赖。

## 旧用法

不要再把多份风格清单串接到 system prompt，也不要把视觉模型或第三方扫描器作为本项目依赖。V1 顺序：得到 spec → 选 reproduce/redesign → 校验 → 组装提示 → 本地渲染 → 写 review → 门禁。

## 反 AI 味规则（原 anti-slop 清单）

原规则混合了主观禁令、第三方来源和与「忠实还原」冲突的默认风格，已废弃。改用可审计的工作模式与质量等级：选模式读 [modes.md](modes.md)，评审读 [quality-rubric.md](quality-rubric.md)，历史来源与许可证边界读 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

## 风格 A / B

公开 V1 不用固定圆角、字体、颜色或竞品名称来定义「专业/大胆」。redesign 的 `professional` 是保守方向、`expressive` 可建立更强识别，但必须保留可读性、可访问性、内容准确、响应式表现与装饰理由；令牌、品牌、组件应来自 spec 与宿主项目。reproduce 模式不得用默认风格覆盖参考图。

## 评审闭环与生成契约

不指定视觉模型、评分、轮次或「顶尖」审美标准。任何人/模型都可评审，但结果必须转为版本化 `review` JSON（候选产物、参考产物（如有）、视口、评审者、每条问题的证据）。严重度与闭环见 [quality-rubric.md](quality-rubric.md)，格式见 [review.example.json](../examples/review.example.json)。生成提示由 `scripts/assemble-prompt.mjs` 按显式 `--mode` 组装，不导入供应商规则、不按页面类型猜风格、把 spec 当不可信数据。
