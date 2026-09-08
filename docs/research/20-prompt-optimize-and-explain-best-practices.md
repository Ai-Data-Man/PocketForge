# 提示词优化按钮 与 工具调用白话解释重写：外部实践研究

日期：2026-09-08。研究员：外部实践研究（子任务）。
范围：主线A（输入框「优化」按钮）+ 主线B（工具调用解释重写）。纯研究，未改代码。

验证等级标注：
- **VERIFIED-DOC**：官方文档原文核对（本机经代理抓取或 WebFetch 成功）。
- **VERIFIED-RAW**：一手泄漏/源码原文（GitHub raw 抓取成功）。
- **SECONDHAND**：仅二手转述（官方站点被区域封锁或 403 时，交叉多个独立二手来源）。
- **UNVERIFIED**：单一来源，未交叉。

---

## §1 提示词优化机制盘点（主线A输入）

### 1.1 OpenAI Playground「Optimize」——最贴近主线A形态的官方先例

来源：OpenAI 帮助中心《Prompt management in Playground》。**VERIFIED-DOC**（web reader 抓取原文）。
https://help.openai.com/en/articles/9824968-prompt-management-in-playground

原文关键句：

> "Optimize is a new tool available in the Playground and Logs pages that automatically improves prompts by detecting and fixing contradictions, unclear instructions, and missing output formats."
> "When run, it returns an improved version of your prompt or helpful suggestions, along with a summary of the changes made. You can preview the revisions and apply them directly in the Playground with a one-click."

抽取的机制：
- **变换清单固定为三类**：矛盾修复、不清晰指令、缺失的输出格式。不是"重写得更华丽"。
- **输出=改写版 + 变更摘要**（"summary of the changes made"）双件套。
- **呈现=预览 + 一键应用**，不静默替换。
- 失败/不适用时降级为 "helpful suggestions"（建议而非改写）。

### 1.2 Augment Code「Enhance Prompt ✨」——按钮工作流的官方定义

来源：Augment 官方文档 Agent 页。**VERIFIED-DOC**（WebFetch 成功）。
https://docs.augmentcode.com/using-augment/agent

官方四步流程原文：

> 1. "Write your prompt in the prompt input box" 2. "Click the Enhance Prompt ✨ button" 3. "Review and edit the enhanced prompt" 4. "Submit your prompt"

机制要点：
- 优化器注入的上下文=**代码库**："adds relevant references, structure, and conventions from your codebase to improve the prompt before it is sent"。映射到 PocketForge：对应物是**当前对话上下文**。
- 结果落在输入框内、**可继续编辑**，无 diff 视图；「审查后再发送」是显式产品步骤（用户保持对最终文本的控制权）。

### 1.3 Cursor「enhance prompt」✨ 按钮

**SECONDHAND**（Cursor 官方文档未直接命中；依据 Cursor 论坛功能请求帖与多个社区描述，模式与 Augment 同构）。
- 论坛原帖即请求加入"类似 Augment 的 ✨ Enhance Prompt 按钮"：https://forum.cursor.com/t/request-to-add-an-ai-driven-prompt-enhancer-similar-to-augment-agent-s-feature/92328
- 社区共识的使用要点：粗指令 → 点✨ → 展开成更细的规格 → **人工审查后**提交。
- **失败模式（重要）**：社区反复提到 enhance 会"加入用户没写的假设"，所以审查步骤不可省——这是主线A必须保留原文、用户确认后才替换的直接论据。

### 1.4 Anthropic Console「Generate / Improve a prompt」

官方文档 platform.claude.com / docs.anthropic.com 对本机区域封锁（307 重定向到 app-unavailable-in-region；代理 curl 超时；Wayback 无快照）。以下为 **SECONDHAND**（Maginative、SD Times、Reddit 三源交叉，一致但细节有限）：
- https://www.maginative.com/article/anthropics-new-tool-will-write-prompts-for-you/
- https://sdtimes.com/ai/anthropic-adds-new-feature-to-help-developers-improve-prompts/

