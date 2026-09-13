# 主流产品「模型链路健康」UX 对标（provider-health 第二面：他们怎么做）

日期：2026-09-13。调研人：取证研究员（s79 支线）。服务对象：v0.9.12 已上线的 provider 健康探测（裁决 2026-09-12-provider-health-probe）的验证与下一步输入。

验证等级图例：
- **VERIFIED-SRC** = 本机 goose v1.50 源码实读（`C:\ZCodeWorks\PocketForge\tmp\goose-src`，与产品内嵌版本同源），注明文件行号。
- **VERIFIED-DOC** = 官方文档/帮助中心/状态页原文已取到（webReader/WebFetch 全文成功）。
- **VERIFIED-2ND** = 官方页面的搜索摘要级引证，或多来源独立社区佐证（未取到全文）。
- **UNVERIFIED** = 单一二手说法，未取到原文，不下游引用。

方法边界：查了 ChatGPT/Claude（web+Code）/Manus/goose 上游源码/one-api+new-api/状态页文化六面；排除面=各产品移动端 Push 通知细节、API SDK 层重试库（与我们桥层无关）、企业级 SLA 页面。Manus 帮助中心直接抓取被 Intercom 反爬挡下两次，其内容经搜索摘要级引证（降级标注）。

## 0. 结论先行

1. **「进页面就知」（主动健康可见）在桌面/客户端形态里几乎没有先例**——六家全部是「发消息才失败」的被动呈现，主动性靠云端状态页（有运营团队的前提）。我们的本地探测×三触发在同类形态中是超前设计，方向无需修正。
2. **模型下架的最优解是官方「替代映射+自动迁移」**（OpenAI：closest equivalent + 提前 6 个月邮件预告）。我们做不到自动迁移的本质原因=中转站不给预告不给映射（供应商缺陷），我们的探测正是对该缺陷的补偿——这是「我们 vs 他们」叙事的核心论据。
3. **一处实锤差距**：stale-model 形态下用户先发消息，错误卡仍会说「等一两分钟再发一次」（误导性安慰，裁决书 §0 已自认，但 v0.9.12 只在告警条层闭环、错误卡层未联动）。见建议 R1。
4. **零自愈裁决获得旁证**：one-api/new-api 的「自动禁用后无法恢复」是自动化自愈边界的公开反例（issues #7040/#5420）。不构成重开理由，构成持续佐证。

## 1. 逐产品对照

### 1.1 ChatGPT（OpenAI 网页/App）

- **断链呈现：全被动。** 发消息才见错误。社区多来源佐证的原文文案：「Something went wrong. If this issue persists please contact us through our help center at help.openai.com」与「There was an error generating a response」（VERIFIED-2ND，community.openai.com/t/166153 帖标题即原文；reddit 多帖同文）。归因=零（不说是谁的问题），出口=「联系支持」（对非技术用户等于没有出口）。帮助中心排错文（help.openai.com/en/articles/7996703）给的处方是刷新/新开对话/查 status.openai.com/清缓存/无痕窗口（VERIFIED-2ND，官方文摘要级）。
- **模型下架：业界标杆，自动迁移+预告+映射三件套。**（VERIFIED-DOC，help.openai.com/en/articles/20001051 原文已取）：
  - 「Conversations and projects are defaulted to their GPT-5.3 Instant and GPT-5.4 Thinking and Pro equivalents going forward.」——存量对话自动迁到「最接近的等价物」；
  - 「GPTs using retired models will automatically move to the closest GPT-5.3 Instant and GPT-5.4 Thinking and Pro equivalent.」；
  - 分批宽限（Enterprise 晚一周、Custom GPTs 晚近两个月），避免一刀切。
  - API 侧（VERIFIED-DOC，developers.openai.com/api/docs/deprecations 原文已取）：「we notify customers who are actively using the model by email」——只邮件通知**在用**该模型的人；GA 模型至少提前 6 个月、变体 3 个月、preview 最短 2 周；每条下架附 recommended replacement 表。**我们的中转站 09-12 一夜下架零通知，是这面镜子的完全反面。**
- **重试/自愈**：网页内部重试策略无公开文档（UNVERIFIED）；用户侧可见的就是重新生成按钮。
- **健康放哪**：独立状态页 status.openai.com（组件红绿），产品内 ok 态零视觉、无常驻健康徽标（VERIFIED-2ND，帮助中心把「查状态页」列为排错第二步，反证产品内无健康指示）。
- **文案抄/避**：避=「Something went wrong」零归因零出口的泛化模板（我们事故二前的水平）；抄=帮助中心按错误逐条给动作的分层排错结构。

