# 2026-08-30 s55+s56 — 用户两类断根问题：实体生命周期 + 外部资源接入域（S1/S2 落地）

## 背景（用户主线输入）
用户指出两类产品设计级问题，要求从根源断根、不许指哪修哪：
1. 产品没利用好基础设施、无域划分——技能市场每次实时拉 anthropics/skills（慢）、无搜索、翻译无处承载。
2. 功能过于简化、无实体生命周期管理——定时任务只有删除，无暂停、不能指定时间；实体多了只能拉清单。

## 裁决（pf-pm 裁决书，要点）
- 域根源：接入外部资源从未被抽象成域。→ 立管道：外部源 → sync（缓存优先+惰性/手动重拉）→ 本地缓存 → 中文人话化（异步惰性写回）→ 桥内检索。缓存 = data/cache/<域>/ 文件形态（不新建 SQLite，走 STATE_SCHEMAS/migrateJsonAt 既有管线）；翻译 = 桥直调 chat completion（explain_tool 同款，不走 goose oneshot）；安装收敛为从缓存本地复制（出网面收敛到 sync 一处）。
- 生命周期根源：每类实体的算子是按当期需求逐个补的。→ 立底线算子集：建/查（列表+搜索）/停（可逆）/删/改期，允许裁掉但必须裁决。逐类盘点 14 项，6 项实锤缺口（技能无卸载、MCP 无停/卸载、定时任务无停/改期、能力开关面板对已装 MCP 盲区等）；S3（MCP/技能停+卸载）本轮不做挂起。
- 永久裁掉：技能市场定时自动同步、翻译 SKILL.md 全文、「暂停一次」类花哨算子、版本锁定升级管理。

## S1 定时任务暂停/恢复（commit 7b3aa24 + 本轮修复）
取证（pf-researcher，goose v1.46.0 源码 aaif-goose/goose 98c11ce，存档 Temp/goose-forensics/）：
- 直接改 schedule.json paused 字段无效：cron 守护读进程内存副本（触发闭包 !j.paused），且任何 persist 用内存副本覆写盘——改了会被静默回滚。goose schedule list 显示的 PAUSED 只是短命进程读文件的假象。
- CLI 无 pause/unpause 子命令。唯一正路 = ACP custom request `_goose/unstable/schedules/pause|unpause`（操作调用方进程自己的 Scheduler 实例：改内存+persist 落盘）。
- 桥的常驻 acp（无 --enable-scheduler）Scheduler 单例为 None（acp_factory.rs L42-45 无懒创建），method_not_found。→ 桥 spawn 短命 `goose acp --enable-scheduler` 发请求落盘，进程即弃。
- **守护重载闭环（关键）**：守护 sync_from_storage 只按 id 增删不更新 paused → 桥落盘后必须 `pc process restart goose-scheduler`（重启后全新 Scheduler 从盘 load）。restart 失败降级 warn 人话（ok:true + warn），不欺骗。此缺陷类同时解释了既有「删除」按钮的守护盲区（删除经 goose CLI 落盘，同样需守护重启——历史遗留，未在本轮扩大战线，记 backlog）。
- UI：loadSchedUI 每行 ⏸/▶（title 人话）+ warn alert；运行中 pause 人话报错。

## S2 技能市场缓存+搜索+中文
- data/cache/skills/manifest.json（_schema:1 入 STATE_SCHEMAS）+ 每技能 SKILL.md 原文缓存。
- GET /api/skillstore?remote=1：缓存 <24h 秒回；过期秒回旧缓存+后台重拉（skillSyncBusy 防抖）；无缓存同步拉一次。拉取失败静默留旧缓存（本地优先）。
- 翻译：desc_zh 批量直调 completion，10 条/批 + text 截 150（实测 19 条全量 9389 字符 >60s 超时，kimi-k2.7-code），zh 截 500，每批落盘，失败不阻塞下次 sync 再补。无 host/model 跳过全英文兜底。
- installRemoteSkill 缓存优先本地 cpSync；缓存缺目录回落 GitHub 递归拉+写缓存。新增 GET ?preview=<dir> 读缓存原文（白名单 [\w\-]{1,64}+fileNameSafe）。
- 响应改 {ok,fetched_at,translating,skills}（内部接口，前端同 commit 改）；UI #store-q 搜索框（防抖 200ms，过滤 name/description/desc_zh）+ 中文优先渲染 + translating 尾注（10 分钟孤儿自愈）。