抽取的机制（三源一致部分）：
- Generator：用户描述任务目标 → 生成结构化完整提示词；宣称融入 chain-of-thought、**指令与数据分离**（XML/变量化）等 Anthropic 自家最佳实践；支持变量占位以便多场景测试。
- Improver：把**已有提示词**交给 Claude 本身精修（refine existing prompts using Claude itself）。
- 产品哲学：产出是 "a starting point for testing and iteration"（起点而非终稿），Console 侧配合人工编辑/迭代。
- 未经证实的细节（各源均未覆盖）：是否 diff 呈现、版本历史。标注 UNVERIFIED。

### 1.5 Manus 泄漏提示词内嵌的 Poor→Improved 对照（可直接抄的变换规则）

来源：jujumilk3/leaked-system-prompts 的 manus_20250310.md。**VERIFIED-RAW**（本机代理抓取全文，43KB）。
https://github.com/jujumilk3/leaked-system-prompts/blob/main/manus_20250310.md

原文示例对（文档内 "Prompt Engineering Guide" 部分）：

> Poor: "Tell me about machine learning."
> Improved: "I'm a computer science student working on my first machine learning project. Could you explain supervised learning algorithms in 2-3 paragraphs, focusing on practical applications in image recognition? Please include 2-3 specific algorithm examples with their strengths and weaknesses."

变换维度抽取（Poor→Improved 的差集）：补**角色/身份**、补**任务范围收窄**（supervised learning / image recognition）、补**长度约束**（2-3 paragraphs）、补**输出物要求**（examples with strengths and weaknesses）。另有专门 "Specify Output Format" 条目：brief vs detailed、bullet/paragraph/table、code/citations、tone。

### 1.6 DSPy / GEPA（学术派）——确认「不适配单次直调」

来源：GEPA 官方 README。**VERIFIED-RAW**（本机代理抓取）。
https://github.com/gepa-ai/gepa

原文关键句：

> "Optimize any text parameter — prompts, code, agent architectures, configurations — using LLM-based reflection and Pareto-efficient evolutionary search."
> 配置示例：`trainset=trainset, metric=..., max_metric_calls=150, reflection_lm=...`

机制：候选池 + 对**完整执行轨迹**的反思（读 error messages / reasoning logs 诊断"为什么失败"）+ Pareto 选择；需要数据集、评估指标、100–500 次评估调用、独立反思模型。论文：arXiv:2507.19457（**VERIFIED-DOC** 摘要级）。
**结论：与 PocketForge「单次直调」形态根本不符，不采用其流程**；唯一可借鉴的思想=「基于失败轨迹的文本化归因」（若未来做会话级提示词自优化再启用）。

### 1.7 Google 系

- **Vertex AI Prompt Optimizer**：数据驱动（标注样本上传 Cloud Storage + 优化任务），官方博客/文档存在性 **VERIFIED-DOC**（搜索快照命中 cloud.google.com 官方页），机制细节 SECONDHAND。同样不适配单次直调。https://cloud.google.com/blog/products/ai-machine-learning/announcing-vertex-ai-prompt-optimizer
- **Firebase Studio「Improve prompt」按钮**：存在性 **VERIFIED-DOC**（firebase.google.com 官方文档快照："an 'Improve prompt' button that asks Gemini to refine your initial prompt"）——单次直调形态的官方先例，与主线A同构。
- **Google AI Studio**：未发现官方等价功能；开发者论坛存在 "Add Enhance Prompt Button" 功能请求帖（discuss.ai.google.dev）。作为"缺席证据"标注 **UNVERIFIED**（只能证明没搜到，不能证明不存在）。

### 1.8 LangChain/LangSmith Prompt Hub——反面教材

存在性 **VERIFIED-DOC**（官方博客+文档快照）："browse optimized prompts by use case and model"，git 式版本管理。https://www.langchain.com/blog/langchain-prompt-hub
教训：Hub 现挂免责声明 "LangChain does not review or endorse public prompts"——**模板库路线的质量无背书问题**。PocketForge 不走内置模板库路线；生成式优化（按当前上下文定制）优于静态模板挑选。