### 1.2 Claude（claude.ai / Claude Code）

- **断链呈现：被动为主+故障时横幅。** claude.ai 故障中产品内横幅文案据报道为「Claude is temporarily unavailable — We're working on it, try again in a moment」（UNVERIFIED，二手用户报告转述，措辞可能不精确；「We're working on it」的服务商担责句式可信）。状态页 status.claude.com 常态滚动「Investigating - We are investigating reports of elevated errors affecting chats on claude.ai」（VERIFIED-DOC 首页实取）。API 侧 529 overloaded_error 官方语义=「The API is temporarily overloaded」，明确 server-side（VERIFIED-DOC，docs.anthropic.com/en/api/errors）。
- **模型下架**：claude.ai 曾移除 Sonnet 4.5 等旧模型（VERIFIED-2ND，reddit 讨论）；Anthropic API 有模型弃用政策页但本轮未取（UNVERIFIED，不下结论）。
- **重试/自愈边界：最细的公开文档。**（VERIFIED-DOC，code.claude.com/docs/en/errors 原文已取）：
  - 瞬时失败「retries … up to 10 times with exponential backoff before showing you an error」；
  - **mid-stream 不重试**：「It doesn't always retry a failure that arrives partway through Claude's response」——thinking 已流出但正文未出时仅 2 次快速重发，然后以「Connection lost before a response was produced」收尾；
  - fallbackModel 降档链（Opus→Sonnet）切换时对用户显示通知（VERIFIED-2ND，文档摘要级）。
- **健康放哪**：状态页+故障时产品内横幅；ok 态零视觉。
- **文案抄/避**：抄=三件——①「We're working on it」（服务商担责）；②「Your computer went to sleep mid-response」（把归因具体到用户环境但不指责）；③错误模板按「连接断在哪一刻」分型（mid-response / while thinking / stalled mid-stream）而非按 HTTP 码分型。避=无（其文档面向开发者，529/429 术语不进消费者界面是他们的分层，我们已同构）。

### 1.3 Manus（任务型 agent）

- **断链呈现：任务级错误弹窗。**「The High Load Termination/10091 error is a task-level error that stops the task from continuing. The system will pop up a message telling you that the task can not continue.」（VERIFIED-DOC，help.manus.im/en/articles/11813677 原文已取）。模型对用户不可见、不可选（二手：Manus 用 Claude Sonnet + 自调 Qwen，The Decoder 报道）——**模型层故障被产品内部消化，用户只感知「任务失败」**。
- **模型下架**：用户无模型选择即无暴露面（产品内部换模型曾引发透明度争议，二手，不下结论）。
- **重试/自愈**：平台自动重试失败任务是默认行为，社区抱怨「errors still consuming credits as Manus keeps retrying the same failing task」（VERIFIED-2ND，reddit r/ManusOfficial）——**自动重试对用户不透明=看着它烧钱**，这是「自愈要有感知边界」的公开反例。平台责任侧有全额退款政策：「If our platform fails to deliver due to a technical issue on our end, we believe you are entitled to a refund for the credits used on that task.」（VERIFIED-2ND，help.manus.im/en/articles/12992237 摘要级引证）。
- **健康放哪**：任务内弹窗；未见官方状态页（UNVERIFIED/未见）。
- **文案抄/避**：避=静默自动重试（无告知烧资源）；抄=「平台责任显式化」的担责句式（我们不涉计费，叙事可借：「线路问题不是你的问题」我们已有）。

### 1.4 goose 上游（v1.50 源码，我们内嵌它——一手事实源）

- **断链呈现：全被动，错误以会话流内 assistant 消息出现，非横幅。** 分型文案（VERIFIED-SRC，crates/goose/src/agents/agent.rs:2947-3080）：
  - NetworkError：`"{provider_err}\n\nPlease resend your message to try again."`
  - 通用：`"Ran into this error: {provider_err}.\n\nPlease retry if you think this is a transient or recoverable error."`——**把「是否瞬时」的判断推给用户**，开发者口径；
  - CreditsExhausted：`"Please add credits to your account, then resend your message to continue."` + 结构化 top_up_url 数据供 UI 渲染按钮；
  - Refusal：`"The provider refused this request. ... Please start a new session to continue — resending this conversation is likely to be refused again."`——**显式劝阻重复撞墙**（好模式）；
  - ContextLengthExceeded：自动压缩自愈两轮，终局「Unable to continue: Context limit still exceeded after compaction. Try using a shorter message, a model with a larger context window, or start a new session.」。
