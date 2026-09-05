# 15 冷启后首跑 fuzz 偶发 1 红——取证底稿

- 对象：tools/e2e/fuzz-chat.sh 首跑偶发恰好 1 红、复跑全绿（backlog 观察项，s61/s63/s64 三次复现、s65 主动复现未中、s69 两批工程师各遇一次）
- 结论等级：根因 **VERIFIED-RUN**（2026-09-06 本机对照实验直接复现红，断言级签名一致）
- 被测物：dev 树 @ 5775a9f，桥 version 0.9.10（dev build，chat-bridge.tpl.js 同源），node v22.21.1，pc v1.122.0，goose v1.46.0
- 关联：STATE.md backlog「观察项：栈冷启后首跑 fuzz 偶发 1 红」；s64 加固（fuzz-chat.sh 全量输出恒写 tmp/fuzz-last.log）使本底稿成为可能

## 结论（先行）

**healthz 200 不代表桥能受理 prompt。** 桥在 `server.listen`（chat-bridge.tpl.js:2790）之后、goose ACP `initialize` 握手完成（:445 异步，无 await）之前就对外提供 healthz 200（:1293 无条件 200）。fuzz 里唯一依赖 goose ACP 就绪的断言块 = ws-fuzz-s50h 矩阵（fuzz-chat.sh:61 单条收编），其 session/new 依赖断言超时 6-10s；冷启/高载时桥 listen→ACP-ready 实测窗口 10.1s~150.8s（pc.log 历史实锤）> 10s 超时 → 恰好该块 1 红线（矩阵内部无论几条失败，fuzz 输出恒为 1 行 `FAIL: ws s50h fuzz matrix (11 asserts)`）。热态窗口 2.2-2.3s ≪ 超时 → 复跑全绿。属**探针侧时序**与**桥侧 healthz 语义过弱**的叠加，非 fuzz 断言过紧，非桥功能缺陷。

## 一、历史现象（二手留痕）

| 数据点 | 日期 | 记录 | 断言名 |
|---|---|---|---|
| s61 首现 | 09-03 | journal/2026-09-03-s61：回归基线首跑 fuzz 1 红（冷启动竞态，重跑全绿） | 未留痕（s64 加固前） |
| s63 二现 | 09-04 | journal/2026-09-04-s63：首跑 1 红、热跑 44/44，「疑似某断言依赖 goose 冷加载窗口未就绪」 | 未留痕 |
| s64 三现 | 09-05 | journal/2026-09-05-s64：首跑 1 红，第 3 次复现；同日起 fuzz 输出恒写 tmp/fuzz-last.log | 未留痕（加固当次仍无 assert 名，FAIL 行即汇总行） |
| s65 主动复现 | 09-05 | 主动冷启未中（第 4 数据点） | — |
| s69 两工程师各一次 | 09-05~06 | 其中一次指认 ws-fuzz-s50h 家族、桥刚 pc restart | 矩阵级 |

要点：4 次命中全部发生在「栈冷启 / 桥刚 restart 后立即首跑」语境；s65 主动复现未中与本文热态实验（下）一致——热态根本不会中。

## 二、证据链

### E0 静态时序（VERIFIED-DOC，源码 chat-bridge.tpl.js @ 5775a9f）

| file:line | 事实 |
|---|---|
| :375 | `acp = spawnAcp()` 模块顶层同步 spawn goose.exe（进程创建本身异步） |
| :428-445 | `init()` 异步发 ACP `initialize` 并等 goose 回复（20s 超时→`init failed`→exit(1)）；**无人 await 它** |
| :2790 | `server.listen(PORT)` 是文件最后一行——listen 必然先于 init 完成概率性发生（goose 冷启慢时） |
| :1293 | `/healthz` → 无条件 `res.writeHead(200)`，不查 `acpCaps` |
| :2461-2490 | WS `subscribe(null)` → 直接写 `session/new` 到 acp.stdin，**不检查 acpCaps 就绪**；goose 回包慢=客户端干等 |
| :2428 | WS 连接即回 `{sys:'hello', caps: acpCaps ? {modes:true} : {}}`——**桥已内置 ACP 就绪信号**（caps.modes 有值=init 完成），可作探针门 |
| tools/e2e/ws-fuzz-s50h.js | :4 硬编码 8790；:64/:72/:77/:83/:88/:95 超时 6s/10s；:102 正常 prompt 门 20s。依赖 session/new 的断言：subscribe(null) 回归、mismatched-sid、empty-text、1MB-text（各 10s）；bad-sid×5 与 ghost-sid 走桥本地分支（:2464/:2504），不依赖 goose |
| tools/e2e/fuzz-chat.sh:61 | 矩阵单条收编 `node ws-fuzz-s50h.js >/dev/null 2>&1` → 矩阵内 N 条失败在 fuzz 输出恒为 **1 行**（解释「恰好 1 红」） |
| tools/e2e/e2e.sh:15 | 栈门 = **faucet** healthz，不查桥；fuzz-chat.sh 自身无门 |

