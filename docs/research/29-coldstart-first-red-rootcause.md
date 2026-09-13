# 29 冷启首跑偶发红观察项——两大新数据点家族的受控实验裁决

- 对象：STATE backlog 观察项「栈冷启后首跑 fuzz 偶发 1 红」的两个新数据点家族：
  - **家族甲（p34）**：s76c 第 5 数据点——e2e→fuzz 无间隔串跑，pgstore-p34 单红[文件未采纳新 PG 行]，单跑/热跑均绿，当时归因「=pg stop/start 过渡竞态窗口」（STATE.md 观察项行，未验证假设）
  - **家族乙（§11b）**：s79/R 批新数据点——桥 pc restart 1 分钟后起 e2e，§11b ws-close-reclaim「扩展进程 10s 未现（count 停 9）」，单跑+整套复跑双绿
- 关联：research/15（原始观察项 s61/s63/s64 的 ws-fuzz-s50h 家族已 VERIFIED-RUN 收口：healthz 先于 ACP initialize + 探针无就绪门）；STATE:112（e2e/fuzz 不并行——e2e 备份节 stop/start pg）；dev-lessons-s78 #10
- 结论等级：实验全部 **VERIFIED-RUN**（2026-09-13 本机，dev 树 @ 0a7e42d，桥 v0.9.12-dev 同源模板，goose v1.50，4 逻辑核）；s76c 红本体仍是二手记录（无断言名级留痕，s64 加固早于该红但 fuzz-last.log 已被后续运行覆盖）

## 结论（先行）

1. **家族甲：pg 过渡竞态假说被对照实验否定（针对 s76c 串跑语境）。** pg start 过渡窗在本机（热数据目录）≈1-3s 即开端口，0/5/15/30s 档 ×3 = **12/12 全绿**；真·运行中停 pg 产生的红签名是 `write CONNECT_TIMEOUT`（探针侧）或 `spawn1: probe bridge never reached pg mode`（桥 20s waitPg 预算 < 30s 重探间隔），**均不是** s76c 观察到的「文件未采纳新 PG 行」。该签名在代码上仅两条窄路可达（见 §三），串跑语境（e2e 最后一次 pg 重启距 fuzz 起跑 ≥ 数分钟、无停 pg 者存在）下两条都近乎不可达。**s76c 红根因=UNRESOLVED，pg 过渡归因降级为「不支持」**。
2. **家族乙：§11b 红 19 次尝试 0 复现，机制判别完成。** 桥重启即刻 ×5、全栈冷启即刻 ×5+×2、3/4 核 busy-spin 负载 ×2、基线>0 存活会话 ×1、热态 ×4——全绿；扩展进程 spawn 实测 **1.4-1.8s**（10s 门，5-7 倍裕度，含负载与冷启）；「新会话复用旧扩展进程→计数不增长」假说被 R2b 直接证伪（基线 9 时新会话 9→18，每会话独享 9 进程）。R 批红=未复现瞬态，残余假说=真冷机（EDR 首扫/盘 IO 争抢）下 spawn 偶发越 10s 门，本机今日不可测（机器热）。
3. **副产物两条环境实锤**（均已处置）：① **PFdrill2 僵尸任务态确定性复发**——pc down 后任务恒残留「正在运行」，此时 `/Run` 被静默拒绝（last result 0x800710E0）却仍打印「成功: 尝试运行」（误导性成功）；处置=`/End` 后 `/Run`（两次验证有效）；② **pg 快速 stop/start 循环（6 次/5 分钟）复现孤儿 postgres backend**（`--forkchild="backend"` 残留占数据目录 → 新 postmaster exit(1) → pc 耗尽 max_restarts=3 → pg Completed/Not Ready）——STATE s69 遗留③同族 +1 实锤，手清孤儿+start 恢复。

## 一、实验矩阵（全部 2026-09-13，dev 栈，产品代码零触碰）

