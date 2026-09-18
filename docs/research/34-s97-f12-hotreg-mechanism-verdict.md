# 34 · F-12 热注册残留机理定案（supersede research/33 §未定案问题）

2026-09-18 · 取证研究员 · 目标二进制本机实证：process-compose **v1.122.0，自报 commit 23b0aca**（`pc version`）。
源码基线：上游 tag v1.122.0 → commit 673850d；`git diff 23b0aca 673850d` 仅 `default.nix` 一行（打包文件），Go 源码与二进制构建点一致。上游 main 最新提交即 23b0aca/673850d（2026-08-17 后零开发）→ **无新版可升级**。

标签约定：VERIFIED-DOC=源码行号引用；VERIFIED-RUN=本机隔离微型 pc 实例（127.0.0.1:18099，独立 root C:\PF-TEST\f12-min，已整删）复现命令+输出；UNRESOLVED=证据不足，诚实挂起。

---

## 一、结论一览

| # | 问题 | 裁决 |
|---|------|------|
| ① | update 漂移对比字段集 | Compare=16 简单字段直比 + 12 复合字段 DeepEqual（含 readiness_probe/availability/environment/extensions/depends_on/vars/args/success_exit_codes 等）。**不含** launch_timeout、schedule、entrypoint、monitor 等。VERIFIED-DOC |
| ② | 比较语义 | 纯 Go `!=` 与 `reflect.DeepEqual`，无任何归一化 → 大小写敏感（QA P2-2 活体结论的源码坐实）。VERIFIED-DOC |
| ③ | 新增进程是否连带重启他进程 | **否**。UpdateProject 只重启 Compare 判不等者；新增者单独 add。依赖链不参与连带。VERIFIED-DOC+RUN |
| ④ | update 是否等新进程 readiness | **否**。addProcessAndRun 异步 goroutine，handler 立即返回；LaunchTimeout 只用作 is_daemon 的 stdout 排空超时，非 readiness 门。错探针 app 实测照常 1 秒完成注册。VERIFIED-DOC+RUN |
| ⑤ | 冷启后首次 update 同定义仍重启一次 | **定案：Vars 类型漂移**。`Vars=map[string]any`，templater 给每个进程恒注入 `PC_REPLICA_NUM`（int）；update 走客户端 JSON 往返 → int 变 float64 → DeepEqual 判不等 → 全表 "updated" 重启一次；之后存储侧收敛为 JSON 形态 → 第二次起 no-op。服务端 reload 路径无 JSON 往返 → 实测不漂移。VERIFIED-DOC+RUN |
| Q2 | 配方 A 桥双重重启谁发起 | 单次 update 对桥的重启发起者=UpdateProject→UpdateProcess（removeProcess=taskkill /F /T 硬杀+addProcessAndRun）。**"二次"计数与 ">10 分钟挂起" UNRESOLVED**（pc 层已排除，见 §五） |

## 二、核心机理：冷启后首次注册=全表重启（F-12 三次实录签名）

update 客户端把渲染后的项目 JSON POST 给守护（client/project.go:51 → POST /project，api/pc_api.go:497）。JSON 往返对 `map[string]any` 型的 Vars 施加 Go 数值类型变换：loader/templater 侧 `proc.Vars["PC_REPLICA_NUM"] = proc.ReplicaNum`（templater.go:32，int）→ 客户端 marshal → 服务端 unmarshal 成 float64。Compare 的复合字段表含 Vars（process.go:158-176，reflect.DeepEqual）→ **每个进程都判 "updated"**（process_runner.go:1781 UpdateProject 逐进程比对，不等者 UpdateProcess=removeProcess+addProcessAndRun=重启）。

重启的连带面：任务树被 taskkill /F /T 硬杀（command/stopper_windows.go，exit_code=1）→ chat-bridge 死一次重活一次（=pc.log "ACP initialized" +1，在飞回合孤儿化）→ daily-backup oneshot 重活（=备份 zip 时间戳=注册秒）。**s97b/d/g 三次实录签名与之一字不差。**

「2-4 分钟窗口」不是 pc 时序条件，是行为模式：agent 总把注册作为冷启后第一个 update——**伤害只发生在"该守护进程生命周期内的第一次 JSON update"**，此后收敛，同栈后续注册全绿（与 s97e 受控栈零增长、QA 隔离实录"第二次起 no-op"全部吻合）。QA 建议级#2 推测的"我方最小 yaml 与产品配置表示差异"**被推翻**——任何 yaml 都中招，包括 PocketForge 全表。

