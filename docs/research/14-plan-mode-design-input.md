# Plan Mode 三要素设计输入取证（P32 任务选择层解冻准备，2026-09-05，pf-researcher）

任务来源：STATE P32 候选②（research/11 Manus Plan Mode 对标输入）+ s51d 冻结点（任务类型选择层，新增类型挂 P32）。本文只取证与给设计建议，不改代码。

验证状态标注遵循仓库 §3：`VERIFIED-RUN`（本机实测含日期）/ `VERIFIED-DOC`（官方源核对，文件:行）/ `UNVERIFIED`。源码行号基于 tmp/goose-src = github.com/block/goose tag **v1.46.0**（commit 98c11ce2，2026-09-05 经代理浅克隆，与产品在用二进制 1.46.0 同版，沿用 research/12 方法）。

---

## 0. 结论（先行）

1. **ACP `plan` 事件在协议规范里存在且稳定，但 goose v1.46.0 从不发射**——全树唯一命中是测试 fixture 的模式匹配（tests/acp_fixtures/mod.rs:461）。前端预留点（chat.tpl.html:973，裁决书写的 :938 系行号漂移）要等到上游发射才有内容。**P32 设计不能把 ACP plan 事件当依赖**。
2. **裁决书「todo 是 ACP plan 事件的语义来源」表述需修正**：todo 扩展与 plan 事件在 v1.46.0 无任何机械转换关系。todo 的真实形态 = 单工具 `todo__todo_write` 全文覆写纯文本清单 + 存 session extension_data + **每轮经 moim 自动注入 LLM 上下文**（todo.rs:184-201）。它保留的价值在"每轮自动携带的持久清单"这一机制，不在 plan 事件。
3. **goose CLI（终端形态）有原生 plan 工作流**（/plan → 规划模型出计划或澄清问题 → 确认 → 清历史执行），机制完整可借鉴；**但只存在于 CLI，ACP 路径完全不暴露**，且其"确认执行"语义（清空会话历史 + 全局切 Auto 模式）与产品两条既有裁决（会话即记忆、s69 安全默认）正面冲突，不可照抄。
4. **ACP 协议没有"按计划继续/审批计划"原语**。唯一审批机制 = session/request_permission（工具级）；plan 事件是 agent→client 单向展示。**"确认后执行"在产品里的自然形态 = 确认作为一条普通用户消息重发**，不需要新协议。
5. **蓝图可编辑推荐落工作区文件**（ws/计划.md）：桥已有文件树/预览/外部打开/版本管理全套端点（chat-bridge.tpl.js:2083-2351），零新增机制；todo 作蓝图载体的两个硬伤 = 产品 UI 读不到 extension_data（session meta 只带 recipe/extensionResults/workingDir，response_builder.rs:77-101）+ `todo__todo_write` 在 ask_before 清单里每写必出卡。
6. 对标三家（Claude Code / Cursor / Manus）共同形态 = **规划态→可读可改的计划制品→显式确认→执行**，且 Claude Code 的计划本体就是一个 markdown 文件（"spec 永远经过文件系统"）；Cursor 提供了反面教训（模式状态混乱 bug 群）。
7. 推荐冻结顺序：**先做「随时可入」**（入口+提示词模板），蓝图落文件与确认交互顺势同切片——三要素实际是一条最短路径；专用 UI 卡与 todo 进度清单留二步。

---

## 1. 方法与边界

- goose 源码：v1.46.0 tag 浅克隆至 tmp/goose-src（代理 127.0.0.1:7890），行号出自该树；ACP 协议规范取 zed-industries/agent-client-protocol main（2026-09-05 克隆 tmp/acp-schema；goose 钉 agent-client-protocol 1.0.1 / -schema 1.1，Cargo.lock:53-59，规范 v1 目录与其对应）。
- 产品侧：只读核对 forge/conf/templates/ 现行模板（chat.tpl.html / chat-bridge.tpl.js / goose-config.tpl.yaml）与 forge/conf/goose/config/permission.yaml 生产文件。
- 外部对标：WebSearch + 官方文档抓取，2026-09-05。
- 排除项：未动运行栈；未消耗 LLM token；goose Desktop 形态未测（产品只用 acp）；agent-client-protocol-schema 1.1 与 main 分支的差异未逐行 diff（main 新增 v2 目录与 unstable_plan_operations 等特性，本文引用的 `Plan`/`PlanEntry` 属 v1 稳定面，风险低——见 §7 UNVERIFIED-1）。

