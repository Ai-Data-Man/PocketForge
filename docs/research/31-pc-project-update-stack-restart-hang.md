# 31. F-3 根因取证：`pc project update` 热注册触发栈级重启 → 会话回合孤儿化（2026-09-17）

对象：s95 从零安装测试 F-1/F-3 中 **F-3（P1 阻断级）「agent 热注册 → 回合 14h+ 无进展、零反馈」**。
材料：C:\PF-TEST\s95a 现场制品（sessions.db / pc.log / goose cli 日志）+ 本机单变量实验（隔离 pc 项目、零栈 node/python 探针）。
结论分级：**VERIFIED-RUN**（本机跑通+命令可复跑）/ **VERIFIED-DOC**（上游源码 tag 核对）/ **UNVERIFIED**（未验证）。

---

## 0. 结论（先行）

**F-3 不是「管道写端继承」问题。** 原假设（findings.md F-3 §假设）在两条独立路径上被否：

1. 真实 pc 路径上，`project update` 启动的新进程**不继承调用方的 stdout 管道写端**（父进程是 pc 守护进程，调用方 `cmd.exe` 747ms 内退出、stdout 729ms 到 EOF、退出后零字节）——**VERIFIED-RUN**。
2. 即便管道真被孙进程持有，goose v1.50 的 shell 工具也**不可能**挂 14 小时：直系子进程退出后输出排空有 500ms 硬上限，且省略的 `timeout_secs` 默认 300s——**VERIFIED-DOC**（源码 tag v1.50.0；出货二进制 sha256 与上游资产逐字一致）。

**实际根因（证据链见 §3，分级见 §6）：agent 按 hints 第 2 条执行的那条 `pc ... project update -f conf/process-compose.yaml -f apps/<x>.yaml` 命令，其 `-f` 文件集与守护进程的启动文件集不一致**（守护进程由 `启动数字员工.cmd` 以 `-f conf/process-compose.yaml -f conf/ports.env.yaml -f conf/apps.env.yaml` 启动）。pc 的 `project update` 是**「以新文件集整体替换项目 + 差异即重启/缺项即删除」**语义（**VERIFIED-RUN** 隔离复现），因此这条热注册命令会把基础设施进程（含 **chat-bridge**，即会话宿主）一起重启。chat-bridge 一死，它的 goose acp 子进程随之退出（`chat-bridge.js:790` `exit → process.exit(1)`；goose v1.50 acp 对 stdin EOF 即退出），**在飞回合被销毁**：sessions.db 里该工具调用**从未落过 toolResponse 行**。前端拿不到任何终态事件（无 stop、无错误卡、无超时），于是工具卡永久 `in_progress`、typing 常亮——即用户看到的「14 小时还在干活」。

佐证时间线（s95a 制品，逐条可查）：
- 00:23:36 工具调用 `shell`（`toolu_e0d92c1dd5644cddb91e0a855cf65807`，hints 原样命令）写入 sessions.db（msg 13），**无对应 toolResponse**。
- 00:23:39.9–00:23:40.7 **faucet / nats / chat-bridge / faucet-rawsql / pg-init 全体重启**（pc.log 内各进程全新启动横幅 + 新 PID）。
- 00:23:40 / 00:23:45 两个**新的** `goose acp` 进程起来（新桥各起一个）→ 主控看到的「goose acp 仍存活」是**新实例**，不是原回合的守卫者。
- 00:19–00:23:36 期间 llm_request 文件与 usage_ledger 均无该回合之后的任何请求/记账 → 回合确实终止于工具执行中。

---

## 1. 被否假设：Windows 句柄继承 → 管道永不 EOF → 工具等待读到底

### 1.1 机制本身真实，但只在 cmd.exe 包装链里成立（VERIFIED-RUN）

判据 = 父进程（stdout=PIPE）读到 EOF 的时刻相对「孙进程寿命 6000ms」的位置；脚本 `docs/research/s95-f3-eof-probe.py`（控制组/实验组只差孙进程的启动形态一项）：

命令：`python s95-f3-eof-probe.py "node .../s95-f3-grandchild-launcher.js <MODE> 6000" 12`

