# 裁决书：goose 透明度与破坏性防护（主线4）

- 日期：2026-09-05 ｜ 裁决人：pf-pm ｜ 输入：research/12（pf-researcher 源码级取证）、用户主线点名
- 证据等级：本文引用的机制事实均出自 research/12（VERIFIED-RUN 双臂探针 + VERIFIED-DOC v1.46.0 源码行号）；本裁决新增取证 3 处，行内标注。
- 关联预批：T1/T2/T4/G4/G6/G8 已由主控预批，本文逐项确认或修正；G1/G2/G3/G5/T3 本文裁决。
- 约束重申：零 fork（不二开 goose）、最小 diff、验证优先于扩张、妻子体验第一验收面、与 v0.9.10 已排事项（离线升级 sha256、市场切片 B/C）无耦合可并行。

---

## 0. 归约：妻子真实风险场景 vs 技术完美主义

用户主线原话拆解后是两个诉求：①"设施对 goose 透明度不够"= 我们不知道 goose 实际看到什么、会用什么；②"没有明确限制机制避免破坏性结果"= 深夜定时任务、妻子不看屏时，goose 删错文件/改坏配置/乱出网没人拦。

**妻子的真实风险场景**（按她的三类任务过一遍）：
1. **报表任务**：faucet 查数 → shell 跑 gen-xlsx。破坏面 = shell 命令写错路径。频率：每天。
2. **抓数入库**：browser 操作内网系统（含登录）→ faucet 写入。破坏面 = browser 误触（提交错表单）、faucet 写删错表、shell。频率：每周量级。
3. **定时任务**：无人值守。上游硬编码 Auto + max_turns None（research/12 §3.1）——这是全产品唯一"无人看着 + 全自动放行 + 无轮数上限"的组合，**风险排序第一**。

**不是风险场景的**（防技术完美主义）：dev 机的上下文污染不影响妻子（目标机无 .git 无 AGENTS.md）——但它影响**我们**：此前所有冒烟/e2e 都在被污染上下文里跑，结论外推性存疑，这是工程风险不是用户风险。零 instructions 扩展同理：是模型行为质量问题，不是安全问题。

**取舍主轴**：限制机制的全部代价 = 妻子每任务多点几次"这次可以"。数据点：s47 冒烟已证卡片链路端到端可用且文案是大白话；smart_approve 下纯读路径（faucet_query/describe、read/tree）不出卡，卡集中在写/执行/浏览器——恰好等于"重要操作问我"的字面语义。转义口已有两个：一键「自动干活」下拉、卡片上「以后都允许」。

**结论方向**：默认态从"名义有闸门实际全开"改为"闸门真在工作 + 用户可一键全开"。安全默认 + 体验逃生口，而不是体验默认 + 安全幻觉。

---

## 1. 逐项裁决

### G1 默认模式：✅ 做——桥删 `GOOSE_MODE:'auto'`，回落 config smart_approve

- **改法**：删除 chat-bridge.tpl.js:319 一行（bin/chat-bridge.js 由模板再生成同步）。config 模板第 4 行本就是 `GOOSE_MODE: smart_approve`，零新增配置。
- **为什么是它**：permission.yaml 25 项 ask_before + 未来 never_allow 在 auto 分支根本不被查询（permission_inspector.rs:161-162）。不删这行，G2/G5 全是死代码，permission.yaml 是装饰品。用户要的"明确限制机制"主体就是这行删除。
- **频率评估**（本裁决新增取证：逐项过 ask_before 25 项 × 妻子三场景）：
  - 报表任务：1–3 卡（shell 系）；faucet_query/describe 等纯读不出卡。
  - 抓数任务：5–15 卡（browser_navigate/click/type 每动作一卡）+ 写入卡——**这是卡片疲劳的真实来源**，也是真实风险所在，不裁掉。
  - 缓解：①「以后都允许」按钮（goose user 决策持久化，跨会话生效）；②s31 连续 3 卡提示已在线上；③浏览器涉及登录凭据，恰是最该问人的动作。
- **前端连动：不需要改**（本裁决核实）——下拉值跟随 goose 报告的 currentModeId（chat.tpl.html:522-524 `$('mode').value=cur`），G1 后新装用户自动显示「重要操作问我」，文案与实际模式天然一致。`pf_mode` 仅在用户主动切换时写入（chat.tpl.html:1088），无残留错位。
- **边界声明**：scheduler 定时会话仍硬编码 Auto（scheduler.rs:1029/1066），G1 管不到——零二开纪律下不可改，G4 是定时链路唯一熔断，必须同版落地。
- **风险与回退**：默认行为变更落在妻子真机任务链护航之前。决策依据：用户主线点名 + 机制现缺 + 逃生口一键可达。若护航反馈卡片疲劳超预期：用户侧回退 = 下拉切「自动干活」（持久）；产品侧回退 = 恢复 env 一行（一行 diff）。