### 1.9 机制汇总表（主线A）

| 产品 | 上下文 | 变换 | 呈现 | 失败模式 | 验证级 |
|---|---|---|---|---|---|
| OpenAI Optimize | 提示词本身 | 矛盾/含糊/缺输出格式 | 预览+变更摘要+一键应用；降级为建议 | — | VERIFIED-DOC |
| Augment ✨ | 代码库 | 补引用/结构/惯例 | 回填输入框，可编辑，审查后发送 | — | VERIFIED-DOC |
| Cursor ✨ | 代码库/打开文件 | 粗指令→详细规格 | 同上 | 加用户没写的假设 | SECONDHAND |
| Anthropic Generator/Improver | 任务目标/原提示词 | CoT、指令数据分离、变量化 | Console 内编辑迭代起点 | 细节 UNVERIFIED | SECONDHAND |
| Manus 内嵌指南 | — | 角色/范围/长度/输出物/格式 | Poor→Improved 对照 | — | VERIFIED-RAW |
| GEPA/DSPy | trainset+metric+轨迹 | 反思+进化候选 | best_candidate | 需百次评估 | VERIFIED-RAW |
| LangSmith Hub | — | 模板库分发 | hub.pull | 无质量背书 | VERIFIED-DOC |

---

## §2 Agent 工具调用的解释性写作范式（主线B输入）

### 2.1 Claude Code——「过去式动词+计数+真实对象」+ 折叠/展开分层

来源：GitHub issues + claude-dev.tools 调试指南，多源一致。**VERIFIED-DOC**（GitHub issue 为一手）。
- https://github.com/anthropics/claude-code/issues/46110
- https://github.com/anthropics/claude-code/issues/40428
- https://claude-dev.tools/docs/tool-calls

风格事实：折叠态一行摘要 "Read 3 files" / "Edited 2 files" / "Ran 4 shell commands"；`ctrl+o` 或 verbose 展开看完整命令/输出/diff。
**最有价值的证据是社区反弹**：v2.1.105 起把路径折叠成 "Read 3 files" 引发 "Claude Code is being dumbed down?" 抗议，用户自建 Local Log Viewer 去"un-dumb"。→ **点击展开看的用户就是要真实文件名/命令的那批人；对他们隐藏对象=产品错误**。这与 PocketForge 内测用户的批评完全同构。

### 2.2 OpenAI CUA / ChatGPT agent——「现在进行时动词短语 + 点名真实对象」

来源：openai.com/index/computer-using-agent/（本机已抓到页面，中文本地化版；英文文案经搜索快照引述）。文案精确措辞 **SECONDHAND**，风格存在性 VERIFIED-DOC。

引述例（搜索快照）："Closing pop-up, searching for quizzes" / "Searching for grammar quizzes available"。
Simon Willison 实测记录（**VERIFIED-DOC** 转述其博客）：agent 活动日志写 "Reading skill.md for PDF creation guidelines. Then: Searching rimu mast and Kākāpō 2025 breeding status."——**点名真实文件名 skill.md**，无委婉语。
风格规律：动词开头（进行时）、短、动作+对象、串行动 narrate。

### 2.3 Manus——消息分流与报错叙述顺序

来源：泄漏系统提示词。**VERIFIED-RAW**（同 1.5）。

可直接借鉴的原文规则：
- `<message_rules>`："Notify users with brief explanation when changing methods or strategies"；notify（非阻塞进度）/ ask（阻塞提问，仅必要时）分流；"First reply must be brief, only confirming receipt without specific solutions"。
- `<error_handling>` 四步顺序：先核对工具名与参数 → 按报错信息修 → 换替代方法 → "report failure reasons to user and request assistance"（向用户报告失败原因并求助）。
- `<writing_rules>`："actively cite original text with sources and provide a reference list with URLs"——**保留真实来源/URL，不虚构**。

### 2.4 OpenTelemetry GenAI 语义约定 + LangSmith——观测层的事实标准：真实工具名+参数

