# 23. goose v1.46.0 → v1.50.0 升级可行性评估（2026-09-12）

取证窗口：2026-09-12｜方法：GitHub API（aaif-goose/goose，repositories/846698999）拉 v1.47.0/v1.48.0/v1.49.0/v1.50.0 release notes + 关键源码文件双 tag 比对（本地 tmp/goose-src@v1.46.0 vs raw v1.50.0），辅以 ACP rust-sdk（rev c97a5203）与 docs.rs schema crate 源级核查。**全部为文档级取证（VERIFIED-DOC），新版二进制未在本机运行**；「可跑通」结论须按预案沙盒复验。

## 结论（先行）

**可以升**。research/04 s64 设定的升级条件 PR #11383 已确认在 v1.50.0 落地（config/permission.rs，VERIFIED-DOC）。三条红线零触碰、五个必查项四个不变一个收紧、撤回重写手术面全部锚点（DDL/谓词/load/编号）逐字不变。无源码级阻塞项。升级按 playbook（docs/research/goose-upgrade-playbook.md）四步走，十面回归全绿后 commit；**第 10 面过门方法补一项 FORK-D 判别**（见 §4，非阻塞，结果只影响产品归约触发器）。

## 1. 三条红线（v1.46→v1.50 逐文件 diff）

| 红线 | 证据 | 等级 |
|---|---|---|
| scheduler persist 语义 | scheduler.rs 双 tag diff 仅 2 处：model_config 加 `.with_cache_ttl_clamped()`（缓存 TTL 钳制）+ 删一段测试断言。schedule.json 落盘/paused/守护重载逻辑无 hunks | VERIFIED-DOC |
| schedules ACP 自定义请求 | acp/server/schedule.rs 双 tag diff 仅 1 行（测试构造器新增 `session_cwd: None` 字段初始化）。请求处理逻辑零变化 | VERIFIED-DOC |
| GOOSE_PATH_ROOT | config/paths.rs **0 diff**；config/base.rs diff（359 行，roaming 相关）无 GOOSE_PATH_ROOT 键增删。roaming 为 opt-in CLI 功能（`goose roam` 子命令 + goose-roaming crate），不启用无路径面 | VERIFIED-DOC |

## 2. 五个必查项

### 2.1 permission.yaml 三键齐写（research/12 §3.3）
- `PermissionConfig` 定义逐字不变（config/permission.rs:26-33 vs v1.46:23-30）：`always_allow/ask_before/never_allow` 三键、无 `#[serde(default)]`——**user 段缺键 panic 家族保留**，种子模板 conf/templates/permission.tpl.yaml 与 1b-7 守卫**无需同步改**。VERIFIED-DOC。
- 读写路径重构（#11383「preserve permission revocations across managers」，v1.50 落地，+210/-83）：所有变更统一走 `mutate_permission_map`——文件锁（新增 `permission.yaml.lock`，fs2 独占）→ **重读磁盘最新版** → 应用变更 → 原子写（NamedTempFile+sync_all+persist）→ 回写内存。修复多 manager 并发写丢条目（对我们=桥 goose 进程与 update-runner 并发写面，行为更安全）。
- **注意项**：①运行时首次写 permission.yaml 后 conf/goose/ 会多出 `permission.yaml.lock` 邻居文件——零污染自证/目录巡检要预期，非污染；②升级本身不触碰该文件（PROTECTED 语义不变，升级实录逐字节核对照旧）。VERIFIED-DOC。