### G2 60s 超时方向：✅ 做——allow_once 改 reject_once，不做可配置

- **核心理由是文案一致性**：权限卡对妻子承诺"它不会自己偷偷做。您选了它才动。"（chat.tpl.html:962），60 秒后自动放行直接违背该承诺。G1 之后卡片频率上升，这个"最后一个自动放行口"的暴露面同步放大。
- **两个失败态对比**：无人看屏时——自动拒绝 = 任务停住，卡片在（chat.tpl.html:983 后台提醒已有），妻子回来看到"有个操作等你确认"，可观察、可恢复；自动放行 = 破坏已发生，不可观察、不可逆。内测期验证优先：停住的任务是数据点，放行的破坏是事故。
- **不做可配置**：加设置项 = 设置面板 schema + 桥端点 + 文案 + 测试，面积与收益不成比例；零配置安全默认是产品语义，不是技术限制。重开条件：使用统计 denied 异常高或"任务卡住"负反馈成规模。

### G3 扩展收窄：✅ 做——关停 apps / summon / extensionmanager / analyze，保留 todo

- **场景依赖盘点**（本裁决新增取证：hints 全文、forge/.agents/skills 5 技能、recipes、s47/s53 冒烟链路逐一点名核对）：被点名的 = faucet-db、browser、mcp-fetch、memory、chatrecall、developer（shell/edit/write）、skills、tom。**零点名** = apps、summon、extensionmanager、analyze、todo。
- **逐个裁决**：
  - `summon`：**关，且优先级最高**。delegate 子代理是否继承父会话审批链 UNVERIFIED（research/12 遗留5）——G1 落地后这是唯一潜在的审批绕过面。验证不起就直接关门，这是"不验证就不开放"原则的正用。
  - `extensionmanager`：**关**。agent 自主改自己的能力面 = 自主面；妻子装 MCP 走 🧠 商店（桥 mcpstore 写 config + 重启挂载，s46/s54 已证），不依赖该扩展。连带：permission.yaml 的 `extensionmanager__manage_extensions` 变死项，同车删除（死配置=误读源）。
  - `apps`：**关**。goose 自带 HTML app 沙盒窗口与产品应用注册协议（pc/apps yaml + data/artifacts 制品区）是两套并行叙事，对小白是歧义源；手册教的是注册协议路线。
  - `analyze`：**关**。tree-sitter 代码库索引——妻子场景没有"大型陌生代码库"；省 3–4 把工具 + prompt 说明段。只读工具无风险，关它纯粹是给弱模型减工具选择噪音。
  - `todo`：**留**。零点名但它是 ACP `plan` 事件的语义来源（onAgentEvent 已预留 chat.tpl.html:938），P32 候选"Plan Mode 三要素"以它为底座——砍了 todo 等于预砍 P32 的选项。1–2 把工具的成本买一个未来选项，值。
    - 〔s69 勘误（research/14 取证）：「todo 是 ACP plan 事件的语义来源」失实——v1.46.0 全树零 `SessionUpdate::Plan` 发射点（唯一命中为测试 fixture），todo 与 plan 事件无机械转换。**保留 todo 的裁决不变**（每轮 moim 自动注入的持久清单机制独立成立）；但 P32 不得把 ACP plan 事件当依赖，Plan Mode 设计输入以 research/14 为准。〕
- **净效果**：工具清单 58 → 约 49；移除"自开关扩展/委派子代理/自建 app"三类自主面；tool payload 减约 3–5KB。
- **前置条件**：enabled:false 写法端到端 UNVERIFIED（research/12 §3.3 机制链完整）——落地时先跑双臂探针，再上生产模板。

### G5 never_allow 黑名单：✅ 做一半，改判一半

- `browser__browser_run_code_unsafe` → **never_allow，做**。任意 JS 注入页面执行，无妻子场景合法用途，skills 里零引用。
- `faucet-db__faucet_raw_sql` → **否决 never_allow；改判进 ask_before**。误伤实锤（本裁决新增取证）：scrape-table-to-db 技能三处合法依赖——CREATE TABLE 建表（SKILL.md:27）、入库前清表 DELETE（:45/:63）、批量 INSERT 兜底（:47）。这是妻子核心场景"抓数入库"的骨干技能，never_allow 直接打断。而 raw_sql 当前**既不在 ask_before 也无黑名单**，smart_approve 下全凭 LLM judge 抽签决定问不问——改判后每次出卡，技能照常可用，破坏性 SQL 落入人审。
- `shell` → 不进黑名单（researcher 判断正确）：一切任务骨干，且已在 ask_before，卡片即人审。
- **生效前提**：G1。auto 不读 never_allow——再次说明 G1 是本裁决书的承重墙。

