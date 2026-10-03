# s108 修复路径取证：注册触发桥替换（iat124）A-E 事实集

日期：2026-10-03。角色：取证研究员。性质：**只给可行性事实，不做裁决**。
已定案根因（主控沙盒实录，本文不复跑）：冷启 launcher 以空 GOOSE_MODEL_NAME 渲染桥定义 → D1 配流写 providers.json+secrets.env → E1 注册时 wrapper 自备 env（现读新 secrets.env）→ 桥定义漂移 → `pc project update` 只替换 chat-bridge → 在飞回合孤儿化。

实验环境：`C:\PF-TEST\researcher-ef1`（隔离沙盒，本机 process-compose.exe v1.122.0 / Commit 23b0aca，与 tools/components.yaml:6-8 一致；node 用仓内 v22.21.1）。实验完已删，关键日志行已录入本文。全程未触碰 `C:\PF-TEST\s108a`。

验证等级标注：**本机跑通**（ef1 沙盒实测，带时间戳）/ **源码核实**（GitHub F1bonacc1/process-compose tag v1.122.0 现读）/ **文档核实**（仓内既有研究/源码注释）/ **未验证**。

---

## A. pc `project update` 对漂移进程的替换语义

### A1. 源码链（源码核实，v1.122.0）

- `src/app/project_runner.go` `UpdateProject`：按 `Compare` 分三组——删除/新增/更新。更新组逐个 `UpdateProcess`。
- `UpdateProcess` = `removeProcess(name)` + `addProcessAndRun(*updated)`：先杀旧化身、同步等死、再起新化身（remove-then-add，无重叠窗口）。
- `removeProcess` → `shutDownNoRestart()` → `waitForCompletion()`（condvar 阻塞至进程退出，**无超时**；与 `doRestart` 的 5s pendingTerminationTimeout 不同路径）。
- `src/app/process.go` `stopProcess` 三选一的停法：
  1. **配置了 `shutdown.command`** → `doConfiguredStop`：以进程 env+cwd 运行该命令，等目标进程退出；`ShutDownTimeout` 缺省 = **10s**（`DefaultShutdownTimeoutSec`），到期仍活着 → SIGKILL 兜底。
  2. 配置了 `shutdown.send_keys` → 写 PTY，同样 10s 缺省 + SIGKILL 兜底。
  3. **默认（什么都没配）** → `p.command.Stop(sig, parentOnly)`。
- `src/command/stopper_windows.go` `Stop()` 全文实义：`taskkill /T /F /PID <pid>` 跑一次（结果丢弃）+ 无条件 `Process.Kill()` 兜底。**`sig` 参数在 Windows 实现里根本没被使用**——第 3 路所谓「发信号」在 Windows 上落地即硬杀（TerminateProcess 族），不存在先 SIGTERM 再等待的两段式。

### A2. 本机二进制实测（本机跑通）

**arm1（默认停法=现状）**：1 进程 pc 项目，victim 带 `process.on('exit')`/SIGTERM/SIGINT/SIGBREAK 全套钩子 + HTTP /healthz。改 env（MARK=one→two，与桥漂移同构）后 `project update`：

```
17:19:26.821  update 客户端启动
17:19:27.494  "Project updated successfully"（客户端 ~0.67s 返回）
victim.log:   BOOT pid=15092 MARK=one … 之后旧进程零输出
              BOOT pid=23652 MARK=two @17:19:27.230（新化身 ~0.4s 后起）
```

旧进程**一条钩子日志都没有**——exit/SIGTERM/SIGINT/SIGBREAK 全部未运行。对照实验证明仪表有效：手动 curl /leave 让 victim 自杀 → `EXIT_HANDLER_RAN code=0` 正常出现。结论：默认停法下被换进程**零钩子机会、零时间窗**。

**arm2（配置 `shutdown.command`）**：同项目加 `shutdown: { command: node leave.js, timeout: 10 }`（leave.js GET /leave 让 victim 自退）：

```
17:23:36.652  update 启动
17:23:36.875  SHUTDOWN_COMMAND_STARTED（update 开始后 ~0.2s）
17:23:36.884  LEAVE_ENDPOINT_HIT（victim 收到告别请求）
17:23:36.935  EXIT_HANDLER_RAN code=0  ← 优雅退出成立
17:23:37.098  BOOT pid=13900 MARK=two（旧死后才起新化身）
```

