# PocketForge 主代码资产熵审计（s78）

日期：2026-09-12。方法：只读静态分析 + 行号实证（Node 脚本 tmp/s78-deadcheck.js、tmp/s78-fnmap.js，全部可重跑）。所有 `file:line` 指仓库相对路径。

## 0. 结论先行

1. **任务前提有一处错误**：chat-bridge.tpl.js（3594 行）**不含**前端 HTML/CSS/JS。前端在独立文件 `chat.tpl.html`（2927 行），桥运行时直接读取（forge/conf/templates/chat-bridge.tpl.js:15,1806-1809）。两文件合计 6521 行，熵重心分布：桥后端 3594 行 + 前端 JS 2346 行 + CSS 294 行。
2. **零死代码**：142 个具名函数全部有引用（tmp/s78-deadcheck.js 全量核对）；无注释掉的代码块；仅 1 个有意调试开关（chat-bridge.tpl.js:3280 `PF_EXPLAIN_DEBUG`）。此文件的病不是死代码，是**活代码的重复与巨型函数**。
3. 熵的三大实证：`handleHttp` 单函数 1198 行 41 端点（:1783-2980）；`handleClient` 单函数 450 行（:3116-3565）；POST body 样板复制 17 次、`writeHead(200,json)` 58 次、explain/optimize 两个 ~50 行 SSE 闭包逐行同构。
4. **拆分的安全边界由三条链决定**（见 §5）：bootstrap.ps1 对桥模板是纯字节复制（bootstrap.ps1:176-177）；前端模板不经物化、桥运行时直读；**6 个 e2e 探针对两个模板原文做正则提取**——任何搬移都会让探针显式 NOT FOUND，这是重构的最大隐藏成本。

## 1. 体积与分段地图

### 1.1 chat-bridge.tpl.js（3594 行，142 个具名函数，中文注释 317 行 ≈ 9.9%）

| 行区间 | 功能段 | 行数 | 关键锚点 |
|---|---|---|---|
| 1-16 | 头部 require/常量 | 16 | PAGE=:15, POST_MAX_BYTES=:13 |
| 17-95 | 基础 util + 启动 IIFE×2 | 79 | atomicWrite:42, migrateV3:62, pruneScheduled:80, readJson:95 |
| 96-168 | 使用统计 stats 家族 | 73 | statsBump:120, statsFlushDebounced:140, statsRestore:155 |
| 170-414 | PG 存储层（模式机） | 245 | PG_MIGRATIONS:181, pgStateReconcile:349, pgTryConnect:382, 30s 重探:411 |
| 415-482 | 状态 schema 迁移 + 清理 IIFE | 68 | STATE_SCHEMAS:420, migrateAllState:459, pruneEmptyUploads:474 |
| 484-532 | ws/sid 校验 + 会话元数据 | 49 | wsValidId:484, sidValid:486, sessionMeta:522 |
| 534-569 | VCS（isomorphic-git 包装） | 36 | ig:535, vcsSnapshot:550 |
| 571-587 | provider profiles | 17 | readProviders:573 |
| 589-627 | ACP 子进程 spawn | 39 | spawnAcp:599（env 剥 GOOSE_MODE:617） |
| 629-683 | onAcpData 消息泵 | 55 | reject 语义:637-649, 权限卡统计:655 |
| 685-756 | turn 错误人话化/救援 | 72 | sendTurn:703, rescueSession:737（research/18 断点①区） |
| 758-790 | init + hotRestartProvider | 33 | :778 |
| 792-807 | 升级检查 util | 16 | fetchBufJson:792, cmpVer:800 |
| 808-986 | 技能源读取/同步/翻译 | 179 | readSkillSources:820, ghFetch:843, syncRemoteSkills:965, skillWarmup:984 |
| 988-1120 | 技能列表/原子安装 | 133 | listRemoteSkills:989, installAtomic:1038, installRemoteSkill:1058(63 行) |
| 1122-1306 | MCP 目录 + 市场配置 | 185 | MCP_CATALOG:1126, readMcpCatalog:1142, marketMutate:1238(69 行) |
| 1308-1434 | DB 可见性（faucet） | 127 | faucetCli:1311, faucet 三胞胎:1319/1337/1403, dbOverview:1363, dbTableSchema:1417 |
| 1436-1731 | 诊断报告 | 296 | reportSanitize:1441, 规则区:1583-1596, buildReport:1603(**129 行**) |
| 1733-1781 | preUpgradeBackup | 49 | :1740 |
| **1783-2980** | **handleHttp（41 端点 if-else 链）** | **1198** | 端点起点行号见下 |
| 2982-3037 | HTTP server + 手写 WS 帧协议 | 56 | upgrade:2987, 帧解析:2998-3019, writeFrame:3037 |
| 3039-3114 | 撤回重写（主线5 七步协议） | 76 | rollbackRewrite:3072 |
| **3116-3565** | **handleClient（WS 消息路由）** | **450** | explain_tool:3249-3332, optimize_prompt:3334-3404 |
| 3567-3594 | server error(EADDRINUSE) + listen | 28 | :3567 |

