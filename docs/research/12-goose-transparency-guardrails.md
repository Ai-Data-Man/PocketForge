# goose v1.46.0 信息透明度与破坏性防护取证（2026-09-05，pf-researcher）

用户主线：goose agent 未必能完美利用桥注入的 hints/技能/MCP/工具；且缺明确限制机制防止破坏性结果（删工作区外文件、破坏配置、失控出网）。本底稿只取证与建议，不改产品代码。

验证状态标注遵循仓库 §3：`VERIFIED-RUN`（本机实测，含日期）/ `VERIFIED-DOC`（官方源码核对，文件:行）/ `UNVERIFIED`。

源码：`tmp/goose-src` = github.com/block/goose tag **v1.46.0**（commit 98c11ce2，2026-08-11），与产品在用二进制 `forge/bin/goose/goose-package/goose.exe --version` = 1.46.0 一致。源码留 tmp/ 不删，主控收尾清理。

---

## 0. 结论（先行）

1. **产品聊天链路自 P12 起实际运行在 goose「auto」模式 = 所有工具调用全自动放行**：桥 spawn `goose acp` 时注入环境变量 `GOOSE_MODE: 'auto'`（chat-bridge.tpl.js:313），而 `Config::get_param` 先读环境变量再读 config.yaml（base.rs:733-738），故 config.yaml 的 `GOOSE_MODE: smart_approve` 被永久压制。permission.yaml 的 25 项 ask_before 清单在 auto 分支**根本不被查询**（permission_inspector.rs:161-162 `Auto => Allow`）。前端仅当用户手动切过模式下拉（localStorage `pf_mode`）时才对每个新会话发 `session/set_mode` 纠正（chat.tpl.html:520-521）。s47 冒烟看到权限卡是因为当时手动切到了 approve 模式（journal s47:13），不代表产品默认态。
2. **auto 模式下五道 inspector 全部不设防**：SecurityInspector 默认关（`SECURITY_PROMPT_ENABLED` 默认 false，security/mod.rs:65-73）；EgressInspector 只记日志恒 Allow（egress_inspector.rs:369-371）；RepetitionInspector 注册时 `new(None)` = 无上限 = 永不放行（agent.rs:748 + tool_monitor.rs:59-63）；AdversaryInspector 需手工放 adversary.md（无）；PermissionInspector 在 auto 分支恒 Allow。developer 的 `shell` 工具 = 无沙盒直跑 cmd（shell.rs:103 `GOOSE_SHELL` 或默认 cmd）。
3. **定时任务会话被上游硬编码 Auto 且无轮数上限**（scheduler.rs:1029/1066 `update_goose_mode(GooseMode::Auto, ...)`；scheduler.rs:1141 `max_turns: None`），产品配方 daily-memory-check.yaml 无 `settings:` 块。定时任务与交互会话是两套安全语义，前者更松。
4. **透明度侧实锤缺口**：4 个 MCP 扩展（browser/faucet-db/mcp-fetch/mcp-sequential-thinking）在 system prompt 的 Extensions 段**零 instructions**（仅工具 schema 有描述）；dev 机器上整份开发仓库 AGENTS.md 作为「Project Hints」进了生产 goose 的 system prompt（cwd 落在 git 仓库内所致），目标机则没有 → dev 与目标机 agent 行为不可比。工具清单无任何预算机制：实测一次真实会话 **58 把工具、44,285 字节工具 payload + 14,508 字符 system prompt**（browser 一族 24 把占 16,960 字节）。

---

## 1. 方法与边界