### T3 须知提醒迁 GOOSE_MOIM_MESSAGE_FILE：⛔ 挂起（非本版）

- **机制事实**（本裁决新增取证）：tom.rs:67-73 用 `std::env::var` 读进程级环境变量，**无 config get_param 通道**。桥是单 acp 进程多会话，每会话须知.md 路径不同——进程级注入 = 所有会话共享一条消息（跨会话污染），"每轮写文件再发 prompt" = 并发会话竞态（A 会话的提醒注给 B 会话）。
- 当前用户消息拼接（chat.tpl.html:1004-1011）是**会话作用域内唯一正确的通道**，s50 拆分条件已把"提醒缺席"面收窄到可接受。为权威层级美学引入跨会话污染风险，是负收益重构。
- **重开条件**：上游提供会话级 system 注入通道，或桥架构改为每会话一 acp 进程。届时一并解决"系统约束进系统通道"。

### G4 max_turns=10：✅ 确认 10

- daily-memory-check 实际 2–3 轮（retrieve_memories 一次 + 输出），10 = 3 倍余量，熔断阈值不误伤。手册模板条款同步写两条规则：新配方必须带 `settings.max_turns`（10 起步）；浏览器登录类任务不得做成定时（headless 下登录卡死，且 Auto 模式无人应卡）。

### 预批项确认

| # | 结论 | 备注 |
|---|---|---|
| T1 | ✅ 确认 | goose-config.tpl.yaml 加 `CONTEXT_FILE_NAMES: ['.goosehints']`。附带一个验收项（本裁决新增）：update-runner 的 PROTECTED 清单不含 conf/goose/config/config.yaml → 升级会整份覆盖 → **须核实商店已装 MCP 的 extensions 块升级后是否幸存**（s46"保留 mcp-* 块"只在 bootstrap 路径验证过）。若不幸存，属既有缺陷，另开账不扩本裁决范围，但 T1 验收必须暴露它 |
| T2 | ✅ 确认 | 落点：research/04 goose-upgrade-playbook 第 3 步回归面 + STATE 护航习惯条目。纯文档 |
| T4 | ✅ 确认 | 手册补「你的工具从哪来」一节：工具可在设置面板裁剪、browser/fetch 用途一句话、faucet 纪律已有不重复。零术语 |
| G6 | ✅ 确认 | v1.48 #11477 denial 优先、#10285 工具名规范化对 permission.yaml 前缀命中的影响，挂升级 playbook 第 3 步面 3。G1/G5 的清单在升级后静默失配是真实回归面 |
| G8 | ✅ 确认 | 手册一句"出网约束不靠 agent 自觉，边界在系统层（EDR/防火墙）" + STATE 开放问题接 EDR 审计项。定性准确：egress 恒 LOG-only，机制性不存在白名单 |
| G7 | ✅ 照 researcher 建议 | RepetitionInspector 无上限、SecurityScanner 默认关，产品侧无配置键——记 STATE 上游观察项，v1.50 升级窗口重评。不误导团队以为有熔断/扫描在役 |

---

## 2. 捆绑关系

- **G1 + G2 + G5 = 一组**，同裁决同落地同回归。G1 不落地 → G2/G5 全部无效（auto 不读）；G1 落地而 G2 不动 → 审批链留着 60s 自动放行后门，"重要操作问我"名不副实；G5 不随车 → 黑名单错过同一回归面（升级失配检查、探针验证各做一遍的成本）。
- **G3 + T1 = 一组**（同改 goose-config.tpl.yaml，同需双臂探针 + 生产转储复验；permission.yaml 死项删除依赖 G3）。
- **G4 独立但必须同版**：G1 明示管不到 scheduler（Auto 硬编码），定时链路唯一熔断就是 G4——不同版落地 = 已知无护栏面继续裸奔。
- 与 v0.9.10 已排项（离线升级 sha256、市场切片 B/C）零文件交集，可并行。

---

## 3. 实现切片（预计 4 个）

