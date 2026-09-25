# 39. 出厂首启 pg | Skipped | restarts=0 | exit=1 根因取证（iat22 发现）

- 日期：2026-09-23 ｜ 执行：pf-research ｜ 沙盒：`C:\PF-TEST\arm1a/arm1b/arm1c/arm2/armdelay`（**已整删，零残留，dev 栈全程零触碰**）
- 证据仓：`tmp/rca39/`（各臂 `*-ev1/` 快照+日志、`*-sampler.tsv` 100ms 状态采样、`rca39` 复现脚本）；pc 源码 `tmp/pc-src/`（F1bonacc1/process-compose tag v1.122.0；包内 `bin/pc/process-compose.exe` version=v1.122.0 commit=23b0aca，tag 对象=673850d——二者等同性因 GitHub API 限流未直证，以行号吻合旁证同版：本树 `UpdateProject` 恰在 project_runner.go:1781，与 research/34 对同一二进制的独立引注逐字一致）
- 证据分级：VERIFIED-RUN=本会话沙盒活体实测；VERIFIED-DOC=源码/仓库文档/commit；REPORTED=引自 iat22 任务简报（其原始沙盒已删）；UNVERIFIED 见文末

## 0. 结论一句话

**open-when-ready 的 converge（s97/F-12 引入、s98/R2 `fc5464a` 沉降早退改坏了等待判据）在 initdb 仍在跑时触发 `pc project update` 全表重启：update 用 `taskkill /F` 杀掉 pg-init（exit=1），pg 的 `waitIfNeeded` 拿到依赖 exit≠0 → `wontRun()` → `Skipped`（pc 合成 exit_code=1）且永不复查；第①/②层防护的键集只收 `is_daemon:false`，pg（daemon）两层全漏。单变量= `fc5464a`（2026-09-19 08:08，s98/R2 沉降早退）。**

## 1. 现象

iat22（REPORTED，原沙盒日志已删；`tmp/qa-s100/pc-round2.json`/`pc-round3.json` 为留存 JSON，VERIFIED-DOC）：

- 出厂全新解压+降权冷启 3/3：`pg | Skipped | restarts=0 | exit=1`（两份 JSON 逐字：`"status":"Skipped","restarts":0,"exit_code":1,"pid":0,"start=None"`），无 `pg.log`、5432 零监听；`pg-init Completed exit=0`（集群有效）；聊天/LLM/配置链不受影响。
- 手工 `pc process start pg` → Running+Ready（REPORTED）。
- 时间线（REPORTED）：pg 依赖评估 00:27:35.460 早于 pg-init 完成记录 .498（38ms）→ Skip 后 pc 永不复查；pc-round2/3 里 pg Skipped（.132/.606）都**先于** pg-init 重跑启动（.143/.622，差 11-15ms）再完成（.186/.681，44-59ms）——与本会话 arm1 采样同形（见 §2），即 pg-init **首跑记录被 update 后的重跑覆盖**（pc `newIncarnationState` 只留最新化身，源码 VERIFIED-DOC）。

## 2. 矩阵（沙盒受控实验；各臂唯一差异=标注的单变量）

环境偏差（**所有臂统一**，不进单变量）：dev 栈共存所需端口平移 nats 4222/8222→14222/18222、桥 8790→18790（`conf/process-compose.yaml` 4 处 + `open-when-ready.ps1` `$Port`），pc/faucet/pg 由 bootstrap 自动拾 8100/8091/5433。降权=runas /trustlevel:0x20000（e2e.sh 同款 GBK wrapper），启动为包内 `启动数字员工.cmd` 原路径。解压=Python zipfile UTF-8（Info-ZIP unzip 会把中文名写成乱码，弃用）。