- 源码核对：v1.46.0 tag 全量 clone（走 127.0.0.1:7890 代理），所有行号出自该树。
- 生产观测：只读解析 `forge/conf/goose/state/logs/llm_request.*.jsonl`（goose 自带 RequestLog，恒开 10 份轮换，providers/utils.rs:216-245；落盘 `<GOOSE_PATH_ROOT>/state/logs/`）。取 2026-09-05 10:55 最新一份，只提取结构（system prompt 全文、工具名与 payload 字节），不引用对话内容。
- 对照实验：隔离 GOOSE_PATH_ROOT（tmp/goose-probe/root-A、root-B），同一 config.yaml（smart_approve），单变量 = 是否注入 env `GOOSE_MODE=auto`，用产品真实二进制 spawn `goose acp` 走 initialize→session/new，读 `currentModeId`。探针脚本 tmp/goose-probe/mode-probe.js 可重跑。
- 排除项：未动运行栈（探针独立 root，零产品进程接触）；未读写 data/ 用户数据（RequestLog 位于 conf/goose/state，只读）；未改任何产品文件；探针未消耗 LLM token（session/new 不触发推理）。goose Desktop 形态未测（产品只用 CLI/acp）。

---

## 2. A 透明度：goose 视角的事实

### 2.1 system prompt 组装链

- 基座模板 `crates/goose/src/prompts/system.md`：身份（AAIF goose）+ Extensions 段 + 一句 Response Guidelines（Markdown）。渲染上下文含 `goose_mode`/`is_autonomous`/`enable_subagents` 等，但 **system.md 模板并不使用这些变量**——auto 模式不会在 prompt 里告诉模型"你在自主模式"（prompt_manager.rs:128-166）。
- 附加段 `# Additional Instructions:` 按键拼接：hints（见 2.2）、skills 技能清单、chat_mode 提示（仅 chat 模式）、moim Turn Context 块（见 2.5）（prompt_manager.rs:168-199 + ops_skills.rs:70-90）。
- 扩展按名字排序保证 prompt 缓存稳定（prompt_manager.rs:118-120）。
- **生产实测**（VERIFIED-RUN，2026-09-05）：system prompt 14,508 字符，结构 = 身份 → `# Turn Context` 使用说明 → `# Extensions`（analyze/apps/browser/chatrecall/developer/extensionmanager/faucet-db/mcp-fetch/mcp-sequential-thinking/memory/skills/summon/todo/tom）→ Response Guidelines → Additional Instructions（Global Hints=产品手册 8,115B .goosehints 全文 → Project Hints=**开发仓库 AGENTS.md 全文**）。

### 2.2 hints 通道（.goosehints / AGENTS.md）

- 查找文件名默认 `[".goosehints", "AGENTS.md"]`，可用 config 键 **`CONTEXT_FILE_NAMES`** 覆盖（load_hints.rs:11-23）。
- Global Hints = `<GOOSE_PATH_ROOT>/config/` 下（即 conf/goose/config/.goosehints，产品手册在这，命中）；另有 `<root>/.agents/AGENTS.md`（load_hints.rs:233-260）。
- Project Hints = **git 根到 cwd 逐层**找 .goosehints/AGENTS.md；无 git 根则只查 cwd（load_hints.rs:187-207, 263-287）。桥 `session/new` 的 `cwd: ROOT` = FORGE_ROOT（chat-bridge.tpl.js:10, 2289）→ dev 机上 find_git_root 上溯到仓库根，**整份开发团队 AGENTS.md（STATE/DECISIONS/git 纪律/角色表）进了生产 agent 上下文**（生产转储 275-339 行实证）。目标机包内无 .git 无 AGENTS.md → 该段为空。
- 子目录 hints：agent 工具调用触到某子目录后，该目录链上的 hints 文件动态补进 prompt（SubdirectoryHintTracker，load_hints.rs:25-113 + prompt_manager.rs:224-232）。
- **无长度预算**：整条链无任何截断/限额。历史实证 = bootstrap.ps1:46-48 记录的 600KB 坏 hints 曾被 goose 照单全收（每轮 system prompt 挤爆）。当前产品手册 8,115 字节。

### 2.3 技能通道