- **模型下架：无防护。** fetch_supported_models() 即 GET /models（openai_compatible.rs:181-184），仅用于配置期模型选择器（acp/server/providers.rs:481，拉取失败→ACP internal_error）；**运行期无「当前模型 ∈ 活列表」校验**——下架只能等真实 404 穿透为「Ran into this error: …」。我们桥的探测正是补这个位。
- **重试边界**（VERIFIED-SRC，goose-provider-types/src/retry.rs）：默认 3 次、1s 起步、2× 指数退避、封顶 30s、抖动 0.8-1.2；transient_only 模式仅重试 ServerError/NetworkError/RateLimitExceeded，4xx 不重试；thinking-block 不可变冲突标记为永久失败永不重试。**我们的零自愈建立在 goose 已有的 3 次瞬时重试之上——分层正确。**
- **健康放哪：无处。** acp/server 全目录 grep 无 health/心跳语义（VERIFIED-SRC）。
- **文案抄/避**：避=「Please retry if you think this is a transient or recoverable error」（判断责任推给用户）；抄=Refusal 的「resending … is likely to be refused again」句式（见建议 R1）与错误帧携带结构化出口数据（top_up_url 模式）。

### 1.5 one-api / new-api（中转面板——我们的中转站大概率是这类软件）

- **健康展示：管理员面板红绿清单。**（VERIFIED-DOC，docs.newapi.pro 渠道管理文档原文已取）渠道列表含「状态(绿色=正常 / 红色=禁用)、响应时间」；「测试」单渠道+「测试所有渠道」批量（手动触发）；「自动禁用：开启后连续失败达到阈值时自动禁用该渠道」。one-api 另有 CHANNEL_TEST_FREQUENCY 定期检查、按成功率禁用（阈值默认 0.8）、「支持失败自动重试」、Message Pusher 报警推送（VERIFIED-DOC，one-api README 原文已取）。
- **自愈边界的公开翻车记录**（VERIFIED-2ND，GitHub issues）：#7040 多 Key 渠道自动禁用后定期测试无法恢复；#5420 建议引入熔断半开机制——「恢复依赖手动测试、手动启用或后台定期渠道测试」。**自动禁用容易、自动恢复难，是这类系统的通病。**
- **对我们的意义**：①面板「红绿+响应时间」是健康清单化的成熟形态，但我们面向妻子不需要管理员面板复杂度；②中转站自己有渠道健康体系却不对下游用户暴露模型下架预告——**问题不在检测技术在披露义务，我们只能靠自己探测**（裁决核心假设再获旁证）。

### 1.6 状态页文化（Grafana/Statuspage 模式）

- 核心模式（VERIFIED-2ND，PagerDuty/Atlassian 官方文摘级）：顶部总状态横幅「All Systems Operational / Degraded Performance / Major Outage」；事件 banner 自动浮现，标题+简短消息+Investigating→Identified→Monitoring→Resolved 阶段演进；「written from the customer's perspective rather than internal jargon」（FireHydrant）。
- **ok 态显绿是状态页的规矩，但状态页是「主动查询」场景**（用户已起疑才去看）；产品内界面 ok 态零视觉是 ChatGPT/Claude 共同做法。我们的「ok 零视觉」与产品内惯例一致，不与状态页文化冲突——两者场景不同。裁决反触发清单「竞品有状态页」继续有效。

## 2. 对照总表

| 维度 | ChatGPT | Claude | Manus | goose 上游 | one-api/new-api | **我们 v0.9.12** |
|---|---|---|---|---|---|---|
| 断链=被动? | 被动+状态页 | 被动+故障横幅+状态页 | 任务级弹窗 | 被动（会话流错误消息） | 面板红绿（管理员视角） | **主动（打开即知）+被动错误卡双网** |
| 模型下架 | 官方映射+自动迁移+6 月预告 | 移除旧模型（web） | 用户不可见 | **无防护** | 渠道级禁用（非模型级） | 检测+人话+人工换（无映射可用） |
| 自动重试 | 不可见 | 10 次+mid-stream 不重试+降档通知 | 静默重试（烧 credits） | 3 次+transient 分型 | 失败换渠道重试 | goose 内 3 次；桥层零自愈 |
| 健康放哪 | 状态页 | 状态页+故障横幅 | 任务内 | 无处 | 面板 | 聊天区常驻条（仅故障态） |
| ok 态 | 零视觉 | 零视觉 | 零视觉 | — | 显绿（管理面板） | 零视觉（同主流产品内惯例） |