### 甲：p34（pgstore-p34-probe，探针自起隔离桥 :18794，借真树 pg :5432）

| 批次 | 条件 | N | 结果 | 签名 |
|---|---|---|---|---|
| R0 对照 | pg Ready 热态 | 1 | 绿 4s | — |
| R3 start 过渡 | `process start pg` 后 0s/5s/15s/30s 档，每档连发 | 12 | **12/12 绿**（0s 档 6-9s，余 4-5s） | — |
| R3b 尾随 stop | 探针起跑后 3s/5s/7s 发 stop（stop 生效需 1-3s） | 3 | 3/3 绿（stop 全部落在探针退出后——尾随停追不上探针） | — |
| R3b2 运行中 stop | 探针起跑后 1s / 2s 停 pg | 2 | **红×2** | t=1s→`write CONNECT_TIMEOUT 127.0.0.1:5432`（签名 C，探针自身 SQL）；t=2s→`spawn1: probe bridge never reached pg mode`（签名 A，桥侧） |
| 意外对照 | 测量脚本事故致 pg 停留停止态 | 2 | 红×2 | 签名 A（同上） |
| Ready 对照（复位后） | pg Ready | 2 | 2/2 绿 4s | — |

合计 22 跑：18 绿 4 红，**4 红全部是注入的 pg 停止态，无一例产出 s76c 的「文件未采纳」签名（签名 B）**。

### 乙：§11b（ws-close-reclaim，打 dev 桥 :8790，自带 research/15 就绪门 45s）

| 批次 | 条件 | N | 结果 | 关键测量 |
|---|---|---|---|---|
| R0 热态 | — | 2 | 绿 9s/6s | baseline 0→9→0 |
| R1 桥重启即刻 | `process restart chat-bridge` 返回即跑，连发 | 5 | **5/5 绿** | 新 acp pid=8760；每轮 6-7s |
| R2 全栈冷启即刻 | pc down→PFdrill2→桥 HTTP 通即跑，连发 | 5 | **5/5 绿** | acp pid=9748 |
| R2 插桩 | 60s 宽门计时副本（tmp） | 2 | 绿 | spawn t+1442/1694ms；回收 t+1413/1429ms |
| R2b 基线>0 | 存活会话不删（baseline=9）再跑原探针 | 1 | 绿 | **9→18→9：新会话独享 +9 进程，无共享复用** |
| R2c 负载 | 3/4 核 busy-spin 下插桩 ×2 | 2 | 绿 | spawn t+1780/1618ms——负载不拉爆 |
| R4 二次冷启 | 全栈重启复位计数器后即刻 ×2 | 2 | 绿 | 冷启桥 HTTP=6.0s |

合计 19 跑 0 红；spawn 时延全集 1.4-1.8s。

### 环境事件（实验副产物）

| 事件 | 复现性 | 证据 | 处置 |
|---|---|---|---|
| PFdrill2 僵尸「正在运行」 | **两次 pc down 两次复发（确定性）** | schtasks 查询态 + /Run 后 last result 0x800710E0（ERROR_REQUEST_REFUSED）且零进程 | `schtasks /End /TN PFdrill2` → `/Run`，两次恢复（冷启到桥 HTTP 6.0s） |
| 孤儿 postgres backend | 本日 1 次（6 次 stop/start 循环后） | PID 9684 `--forkchild="backend"` 父进程已死；后续 pg 实例 exit(1)×3 → pc Completed | taskkill //F 孤儿 + start = 恢复 |

## 二、pg 过渡的物理参数（本机实测）

- `process start pg` 返回 → 端口可连：**≈1-3s**（热数据目录；R3 0s 档首轮 9s 绿含探针自身等待；最终复位轮 attempt-0 即通）。
- `process stop pg` 发令 → 端口关闭：**≈1-3s**（R3b 三轮尾随 stop 全部晚于探针退出）。
- 结论：**「e2e→fuzz 无间隔」语境下 pg start 过渡窗（秒级）远小于 e2e 尾部 14-18c 节的运行时长（分钟级）**，fuzz 起跑时 pg 早已 Ready——串跑归因在时间几何上就不成立，实验数据（12/12 绿）与之一致。

