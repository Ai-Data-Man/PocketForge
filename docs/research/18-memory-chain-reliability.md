# 18. 「小forge偏好记忆」全链路取证与活体验证（s76，2026-09-07）

日期：2026-09-07 22:50-23:40（本机实验窗口）｜取证研究员会话
环境：dev 栈 FORGE_ROOT=C:\ZCodeWorks\PocketForge\forge，pc :8099，桥 :8790（v0.9.10），goose v1.46.0（dist 内二进制），goose 源码 clone=tmp/goose-src（tag v1.46.0）
触发：用户质疑"小forge偏好记忆功能是否靠谱"。本文把"好像靠谱"变成分级证据链。
探针：tmp/pfr18-*.js（health/write/recall/cleanup/final），全部可复跑。

## 结论（先行）

1. **主链路（写→落盘→新会话召回→面板查看/删除）整体成立**：写入走 agent 的 `memory__remember_memory` 工具 → 经 `%APPDATA%\Block\goose\config\memory` junction 落 `forge/conf/goose/config/memory/<分类>.txt` → 新会话 extension 初始化时全量注入 system instructions（被动召回，无需工具调用）→ 面板经桥 `/api/memory` 直读同一目录。全链活体验证通过（见实验矩阵）。**裁决：可靠，但带 2 个真实断点（见下）**。
2. **断点①（P1，s75 修复引入的回归，活体复现）**：`delete_session` 删掉**当天最新**会话后，goose 按 `当日_MAX(库内序号)+1` 生成新会话号（session_manager.rs:1591-1604，源码级）→ 序号回退复用已被 `session/close` 的 sid → acp `closed_session_ids` 守卫拒绝一切 prompt（server.rs:1541/1577，acp 日志 WARN 实录「Session not found: 20260907_3」）→ **桥把该错误帧当成功 resolve，前端表现为「发消息秒回空、无任何报错」的僵尸会话**（chat-bridge.tpl.js:633-635 resolve 吞错误 + :2968-2974 prompt 的 waiting 只有 resolve 没有 reject）。同日此后**每个新对话都失灵**，直到桥重启。s75 记录里「delete_session 硬删行后无此路径」的否决理由被本实验推翻——路径存在，入口就是 sid 复用。
3. **断点②（P2，概率性，结构无防护）**：`remember_memory` 的 `is_global` 是**无默认值的必填布尔**（goose-mcp/src/memory/mod.rs:38-42）。模型若漏传 → 工具直接报参数错误；若传 `false` → 写进 `<cwd>/.goose/memory/`（cwd=forge 根，桥 session/new 固定 `cwd: ROOT`，tpl.js:2949）→ **面板不读、新会话不注入，记忆"存了但看不见"**。当前唯一防线是 .goosehints 里一句「存全局记忆」（conf/templates/goose-hints.tpl.md:51，活体已物化）——教学级防线，非结构防线。本机 5 次实测模型 4/5 正确传了 `is_global:true`（1 次因上游空回复未走到工具调用）；dev 栈无任何 `.goose` 局部记忆目录（find 全库 0 命中）——尚未实际发生，但无护栏。
4. 其余核查面全部无恙：junction 在位（本机实查）、编码 UTF-8 两端一致、升级双保险（PROTECTED + 升级前自备份）、面板搜索/删除路径正常。逐一证据见下。

## 全链路图（每一跳 file:line）