## 3. 我们 vs 他们：差距分析

1. **主动性领先，无差距。** 六家中五家面向终端用户的界面都是「发了才知道」；他们的主动性全靠云端状态页+运营团队。我们是零运营的本地形态，用三触发探测补了同一职能。方向正确，无需对齐任何人。
2. **实锤差距一（错误卡层未闭环）**：stale-model 形态下用户先发消息 → goose 包成「Ran into this error: …」→ 命中 S26_ERR_RE（chat-bridge.tpl.js:124 该正则含 `Ran into this error` 前缀）→ 错误卡发 TURN_DOWN_TEXT「等一两分钟再发一次」（:822/:851）——**对下架形态，等一万年也不会好**（裁决书 §0 原话自认）。v0.9.12 在告警条层闭环（turn 失败触发 60s 防抖复检 → 条出现），但错误卡文案分支**不读健康态**，同回合用户先看到误导安慰。裁决 S3「错误卡与条并存但文案互指去重」在错误卡一侧未落地（前端 grep 无 health/error 去重逻辑）。
3. **差距二（修复路径认知成本）**：stale-model → 面板 ⟳ 拉取 → 在一串模型名里裸挑。OpenAI 的对应物是「closest equivalent 自动迁移」——他们有自家官方映射表；我们没有（中转站不给），裁决 §4 正确裁掉「推荐勾选」（选型非机械）。但**「排序/上下文提示」是机械规则、不替用户挑质量**，与裁决边界不冲突，目前缺失。
4. **差距三（时间预期）**：down 文案有现状+归因+出口三要素，缺「通常几分钟内自愈、条会自动消失」的预期管理。Claude 的「We're working on it, try again in a moment」与状态页文化的阶段性措辞都有这一层。低优先。
5. **非差距（防自满亦防冒进）**：零自愈、无状态页、无通知打扰面、ok 零视觉——四项均与对标结论一致或获旁证（Manus 静默重试烧钱、one-api 自动禁用难恢复=自愈反例；状态页=运营产物）。s50e/裁决 §4 边界全部维持，无重开。

## 4. 可执行建议（4 条，均不推翻既有裁决）

- **R1（S 档，桥 ~10 行）错误卡读健康态，stale-model 形态改口径。** 改哪：chat-bridge.tpl.js turn 失败分支（:851 一带）在发 TURN_DOWN_TEXT/TURN_RETRY_TEXT 前读探测缓存态；stale-model → 直接发「你正在用的模型已被服务商下线，再发也不会好——点上方提醒条去换一个模型」。为什么：本轮实锤差距一；对照 goose Refusal 文案的「resending is likely to be refused again」正例与 ChatGPT 泛化文案反例；裁决 S3 本就要求「文案互指去重」，这是把它落到错误卡层，属**裁决内补全而非新裁决**。成本：一个条件分支+一句文案，e2e 加一断言。
- **R2（S-M 档，前端 ~20 行）面板修复路径的机械辅助：上下文行+前缀排序。** 改哪：chat.tpl.html 服务商面板 ⟳ 拉取后，检测到健康态=stale-model 时，列表顶部加一行「服务商已下架旧模型，请从下面挑一个新的」，列表按与旧模型名的前缀相似度排序。为什么：OpenAI「closest equivalent」的降级版——他们有官方映射能自动迁，我们没有，但排序是机械规则、**不替用户挑输出质量**，不触碰裁决 §4「推荐=替用户挑」边界（明说：若评审认定排序仍是引导，则此条降级为 T3 触发器观察项）。成本：字符串前缀比较+列表排序+一行提示。
- **R3（S 档，改字）down 态文案补预期半句。** 改哪：告警条 down 文案（chat.tpl.html:1827）尾部加「（一般几分钟内自己会好，好了这条会自动消失；一直不好再点按钮）」。为什么：Claude「We're working on it, try again in a moment」+状态页文化的时间预期层；妻子场景「会不会一直这样」是真实焦虑源。需过零术语审读。成本：一句文案。
- **R4（S 档，e2e 一节）goose 错误帧文案穿透断言。** 改哪：e2e-chat 加一例——构造 goose 侧错误帧（「Ran into this error: …」/「Please resend your message to try again.」两种 v1.50 实际形态）→ 断言用户收到人话文案而非英文原文。为什么：S26 正则靠匹配 goose 文案前缀转人话，**上游措辞漂移即漏**（v1.46→v1.50 刚发生过行为变化，research/23 实录）；goose 源码五型文案已入本档 §1.4 可直接做桩。成本：桩+断言，防未来升级回归。