- 发现根（skills/mod.rs:316-342）：`<cwd>/.agents/skills`（产品 5 个技能在此，VERIFIED-RUN）+ `<cwd>/.goose/skills` + `<cwd>/.claude/skills` + **`~/.agents/skills`（用户家目录，全局，产品树之外）** + `<root config>/skills` + `~/.claude/skills` + `~/.config/agents/skills` + 插件目录 + 内置技能（goose-doc-guide 来自内置）。
- 进 prompt 的形式 = 每技能一行 `• name - description`（ops_skills.rs:54-71）；正文靠模型主动调 `load_skill` 工具拉取（skills/client.rs:73-95）。
- **推论**：description 是唯一唤起线索；家目录级技能会静默泄漏进产品 agent（用户若装过 claude/agents 生态技能）。

### 2.4 扩展呈现（工具怎么被看见）

- system prompt 的 Extensions 段只呈现 **扩展名 + MCP initialize 响应里的 `instructions` 字段**（mcp_client.rs:107-109 → extension_manager.rs:1261-1276 → system.md:21-30）。config.yaml 里的 `description` 字段不进 system prompt（只用于扩展管理列表）。
- 工具本身以完整 JSON schema 进请求 `tools` 参数：**无数量/描述长度预算**（全链未见截断逻辑）。生产实测（VERIFIED-RUN）：58 把工具 44,285 字节；browser__* 24 把 16,960 字节（38%）；faucet-db__* 10 把（含 `faucet_raw_sql`）；`shell/edit/write/tree/read_image` 无前缀直呼。
- **零 instructions 扩展**（生产转储实证，VERIFIED-RUN）：`browser`、`faucet-db`、`mcp-fetch`、`mcp-sequential-thinking` 四段只有标题没有说明——模型对它们的一切认知仅来自工具 schema 描述 + 手册 hints。有 instructions 的：analyze/apps/chatrecall/developer/extensionmanager/memory/skills/summon/todo（内置写死，developer/mod.rs:42-62 等）。
- memory 扩展把已存记忆直接附进 system prompt（"Here are the user's currently saved memories"，生产转储 127-131 行），且其内置说明写的存储路径是默认语义（`.goose/memory/`、`~/.config/goose/memory/`），与产品的 junction 收敛（bootstrap.ps1:70）并存的细节要靠 hints 纠正。

### 2.5 每轮注入通道（moim / Turn Context）

- `# Turn Context` 块由 moim.rs 生成（SYSTEM_PROMPT_BLOCK_TEMPLATE，moim.rs:8），每轮注入时间/工作目录/compaction 状态/turn 预算；模型上下文 <32K 才跳过（moim.rs:6,141-143）。
- 产品可用的**系统侧每轮注入通道 = `GOOSE_MOIM_MESSAGE_TEXT` / `GOOSE_MOIM_MESSAGE_FILE` 环境变量**（tom 平台扩展，默认启用；research/04 §便携化机制 6 已档）。桥目前未使用——须知.md 提醒与工作区路径目前靠前端拼进**用户消息文本**（chat.tpl.html:1004-1009），属于"请求内容"而非系统上下文，权威层级更低且可被长对话稀释。

### 2.6 「以为 goose 知道、实际不在它上下文里」缺口清单（源码+生产转储双证）

1. permission.yaml 的 ask_before 25 项——auto 模式下不进任何决策（见 §3），模型也不知道自己"被期望"每步问人。
2. browser/faucet-db/mcp-fetch/mcp-sequential-thinking 的扩展级说明=空；"faucet 引用识别/数据发现纪律"等只存在于 hints，无机制级兜底。
3. 「删东西前先问用户」（手册行为准则）在 auto 模式纯靠 LLM 自觉——机制层无任何对应物。
4. dev 机 Project Hints=开发团队 AGENTS.md：生产 agent 被"同时告知"它是数字员工小 forge 和一个开发仓库的工作契约（读 STATE.md/commit 等）——**dev 冒烟结论与目标机行为系统性不可比**，此前所有 e2e/冒烟都是在被污染上下文里跑的。
5. 目标机上 hints 是唯一手册通道，8KB 常驻每轮；但 gemini/claude 生态家目录技能、用户域 AGENTS.md（若目标机 `<root>/.agents/AGENTS.md` 或家目录出现）同样会被吸收，产品无白名单闸门。
6. hints 的「系统会在每次任务时提醒你先读 须知.md」的承诺由前端用户消息拼接兑现——若消息未含工作区位段（s50 拆分条件）或经重发/队列路径，提醒可能缺席。