## 三、签名谱系（p34 红的三种形态与代码路径，VERIFIED-DOC @ 0a7e42d 模板）

| 签名 | 消息 | 触发条件 | 代码路径 |
|---|---|---|---|
| A | `spawn1/spawn2: probe bridge never reached pg mode` | 探针桥 20s 内未进 pg 态：pg 停止期间懒连失败→file 态→**桥 30s 重探间隔 > 探针 20s waitPg 预算**（探针侧设计缺口） | 桥 :406-433 pgTryConnect 失败→:227 pgDowngrade；重探 :435-438（仅 sql==null 时 30s tick）；探针 :82-85 waitPg 80×250ms |
| B | `P3-4 FAIL: file did not adopt newer PG row (fz-a=…)`（**s76c 观察到的**） | 桥已进 pg 态（stats=pg，waitPg 通过）但 12s 内采纳未落文件。代码上仅两路：**(B1)** reconcile 查询中途死连——pg 停在「桥 connect→reconcile SELECT」亚秒窗内，失败走 **:404 catch 仅 console.warn：不降级、不重试**（对比：sync 失败 :369 会降级；reconcile 死后 re-run 要等下一次降级+30s 重探全环，远超 12s 窗）；**(B2)** 采纳值写文件被静默吞——:400 `try{atomicWrite}catch{}`（Windows FS/AV 瞬时锁 tmp 文件可触发，零日志零重试） | 桥 :373-405（收编判定 :390-391、写文件 :393-401、warn-only catch :404）；探针 :117-121（12s 文件轮询后抛 B） |
| C | `write CONNECT_TIMEOUT …` / postgres.js 错误文本 | 探针自身 SQL 客户端连不上/死连（pg 停在探针直连阶段） | 探针 :63-64/:90 直连 SQL |

**裁决逻辑**：串跑语境无停 pg 者存在（e2e 尾部数分钟无 pg 操作、fuzz 内部无 pg stop/start——逐探针 grep 证实），B1 需要亚秒级巧合停 pg——不可能；B2 与 pg 无关（文件系统层）。故「pg stop/start 过渡竞态窗口」对 s76c 红**不支持**。B2（FS/AV 锁吞写）成为首要存活假说——**UNVERIFIED**，触发条件（EDR 扫 tmp 归档文件的瞬时锁）本日无法注入复现。

## 四、§11b 机制判别（VERIFIED-RUN）

- 红的必要条件：session/new 后扩展进程树 10s 内不增长。实测增长时延 1.4-1.8s（热/桥重启/全栈冷启/负载/基线>0 五语境一致）。
- 「goose v1.50 会话间共享扩展进程→计数恒不增」假说：R2b 直接证伪（基线 9 时新会话 +9 至 18）。
- R 批红（count 停 9，即基线 9 且 10s 零增长）在本机不可复现；残余解释=真冷机语境（EDR 对新物化二进制首扫、盘 IO 争抢）偶发拉爆 spawn，与 research/15 E4「冷启放大器 UNVERIFIED-推断」同一性质。
- 附带观察：探针连续跑出现同会话号复用（20260913_25 反复出现）——删后建号段回退家族（research/18 Z1），对本探针自相对断言无害。

## 五、建议（均不动产品代码；tools 侧属可夹带，主控另派）

1. **STATE 观察项改写**（本报告随附提交）：pg 过渡归因降级为「不支持」；p34 红仅签名 B 复现时才继续追（A/C 已被「e2e/fuzz 不并行」纪律+下条探针加固覆盖）。
2. **探针可夹带（tools 侧）**：
   - pgstore-p34-probe.js:83 waitPg 预算 80→200 轮（20s→50s）——覆盖桥一个 30s 重探周期，签名 A 的 pg 过渡红全吸收；
   - ws-close-reclaim.js:39 扩展门 10→20 轮（回收门 :47 保持 10——实测回收 1.4s 无需放宽）——吸收 2 倍冷启尾延，仍有界。