| MODE（孙进程启动形态） | cmdExitMs | stdoutEofMs | 判定 |
|---|---|---|---|
| no-grand（无孙进程，基线） | 321 | 318 | EOF_WITH_CMD_EXIT |
| node-inherit（`stdio:'inherit'`） | 326 | 322 | EOF_WITH_CMD_EXIT |
| node-ignore（`['ignore','ignore','ignore']`） | 327 | 315 | EOF_WITH_CMD_EXIT |
| node-piped（`stdout=pipe`） | 334 | 322 | EOF_WITH_CMD_EXIT |
| node-detached（`detached:true`） | 307 | 301 | EOF_WITH_CMD_EXIT |
| cmd-start-b（`cmd /c start "" /b ...`） | 366 | 362 | EOF_WITH_CMD_EXIT |
| **cmd-nul-redirect（`cmd /c ... >nul 2>&1`）** | **312** | **6163** | **EOF_DELAYED_BY_GRANDCHILD** |

读法：只有**经 cmd.exe 起孙进程**时，父进程的管道 EOF 被推迟到孙进程退出（6163ms ≈ 6000ms 寿命 + 开销），且父进程**没有**收到孙进程任何字节（`>nul` 已重定向）→ 这是句柄表继承（`bInheritHandles=TRUE` 的无差别继承），不是 std 句柄传参。node 自身的 spawn 不传播该写端（六种形态全部 322ms 内 EOF）。**主控假设的机制形态（cmd.exe 包装层继承）在 Windows 上确实存在。**

### 1.2 但产品路径上不成立（VERIFIED-RUN）

真实 pc v1.122.0（`C:\PF-TEST\s95a\bin\pc\process-compose.exe`），隔离项目端口 8097，父进程 stdout/stderr 双管道（goose 工具同形），脚本 `docs/research/s95-f3-pc-update-probe.py`：

命令：`python s95-f3-pc-update-probe.py 20 add2.yaml`
（内部执行 `cmd /d /c cd /d C:\PF-TEST\pf-f3-pc && process-compose.exe -p 8097 project update -f base.yaml -f add2.yaml`）

```
T+0.75s client cmd.exe exited rc=0
TREE@end  [{pid:20084, ppid:11052, name:'cmd.exe', cmd:'cmd /C "node C:/PF-TEST/pf-f3-pc/app.js"'},
           {pid:13944, ppid:20084,  name:'node.exe', cmd:'node  C:/PF-TEST/pf-f3-pc/app.js'}]
{"cmdExitMs":747,"stdoutEofMs":729,"stderrEofMs":729,"eofReached":true,
 "bytesAfterCmdExit":[],"stdout":"Project updated successfully\n"}
```

- 调用方 `cmd.exe` **747ms 正常退出 rc=0**，调用方管道 **729ms 到 EOF**（早于 cmd 退出），退出后零字节 → 「新进程继承调用方管道 → 永不 EOF」**证伪**。
- 新起的 app 进程 20084 **父进程 = pc 守护进程 11052**（`up -t=false` 那个），不是调用方；即热注册的新进程由守护进程落地，守护进程的 stdout 是启动器控制台，与 goose 管道无关。**这是单变量：只改「update 是否真启新进程」，其余不动。**

### 1.3 即便管道被持有也不可能挂 14h（VERIFIED-DOC）

出货 goose = 上游 v1.50.0 未改一字节：`forge/bin/goose/goose-package/goose.exe` 与 `C:\PF-TEST\s95a\bin\goose\goose-package\goose.exe` sha256 同为 `235f929f17eb5a9eaa58903431f97d81d30147e9c9f614b1545290805d329c77`（= research/23 §升级落地 记录的上游资产内 exe 哈希）；`downloads/goose.zip` sha256=`1bcb644e9dd9eeae60ec0491c0687b3378d32365e7cb5c3edeab8db6aa923829` = 上游 release digest；`tools/fetch.sh:31` 直取该资产。故 v1.50.0 tag 源码即出货行为。

`crates/goose/src/agents/platform_extensions/developer/shell.rs`（tag v1.50.0，本地取证 `tmp/goose-src` v1.46 同构，双版本同款）：
- `command.stdout(Stdio::piped())`，随后 `collect_tagged_lines` 在独立任务里读；主流程只 `child.wait()`；
- 直系子进程退出后：`tokio::time::timeout(Duration::from_millis(500), output_task)`，超时即 `abort_handle.abort()` 并标 `output_truncated=true`（注释原文："output drain timed out after 500ms (backgrounded process?)"）→ **后台孙进程持有写端最多拖 500ms，拖不住工具**；
- 超时默认值：`resolve_shell_timeout(None)` → `DEFAULT_EXTENSION_TIMEOUT = 300`（`config/extensions.rs:10`）；
- 观察到的调用参数（sessions.db msg 13）**未传 `timeout_secs`** → 走 300s 上限。

