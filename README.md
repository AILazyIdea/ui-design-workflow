# ui-design-workflow

> 让 AI 帮你把界面改漂亮，而且**能证明它真的改对了**——而不是「看两眼说好看」。

一个本地、可审计的 UI 设计工作流。它把一份结构化规格变成能落地、能验证的界面，并且每一步都有确定性校验兜底。核心零依赖，装好 Node 就能跑。

---

## 为什么要做这个？

朋友让 AI「优化一下界面」。AI 忙活了半天，**只把颜色改了一下**，按钮大小不一、间距乱糟糟、圆角阴影全没动。

问题出在哪？——**让 AI 用眼睛去判断「两个按钮是不是一样大」，它根本做不到。** 视觉大模型在数像素、测间距、画直线这类几何任务上会系统性翻车（[Vision language models are blind, arXiv 2407.06581](https://arxiv.org/abs/2407.06581)）。

所以我们换了个思路，把「看」和「证明」拆开：

- 🧠 **识图模型只负责「出主意」**：哪里不顺眼、主次层级对不对、状态清不清楚、配色舒不舒服。
- 🔬 **确定性脚本负责「出证明」**：按钮是不是真的等高、圆角间距在不在刻度上、对比度达不达标、令牌有没有真生效。
- ⚖️ 最后，识图说的问题要**过一遍确定性复核**——复核不过就当误报丢掉。

结果就是：AI 出主意，代码出证明，谁也糊弄不了谁。

---

## 它是什么

一条「spec → 落地 → 验证 → 门禁」的闭环：

```
   spec(规格) ─▶ tokens(令牌) ─▶ 受限生成提示 ─▶ 渲染 HTML
                                     │
                    四层确定性校验（内容 · 几何 · 运行时==令牌 · 可访问性）
                                     │
        识图评审(P0/P1/P2) ─▶ verify-review 证实/证伪 ─▶ 门禁 ─▶ 达标 or 再改
```

- **reproduce**：忠实还原规格里写清楚的事实。
- **redesign**：在产品约束内明确授权的改造。
- **review**：按证据记 P0/P1/P2，门禁判定。
- **optimize**：全自动「看图 → 定问题 → 改 → 再看 → 直到达标」循环。

---

## 和别人有什么不一样

| 别人 | 我们 |
|---|---|
| 大模型看两眼，说「挺好看」 | 每条结论都能被脚本**证明或推翻** |
| 像素一致性靠「目测」 | 圆角/间距/等高用**源码 + 运行时**证明 |
| 改完就完了 | 改完还要**过门禁**，不达标自动再来 |
| 数据发到别人的云 | **本地跑、不存 Key**，车牌这类隐私数据也敢用 |

一句话：**可审计、有证明的 AI 设计优化，而不是大模型看两眼说好看。**

---

## 快速开始

需要 Node.js ≥ 20；新安装建议使用当前 LTS（目前为 Node 24）。核心不需要 `npm install`、不需要编译；截图和运行时校验需要本机 Chrome。

**macOS / Linux**

```bash
bash install.sh
```

**Windows**（PowerShell）

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

两个脚本都会先检测 Node。若缺失或低于 20，**只会在交互式终端里说明安装方式和可能影响，并等待你确认**；默认选项为不安装。自动安装会选择当前推荐 LTS（目前为 Node 24）。已有 Node 20 或更高版本时不会改动环境。

在 CI、Agent 或其他无交互环境中，脚本会拒绝自动安装，避免卡住或意外改机器。只有你明确授权时才可使用：

```bash
# macOS / Linux
bash install.sh --install-node --yes

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File install.ps1 -InstallNode -Yes
```

自动安装只处理 Node.js。核心自检失败会以失败状态退出，不会显示“安装完成”。macOS/Linux 的安装脚本不会自动修改 nvm 的默认 Node；Windows 的交互式安装会保留 winget 自身的来源与协议确认。

已有 Node 的话，直接跑：

```bash
# 自检（离线，无需 npm install）
node handoff/verify-handoff.mjs

# 校验一份规格
node scripts/validate.mjs --type spec --file examples/spec.example.json

# 规格 → 令牌 / 受限提示
node scripts/tokens.mjs --spec examples/spec.example.json --target css
node scripts/assemble-prompt.mjs --mode redesign --spec examples/spec.example.json
```

---

## 工具一览（`udw`）

所有脚本都有单命令入口 `udw`（与 `node scripts/<name>.mjs` 等价）：

| 命令 | 做什么 |
|---|---|
| `validate` | 校验 spec / review JSON |
| `tokens` | 规格 → CSS / Tailwind 令牌 |
| `prompt` | 规格 → 受限生成提示 |
| `render` | 本地 HTML → 截图 |
| `check` | 内容 + 令牌是否真的在产出里 |
| `geometry` | 圆角/间距/控件等高（源码层） |
| `computed` | 运行时「计算样式 == 令牌」（需 Chrome） |
| `a11y` | 可访问性：结构 + 对比度 |
| `visual-gate` | 视觉回归基线门禁（像素 diff + 阈值 + 批准） |
| `verify` | 识图发现 → 确定性复核（证实/证伪） |
| `review` | 视觉评审调度 |
| `optimize` | 全自动审校 + 优化闭环驱动 |
| `gate` | 评审门禁（0=通过 1=阻塞 2=输入无效） |
| `mcp` | 启动 stdio MCP 服务 |

---

## 全自动优化（DeepSeek Harness / 任何挂了识图 MCP 的 Agent）

给 Agent 装好本包 + 任意识图工具（豆包 / GPT / Claude / 本地 VLM），发一句「优化这个界面」，它会自动：

看图 → 出优化方案 → 生成 → 渲染 → 四层确定性校验 → 再看 → 门禁 → 循环到达标。

四类输入都能接：**截图（含 macOS 原生 App 截图）、已有 HTML、纯文字描述**。

- 一键启动提示见 [handoff/AUTO-OPTIMIZE-PROMPT.md](handoff/AUTO-OPTIMIZE-PROMPT.md)
- 闭环细节见 [references/optimize.md](references/optimize.md)

---

## 安全边界（很重要）

- **不存任何模型 API Key**，识图用你自己挂的工具，本包不调用、不代管模型。
- **只读工作区内文件**，远程 URL 默认禁用，防路径穿越/符号链接逃逸。
- **把 spec 当不可信数据**处理，防提示注入。
- 核心零依赖；截图/运行时校验需要本机 Chrome，视觉 diff 有零依赖实现。

详见 [references/security.md](references/security.md)。

---

## 文档

- [README-FIRST](README-FIRST.md) · [工作模式](references/modes.md) · [数据契约](references/contracts.md) · [质量准则](references/quality-rubric.md)
- [优化闭环](references/optimize.md) · [视觉评审接入](references/reviewers.md)
- 集成：[DeepSeek Harness](docs/integrations/deepseek-harness.md) · [Agent Skills](docs/integrations/agent-skills.md) · [Codex/Claude](docs/integrations/codex-and-claude.md)

## License

[MIT](LICENSE)
