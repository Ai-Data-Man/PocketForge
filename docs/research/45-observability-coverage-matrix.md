# 45 · 观测性环节覆盖矩阵与缺口清单

日期：2026-09-25（s103/r2）｜方法：全链读桥代码（chat-bridge.tpl.js 5345 行）+ 盘上实证 + 受控探针
环境：dev 栈运行中（healthz 200，桥 8790，pc 8099，faucet 8092；桥 14:39 启动至今）

事实分级：**VERIFIED-DOC** = 代码结论（附行号，行号基于当前 forge/conf/templates/chat-bridge.tpl.js）；**VERIFIED-RUN** = 本机盘上/命令实证（附采样）。

---

## 0. 结论先行

1. **六类通道里只有两三类真正承载"环节级"信息，且没有一条能回答"这次操作发生了什么"**。留痕主力是日聚合计数（statsBump，只有次数没有内容）与会话正文库（sessions.db，goose 写、报告不读正文）；事件日志通道（console.log→pc.log）被冲刷时机腰斩。
2. **用户点名的 test_model / list_models 零留痕已双重实锤**：代码无任何日志/计数（VERIFIED-DOC :5038-5089），受控探针实测两个操作执行后 llmproxy.log / pc.log / 当日 stats 文件 mtime+size 全部不变（VERIFIED-RUN，tmp/s103-r2-probes/ws-zero-trace-probe.js）。
3. **比零留痕更大的缺口：LLM 请求主路径（非别名/官方参数路线）在生产中静默**。本机 2026-09-25 有 6 笔真实 LLM 请求（usage_ledger 实证），llmproxy.log 最后一条停在 09-22——非别名请求一笔都不记，别名请求也只记 effort+model、无耗时/状态码/错误体。
4. **📮 报告读的是最弱的通道组合**：pc.log 尾部（受冲刷时机限制，当前落后 ring buffer、8 小时无新行）+ 日计数 JSON + 配置快照。报告能答"环境是否健康、7 天错误总数"，答不了"你刚才那次操作（测试/拉取/切换/慢请求）发生了什么"——因为这些环节根本没留痕。

---

## 1. 留痕通道清单（VERIFIED-RUN 逐个看过盘上文件）

### 1.1 data/logs/ 下产品通道（谁写、何时、格式）

| 文件 | 写入者 | 时机 | 格式与采样 | 进报告? |
|---|---|---|---|---|
| `pc.log` | process-compose 聚合（conf/process-compose.yaml:2） | 各进程 stdout/stderr，**冲刷受 pc 缓冲策略限制**（ring buffer 先行，s98 记忆：进程退出才冲刷；实测落后 ring buffer ≥5 行，8.9MB/10MB 上限，轮转 10MB×3 gz） | `{"level","process","replica","message"}` JSON 行；尾部大量 faucet 探活噪音 | 是（尾部 300 行，滤 healthz） |
| `backup.log` | daily-backup 进程（pc log_location，yaml:73） | 每日 06:39 | `pg_dump ok: ... kept=3` / `backup ok: ...`（采样实证 09-25 06:39 三行） | 是（尾部 30 行） |
| `pg.log` | postgres（yaml:98） | — | 当前 0 字节（pg 本身几乎不往 stdout 写） | 否 |
| `pg-init.log` | bin/pg-init.cmd:6-8 | 首启 initdb | 重定向文本 | 否 |
| `llmproxy.log` | 桥 appendFileSync（:3490） | **仅别名翻译请求** | `ISO时间 effort=xx model=xx fast=xx`，无耗时/状态码/错误体；最后一条 2026-09-22 | **否** |
| `update-runner.log` | update-runner.js:29-31 | 升级全程 | `时间 stage/FAILED`（采样：`UPGRADE FAILED@starting: 暂存包不存在`） | 否（报告只带 status.json 一行） |
| `register.log` | bin/pc/forge-register.cmd（app 注册） | 注册动作时 | pc CLI debug JSON；实测只有 config-home 找不到的噪音 | 否 |
| `open-when-ready.log` | conf/open-when-ready.ps1:44 | 启动器 converge | `2026-09-25 14:39:18 converge rc=0` | 否 |
| `pc-*.log.gz` ×3 | pc.log 轮转 | 10MB 触发 | — | 否 |

其余 `chat-bridge*.log / e2e-*.log / dev-relaunch*.log / probe-*.{js,out} / ui-*.png / walkthrough/` 等均为开发/演练残留，非产品通道（盘上采样确认，全部停更于演练日）。

### 1.2 桥 console.log 调用点分类（VERIFIED-DOC，共 66 处）