handleHttp 内 41 个端点分发行号（每行即一段）：1806,1810,1811,1848,1858,1862,1871,1889,1962,1988,2012,2021,2034,2059,2074,2091,2124,2159,2295,2353,2371,2452,2514,2578,2627,2633,2661,2667,2676,2696,2728,2753,2772,2804,2828,2859,2900,2915,2945。最大的三段：/api/schedules 2159-2294（136 行）、/api/skillstore 2371-2451（81 行）、/api/update/upload 1889-1961（73 行）。

### 1.2 chat.tpl.html（2927 行）

| 行区间 | 功能段 | 行数 |
|---|---|---|
| 1-6 | head | 6 |
| 7-300 | CSS（单 `<style>` 块） | 294 |
| 302-580 | HTML body | 279 |
| 581-2926 | 前端 JS（单 `<script>` 块，129 个函数，17 个 `sys===` 消息分发分支） | 2346 |

前端无 >80 行的函数（大括号配平法全量测过）——前端熵在总量不在单函数，**优先级低于桥后端**。

## 2. 重复代码（实证）

| 重复模式 | 处数 | 证据行号 | 同构程度 |
|---|---|---|---|
| POST body 累积样板（`chunks=[]/postBytes/req.on('data')…`） | **17** | 1964,2036,2261,2308,2361,2416,2481,2550,2595,2680,2731,2755,2775,2807,2830,2861,2955 | 逐字同构，仅回调不同 |
| `res.writeHead(200,{'content-type':'application/json…})` | **58** | 全 handleHttp/handleClient 分布 | 逐字 |
| SSE 直调闭包（explain_tool vs optimize_prompt） | 2×~50 行 | 3281-3330 vs 3353-3402；SSE 解析循环 3314-3319 vs 3386-3391；400 降级 3307 vs 3379；LRU 3303 vs 3375 | **自注释承认克隆**（:3335 "克隆 explain_tool 骨架"）；差异仅 sysP/载荷/缓存键/max_tokens |
| faucet REST GET 三胞胎 | 3 | faucetRows:1319 / faucetTableInfo:1337 / faucetSample:1403；`rq.on('error',()=>resolve(null))` 三连 1328/1358/1412 | 同构（http.get+超时+静默 null） |
| session/new + rebind + subscribed 帧 | 3 | rescueSession:747-751 / subscribe:3144-3156 / switch_model:3522-3533 | 同构管线（wsSession.set+sessionClients 挂+subscribed 帧） |
| secrets.env 键过滤回写 | 2 | providers 分支 3490-3496 vs save_config 3549-3556 | 同构（读→滤三键→推→atomicWrite） |
| pc.port 读取 + 守护重启 execFile | 2 | 2204-2210 vs 2282-2290 | 同构 |
| S26 上游故障正则**前后端双源** | 2 | 桥:100 vs 前端:1046（注释自认"同款"） | 跨文件重复，改一处漏一处 |
| 嵌套函数 readTitle/driftOf/readIfOk 深埋 /api/schedules 分支内 | — | 2163,2229,2230 | 结构性（应提顶层） |

## 3. 死代码