### 2.7 任务点名概念的核对结果

- **`lead_tools` 在 v1.46.0 不存在**（全树 grep 无）；"lead-worker" 命名同样不存在。子代理现行形态 = summon 扩展的 `delegate`/`load` 工具（默认启用，summon.rs:576-660），子代理轮数上限默认 **25**，可用 `GOOSE_SUBAGENT_MAX_TURNS` 覆盖（subagent_task_config.rs:9, 49-52）。

---

## 3. B 防护：可用的限制机制与现状

### 3.1 GOOSE_MODE 生效链（本次核心对照实验）

- 解析顺序：**env > config.yaml**（base.rs:733-738 get_param 先 `env::var`）。
- 对照实验（VERIFIED-RUN 2026-09-05，产品真实二进制，隔离 root，tmp/goose-probe/mode-probe.js）：
  - Arm A：env `GOOSE_MODE=auto` + config `smart_approve` → session `currentModeId = auto`
  - Arm B：env 不设 + config `smart_approve` → session `currentModeId = smart_approve`
- 四种模式语义（goose_mode.rs:22-32 + permission_inspector.rs:159-200）：

| 模式 | 语义 | permission.yaml 查询 |
|---|---|---|
| auto | 所有工具自动放行 | 否 |
| approve | 每个工具必问 | 是（user 键优先） |
| smart_approve | 只读标注放行/LLM judge/其余必问 | 是 |
| chat | 禁工具 | 否（工具被跳过） |

- 产品三进程现状：
  - 桥（聊天）：env `GOOSE_MODE:'auto'` 自 P12（ec485be）即存在，v0.9.3 tag 与现行 bin/chat-bridge.js 均确认（VERIFIED-RUN，git show v0.9.3 + grep）。
  - goose-scheduler（pc 托管）：无 GOOSE_MODE env → 用 config smart_approve，**但调度会话创建时被源码硬编码 Auto**（scheduler.rs:1029/1047/1066），config 值无效。
  - 前端：模式下拉四挡（chat.tpl.html:289-293），新装用户 localStorage 无 pf_mode → 保持 goose 报的 auto（"自动干活"）；一旦切过，之后每个新会话订阅时自动 set_mode 回所选值（chat.tpl.html:520-521, 1084-1085）。
- 权限卡超时兜底：**60 秒无应答自动选 allow_once**（chat.tpl.html:943, 990-993「等太久，自动选了 这次可以」）；桥侧统计将该路径与手动放行合并、timeout 计数恒 0（chat-bridge.tpl.js:84）。

### 3.2 五道 inspector 在 auto 模式的实际状态（源码，VERIFIED-DOC）

| Inspector | 注册 | auto 模式行为 | 开关 |
|---|---|---|---|
| Security（提示注入模式扫描） | agent.rs:731 | 默认整体短路返回空（security/mod.rs:81-93） | config `SECURITY_PROMPT_ENABLED`，默认 false |
| Egress（出网目的地记录） | agent.rs:732 | 只 tracing 记录，恒 Allow（egress_inspector.rs:356-377） | 无（恒 LOG-only） |
| Adversary（LLM 复审） | agent.rs:735 | 需手工放置 adversary.md 文件，产品无 | 文件存在性 |
| Permission | agent.rs:741 | `Auto => Allow`（permission_inspector.rs:161-162），ask_before/never_allow 均不读 | 随模式 |
| Repetition（重复调用熔断） | agent.rs:748 | `new(None)` = max_repetitions 无上限 = 永不触发（tool_monitor.rs:59-63） | **无配置键，产品侧不可开** |

### 3.3 可用限制机制总账

