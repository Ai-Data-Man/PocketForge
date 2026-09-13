# 产出物清单与权限授予管理：主流产品对标（P32 设计输入·双题）

日期：2026-09-13。来源=2026-09-13 官方文档一手核对（逐条 URL 见 §C），验证状态按仓库三级制；二手来源单独标注。回答两个开放设计问题：A=「小 forge 给我做过哪些东西」答案页（research/25 §1，P32 候选）；B=「以后都允许」的撤销面（s78e ④，backlog）。本文只给设计输入，不立项；成本档位自定义：S=文案/纯前端小改量级，M=一个面板视图+一个桥端点量级，L=跨组件新状态机制。

## 0. 结论先行

- **A 题**：行业正在收敛到「**账号级、自动汇集的生成物清单页**」——Manus 1.5 Library（"a centralized location for all your generated files and artifacts"）与 ChatGPT Library（find/reuse/download/delete 一页）都是近期新增功能；Claude 消费版是**反面教材**（会话产物须手动 Publish 才进侧边栏清单，未发布只能回原对话翻找）；Replit 走项目容器制+检查点回滚。组织维度主流=**时间倒序+来源任务/会话回链**，没有产品按产出类型硬分组；类型只作辅助筛选。命名主流=**agent 自动命名+用户可改名**，无一产品依赖用户命名。
- **B 题**：「已允许」管理的成熟信息架构有现成双先例——**Chrome 站点设置**（全局默认值+按站点分组清单+单条/整站撤销+授予时点可留「不再问」）面向普通用户，**Google 账号「Third-party apps with account access」**（逐 app 显示权限+接入时长+Remove Access 单键撤销）是「你曾允许过什么」的消费者级一页。开发者侧最完整=Claude Code `/permissions`（Allow/Ask/Deny 三区+每条来源文件标注+即时生效）；**Cursor 无查看/编辑 UI 是反面教材**（forum 实证用户找不到「Always allow」写到了哪）。作用域语义存在分歧：Claude Code/Cursor 的 always=持久落盘，Windsurf 的 MCP always allow=**仅会话内**——「以后都允许」到底多持久必须显式，不能靠用户猜。
- **两个题共同的落地判断**：设计起点已足够充分（本文 §A.4/§B.4），但 **A、B 双触发器均维持不动**（A=真机「找不回」≥2 次；B=真机误允求助≥1 次）；对标结论的作用是把立项后的设计归约起点固定，类比 plan-mode thaw 裁决「重开时设计起点=research/14 §6，不重新归约」。

## A. 产出物管理对标

### A.1 逐产品

**Manus**（全部 VERIFIED-DOC，2026-09-13）：
- Library=账号级生成物集中页：官方原话一句到位——"The new Library provides a centralized location for all your generated files and artifacts, making it easier to organize and access your work"（manus.im/blog/manus-1.5-release）。官方文档未披露 Library 内部组织细节（列表/搜索粒度未写），说明该功能较新、文档滞后。
- 任务终局交付面板：任务结束自动列出全部生成文件、可点击下载——系统提示原文要求 agent 收尾时 "list all files generated in this task"（jlia0 系统提示 gist，一手 prompt+多渠道行为印证）；独立观察同结论 "It always terminates a task with a list of any files it generated, which are clickable buttons"（arxiv 2509.14528）。
- 任务列表筛选器：All tasks / Non-project tasks / Favorites / Scheduled 四维（manus.im/docs/features/projects）——**按任务组织，产出侧挂在任务下**；Projects 文档自认「projects as folders」。
- 找回路径：历史任务 replay/share 页永久可下载产物（"You may download the files Manus produced here: manus.im/share/..."）；Sandbox 轮换时自动恢复 artifacts/上传附件/项目文件（manus.im/blog/manus-sandbox）。
- 对照结论：Manus 的答案页=**Library（跨任务）+任务内交付清单（单任务）双层**，后者靠 agent 收尾话术保证（与我们 hints 义务同族）。