- **零未引用函数**：142/142 有引用（脚本全量核对，含嵌套函数）。
- **零注释掉的代码块**（匹配 `// const|// if(|// for(|// function|// res.|// ws.` 等 7 种形态，0 命中）。
- 唯一调试残留：chat-bridge.tpl.js:3280 `PF_EXPLAIN_DEBUG` 环境开关——有意保留的诊断出口，非残留。
- 附带发现（非死代码但同族）：`:349 的 stop 通知分支` 被 :709 注释明确标为 goose ACP 模式从不触发的防御性代码——保留合理（防御性收口 busySids:673）。

## 4. 命名与结构熵

- **巨型函数**（>60 行，大括号配平实测）：handleHttp=1198 行、handleClient=450 行、buildReport=129 行、marketMutate=69 行、installRemoteSkill=63 行。
- **深嵌套区**（大括号深度 ≥6）：24 个区间，集中三簇——handleHttp 内联闭包（2193-2211 schedToggle、2601-2616 prompts、2789-2794 ws/delete）、explain/optimize 的 fire() 闭包（3286-3323、3358-3395）、subscribe/switch_model 分支（3144-3161、3522-3531）。
- **单字母/缩写密集区**：explain/optimize 区（t0/o0/i0/stt/ec/ck/um/sysP，:3259-3278）、PG 区（m/tn/okSrc/dbMax/applied）、handleHttp 端点闭包（b/q/rel/st）。缩写有注释索引，可读性损耗真实但可控。
- 中文注释 317 行（9.9%）——注释密度是这个文件的救生素，任何重构**不得丢注释**（大量注释承载裁决出处，如 :690-697 的 research/18 复现记录）。

## 5. 物化链风险（拆分安全边界）

### 5.1 现状机制（全部实证）

1. **桥模板**：bootstrap.ps1:176-177 `ReadAllText(chat-bridge.tpl.js)` → `WriteAllText(bin\chat-bridge.js)`——**纯字节复制，无变量替换**。`__FORGE_ROOT__` 由桥运行时自己替换（:1807）。
2. **前端模板**：**不经 bootstrap 物化**。桥运行时直读 `conf/templates/chat.tpl.html`（:15,1806-1809）。⇒ **拆分/瘦身 chat.tpl.html 零物化链风险**。
3. **update-runner**：bootstrap.ps1 **没有**物化条目；`forge/bin/update-runner.js` 与模板手工双份并存（当前 diff SAME，2026-09-12 核对）。⇒ 改 update-runner.tpl.js **必须手工同步 bin 副本**，否则交付包带旧版（package.sh:22 robocopy 全量复制 forge/，两者都进包）。
4. **gen-xlsx / vision / forge-backup / pg-probe 等**：bootstrap.ps1:168-187 各有独立物化条目（模板→bin）。
5. **package.sh**：无任何模板路径硬编码，robocopy 全量 forge/（tools/package.sh:22）+ 剔除运行时目录（:24-28）。⇒ templates/ 下新增/删除文件**不破坏打包**。
6. **升级器差量**：按相对路径 hash 三分类 applied/added/deleted（update-runner.tpl.js:260-269），PROTECTED 白名单 :70 不含 templates/ 与 bin/。⇒ 拆分后：新文件自动 added 复制；**旧单文件必须从包里删除**（升级器会自动判 deleted 删除）；用户机上 bootstrap 于升级重启时重物化（bootstrap.ps1 与模板同包到达，:176-177 先于 pc 启动）。
7. **运行体**：process-compose.yaml:100-101 起 `bin/chat-bridge.js`（物化产物），物化后 `__dirname`=bin/，`ROOT=..`=forge/，`APP_VERSION` 读 `../VERSION`（:32）——**拆出的子模块必须与主文件同目录复制**，否则 `__dirname` 语义漂移。

### 5.2 拆分风险结论