### E1 pc.log 历史实锤：listen→「ACP initialized」真实窗口可远超 10s（VERIFIED-RUN，2026-09-06 分析 forge/data/logs/pc.log）

方法：逐行定位 `"chat bridge v2 on"`（listen）与下一条 `ACP initialized`，用 faucet 5s 周期 healthz 行（带时间戳）括号夹逼（±5s 分辨率）：

| listen 行号 | 日期时间(09-05) | 夹逼窗口 | 备注 |
|---|---|---|---|
| 31206 | 09:03 | **12.8s** | 超过 subscribe-null 10s 超时 |
| 31294 | 09:08 | **10.1s** | 同上（恰在超时线上） |
| 34195 | 14:05 | 150.8s | 重载工程时段 |
| 35911 | 17:07 | 1063.1s | 重载/调试时段（含 provider 热切换可能，不细归因） |
| 今日 16 次热重启（本实验） | 09-06 | ≈0-2.3s | 热态基线 |

排除说明：40549-41001 行簇的 45-55s「gap」实为 **goose permission.yaml panic 循环**（`permission.rs:55:17` → `acp exited 1` → 桥 exit(1) → pc 重拉），属 research/12 §3.3 已知家族，与本时序 flake 无关，勿混同。

### E2 对照实验设计（单变量 = healthz 200 后延迟；VERIFIED-RUN 2026-09-06）

- 脚本：tmp/coldfuzz15.js（gitignored，可按本文命令重写）：`pc -p 8099 process restart chat-bridge` → node 直连轮询 `/healthz` 至 200（t0）→ 按模式动作。
- 三模式：`window`（t0 后立即 WS subscribe(null) 测 ready 延迟）/ `treat`（t0 后 0ms 跑 `node tools/e2e/ws-fuzz-s50h.js` 全矩阵）/ `control`（t0 后 sleep 8s 再跑）。
- 负载变量：tmp/w15-load.js，3/4 逻辑核 busy-spin（模拟冷启/并发工程负载；动机见 E4）。
- 纪律：healthz 探活与探针全部 node 直连（STATE s66 观察项：Bash curl 对 127.0.0.1 有沙盒代理假 200，禁采信）；pid 前后比对确认重启真实发生。

### E3 实验结果（全部 2026-09-06，dev 栈）

| 批次 | 变量 | N | 结果 |
|---|---|---|---|
| window 热态 | delay≈0 | 2 | ready 延迟 **2.24s / 2.22s**（≈E0 热态基线） |
| treat 热态 | delay=0 跑全矩阵 | 6 | **6/6 绿**（11/0）——与 s65 主动复现未中一致 |
| control | delay=8s | 4 | **4/4 绿** |
| window 负载 | 3/4 核 busy-spin | 2 | ready 延迟 **9.53s / 10.26s**——顶到 10s 超时线 |
| treat 负载 B | delay=0 | 3 | round3 **红**：`FAIL: subscribe(null) still creates session — ["hello"]`（10/1），其余 2 轮绿 |
| treat 负载 C | delay=0 | 3 | round1 **红（形态 B）**：矩阵 1/10，连 bad-sid 本地断言都空 inbox——探针跑在桥重启半途（pc restart CLI 负载下 ETIMEDOUT 但迟到执行）；round2 **红（形态 A）**：`subscribe(null) — ["hello"]` + mismatched + empty 三条（8/3）；round3 绿 |

红的精确签名（形态 A）：`FAIL: subscribe(null) still creates session — ["hello"]`——inbox 只有连接问候帧（桥 ：2428），10s 内未到 `subscribed`，**不是连接拒、不是 error 帧，是 session/new 迟到**。形态 B（探针撞上半途重启）为 mass-fail，同样汇成 fuzz 里 1 行红，与 s69「桥刚 pc restart」目击吻合。

### E4 为何冷启会中而热重启不中（机制解释，部分推断）

热 pc restart：goose.exe 文件缓存/EDR 判定均热 → ready 窗口 2.2s。真冷启：goose acp 启动要拉起扩展（含 playwright MCP = node + Edge chromium），叠加 EDR 首扫与全栈并发抢 4 核 → 窗口进入 10s+ 区间（E1 的 10.1s/12.8s 即当日实录）。负载实验（E3）证明了「窗口 2.2s→10s+ 只需 CPU 竞争」这一环，冷启放大器本身未在本机直接复现（未重启开发机）——**此环标 UNVERIFIED-推断，与 4 次命中全在冷启语境的事实相容**。