写入方向（agent 存偏好）：
```
用户说"记住我喜欢X"
→ agent 调 remember_memory（system prompt 每会话都带 4 把 memory__* 工具，实测 llm_request.*.jsonl 每文件恰含 1 次工具定义；
   工具注册 goose-mcp/src/memory/mod.rs:335-338，参数 category/data/tags/is_global :31-42）
→ 权限：smart_approve 模式下 read-only LLM judge 判 non-read-only → 出权限卡（permission_inspector.rs:144+、
   permission_judge.rs:145；permission.yaml 的 ask_before 列表只对 retrieve_memories 生效）
→ 桥转发 acp_reply{option}（tpl.js:3113-3124；前端字段名是 option 不是 optionId）
→ goose mcp memory 写文件：remember() append「可选 # tags 行 + data + 空行」UTF-8
   （memory/mod.rs:211-230；路径 = choose_app_strategy(APP_STRATEGY).in_config_dir("memory") :105-107
   = %APPDATA%\Block\goose\config\memory —— 【无视 GOOSE_PATH_ROOT】，ADR-0005 论断对 v1.46.0 仍成立；
   Paths::get_dir 支持 GOOSE_PATH_ROOT（config/paths.rs:8-12）但 memory 没走它）
→ junction 重定向：bootstrap.ps1:70-78 mklink /J %APPDATA%\Block\goose\config\memory → conf/goose/config/memory
   （本机实查 junction 在位；memory-mcp.cmd wrapper 里设的 GOOSE_PATH_ROOT 对 memory 落盘无效——junction 才是承重墙）
→ 落盘 conf/goose/config/memory/<category>.txt
```
召回方向（新会话）：
```
session/new（桥 spawn 每 acp 会话独立 Agent+ExtensionManager）
→ memory extension 初始化即 retrieve_all(global) 全量注入工具 instructions
   （memory/mod.rs:115-142；被动召回，agent 不调工具也知道——本轮 C 会话实测）
→ 主动查询 retrieve_memories 走权限卡（permission.yaml ask_before 有 memory__retrieve_memories）
```
面板方向（查看/删除）：
```
chat.tpl.html:441「小 forge 记住的事」→ :1554 fetch /api/memory
→ 桥 GET 直读 ROOT/conf/goose/config/memory/*.txt，按空行分段、# 首行=tags（tpl.js:2428-2462；与 goose 读写格式语义一致，
   桥注释自证 VERIFIED-RUN 2026-08-27）→ 不经 junction，直接读便携侧（面板不依赖 junction 存活）
→ DELETE=POST forget_one/forget_all，atomicWrite 回写（tpl.js:2473-2490）
```
教学（agent 怎么被告知要存记忆）：
```
conf/templates/goose-hints.tpl.md「## 记忆规矩」(:50-52)：个人事实用 remember_memory 存全局记忆；查旧事先用记忆工具再 chatrecall
→ bootstrap.ps1:46-68 幂等物化到 conf/goose/config/.goosehints（活体文件已含该节，实查 :50-52）
```

真相源判定：`conf/goose/config/memory/` 是唯一真相源；`forge/data/memory` 不存在（实查）；junction 只是 goose 侧写入口的重定向。

## 断点分析（逐一核查当前 dev 栈实际状态）

| # | 断点假设 | 现状 | 证据等级 |
|---|---|---|---|
| 1 | MCP 未挂载（agent 无记忆工具） | 未发生：每会话 system prompt 均带 memory__remember_memory/retrieve_memories/remove_* 4 把工具；spawn 链实测（进程树 goose acp → cmd → goose.exe mcp memory） | VERIFIED-RUN |
| 2 | 写错目录（GOOSE_PATH_ROOT 误导/junction 失效） | junction 在位（`dir %APPDATA%\Block\goose\config` 实查 JUNCTION → conf\goose\config\memory）；写实测落便携侧正确文件。注意 GOOSE_PATH_ROOT 对 memory 无效（源码 :105-107），junction 是唯一承重结构——**bootstrap 没跑过的机器上 junction 缺失时，goose 会在 APPDATA 建真目录，面板永远空白（静默）**。bootstrap.ps1:75 有 `if (-not (Test-Path $memApp))` 守卫：真目录已存在时 mklink 静默跳过，不会自愈 | VERIFIED-RUN（在位）+ VERIFIED-DOC（缺守卫行为） |
| 3 | is_global=false 写局部 | 未发生（无 .goose 目录）但无结构防护，见结论② | VERIFIED-DOC + RUN(4/5) |
| 4 | 编码/格式分叉 | Rust 侧 UTF-8 append（mod.rs:211-230）；桥侧 utf8 读、parseMem 去 \r、# tags 语义与 goose 一致；活体中文内容两端解析一致 | VERIFIED-RUN |
| 5 | 面板读旧路径 | 不成立：面板读 conf/goose/config/memory（tpl.js:2432），与落盘同一目录 | VERIFIED-RUN |
| 6 | bootstrap 物化时序 | wrapper bin/memory-mcp.cmd、.goosehints、config.yaml 三者均已物化且与模板同步（实查内容+时间戳）；hints 物化纪律（s74 遗留③）对记忆教学同样适用 | VERIFIED-RUN |
| 7 | 升级迁移 | 双保险在位：update-runner.tpl.js:68 PROTECTED 含 `conf/goose/config/memory/`（v0.9.10 起）；桥升级前自备份含 conf/goose/config 整目录、keep3、恢复说明点名记忆（tpl.js:1649-1702，s75 落地）。v0.9.9→v0.9.10 存量路径记忆库被重置为已 documented 事故（STATE s69 遗留①） | VERIFIED-RUN（代码与备份目录实查）+ STATE 实录 |
| 8 | **delete_session→sid 复用→僵尸会话** | **发生并复现**：见结论①与下方实验矩阵 | VERIFIED-RUN |
| 9 | 权限卡挡住写入 | 记忆写入每新会话首次会出卡（smart_approve judge 判 non-read-only），用户点 allow 后可继续；本机 2/2 次卡→allow→成功。非断点，但「妻子首次存偏好会看到一张卡」属 UX 事实，护航文案可提一句 | VERIFIED-RUN |