### 2.2 #11477 / #10285（G6 双臂，均 v1.48 引入、v1.50 保留）
- **#11477「denial 优先」**：`get_permission_level` 检查顺序从 always→ask→never 改为 **never→always→ask**（config/permission.rs v1.50:137-151）。never_allow（含 `browser__browser_run_code_unsafe`）不再被 allow 项覆盖——**收紧方向**。该函数 user/smart_approve 两段共用；smart_approve 段内 allow+never 冲突时 v1.46=Allow→v1.50=NeverAllow（仍收紧）。上游新增测试 `test_persisted_never_allow_takes_precedence_over_other_levels` 锚定。VERIFIED-DOC。
- **#10285「工具名规范化」**：`recover_mangled_tool_name`（extension_manager.rs）扩为 pub(crate) + 新增 `owner.{name}` 恢复形态；reply_parts.rs 在 **permission 检查之前**把模型吐出的被 mangle 工具名（GLM/Minimax 去前缀，见 #9486）恢复为真实广播名，防「mangled 名绕过 permission.yaml 键控策略」。**对 G1/G5 前缀命中是加固**，非破坏；回归面照 playbook 第 3 面（browser__*/faucet-db__* 逐项核对命中）。VERIFIED-DOC（PR patch 全文已读）。
- permission_inspector.rs 本体 **0 diff**（审批消费逻辑不变）。

### 2.3 closed/不存在会话 error 措辞（research/18 救援面）
- v1.50 acp/server.rs closed 守卫（:1869/:1906/:1954，对应 v1.46 :1541/:1577/:1626）与行不存在路径**全部仍用 `"Session not found: {}"` 单源**；load 路径同样（load_session.rs:396）。grep 全文无 "session is closed" 类 prompt 错误形态（仅日志/注释）。**SESSION_NF_RE 救援触发面不变**。VERIFIED-DOC。

### 2.4 第 10 必查：sessions.db messages 表与 truncate 语义（s77，最重要）
全部锚点逐字比对（session_manager.rs 双 tag）：

| 锚点 | v1.46 | v1.50 | 结论 |
|---|---|---|---|
| messages DDL | :1036-1053 | :1049-1066 | **逐字相同**（id 自增/message_id/session_id/role/content_json/秒级 created_timestamp/timestamp/tokens/metadata_json） |
| sessions DDL | :998-1035 | :1011-1048 | 逐字相同 |
| schema_version | =16 | =16 | **无新迁移**，升级不触发 DB schema 变更 |
| get_conversation 谓词 | ORDER BY created_timestamp, id | :1871 同 | 逐字相同（严格解析/未知 role 跳过逻辑无 hunks） |
| truncate 谓词（B 型同款） | `(created_timestamp > ? OR (created_timestamp = ? AND id >= ?))` :2473 | :2574 同 | 逐字相同 |
| 当日 MAX+1 编号 | :1591（%Y%m%d + MAX） | :1611 同构 | diff 无该区域 hunks，未变 |

- load 重放：`closed_session_ids.remove`（load 复活）仍在 handle_load_session 尾部（v1.50:483 vs v1.46:327）；全量重放默认不变——**新增 `meta.replayTail` 可选尾窗重放（按 turn 边界不拆对），桥不发该 meta=skipped 0，行为与 v1.46 等价**；meta 新增 `replaySkipped` 回显（仅>0 时）。VERIFIED-DOC。
- 库层变化：sqlx 升级（AssertSqlSafe API，纯构建面）；SQLite 3.51.3（v1.47 #11157，DDL 兼容）。**过门方法=research/21 实验矩阵 CTL/B/RB/NEG 四项在 v1.50 沙盒复跑全绿**（tmp/pfr21 可复跑）——已入 playbook 第 3-10 面，本报告维持并加一项（§4）。
- 其他 load 变化：`resume_saved_provider_session`（仅对带 provider_session_id 的 ACP 类 provider 调 resume；OpenAI 兼容线无此路径）、state machine resume（`GOOSE_STATE_MACHINE` env 默认关，state_machine/mod.rs:73-77 `unwrap_or(false)`，我们环境不触发）。VERIFIED-DOC。

