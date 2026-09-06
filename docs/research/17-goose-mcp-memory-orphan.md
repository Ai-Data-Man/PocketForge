# 17. goose `mcp memory` 进程滞留与孤儿取证（s74 遗留①）

日期：2026-09-07 02:00-02:15（本机实验窗口）｜研究员会话实测，全部命令可复跑（探针留 tmp/s74-*）
环境：dev 栈 FORGE_ROOT=C:\ZCodeWorks\PocketForge\forge，pc :8099，桥 :8790，goose v1.46.0（dist 内二进制），goose 源码 clone=tmp/goose-src（tag v1.46.0）

## 结论（先行）

1. **谁在 spawn**：goose acp 进程按 `conf/goose/config/config.yaml` 的 `extensions.memory`（`enabled: true`，`cmd: cmd /c bin/memory-mcp.cmd`）**为每一个 ACP session** spawn 一对 `cmd.exe /c memory-mcp.cmd → goose.exe mcp memory`。VERIFIED-RUN（进程树实测：`chat-bridge node → goose acp → cmd.exe → goose.exe mcp memory`，见 tmp/s74-snapshot.ps1 输出）。桥只 spawn acp 本体（chat-bridge.tpl.js:596-623 `spawnAcp`），不直接 spawn memory；goose-scheduler（pc 管的另一个 acp，`--enable-scheduler`）同样按 config 加载扩展。
2. **为何不回收（滞留主因）**：每个 session/new 创建独立 Agent+ExtensionManager（acp/server/new_session.rs:82 → execution/manager.rs:203 `Agent::with_config` → `load_extensions_from_session`），Agent 被两处持有：agent_manager 的 LRU（容量 100，`GOOSE_MAX_ACTIVE_AGENTS` 可调，默认 DEFAULT_MAX_SESSION=100）**和 acp server 自己的 `sessions: HashMap`（server.rs:202/967，只有收到 ACP `session/close` 才 remove（server.rs:1626-1638）——而桥从不发送 session/close**（unsubscribe 只解绑 WS（tpl.js:2878-2882）；delete_session 硬删 sessions.db 且注释明言「ACP session/close 不删记录」（tpl.js:2916-2917））。LRU evict 只是从缓存 map pop，Arc 引用仍在 acp sessions map → **Agent 永不 drop → extension 进程永不回收，直到 acp 进程退出**。VERIFIED-RUN（实验 D：GOOSE_MAX_ACTIVE_AGENTS=2 + 3 会话 → 3 对全活）+ VERIFIED-DOC（源码链）。
3. **孤儿的形成（52 个 PPID-死进程形态）**：正常路径（acp 优雅退出或被 taskkill /F 单点硬杀）下 extension 子树**整对干净消失**（管道 EOF 级联：acp 死 → goose.exe mcp memory 读 stdin EOF 退出 → cmd /c 随之退出；实验 A/F 两次实测 0 残留）。唯一自洽的孤儿路径是 **extension 初始化失败分支**：`child_process_client`（extension_manager.rs:465-474）connect 失败/超时 → transport 被 drop → rmcp 3.0.0 `TokioChildProcess` 的 Drop 起异步 best-effort kill **只杀直接子 cmd.exe**（docs.rs rmcp 3.0.0 child_process.rs 源码，VERIFIED-DOC）→ 孙 goose.exe mcp memory 已 spawn 但无 EOF（acp 还活着）→ 挂死成孤儿（PPID=死 cmd）。这与主控 01:45 现场「孤儿+ACP 依赖断言摇摆同时出现」互洽：系统滞留进程多 → extension 握手慢/失败 → 孤儿（cmd 死 goose 活）+ session/new 断言红。**本机三轮单变量实验（A/C/E）未复现孤儿**——该分支标记 VERIFIED-DOC（源码+文档级推演），非本机复现。

## 单变量隔离实验矩阵（全部 VERIFIED-RUN，2026-09-07 02:01-02:11）

基线：栈上桥的 acp 下 11 对活 cmd+goose（fuzz 复跑后自然积累，非孤儿）。