## 三、排除项

- ~~连接拒（桥未 listen）~~：若桥没起来，fuzz 前 22 条 HTTP 断言会先红（大量红），与「恰好 1 红」不符 → 4 次命中时桥 HTTP 均已 up。
- ~~goose permission panic 循环~~：独立家族（research/12 §3.3），pc.log 40549+ 簇已区分。
- ~~fuzz 断言过紧~~：红形态是「响应迟到」非「响应错误」；放宽超时只是扩大竞态窗口，且三倍拉长真卡死的发现时间。
- ~~网络型断言（skillstore remote 等）~~：缓存优先 stale 秒回（s55），冷启不依赖外网成功；且与 ws 家族无关。
- ~~桥 skill 预热（:启动 15s sync）干扰~~：预热是缓存动作，不占 ACP initialize 路径。

## 四、根因结论（分层）

1. **直接机制**：桥 listen/healthz 先于 ACP initialize 完成；探针无就绪门，session/new 依赖断言 10s 超时先于 goose ready 到点 → 矩阵红。
2. **为何「恰好 1 红」**：唯一 goose 依赖块被 fuzz-chat.sh:61 收编为单条 ck；复跑时 goose 已热（2.2s）→ 全绿。
3. **触发条件**：真冷启/高载使 ready 窗口越过 10s（E1 实录 10.1s/12.8s；负载实验直接复现）。
4. **归因归属**：探针侧时序缺失（主）+ 桥 healthz 语义过弱（次，放大器）。**修探针即可消除，桥功能无缺陷**。

## 五、修复建议（三档，本底稿不改任何文件）

**本版可夹带（tools 侧，主控另派工程师）**
- ws-fuzz-s50h.js（:59 断言序列前）加就绪门，二选一：
  - 零副作用方案（推荐）：连 WS 收 `hello` 帧，`caps.modes` 存在（=acpCaps 就绪，桥 ：2428 现成信号）才开跑；未就绪则重连，deadline 45s，超门则报「bridge not ready」独立于断言失败。可同时消形态 A 与 B（连接拒也重试）。
  - 有副作用方案：循环 subscribe(null) 直至 subscribed（每发一个空会话，s30 修剪器次日清）。
- 注意 e2e-chat.sh:127 ws-delete-receipt.js 同为 session/new 依赖家族（e2e 前有长预热故未爆过），夹带时顺路加同款门。

**下版（桥侧，v0.9.10 后批次）**
- `/healthz`（chat-bridge.tpl.js:1293）在 init() resolve 前回 503，使 pc readiness_probe 与一切消费方语义诚实；变更是桥行为语义（EADDRINUSE 自检走 /api/update/status 不受影响，pc failure_threshold 12×5s 容忍足够），随下批发布。

**断言调整档**
- 不调整。10s 超时保持：红因是就绪门缺失而非超时过紧；放宽只治标并钝化真故障发现。

## 六、复现命令（可重跑）

```bash
# 热态基线（应全绿）：
pc -p 8099 process restart chat-bridge && node tools/e2e/ws-fuzz-s50h.js   # 需先 node 直连 healthz=200
# 窗口测量 + 负载复现（3/4 核 busy-spin 下 treat，~50% 命中率见 E3）：
node tmp/w15-load.js 3 300000 &   # tmp/ 已 gitignore，脚本体见本底稿 E2 描述可重写
node tmp/coldfuzz15.js treat 3
# 历史窗口括号法：见 E1（对 forge/data/logs/pc.log 跑行扫描+faucet 时间戳夹逼）
```

## 七、实验副作用与清理（透明留痕）

- 本取证 18 次探针运行 ≈ 86 个空 acp 会话写入 dev sessions.db（s30 修剪器启动时清 >1 天空壳）+ stats 计数器虚增（dev 树 only）+ ≈18 次真实 LLM 短 turn（'只测试连通'）。
- 桥现处健康态（healthz 200，最后重启为负载批次 round3）；fuzz-last.log 未动；permission.yaml 的 M 态为 goose 运行时自规范化（s69 已追认 4b1e999），非本实验产物。
- 方法论坑（观测工具自身）：harness 输出经多层管道在负载下会因管道背压假死（父进程无子进程、无 CPU、卡在 stdout write）——与 s51 三向脱管同族；重跑实验一律重定向文件（tmp/*.log）再读。