## 2. goose 侧机制底座

### 2.1 ACP plan 事件：协议有、goose 无

- **协议形态**（VERIFIED-DOC，acp-schema agent-client-protocol-schema/src/v1/plan.rs + client.rs:99-117）：`SessionUpdate::Plan(Plan)` 是稳定变体，serde tag `sessionUpdate: "plan"`；载荷 `Plan { entries: PlanEntry[] }`，每项 `{ content: String, priority: high|medium|low, status: pending|in_progress|completed }`；**全量替换语义**——"agent must send a complete list of all entries with their current status. The client replaces the entire plan with each update"。计划更新是 agent→client 单向展示，无审批回传。
- **goose 发射点**：零。`grep -rn "SessionUpdate::Plan" crates/` 唯一命中 tests/acp_fixtures/mod.rs:461（测试桩）。goose 服务端实际发出的 sessionUpdate 全集 = UserMessageChunk / AgentMessageChunk / AgentThoughtChunk / ToolCall / ToolCallUpdate / CurrentModeUpdate / ConfigOptionUpdate / UsageUpdate / SessionInfoUpdate / StatusMessage（server.rs:1065-1166 + custom_notifications.rs:32-36）。
- **产品管线现状**：桥对 ACP `method` 消息**全量透传**前端（chat-bridge.tpl.js:422-431 `{agent: msg}` 转发，无类型过滤）——plan 事件一旦到来前端即可见，管线零改动。前端预留点 `else if(u.sessionUpdate==='plan'){ /* future */ }` 在 **chat.tpl.html:973**（裁决书 :938 为旧行号）。
- **与 todo 工具的关系**：无。todo_write 落 session extension_data，不产生任何 ACP 事件（todo.rs:58-110）。

### 2.2 todo 扩展实际形态（G3 保留物的真实价值）

- 单工具 `todo__todo_write(content)`：**整篇覆写**，无增量更新（todo.rs:117-138）；50,000 字符上限（env `GOOSE_TODO_MAX_CHARS` 可调，todo.rs:72-77）。
- 持久化：session `extension_data`，**跨轮、跨 compaction 存活**（todo.rs:118-128 自述 + extension_data.rs:85-99 TodoState{content} v0）。
- **每轮 moim 注入**（todo.rs:184-201 get_moim）：有内容时注入 `Current tasks and notes:\n<content>`；空时注入一句行为引导"Once given a task, immediately update your todo..."。**这是它作为"执行态自动携带计划"的机制级优势**——不依赖模型记得去读文件。
- 扩展说明（instructions，todo.rs:36-53）：官方工作流模板 = 开始写清单/过程更新进度/结束核对全完成。
- 产品侧可见性：**UI 读不到 todo 内容**。桥无端点读 session extension_data；session/new 与 load 的 meta 只带 recipe/userRecipeValues/extensionResults/workingDir（response_builder.rs:77-101）。唯一可见途径 = todo_write 工具卡的"参数"区（chat.tpl.html:927-936 rawInput 渲染，**1200 字符截断**）。
- 交互成本：`todo__todo_write` 在产品 permission.yaml ask_before 清单（production :34）→ smart_approve 下**每次写清单必出卡**，60s 超时自动拒绝（s69 G2）。

### 2.3 goose CLI 原生 plan 工作流（可借鉴语义，不可照抄实现）

VERIFIED-DOC（goose-cli/src/session/）：