- **拆 handleHttp 的端点函数到本文件顶层**：零物化链风险（文件仍是单文件）。
- **拆 chat-bridge.tpl.js 为多文件**：bootstrap 需逐文件加物化条目；**6 个探针读单文件原文做正则提取，全部会破**（见 §6）；升级链本身兼容。净评估：**现阶段不建议**，除非先把探针加载方式改为 require 导出。
- **拆 chat.tpl.html（CSS/JS 分文件）**：物化链零风险；但 4 个探针读它原文（§6），且 :1808 的 cache-control/no-cache 语义、`__FORGE_ROOT__` 注入（:1807,html:584）依赖单文件读改——分文件要多条路由。中风险。

## 6. 测试覆盖锚点（重构安全网地图）

### 6.1 模板原文提取型探针（重构=必须同步改锚点）

| 探针 | 读的模板 | 锚定区 |
|---|---|---|
| rescue-guard-probe.js:5 | chat-bridge.tpl.js | sendTurn/rescue 人话与去重（e2e-chat.sh §18b，22ck） |
| sched-drift-probe.js:12 | chat-bridge.tpl.js | driftOf 对账函数（§16，15ck） |
| report-probe-static.js | chat-bridge.tpl.js + chat.tpl.html | 报告规则区（:1583-1596 有 `>>> s64 规则区标记` 供提取；§12，39ck） |
| toolcard-frames-probe.js | chat-bridge.tpl.js + chat.tpl.html | 工具卡双形态 + explain 措辞（§19，25ck） |
| ui-logic-probe.js:14 | chat.tpl.html | 六段 handler + 模态关闭（§14，56ck；断言"恰好一个 inline script 块" ui-logic-probe.js:228） |
| ia-logic-probe.js | chat.tpl.html | 归档分页/空态（§15，7ck） |
| e2e-chat.sh:217-253 内嵌 pf-retry-probe | chat.tpl.html | retry 分支（§14b，10ck） |

这批探针的设计是"模板漂移显式 NOT FOUND，不误报"（ui-logic-probe.js:2）——重构后它们**红得诚实**，但意味着每刀都要跟着改探针。

### 6.2 行为面安全网（不依赖模板原文，重构后照常有效）

- **e2e-chat.sh 纯 HTTP 断言**：healthz/ws/new 幂等/fs/new/rename/upload/vcs log-blob-restore/附件身份/归档护栏/workspaces 形状/search/db/overview/db/_schema(含 405+路径注入+apikey 泄漏)/report 脱敏（§1-§10）。
- **WS 行为探针**：ws-delete-receipt.js（回执先于断连 §11）、ws-close-reclaim.js（extension 进程树回收 §11b）、ws-rollback-probe.js（撤回七步全链 31ck，自建沙箱 FORGE_ROOT）、ws-fuzz-s50h.js、ws-prompt-probe-s50e.js、assert-s50e-neterr.js。
- **配置端点探针**：mcp-catalog-probe.js、skill-sources-probe.js、ia3-tinfo-probe.js、pgstore-*（6 个，PG 对账/P3-4）、preupgrade-backup-probe.js（31ck）、qa3-round3-probe.js、cold-surface-probe.js、badge-esc-probe.js。
- **需 LLM 连通**：sid-reuse-rescue-probe.js（§18，救援链唯一行为验证）。
- fuzz-chat.sh（模糊面）。

**结论**：HTTP 端点与 WS 协议的行为面安全网厚实；模板内逻辑（尤其人话文案、正则、注释锚定的区）依赖提取探针，搬移成本=改探针。

## 7. 重构候选清单（按收益/风险比降序）

### C1. POST body + JSON 响应样板收敛（收益高/风险低）
- **动机**：17 处逐字复制的 body 样板（§2 行号）；58 处 writeHead。预算防线（s50c）逻辑分散 17 处。
- **最小切法**：文件顶层加 `readJsonBody(req, res, cb)`（含 POST_MAX_BYTES 累积断开）与 `json200(res, obj)` 两个助手，逐端点替换。**不动 /api/update/upload**（:1894-1960 有豁免与 .part 唯一化语义）。
- **验证**：e2e-chat.sh 全量 + fuzz-chat.sh + ws-fuzz-s50h.js。
- **风险点**：个别端点 res.writeHead 在 body 读取前（如 :2677 先写头再分支）——替换时保持响应序不变形；探针锚点不在此区，无探针成本。