推论：该工具最迟在「cmd.exe 退出 + 500ms」或 300s 返回一个结果卡。**14 小时 in_progress 无法用该机制解释。**

> 附带发现（与本缺陷无关，另行立案）：`resolve_shell_timeout` 后仍有 `Some(t).filter(|v| *v > 0)`，**显式传 `timeout_secs: 0` 会关掉超时**进入无界 `child.wait()`。产品链路无人传 0，本次不是它；但它是同类挂起的一个真实入口。

---

## 2. `pc project update` 的真实语义（VERIFIED-RUN，隔离单变量）

隔离项目 `C:\PF-TEST\pf-f3-env`，mirror 出 s95a 的形状：`main.yaml`（命令用 `${MYROOT}` 占位 + `log_location`）+ `ports.env.yaml`（同名进程覆盖 `command` 与 `readiness_probe`）+ `apps.env.yaml`（`processes: {}`）。守护进程按启动器同款启动：

`process-compose.exe -p 8096 -f main.yaml -f ports.env.yaml -f apps.env.yaml up -t=false`

实验（每次只改一件事）：

| # | 动作 | 结果（PID 快照） | 判定 |
|---|---|---|---|
| 1 | 守护进程带三个 `-f` 起（alpha 实际跑 overlay 版 `ping -n 800`） | daemon 15700 / alpha cmd 9880 | 基线 |
| 2 | `project update -f main.yaml -f app1.yaml`（**少传 overlay，多传新文件**） | alpha 重启为 **新 PID 13608 且命令变成 main.yaml 版 `ping -n 900`**；beta（新进程）出现 | **差异即重启** |
| 3 | 再 `project update -f main.yaml -f app2.yaml`（不含 app1.yaml） | **beta 整个消失**；delta 出现；alpha 13608 存活 | **缺项即删除** |
| 4 | 再 `project update -f main.yaml -f app3.yaml` | epsilon 出现；alpha 再次重启（14592） | 差异即重启（复现） |

⇒ `project update` = **整体替换项目**：新文件集里没有的进程被**移除**，定义与当前运行态不同的进程被**重启**，定义一致的不动。

**产品含义**：s95a 守护进程的真实启动集是 `conf/process-compose.yaml` + `conf/ports.env.yaml` + `conf/apps.env.yaml`（`启动数字员工.cmd:74`、`forge/conf/dev-stack-up.ps1` 同款三件套），而 hints 第 2 条教的命令只传 `conf/process-compose.yaml` + `apps/<x>.yaml`：
- faucet 的定义来自 `conf/ports.env.yaml`（command 与 readiness_probe 都在里面）→ 与运行态不同 → 重启；
- `conf/apps.env.yaml`（聚合器物化）没传 → 已注册应用的进程在更新集里缺失 → 按上表 #3 会被**删除**（与 s95「注册后 start/stop 行为异常」同源风险）；
- 少传 overlay 时 `${FORGE_ROOT}`/`${FAUCET_PORT}` 的取值来源随调用方环境变化 → 定义差异面进一步扩大。
（「为何 s95 那次是 9 个进程全重启」这一点，与上表 #2/#4 的差异判据一致但仍未逐一还原每个进程的差异字段：**UNVERIFIED 细节**；观察到的“全重启”事实本身由 pc.log 直证。）

---

## 3. 现场制品证据链（s95a，逐条可复核）