不建议项（证据不足以动，或裁决已闭）：
- 周期心跳/自动换线/自动切模型：维持裁决 §4 与 s50e 边界；本轮证据（Manus 静默重试烧钱、one-api 自动禁用难恢复）**加强**而非削弱该边界。
- 状态页/系统通知：裁决反触发清单有效；状态页是运营组织的产物。
- 「/models 通但 chat 断」深探测：维持裁决 T2 触发器（实录 ≥1 次再重开），本轮对标未见可提前的证据。

## 5. 排除与方法注记

- 已排除：ChatGPT/Claude 移动端 Push 细节（无法稳定取证）；API SDK 重试库层（与桥层无关）；Grafana 具体产品页（状态页文化以 PagerDuty/Atlassian 官方文为据已够用，Grafana 本体是监控工具非终端用户健康 UX，价值密度不足）。
- Manus 帮助中心两次直接抓取被 Intercom 反爬挡下（记录：intercom.help 与 help.manus.im/en/collections 均 500/空）；其引文降级为 VERIFIED-2ND，已按图例标注。
- 检索止损：按 research/25 §5 的密度判断法，第 3 个来源后各产品已无增量即停（Manus 消耗最多轮次，产出密度最低，符合预期）。

## 来源清单

- OpenAI 帮助中心 20001051（模型退役/自动迁移）：https://help.openai.com/en/articles/20001051-retiring-gpt-4o-and-other-chatgpt-models （VERIFIED-DOC）
- OpenAI API 弃用政策：https://developers.openai.com/api/docs/deprecations （VERIFIED-DOC）
- OpenAI 排错文 7996703：https://help.openai.com/en/articles/7996703-troubleshooting-chatgpt-error-messages （VERIFIED-2ND）
- ChatGPT 错误原文社区佐证：https://community.openai.com/t/error-something-went-wrong-if-this-issue-persists-please-contact-us-through-our-help-center-at-help-openai-com/166153 （VERIFIED-2ND）
- Claude 状态页：https://status.claude.com/ （VERIFIED-DOC）
- Anthropic API 错误文档：https://docs.anthropic.com/en/api/errors （VERIFIED-DOC）
- Claude Code 错误参考（重试边界/文案模板）：https://code.claude.com/docs/en/errors （VERIFIED-DOC）
- Manus 10091 任务错误：https://help.manus.im/en/articles/11813677-what-can-i-do-if-i-encounter-high-load-termination-10091-error-without-any-pop-up-window （VERIFIED-DOC）
- Manus 退款政策：https://help.manus.im/en/articles/12992237-how-does-our-ai-agent-s-credit-refund-policy-work （VERIFIED-2ND）
- Manus 静默重试烧 credits（reddit）：https://www.reddit.com/r/ManusOfficial/comments/1ryr6c4/very_bad_experience_with_manus_support_credits/ （VERIFIED-2ND）
- Manus 用 Claude+Qwen（The Decoder）：https://the-decoder.com/chinese-ai-agent-manus-uses-claude-sonnet-and-open-source-technology/ （VERIFIED-2ND）
- goose v1.50 源码（本机 `tmp/goose-src`）：crates/goose/src/agents/agent.rs:2947-3080；crates/goose-provider-types/src/retry.rs；crates/goose-providers/src/openai_compatible.rs:181-184；crates/goose/src/acp/server/providers.rs:481 （VERIFIED-SRC）
- new-api 渠道管理文档：https://docs.newapi.pro/zh/docs/guide/feature-guide/admin/channel （VERIFIED-DOC）
- one-api README：https://github.com/songquanpeng/one-api （VERIFIED-DOC，raw 全文）
- new-api issues #7040/#5420：https://github.com/QuantumNous/new-api/issues/7040 、https://github.com/QuantumNous/new-api/issues/5420 （VERIFIED-2ND）
- PagerDuty 状态页最佳实践：https://www.pagerduty.com/resources/outages/learn/status-page-best-practices/ （VERIFIED-2ND）
- Atlassian Statuspage 用户指南：https://support.atlassian.com/statuspage/docs/read-the-statuspage-user-guide/ （VERIFIED-2ND）