| 臂 | 单变量 | 冷启结果（pg） | pg-init.log | 其它实证 |
|---|---|---|---|---|
| arm1a | 正常冷启 | **Skipped exit=1 终态**（start=None；skipped end=01:39:49.882 → pg-init 重跑 49.890→49.967，差 8/85ms） | 720B，截断于 `syncing data to disk ... `（无 `ok`/`Success`） | converge rc=0；nats 两次启动=42.444/49.504（update 全表重启锚）；backup.log `pg_dump skipped: 未就绪（首启时序，正常）`×2+zip ok；db/overview `{"ok":true,"services":[]}`；全部日志 0×「没连上数据库」 |
| arm1b | 同上 | **Skipped exit=1 终态**（sampler t16.401：pg-init 首跑 pid11520 被换 12284 同刻 Skipped；首跑 initdb 已跑 5.94s 被杀） | 720B 同截断 | 手工 `pc process start pg` → rc=0，**5433 开听**（绕过实证=VERIFIED-RUN） |
| arm1c | 同上 | **Skipped 瞬态（322ms）→ 自愈**：t16.173 Skipped → t16.495 新化身 Launching/Ready，pg-init 重跑 10.493→10.646 | 720B 同截断 | r1/r2/r3 全快照 `Launching ready=Ready restarts=0`；5433 开听（update 顺序运气，见 §3-4） |
| iat22 ×3 | 正常冷启 | **Skipped exit=1 终态 ×3**（REPORTED + JSON 留证） | 720B 三轮字节同（REPORTED） | — |
| **arm2** | **跳过 converge**（`open-when-ready.ps1` 内 `if ($false)` 抵掉第①②层+converge 整块；r-launch 0×「converged」） | **Running+Ready**（pg-init 首跑完整 01:57:48.060→56.478=8.42s Completed；**pg start=56.497=完成后 19ms**，restarts=0） | **901B 完整**：`syncing data to disk ... ok` + `Success. You can now start...` | **`pg_dump ok` ×2（1KB+4KB）**+`pg usage backfill ok`+`pg wsmap reconcile`（桥进 pg 态）——健康基线反向对照 |
| armdelay | converge on + `bin/pg-init.cmd` 加 `ping -n 3`（+2s 延迟 initdb） | **仍 Skipped exit=1 终态**（r3 start=None；重跑 10.367→10.421=54ms） | 723B 同截断（`... to disk ... ` 无 ok） | converge rc=0；**变窗不救**——窗口不是 38ms 运气，是「initdb 在飞 ∩ update」秒级结构窗（initdb 全程 6.8-8.4s，杀点恒在开跑后 5.9-6.8s） |
| s93 发布门 ×3（09-15，pre-converge） | — | pg Ready restarts=0 **3/3 绿**（VERIFIED-DOC `tmp/s93-release-gate-qa.md` G1/G5） | — | 冷装基线 |
| iat14（09-19 03:36，pre-R2） | converge on | pg 在跑（findings 记「converge 重启窗口 pg connection forcibly closed→recovery」良性 WARN，VERIFIED-DOC `tmp/s98-iat14-r1-findings.md`） | — | rel152 同型绿 |
| iat18（09-19 17:47，post-R2 包 17:36 出） | converge on | **pg Skipped 被 QA 记为「无应用注册的正常首启态」判 PASS**（VERIFIED-DOC `tmp/s98-iat18-findings.md` §一）——**红被误归一化的实录**；同轮 goose-scheduler 也 Skipped | — | R2 入仓当天即已发生，iat22 才重新发现 |

判定：复刻签名逐字一致（`pg | Skipped | restarts=0 | exit=1`、pg-init Completed、手动 start 可救、720B 截断同字节形态）；**arm1 三轮=签名 3/3 出现，终态 2/3（a/b），c 轮 322ms 后自愈**（自愈条件见 §3-4；iat22 3/3 均终态）。**arm2 单变量证明 converge 是真凶：跳过 converge → pg Running+Ready + dump 成功 + pg-init.log 完整。**

## 3. 机制（源码 VERIFIED-DOC + 活体 VERIFIED-RUN）

### 3.1 冷启时序（以 arm1b 为锚，wall=2026-09-23）