- **有价值的环节级事件**（但全部只进 ring buffer→延迟进 pc.log）：`acp exited`(:1388)、`aborted in-flight turns`(:1393)、`ACP initialized`(:1635)、`llmproxy: 深度档…`(:3489)、`model-caps updated`(:3620)、会话/工作区操作（workspace created :4444、fs new/delete :4360/:4426、ws deleted :4312、uploaded :4501）、`session deleted`(:4887)/`sessions batch deleted`(:4930)、`rollback_rewrite`(:4639)、升级备份(:3042/:3104)、`config saved`(:5308)、桥启动/端口占用(:5326-5345)。
- **错误类**：`init failed`(:1642)、`hot restart failed`(:5138/:5206 仅失败)、`report generated`(:3053)、pg 同步 warn 族(:349/:388/:441/:477)、`http error`(:4510)、`bridge error`(:5341)。
- ****以下环节一行 console 都没有**：test_model、list_models、providers 增删改/保存/激活、switch_model（成败）、set_think、probeProviderHealth（结果/耗时）、session/new、prompt、cancel、explain_tool/optimize_prompt 直调、llmproxy 非别名路径、llmproxy 响应状态码/上游错误、sched 暂停恢复、/api/apps 读写。**

### 1.3 statsBump 计数键全清单（VERIFIED-DOC；落 data/stats/usage-YYYYMMDD.json，2s 防抖异步写 :201-209，跨天轮转 :176-199）

- `sessionsCreated`（:1608 救援新会话 / :4783 subscribe / :5187 / :5235 switch 附带）
- `messages`（:4836，用户 prompt 计数）、`retryAfterError`（:4839）
- `errorsByType.upstream` + `upstreamByKind.{unauthorized,rate,timeout,server}`（:1458/:1555/:1563，S26 正则从回合文本猜错误）、`errorsByType.other`（:1564）、`errorsByType.websocket`（:4547）
- `permissionCards.{shown,timeout,approved,denied,allow_once,allow_always,reject_once,reject_always}`（:1440/:5030-5032）
- `switchModel.{ok,fail}`（11 个出口 :5147-:5269）
- `rescues.{triggered,guardHit}`（:1566/:1567）、`healthEvents.{recovered,degraded}`（:1309，仅态迁移）
- `upgradeEvents.{start,ok,fail,lastSeen}`（:3700/:244）
- `assetsCount.{last,max}`（:253-254，gauge 型）、`artifactsGenerated`（**恒 0 占位**，:124 注释自认）
- **全是聚合计数：无时间戳、无对象、无错误原文。test_model / list_models / providers 配置没有任何键。**

### 1.4 sessions.db（goose 写；桥只读 sessions 表做报告计数 :2975-2985）

- `messages`（10288 行）：含 role/content_json/created_timestamp；assistant 行 metadata_json 带 `inference:{provider,requestedModel}` + `usage:{input/output/total/cacheRead tokens}`（VERIFIED-RUN 采样）——**每回合 token 记录存在，但无耗时、无状态码，错误回合只以文本进 content**。
- `usage_ledger`（4728 行）：每请求 model+tokens+时间戳（VERIFIED-RUN：09-25 有 6 笔，12:24-13:29）。
- `provider_inventory_entries/models`（15/442 行）：goose 自己的模型目录刷新，带 `last_refresh_attempt_at / last_refresh_error`（采样见 502、bad gateway 等错误）——**与用户的"拉取模型"按钮无关**（桥 list_models 直连上游不落库），且已停在 08-31。

### 1.5 其他

- process-compose ring buffer：`pc process logs <name>` 可读当前进程近期输出（VERIFIED-RUN：含 pc.log 没有的 5 行）。桥的 appsAppLogs(:2746-2759) 会读它，**报告不读**；进程重启即失忆（respawn 恒盲，s98 记忆）。
- 状态文件：providers.json / model-caps.json / data/updates/status.json / schedule.json——只反映"现状"，无历史。
- 前端：sys:test_result 只弹 `note()` 一次性提示（chat.tpl.html:778），关掉即消失；前端 4 处 console.error/warn 不进任何持久通道。

---

## 2. 环节 × 通道覆盖矩阵

通道缩写：**LOG**=console→pc.log｜**FLOG**=专属日志文件｜**CNT**=statsBump 计数｜**DB**=sessions.db｜**RPT**=进 📮 报告
格值：●=有留痕 ◐=留了但抓不住关键信息 ○=无