## 活体验证矩阵（全部 VERIFIED-RUN，2026-09-07 23:09-23:33）

| 实验 | 动作 | 结果 |
|---|---|---|
| W1 | 新会话 prompt「记住：我最喜欢的测试标记物是蓝色小方块，存全局记忆 pf-research-18」+ 自动 allow 权限卡 | 模型 rawInput 精确 `{category:"pf-research-18", data:<中文>, is_global:true}`；工具成功；agent 复述「存好了」；**文件落盘** conf/goose/config/memory/pf-research-18.txt，内容 `我最喜欢的测试标记物是蓝色小方块\n\n`（UTF-8，与源码 append 格式逐字节一致） |
| R1 | **全新会话**问「pf-research-18 分类里记了什么？不要调用任何工具」 | agent 零工具调用直接答出全文——被动注入召回成立 |
| P1 | GET /api/memory（面板数据源） | 200 `[{"category":"pf-research-18","items":[{"text":"我最喜欢的测试标记物是蓝色小方块","tags":[]}]}]` 解析正确 |
| D1 | POST /api/memory forget_all + 删空文件 | 200 ok，目录还原为空（测试数据全清，未触碰任何既有用户数据） |
| Z1（断点①复现） | delete_session 删当日最新会话后再建新会话并发 prompt（3 次独立复现） | **秒回空 turn、0 消息入库、无报错**；acp 日志实录 `Sending error response method="session/prompt" error=Resource not found "Session not found: 20260907_3"`（cli/2026-09-07/20260907_170224.log 15:15:54 / 15:20:31 两次） |
| Z2（断点①消解） | pc restart chat-bridge 后建新会话 prompt | 正常回复「收到」——重启清 closed_session_ids（内存态）即自愈 |

复现命令（Z1 需先删一个当日最新会话；探针均可重跑）：
```
node C:\ZCodeWorks\PocketForge\tmp\pfr18-mem-final.js B   # 写入+落盘断言
node C:\ZCodeWorks\PocketForge\tmp\pfr18-mem-final.js C   # 新会话召回
node C:\ZCodeWorks\PocketForge\tmp\pfr18-cleanup.js       # 面板API清理+删会话
```

## 可靠性裁决

**有条件可靠（主链路 VERIFIED-RUN 成立；断点①必须修，断点②建议修）**：
- 用户「记住我喜欢X → 以后它记得」的核心体验：**通**，且中文内容、格式、面板查看/删除全链一致。
- 但「删除一个对话」这个高频操作会在**当天剩余时间**悄悄杀掉之后所有新对话（断点①，且零反馈——用户只会觉得「它不理我了」）。这在真实使用里必然撞上。
- 「局部记忆」漏斗（断点②）暂无实害，但防线只有一句 hints 教学话术。

## 修复建议（最小修复面，未改任何产品代码）

1. **断点①首选（桥侧，≈5 行）**：prompt 的 waiting 补 reject 分支 + onAcpData 对 error 帧调 reject 而非 resolve（tpl.js:633-635 与 :2968-2974）——把「Session not found」翻译成人话「这场对话打不开了，点＋新对话」，先把静默失败变成可恢复失败。**根治（二选一）**：a) 桥 delete_session 后不再依赖 goose 号段——自己维护 sid 前缀（如 `pf_<原sid>`）避免与 goose 号段碰撞语义；b) 桥记住「已 close 的 sid」，subscribe(null) 拿到被 close 过的 sid 时再发一次 session/close 并强制 goose 换号不可行（goose 不接受指定 sid）——故 a) 或「delete_session 不删行改标记 tombstone，防 MAX 回退」更贴最小 diff。需工程师按 ADR 纪律裁决；验收=e2e 增加「删最新会话→新会话→prompt 必须有回文」断言。
2. **断点②（hints 一句话 + 验收项）**：goose-hints.tpl.md:51 已教「存全局记忆」；建议补一句显式「is_global 必须填 true」；长期若 goose 上游给 is_global 加 default=true 则删教学。低频靠模型自觉可接受，不值得为它二开。
3. **断点2 的兜底观察项**：护航期若用户反馈「存了但不记得」，先查 `forge/.goose/memory/`（局部漏斗的第一现场）再查 junction。
4. **UX 备注不立项**：首次存偏好出权限卡属 smart_approve 设计内行为；面板文案「它聊天时会自己记住」可加半句「首次会问过你」——P4 级，随下轮文案批量处理。

## 遗留问题