1. `pc up`（≈+10s）：pg-init 首跑 initdb 开始（pid11520）；pg `Pending`——`waitIfNeeded` 在 `waitForCompletionOrAbort` 上正确挂起（sampler 10.46→16.4 恒 Pending/Running ✓）。initdb 自然全程 **8.42s**（arm2 实测 48.060→56.478）。
2. 桥 healthz 首个 200（≈+13s，initdb 中段）→ open-when-ready 第①层沉降：**R2 判据只挡 `Pending/Restarting`，pg-init `Running` 放行**（现行码 `open-when-ready.ps1:139`；17d0d43 原判据挡 `Pending/Launching/Running`，`git show 17d0d43:...:125` VERIFIED-DOC）→ settle 立即通过。
3. `forge-register converge` → `pc project update`（三件套）→ **首更 Vars(PC_REPLICA_NUM) int→float64 漂移 → 全表 9 进程 Compare 不等**（research/34 已定案；本版源码 `templater/templater.go:32`、`types/project.go:10`、`process.go Compare` VERIFIED-DOC）→ `UpdateProject`（`project_runner.go:1781`）逐个 `UpdateProcess`（`:1865`）=`removeProcess`（**`command/stopper_windows.go` taskkill /F /T，硬杀**）+`addProcessAndRun` 新化身。
4. initdb 开跑 ~5.9s 处被杀（arm1a/1b/c 杀点 5.9-6.8s，恰在 converge 落点 ±1s；iat22 JSON 同形）→ 被杀 pg-init 实例 exit=1（taskkill 硬杀族，research/34 VERIFIED-RUN 同款）。
5. **pg 的 `waitIfNeeded`（`project_runner.go:362`）**：`ProcessConditionCompletedSuccessfully` 分支 → `waitForCompletionOrAbort` 返回 exit=1 → `IsExitCodeSuccess(1)=false` → `fmt.Errorf("...exited with status %d")` → 外层 `proc.wontRun()`（project_runner.go:331）→`onProcessEnd(ProcessStateSkipped)`，**`process.go:1065-1066 onStateChange: Skipped → setExitCodeLocked(1)`——JSON 里 exit=1 是 pc 合成的，不是 pg 退出码**（pg 从未被 spawn，start=None）。
6. **永不复查**：Skipped 是该化身终态；无 watcher/无事件重评。update 随后重跑的 pg-init（PG_VERSION 已在首跑早期写盘 → `exit /b 0` 44-107ms Completed exit=0）**不会唤醒**已终态的 pg。第②层补跑键集=`Get-OneshotKeys`（`is_daemon:false`）+硬编码回落四键，**pg 是 `is_daemon:true`，两层防护都不含 pg**（`open-when-ready.ps1:77-91/118/187-198` VERIFIED-DOC）。
7. 空档日志：`pg-init.cmd` 用 cmd `>>` 把 initdb 输出直写文件（**不经 pc 管道**——pc.log 零 pg-init 行实证），被杀时 CRT 缓冲尾部（`ok\r\n\r\nSuccess...`）未 flush → **720B 恒定截断**；arm2 未被杀=901B 完整同路径对照 → **排除「pc stdout 缓冲截断」「initdb 没写」两假说（VERIFIED-RUN，同沙盒类单变量对照，无需 strace）**。

### 3.2 `exit=1` 语义与 Skipped 判据（arm3 要求，源码 VERIFIED-DOC）

- 依赖记录不存在：`getDoneOrRunningProcess` 返回 nil → 只 `log.Error("...isn't running or completed")` 后**继续循环 → 返回 nil → 进程照跑**（不 Skip）。
- 依赖实例存在但 exit≠0 / 被中止（healthy 探针 waitFailed 同族）→ error → `wontRun()` → `Skipped`；`onStateChange` 强制 `exit_code=1`。
- `Skipped` 非项目级致命（`onProcessSkipped` 仅 `exit_on_skipped` 时才关项目；pg 未配 → 只留面板红）。
- **`pc process start pg` 为何绕过**：`StartProcess`（`project_runner.go:707`）→ `runProcess` → **重新走一遍 `waitIfNeeded`**，此刻 pg-init 查到的是 done(0) 新化身 → 成功 → 正常起（arm1b 活体 rc=0+5433 开听 VERIFIED-RUN）。
- Go map range 随机序是「终态 vs 自愈」的分水岭（§3-4）。