### 实验证据链（全部 VERIFIED-RUN，除非注明）

1. **E1 漂移复现**（3 行极简 yaml：仅 command）：守护起后第一次 `pc project update -v -f 同文件` → `↺ qabridge updated`（exit 0）；同命令第二次 → `No processes were updated`。守护 debug 日志：`Process qabridge is updated`×2（UpdateProject 分类+UpdateProcess 复核）→ `Stop Windows process. pid=…` → `Exited exit_code=1` → `Started`（重启）；第二次 update → `Process qabridge is up to date`。
2. **表示三方恒同**：update 前 `/process/info`（存储态 PRE）、update 客户端实际 POST 体（node 假服务捕获 INCOMING）、update 后存储态 POST——三者 JSON 逐字段**字节恒同**。⇒ 漂移字段被 omitempty+JSON 渲染双重掩蔽（int vs float64 显示同为 `0`）。
3. **分叉实验（决定性）**：同一新守护上 `POST /project/configuration`（ReloadProject，服务端 loader 加载、无 JSON 往返，routes.go:76）→ `{}` 零更新、连跑两次恒 `{}`；随后客户端 `project update` → `updated`。⇒ 差异只在 JSON 往返，不在 loader。
4. **载体验排除**（每变体独立冷实例、逐次核对 18099 监听者身份）：+非空 `environment` / +`success_exit_codes` / +未知键（→extensions inline map）/+真实 `depends_on` 四变体首更**仍全表 updated**。四个 omitempty 容器嫌疑全排除；Compare 集中唯一带 `any` 值且被恒注入的字段只剩 Vars（types/project.go:10 `type Vars map[string]any`），且能同时解释普适性与收敛性。
5. **E2 全签名复现**（桥模拟 daemon+exec 探针+oneshot 备份模拟+错探针端口 app）：`update -v -f base -f app` → `▲ rich-app added / ↺ qabridge updated / ↺ qbackup updated`；oneshot 落盘标记 1→2（=daily-backup 重跑）；**update 1 秒返回 rc=0**（错探针 app 不阻塞）。

## 三、①②③④ 源码定案细节

- **字段集**（process.go:127 Compare）：直比=Name/Disabled/IsDaemon/Command/LogLocation/ReadyLogLine/DisableAnsiColors/EnvFile/WorkingDir/Namespace/Replicas/Description/IsForeground/IsTty/IsInteractive/IsElevated；DeepEqual=LoggerConfig/LivenessProbe/ReadinessProbe/ShutDownParams/Vars/Extensions/DependsOn/RestartPolicy(availability)/Environment/Args/Watch/SuccessExitCodes。forge-meta（yaml inline）入 Extensions 参与；大小写、顺序、int/float64 类型都敏感；**无路径归一化**（P2-2 case 漂移面源码坐实）。
- **流程**：UpdateProject（project_runner.go:1781）顺序=删→增→改，全程无 readiness 等待；新增进程 addProcessAndRun（:1549）仅 spawn goroutine（runProcess :279 → go func→waitIfNeeded）。readiness 探针失败=进程停留 Launching，无失败无重启（依赖它的 process_healthy 等待者被阻塞，但都不阻塞 update handler）。
- **LaunchTimeout 语义**（process.go:234-237）：仅 is_daemon 的 stdout/stderr 排空等待上限（默认 5s，types/process.go:20），**不是 readiness 闸门**，与 launch 挂起无关。
- **Windows 重启实现**：removeProcess（project_runner.go:1530）→ shutDownNoRestart（process.go:488）→ taskkill /F /T /PID + Process.Kill 双保险（stopper_windows.go）→ `running.waitForCompletion()`（:1530-1543 → process.go:399）同步等退出，**无超时**。正常进程 ~100ms 完成；唯一永挂条件=不可杀进程（内核态卡死）——pc 层无其他挂起机制（E2 实测 1s）。
- **Windows 无 detached**：`up -D` 仅非 Windows 注册（cmd/up.go:48 `if runtime.GOOS != "windows"`）——启动器隐藏窗口前台跑 pc 的原因，源码坐实。

## 四、修向建议（按机理+证据排序，不给代码）