| 实验 | 动作 | 结果 |
|---|---|---|
| A | 仅 `pc process restart chat-bridge`（枚举前后快照） | 11 对+旧 acp **全部消失，0 孤儿**；新桥+新 acp 正常 |
| B | 仅一个 `subscribe(null)` 新会话（node WS 探针，tmp/s74-exp-newsession.js） | **+1 对活** cmd+goose，WS 断开后不回收 |
| C | 完整 `fuzz-chat.sh` 一轮（143/143 绿） | **+5 对活**（= s50h 矩阵 5 次 session/new，逐一对号），0 孤儿 |
| D | 独立 acp（GOOSE_MAX_ACTIVE_AGENTS=2）建 3 会话（tmp/s74-exp-lru.js） | **3 对全活**——LRU evict 不回收（Arc 被 acp sessions map 持有） |
| E | 30 连发 subscribe(null)（tmp/s74-exp-burst.js，30/30 成功） | +30 对活，0 孤儿（串行未触发过载失败） |
| F | 独立 acp+3 会话后 `taskkill /F` 单点硬杀 acp（等价桥 hotRestartProvider 的 `oldChild.kill()`） | 2 秒内 3 对**全消失**，0 孤儿——EOF 级联在硬杀下成立 |

复现命令：
```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\ZCodeWorks\PocketForge\tmp\s74-snapshot.ps1      # 快照（分类孤儿/活对）
node C:\ZCodeWorks\PocketForge\tmp\s74-exp-newsession.js                                                # 单会话
node C:\ZCodeWorks\PocketForge\tmp\s74-exp-burst.js                                                     # 30 连发
node C:\ZCodeWorks\PocketForge\tmp\s74-exp-lru.js                                                                 # 独立 acp（MAX_ACTIVE_AGENTS=2）
```

## 泄漏面定量（比 52 个更大）

taskkill /T 树杀输出显示：每个 session 滞留的不只 memory 一对，而是**全部 enabled stdio 扩展各一份**：memory（cmd.exe+conhost+goose.exe ≈3 进程）、faucet-db、browser（node.exe）、mcp-sequential-thinking（node.exe）、mcp-fetch（node.exe）——**每会话 ≈7 进程**（实验 D 3 会话的树杀了 33 个进程）。主控枚举的 52 个只是同名好认的 goose.exe 族。s69 S-B 关闭的 apps/summon/extensionmanager/analyze 是 platform 型（进程内），无此成本。

## 产品定性：产品缺陷，非 dev 噪音

- 交付包模板 `conf/templates/goose-config.tpl.yaml` memory `enabled: true`（模板 :27-32），bootstrap.ps1 幂等生成 config.yaml 且只保留用户改过的开关值（ADR-0010）——**目标机首启即同构**。
- 桥模板（=交付物）无 session/close 发送、无任何 extension 回收路径；delete_session 亦不发。
- 产品场景=数字员工长期开机：用户每开一个新对话永久滞留 ≈7 进程，直到桥/acp 重启（用户切跨供应商模型或重启产品）。50 个对话 ≈350 进程。**长期开机累进程实锤，构成产品缺陷**；叠加过载时 extension 初始化失败 → 孤儿 + 会话建立摇摆（主控 01:45 现场）。
- 缓解事实：pc restart chat-bridge / 桥退出 / acp 死（任意方式）都会整树回收（实验 A/F 两次实测）——「重启产品即自愈」，属兜底而非治疗。

## 修复建议（分档；本研究员未改任何产品代码）

**首选（桥侧最小 diff，零 goose 二开）**：桥在会话生命周期终点发 ACP `session/close`——最自然的挂点是 `delete_session`（tpl.js:2916，删行同时通知 acp 卸载 Agent→drop→rmcp 收 cmd；孙 goose.exe 的 EOF 由 acp 内 transport close 触发，属 goose 上游正常 teardown）。最小 diff ≈ 5 行：`acp.stdin.write({method:'session/close', params:{sessionId}})`（发后不等待）。**否决项/风险**：a) 若 acp 端 close 语义与预期不符（会连带删 goose 侧记录或拒绝对已删行 close），需先在独立 acp 上验证 close 后该 session 的 extension 进程确实回收（可用 tmp/s74-exp-lru.js 改造）；b) 只覆盖「用户显式删对话」，普通会话闲置仍滞留——需配合次选。
**次选（清扫兜底）**：桥内周期（如每小时或 N 会话阈值）对**孤儿**形态进程清扫（复用 tmp/s74-kill-orphan-mcp.ps1 逻辑：goose.exe mcp memory 且父死），或桥启动时（spawnAcp 后）先扫一次历史孤儿。**否决项**：按命令行字符串杀进程面窄但毕竟越权杀进程，必须限定「父死且命令行精确匹配 forge\bin\goose...goose.exe mcp memory」，避免误杀用户自建 MCP。
**goose 上游路径（零二开红线，仅记录）**：上游 acp sessions map 无 TTL、extension Drop 不杀孙进程（rmcp Drop 只杀直接子）是根因的两半。若未来升级 goose，验收项=「session/close 后 extension 进程对消失」+「acp 死后整树消失（已达标）」。
**dev-only 处置（下限）**：若裁决暂不修，至少把「孤儿枚举/清理」并入护航手册（脚本已在 tmp/，建议转 tools/），并 STATE 观察项挂「每会话 ≈7 进程滞留，重启产品自愈」。