1. **工具调用在库、回复不在库**：`conf/goose/data/sessions/sessions.db`，`messages` 14 行。msg 13 = assistant `toolRequest`（`shell`，`arguments.command` = hints 原样命令，`_meta.goose_extension=developer`，**无 `timeout_secs`**，时间 00:23:36）；此后**没有任何** `toolResponse` 行（14 行即全部）。→ goose 从未产出该工具结果。
2. **栈级重启**：`data/logs/pc.log` 结构分块（脚本 `process-block boundaries`）——L70–L139 是 00:23:39.897–00:23:40.7 的全体重启：faucet（新 PID/新横幅）→ nats（`[20324] … 00:23:40.589 Starting nats-server`）→ chat-bridge（`ExperimentalWarning` → `ACP initialized: goose | provider: s95test | model: glm-5.3-flash`）→ faucet-rawsql → faucet-provision → chat-bridge pg 迁移 NOTICE。
3. **新 acp 实例**：`conf/goose/state/logs/cli/2026-09-17/`——`002216.log`（回合所在，00:22:43 Session loaded auto 模式）、`002340.log`、`002345.log`（重启后新桥新起两个 acp，仅 "listening on stdio"+"Created new ACP agent"）。
4. **回合后无任何 LLM 活动**：`usage_ledger` 最后一行 created_timestamp 1789575819（00:23:39 之前的第 5 次请求）；llm_request 文件亦止于该步。
5. **宿主一死全链死**：`forge/bin/chat-bridge.js:786-792` `spawn(GOOSE,['acp'],{stdio:['pipe','pipe','pipe']})` + `child.on('exit', c => { console.log('acp exited', c); if (child === acp) process.exit(1); })` → 桥被 pc 重启 → 旧 acp 的 stdin 管道关闭 → goose v1.50「stdin EOF 即优雅退出」（research/23 §v1.50 行为）→ 回合随进程消失。
6. **另一起并列异常（不同窗口，另案）**：pc.log L140–L309 是 chat-bridge / goose-scheduler / nats / faucet / faucet-rawsql / pg-init 的**崩溃循环**，错误恒为 `The system cannot find the path specified.`（88 行）；pc.log 末次写入 14:25:32、quote-web.log 14:25:10，与**主控 14:20 GUI 停/启**同窗，与本缺陷无因果（findings.md 已排除测试污染）。成因未取证：**UNVERIFIED**（候选：GUI 启动路径未带三件套 `-f` 集 / 未带 `FORGE_ROOT` 环境）。建议单列一条线索。

---

## 4. 排除项（查了什么、怎么排除的）

| 候选 | 处置 | 依据 |
|---|---|---|
| 「update 的新进程继承 goose 管道写端」 | **排除** | §1.2 真实 pc 实测（EOF 729ms、父进程=守护进程）；§1.3 源码 500ms 排空上限 |
| 「pc 客户端命令自身阻塞不退出」 | **排除** | 两次独立实测：945ms（主控）/ 747ms（本机）均 rc=0 |
| 「goose 无超时（省略参数=无限等）」 | **排除** | §1.3 `resolve_shell_timeout` → 300s（v1.46/v1.50 同款） |
| 「显式 `timeout_secs: 0` 关掉超时」 | **排除（本次）** | sessions.db msg 13 无该参数；保留为同类入口的潜在隐患 |
| 「测试污染（14:20 GUI 停/启）」 | **排除** | 挂起发生在 00:2x，重启证据在 00:23:39；14:2x 的崩溃循环是第二起事件 |
| 「孙进程句柄继承机制不存在」 | **保留（机制真实）** | §1.1 cmd.exe 链 6163ms 实测；但对本产品路径不成立 |
| 「pc update 只是加进程、不动其他」 | **否定** | §2 表：差异即重启、缺项即删除 |
| 前端在桥重启后的卡片终态行为 | **UNVERIFIED** | 未重跑 GUI；主控 GUI 观察（无终态事件、typing 常亮）与该机制自洽 |

---

## 5. 修法建议（分级，含成本/覆盖向量/副作用）

**A. [首选] hints 教法改为「只增不替换」的注册形态（成本：小；覆盖：本缺陷触发点）**
- 把手册第 2 条命令改成与启动器同源的完整文件集：`-f conf/process-compose.yaml -f conf/ports.env.yaml -f conf/apps.env.yaml -f apps/<新应用>.yaml`，并补半句「`-f` 集必须是启动器那三件套 + 全部 apps 文件；少一个都会重算整栈」。
- 覆盖：进程定义差异面（faucet/聚合缺项）。**副作用**：教法变长、agent 漏抄一条即回到今天；且 `apps/` 目录新增/改名后仍要人肉列全（存在漂移面）。
- 更稳的同族做法：桥新增「注册应用」写通道（`POST /api/apps` 已有 stop/start，扩展为写 yaml + 用三件套 + 全部 apps 文件执行 update），agent 只调接口不拼命令行。成本中，覆盖最彻底（单一真相源），副作用是新 API 面 + 需要守卫防 agent 塞基础设施键（`APP_INFRA_PROCS` deny-list 已具备，可复用）。

**B. [必做兜底] 会话层「回合/工具卡终态兜底」（成本：小-中；覆盖：症状面，任何原因的会话中断都覆盖）**
- 桥侧：acp 子进程退出 / ACP 连接重置时，对**所有在飞工具卡与回合**补发终态（错误卡或「连接中断，请重试」），并按 turnId 落一条失败记录；桥启动时对 `in_progress` 的历史卡做一次对账收敛。
- 覆盖：零反馈（本缺陷最伤用户的部分）。**副作用**：需要桥明确「回合世代」概念（现有 `spawnAcp` 已有 generation 语义可直接复用）；无正确性问题。