### C2. faucet REST 三胞胎合并（收益高/风险低）
- **动机**：faucetRows/faucetTableInfo/faucetSample 三函数同构（:1319/:1337/:1403）。
- **最小切法**：`faucetGet(path, port, key, parse)` 一个，三个调用点各 3-5 行。
- **验证**：e2e-chat.sh §8/§9（含 apikey 泄漏断言）+ ia3-tinfo-probe.js。
- **风险点**：ia3-tinfo-probe 锚定 forge_table_info 行为，探针读的是行为不是原文——安全。

### C3. explain/optimize SSE 双胞胎合并（收益高/风险中）
- **动机**：:3335 自注释"克隆 explain_tool 骨架"；两个 ~50 行闭包逐行同构（§2）。
- **最小切法**：提 `llmStreamOnce({host,key,model,maxTokens,sysP,um,onDelta})`→Promise<text>，内置 400 降级/over 抢答防护/SSE 解析；两个 handler 各留 ~20 行（sysP/载荷/缓存/LRU 键各异）。
- **验证**：toolcard-frames-probe.js（25ck——**sysP 文本是静态断言对象，搬移时探针锚点要同步改**）+ 手动 explain/optimize 冒烟（此链无 LLM-free 行为探针）。
- **风险点**：`over` 先置位防旧响应 end 抢答（:3307/:3379）的时序语义；缓存键构造 \0 分隔（:3265/:3345）必须保留差异。

### C4. secrets.env 回写 + pc.port/守护重启样板去重（收益中/风险中低）
- **动机**：:3490-3496 vs :3549-3556 同构；:2204-2210 vs :2282-2290 同构。
- **最小切法**：`writeSecretsFromProvider(act)`、`restartSchedulerDaemon(done)` 各一。
- **验证**：手动设置面板冒烟（providers 保存/切换/删除 + 任务暂停/删除）——**此区无自动化探针**，是安全网空洞，排位因此降。
- **风险点**：providers 分支 split('\n') vs save_config split(/\r?\n/) 的换行容差差异（:3491 vs :3550）——合并须取宽容差并跑真机。

### C5. handleHttp 内三大端点提为顶层函数（收益中/风险中）
- **动机**：handleHttp 1198 行的最大三段：/api/schedules 136 行（:2159-2294，内嵌 schedToggle/readTitle/driftOf/readIfOk 四个嵌套函数）、/api/update/upload 73 行（:1889-1961）、/api/skillstore 81 行（:2371-2451）。
- **最小切法**：`handleSchedules(req,res,url)`、`handleUpdateUpload(req,res,url)`、`handleSkillstore(req,res,url)` 顶层化，handleHttp 分支改一行委托。**不拆文件、不引路由表**。
- **验证**：e2e-chat.sh（schedules 无直接断言——**空洞**；upload 由 fuzz 覆盖）；sched-drift-probe.js 15ck 从模板提取 driftOf——已核实其锚点为函数签名+尾部字面量正则（sched-drift-probe.js:17-19，如 `function driftOf\(j\) \{[\s\S]*?catch \{ return false; \}\n\s*\}`），**不锚缩进/行号**：driftOf/readTitle/readIfOk 整体平移到顶层时探针无需改，只要函数签名与尾部 catch 字面量不动。
- **风险点**：闭包捕获的 `req/res/url` 要变参数；schedToggle 内 `done` 的 writableEnded 门（:2179）语义不能变形。

### C6. 前端 S26 正则双源收敛（收益低/风险低）
- **动机**：桥:100 与 html:1046 同一正则两份，注释自认。
- **最小切法**：不改协议——两处各加互指注释 + 探针钉住两份一致（toolcard-frames-probe 已部分覆盖）；或最小协议化（hello 帧下发），但动协议面不划算。
- **验证**：assert-s50e-neterr.js + s50f-assert.js。

### C7.（远期，前置条件未齐）chat-bridge 多文件拆分
- **动机**：3594 行单文件、6 大功能域边界清晰（§1.1 地图即拆分线）。
- **前置**：6 个模板提取探针改为 require/导出式加载；bootstrap.ps1 物化改目录复制；`__dirname` 语义保持（子模块同目录）。
- **现判**：收益（行数）< 成本（探针改造+物化链+升级演练），**列入观察不做**。