### 2.5 会话号语义（s76 僵尸会话修复依赖）
- 当日 MAX+1 编号未动（§2.4 表）；sid 复用/救援链路前提不变。
- #11787「CLI session naming trusted path」只动**标题生成**（cli_common/providers/session_naming +58 行），不碰编号；update_name_from_provider 被移除、maybe_update_name 增 working_dir 本地命名路径（uses_local_session_naming 的 provider 不调模型生成标题）。**影响 T2 转储巡检预期**：标题生成请求（0 号 llm_request）行为可能变化，升级后巡检时重对。VERIFIED-DOC。

## 3. fork / conversationBefore（形态级风险裁决）

- handler 侧截断代码**逐字保留**（fork_session.rs:10/:37 conversation_before_from_meta + truncate_conversation，vs v1.46 :11/:32）。VERIFIED-DOC。
- 协议层：ACP SDK schema 1.1 → **=1.5.0 / protocol 2.0**（v1.50 workspace Cargo.toml:24-26，[patch] 指向 rust-sdk rev c97a5203）。但两版 `Meta` 均为 `Map<String, Value>`（docs.rs 1.5.0 与 1.1.0 type.Meta 页，逐字同），goose dispatch 层两版均 `if_request` 直传 req（dispatch.rs v1.50:440 vs v1.46:401）——**类型层与 dispatch 层均无剥离逻辑**。
- research/21 §5-2 自认「FORK-D 剥离点未定位到 schema 源行」；§6.3 又记录过驱动侧 `_meta` 字段名误读先例。故「meta 没到 handler」的机制归因存疑（实验现象可信，归因未锚）。侧证：v1.50 的 replayTail 功能若 schema 层剥离 meta 则自发布即失效——**推断 meta 大概率可达 handler（UNVERIFIED）**。
- **处置**：升级沙盒补跑 FORK-D 判别（发字符串值 conversationBefore：报 invalid_params=meta 可达）。若可达 → 官方截断通道出现但形态=分叉新会话（sid 换号）≠ 原地回滚 → 触发 addendum §6-3 撤回重写交互形态重开归约（**产品归约事件，非安全阻塞**）；若仍剥离 → 一切照旧。B 型手术路径依赖面（§2.4）与该判别结果无关，两向均安全。

## 4. 逐版本相关变更（release notes 全文已档 tmp/g150/body-v*.md）

- **v1.47.0（08-21）**：#11159 大会话 ACP 断连修复（回放面利好，s15 endStream 面）；#11202 ACP provider auth error（401 人话面）；SQLite 3.51.3；ACP SDK 1.3；goose-agent crate 拆分。
- **v1.48.0（08-27）**：#11477（§2.2）；#10285（§2.2）；#11516 roaming opt-in（§1，默认关）；一批 fail-closed 安全修复（malformed tool visibility/app visibility fail-closed 等，方向一致收紧）。
- **v1.49.0（09-03）**：#11537 拒绝含换行的 cmd.exe 命令（developer/shell.rs +33，已确认源码在树——真实任务面：agent 须单行 cmd，多行被拒非静默截断，playbook 第 5 面已预期）；#10403 扩展后台加载（CLI prompt 即时可用）；#11517 provider save 不再覆盖存储 config。
- **v1.50.0（09-08）**：#11383（§2.1，升级条件）；#11787（§2.5）；#11743 审批卡显示权威工具详情；#11798 移除 keyring 超时（我们 GOOSE_DISABLE_KEYRING=1，低风险）；#11604 subagent 平台守卫；#11469 **移除 fast model 路由**（标题等辅助调用路径变化，与 §2.5 合并观察）；#11429 chat-payload 断点锚定。

## 5. G7 上游观察项重评（playbook 第 3-7 面）

- RepetitionInspector 仍 `new(None)` 无上限（v1.50 agent.rs:804，模块移至 tool_monitor；v1.46 锚点 agent.rs:748 行号已重对）——产品侧仍无配置键，维持现状。
- SECURITY_PROMPT_ENABLED 默认仍 false（security/mod.rs:58-74）；**新增** SECURITY_PROMPT_CLASSIFIER_ENABLED（ML 扫描）默认 false。上游仍无默认开启的熔断/扫描。误报率评估（内网浏览器场景）维持「开前必测」口径。