1. **模式三挡**（approve/smart_approve/chat）+ permission.yaml `always_allow/ask_before/never_allow` 按工具名（含 `browser__*` 前缀形态）——只在 approve/smart 生效。#11477「denial 优先」修复在 v1.48，升级时回归（research/04 s50 节已档）。`smart_approve` 键实为 judge 缓存语义（research/04 s19 已档，v1.46 permission_inspector.rs:176-190 一致）。
2. **扩展白名单/黑名单 = config.yaml extensions 块**：平台扩展默认开（platform_extensions/mod.rs:40-220 default_enabled），但 ACP 选中时尊重配置否定——`configured_enabled_state(config, name) == Some(false)` 即不装（acp/server.rs:408-412，selected_builtin_extensions）。写法：`extensions: { apps: { type: platform, name: apps, enabled: false } }`。桥/调度器同 root 同 config，一处生效两边收敛。`goose acp` 仅有 `--with-builtin`（增）与 `--enable-scheduler`，无排除旗标（cli.rs:826-841）。〔关停写法的端到端效果 UNVERIFIED——源码链完整但未跑双臂探针；G3 落地时补。〕
3. **配方级限制**：Recipe `settings.goose_provider/goose_model/temperature/max_turns`（recipe/mod.rs:98-110）；调度会话 max_turns 缺省 None=无上限（scheduler.rs:1141）；配方设定后由 ops_maxturns 以 `<turn-budget>N/M</turn-budget>` 注入提示并在超限时收口（ops_maxturns.rs:19-47）。配方还可固定自身扩展集（`Recipe.extensions`，recipe/mod.rs:64；resolve_extensions_for_new_session 优先配方，config/extensions.rs:296-312）。
4. **子代理轮数**：GOOSE_SUBAGENT_MAX_TURNS 默认 25（见 2.7）。
5. **chat 模式**：工具调用被跳过（tool_execution.rs CHAT_MODE_TOOL_SKIPPED_RESPONSE + prompt chat_mode extra）——可作"只聊天"保险挡，前端已有该挡位。
6. **不存在的机制**（防误解，源码全树核对，VERIFIED-DOC）：无工具白/黑名单环境变量（无 GOOSE_TOOL_ALLOW/DENY 类键）；无文件系统沙盒（shell 直跑用户权限 cmd，shell.rs:103-242）；无网络白名单（egress 仅记录，出网控制只能靠系统代理/防火墙层——与 STATE 开放问题 3 的 IE 代理认知互恰）；无上下文字符预算（2.2/2.4）。
7. **提示注入模式扫描器**：`SECURITY_PROMPT_ENABLED=true` 可启用 pattern 扫描（security/patterns.rs），命中且超阈值生成 RequireApproval 卡（security_inspector.rs:22-46）——auto 模式下唯一能"打穿"恒放行的机制，但默认关、阈值与误报未评估。

〔s69 S-A 落地后补（VERIFIED-RUN，commit e5a2f4a）：①`never_allow` 只有写在 permission.yaml 的 `user:` 段才直通 Deny——写在 `smart_approve:` 段（judge 缓存语义）仍出卡；②`PermissionConfig` Deserialize 无 `#[serde(default)]`，`user:` 段缺 `always_allow/ask_before` 任一键即 goose panic 桥 crash-loop（实锤踩中一次）——手改 permission.yaml 必须三键齐写，升级迁移同查（挂 G6 检查面）；③G1 的 `GOOSE_MODE=auto` 有两个注入点（桥 env + conf/process-compose.yaml），桥侧 `delete env.GOOSE_MODE` 兜底对任何未来注入免疫；④enabled:false 关停扩展已双臂探针 VERIFIED-RUN（tmp/goose-probe/ext-probe.js，58→47 把工具），§3.3-2 的 UNVERIFIED 摘除。〕

---

## 4. 建议清单

标注：〔v0.9.10〕= 小改可直接夹带；〔裁决〕= 需 pm/用户拍板（行为/体验变更）；〔P32+/上游〕= 本版做不了。

### 透明补全组（T）

