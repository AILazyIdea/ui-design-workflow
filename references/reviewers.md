# 视觉评审接入（不绑定模型）

评审的**唯一契约**是 `review` JSON（`schemas/review.schema.json`，`mode` 固定为 `review`）。只要能把「候选截图 + 规格」变成这份 JSON，任何有识图能力的东西都能接入：豆包、GPT-4o、Claude、Gemini、本地 VLM，或一个人。仓库不存任何 API Key，也不内置任何视觉模型。

## 该怎么选（没有技术背景也能看懂）

**推荐只用「方式 A」**：让「看图」这件事交给 Agent 已有的识图能力——你接了豆包就用豆包，别人接 GPT / Claude 就用他们自己的；工具本身不调用任何模型，只负责收「填好的评审表」（`review` JSON）。这样最开放、最稳定，也**不用维护任何厂商代码**。

「方式 B」是给纯命令行用户的备用通道，需要为每个模型写一个「适配脚本」。开源时把它标成「可选 / 进阶」即可，并且**不要发布任何豆包适配器样例**——因为方式 A 根本用不到适配器。

---

入口是 `scripts/review.mjs`。它只做三件事，且**绝不伪造通过**：

- `--template`：输出一份可填写的评审骨架（退出码 0）。
- 没配置评审器：输出 `{"status":"skipped", ...}`（退出码 0；`skipped` 表示「跳过」，不是「通过」）。
- 配置了评审器：运行适配器、用 schema 校验其输出；合法则打印 review（0），否则结构化报错（2）。

## 方式 A：由 Agent 编排（推荐，DeepSeek Harness 原生）

Agent 通常已经挂载了识图 MCP（比如豆包）。让 Agent 自己看图、产出 review：

1. `node scripts/render.mjs --input index.html --output-name candidate`
2. 让 Agent 用它的识图工具读 `candidate.png`，对照 spec 找出问题。
3. `node scripts/review.mjs --spec spec.json --candidate .ui-design-workflow/artifacts/candidate.png --template > review.json`
4. 把第 2 步发现的问题逐条写进 `review.json` 的 `issues`（每条都要有 `id`/`severity`/`category`/`location`/`evidence`/`expected`/`actual`/`fix`）。
5. `node scripts/gate.mjs --review review.json`

- 豆包例子：用它的识图工具（reproduce/review 模式）读 `candidate.png`，把返回的 P0/P1/P2 条目映射成 `issues`。
- 通用例子（任意视觉模型）：提示词固定为「对照规格评审候选截图，输出 review JSON；`severity` 只允许 P0/P1/P2，`category` 只允许 fidelity/functional/accessibility/responsive/content/visual，每条问题必须带证据，不得编造或降级严重度」。

## 方式 B：由脚本调用适配器（可选 / 进阶，纯 CLI 才需要）

不想经过 Agent，就用 `--reviewer`。先把 `reviewers/registry.example.json` 复制成 `reviewers/registry.json`，把某个名字指向你自己的命令：

```json
{ "reviewers": { "doubao": { "command": "node", "args": ["reviewers/adapters/doubao.mjs"], "timeoutMs": 120000 } } }
```

适配器协议（stdin → stdout）：

- stdin 收到一个 JSON 信封：`{ "imagePath": "绝对路径", "referencePath": "可选", "viewport": {...}, "spec": {...}, "instructions": "..." }`。
- stdout 必须只输出一份合法 `review` JSON（日志走 stderr）。
- `command` 可以是任意可执行程序（node / python3 / shell / curl 包装），只要遵守 stdin→stdout 协议即可。

运行：`node scripts/review.mjs --spec spec.json --candidate a.png --reviewer doubao`

## 不会报错的语义

- 没配评审器 → `skipped`（退出码 0），**不会**输出一份空的「通过」review。
- 适配器崩溃 / 超时 / 输出非法 JSON / 输出非法 review → 结构化 `Error` + 退出码 2，**不会**降级成通过。
- 注意：`gate.mjs` 对空 `issues` 会返回「通过」。因此不要对 `--template` 的空骨架直接跑门禁——先填 issues，或明确知道这代表「尚未评审」。