来源：open-telemetry/semantic-conventions-genai 仓库 docs/gen-ai/gen-ai-agent-spans.md。**VERIFIED-RAW**（本机代理抓取，1053 行）。
https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md

事实：Execute tool span 一等公民属性=`gen_ai.tool.name`、`gen_ai.tool.call.id`、`gen_ai.tool.arguments`（完整 JSON）。LangSmith trace 树的 run 名默认=**函数/工具真名**（**VERIFIED-DOC**，docs.langchain.com 快照："run names default to the class name of the traced object"）。
→ 整个可观测性行业的标准是**如实呈现工具名与参数**，解释层再叠加人话，而非替换掉事实。

### 2.5 写作范式归纳（可直接进系统提示词）

横向综合（2.1–2.4）得出的共性规范：
1. **第一句=动作+对象**：动词开头，点名真实工具名/文件名/关键参数值（不是"它做了一件事"）。
2. **第二句=意义**：这一步在整个任务里为什么存在 / 结果意味着什么（Manus "brief explanation"）。
3. **术语处理=内嵌括号解释**，不是禁用：首次出现的技术词跟一句短释（"运行了 PowerShell（Windows 的命令行）脚本"）。服务"了解"而非"绕开"。
4. **禁止虚构比喻**：可以用类比，但不得编造系统里不存在的东西（Manus 要求引用真实来源的精神）。
5. **报错=四段式**：说清失败了 + 错误要点（引用真实错误关键词）+ 已尝试/将尝试什么 + 需不需要用户做什么（Manus error_handling 顺序）。
6. **长度约束保留但放宽对象限制**：三句以内可以保留；"不复述路径/原文"的限制应删除（2.1 的社区反弹证明想看的人要真名）。
7. **分层呈现**：折叠态一行（动作+对象），展开态细节（Claude Code 范式）——PocketForge 现有"点按钮才解释"已是分层，改的是解释文案本身。

---

## §3 落地建议

### 本地能力核对（先决事实）

`forge/conf/templates/chat-bridge.tpl.js:3107-3176` 的 `explain_tool` 先例（本机已读）：
单次 chat completion 直调（当前会话模型）、system+短 user 消息、`reasoning_effort:'none'`（400 时去掉重试）、SSE 增量转发、sha1 LRU 缓存（200 条）、30s 超时、回复截 500 字、**不进会话历史**。输入=工具 title 前 80 字 + output 前 600 字。
现 sysP（3124 行）禁止一切技术术语并禁止复述路径/提示词原文——**"黑话"的根源是这两条禁令**（原文并无"强制比喻"字样，比喻是模型绕禁令的副产品）。
该骨架可完整复用于主线A；上限/缓存/超时/错误路径全部继承。

### 主线A：优化按钮

| # | 建议 | 依据 | 落地成本 |
|---|---|---|---|
| A1 | 新增 `optimize_prompt` 桥端点，完整克隆 explain_tool 骨架（直调+流式+缓存+超时+400重试） | 本地先例 | 需新桥端点（~70 行，与 explain_tool 同构） |
| A2 | 上下文注入：输入框原文（必需）+ 最近对话摘要（role+首句级，截 ~1500 字）。对话历史前端已有 | Augment 用代码库作上下文的对应物 | 需前端把历史摘要并入消息；桥端改动小 |
| A3 | system prompt 写死变换清单：①消歧/澄清含糊 ②补输出格式 ③补长度与受众约束 ④收窄任务范围 ⑤去口语冗余。**明令：不得新增用户未提出的任务目标或假设** | OpenAI Optimize 三类 + Manus Poor→Improved 差集 + Cursor 失败模式对冲 | 纯提示词 |
| A4 | 输出双段式：`<optimized>...</optimized>` + `<changes>...</changes>`（改了什么，逐条） | OpenAI Optimize "summary of the changes made" | 纯提示词 + 前端解析 |
| A5 | 呈现=预览卡（优化稿+变更摘要），「替换入输入框」「放弃」两键；替换前原文不动，替换后仍可继续编辑再发送 | Augment 四步流程（review and edit 在 submit 前）；Cursor 教训 | 需新UI（一个卡片组件） |
| A6 | 分流模式：输入过短/歧义致命时，返回 2-3 个澄清问题而非改写（用户点选或作答后再优化） | Manus notify/ask 分流思想；OpenAI "or helpful suggestions" 降级 | 提示词 + 前端一种新消息形态（可后置） |
| A7 | 不做：模板库（Hub 无质量背书教训）、GEPA/数据驱动优化（需 trainset+metric+百次评估，形态不符） | §1.6/§1.8 | — |