1. 权限卡「allow_always」后的缓存语义（permission.yaml smart_approve 列表会否自动追加 memory__remember_memory）未跟踪——若追加，二次会话不再出卡，属良性；未验证。
2. 断点①在 GUI 上的实际表现未做浏览器级复现（WS 探针已等价覆盖前端消息形态：stop reason=end + 空 chunk）；工程师修复时补 GUI 断言即可。
3. chatrecall 层（历史召回）不在本轮范围；「查旧事先用记忆工具」的教学与权限卡的组合成本未评估。
4. 本机 7 个滞留 `goose.exe mcp memory` 进程对（research/17 已知残余）随本轮两次 pc restart 全部清零，终态：acp 主进程+scheduler 孤立运行，孤儿=0，healthz 200（node 直连），memory 目录空，sessions 库余 20260907_1/_2/_3（_3 为本轮占号用的空会话，桥启动自会清理 >1 天的空 acp 会话）。

## s76 修复后的救援触发面边界（2026-09-08 补记）

s76 已落地断点①桥侧修复：ff0a092（onAcpData error 帧改走 reject + prompt 首轮单次救援；e2e 第 18 节「删当天最新→新建→prompt 必须有回文」钉子转正）+ P3 小批 df80876（TURN_LOST_TEXT 成因中立文案）/1ddff47（rescuedSids 救援去重）/d539ebb（rescueSession ws.alive 门）。主场景活体实证：E1 探针 REUSED=true（_7 删后复用）→ 守卫拒 → RESCUE newSid=_8 → 回复「收到」；pc.log 留存 6 条 `session/prompt rejected by goose, single rescue: … Session not found: …` 实录。**VERIFIED-RUN**（s76 实施工程师活体，2026-09-08；探针 tools/e2e/sid-reuse-rescue-probe.js、tmp/pfr18b-zombie-fix-probe.js）。

### 勘误：转述的「closed 类文案不匹配 SESSION_NF_RE」与实测不符

主控转述的边界事实称：「对已 session/close 但行仍在的 sid 发 prompt，goose 返回 closed 类文案，不匹配 SESSION_NF_RE，因此不进救援」。**本研究员独立对照实验证伪该措辞机制**（实验 C1，VERIFIED-RUN，2026-09-08，tmp/pfr18c-acp-wording.js，独立 acp 实例单词对照）：

| 场景 | goose 返回（逐字） | NF_MATCH |
|---|---|---|
| close 且行仍在 | `resource_not_found` + data `"Session not found: 20260907_30"` | **true** |
| close 且行已删 | 同上，逐字相同 | **true** |

佐证：v1.46.0 acp 源码 grep 全库无任何 closed 类 prompt 错误文案——closed 守卫（server.rs:1541/1577）只发 `resource_not_found`+NF 形态；桥侧 reject 带完整 error 对象，`etxt = message + ' ' + data`（tpl.js:639、:704-709），两场景均命中 `SESSION_NF_RE`。

「close 未删行」不救援的**真解释**（同样成立，但机制不同）：
1. **产品路径上该场景不可自然发生**：桥只有 delete_session 发 session/close，且必同时硬删行（tpl.js:2992+）；「close 未删行」只能由绕过桥的 ACP 直访或未来代码路径制造。
2. **救援有首轮门**（tpl.js:2993 + 重放 `allowRescue=false` 单次守卫）：sid 在**中轮**死亡（无论何种成因），即便命中 NF 也只发 TURN_LOST_TEXT 人话错误，不迁移——P3 注释明言「中轮 sid 丢失不静默迁移，避免无声丢上下文」。工程师观察到的「人话错误提示重试/新建、非静默」用户表现与此一致，予以保留；但其归因（措辞差异）不成立。

### 修订后的救援触发面口径（三条，VERIFIED-RUN）

1. **首轮门**：仅每绑定首轮 prompt 允许救援一次（重放不救援、多客户端去重、30s 超时人话收场）。
2. **形态门**：仅 `Session-not-found` 形态触发；provider/上游类错误走 s26 上游分类文案，不救援（合理——换会话救不了线路故障）。
3. **措辞单源**：NF 形态是 v1.46.0 goose 对「closed 守卫/行不存在」的唯一措辞，今天恰好覆盖两类场景。**升级必查**：goose 若引入差异化 closed 文案（如 "session is closed"），「closed 未删行」类场景将从救援面掉出（仍保底为人话错误，非静默）——建议并入 research/04 升级回归清单（对 ask_before/never_allow 前缀命中检查同族）。

勘误声明：原底稿对断点①因果链（删行→序号回退→复用→NF 拒绝→桥吞错）与修复建议的描述经此实验全部维持成立，无需更正；本节为触发面边界的精化与转述勘误，非翻案。根治项（自有 sid 前缀/tombstone 防序号回退）仍按 journal s76 裁决挂起，触发器=救援路径实录失败或 goose 升级改变编号语义。