结论：**graceful 窗口在 Windows 上只存在于 `shutdown.command`（或 send_keys）这一条配置路**；默认路 = 立即树杀。`project update`、`pc down`、守护停栈共用同一 stopProcess 选择逻辑（源码核实；update 路已 arm2 实测，down 路未单独实测）。

### A3. 回答任务问句

> 桥的 exit handler（如果有）有没有机会跑？

- **现状（无 shutdown 配置 + 桥无任何信号/exit 钩子，见 B）**：没有。taskkill /F /T 是用户态代码零执行的硬杀（arm1 阴性 + arm2 阳性对照）。
- 若给桥 yaml 配 `shutdown.command` 指向桥的一个本地告别端点：**有**，窗口 = `shutdown.timeout`（缺省 10s，可调），且 pc 会等旧化身真死才起新化身（arm2）。
- 附带事实（文档核实，research/34 VERIFIED-RUN）：被 taskkill 族杀死的进程 pc 记 exit_code=1；update 客户端调用 ~0.4-1s 返回（arm1/arm2 实测 0.43-0.70s，与研究一致）。

---

## B. 桥的优雅退出面

### B1. 现状：零信号处理（文档核实=源码 grep，5619 行全扫）

`chat-bridge.tpl.js` 中 **不存在** `SIGTERM`/`SIGINT`/`SIGBREAK`/`SIGHUP` 监听、不存在 `beforeExit`、不存在 `process.on('exit')`。`process.exit` 全部调用点：

| 行号 | 场景 |
|---|---|
| :1554 | acp 退出 → `abortInflightTurns(TURN_BROKEN_TEXT)` 后攒 200ms `process.exit(1)`（s95/F-3） |
| :1805 | `init()` 失败（ACP initialize 超时/异常） |
| :5601/:5606/:5612 | EADDRINUSE 分支（端口被占/已在运行的人话退出） |
| :5616 | server error 兜底 |

即：桥今天死前发帧的**唯一**机制是 :1554——它依赖 acp 先死、桥还活着这个前提。「桥自己被 pc 杀」时该前提不成立（A 已证：连 `process.on('exit')` 都不会运行）。

### B2. 「死前给所有活跃 WS 发一帧」的可行性事实