3. **下次签名 B 复现时的取证序**：先查有无并行 pg 停止者（A/C 才是 pg 族签名）；无则取 tmp/fuzz-last.log 原文 + 检查当时 AV/EDR 活动 → B2 假说转正需新实验（对采纳写注入文件锁）。
4. **环境 runbook 补丁**（已写入 STATE 栈现态）：PFdrill2 重启前置检查——pc down 后任务若仍「正在运行」必须先 `schtasks /End /TN PFdrill2` 再 `/Run`（僵尸态下 /Run 静默被拒且报成功）；pg stop/start 快循环警惕孤儿 backend（s69③ 家族，本日 +1）。
5. **关闭条件建议**：
   - 家族乙（§11b）：本日 19 绿含两大规范触发语境；再积 2 个独立日 × 每语境 ≥5 跑全绿 → 降级「已知环境瞬态」关闭专项（复现时先取 baseline/with-session 计数+立即复跑一次，若立即复跑仍红=证伪瞬态类，升级专项）；
   - 家族甲（p34 签名 B）：观察项保持开着但收窄到「仅签名 B」；A/C 不再计入（机制已明+探针加固后自愈）。

## 六、复现命令（可重跑；栈操作见 STATE 栈现态节）

```bash
# §11b 桥重启即刻（本日 5/5 绿）：
env PC_DISABLE_TUI=1 ./forge/bin/pc/process-compose.exe -p 8099 process restart chat-bridge
for i in 1 2 3 4 5; do node tools/e2e/ws-close-reclaim.js; done
# §11b 全栈冷启即刻（先 /End 僵尸态）：
env PC_DISABLE_TUI=1 ./forge/bin/pc/process-compose.exe -p 8099 down
schtasks //End //TN PFdrill2; schtasks //Run //TN PFdrill2   # Git Bash 双斜杠
node -e "…轮询 8790 healthz 至 200…" && node tools/e2e/ws-close-reclaim.js
# p34 start 过渡矩阵（本日 12/12 绿）：
pc… process stop pg; sleep 2; pc… process start pg; sleep $OFF; node tools/e2e/pgstore-p34-probe.js
# p34 运行中停（本日 t=1s→签名 C、t=2s→签名 A）：
node tools/e2e/pgstore-p34-probe.js & sleep 2; pc… process stop pg; wait
```

## 七、实验副作用与清理（透明留痕）

- §11b 家族 ≈20 个空 acp 会话写入 dev sessions.db（s30 修剪器次日清；stats sessionsCreated 285→305，dev 树 only）；零 LLM turn（探针不发 prompt）。
- p34 探针每轮自建自清隔离库/临时根，无共享数据触碰；dev 桥在 pg 停止窗内多次 file↔pg 摆动，均按设计 30s 自愈（终态 stats.pg=pg 实证）。
- 孤儿 postgres 事件：pg 进程 restarts 计数一度=3（crash-loop），已通过全栈重启复位（终态 pg Ready restarts=0、桥 Ready restarts=0）；事件全程 ≈6 分钟栈局部不可用（10:32-10:38）。
- 一次自伤事故留痕：pg 端口时延测量脚本内嵌 exec 相对路径+env 前缀失效 → pg 多停 2 分钟、两轮「对照」实为停止态跑（其红已并入 R3b2 签名 A 证据，不弃用）；教训=子进程环境与父进程 cwd 差异（通用陷阱清单既有条目再实证）。
- explorer 窗口全程序零开窗，收尾计数 0（dev-lessons #14）。
- 冷启时延有效测量 1 次（6.0s 至桥 HTTP）；首次冷启的 +441s 测量值被僵尸任务等待窗污染，已作废不采。