**ChatGPT**（VERIFIED-DOC，2026-09-13）：
- Library=账号级文件集中页："Find, reuse, download, and delete files saved in ChatGPT Library"（help.openai.com/en/articles/20001052，官方 description 原文；多选+Download 按钮）。
- Projects：chats+files+instructions 归一项目；**输出转资产=显式动作**——"Save to project / Add to project sources" 把聊天回复存进项目知识源（help.openai.com/en/articles/10169521）；项目记忆="Working in a project means that ChatGPT won't forget where you left off"（继续上次的入口=侧栏项目列表本身）。
- 组织原则（learn.chatgpt.com/docs/projects，官方新文档站）：项目视图=**Chats 区+Sources 区**两段；「Start a separate chat for each distinct outcome」（一聊天=一成果）；「If the work grows, move it into a project」（单聊→项目是**有机升格**路径）；rename chat 建议短成果名；搜索="find a past chat when you remember a phrase or branch name but not the title"；archive→Settings>Archived chats 可恢复。
- 对照结论：ChatGPT 的找回三件套=**项目（按事聚）/Library（按物聚）/搜索（按词找）**；「继续上次」不靠专门页面，靠项目侧栏+聊天自动命名+改名。

**Claude 消费版**（VERIFIED-DOC，2026-09-13）：
- Projects="self-contained workspaces with their own chat histories and knowledge bases"（support.claude.com/en/articles/9517075），侧栏项目列表即继续入口；**官方文档未提供项目级 artifacts 清单**。
- Artifacts 侧边栏页（claude.ai/artifacts）=账号级「全部作品」页，但**关键限制：会话产物不自动进清单，必须打开该 artifact 点 Publish 才收录**——"Artifacts you create in a conversation don't appear in your sidebar automatically"，未发布的只能回原对话找（support.claude.com/en/articles/9487310）。版本历史=artifact 内版本选择器切换；unpublish=永久删存储数据。
- 对照结论：Claude 是「半自动清单」反面教材——**要求非技术用户记得手动 Publish 才有答案页，等于没有答案页**。我们若做清单必须自动收录（建时落账），不能依赖用户动作。

**Replit**（VERIFIED-DOC，2026-09-13）：
- 产出容器=项目：「web apps, mobile apps, slides, and videos sharing the same backend」，publish 整体上线（docs.replit.com/features/agent/overview）——不做跨项目资产页，做**单容器内多制品**。
- 检查点=状态快照嵌对话流：四类时机自动创建（feature completion / major milestones / stable states / error recovery）；入口三处（Agent tab 带描述与回滚选项、Git 面板视为 commits、聊天内历史图标=完整时间轴）；回滚恢复文件+对话上下文+配置+环境，**数据库默认不动**（需显式勾选），确认对话框预先列影响面；已删项目 3 天内可恢复（docs.replit.com/features/version-control/checkpoints-and-rollbacks + support.replit.com）。
- 对照结论：Replit 的独特贡献=**「状态变更与对话位置绑定」**（checkpoint 标记长在 Agent 对话流里，找回=翻到那条消息）——对我们权限卡/产出卡同构：对话流本身是时间轴。

### A.2 通用发现

1. **命名**：全部四家=agent 自动命名+用户改名兜底（ChatGPT 聊天自动命名+rename、Claude/Manus 任务自动命名、Manus 连交付清单都是 agent 收尾自动汇总）。无一家依赖用户命名。命名质量不稳是行业常态，所以 rename 是标配。我们的 R4「建时落人话说明元数据、UI 只消费不猜」与主流同构且更严（元数据优先于 LLM 事后补名）。
2. **时间线组织**：主流=时间倒序+**来源（任务/聊天）回链**；类型只作辅助筛选（Manus 任务四维筛选、ChatGPT Library 排序）。按类型硬分组无先例——类型是检索维度不是组织维度。
3. **找回动作三件套**：打开/预览、下载/导出、（Replit 独有）回滚。删除入口普遍在清单页有但非首屏重点。
4. **答案页成熟度谱系**：自动汇集（Manus Library/ChatGPT Library，2026 新趋势）> 项目容器制（Replit）> 半自动（Claude 须 Publish）> 无（多数长尾产品）。我们的三源散落≈谱系最右端，但已有全部原料（db 清单/xlsx 工作区/技能商店+@引用人话分组）。

### A.3 与 PocketForge 的差距