- **帧发不发得出去**：能。`abortInflightTurns`（:1750-1761）已是现成函数——遍历 busySids、向每会话订阅者 `ws.send({sys:'error',text})`、清 busySids/turnText。s95/F-3 已实证同类「攒 200ms 让帧落内核缓冲再退」的打法（:1550-1554）可送达前端。
- **时间窗**：默认路 0ms（arm1）。要窗必须走 A2 的 yaml `shutdown.command` 路：pc 会先运行告别命令并等目标自退（缺省上限 10s，arm2 实测 60ms 级完成）。桥侧需要的配套是**一个本地 HTTP 告别端点**（现无：桥现有 HTTP 面只有 /healthz、/api/* 数据面，grep 无 shutdown 类端点），端点体内做 `abortInflightTurns(...)` + `setTimeout(exit, 200)` 即 :1554 同款。
- **告别命令怎么写**：仓内先例——桥自身已在用 `execFile('curl', …)`（:2006），update-runner 用 `http.get` 探活；`shutdown.command` 由 pc 以进程 env+cwd 运行（源码核实），`curl -s http://127.0.0.1:8790/<告别路径>` 或 node 一行皆可。命令串走 yaml 渲染（${FORGE_ROOT} 插值同 command 字段）。
- **坑**：
  - shutdown.command 同样作用于 `pc down`/守护停栈/update-runner stopStack——用户主动停栈时桥也会广播「重启中」措辞帧，文案需区分或接受；
  - 告别端点挂在 8790（127.0.0.1）无鉴权面——与 /api/* 同暴露级别（本机回环），但「能让桥自杀」的端点建议加 PC_TOKEN/随机串校验（secrets.env 已有 PC_TOKEN 先例）；
  - 桥若在告别端点里 hang 住，pc 到 timeout 强杀，退化为 arm1（有界，不更糟）；
  - 该修法**只救 WS 还连着的窗口**（iat124 现场页面开着=能救）；页面关着重开后的「上次回合怎么没下文」仍无解释（那是 C 的领地）。

---

## C. 重连补终态面

### C1. 新桥实例在重连时的现成钩子：**没有**

- `busySids`（:204）是**纯内存 Set**，「桥侧权威在飞登记」随进程死而消失；新实例从空集开始。没有任何代码在 subscribe/reconnect 路径上检查「上一次桥死时是否有悬空回合」。
- 持久化面只有两张：`workspace-map.json`→pg `wsmap`（:729-731，工作区映射）与 `session-archive.json`→pg `arch`（:738-741，会话 UI 生命周期态）。pgStateQ 只有 arch/wsmap 两队列（:492）。**两者都无回合级字段**——pg 里查不到「在飞回合」状态（任务问句的答案：无可查）。
- rescue-guard/S10 家族的触发点全部是 **goose 拒绝驱动**，不是重连驱动：`session/prompt` 被 goose 守卫拒（:1726-1732 `rescuedSids` 单次救援）、session/load 撞 SESSION_NF 的死绑定自愈（:5483）、无会话时自动代开（:5487「桥重启丢状态/新窗口」注释承认了桥重启丢绑定这一事实，但处理的是绑定不是回合）。
- subscribe 处理器（:5009-5017）：给了 sid 就 `bindWs`+回 `subscribed`，**不加载历史、不查回合状态**（历史回放是前端另行拉取）。
- 回合内容的真相在 goose DB（TURN_BROKEN_TEXT 文案即「内容都在库里」）——即「补终态」缺的不是数据，是「死时谁在飞」这一个标记。

### C2. s95 B-兜底（04b981e）覆盖面与缺口

04b981e（2026-09-17）落了两面：

1. **桥侧**：acp `exit` 事件 → `abortInflightTurns` 补发终态错误帧 → 200ms → `process.exit(1)`（:1547-1555）。
2. **前端**：`ws.onclose` 忙态收口分支 + `zombieToolcards()`（错误帧分支同样接线）。

**为何没盖住「桥本身被换」**：

- 桥侧路径的观测者是桥自己。pc 换桥时桥被 taskkill /F /T（A），`abortInflightTurns` 永无执行机会，`waiting` 表的 reject 回调（:1740 的错误帧）同样死在内存里——iat124「零错误帧」即此。
- 前端 `ws.onclose` 路径（chat.tpl.html:751-755）**确实会跑**，但它的语义是**静默中性收口**而非终态告知：`setBusy(false)`+`endStream(true)`+`zombieToolcards()`，工具卡置「连接断了，这一步的结果不确定」（:1673-1679，s103/S9 把 s95 原版的「失败」改成了中性——断线≠失败）。不上错误卡、不弹 banner。iat124 记录的「忙碌条消失、零回复零错误帧零 banner、WS 静默重连（wsState=1）无终态补发」与这一路的**设计行为逐项吻合**。重连后 `onopen` 会重拉 loadArch/loadSessions/loadProvidersUI/loadWorkspaces 并重绑 subscribe（chat.tpl.html:750），同样无任何「你有回合被腰斩」的告知。
- 忙碌条 103s 才消失的细粒度时序属主控实录，本轮未复核（前端无 busy 超时看门狗——busy 只被 stop 帧/:780 错误帧/onclose:755/取消按钮四处清空，grep 证实；103s 的延迟机制不在本任务取证范围，标记未验证）。

### C3. 若要补「重连补终态」需要的新事实基础

- 死亡侧零窗口（A）→ 「死时在飞」标记必须**活在死之前**：sendTurn 开始/结束各写一次的小文件（或 pg 新表）是唯一路数；atomicWrite（:731 先例）与 pg 整表同步（pgStateSync）均有现成管线。
- 跨死亡通信通道有成熟先例：升级流的 `data/updates/status.json` + 前端 2.5s updPoll（update-runner.tpl.js:18「升级期间桥可能已死，这是唯一真相源」；chat.tpl.html:3332/3392「升级器已启动，页面稍后自动重连…」）——桥死后用文件+轮询把状态带给前端，s69 起就在跑。
- 触发点可挂 subscribe（:5009）或 onopen 重拉族（chat.tpl.html:750），两者都是既有代码路径。
- 坑：标记的清除时机（正常 stop 帧 :1636 / error 帧 :780 / 桥重启后的 stale 判定）若不严，会造「假悬空」误报卡；多窗口同 sid 时帧会发给所有订阅者（abortInflightTurns 同语义，可接受）。

---

## D. 漂移源头收窄

### D1. 三个键的全部写回时机（文档核实=源码定位）

| 时机 | 写者 | 位置 |
|---|---|---|
| 首启种子（providers.json 活跃档现读，无档案=**种空值**，s99/S3 裁决） | bootstrap | bootstrap.ps1:145-188 |
| 每次启动幂等补缺 + F-11 陈种子自愈（只认出厂缺省字面值） | bootstrap | bootstrap.ps1:189-216 |
| **providers 帧——含面板纯打开（msg.save=false 也走）**：把活跃档 model/host/key 回写 secrets.env | 桥 | chat-bridge.tpl.js:5351（读写分流）、:5386-5387（`if (act) rewriteSecretsEnv(...)` 无 save 门） |
| save_config（旧设置页路径，只传真值） | 桥 | :5573-5584 |
| 首个档案 add（`list.length===1` 置 active，**needRestart 不置 true**） | 桥 | :5359-5363 |

不写的：switch_model（走 set_config_option/热重启，不碰 secrets，:5407+）；连接测试/健康探针（只读）；faucet-provision（只读 FAUCET_ADMIN_*，faucet-provision.tpl.js:7/19/67）；update-runner（data/ 全程 PROTECTED，update-runner.tpl.js:72）。

即除配流外，**「打开设置面板」本身就会把 secrets.env 改写成活跃档真值**（bootstrap.ps1:148 注释所称「桥的 provider 同步」就是这一步）——漂移源不是保存动作，是 providers 帧的每次往返。

### D2. 「保存时顺手 converge 烧掉漂移」的时序假设——事实基础

先确认漂移的充要条件：桥的 pc 定义 env 三键（process-compose.yaml:117-119 `GOOSE_MODEL=${GOOSE_MODEL_NAME}` 等）由**渲染时的调用方 env** 决定。启动链（启动数字员工.cmd:47 bootstrap → :51 导入 secrets.env → :80 `pc up` 三件套）冷启时渲染空值；wrapper（forge-register.tpl.cmd:72 现读 secrets.env + :64-80 自备 launcher 同款 env）在 D1 之后渲染真值 → Compare 不等 → 只换桥（其余进程 env 不含三键，渲染恒等——nats/pg/goose-scheduler/oneshot 环境块核对 process-compose.yaml:10-109 无一键引用三键）。

逐项验证假设链条：

1. **「converge 需 secrets 已落盘」**：满足。`rewriteSecretsEnv` 是同步 atomicWrite（:46 定义族，:5387 调用），providers 帧发出（:5389）前文件已在盘；wrapper 的 `for /f`（forge-register.tpl.cmd:72）读到必是新值。顺序天然安全。
2. **「桥自己发起 converge、自己被换，update 还能落」**：**本机跑通（arm3）**。victim 自己 spawn `pc project update`（漂移目标是自己）：
   ```
   17:27:08.264  UPDATE_SPAWNED childpid=19060（自己的子进程）
   17:27:08.662  BOOT pid=25392 MARK=two（新化身已起）
   旧 victim 及其 update 子进程被树杀：零钩子日志、无 UPDATE_CHILD_EXIT
   ```
   即调用方树死**不回滚**守护端已受理的 update——「桥跑 converge 自杀」机制上成立。桥驱动 pc 有直接先例：`pcExec`（:2800-2805，execFile pc.exe，读 pc.port）与 `restartSchedulerDaemon`（:3401-3410，`process restart goose-scheduler`）；cmd 包装的先例是 open-when-ready.ps1:157（`cmd /c …forge-register.cmd converge`）。
3. **「保存回执会不会丢」**：丢了能自愈。providers 帧在 converge 前已发出（:5389 在 :5402 热重启判断之前，converge 若加在同点之后）；即便帧死于换桥窗口，前端重连 `onopen` 会重拉 `loadProvidersUI()`（chat.tpl.html:750）——新桥从盘上 providers.json 重读，面板自愈。升级流的「先告知后断线」（chat.tpl.html:3332）是更强的现成范式。
4. **「发生在非回合窗口」**：D1 首配满足（首次配流时无会话可孤儿——iat124 的 E1 回合是配流之后才发生）。**但同代码路径也服务日常改档**：今天 activate/update 活跃档且 sig2 变化时走 `hotRestartProvider('保存')`（:5390-5402），acp 被换但在飞回合能拿到 reject 错误帧（:1813→:1740）；若 converge 无差别叠加，保存点会**额外**杀桥进程 → WS 断 → 前端退化成 C2 的静默收口（比今天的错误帧更沉默）。收敛范围（只首配空→非空时烧，或每次都烧）是产品裁决，不是事实。
5. **首更全表重启的坑位已被占**：守护生命周期内第一次 JSON update 因 PC_REPLICA_NUM int→float64 往返必全表重启（research/34 定案；docs/research/34-s97-f12-hotreg-mechanism-verdict.md:19,25,42）。open-when-ready.ps1:5-10 已把它消耗在开窗前（healthz→converge→再等 healthz→才开窗）——即 **UI 可配流时首更必已烧掉**，保存点 converge 理论上只换桥。边界：开窗 converge 失败/超时被显式放过（open-when-ready.ps1:113-114,162-171「首次注册时再付一次重启代价」）——那种坏启动下，保存点 converge 会替注册付全表重启（时机更好但面更大）。
6. **漂移可判定**：桥知道自己的 pc 渲染 env（boot 时 `process.env.GOOSE_MODEL/OPENAI_HOST/OPENAI_API_KEY` 即 launcher 渲染值）与现行 secrets 值——「定义已陈旧」不必盲烧，可比对后烧（lastSpawnEnv 指纹 :1534 同族思路）。
7. **wrapper 失败模式**（forge-register.tpl.cmd）：secrets.env 读不到时 `for /f` 静默跳过 → 渲染回空值 → **converge 反而把桥打回空 env**（漂移放大而非收敛）；pc.port 缺失回落 8099 可能打错守护。诊断面只有 data/logs/register.log（:85,:88 的 2>> 重定向）。这是 D 路需要防御的点，现状无防御。

### D3. E1 注册侧补强事实（对照）

wrapper 的 s97/F-7 自备 env（forge-register.tpl.cmd:55-80）解决的是「agent shell 被洗净 → 裸 update 渲染空插值 → 全表漂移」；它**刻意**与 launcher 三点恒同（bootstrap.ps1:150「运行值==文件值==桥同步值」），但恒同的前提是 secrets 没变过——D1 恰恰改变了文件值。即 wrapper 行为符合设计，缺口在「文件值变了之后没有第二个烧漂移点」。

---

## E. 升级路径对照

update-runner.tpl.js **完全不走 `project update`**（全文 grep 无该动词；:197 注释还记着 s66 时期死词 shutdown 的教训，正确动词是 down）：

1. `stopStack`（:193-221）：`pc down`（30s 超时）→ 轮询 /processes 等守护真死（20s）→ **精确清杀 8790 残留桥**（:209-218，R2 实录 pc down 会遗留 chat-bridge 子进程）→ 1.2s 静置。
2. 差量换文件（data/ 等全部 PROTECTED，:62-74——secrets.env、providers.json、apps/、apps.env.yaml 都不在升级面内）。
3. `startStack`（:223-226）：`cmd /c 启动数字员工.cmd` **走完整启动器链**——bootstrap 重跑（含 F-11 陈种子自愈，正好吸收升级包带来的键语义变化）→ 全新 `pc up` 全量重渲染。漂移按构造不存在：渲染值=文件值=启动器 env，同一点生成。
4. 前端契约：桥死前页面已显示「⏳ 升级器已启动，页面稍后自动重连…」并起 2.5s updPoll 轮询 /api/update/status（chat.tpl.html:3332/3392）；跨死亡真相源 = data/updates/status.json（update-runner.tpl.js:18）。

**可借鉴的先例**（事实，非裁决）：升级把「定义漂移」问题整体消解为「停世界+全量重渲染」，代价是全栈不可用窗口；它对在飞回合同样不救（WS 死→静默收口），靠**事前告知 + 轮询状态通道**补 UX。D 的 converge 是它的微缩版（只换桥、亚秒级），C 的 status.json 是它的通道复用。

---

## 三条候选修法的事实约束表

| 维度 | B：桥死前发帧（shutdown.command + 告别端点） | C：重连补终态（悬空回合标记 + subscribe 补帧） | D：保存点烧漂移（配流保存顺手 converge） |
|---|---|---|---|
| **前提（缺一不可）** | yaml 加 `shutdown:{command,timeout}`（A2 实测路）；桥加本地告别 HTTP 端点（现无）；端点体=abortInflightTurns+延迟 exit（:1554 同款） | sendTurn 起/止写持久标记（atomicWrite :731 / pgSync 先例）；subscribe(:5009) 或前端 onopen 重拉族（chat.tpl.html:750）挂检查补帧 | rewriteSecretsEnv 先行落盘（天然满足，D2-1）；桥 spawn `forge-register.cmd converge`（pcExec :2800 / open-when-ready :157 先例；arm3 实证自杀式 update 可落） |
| **实测证据** | arm2：SHUTDOWN_COMMAND_STARTED→EXIT_HANDLER_RAN code=0→新化身；窗口=timeout（缺省 10s） | 无现成钩子（C1）；跨死亡通道先例=升级流 status.json+updPoll（E） | arm3：update 客户端随调用方树死，守护端仍完成替换（398ms）；只换桥（三键只出现在桥 env，D2） |
| **覆盖谁** | 页面开着的所有活跃 WS（iat124 现场形态） | 页面关着重开、静默收口后想知情的一切场景；对「桥死」与「网断」一视同仁 | 只防复发（注册零漂移），不救当前孤儿；救的是未来所有 E1 |
| **主要坑** | ① `pc down`/停栈也触发告别（文案需辨）；② 告别端点=无鉴权自杀面，宜加 PC_TOKEN；③ hang 住退化硬杀（有界）；④ 不救页面关着的场景 | ① 标记清除时机错=假悬空误报；② 桥重启后 stale 判定（多久算死局）；③ 需要新状态面（文件/pg）+双端协议，改动面三者最大 | ① 开窗 converge 失败的坏启动下会替注册付**全表**重启（D2-5）；② wrapper secrets 读失败=漂移放大，无防御（D2-7）；③ 无差别叠加会 downgrade 日常改档的在飞体验：错误帧(:1740)→静默断线（D2-4）；④ 告别/回执依赖重连自愈（D2-3，已成立） |
| **被谁覆盖/互补** | 与 C 互补（B 管死前告知，C 管死后告知）；D 落地后 B 的触发场景变稀有（只剩升级/停栈/换机） | B 落地后 C 只剩「页面没开」的残余面 | 根因侧唯一（消漂移本身）；不与 B/C 冲突，三者可叠 |
| **改动面量级** | yaml 1 段 + 桥 1 端点（约 10 行级） | 桥 2 写点 + 1 读点 + 前端 1 帧分支 | 桥 1 spawn 点（判定「定义已陈旧」可选，D2-6）+ wrapper 失败防御（D2-7） |

---

## 排除项与未验证清单

- 未复跑 iat124 主线（任务书明示）；103s 忙碌条时序未复核（C2 标注）。
- `shutdown.command` 在 `pc down` 路的行为未单独实测（源码同路推断，源码核实级）。
- D2-4「日常改档叠加 converge 的体验 downgrade」为机制推断，未做 UX 实录。
- arm1-3 结论仅对 v1.122.0（Commit 23b0aca）负责；pc 升版需复核 stopper_windows.go 是否引入两段式停法。
- 沙盒 C:\PF-TEST\researcher-ef1 已删；未写/停 C:\PF-TEST\s108a 任何状态（只读 netstat/tasklist 对照）。

## 关键文件

- C:\ZCodeWorks\PocketForge\forge\conf\templates\chat-bridge.tpl.js（:46/:204/:492/:729-741/:1534/:1547-1555/:1726-1732/:1750-1761/:1808-1826/:2800-2805/:3401-3410/:5009-5017/:5351/:5359-5363/:5386-5403/:5573-5584）
- C:\ZCodeWorks\PocketForge\forge\conf\templates\chat.tpl.html（:742/:750/:751-755/:780/:1636/:1673-1679/:3332/:3392）
- C:\ZCodeWorks\PocketForge\forge\conf\templates\forge-register.tpl.cmd（:8-10/:33-36/:55-80/:85-88）
- C:\ZCodeWorks\PocketForge\forge\conf\templates\update-runner.tpl.js（:18/:72/:193-226/:232）
- C:\ZCodeWorks\PocketForge\forge\conf\process-compose.yaml（:111-132 桥定义；:117-119 三键）
- C:\ZCodeWorks\PocketForge\forge\conf\bootstrap.ps1（:145-216）；forge\conf\open-when-ready.ps1（:5-21/:113-171）；forge\启动数字员工.cmd（:47-51/:80）
- docs/research/34-s97-f12-hotreg-mechanism-verdict.md、docs/research/39-factory-pg-skipped-rca.md（taskkill 硬杀/exit_code=1/全表重启先例）