| # | 改什么 | 在哪改 | 预期效果 | 证据等级 |
|---|---|---|---|---|
| T1 | config 模板加 `CONTEXT_FILE_NAMES: ['.goosehints']`，把 AGENTS.md 从 hints 发现中剔除 | forge/conf/templates/goose-config.tpl.yaml（bootstrap 幂等重建自动带出） | dev 机生产 agent 不再吸入开发团队 AGENTS.md，dev/目标机上下文一致，冒烟结论可外推；顺带堵住用户域 AGENTS.md 泄漏面 | 机制 VERIFIED-DOC（load_hints.rs:11-23）；效果〔v0.9.10〕落地后需一次生产转储复验 |
| T2 | 生产请求转储只读巡检纳入护航习惯：`conf/goose/state/logs/llm_request.*.jsonl` 直接看 goose 真实 system prompt/工具清单（恒开、轮换 10 份） | 无代码——写入护航 checklist/升级预案第 3 步回归面 | 升级/装新 MCP 后当场看见"模型实际看到什么"，透明度问题从事后猜变成当场看 | VERIFIED-RUN（本底稿 §2.1 即用此法）〔v0.9.10 仅文档〕 |
| T3 | 须知.md 提醒与工作区路径从「用户消息拼接」迁到 `GOOSE_MOIM_MESSAGE_FILE` 系统级每轮注入（桥 spawn env 或 turn 前 set） | chat-bridge.tpl.js spawnAcp/turn 路径 | 系统约束进系统通道，权威层级与稳定性提高（不被长对话稀释、不依赖消息形态分支）；tom 扩展默认已启用，零新增依赖 | 机制 VERIFIED-DOC（moim.rs + research/04 §6）；〔裁决〕迁移时机与文案归 pm，动桥注入路径非一行 |
| T4 | 手册补一节「你的工具从哪来」：告知 agent 其工具/扩展清单可在设置面板裁剪、faucet/browser 工具详情看 schema 与手册对应节 | goose-hints.tpl.md | 缓解 4 个零 instructions 扩展的语义空洞（faucet 纪律已有，补 browser/fetch 与"扩展可被管理"认知） | VERIFIED-RUN（空 instructions 为实测）〔v0.9.10 文案级〕 |

### 破坏性防护组（G）