### 3.3 变窗实验结论

pg-init +2s（armdelay）：initdb 照样在 update 落点处被杀（开跑 ~4.4s 处），终态 Skipped，723B 同截断。**iat22 的 38ms 不是敏感竞态窗**——那只是「杀点→pg-init 重跑完成」的观测间隙（本会话 52/63/85ms 波动）。真窗口=「initdb 在飞（6.8-8.4s）× converge 落点（healthz 后秒级）」的秒级重叠；提前/推后 initdb 秒级都不翻转结局，只有**让 converge 落在 initdb 完成之后（R2 前行为）或干脆不 converge（arm2）**才绿。

### 3.4 arm1c 自愈与「3/3 复现」的边界

`UpdateProject` 的 `for name := range updatedProcs` 是 Go map 随机序：

- **pg 先于 pg-init 被 update**：新 pg 化身查到「正在被杀/已杀的旧 pg-init」→ exit=1 → 终态 Skipped（arm1a/arm1b/iat22×3/armdelay）。
- **pg-init 先被 update**：新 pg-init 实例已 Running，随后 pg 的新化身等它 → 0 → 起（arm1c；但**原化身仍先吃一次 Skipped 瞬态 322ms**——签名仍逐字出现）。

故「3/3 复现」在**签名层面 6/6 全中**（本会话 3+iat22 3；arm1c 也中过一瞬），**终态层面 5/6 红**。红倾向非均匀的成因（旧 initdb 被杀的时序、map 序分布）未做统计定论 → UNVERIFIED。

## 4. 影响面定级

### 4.1 yaml 自注「阶段一全仓零消费者」——**已被阶段二推翻（VERIFIED-DOC，注释已过期）**

- `process-compose.yaml:80`「阶段一全仓零消费者——pg 失败仅本面板红」——阶段二裁决 `docs/verdicts/2026-09-05-pg-phase2.md` 四条 doctrine 生效（同文 §1，落 `STATE.md:146`）：**①新存储默认 PG，每应用一库 forge_<app>；③导出先行恒在：pg_dump 每日随 forge-backup；④消费方失败面闭合集（回落文件/降级禁用/lazy 连接/桥零 depends_on 指向 pg）**。裁决原文「本条是纪律不是代码」只限定①的 app 侧；③④已有代码。

### 4.2 pg 死时的消费者清单（arm1 实证 + 源码）

| 消费者 | pg 死时行为 | 证据 | 失败面闭合? |
|---|---|---|---|
| daily-backup `pg_dump`（`forge-backup.js:18/44-104`） | `waitPgPort(30s)` 超时 → `err='PG port not open within 30s'` → 命中「信息级」白名单 → 每天打 `pg_dump skipped: <db> 未就绪（首启时序，正常），下次备份会带上`×2，zip 照常 | **VERIFIED-RUN** arm1a backup.log；arm2 对照 `pg_dump ok`×2 | ✅闭合，**但文案谎报**：永久 Skipped 被说成「首启时序，正常」→ 导出先行（doctrine③）在每台新装机上静默永死 |
| 桥 pgstore/`forge_bridge`（`chat-bridge.js:264-530`） | s92 探针门：端口不通 → `mode='connecting'`→2s→`off` 无限静默重探，**永不告警、永不降级出 file 态之外**；`CREATE DATABASE forge_bridge` 不发生；wsmap/usage 留文件态 | **VERIFIED-RUN** arm1a 全日志 0×「没连上数据库」+ 0×「pg … reconcile」；arm2 出现 `pg usage backfill ok`/`wsmap reconcile` 反证 | ✅闭合（doctrine④设计即此）+ **静默**（用户无从得知 PG 死了） |
| data 面板 `GET /api/db/overview` | **不红**：`{"ok":true,"services":[]}`（faucet CLI/sqlite 面，非 pg 面） | **VERIFIED-RUN** arm1a/db-overview.json | 不受影响 |
| 聊天/LLM/配置主链 | 不受影响 | iat22 探针 56 PASS（REPORTED）+ arm1 healthz/ACP/回合行正常（VERIFIED-RUN） | 不受影响 |
| agent 建 PG 库 | **消费者不存在**：`.goosehints`/`goose-hints.tpl.md` 只教 faucet REST 建库（grep postgres/psql/5432=0），`_app-template.yaml` 零 PG 引用——doctrine①「纪律不是代码」现状未变 | VERIFIED-DOC | 无实录可取 |
| 附带：goose-scheduler（`depends_on: faucet healthy` daemon） | 同族风险（update 杀 faucet → 同机制 Skipped），iat18 实录 Skipped 一次；本会话 3 臂均侥幸 Launching | VERIFIED-DOC（iat18 findings）+ VERIFIED-RUN | 两层防护同样不含它（daemon） |