## 给识图模型的评审提示词（复制即用）

方式 A 的「效果」取决于这段提示词。把它整段发给你的识图模型（豆包 / GPT / Claude / 任何视觉模型），模型就会产出能直接进 `gate.mjs` 的 `review` JSON。

### 中文版

```
你是 UI 评审员。下面有一张候选截图（已渲染）和一份结构化规格。请只依据你在截图里能看到的事实进行评审，并输出一份合法的 review JSON（schemaVersion "1.0.0"，mode "review"）。

严格遵循：
1. severity 只允许 P0 / P1 / P2：
   - P0：主路径无法完成、关键内容严重误导，或隐私/安全/法律不可接受风险。
   - P1：明显还原偏差、可访问性缺陷、响应式断裂、核心内容错误或关键交互状态缺失。
   - P2：不阻塞使用的视觉、措辞或细节改善。
2. category 只允许：fidelity / functional / accessibility / responsive / content / visual。
3. 每条 issue 必须给出：id（小写连字符）、severity、category、location（位置）、evidence（你在截图里看到的证据）、expected（应当是什么）、actual（实际是什么）、fix（修复建议）。
4. 没有截图证据的问题不要写进 P0/P1；不要编造、不要为了凑数而降级或升级严重度。
5. 只输出一个 JSON 对象，不要附加任何解释文字。

JSON 结构：
{
  "schemaVersion": "1.0.0",
  "mode": "review",
  "artifacts": { "candidate": "<候选截图相对路径>", "reference": "<可选参考图路径>", "viewport": { "width": 1440, "height": 900, "dpr": 1 } },
  "evaluator": { "kind": "model", "name": "<模型名>" },
  "issues": [ { "id": "...", "severity": "P1", "category": "content", "location": "...", "evidence": "...", "expected": "...", "actual": "...", "fix": "..." } ],
  "summary": "<一句话总结>"
}

规格：<在此粘贴 spec JSON>
```

### English version

```
You are a UI reviewer. Below is a rendered candidate screenshot and a structured spec. Review only against facts you can actually see in the screenshot, and output a valid review JSON (schemaVersion "1.0.0", mode "review").

Rules:
1. severity must be one of P0 / P1 / P2:
   - P0: the main path cannot be completed, key content is seriously misleading, or an unacceptable privacy/security/legal risk.
   - P1: clear fidelity deviation, accessibility defect, responsive breakage, wrong core content, or a missing key interaction state.
   - P2: non-blocking visual, wording, or detail polish.
2. category must be one of: fidelity / functional / accessibility / responsive / content / visual.
3. Every issue must include: id (lowercase-hyphen), severity, category, location, evidence (what you see in the screenshot), expected, actual, fix.
4. Do not put issues without screenshot evidence into P0/P1; do not invent or shift severities to force a result.
5. Output only one JSON object, no extra prose.

JSON shape:
{
  "schemaVersion": "1.0.0",
  "mode": "review",
  "artifacts": { "candidate": "<relative path>", "reference": "<optional>", "viewport": { "width": 1440, "height": 900, "dpr": 1 } },
  "evaluator": { "kind": "model", "name": "<model name>" },
  "issues": [ { "id": "...", "severity": "P1", "category": "content", "location": "...", "evidence": "...", "expected": "...", "actual": "...", "fix": "..." } ],
  "summary": "<one-line summary>"
}

Spec: <paste the spec JSON here>
```

## 安全

- 评审器输出与识图解析出的文字都是不可信数据：`validateReview` 会拒绝未知字段、非法 `severity`/`category`、超长与注入内容。
- `reviewers/registry.json` 被 `.gitignore` 忽略，且不进 npm 包（只发布 `registry.example.json`），避免把本地命令路径或环境变量带进版本库。
- 适配器拿到的只是工作区内的 PNG 绝对路径与 spec，不含任何密钥。