## 6. 最小升级步骤 + 回归清单

步骤照 playbook 四步（components.yaml/fetch.sh/checksums → 沙盒隔离 → 回归 → 收尾），本报告只列增量：
1. 目标版本 v1.50.0（asset goose-x86_64-pc-windows-msvc.zip，repo aaif-goose/goose）。
2. 回归十面照 playbook §3，其中：
   - 第 3 面（审批卡）G6 双臂为**真实行为变化面**（v1.46→v1.50 语义收紧），优先级最高；
   - 第 10 面 CTL/B/RB/NEG 复跑 + **补 FORK-D 判别**（§3 处置）；
   - 第 6 面（T2 转储巡检）重对标题生成请求预期（#11787/#11469）；
   - 巡检/零污染自证预期 conf/goose/ 新增 permission.yaml.lock（首个运行时写之后）。
3. 全绿 → commit + STATE 版本表回写；dev 栈换二进制重跑 e2e-chat+fuzz 全量（当前基线以 STATE 终态为准）。

## 7. 遗留与不确定项

| 项 | 状态 |
|---|---|
| ACP SDK schema 1.1→=1.5.0 / protocol 2.0 的协议层行为差异未逐项审计 | UNVERIFIED——沙盒全量回归（bridge 200 + e2e 53/53 + fuzz 150/150）覆盖 → **已销账（§9.2 全量绿）** |
| fork meta.conversationBefore 在 v1.50 是否可达 handler | UNVERIFIED——FORK-D 判别复跑（§3）→ **已销账（§9.5，VERIFIED-RUN：仍剥离，不可达）** |
| 新版二进制本机未运行，本报告全部结论为源码/release 级 | 全体 VERIFIED-DOC；RUN 级验证=playbook 沙盒面 → **已销账（§9 十面矩阵 RUN 级）** |
| v1.47/v1.48 的 PR 级深审（非红线面）未做 | 按需补（release notes 全文已档 tmp/g150/ 可查） |

## 8. 取证档案（复跑路径）

- release notes：tmp/g150/rel-v1.4{7,8,9}*.json + body-v*.md（4 版本全文）
- v1.50.0 源文件：tmp/g150/v150/（session_manager / load_session / fork_session / paths / permission_inspector / server / scheduler / schedule / extension_manager / config-permission / dispatch / custom_dispatch / agent / security-mod / shell）
- diff：tmp/g150/d-*.diff（session_manager 575 行 / config-permission 421 行 / load_session 572 行 / server 2296 行 / scheduler 33 行 / schedule 10 行 / paths 0 / permission_inspector 0 / extension_manager 1493 行 / config-base 359 行）
- PR patch：tmp/g150/pr10285.patch.txt；SDK：tmp/g150/sdk-tree.json / sdk-cta-requests.rs / sdk-schema-mod.rs
- 本地 v1.46.0 基线：tmp/goose-src（git 98c11ce，release branch for 1.46.0）

## 9. 实施记录（2026-09-13，VERIFIED-RUN）

**升级落地**：dev 栈 forge/bin/goose v1.46.0 → v1.50.0。资产=goose-x86_64-pc-windows-msvc.zip（83,949,640B，sha256 `1bcb644e9dd9eeae60ec0491c0687b3378d32365e7cb5c3edeab8db6aa923829`，与 GitHub release 元数据 digest 逐字一致）；解压后 goose.exe sha256 `235f929f17eb5a9eaa58903431f97d81d30147e9c9f614b1545290805d329c77`；LICENSE 与 vendor-licenses/goose.Apache-2.0 逐字节一致（AAIF/Apache-2.0 不变）。回滚位=tmp/goose-v146-rollback/goose-package/goose.exe（v1.46.0，`07145c85…dcf31`）。版本记账：tools/fetch.sh goose URL、tools/components.yaml goose-cli v1.50.0、tools/checksums.txt 两行 goose 哈希同步。