| 环节 | LOG | FLOG | CNT | DB | RPT | 备注（证据） |
|---|---|---|---|---|---|---|
| 服务商增删改/保存/激活 | ○ | ○ | ○ | ○ | ◐仅配置快照 | :5091-5141 只写盘+重探，无事件；报告带 providers.json 现值不带变更史 |
| **连通测试 test_model** | ○ | ○ | ○ | ○ | ○ | :5066-5089；结果只回发起 ws；探针实证零盘上痕迹 |
| **拉取模型 list_models** | ○ | ○ | ○ | ○ | ○ | :5038-5064；同上；goose 的 provider_inventory 是另一条不相干链 |
| 模型切换 switch_model | ○ | ○ | ●ok/fail | ◐会话 model_config 随后更新 | ●计数进 stats 原文 | 11 出口计数；切换了什么/为何失败无处可查 |
| 思考档切换 set_think | ○ | ○ | ○ | ◐configOptions 会随之变 | ○ | :5274-5299 |
| 健康探测 probeProviderHealth | ○ | ○ | ◐仅态迁移计数 | ○ | ◐间接（7 天错误聚合） | :1270-1312 结果只在内存 healthCache+广播；无耗时记录 |
| 会话发起（new/rescue） | ○ | ○ | ● | ●sessions 行 | ●计数 | 救援触发有计数，无原因 |
| 用户 prompt | ○ | ○ | ● | ●messages 行 | ●计数 | 回合耗时无处可查 |
| LLM 请求·别名路径 | ●一行 | ◐无耗时/状态 | ○ | ●usage_ledger | ○llmproxy.log 不进报告 | :3489-3490 |
| **LLM 请求·非别名主路径** | ○ | ○ | ○ | ●usage_ledger(tokens) | ○ | :3493-3510 applyParamRoute 零留痕；生产实证 09-25 六笔全静默 |
| LLM 上游错误/状态码 | ○ | ○ | ◐S26 正则猜 4 类 | ◐错误文本进 messages | ●仅 7 天计数 | :3574-3579 错误体只透传给 goose；无原文留痕 |
| 思考参数注入 writeThinkKeys | (随路径) | (随路径) | ○ | ○ | ○ | :1031；注入了什么键值无独立记录 |
| 工具调用执行 | ○ | ○ | ○ | ●messages 含 tool 记录 | ○报告不读正文 | 桥只转发帧；单工具耗时无 |
| 权限卡 | ○ | ○ | ●四桶+选项 | ○ | ●计数 | :1440/:5030-5032 |
| 会话删除 | ●:4887/:4930 | ○ | ○ | ●行删除 | ○ | |
| 小应用启停（apps/pc） | ○ | ○ | ○ | ○ | ○ | /api/apps 只读面板；启停走 pc，痕迹在 ring buffer/pc.log（受冲刷限制） |
| 调度暂停/恢复（sched） | ○ | ○ | ○ | ○ | ◐仅总数/paused 数 | handleSchedules :3187+ 全靠回包 |
| 备份 | ●→backup.log | ● | ○ | ○ | ●尾部 30 行 | 最佳覆盖的环节 |
| 升级 | ● | ●update-runner.log | ●start/ok/fail | ○ | ◐status.json 一行+计数 | |
| 桥自身启停 | ●启动/端口占用 | ○ | ○ | ○ | ◐间接（EADDRINUSE 规则） | :5326-5345；stop 无痕（进程没了） |
| goose acp 重启 hotRestart | ◐仅失败 console.error | ○ | ○（不计次数） | ○ | ○ | :1645-1659；成功重启零痕 |
| explain_tool/optimize_prompt 直调 | ○(PF_EXPLAIN_DEBUG 才有) | ○ | ○ | ○ | ○ | :4948-4990/:4992+；这类直调绕过一切通道 |

---

## 3. 📮 报告能力评估（GET /api/report 实测 + 全量读生成代码 :2760-3055）

实测：`curl -H "X-PF-Report: 1" .../api/report` → 生成 47KB `report-20260925-2241.md`（已按纪律删除）。十节：诊断规则(R1-R5)/快速判断/环境/pc.log 尾 300 行/backup.log 尾/7 天 stats 原文/providers 脱敏 JSON/会话概况一行/补充说明/issue 模板。

**报告能回答**：环境健康（进程存活/磁盘/代理）、7 天错误聚合数字、当前配置快照、pc.log 里恰好被冲刷进来的历史行、备份是否在跑。

**报告答不了（对照矩阵）**：
- 「指定模型后慢+不知道在做什么」：无请求耗时、无 per-request 状态码、无队列/重试痕迹；llmproxy.log 不进报告且当前配置下（无别名家族）根本不产出行；usage_ledger 有 token 无耗时且报告不读。
- test_model / list_models 历史：**零痕迹（实证：grep 报告 0 命中）**。谁在何时测了什么、拉到了什么、HTTP 码多少——全链不存在。
- switch_model 细节、hotRestart 次数、set_think、sched 操作、explain/optimize 直调：同样零。
- pc.log 节的时效缺陷：pc.log mtime 停在 14:39（boot），报告 22:41 生成时 8 小时无新行；ring buffer 里有 pc.log 没有的行，报告只读文件不读 ring buffer。