- 已有（VERIFIED-RUN，s78 主线）：数据表清单（管理面板，带搜索分页）、@引用人话分组、制品工作区文件树、技能商店、删除二次确认、agent 主动告知 db 路径。**缺的只是跨三源聚合视图**——与 Manus「文档滞后但机制明确」正相反，我们是机制分散但每源已合规。
- 差距本质：妻子问「它给我做过哪些东西」时，答案分散在三个面板的三个动词里；对标证明行业答案=一页时间倒序+来源回链。

### A.4 设计输入：「它做过的东西」清单视图

- **分组维度**：不做按类型分组（无先例+R2 已禁强造分组）。主组织=**时间倒序单一清单**；类型（表/文件/技能/定时任务）做**筛选 chips**（对标 Manus 任务筛选器），规模到 100+ 且有天然边界时才升分组（按会话）。
- **每条字段最小集**：人话名（R4 元数据，缺失走结构性事实兜底）+类型徽章+来源会话（点回跳，对标 Replit 对话流定位+ChatGPT Library 来源）+时间。不显示物理路径（零术语纪律；路径放展开详情）。
- **找回动作**：打开（跳转各域现有详情/预览）+「去当时对话看看」（跳回来源会话——行业最强的找回模式是把物锚回事）。删除不在本页（各域已有删除，R1 禁同类动作双入口）。
- **规模阶梯**：直接套 R2——护航期声明 <100 条 → 31-100 档=分页（卡片 12）+搜索；类型 chips 兼作 >100 档的分组预备。
- **收录机制**：建时自动落账（数据管线义务，R4 同源），**禁止 Claude 式「用户手动收藏才进清单」**。

### A.5 建议（A1-A5）

| # | 改哪 | 为什么 | 成本 | P32 判定 |
|---|---|---|---|---|
| A1 | 管理面板新增「它做过的东西」tab：三源只读聚合（数据表+xlsx 制品+已装技能，定时任务暂并入或第四源） | 行业收敛方向+我们缺的只是聚合层；放管理面板因 R3「改了它去哪看效果」——东西都从对话产出，但清单是全局资产域 | M | **触发器命中后直接进 P32，设计起点=§A.4，不重新归约** |
| A2 | 每条=人话名+类型徽章+来源会话回链+时间；搜索+分页按 R2 31-100 档 | 时间倒序+来源回链=行业验证的组织维度；来源回链是「找不回」的直接解药 | M（并入 A1） | 同 A1 |
| A3 | 收录=建时自动落账（扩展 R4 元数据管线到制品/技能域） | Claude 反面教材：依赖用户手动动作的清单=没有清单 | S-M（管线已有 db 表说明先例） | 随 A1；**落账纪律可先行写入 hints/验收面（0 成本）** |
| A4 | 类型筛选 chips（非分组）；>100 且按会话有天然边界时再升分组 | R2 阶梯合规+无产品按类型硬分组 | S | 随 A1 |
| A5 | 不做：跨源统一删除、产物版本回滚（Replit 式 checkpoint）、跨设备 Library | 删除各域已有；回滚是 L 级且护航期无消费证据（与 s78 健康探测裁决同逻辑：无消费者场景的机制=浪费） | — | **防扩张清单，进 P32 审查依据** |

## B. 权限授予管理对标

### B.1 逐产品

**Claude Code**（VERIFIED-DOC，2026-09-13，code.claude.com/docs/en/permissions）：
- `/permissions` 对话框=最完整形态：列出**全部规则+每条来源 settings 文件**；Allow/Ask/Deny 三区清单；评估序 deny→ask→allow 首条匹配生效；增删规则"applies the change starting with Claude's next tool call in the same turn"（即改即生效）。
- 「don't ask again」持久规则落 `.claude/settings.local.json`；文件编辑类批准**会话级不落盘**（"it lasts until the session ends"）——作用域分层显式。
- 规则语法 `Tool(specifier)`（如 `Bash(git *)`、`mcp__puppeteer__puppeteer_navigate`）。撤销=删规则（UI 或文件二选一，同一真相源）。