**C. [纵深] 桥自身不要在 pc 重启时静默消失（成本：小；覆盖：传播链）**
- `child.on('exit') → process.exit(1)` 是「让 pc 拉起我」的简化设计；可改为退出前先落一条「agent 进程退出，回合中止」并保留最近 N 个 turn 的断点，或由 pc 侧把 `chat-bridge` 的 `availability.restart` 与「重启即中止回合」的语义显式记账。
- 覆盖：回合丢失不可见。**副作用**：桥生命周期更复杂，需要回归 F11/F12 渲染流与 F-12 启停面。

**D. [不建议单独做] 只加超时兜底**
- 桥层或 ACP 层加 N 分钟总超时：能救「永久」观感，但 14h 里真正的问题是**回合已被销毁、无人知道**；只加超时会把「孤儿回合」变成「N 分钟后报错」，用户仍不知道发生了什么。建议并入 B。

**E. [顺带] goose shell 工具侧**
- 不改上游（出货二进制与上游逐字一致 = 可核验资产，改则升级链断）。若确要动，用配置 `GOOSE_DEFAULT_EXTENSION_TIMEOUT`（已在 config.yaml 有 300/120 的家族），不碰二进制。`timeout_secs: 0` 的无界分支建议在上游提案，不在本窗口动手。

---

## 6. 分级汇总

| 断言 | 等级 | 判据 |
|---|---|---|
| cmd.exe 链会继承调用方 stdout 写端（孙进程持有） | VERIFIED-RUN | `s95-f3-eof-probe.py` cmd-nul-redirect：EOF 6163ms vs 寿命 6000ms |
| 真实 `pc project update` 的新进程不继承调用方管道；调用方 747ms 退出、729ms EOF | VERIFIED-RUN | `s95-f3-pc-update-probe.py`，进程树 + EOF/时序 |
| pc v1.122.0 `project update` = 差异即重启 + 缺项即删除 | VERIFIED-RUN | §2 表四个单变量快照（进程 PID/命令/存在性） |
| goose v1.50 shell 工具 500ms 排空上限 + 300s 默认超时；出货二进制=上游资产 | VERIFIED-DOC | 上游 tag v1.50.0 源码（本机 tmp/goose-src v1.46 同构）+ sha256 链：bundle/forge exe=235f929f…、downloads/goose.zip=1bcb644e… |
| 该工具调用无 toolResponse 落库、00:23:39–40 栈级重启、新 acp 实例 | VERIFIED（现场制品） | sessions.db messages 14 行；pc.log 分块；cli/2026-09-17/*.log |
| 栈级重启由该 update 命令触发 | **UNVERIFIED（强时序，未逐进程还原差异字段）** | 时序差 3s；隔离复现证实 update 会重启差异进程，但 s95 那次 9 进程全重启的逐项差异未还原 |
| 14:2x 崩溃循环（`The system cannot find the path specified.`）成因 | **UNVERIFIED** | 与 GUI 停/启同窗；需单列实验 |
| 前端在桥重启后卡片恒 in_progress（无终态事件） | **UNVERIFIED（主控 GUI 观察，机制自洽）** | 未重跑 GUI |

## 7. 复跑方法

```
# 1) 零栈机制矩阵（只看 cmd.exe 链是否传播写端）
python docs/research/s95-f3-eof-probe.py "node <repo>/docs/research/s95-f3-grandchild-launcher.js cmd-nul-redirect 6000" 12
python docs/research/s95-f3-eof-probe.py "node <repo>/docs/research/s95-f3-grandchild-launcher.js node-ignore 6000" 12   # 对照

# 2) 真实 pc：update 启新进程时调用方是否被拖住（改 PC 常量指向本机 pc、改 CWD/端口）
python docs/research/s95-f3-pc-update-probe.py 20 add2.yaml

# 3) update 语义（§2 表）：隔离项目 main.yaml + ports.env.yaml + apps.env.yaml，
#    先 up 起守护进程，再依次 project update（少传 overlay / 换文件集），比较 PID 与命令
```

沙盒目录（`C:\PF-TEST\pf-f3-mech`、`pf-f3-pc`、`pf-f3-env`）实验后已整删；`forge/` 树零改动；dev 栈仅做只读健康检查（8790=200）。