### S-A 审批链激活（G1+G2+G5，承重切片）
- **改**：chat-bridge.tpl.js:319 删 `GOOSE_MODE: 'auto'` 一行（bin/chat-bridge.js 模板再生成同步）；chat.tpl.html:991-994 超时兜底改选 `reject_once`（文案"（等太久，自动选了 🚫 这次不行）"）；forge/conf/goose/config/permission.yaml：ask_before + `faucet-db__faucet_raw_sql`，never_allow + `browser__browser_run_code_unsafe`。
- **适配**：tools/e2e 探针（e2e-chat.sh / ws-prompt-probe-s50e.js / fuzz-chat.sh 等）目前无 request_permission 处理，G1 后会挂卡超时——探针补"收到 request_permission 自动回 allow"分支（顺带把卡片链路纳入自动化断言）。
- **验收**：沙盒实景——①报表任务出卡→批准→完成（G1 正向证据）；②下拉默认显示「重要操作问我」，切「自动干活」后同类任务零卡（逃生口证据）；③raw_sql 调用出卡；④构造 browser_run_code_unsafe 调用被机制拒绝（denial 返回，非卡片）。
- **回归面**：e2e 45/45、fuzz 44/44、e2e-chat 18 断言、GUI 权限卡实景、定时任务冒烟（应零变化——本就 Auto）。

### S-B 上下文与工具面收窄（G3+T1）
- **改**：goose-config.tpl.yaml 加 `CONTEXT_FILE_NAMES: ['.goosehints']` + extensions 块 apps/summon/extensionmanager/analyze 四个 `enabled: false`；permission.yaml 删 `extensionmanager__manage_extensions` 行（排在 S-A 之后同分支）。
- **验收**：①双臂探针证 enabled:false 端到端生效（关停前/后 session 工具清单对比）；②生产转储复验：Extensions 段 4 项消失、工具清单 58→约49、Project Hints 段为空（T1 生效证据，同时补上"历史冒烟在被污染上下文跑"这笔账的复验）；③MCP 商店安装 fetch-mcp→重启挂载→goose 调用成功（证明商店路径不依赖 extensionmanager）；④T1 附带项：升级后已装 MCP extensions 块幸存性核实。
- **回归面**：e2e 全量、技能唤起冒烟（scrape-table-to-db/skill-sediment 不经被关扩展）、chatrecall/记忆实景。

### S-C 手册与配方（T4+G4+G8+G5 手册面）
- **改**：goose-hints.tpl.md——新增「你的工具从哪来」节（T4）；定时任务节加"配方必须带 settings.max_turns（10 起步）+ 登录类任务不得定时"条款（G4）；出网约束一句（G8）；行为准则"删东西前先问用户"旁补一句"系统会在重要操作时弹卡问你，看到卡请认真看"（G1 的用户侧翻译）。
- **改**：forge/conf/goose/config/recipes/daily-memory-check.yaml 加 `settings: { max_turns: 10 }`。
- **验收**：零术语审读；goose schedule add + 手动触发一次冒烟；配方超限熔断行为留探针（可选）。

### S-D 文档挂账（T2+G6+G7+STATE）
- research/04 升级 playbook 第 3 步：转储巡检法（T2）+ G6 两条升级验收 + G7 上游观察项；STATE 更新（裁决索引、开放问题、护航习惯）。

---

## 4. 否决项（本轮明确不做，含理由）

| 否决 | 理由 |
|---|---|
| G5：faucet_raw_sql 进 never_allow | 误伤实锤：scrape-table-to-db 技能三处合法依赖（SKILL.md:27/45/47/63），妻子核心场景骨干 |
| T3 本版迁移 | 会话作用域缺失（tom.rs 进程级 env），强迁引入跨会话污染/竞态，负收益；重开条件已写明 |
| 60s 超时可配置化 | 设置面面积与收益不成比例；安全默认应是产品语义而非选项 |
| 开启 SECURITY_PROMPT_ENABLED | 误报率与阈值未评估，auto 模式下也不生效；挂 G7 升级窗口一并评 |
| 文件系统沙盒 / 网络白名单 | 机制性不存在（research/12 §3.3-6），自建 = 违反零 fork 纪律；控制面在系统层（G8 定性） |
| shell 进黑名单 | 一切任务骨干，已有人审（ask_before），黑名单等于废掉产品 |
| 用技能/prompt 约束替代 G1 机制闸门 | "删东西前先问用户"在 auto 模式纯靠 LLM 自觉（research/12 §2.6-3），提示词不是限制机制 |

## 5. 遗留与观察

1. scheduler 会话 Auto + 无上限是残留裸奔面（G4 只加轮数熔断）——零二开下已尽，升级窗口重查上游是否放开 scheduler 模式配置。
2. delegate 子代理审批链继承问题因 G3 关停 summon 而失去现实入口，若未来重开 summon 必须先补验（research/12 遗留3）。
3. permissionCards.timeout 计数恒 0（前端超时与手动选择在桥内不可区分）维持现状，S-A 改 reject 后归入 denied 计数，口径漂移记录在案。
4. 护航观察指标：permissionCards.shown/approved/denied 周曲线 + "任务卡住"类反馈关键词——这是 G1/G2 的下一轮输入。