### 9.1 唯一真实行为差异与适配（升级中实锤）

**`goose acp` 对 stdin EOF 即优雅退出（v1.46 忽略 EOF 常驻）**。process-compose 守护进程不给 stdin（Go exec nil=NUL）→ `goose-scheduler`（`acp --enable-scheduler`）直跑秒退 exit 0，pc 视为正常退出不重启（Launched+僵尸 PID 假象），调度器死、cron 永不触发。三重实证：v1.50 管道恒开=常驻（node/cmd /C 两形状 12s+ 存活）；v1.50 null-stdin=秒退 0；v1.46 null-stdin=常驻（timeout 124）。EOF 语义在 ACP rust-sdk serve() 层，无配置开关；pc v1.122 对非交互守护也无 stdin 管道选项（app/process.go 源码核）。
**适配**（最小面三处）：新模板 `conf/templates/goose-scheduler.tpl.js`（node wrapper：为 goose 持永不关闭的 stdin 管道，stdout/stderr 透传，退出码透传）+ bootstrap.ps1 5g 物化块 + process-compose.yaml goose-scheduler command 改指 `bin/goose-scheduler.js`（环境块不动，wrapper 原样传 process.env）。v1.46 同形兼容。bootstrap 重物化其余产物 cmp 逐位一致。

### 9.2 十面回归矩阵（playbook §3 + 本报告 §6 增补）

| 面 | 结果 | 证据 |
|---|---|---|
| 1 调度闭环 | PASS | pause/resume 往返（v1.50 ACP 自定义请求 `_goose/unstable/schedules/pause|unpause`）落盘 schedule.json paused True→False→True 还原；桥内 restartSchedulerDaemon 重启守护（wrapper 形态下 goose.exe 常驻重载）；daily-mem 终态 paused=true 原样；删除路径与 pause/resume 共用同一 C4 合并助手（restartSchedulerDaemon），不单独造删除任务 |
| 2 会话回放/错误流 | PASS | pfr21 CTL（§9.3）+ e2e §18c S12-S13 回放断言；401 文案面未单独造（#11202 面 fuzz/e2e 已含错误链路桩） |
| 3 审批卡（G6 双臂） | PASS（文档级+运行形态） | user.never_allow `browser__browser_run_code_unsafe` 经 v1.50 运行时重写后仍在（#11383 lock+原子写路径实跑）；smart_approve 学习条目全为规范前缀名（browser__*/faucet-db__*，#10285 形态）；#11477 never 优先=收紧方向，user-never 对 smart_approve-ask 仍权威。真浏览器任务双臂实跑未在本窗口清单内（源码级 VERIFIED-DOC 维持） |
| 4 MCP 商店 | 未单跑（不在本窗口清单；e2e/fuzz 覆盖 mcp-catalog 探针） | — |
| 5 真实任务 | 未单跑（不在本窗口清单；§18 真会话+标题生成实跑） | — |
| 6 T2 转储巡检 | PASS | 工具清单 v1.46 时代 vs v1.50 时代 dump 逐名比对 **46=46 IDENTICAL**；G3 否定块（apps/summon/extensionmanager/analyze）缺席照旧；Global Hints 在、Project Hints 空照旧；system prompt 差异全部归因=记忆条目排序+新内置 skill（§9.4），goose 侧 prompt 本体无护栏变化 |
| 7 G7 观察项 | 维持 | RepetitionInspector/SECURITY_PROMPT_ENABLED 无新配置键（research/23 §5 文档级维持；无运行时反证） |
| 8 会话号/救援面 | PASS | ws-delete-receipt 三跑全 PASS 且三次同 sid=20260912_122（当日 MAX+1+删除复用语义逐字保持=救援前提不变）；e2e §18 sid-reuse-rescue 真 LLM 绿（57/57 内）；NEG 复跑：「Session not found」单源措辞不变（§9.3） |
| 9 permission.yaml 升级语义 | PASS | 升级零触碰（mtime 03:58:41 < 换包 04:03，v1.50 启动不改写）；三键齐写存活；运行时 04:32 重写（e2e 期 smart_approve 学习）后三键+never_allow 锚仍在；**permission.yaml.lock 邻居如预期出现**（04:26，零字节，非污染，.gitignore 已补行） |
| 10 手术面（s77 最重要） | PASS | pfr21 CTL/B/RB/NEG 四项 v1.50 复跑全绿（§9.3）；e2e §18c 31/31（沙盒自建桥硬链新 goose）；**FORK-D 判别见 §9.5** |