| # | 改什么 | 在哪改 | 预期效果 | 证据等级 |
|---|---|---|---|---|
| G1 | 桥 spawn env 删掉 `GOOSE_MODE: 'auto'`（回落 config smart_approve）或显式 'smart_approve'；下拉默认值与文案同步核对 | chat-bridge.tpl.js:313（+bin/chat-bridge.js 同步机制） | 聊天链路获得机制级审批：permission.yaml 25 项 ask_before 真正生效（browser 全家/shell/write/edit/faucet 写删/manage_extensions/TODO），即用户要的"明确限制机制"主体 | 覆盖链 VERIFIED-RUN（双臂探针）；改后行为〔裁决〕——每任务多几次卡片交互，60s 超时兜底仍在（见 G2）；s47 冒烟证明 approve 链路端到端可用 |
| G2 | 权限卡 60s 超时由「自动 allow_once」改为「自动 reject_once」或至少可配置（无人值守安全默认=拒绝） | chat.tpl.html:990-993 | 无人看屏时卡片不再自动放行——G1 之后这是审批链最后一个自动放行口 | VERIFIED-RUN（代码即证）；〔裁决〕安全/体验取舍，pm 拍板 |
| G3 | config 模板关停非必需平台扩展（建议至少 `apps`、`summon`、`extensionmanager`；analyze/todo 留裁决） | forge/conf/templates/goose-config.tpl.yaml extensions 块 | 工具面收窄（预估 58→45±）：减 token 开销，同时移除"agent 自己开关扩展/委托子代理/建 app"三类自主面；extensionmanager 关停后 manage_extensions 不再存在，其审批项自然失效 | 机制 VERIFIED-DOC（acp/server.rs:408-412）；端到端 UNVERIFIED（落地时双臂探针+生产转储复验）；裁哪些〔裁决〕 |
| G4 | 定时配方加轮数上限：现有 daily-memory-check.yaml 与 hints「定时任务」节模板加 `settings: { max_turns: 10 }`（数值裁决），并写明"配方必须带 max_turns 与 pinned extensions" | forge/conf/goose/config/recipes/ + goose-hints.tpl.md + goose-config 无关 | 调度失控熔断：hardcoded Auto 无法改，但轮数上限是配方层可用的唯一硬限制，防循环烧钱/反复写盘 | scheduler.rs:1141 + ops_maxturns.rs VERIFIED-DOC；〔v0.9.10 可直接做，配方文件属 conf 非 data 用户数据〕 |
| G5 | permission.yaml 增补 never_allow 高危项（候选：`faucet-db__faucet_raw_sql`、`browser__browser_run_code_unsafe`、`shell` 不建议禁） | forge/conf/templates/goose-permission 模板（现生产文件 forge/conf/goose/config/permission.yaml 生成链） | G1 落地后 never_allow 即机制级禁令；G1 不落地则此条无效（auto 不读） | 语义 VERIFIED-DOC（permission_inspector.rs:163-169）；〔裁决〕哪些工具进黑名单——raw_sql 可能是合法场景依赖，先查使用统计 |
| G6 | 升级窗口验收项挂账：v1.48 #11477「denial 优先」、#10285 工具名规范化对 permission.yaml 前缀命中的影响，随 research/04 s64 回归五面走 | docs/research/goose-upgrade-playbook.md 第 3 步面 3 | 防 G1/G5 的审批清单在升级后静默失配 | VERIFIED-DOC（research/04 s50/s64）；仅文档〔v0.9.10〕 |
| G7 | RepetitionInspector 无上限、SecurityScanner 默认关：产品侧均无配置键，无法本版开启 → 记上游观察项（升级 v1.50 时核对是否新增配置化开关；顺带评估 SECURITY_PROMPT_ENABLED 在内网浏览器场景的误报率） | STATE backlog | 不误导团队以为已有熔断/扫描在役；升级窗口一次性重评 | VERIFIED-DOC（agent.rs:748, security/mod.rs:71-73）；〔上游/P32〕 |
| G8 | 出网失控防护定性：goose 无网络白名单机制，控制面在系统层（已有 NO_PROXY 注入；EDR/防火墙属目标机课题）→ 写入手册"出网约束不靠 agent 自觉"并在 P32 真机课题里接 EDR 审计项 | goose-hints.tpl.md（一句）+ STATE 开放问题 | 防止"agent 不会乱出网"的错觉；明确边界在系统层不在 goose | VERIFIED-DOC（egress_inspector.rs 恒 LOG）；仅文档〔v0.9.10〕 |

**夹带评估**：v0.9.10 小改可夹带 = T1、T2、T4、G4、G6、G8（全部是模板/文档/配方层，零桥代码）；T3、G1、G2、G3、G5 需设计裁决（涉及行为变更与体验取舍，其中 **G1+G2+G5 是一组**，建议同裁决同落地同回归，避免半套审批链）。

## 5. 遗留 UNVERIFIED 项（下一步取证/验证入口）

1. G3 扩展关停写法端到端（config `enabled:false` → 生产转储里工具消失）——落地时双臂探针。
2. smart_approve 模式下 permission.yaml `browser__browser_click` 前缀名与 v1.46 内部工具名命中（s19 遗留，#10285 前的行为）——沙盒一次 browser 任务即证。
3. delegate 子代理是否继承父会话 mode/审批链（subagent_handler.rs 未逐行核）——若 G1 落地需补验子代理同样被卡。
4. SECURITY_PROMPT_ENABLED 开启后的误报率与性能（若 G7 升级窗口重评）。
5. 本底稿全部源码行号基于 v1.46.0 tag；v1.48/v1.50 升级后须按 playbook 重核（尤其 permission_inspector 与 scheduler 两处）。