### 4.3 定级建议：**P2**

- 不升 P1：用户主链（聊天/LLM/配置）无损、零数据丢失、面板不红、失败面按 doctrine④ 全闭合、`pc process start pg` 一键可救。
- 不降 P3：阶段二已立轨（STATE:146 ①③、phase2 裁决）——**pg 不再是「零消费者的面板装饰」**；出厂路径签名 6/6 出现、终态 5/6 红、R2 后 iat18 起已多次出现且被误判「正常首启态」（QA 判据缺口=红当绿）；§8 出厂验收线回归；backup 文案把永久故障谎报为正常时序=静默失效放大器。
- 若维持 P2，须挂三条验收：①出厂冷启 `pg Ready restarts=0` 逐字断言回归探针（s69/s74/s93 曾绿，tools/e2e/cold-surface-probe.js 头注本有此断言）；②backup 对「端口永不就绪」与「首启时序」分流文案；③iat/findings 判据禁再把 `pg Skipped` 归一为正常。

## 5. 修法候选 + 取舍

| # | 方案 | diff | 取舍 |
|---|---|---|---|
| **A（推荐）** | `open-when-ready.ps1` 第①层：等待键集里对 `pg-init` 用**终态判据**（要求 `Completed`，即 17d0d43 口径对这一个键特判；R2 早退对其它 oneshot 保留省时），或等价「pg 离开 Pending 才 converge」；第②层补跑名单把 `pg` 加进（`pc process start pg` 幂等，s98/R1-F3 的 2s 瞬态复核已容错 rc=1） | ~5 行 ps1 | 最小 diff、复用既有两层结构、对出厂路径足够（冷启唯一 updater 就是 converge；agent 注册 update 发生在 initdb 完成后，窗口≈0）。不根治 pc 上游竞态 |
| B | 同 A 的另一半表述：layer1 直接照 17d0d43 原判据全回滚（`Pending/Launching/Running` 全挡） | ~2 行 | 简单，但重付 R2 修掉的「等全终态吃满 30s 冷启 35→54s」问题——只对 pg-init 特判（A）避开该回滚 |
| C | yaml 去掉 `pg depends_on pg-init`（或 pg command 前置等待） | ~2 行 | ❌ 不推荐：initdb 未完时 postgres 起崩，`max_restarts:3` 后面板红，把 Skip 换成 crash-loop；丢掉 pc 层依赖语义 |
| D | 上游 issue：update 重建窗口内依赖重评/旧实例杀序保证（research/34a 先例，已有源码行号弹药） | 0（产品侧） | 根治全场景但周期不可控，不能解燃眉 |
| E | 桥侧兜底：检测 pg `Skipped` → `process start pg` 自愈 | 中 | 治标、把「出厂死」变「秒级自愈」；违反最小 diff 优先级，宜作 A 的备份层而非首选 |