## 遗留问题

1. **extension 初始化失败→孤儿的构造性复现未做**（需让握手可控超时，不碰产品文件难以构造）：本机 5 实验均 0 孤儿，孤儿分支停在源码级（VERIFIED-DOC）。若要闭环，可临时把 memory 扩展 cmd 指向一个 sleep 脚本在独立 acp 上验证（只在 tmp/ 造，不动 forge/）。
2. **桥热重启（switch_model 跨供应商）在真栈上未实测**（等价硬杀已在实验 F 栈外验证为干净回收）；上线桥侧修复后应补一条 e2e：切供应商→数进程对。
3. **每会话 ≈7 进程的内存/句柄成本未定量**（本机 goose.exe mcp memory 单实例工作集未测）——若修复按「滞留无害」裁决，此项应补测再翻案。
4. pc Windows 进程树回收（s69 遗留③）：本轮 A 实验侧证 restart 路径回收干净（桥树无残留），但 postgres 族仍未复验，观察项保留。

## s75 修复落地与栈外验证（VERIFIED-RUN，2026-09-07；工程师会话）

1. **栈外前置验证（修复建议 a 项）**：独立 acp（tmp/s75-close-verify.js）建 3 会话 → 后代进程 33（每会话 11：memory cmd+conhost+goose、faucet-db+conhost、browser/seq-think/fetch node+conhost）→ 逐个发 `session/close` → **1 秒内 33→0**，`goose mcp memory` 对同步消失。**close 回收进程成立**。
2. **close 容错事实**：对已不存在的 sid 发 close 返回 `{"result":{}}` 空 result 无 error（on_close_session 只做 HashSet insert+remove，源码 server.rs:2234-2263）；故 fire-and-forget 重发无害。close 后同 sid 再 session/load 会被 closed_session_ids 守卫拒（resource_not_found）——delete_session 硬删行后无此路径。
3. **桥侧修复（首选档落地）**：chat-bridge.tpl.js delete_session 在硬删 DB 的同时向 acp.stdin 写 `session/close`（id 自增不注册 waiting，响应落 onAcpData 未匹配分支被静默忽略；写失败 try/catch 吞掉不阻断删除）。范围红线遵守：未碰 unsubscribe/openSession/归档，未动 goose。
4. **端到端实景**：pc restart chat-bridge 后——单会话建 11 进程 → delete → 回基线 0；fuzz 一轮 5 会话 55 进程 → 5 次产品路径 delete → **descendants=0**（≤5s）。healthz 200。e2e 新增 11b 节 ws-close-reclaim.js（自相对断言：基线→建会话增长→删→回基线，1s 有界轮询），e2e-chat **48/48**、fuzz **143/143**。
5. **工具转正**：tmp/s74-kill-orphan-mcp.ps1 → tools/clean-orphan-mcp.ps1（匹配收紧：`goose-package[\\/]goose\.exe"?\s+mcp\s+memory`——实测命令行为带引号 `"goose.exe"  mcp memory` 形态；只杀父死）；tmp/s74-goose-procs.ps1 → tools/list-goose-procs.ps1。
6. **残余滞留面（裁决已知）**：普通会话闲置不删仍滞留（ unsubscribe 不发 close，主控裁不做）——回收兜底=桥重启/acp 死整树回收（实验 A/F）；孤儿形态清扫兜底=tools/clean-orphan-mcp.ps1。

## 现场恢复记录

实验造数已全清：45（B/D/C/E/F）+5（复验 fuzz）个会话经产品路径 `delete_session` 删除（tmp/s74-cleanup-sessions.js，dry-run 复核归零）；滞留进程对经两次 `pc process restart chat-bridge` 清零；探针 node 进程已杀；终态快照（02:15:07）孤儿=0、滞留=0、bridge healthz 200 ok（node 直连）、fuzz 复验 143/143 绿。主控入睡前状态完整保持。
