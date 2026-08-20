# 给其他 AI 的统一评测任务

你正在执行一次受控 UI 生成对比。目标是检验**结构化工作流带来的约束效果**，而不是比较模型能力。请使用同一个模型、同一个主题、相同的文本内容完成两个版本，并严格区分两个阶段。

## 规则

- 在开始前阅读根目录 `README-FIRST.md`。
- 所有新文件只能写在 `playground/` 目录。不要改动 `SKILL.md`、`scripts/`、`schemas/`、`references/` 或已有示例。
- 不使用外部图片、在线字体、远程 URL 或模型 API Key。不要捏造已经运行过的命令、截图或评审结果。
- 若某个命令失败，保留真实报错并在 `playground/trial-results.md` 记录；不要把失败降级成“已通过”。

## 阶段 A：直接生成基线

**在这一阶段，不要读取 `SKILL.md`、`handoff/evaluation.spec.json`、`references/`，也不要运行本项目脚本。**

仅根据下面的普通需求创建 `playground/baseline.html`。这是一个桌面端个人任务面板，画布为 1440 × 900：

> 产品名为 daymark。页面显示 Monday, March 10；主标题是 “Make room for the work that matters.”；摘要是 “Three useful things before lunch. Everything else can wait.”。重点任务为 “Shape the research brief”。任务列表包含 “Send the customer interview outline”、“Review the onboarding empty state”、“Block 30 minutes for synthesis”。进度文案是 “2 of 5 planned blocks protected”。提供“Add a task”按钮。请做成完整、可用、响应式的静态 HTML 页面。

完成后，只说明基线使用了哪些设计判断；不要事后读取工作流文件来修改基线。

## 阶段 B：使用 ui-design-workflow

1. 阅读根目录 `SKILL.md`，以及其中直接引用的 `references/modes.md`、`references/contracts.md`、`references/security.md`、`references/quality-rubric.md`。
2. 将 `handoff/evaluation.spec.json` 复制到 `playground/evaluation.spec.json`，然后在包根目录运行：

   ```bash
   node scripts/validate.mjs --type spec --file playground/evaluation.spec.json
   node scripts/tokens.mjs --spec playground/evaluation.spec.json --target all
   node scripts/assemble-prompt.mjs --mode redesign --style professional --spec playground/evaluation.spec.json
   ```

3. 只有前三个命令都成功后，依据验证通过的规格、令牌与受限提示创建 `playground/workflow.html`。不要更改规格中的产品事实；可在 `redesign` 模式内改善呈现。
4. 若本机有 Chrome，分别截图：

   ```bash
   node scripts/render.mjs --root playground --input baseline.html --output-name baseline-direct --width 1440 --height 900 --dpr 1
   node scripts/render.mjs --root playground --input workflow.html --output-name workflow-constrained --width 1440 --height 900 --dpr 1
   ```

5. 复制 `handoff/TRIAL-RESULT.template.md` 为 `playground/trial-results.md`，如实写入运行环境、命令结果、两个产物路径，以及你观察到的差异。不要把主观感受写成可证明的“质量提升”。

最终请向操作者返回两个 HTML 文件、两张截图（若成功）和 `trial-results.md` 的路径。