**建议：A 落地 + D 提上游 + §4.3 三验收。**

## 6. 历史对照（git VERIFIED-DOC）

| 时间 | commit | 事件 | 出厂 pg |
|---|---|---|---|
| 09-15 | s93 门（`tmp/s93-release-gate-qa.md`） | 冷装 ×3 | **绿 ×3**（pg Ready restarts=0）——converge 尚不存在 |
| 09-18 00:46 | `6cbc0f7` | open-when-ready 引入（只等 ready 开窗，无 update） | 绿 |
| 09-18 08:59 | `5bbf70c` | **s97/F-12 converge 引入**（首更全表重启自耗在开窗前） | — |
| 09-18 10:40 | `17d0d43` | 发布门修：rel151 红（converge 撞 oneshot 判定窗 → backup/provision/rawsql/goose 全 Skipped exit=1，**同族机制已知，但键集只圈 oneshot**）；layer1 等**全部 oneshot 终态**+layer2 补跑。rel152 验证记「四 oneshot Completed/**goose+pg Running**/五端点 200」 | **绿（发布门断言过出厂 pg Running）**——commit message 原文；发布说明正文未复述 pg Ready，挂账只有「受限令牌 pg-init exit 1（观察项，未复现，与本现象不同族：本会话 pg-init 三轮全 exit=0）」 |
| 09-18 11:01 | `cc883a8` | **v0.9.15 发布（不含 R2）** | 绿（rel152 口径） |
| **09-19 08:08** | **`fc5464a`** | **s98/R2 沉降早退：layer1 阻塞集 `Pending/Launching/Running`→`Pending/Restarting`（Launching/Running 放行）→ converge 可与 initdb 重叠** | **←单变量引入点（v0.9.16-iat* 全含）** |
| 09-19 17:47 | iat18（包 17:36） | pg Skipped 被记「无应用注册的正常首启态」判 PASS | **红被误归一化（首见即漏判）** |
| 09-23 | iat22 3/3 + 本会话 6 臂 | 重新发现/定案 | 红（签名 6/6、终态 5/6） |

结论：v0.9.15 发布门**曾断言**出厂 pg Running（rel152，pre-R2，有效）；竞态窗口由 `fc5464a` 单变量打开。pre-R2 残留风险仅剩 layer1 30s 超时兜底（initdb>30s 时仍会撞），A 方案把 pg-init 改终态判据后连此残口也封上（cap 内 initdb 实测 6.8-8.4s）。

## 7. UNVERIFIED / 边界

1. iat22 原始 pc.log 与 00:27:35.460/.498 时间线：原沙盒已删，本报告引自任务简报（REPORTED）；等价 ms 级时间线以本会话 sampler/JSON 重建（VERIFIED-RUN）。pc-round2/3 判为「另一轮全新冷启的同形记录」系据 pg-init 44/59ms 重跑+覆盖特征推断（原日志不可复核）。
2. 终态红 5/6 vs 自愈 1/6 的偏度：机制=updatedProcs 的 Go map 随机序（源码级），但未做统计定论（n=6）。
3. 被杀 initdb 的集群深检：arm1b 手动 start 后仅验证监听 5433，未跑 psql/pg_ischeck 全检（iat22 REPORTED Running+Ready 同口径）。
4. 端口平移（8790/4222→18790/14222 等）为 dev 共存环境偏差：各臂统一、不进单变量；结论不依赖端口值，但**未做平移前的原端口逐字复刻**（dev 栈占端口，§8.1 禁碰）。
5. v0.9.15 挂账「沙盒受限令牌 pg-init exit 1」：本会话三轮均 exit=0，未复现、未归因（与本现象不同族，留待原报告条件）。
6. `data/logs/pg.log` 0 字节：已知受限令牌 F1 家族（`chat-bridge.js:485` 注释实测记录），本会话 arm1c pg 存活时亦 0 字节，与本 RCA 无关，未深挖。
7. pc 源码同版性：tag v1.122.0（673850d）与二进制戳记 23b0aca 的等同性未直证（GitHub API 限流）；行号旁证见文首（research/34:1781 逐字吻合），且本 RCA 全部机制结论均有活体实验兜底，源码只承担定位与引用。