**Cursor**（VERIFIED-DOC，2026-09-13，cursor.com/docs/agent/security/run-modes）：
- Run Modes 三档：Auto-review（默认，白名单直通+沙箱+分类器）/Allowlist/Run Everything；Ask Every Time 已弃用。
- allowlist 落 `~/.cursor/permissions.json`+项目级双文件，`autoRun.allow_instructions/block_instructions` 为**自然语言句子**；**官方文档无查看/删除已允许条目的 UI**（只说改 JSON 或让 agent 改）。forum 实证（二手，forum.cursor.com/t/167877、t/160343）：「Always allow」永久放行且写入位置（全局 vs 项目）连用户都定位不到。
- 对照结论：**作用域分级好但可见性差=我们的现状对标**——我们有 yaml 真相源+手册人话引导，比 Cursor 多一层（agent 可代管），但同样无 UI。

**Windsurf**（VERIFIED-DOC+二手混合，2026-09-13，docs.devin.ai/windsurf/*）：
- Settings→Cascade 面板：命令自动执行级别（Off/Auto/Turbo；企业策略档 Disabled/Allowlist only/Auto/Turbo，docs.devin.ai/windsurf/plugins/guide-for-admins + cascade-overview）+allow/deny 命令清单（Wave 1 官方博客）——**级别选择与清单管理在同一设置面板**。
- MCP 审批卡 Allow once/**Always allow=仅本会话有效**（二手：Hygraph 文档描述）；Devin Local Agent 把「Always Allow 跨会话持久化」当新功能进 changelog——**「总是允许」的持久性是新产品的显式决策点，不是默认常识**。
- 另有对话流回滚（原 prompt 悬停 revert 箭头），与权限无关但同属「反悔面」。

**Chrome 站点设置**（VERIFIED-DOC，2026-09-13，support.google.com/chrome/answer/3270600 正文+搜索核实）：
- 两级信息架构：**全局默认**（设置→隐私→网站设置→逐权限类别默认值）+**按站点分组清单**（「不允许/允许」两区+`chrome://settings/content/all` 全站清单可整站删除权限+数据）。
- 单站点页：逐权限改+**「重置权限」一键回默认**；入口=地址栏 tune 图标→网站设置（lock 图标已废弃，Chromium blog 2023-05）。
- 授予时点：权限卡除「允许/禁止」外有**「不允许网站再次询问」**选项——卡上即含作用域决策，与我们 ACP 四选项（allow_always/allow_once/reject_once/reject_always，research/04 §s19 已核）同构。
- 无痕窗口权限单独记账（会话级作用域的浏览器版）。

**Google 账号第三方访问页**（二手多源交叉一致：Google 支持社区官方引导+Wired+多家指南；主支持页正文未直核，标二手）：
- Security→「Third-party apps with account access」→Manage third-party access：**逐 app 显示授了什么权限+接入时长+单键 Remove Access**；Security Checkup 主动引导定期审阅。这是「面向普通用户的一页『你曾允许过什么』」的最佳消费者级先例——字段极简（谁/什么权限/多久了/撤销）。

### B.2 通用发现

1. **双入口铁律**：授予发生在流程内（审批卡/权限弹窗），管理发生在设置域（面板/对话框）；两处看同一真相源（Claude Code 卡与 /permissions 同一份 settings；Chrome 卡与站点设置同一注册表）。无产品只在卡上授予而无管理面（Cursor 例外=反面教材）。
2. **单条撤销是最小完备动作**：所有成熟产品都有「单条移除/重置为默认」；批量操作无先例（Chrome 整站删除是按来源分组的结果，不是批量管理）。
3. **作用域语义显式化**：一次/总是/永不三态在授予时点就分开（ACP 四选项、Chrome「不再询问」）；持久 vs 会话的差别要么显式（Claude Code 文件批准会话级）要么成坑（Windsurf vs Cursor 语义不同，用户无从得知）。
4. **解释性字段**：Claude Code 标来源文件、Google 标接入时长——「这条允许是哪来的/多久了」是信任必需字段。

### B.3 与 PocketForge 的差距（permission.yaml 映射）

| goose permission.yaml 结构（v1.50，research/23 已核） | 面板语义 | 面向妻子是否展示 |
|---|---|---|
| `user.always_allow` | 她点过「以后都允许」的直通清单 | **是（面板主体）** |
| `user.never_allow`（种子防护如 browser_run_code_unsafe） | 我们预置的拒绝 | 只读或折叠（#11477 never 优先=有效裁决权威，见 B.5-B3） |
| `user.ask_before` | 显式配置的必问 | 可并入只读区 |
| `smart_approve.*`（两键） | **LLM judge 缓存，非用户意图** | **否**——展示机器缓存=误导（诚实性；Claude Code 展示全部是因为受众能读懂来源标注） |
- 现状：手册人话引导（agent 可自改 yaml）=「让 agent 当管理面」，功能可用但依赖会话存活；撤销 UI 无。v1.50 #11383 文件锁+原子写已为外部撤销写入提供安全底（#11477/#10285 一并让键控语义收紧）。
- **UNVERIFIED（落地前必验）**：桥/外部进程改写 permission.yaml 后，运行中 goose 进程是否热感知重读（#11383 的重读路径是 goose 自身 mutate 触发；外部改文件的行为未证）——若不热感知，撤销动作需走「改文件+下次会话生效」文案或 goose 原生通道。

### B.4 设计输入：「已允许操作」面板最小形态

- **放哪**：管理面板（或设置区）新 tab，与技能/MCP 同层（R3：权限是全局配置域，效果在审批卡——面板与卡是 Chrome 式双入口）。审批卡上预留「管理已允许」链接（S 级，后置）。
- **列表字段**（对标 Google 三件+Claude Code 来源）：工具名→R4 人话解释（来自扩展/工具元数据，不猜）+来源扩展名+授予时间（若 yaml 不记时间则首版省略，**不编造**）。规模预期 <20 条 → R2 的 0-8/9-30 档，直接列+带搜索即合规。
- **单条撤销动作**：一条=「恢复每次询问」（从 `user.always_allow` 删条目；语义=回到必问，不是加入 never）。有确认无批量。
- **只读区**（折叠）：`never_allow` 防护清单以人话展示（「这些永远不会被允许」）——对照 Chrome「不允许」区，让妻子知道拒绝也是被管理的。
- **有效裁决展示义务**：同工具若 never 与 always 并存，显示生效结果（#11477 never 优先），不并排展示两个矛盾键。

### B.5 建议（B1-B5）

| # | 改哪 | 为什么 | 成本 | P32/触发器判定 |
|---|---|---|---|---|
| B1 | 「已允许」只读清单+单条「恢复每次询问」：读 permission.yaml user 段渲染，撤销=删 allow 条目 | 双入口铁律（授予在卡、管理在面板）；单条撤销=最小完备动作；Google/Chrome 双先例 | M（含 UNVERIFIED 项验证：外部改写热感知） | **触发器维持（真机误允求助≥1 次）**；命中后设计起点=§B.4 |
| B2 | 先核权限卡选项文案：ACP 四选项（含「仅这一次」）是否全部以人话呈现 | 作用域显式化是零成本收益；若卡上只有「以后都允许」没有「仅这一次」，误允率直接放大 | S（核对+文案） | **可立即做（非 P32 依赖，属既有卡文案核查）** |
| B3 | 面板只展示 user 段+有效裁决（#11477 优先序），smart_approve 段永不出现在妻子视野 | 机器缓存≠用户意图；展示即误导（误导性安慰比零信号更糟，s78 教训 13） | S（并入 B1） | 随 B1 |
| B4 | 授予时间戳：若落账成本低（桥在写 yaml 时同步记 sidecar）则加，否则首版省略 | Google「接入多久了」是信任字段；但 goose yaml 无时间字段，sidecar=新状态文件须过 ADR-0009 schema 纪律 | S-M | 随 B1，可降级省略 |
| B5 | 不做：批量撤销、never_allow 编辑 UI、smart_approve 清单展示、撤销历史 | 防护键给编辑面=把安全底交还给非技术用户；批量无先例；触发器未命中前一切从简 | — | **防扩张清单** |

## C. 来源与验证等级

| 来源 | 等级 | 核对日期 |
|---|---|---|
| manus.im/blog/manus-1.5-release（Library 定义原话） | VERIFIED-DOC | 2026-09-13 |
| manus.im/docs/features/projects（任务筛选/知识库/文件夹比喻） | VERIFIED-DOC | 2026-09-13 |
| manus.im/blog/manus-sandbox（artifacts 自动恢复）；jlia0 系统提示 gist（任务收尾文件清单+share 下载）；arxiv 2509.14528（终局交付面板行为观察） | VERIFIED-DOC（gist/arxiv=一手 prompt/观察转述） | 2026-09-13 |
| help.openai.com/en/articles/20001052（Library：find/reuse/download/delete）；/articles/10169521（Save to project） | VERIFIED-DOC | 2026-09-13 |
| learn.chatgpt.com/docs/projects（Chats+Sources 两区/一聊一成果/搜索文案/archive） | VERIFIED-DOC（官方新文档站） | 2026-09-13 |
| support.claude.com/en/articles/9517075（Projects）；/articles/9487310（Artifacts 侧边栏须 Publish 才收录/版本选择器/unpublish 永删） | VERIFIED-DOC | 2026-09-13 |
| docs.replit.com/features/version-control/checkpoints-and-rollbacks（四时机/三入口/回滚范围/库默认不动）；/features/agent/overview（多制品共享后端）；support.replit.com（删站 3 天恢复） | VERIFIED-DOC | 2026-09-13 |
| code.claude.com/docs/en/permissions（/permissions 三区+来源标注+即时生效/模式族/settings.local.json/会话级批准） | VERIFIED-DOC | 2026-09-13 |
| cursor.com/docs/agent/security/run-modes（三模式/permissions.json 结构/无 UI）；forum.cursor.com/t/167877、t/160343（Always allow 行为实证） | VERIFIED-DOC + 二手（forum） | 2026-09-13 |
| docs.devin.ai/windsurf/plugins/guide-for-admins + cascade-overview（自动执行级别）；devin.ai/blog/windsurf-wave-1（allow/deny 清单）；Hygraph 文档（MCP always allow=会话级）；docs.devin.ai/desktop/changelog（Devin always-allow 持久化为新功能） | VERIFIED-DOC + 二手（Hygraph） | 2026-09-13 |
| support.google.com/chrome/answer/3270600（两级 IA/单站重置/无痕单独授权）；blog.chromium.org/2023/05/an-update-on-lock-icon.html（tune 图标）；chrome://settings/content/all（全站清单，搜索核实） | VERIFIED-DOC | 2026-09-13 |
| Google 账号「Third-party apps with account access」（支持社区引导+Wired+多指南交叉，主支持页正文未直核） | **二手多源交叉（降级采用）** | 2026-09-13 |
| 内部：research/25 §1、research/04（ACP 四选项）、research/23（v1.50 三键/锁/never 优先/前缀规范化）、AGENTS.md §7 R1-R4、STATE.md s78 挂账④ | 仓库既有验证等级（多为 VERIFIED-RUN/DOC） | — |

### 遗留 UNVERIFIED（不阻塞设计，阻塞实现方案）

1. 桥/外部进程改写 permission.yaml 后运行中 goose 是否热感知重读（决定 B1 撤销的生效时机文案）。
2. ~~我方权限卡当前实际渲染的按钮集合（B2 核查对象，本机一验即知）~~ → **VERIFIED-RUN（2026-09-13，s79 批 B2 关项，结论=是无需修）**：隔离真 goose v1.50（假 provider+产品 permission.yaml，s78d loadskill 同法）捕获真 request_permission 帧=恰四选项 allow_always/allow_once/reject_once/reject_always（optionId=kind，goose server.rs:1271-1278 构造面源码同证）；前端权限卡分支（chat.tpl.html 原文提取）喂真帧=四按钮全人话（✅ 这次可以/✅ 以后都允许/🚫 这次不行/🚫 以后都别问）零英文回退、逐个可点各回发 acp_reply 携对应 optionId+callId、60s 超时自动「这次不行」（reject_once）。证据：tmp/b2-perm/b2-perm-card-probe.js 10/10 + perm-frame.json 留档。
3. Manus Library 内部组织细节（搜索/分组粒度），官方文档未披露；不影响设计输入（我们已有更明确的信息架构规范）。