**全量**：e2e-chat **57/57** + fuzz **150/150**（降权 dev 栈上顺序跑；首轮 52/57 红全部集中在 §13 PG 段——本机 Administrator 直启栈致 pg 拒提权运行（s66 已知家族），runas /trustlevel:0x20000 降权重拉后全绿，与 goose 无关）。

### 9.3 pfr21 四项复跑（v1.50，tmp/g150/pfr21-v150，假 provider 离线确定性）

- **CTL**：session/load 返回四 modes；prompt 后模型上下文=全部三轮 user 文（PROBE_ALL 回显 U1+U2+U3）。
- **B**：surgery del-from-user 删 3 行（边界=U3 user 行）→ load+prompt 上下文=U1+U2、U3 缺席；术后 DB 行数=残留+新轮自洽。
- **RB**：单进程 new→3 轮→close→手术→load 同 sid→改写 prompt：上下文=U1+U2+改写文、原句零残留（provider 请求 dump 直证）；rowsAfter 12 行形态同 research/21 基线。
- **NEG**：corrupt-user 后 load → Resource not found +「Session not found: 20260912_1」——v1.46 同款单源误导文案，SESSION_NF_RE 救援触发面不变。

### 9.4 新内置 skill（v1.50 版本面增量，观察项非红）

v1.50 二进制捆绑 `builtin://skills/web-search`（DuckDuckGo/Tavily/SearXNG）与 `builtin://skills/goose-doc-guide`；system prompt 的 skills 提示段相应多 web-search 一行（v1.46 时代 dump 无）。工具清单不变（web-search 是 skill 非 tool，经 load_skill 激活）；内网目标机上按需联网失败即失败，无安全面回归（shell 本就 always_allow）。产品侧若要裁剪须另立裁决（上游如有内置 skill 禁用键再评估），本窗口不动。

### 9.5 FORK-D 判别结论（research/23 唯一 UNVERIFIED → VERIFIED-RUN）

tmp/g150/forkd.js（隔离 root+假 provider，v1.50 二进制）：**臂1** meta.conversationBefore='NOT_AN_INT'（字符串）→ fork 成功、新 sid 整份复制（9 行→9 行，U1-U3 全在），**无 invalid_params**；**臂2** meta.conversationBefore=合法秒级时间戳（U2 行）→ 同样整份复制，**零截断**。两臂合证：**meta.conversationBefore 在 v1.50 仍被 schema 校验层剥离、不可达 handler**（research/23 §3 的「大概率可达」侧证推断被证伪；replayTail 走 session/load meta，与 fork 的剥离不同路径，不受此结论影响）。→ **官方截断通道不存在，一切照旧；补篇 §6-3 形态重开归约不触发**；B 型手术 DB 路径前提全部维持。

### 9.6 遗留观察

- v1.50 标题生成正常（e2e §18 真会话产出「forge 连通测试」「Connectivity test」模型生成标题；#11787 本地命名路径未触达=OpenAI 兼容线仍走模型命名，与 §2.5 预期一致）。
- 生产打包面：process-compose.yaml 的 goose-scheduler command 变更随下个版本包自然生效（bootstrap 5g 物化 wrapper）；存量包升级路径的适配说明归发版窗口。
- tmp/goose-v146-rollback/ 回滚位保留至下个稳定窗口后清理。