## 8. 收尾核对

- `C:\PF-TEST` 整删后为空；PF-TEST 下零进程（Path 前缀扫描 CLEAN）；沙盒端口 18790/14222/18222/8100/5433/8091 零监听。
- dev 栈零触碰：5432/8099/4222/8222/8790 监听 PID 与实验前一致（25544/18300/11764/11764/13972），healthz `ok`，`pg Launching ready=Ready restarts=0`。
- 产品树零修改：改动只发生在已删沙盒副本；仓库新增仅本报告；`tmp/rca39/`（脚本+证据）与 `tmp/pc-src/`（上游源码）在 tmp 暂存区。

## 9. s102 附记：goose-scheduler 同族敞口定案与收口（2026-09-25）

§4.2 附带行（goose-scheduler 同族风险）由 s102 取证定案并工程收口（完整报告 `tmp/s102-sched-rca.md`，暂存区不入库）：

1. **机制（源码级细化）**：healthy 型 depends_on 挂起是**一次性闩锁**——goose-scheduler 化身闩在已 Ready 的 faucet 上立即 waitOk（research/39 三臂全 Launching 的机理，非侥幸）；闩在 **pre-Ready 且随后被 converge taskkill** 的 faucet 实例上才 waitFailed→wontRun→Skipped 终态。实录两次：rel151（17d0d43 提交信息）与 iat18（`tmp/s98-iat18-findings.md:20`）。
2. **最小正确集=带 depends_on 的 daemon 全体**={pg, goose-scheduler}：nats/faucet/chat-bridge 无 depends_on，waitIfNeeded 空循环结构性免疫（不是取舍，是排除）。维护判据：**新增 daemon 带 depends_on 必须同时进第②层 daemon 补跑组**。
3. **修法**（已落 `open-when-ready.ps1`，fix(s102/sched-skip)）：第②层 `$daemonPatch=@('pg','goose-scheduler')`，三处 `$k -eq 'pg'` 收敛 `-contains`（首查/2s 复核/10s 观察窗同源）；第①层零动（传递性缺口两处——30s 沉降超时照跑+R2 把 Skipped 当已沉降——后果均由第②层兜住，动它=为罕见角付冷启延迟税）。
4. **幂等性**：pc v1.122 `StartProcess` 对已 Running 只拒不杀（project_runner.go:707-711，VERIFIED-DOC）；对 Skipped 重走 waitIfNeeded 此时 faucet 已 healthy→正常 spawn。goose-scheduler 直接活体证据 UNVERIFIED（产品路径常驻更强的 `pc process restart goose-scheduler`，chat-bridge.js:3134）。
5. **UNVERIFIED 显式留存**：①iat18 精确交错重构链（faucet 首化身早死→挂起三件 Skip→沉降放行→converge 杀 pre-Ready 次化身→闩死）与全部幸存证据自洽但原沙盒已删；②healthy 闩锁族终态/自愈概率 split（推 map 序 ~50/50，n=0）；③`pc process start goose-scheduler` 对 Skipped 实例直接活体（待 G1 臂）；④第①层 R2 判据把 Skipped 当已沉降缺口（代码事实 VERIFIED-DOC，iat18 走此路径系推断）。
6. **验证配方**（三臂沙盒，等 dev 栈空闲窗口执行）：R1 红（HEAD 包+faucet readiness 探针延迟 60s 旋钮，3 冷启 ≥1/3 终态 Skipped）/G1 绿（修后包+同旋钮，3/3 is_running=true+控制台补跑行）/N1 无回归（修后包无旋钮 2 冷启零噪音）；沙盒原生端口需先 pc down dev 栈、验后 PFdrill2 惯例恢复（僵尸态先 /End 再 /Run）。配方细节见 tmp/s102-sched-rca.md §Q4。