- 入口 `/plan <message>` / 退出 `/endplan`（input.rs:240-241, 483-488）。官方 help 明示："If user acts on the plan, goose mode is set to 'auto'... To warm up goose before using '/plan', we recommend setting '/mode approve'"。
- 流程（session/mod.rs:1033-1048 → 1290-1385）：
  1. 取**独立规划模型**（config 键 `GOOSE_PLANNER_PROVIDER` / `GOOSE_PLANNER_MODEL`，缺省回落主模型并打 warning，mod.rs:2663-2688）；
  2. 套 `plan.md` 提示词（prompts/plan.md 全文核对）：角色是"planner"，可看全部工具清单，产出**分步计划（编号+依赖+分支）或澄清问题**二选一；明确告知"executor 只能看到最终计划，看不到本对话历史"；
  3. **二次 LLM 调用分类**回复是"plan"还是"clarifying questions"（mod.rs:260-285）；
  4. 澄清问题 → 作为 assistant 消息进会话，用户下轮回答；计划 → cliclack 确认框"Do you want to clear message history & act on this plan?"（默认 Yes）；
  5. 确认执行 = **清空会话历史 + 计划文本转 user 消息 + goose mode 临时全局切 Auto 执行后恢复**（mod.rs:1343-1365，`config.set_goose_mode(GooseMode::Auto)` 是全局 config 写）。
- **与产品约束的冲突**：①清历史 = 丢会话记忆（产品会话即记忆拓扑，ADR-0001/0005）；②全局切 Auto = 绕开 s69 G1/G2 审批链且污染共享 config（桥单 acp 进程多会话同 config）；③整套流程在 CLI 进程内，`goose acp` 不暴露（modes 全集 = auto/approve/smart_approve/chat，new_session.rs:43 + response_builder.rs:205-218 build_mode_state 只通告 GooseMode::VARIANTS）。
- **可借鉴的三点语义**：规划/执行模型可分离；"计划 or 澄清问题"二分类对零技术用户极友好；计划作为独立文本制品被确认后重放。

### 2.4 其他存在性核对

- Recipe 无 plan/lead 相关字段（recipe/mod.rs:42-86 全字段清单：title/description/instructions/prompt/extensions/settings/activities/author/parameters/response/sub_recipes/retry）；`lead_tools` 不存在（research/12 §2.7 结论，本轮 grep 复核一致）。
- summon（已关停，G3）= delegate/load 子代理工具（summon.rs:576/649），无 plan 语义；CLI plan 流程是直接 `provider.complete`（不经 agent/扩展，mod.rs:1299-1308），**summon 关停对 plan 类工作流零影响**。反之若未来想做"多代理分工规划"才需要重开 summon（须先补验 research/12 遗留3 的审批链继承问题）。
- ACP 无 plan 审批原语：唯一审批机制 = `session/request_permission`（acp-schema v1/client.rs:966, 1153 RequestPermissionOutcome）；plan/PlanUpdate/PlanRemoved 均为单向通知，PlanUpdate/PlanRemoved 还在 unstable feature 后面。

## 3. 三要素的桥侧实现面

### 3.1 要素①「随时可入」：妻子一句话进入规划态（不执行）

- 已覆盖：模式下拉四挡（chat.tpl.html:305-310）——「只聊天不动手」可承载纯对话规划；「重要操作问我」（smart_approve，s69 默认）是执行中拦截。s33 开场 quickchip 体系在位（chat.tpl.html:198-201, 678）。
- 缺口：①一键入口（"先出计划"语义现在要靠她自己措辞）；②**规划产出物的承载**（chat 模式聊出的计划混在会话流里，无处安放、无法核对执行）。
- 实现路径选项：
  - **A. 提示词模板 + 前端按钮**（推荐）：入口把用户请求套规划模板发出，模板要求 goose"先只出计划，写成大白话清单存到本会话工作区 计划.md，不要动任何其他东西；信息不够就先列问题问我"。技术形态 = s50 既有"用户消息拼接"通道的模板化（T3 裁决确认过：会话作用域内唯一正确通道），桥零改动。成本低。
  - B. 仿 CLI 原生 /plan：不可行——流程在 CLI 进程内，ACP 不暴露；零 fork 纪律下无法搬入。
  - C. 等 ACP plan 事件/上游 plan 模式：不可依赖（§2.1）。