### 主线B：解释重写

| # | 建议 | 依据 | 落地成本 |
|---|---|---|---|
| B1 | **重写 3124 行 sysP**：删「禁止任何技术术语/不复述路径」两条禁令；写入 §2.5 七条规范（动作+对象开头 / 意义句 / 术语内嵌解释 / 禁虚构比喻 / 报错四段式 / 三句上限保留 / 允许真实文件名与工具名） | Claude Code 社区反弹 + OpenAI CUA 点名真实对象 + Manus 报错顺序 + OTel 行业标准 | 纯提示词改动（一处字符串） |
| B2 | user 消息增加工具调用参数：现在只传 title+output，把 call 的参数 JSON（截断）一并传入，解释才能点名对象 | OTel gen_ai.tool.arguments 为一等属性 | 桥端一行 + 前端传参（小） |
| B3 | 保留 500 字上限与 30s 超时（已合理）；缓存键随输入变化自动失效，无需动 | 本地先例 | 无 |
| B4 | （可选，后置）解释卡支持两层：默认三句版，展开看「技术版」（含参数与原始报错） | Claude Code 折叠/ctrl+o 分层 | 需新UI，列为后续迭代 |
| B5 | 验收口径：解释文本中应出现至少一次真实对象名（工具名/文件名/参数值）；不得出现编造的类比对象。可用现有抽查流程检验 | 本报告自定（可证伪标准） | 测试用例 |

### 风险与不确定项

- Anthropic Improver 的呈现细节（diff/版本史）未取得官方原文（区域封锁），不影响 A1–A7 建议（其机制已由 OpenAI/Augment 官方文档覆盖）。
- OpenAI CUA 英文文案精确措辞为 SECONDHAND；风格结论（动词+真实对象）有 Simon Willison 一手记录支撑。
- Google AI Studio「无此功能」为缺席证据，仅 UNVERIFIED 陈述。

## 附：来源清单

VERIFIED-DOC/RAW（本机抓取成功）：
- OpenAI 帮助中心 prompt management（web reader）: https://help.openai.com/en/articles/9824968-prompt-management-in-playground
- Augment Agent 文档（WebFetch）: https://docs.augmentcode.com/using-augment/agent
- Manus 泄漏提示词 raw gist: https://raw.githubusercontent.com/jujumilk3/leaked-system-prompts/main/manus_20250310.md
- GEPA README raw: https://raw.githubusercontent.com/gepa-ai/gepa/main/README.md
- OTel GenAI agent spans raw: https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md
- Claude Code issues #40428 / #46110: https://github.com/anthropics/claude-code/issues/40428 、 https://github.com/anthropics/claude-code/issues/46110
- OpenAI CUA 页面（中文本地化，本机 web reader 抓取）: https://openai.com/index/computer-using-agent/

SECONDHAND（官方源被封锁，多源交叉）：
- Maginative: https://www.maginative.com/article/anthropics-new-tool-will-write-prompts-for-you/
- SD Times: https://sdtimes.com/ai/anthropic-adds-new-feature-to-help-developers-improve-prompts/
- Cursor 论坛: https://forum.cursor.com/t/request-to-add-an-ai-driven-prompt-enhancer-similar-to-augment-agent-s-feature/92328
- LangChain Hub 博客/文档（快照）: https://www.langchain.com/blog/langchain-prompt-hub
- Vertex AI Prompt Optimizer（官方页快照）: https://cloud.google.com/blog/products/ai-machine-learning/announcing-vertex-ai-prompt-optimizer
- arXiv GEPA 论文: https://arxiv.org/abs/2507.19457