## pf-qa 联审（Ready=No → 修复后闭环）
- P1：schedToggle done() 无 writableEnded 防护——25s 超时先回包后 pc restart(30s) 迟到回调再写已结束响应抛 uncaughtException 桥退出。修：done 首行 return。
- P2：GitHub 返回的目录/文件名裸进 path.join（fetchAllRemoteSkills e.name、walkApi it.name）——上游被攻破可写缓存树外。修：与用户输入同门白名单，不符跳过。
- P2：fuzz 未覆盖 s55/s56 新分支。补 8 断言（op 白名单 4 + preview 白名单 3 + remote 响应形状 1）。
- P3：resume 失败 alert 三元丢 e.message；translating 崩溃残留 10 分钟自愈。均修。
- **新发现（fuzz 断言写出后实跑抓到）**：`String(["daily-mem"])==="daily-mem"`——POST id 传数组被静默字符串化**真实执行了 pause**。修：typeof 只收 string（delete 分支同处一并覆盖）。此即「断言必须实跑」的价值。
- 终态：e2e-chat 26/26 + fuzz 31/31（净增 8）。

## GUI 复核（VERIFIED-RUN，IAB 浏览器实景）
- 定时 tab：「每日记忆自检 · 已暂停」+ ▶ 按钮 → 点 ▶ → 行变「每天 09:00」+ ⏸；goose schedule list = IDLE；守护 15s 前重启（pc restart 生效）。点 ⏸ 复原「已暂停」+ ▶。全程无 alert。
- 技能市场：21 条秒开（缓存）；搜索框「搜技能…」；远程技能中文描述已渲染；搜「画画」精准命中 algorithmic-art（desc_zh 命中）；translating 尾注正确隐藏。
- 环境注意：Edge --app 窗口 a11y 偶发 Chrome Legacy Window 不出内容 + html 缓存旧版；IAB（browser-use）路径稳定，后续 GUI 验证优先走 IAB。

## 遗留 / Backlog
- S3（MCP/技能停+卸载、能力开关面板动态并入已装 MCP）——裁决书已排片，本轮未做。
- 定时任务改期：P32+ 走聊天自然语言，UI 不暴露 cron（ADR-0010 精神）。
- 守护盲区清账：删除按钮同样依赖「落盘+守护重启」才对守护生效——历史行为，需一轮补齐（删除后也 restart goose-scheduler）。
- guard：pf-researcher 建议明早 9 点观察 daily-mem（paused）是否被跳过 = 守护 paused 语义实机自然验证。

## 追加：s57 — S3 片落地（MCP/技能停用+卸载，commit 4ba7c4d）
- /api/extensions GET 动态并入已装 mcp-*（能力开关面板盲区修复——此前已装 MCP 不可见不可停）；POST id 校验改 LABELS∪动态。
- /api/mcpstore POST {id,op:'uninstall'}：删 config.yaml `  mcp-<id>:` 块 + bin/vendor/mcp-<id> + mcpInstallState；installing 中拒卸（qa P2）。/api/skillstore POST {name,op:'uninstall'}：白名单与安装同门。
- UI：MCP 已装项「已启用/已停用」+ 卸载 confirm；技能行 ✕ 卸载；卸载后商店面板同步（qa P3）。
- qa 审查抓 P2：mcpEnabled 自写正则跨块吞下一块 enabled 行——改块界扫描（逐行 + 块头状态机）。教训：yaml 行级处理统一走 readExtState 同门模式，别写一次性正则。
- fetch-mcp 真卸载+重装闭环（npm 源可达 65s）；最终 installed+enabled true 原状；sequential-thinking 块完好。
- 回归：fuzz 39/39（+8）+ e2e-chat 26/26；GUI IAB 实证：卸载按钮×2 + 已启用状态渲染。
- 新发现 backlog：vendor 目录名漂移（mcp-memory/mcp-seqthink vs memory-graph/sequential-thinking，s46 时代命名），卸载 memory-graph 会删错路径致真目录孤儿。