## 8. 「不要动」清单（高风险低收益区）

| 区 | 行号 | 理由 |
|---|---|---|
| WS 帧协议手写实现 | 2987-3037 | 零依赖手写 RFC6455，写对即封版；ws-*/fuzz 探针族钉住；动它无收益 |
| rollbackRewrite 七步手术 | 3039-3114 | 主线5 新鲜手术；ws-rollback-probe 31ck 逐位钉住（B 型截断/对账/tombstone fail-closed）；注释即协议 |
| PG 模式机与对账 | 170-414 | s73 切片2 P3-4 刚修完 max-merge 对账；pgstore 探针族 6 个文件钉住；懒连接/30s 重探/双写时序微妙 |
| onAcpData reject 语义 + 救援管线 | 629-756 | research/18 断点①三次复现的修复区；rescue-guard-probe 22ck + sid-reuse-rescue 探针（需 LLM，回归贵） |
| /api/update/upload 全段 | 1894-1960 | v0.9.8→0.9.9 演练实锤的豁免+PK 魔数+.part 唯一化（wx 独占）；runner 零改动契约（:1894 注释） |
| bootstrap.ps1 config.yaml 合并重建 | 16-30 | s17/s46 用户开关保留 + mcp-* 块追加的正则手术；PROTECTED 链（update-runner:70）与升级后重建依赖它 |
| update-runner PROTECTED + 差量/回滚 | update-runner.tpl.js:70,244-357 | 升级安全核心；改它需要完整升级+回滚演练，收益为零 |
| schedToggle 短命 ACP 子进程 | 2172-2222 | s55 实证"唯一落盘路径"；25s 超时/writableEnded 门/守护重启降级 warn 全是补丁结晶 |
| installAtomic 原子安装 | 1038-1057 | qa P2-2 返工产物（失败旧版完好）；skillstore 本地/远程两调用点共用 |
| migrateV3/pruneScheduled/statsRestore 等启动 IIFE | 62-93,155-168 | 一次性迁移/护栏，带历史标记（.migrated-v3）；动=重放风险 |
| STATE_SCHEMAS 与迁移步骤 | 420-471 | TDZ 注释明示声明顺序敏感（:416,:425）；迁移幂等性依赖步骤字面量 |
| 探针本体 | tools/e2e/* | 正则锚点是设计的一部分；重构模板时只改锚点字符串，不"顺手重构探针" |

## 9. 审计方法附注（可复现）

- 死代码/重复统计：`node tmp/s78-deadcheck.js`（零引用函数、POST 样板、writeHead、secrets 双源、SSE 双胞胎、faucet 三胞胎行号）。
- 巨型函数/嵌套/调试残留：`node tmp/s78-fnmap.js`（大括号配平法，忽略字符串字面量干扰的近似深度）。
- 物化链：bootstrap.ps1 全文精读 + process-compose.yaml:100-109 + package.sh:22-34 + update-runner.tpl.js:70,257-301。
- tpl/bin 双份同步状态：`diff forge/conf/templates/update-runner.tpl.js forge/bin/update-runner.js` = SAME（2026-09-12）；chat-bridge 同法 = SAME。

## 实施收官附注（2026-09-13 s78）
- C1+C2（8f0e6e2 净-109）→ C5+C3（367b57a 净-17）→ C4（f671d4d 净-1）全部落地：桥 3743→3586 行，四大病灶+双源样板全收敛，探针锚点全程零破损。C6 低值不做、C7 多文件拆分维持不做。
- 实施中的审计勘误：C3 收益按薄助手估算偏乐观（裁决出处注释保留义务+settled 门吃掉预算，实删-27 vs 预估-60~70）；「19 处保留 writeHead」经三批验证全部合理。
- 新增教训两条入工作方式：①公共函数签名变更的验证必须覆盖调用面（b4e02d2 位置绑定灾难）；②探针对模板的计数类断言在服务端有自发请求面时不稳健（goose 自拉 /models），改存在性断言。