1. **根治｜启动器收尾自愈 update**：pc up→healthz 后、开 welcome 窗前，启动器以与 wrapper 恒同的 env+文件集静默跑一次 `project update`（此时无在飞回合，全表重启无害），把 Vars 漂移的一次性伤害消耗在冷启收尾；再等一次 healthz 后开窗。此后 agent 首次注册=no-op 添加（E1/E2 已证收敛持久）。代价：冷启链 oneshot（faucet-rawsql/daily-backup）多跑一轮——两者幂等性已有 e2e 覆盖。**唯一能真正消除 F-12 签名的方案**（教法无法规避：reload 不收敛 Vars，实测`{}`；二次 update 是伤害后补救）。
2. **缓解｜wrapper 注册返回前等桥 healthz**：注册命令到"桥可用"才返回，配合 hints 明示「注册瞬间桥可能重启、在飞回合会被孤儿化、稍候重发即可」——把用户可见伤害（无终态回复）压到最小，与 F-10 timeout≥300 教学同面。
3. **上游｜报 issue**：附最小复现（reload no-op vs update drift + `Vars=map[string]any` int/float64）报 process-compose 上游；Compare 对 Vars 应做类型归一或用 JSON 形态比较。上游无新版可升（main=v1.122.0）。
4. **教法保留｜探针端口失配本身无害**：update 不等 readiness（④），错探针只导致该 app 永远 Launching。模板教法已足，可选加 e2e 锚。
5. **不做**：wrapper 检测桥 PID 变化重试（治标+竞态）；注册前"等栈沉降"门（机理已证与 daily-backup 排队无关，F-10 的 timeout 教学已覆盖慢 update 场景）。

## 五、UNRESOLVED（诚实挂起，附下次实验条件）

- **配方 A 的 ">10 分钟挂起"**：pc 层已证 update 即使错探针也 1 秒返回（E2）。候选假设：
  (a) 桥重启孤儿化在飞回合 → agent 侧工具调用"看起来"挂起（与 s97c "(no output)" 形态同构）；
  (b) 真实栈某进程恰处不可杀态，removeProcess 的无超时 waitForCompletion（process.go:399）真挂 handler。
  判别条件：f12a 沙盒冷启 + 守护 `PC_LOG_LEVEL=debug`（PC_LOG_FILE 定向）+ wrapper 注册全程时间线对照 pc.log。**当前被阻塞**：dev 栈 pc 守护已死但其孤儿桥（node，pid 22120）占 8790、孤儿 pg 占 5432，沙盒默认端口必撞，铁律不可杀 dev 残留——需先由主会话裁决 dev 残留清理。
- **配方 A "ACP +2"（桥二次重启）**：pc 单次 update 对桥至多重启一次（E2）。候选：(a) ACP 计数语义混杂——journal 已警示页面重连触发桥 goose 惰性再初始化（非重启）也会 +1；(b) 桥自身 crash→on_failure 重启（ring 无哭诉，无证据）。倾向 (a)，未定。
- 配方 A "daily-backup 未重跑" 与 "冷启栈" 的矛盾（首更必全表重启→备份应重跑）：提示 s97g 配方 A 的"冷启栈"此前可能已发生过 JSON update（Vars 已收敛）——需 s97g 原始时间线才能裁，沙盒已删。

## 六、观测工具自干扰记录（教训）

- node 假服务（dump-server）被 TaskStop 后**进程存活**继续占 18099，对一切 POST 回 200 `{}` → 先后 4 个"变体 no-op"结论全部作废（含一次 min.yaml 复跑）。此后每轮实验强制核对 `netstat` LISTENING pid → `Get-Process` 进程名。假服务"no-op 万能响应"与 pc 的 `No processes were updated` 输出同文，极具迷惑性。
- 实验 harness（bisect.sh/prepost.sh/e2run.sh 的核对逻辑）已随 f12-min 目录整删，核对模式记录于此。
- 本机 pc 独立微型实例（高位端口+独立 root）未触碰 dev 栈；dev 侧只读 GET（8790 healthz=200、8099 无监听）。

## 七、与既有账面的对账

- research/33 §未定案问题 1（update 判据/readiness/连带）→ 本文 §一①②③④ 定案；问题 2（富 yaml 为何 2-4 分钟窗口触发）→ 定案为 Vars 首更机理，与启动收尾链无关（"沉降门"假设证伪）；问题 3（修向）→ 本文 §四。
- tmp/qa-s97-late-review.md 建议级#2（"冷启后首次 update 单次重启"UNVERIFIED）→ 升格 VERIFIED-DOC+RUN，机理如 §二。
- research/31 §2 "定义一致的不动" 推断 → 限定修正：**仅在无 JSON 往返（reload）或已收敛（第二次起）时成立**；JSON update 首次恒漂移。