- 备注：规划态不必是新的"模式挡位"——它是现有模式之上的一个**任务形态**（模板+产出物约定），避免动模式体系。

### 3.2 要素②「蓝图可编辑」：计划是可读可改的制品

| 载体 | 机制支撑 | 成本 | 硬伤 |
|---|---|---|---|
| **工作区文件（ws/计划.md）** | 文件树/预览/外部打开/轻文件管理/版本管理全套端点已在位（chat-bridge.tpl.js:2083-2351 /api/ws/tree, /api/fs/*, /api/artifacts, /api/vcs/*）；ADR-0007 工作区+git 时间线天然给蓝图留痕可回滚 | 最低：模板约定文件名+前端可选加一个"查看计划"入口；goose 侧执行前读文件需模板约定一句 | 执行态不自动携带——需模板写明"执行前先读 计划.md"（或确认后让 goose 自己 todo_write 转一次） |
| todo 扩展承载 | 每轮 moim 自动注入（§2.2，执行态零遗漏） | 低（零代码，靠提示词引导） | **产品 UI 读不到内容**（无端点，工具卡参数区 1200 字符截断）；每写必出卡；整篇覆写不适合作编辑载体 |
| 专用 UI 卡（结构化 entries+编辑框+确认按钮） | 桥全量透传（若上游发 plan 事件可渲染） | 高：新前端组件+桥端点+与 goose 状态同步 | **当前 goose 不发 plan 事件，结构化数据无来源**；内测期面积与收益不成比例 |

- 推荐：**文件为主**。对妻子的"可读可改"重点是可读（她大概率不编辑，但看得懂、能指着说"第 3 步不对"）；真要改，文件树+↗外部办公软件打开（P29）已是现成路径。todo 作**执行态进度**是好的第二步增强（确认计划后让 goose 一次 todo_write 转成执行清单，一张卡换执行期每轮自动携带+进度可见）。

### 3.3 要素③「确认后执行」：确认的计划转为执行

- ACP 无"按计划继续"方法（§2.4）——**确认的机制形态就是重发一条消息**。
- goose CLI 的 act-on-plan 语义不可照抄（清历史+全局切 Auto，§2.3）。
- 产品语义推荐：前端把 计划.md（或 goose 在会话里输出的计划消息）配一条**确认条**：两个大按钮「✅ 就按这个做」（发送确认文本，如"就按这个计划做"）/「✏️ 我要改」（聚焦输入框或外部打开计划文件）。桥零新协议；也可先不做按钮，妻子直接回话即达（按钮是小白化增强）。
- **与 s69 权限卡的叠加关系**：正交且方向一致——计划确认管"做什么"（事前、一次），权限卡管"每个重要动作"（事中、多次）。确认计划**不等于**免卡授权，不引入"确认后自动放行"语义（否则架空 G1/G2，且与权限卡文案承诺"它不会自己偷偷做"冲突）。已知交互摩擦：规划态写 计划.md 会被 write 卡住（write 在 ask_before）——模板应要求**一次写全**（一张卡），避免反复小写；规划态若用 todo_write 同理。
- 时序注意：smart_approve 下纯读（faucet_query/describe、tree/read）不出卡（裁决书 §0 频率评估），规划态的"调研"部分天然安静，出卡集中在写出蓝图那一下。

## 4. 同类产品对标（2026，取证日 2026-09-05）

| 维度 | Claude Code | Cursor Plan Mode | Manus Plan Mode |
|---|---|---|---|
| 进入方式 | Shift+Tab 循环（default→acceptEdits→plan）/ /plan 命令/启动旗标（二手多源一致） | 模式旋钮 Shift+Tab 或下拉；复杂任务提示词可自动建议进 plan（官方 docs） | 随时 /plan（官方 07-22 发布，research/11 已核） |
| 蓝图形态 | **markdown 文件**（专用 plans 目录），agent 用普通编辑工具自改；"spec 永远经过文件系统"（Ronacher 源码级分析 2025-12-17） | 计划文件存**家目录**（默认），"Save to workspace" 按钮转正进项目；聊天或直接改文件皆可编辑（官方 docs） | 可编辑蓝图（官方博客措辞 blueprint） |
| 确认交互 | ExitPlanMode 工具读计划文件触发审批 UI；批准后 agent 从盘上把计划读回执行 | **Build 按钮**手动触发；"结果不对就回滚改动、磨尖计划重跑，通常快于修一个跑偏的 agent"（官方 docs） | 确认后才执行（官方） |
| 本质/硬度 | **提示词约束非硬限制**：写工具仍在，合规靠模型自觉 + 注入提醒（"MUST NOT make any edits...supersedes any other instructions"） | 独立模式，模型获专用的建/更新计划工具（官方博客） | — |
| 与权限体系关系 | plan 态独立于权限模式；批准计划常伴切换 acceptEdits | plan→agent 模式切换；论坛实锤模式状态混乱 bug 群（plan 自动跳 agent 提前执行/agent 自以为还在 plan） | 与其权限确认同构（research/11 判断） |
| 可借鉴点 | ①计划=文件，制品与执行同源；②"计划 or 澄清问题"先澄清再计划；③计划文件应显眼可编辑（Ronacher 批评藏目录是缺点） | ①官方明示琐碎任务跳过 plan；②执行失败的恢复模式=回滚+改计划重跑；③**模式状态机要简单**的反面教训 | 非技术用户对"可编辑蓝图+确认执行"有效的官方验证（research/11） |

来源：Cursor 官方 blog/docs（cursor.com/blog/plan-mode, cursor.com/docs/agent/plan-mode，2026-09-05 抓取）+ forum.cursor.com 帖 148247/148273/144006；Claude Code 二手多源（codewithmukesh.com/cheesecakelabs.com/datacamp.com）+ Ronacher lucumr.pocoo.org/2025/12/17/what-is-plan-mode/（深度分析，VERIFIED-DOC 级二手）；Manus 见 research/11（官方源，前轮已核）。

## 5. 妻子场景适配

- **值得先规划的任务**（判断依据：事前对齐的收益 > 多一步的摩擦）：
  1. **抓数入库**（browser+faucet 写）——裁决书已认定这是卡片疲劳与误操作的真实来源（5-15 卡、误触提交错表单面）；蓝图先行把"要抓什么、写进哪张表、撞了怎么办"在出卡潮之前对齐。
  2. **含歧义的一次性复杂请求**——"把上个月的数据整理一下发我"类：goose plan.md 的"澄清问题"分支正是为此设计；妻子最怕的就是猜错她的意思后返工。
  3. **多步报表新口径**——第一次做某类报表先对齐步骤；已沉淀为 chips/报表卡的固定任务**不进规划**（Cursor docs 同样明示琐碎任务直接执行）。
- **不该规划**：闲聊、单步查询、日常重复报表。
- **过度设计风险**：计划文档对她可能是负担——对齐点：①蓝图必须大白话+短清单（≤7 项，编号，一句一步），禁止表格/术语；②确认交互 = 两个大按钮，不是"请编辑 markdown"；③规划默认**不开启**，靠入口显式触发（她是发起者才有掌控感），不做"系统判断复杂度自动进规划"（Cursor 的自动建议在论坛已有体验投诉）。
- 安全感判据：Manus 官方验证的是"非技术用户接受可编辑蓝图+确认执行"这个**交互形态**；本地实证要靠护航期使用统计（候选指标：规划入口点击率、计划确认后一次成功率 vs 直接执行的返工率——s49 统计口径可挂）。

## 6. P32 解冻设计建议书

### 6.1 三要素推荐路径

| 要素 | 推荐路径 | 依赖 | 成本量级 | 与既有机制复用度 |
|---|---|---|---|---|
| ① 随时可入 | 前端入口（quickchip 或输入区按钮「先出计划」）+ 规划提示词模板（大白话清单写入 ws/计划.md + 澄清问题分支 + "一次写全、其他不动"） | 零新依赖；沿用 s50 用户消息拼接通道 | 小（前端模板+一个按钮；桥零改动） | 高：quickchip/模式体系/权限卡全复用 |
| ② 蓝图可编辑 | 蓝图 = 工作区文件 计划.md（固定名约定）；可选增强第二步 = 确认后 goose 一次 todo_write 转执行清单（执行态每轮自动携带） | 文件树/预览/外开/版本管理全套已在位 | 小（约定级）；增强步=提示词级 | 极高：ADR-0007/0008 全套 |
| ③ 确认后执行 | 确认 = 前端确认条两个大按钮（「就按这个做」发确认文本 /「我要改」）；执行态维持 smart_approve 权限卡，不因确认免卡 | 零新协议（本质重发消息）；按钮可后置到有反馈再做 | 极小（先靠自然对话即可） | 高：s69 审批链原样叠加 |

### 6.2 推荐冻结顺序

**先做①（随时可入）**——它是三要素的公共前置：入口与模板定了，②的落点（模板指定 计划.md）与③的形态（确认=对这份文件的回应）顺势即定，实际落地是一条最短切片（模板+入口+可选确认条）。且①单独上线即有价值：抓数任务的澄清先行直接减少试错卡片与返工。②的"文件落点"随①同片落地（模板一句话）；③的按钮先不做，用自然对话收集一轮真实反馈再决定要不要按钮。todo 转执行清单（②增强）作为独立第二步，等①/②/③有真实使用数据后再裁决。

### 6.3 非目标（明确不做）

1. 不依赖 ACP plan 事件与上游 plan 模式（goose v1.46.0 不发射，何时有 UNVERIFIED；前端 :973 预留点保持现状即可）。
2. 不给模式下拉加第五挡——规划态是任务形态不是会话模式（避免 Cursor 模式状态混乱类缺陷家族；也不与 s69 G1 的默认模式语义纠缠）。
3. 不照抄 goose CLI act-on-plan 语义（清会话历史、全局切 Auto 均与既有裁决冲突，§2.3）。
4. 不做"计划确认=免卡/自动放行"——与权限卡承诺与 G1/G2 安全默认直接冲突。
5. 不做专用结构化计划卡 UI（内测期无数据来源且面积不成比例；重开条件=上游发射 plan 事件或使用统计证明文件形态不够用）。
6. 不重开 summon 做多代理规划（须先补验审批链继承，research/12 遗留3）。
7. 不做规划态定时任务（scheduler 会话硬编码 Auto 无 plan 语义，research/12 §3.1；定时配方铁律已含"登录类任务不得定时"）。

## 7. UNVERIFIED 清单（下一步取证/验证入口）

1. goose 钉的 agent-client-protocol-schema 1.1 与本文引用的 main 分支 v1 规范未逐行 diff（`Plan` 属稳定面预期无差异；升级窗口若上游开始发 plan 事件须重核）。
2. 规划模板的实际行为（smart_approve 下写 计划.md 出卡次数、澄清问题分支对弱模型的触发可靠性）——落地切片需沙盒实景冒烟，弱模型（glm-5.2 级）对"计划 or 澄清问题"二分类的自觉性无本机证据，模板措辞要按实测调。
3. todo_write 在 smart_approve 下是否被 judge 判读为可放行（ask_before 存在则必出卡，§2.2 已按必出卡口径设计——若实测 judge 语义优先则成本更低，属正向偏差）。
4. 妻子侧价值假设（规划降低返工率）属 UNVERIFIED 产品假设，靠护航统计验证，不作为承诺写入 P32 裁决。