**规则诊断 R1-R5 只吃 5 个信号**（faucetAlive/provHasKey/unauthorized 计数/EADDRINUSE/代理开关），对"提供商侧慢/错"只能靠 S26 正则把回合文本猜成 4 类——猜不出时报告显示"没发现明显的毛病"。

---

## 4. 缺口清单（按用户可感知严重度排序；补法=最小建议，未实现）

| # | 严重度 | 环节 | 现状 | 最小补法建议 |
|---|---|---|---|---|
| G1 | 高 | LLM 请求主路径（非别名） | 无任何留痕；生产流量整段静默（09-25 六笔实证） | handleLlmProxy 出站/回包各一行 append 到 llmproxy.log：ts/路径/model/状态码/耗时/错误体前 120 字节（别名路径同一行格式，替换现有半行） |
| G2 | 高 | test_model | 零留痕，结果只弹 note() | 结果落地：llmproxy.log 或新 events.log 一行 ts/host 域名/model/http/耗时/错误摘要 + statsBump `providerTests.{ok,fail}` |
| G3 | 高 | list_models | 零留痕 | 同 G1 同文件一行：ts/host/http/拿到的模型数/错误摘要 |
| G4 | 高 | LLM 慢/错抓不住 | 别名路径无耗时无状态码；错误体不留原文；S26 正则猜 4 类 | G1 落地即覆盖；报告把 llmproxy.log 尾 30 行纳入 secBak 同款截断节 |
| G5 | 高 | 报告读弱通道 | pc.log 受冲刷限制（8h 无新行实证）；llmproxy.log/update-runner.log 不进报告 | 报告补两节：`pc process logs chat-bridge --tail 50`（appsAppLogs :2746 现成函数复用）+ llmproxy.log 尾部 |
| G6 | 中 | 服务商配置变更 | 无事件留痕，只有文件现值 | providers 保存分支一行日志：ts/动作(add/remove/update/activate)/name（key 不落）；报告已带现值无需改 |
| G7 | 中 | switch_model / set_think | 只有 ok/fail 计数，无 from→to | 计数处顺手一行日志 ts/sid/from/to/原因 |
| G8 | 中 | hotRestart | 成功零痕（只知 ACP initialized 又来一次） | hotRestartProvider 首行 console.log 触发源（保存/切换） |
| G9 | 中 | probeProviderHealth | 结果内存态+广播，无耗时、无历史 | 探测收敛点一行：ts/state/kind/耗时 ms（态变已有计数） |
| G10 | 中 | explain_tool / optimize_prompt 直调 | 绕过一切通道；失败只回发起 ws | llmStreamOnce 收口处一行：ts/用途/model/http 摘要/耗时 |
| G11 | 中 | pc.log 冲刷时机 | respawn 恒盲（s98 记忆+ring buffer 落后实证） | 属 pc 产品行为不可改；缓解=G5 让报告兼读 ring buffer |
| G12 | 低 | 调度操作（pause/resume） | 回包即散 | schedToggle done() 一行日志 ts/id/op/结果 |
| G13 | 低 | 小应用启停 | 依赖 pc 聚合日志 | apps 读写口一行日志（含 deny-list 拦截） |
| G14 | 低 | usage_ledger 丰富面未利用 | 有 per-request tokens 但报告不读 | 报告"会话概况"节补一行：近 7 天 usage_ledger 请求数/模型分布（只聚合数字，不读正文） |

---

## 5. 排除项与自查

- 已排除"statsBump 防抖造成假阴性"：test/list 处理器本就无 statsBump 调用（VERIFIED-DOC），且 2s 防抖窗口（:201-209）远小于探针 6s 观察窗。
- 已排除"llmproxy.log 静默=今天没有 LLM 流量"：usage_ledger 09-25 有 6 行（12:24-13:29）。
- 已排除"test_model 有 key 外带风险导致故意不记"：升级 C1 注释（:4107-4109）只约束跨站，无"禁日志"设计意图；日志留 host 域名+http 码即可合规（reportSanitize :2768 同款脱敏思路）。
- 探针残留：tmp/s103-r2-probes/（脚本+报告 JSON），未动产品数据；实测生成的 report-20260925-2241.md 已删除（data/reports 尾部核对过）。
- 未覆盖：goose 内部自身日志面（goose acp 的 stderr 透传进 pc.log，量少）；nats/pg 内部日志（与用户问题无关）。
