# v0.9.13 发布门独立复测（pf-qa / s93，2026-09-15）

- 裁决结论：**需返工（不建议按现包发布）**——启动路径主体修复实测有效，但**备份链在出厂包上是死的**（🔴 F1，系统性、用户可见），且 s92 的自测口径「首启日志零 ERROR」在本机 6 次启动复现失败。
- 被测物：`dist/PocketForge-20260915-v0.9.13.zip`
  - sha256 独立复核 = `bc418af61e15701311aa1200e1c60a7dbc5cdd7bc5c1e1ff670151949796746a`（25300 文件 / 323,573,558B）与随包 `.sha256` 一致 ✅
  - 注：STATE 顶行仍写 `799dfd44…`、journal s88 后补 2 写 `68ec9823…`——均为旧重建指纹，**已在发布说明定稿（cdbd149）中更新为 bc418af6**，STATE/journal 属账目滞后，不阻断。
- 纪律执行：全部测试在干净目录 `C:\PF-QA`（4 棵解压树，终态整删）；未使用 dev 树冒充交付物；探活一律 node 直连（`C:\PF-QA\probe.js`）；每轮 relaunch 前清旧 wrapper cmd；红项证据先拷 `tmp/s93-qa/` 再删树。
- 本 shell 完整性自证：`whoami /groups` → `Mandatory Label\High Mandatory Level … S-1-16-12288`（G2 前提成立）。

## 0. 矩阵结果

| 格 | 内容 | 结果 | 一句话证据 |
|---|---|---|---|
| G1 | 冷装启动 ×3 | 🟡 2/3 绿（红=备份链） | 3 次全新解压（g1/g2/g3，各 25300 文件、各 32s）+ 降权冷启：bridge healthz 200、pg Ready restarts=0、pg-init/faucet-rawsql exit=0、banner `[PocketForge] starting... pc=8099 faucet=8091`、零 EADDRINUSE/FTL/「不是内部或外部命令」；**但 3/3 次 `daily-backup` exit=1 + `data/logs/backup.log` ENOENT 栈（见 F1）**；产品停止脚本 2-3s「all stopped.」零残留 |
| G2 | 降权链路真验 | 🟢 | 从 High shell 直跑启动器：日志两行人话「检测到当前是管理员身份启动…正在自动改用普通权限重新启动」，11.4s 后 bridge 200 + `pg store ready: forge_bridge on 127.0.0.1:5432` + `POST/GET /api/db/overview` 200；「已在运行」分支：再跑启动器 → 「PocketForge 已经在运行了…」+`process-compose` 实例数=1 + 栈不受影响 |
| G3 | 崩溃恢复 | 🟢 | 只杀 process-compose（子进程成 13 个孤儿）→ 重启 → 预检打印 `cleaned 13 leftover process(es) from a previous run` → **8.8s 就绪**（快于 9-20s 预期）、零 EADDRINUSE/FTL、restarts=0 |
| G4 | 停止矩阵 | 🟢 3/3 | ①运行中停止 2.0-2.5s 全停 + 零进程零端口 ②栈未运行点停止 1.5s 友好返回「all stopped.」rc=0 ③停后立刻再启 → 13.4s 就绪 |
| G5 | 冷装功能面 spot-check | 🟢 | cold-surface 15/15（g1 与 g3 两次，含 pg Ready restarts=0、两步升级向导、双源、permission 三键、扩展关停、能力一致）；`/api/apps`=`{"ok":true,"apps":[]}`；页面含 `data-pane="apps"`+「🚀 小应用」；`conf/elev-check.ps1`+`conf/start-preflight.ps1` 在包；**SHA256-EXE.txt 54 条与包内 54 exe 一一对账、逐条哈希复算全一致** |
| G6 | 升级装 v0.9.12→v0.9.13 | 🟡（机制通，双红） | 上传 zip+sha（哈希核验通过、staged 就位）→ start → **runner 死于 stop 段复现（R3 未修，见 F3）**，status 永卡 `stop`、栈停、零 runner；同包手动跑 runner（栈已停）→ `done=True` 315s、VERSION=v0.9.13；升级后冷启健康（7.9s、healthz 200、`elev-check/start-preflight` 在位）；种子存活（`data/qa-seed.txt` sha256 逐位不变）；pre-upgrade 备份在位（2 份，含 `apps/qa-demo.yaml`）；**apps/ 被旧 runner 删除（R4 复现，发布说明已有手动步骤）**；按发布说明恢复 apps/ 后重启 → 协议形态 app 聚合正常（R1 修复在升级树上有效）、`/api/apps` 正确列出 human/url/state |
| G7 | 收尾 | 🟢 | `C:\PF-QA` 整树删除、11 个挂起 wrapper cmd 清理、零 PF 进程（`Path -like 'C:\PF-QA*'`=0）、端口 8099/8091/8790/5432/4222/8222/8188 全空、PF 欢迎页 Edge 窗（PID 18848）已关 |

证据留档：`tmp/s93-qa/`（g1/g2/g3/up 的 backup.log+pc.log+pg.log、launch logs、apps.env.yaml、两份升级 manifest、status.json）。

## 1. 红项

### 🔴 F1（P1·阻断）出厂包上 `daily-backup` 每次启动崩溃，备份链死 + 用户可见红错
- 现象（可复现；本机 11 次可观测启动中 8 次留下崩溃证据且**全部是 v0.9.13 启动**，唯一一次成功产出备份的是升级前的 v0.9.12 启动；3 棵全新树首启 3/3 中）：启动后 `daily-backup` `exit_code=1`，`data/logs/backup.log` 全文 = Node 崩溃栈：
  ```
  const stats = binding.stat(
  Error: ENOENT: no such file or directory, stat 'C:\PF-QA\g1\data\pg-dumps\pg-2026-09-15T09-50-05.sql'
      at Object.statSync (C:\PF-QA\g1\bin\forge-backup.js:65:53)
  ```
  `data/pg-dumps/` 空、`data/backups/` 空 → **零备份产出**（对照：同包在 v0.9.12 首次启动时产出过 9852B 备份 zip，说明链路本身在别的时序下能通）；黑窗口同步打印该错误栈（用户可见）。
- 机理（代码 + 观测双证）：`forge-backup.js:29-36 pgLogReady()` 读 `data/logs/pg.log` 找 `ready to accept connections`；`pgDumpWithWait()` 的 12 次循环里**若门始终未开，`lastMsg` 保持空串并返回 `''`**，调用方 `if (!err)` 判 `''` 为「成功」→ 走轮换分支 → `fs.statSync(dump)` 抛 ENOENT。即 s92 把「优雅跳过（exit 0）」改成了「假成功 + 崩溃（exit 1）」，**且没有任何分支处理「门未开」**。
- 「门未开」的两条独立输入都在本机实测到：
  - **a) pg.log 长期 0 字节**：出厂包启动路径下 `data/logs/pg.log` 不被写入（pc 把 pg 输出落到控制台；同树同 yaml 由我直接以 `pc up -f conf/… -t=false` 起时 pg 输出**确实**落 pg.log——同一 yaml、同一 pc 二进制，差别只在启动上下文）。g1 首次冷启 + 我手动 `pc process restart pg` 后仍 0 字节。
  - **b) 时序窗口**：门开后还要落在 18s 窗口内。实测 boot（g3）`pg.log` 首行 17:55:06.760、`ready` 行 17:55:06.846，而崩溃日志文件名时间戳 17:55:04 → **备份在 pg 写下 ready 之前就走完了窗口**。
  - 注：受 log_location 截断语义影响，只能同时观测「最后一次启动」的 pg.log（早先启动的副本被下一次启动截断），故上述 a/b 无法同窗并列，按两独立观测记。
- 影响面：①用户数据的安全网（每日备份）在出厂包上从未产出；②每次双击启动黑窗口都出现一段英文崩溃栈（正是 s90-s92 全力消除的「用户可见假故障」类别）；③与 s92 提交信息 `d227b6b/af8ebd1`（「保持启动日志零 ERROR」）目标直接矛盾。
- 修法建议（供工程，不代改）：①**删除「读 pg.log 等 ready」门，改用同仓现成 `bin/pg-probe.js`（TCP 连 data/pg.port）做就绪门**——s92 引入门的动机是「裸连接撞 not-yet-accepting 会记 FATAL」，而 TCP connect 到一个**已在监听**的 PG 不会产生 FATAL；pg 自身 READY 探针（process-compose.yaml 的 readiness_probe）已经用同一脚本，语义一致、零新增依赖；②`pgDumpWithWait` 循环耗尽必须返回**非空**哨兵（如 `'not ready within window'`）并走「信息级跳过 + exit 0」，绝不能让 `''` 当成功；③加回归断言：沙盒冷启后断言 `data/backups/` 有 zip 或 backup.log 无 `Error:`（现 e2e/fuzz 都不覆盖 daily-backup）。

### 🟡 F2（P2·升级路径）R3（升级器随停栈被杀）在 v0.9.12→v0.9.13 真实路径上仍然复现，发布说明未提示
- 现象：v0.9.12 桥 UI 同源端点上传→check→start 后，runner 日志止于 `[upd] stop 停止数字员工…`（10:08:14.901Z），进程消失、`status.json` 永卡 `stage=stop`、栈已停、`unpack/` 残留；与 s88 runbook R3 逐字同型。
- 影响面：存量用户按真实路径升级 → 向导永远转圈/升级未完成，无提示无自愈。发布说明只写了 R4（apps/ 手动备份），**没写 R3 的现场处置**（草稿 §升级路径 未覆盖）。
- 已实测可行的兜底（供发布说明补写，我本轮实证）：关机不可用时——先双击「停止数字员工.cmd」清残留，再用 `"<安装目录>\bin\node-v22\node-v22.21.1-win-x64\node.exe" bin\update-runner.js --root "<安装目录>" --staged <包名>` 手动跑完（本机 `done=True`，315s，含 restart+healthz）。或在栈重启后用升级向导重试（s89 修复只护 v0.9.13+ 桥发起的升级）。
- 分级理由：机理早已定案（R3），且 s89 修复对「新桥发起的升级」有效；但**发布说明缺 R3 现场步骤**这一点必须补，否则存量用户卡死零提示。

## 2. 备注 / 与主控自测口径的差异（不单列红项，但必须留痕）

1. **「首启日志零 ERROR」不成立**：主控 s92 自测称「13 轮冷启 + 6 场景边界全绿（含全日志异常扫描）」，本机独立样本=11 次可观测启动，其中 8 次留下 F1 的 ENOENT 崩溃证据（**3 棵全新树首启 3/3 中，升级后 v0.9.13 冷启亦中**），仅升级前的 v0.9.12 那一次成功产出备份。自测与本复测的差异必须由工程解释（是跑在 env 不同、还是断言口径没扫 backup.log/进程 exit_code）。
2. **R4 复现（已文档化，不算红）**：升级后 `apps/qa-demo.yaml` 被删（2 份 manifest `deleted:['apps/qa-demo.yaml']` 铁证），备份副本在 `data/updates/backup-*/apps/` 在位；按发布说明「拷回 apps/ 再重启」实测恢复成功、应用自动回来。
3. **发布说明中未验证的承诺**：「自本版起跑的后续升级无此步骤（apps/ 保护）」本轮未测（需 v0.9.13→更高版本的第二跳），属 UNVERIFIED —— 建议发布前补一跳演练或把这句降级为「设计如此、待验证」。
4. **观察项（不立项）**：`_app-template.yaml` 的 `availability.restart: on_failure` 无上限——实测一个 command 不可用的应用在 3 分钟内 restarts=31 持续重启（面板 state=fail 诚实显示）；模板与 process-compose.yaml 对非核心进程的封顶口径（`max_restarts: 3`）不一致，值得工程评估。
5. **测试夹具噪声，非产品缺陷**：本轮 wrapper 为纯净环境（含 `data/logs/probe-*`、`pywin32` 等）做的 PATH 清理使 `python -m http.server` 型演练 app 找不到解释器（app 反复重启），不影响断言；`timeout /t 3` 在 PATH 带 Git bin 的 shell 内被 Git 的 `timeout.exe` 抢先（真实双击无此 PATH），属夹具噪声。
6. 未跑 e2e-chat/fuzz 套件（任务书判为非必需，本任务聚焦启动路径）；本轮所有断言均为我自跑日志，可逐条对账（`tmp/s93-qa/`）。

## 3. 复现资产与命令形态

- 树：`C:\PF-QA\{g1,g2,g3,up}`（v0.9.13 ×3 + v0.9.12 ×1），终态整删。
- 降权冷启（e2e.sh:88-110 先例）：`python mk_wrap.py <根> <日志> <wrapper>`（GBK+CRLF，wrapper 内 `chcp 936` + 纯净 PATH）→ `cmd //c runas //trustlevel:0x20000 "<wrapper>"` → `python poll_ready.py <根> <日志> 90 <起始 epoch>`（node 直连 bridge healthz）。
- 断言：`assert_stack.py`（端口/healthz/db overview/pc 进程矩阵）、`logscan.py`（FATAL/panic/Access denied/ECMDNOTFOUND/ECONNREFUSED/EADDRINUSE/FTL/ENOENT/Error 词典扫描）、`exe_reconcile.py`（SHA256-EXE 对账）。
- 高完整性自证：`cmd //c "C:\Windows\System32\whoami.exe /groups"` → `S-1-16-12288`。

---

# F1 复验（s93b，2026-09-15 第二轮，pf-qa）

- 被测物：`dist/PocketForge-20260915-v0.9.13.zip`，sha256 复算 = `018789a7568f8e8d6474dd438ebefb61cf17da4b21bb5743b747e310b0724dbb`（323,574,754B / 25,300 条目）与随包 `.sha256` 一致 ✅；包内 `bin/forge-backup.js`、`bin/chat-bridge.js`、`conf/templates/*.tpl.js`、`conf/_app-template.yaml` 与仓内源文件**逐字节同哈希**（550cf3c6…/8121a35e…/b2b49ab6…）——模板与产物同步面 ✅。
- 裁决：**F1 主体关闭**（崩溃 + 零备份产出：证据级消除）。**但同时发现新红项 F3（🟡 P2，用户可见）→ 我判「有条件通过」：不阻断，但要求修 F3 或把发布说明里与 F3 冲突的措辞改准，再对外发。**
- 纪律：4 棵全新树 `C:\PF-QA\{g1,g2,g3,g4}` 全解压自新包、降权冷启（wrapper 内 `chcp 936` + 纯净 PATH、`runas //trustlevel:0x20000`）、探活裸 socket（零代理）；红项证据先落 `tmp/s93b-qa/` 再删树；`whoami /groups` = `S-1-16-12288`（高完整性，G2 前提成立）。

## 1. F1 断言结果（逐条）

| # | 断言 | 结果 | 证据 |
|---|---|---|---|
| 1 | G1 全新树冷启 ×4：`daily-backup` exit 0 不崩 | 🟢 4/4 | `pc process get daily-backup` → `status=Completed exit_code=0`（g1/g2/g3/g4，`tmp/s93b-qa/*/result.json`） |
| 2 | `data/pg-dumps/` 有 `pg-*.sql` | 🟢 4/4 | 各 672B（g1 19:43:46、g2 19:56:39、g3 20:00:10、g4 20:11:26） |
| 3 | `data/backups/` 有 zip | 🟢 4/4 | 10739/10740/10740/10743B；g3b 二启 12514B |
| 4 | `data/logs/` 全目录零异常 | 🔴 未达 | 见 F3：首启 pg.log 12 行 `FATAL: database "forge_bridge" does not exist`（控制台同现）。backup.log 本身零 `Error:`（对照组：修前 3/3 树 ENOENT 崩溃栈） |
| 5 | 二次启动（同树第二次冷启）两库 dump ok | 🟢 2/2 | g1b/g3b：`pg_dump ok: pg-*.sql` + `pg_dump ok: pg-bridge-*.sql (4KB)`，exit 0，0 FATAL |
| 6 | 根因机理复核（受限令牌路径 pg.log 恒 0 字节） | 🟢 复现 | 4 棵首启全程 `data/logs/pg.log` = **0 字节**（pg 输出进 pc 控制台/pc.log，实测控制台有 `[pg] … database system is ready to accept connections`）→ 旧门永不开，改 TCP 探活方向正确 |
| 7 | 边界：`data/pg.port` 缺失 | 🟢 | `pg_dump skipped: PG not present` + zip 照产 + exit 0（`tmp/s93b-qa/edge/E2-*`） |
| 8 | 边界：PG 全程不在场（门耗尽路径） | 🟢 | 65s 后 `未就绪（首启时序，正常）` ×2 + zip 照产 + exit 0，**零异常抛出**（`tmp/s93b-qa/edge/E1-*`） |

## 2. 🔴/🟡 F3（新发现，两件一体）首启 12 行用户可见 FATAL + 桥库备份必差 3 秒

- 现象（4/4 棵全新树首启必现，二启 0 次）：控制台/launch.log 打印
  `[pg<TAB>] 2026-09-15 20:11:33.093 CST [17580] FATAL:  database "forge_bridge" does not exist` **×12**（1.5s 间隔），pg.log 终态同留 12 行。修前包首启 pg.log 0 行 FATAL（旧包备份在 postgres 段就崩了，够不到 forge_bridge），故这是本次修复**新引入**的用户可见报错族。
- 机理（双证据）：备份 `pgDumpWithWait` 把 `does not exist` 归入 transient → 对不存在的桥库连试 12 次；而桥建库实测发生在首启 +30s：
  - g4：FATAL 窗口 20:11:33→20:11:50，`data/pg/base/16384`（首个用户库目录）ctime = **20:11:53** → 差 **3s**
  - g3：FATAL 窗口 20:00:17→20:00:34，建库 ctime = **20:00:36** → 差 **2s**
- 后果：①每次首启（=每个新用户第一印象）黑窗口出现 12 行含 `FATAL` 字样报错——正是 s90-s92 全力消除的类别；②备份链注释自称「等待的价值=把 forge_bridge 备上」，但首启窗口永远差 2-3 秒，桥库首启必落空；③**随包发布说明 `docs/v0.9.13-release-notes.md:7` 写「复验：…日志零异常」与实测冲突**（失真）。
- 建议修法（供工程，二选一，都很小）：a) `forge_bridge` 的 `tries` 12→16（+6s，覆盖实测建库时刻，首启即备上桥库且不再有 skip 行）；b) `does not exist` 移出 transient 分类、只试 1 次（代价=首启放弃桥库 dump，但把 12 行噪音降为 1 行）。二者都必须重打包重跑本复验（包指纹会变）。
- 证据：`tmp/s93b-qa/f3/F3-fatal-window.txt`、`tmp/s93b-qa/f3/g4-final-pg.log`、`tmp/s93b-qa/g{1,2,3,4}/g*-launch.log`、`tmp/s93b-qa/g4-final/g4-final-rescan.json`。

## 3. 抽检（就绪门改动未伤启动路径）

| 抽检 | 结果 | 证据 |
|---|---|---|
| G2 降权链路（High shell 直跑启动器） | 🟢 | 两行人话「检测到当前是管理员身份启动…正在改用普通权限重新启动」+ 8.6s 就绪（`tmp/s93b-qa/g2c/g2c-g2check.json`），`process-compose` 实例数 = **1**（单实例护栏有效）；`/api/db/overview` = `{"ok":true,"services":[]}`、healthz 200、桥侧第三启 `pg_dump ok` 两库（`tmp/s93b-qa/g2c/g2c-backup.log`） |
| G4 停止矩阵 | 🟢 3/3 类 | ①运行中停止 ×6：1.8-2.3s「all stopped.」rc=0、零残留进程、pc/faucet/pg 端口全闭 ②栈未运行空跑 ×1：1.5s rc=0 友好返回 ③停后立刻再启 ×2：ready 7.2s / 8.2s，二次启动两库 dump ok |
| 桥侧就绪门（同款改动） | 🟢 | 二启 `pg store ready: forge_bridge on 127.0.0.1:5432`；4 棵首启零「没连上数据库」降级文案 |
| F2 发布说明节文字复核 | 🟢 文字与实测一致 | `docs/v0.9.13-release-notes.md:73`：手动备份 `apps\` + ①后拷回 ②卡「停止中」先双击停止脚本、再 `node.exe bin\update-runner.js --root . --staged <包>` 手动收尾（我实测 315s / done=True，与我上轮报告逐条一致）；「R3 新版已修」经包内产物验证成立——`bin/chat-bridge.js` 含 Start-Process 中介 spawn（6 处 / `-WindowStyle Hidden` 2 处，s89 33f0209 同款） |
| `_app-template.yaml` max_restarts | 🟢 | 包内 = 仓内同哈希，含 `max_restarts: 3` + `backoff_seconds: 5`（第 16-17 行） |

## 4. 方法学勘误（解释自测为何没抓到 F3，也修正上轮扫描口径）

- **pg.log 只在进程退出/停机时才落盘**：首启全程 0 字节，停机后同一文件 1.8-2.3KB。→ 任何「运行中扫描 data/logs」都会漏掉 pg 侧全部内容；本轮我改为**停机后终态复扫**（`tmp/s93b-qa/*/*-rescan.json` + `*-logs-final.zip`），F3 正是这样捞出来的。建议 s92/s93 的自测矩阵把扫描点移到停机后。
- 另注：运行中读取 `data/logs/pc.log` 只能读到当时已落盘部分（首启 40s 时仅 4KB，终态 7-23KB）——「零异常」断言必须在停机后做才作数。
- 本轮一次污染样本已作废重跑（并列第二栈时 nats 固定监控口 8222 冲突）：g2 首次采样红，证明是**夹具串行化错误**而非产品缺陷，已删树重跑干净；串行纪律=上一栈 product stop 确认零残留后才起下一栈。

## 5. 结论

- **F1：关闭**（崩溃/ENOENT 栈/零备份产出三项证据级消除，4 棵全新树 + 2 次二启 + 2 个降级边界全绿，包内产物与仓内模板同哈希）。
- **能否发 release：暂缓 1 项小修**——F3 是本轮修复新引入的用户可见首启报错（12 行 FATAL）+ 桥库首启备份必落空，且随包发布说明「日志零异常」与实测冲突。建议：二选一最小修（tries 12→16 或 `does not exist` 不重试）→ 重打包 → 我跑一次定点复验（4 棵首启 ×FATAL/两库 dump）即放行；若业务必须按现包发，则至少把 `docs/v0.9.13-release-notes.md:7` 的「日志零异常」改为「备份链产出正常（首启桥库待次启补备，pg 侧 12 行 `forge_bridge` 未建库 FATAL 为已知噪声）」，并把顶行 s92「13 轮全绿」口径按 F1 复盘修订（该矩阵未覆盖 backup.log/pg.log 与进程 exit_code）。
- 收尾：`C:\PF-QA` 整树删除、挂起 wrapper cmd 清零、PF 进程 0、端口 8099/8091/8790/5432/4222/8222/8188 全闭。

## 6. F3 定点复验（s93c，2026-09-15 21:10 定稿）

复验对象：commit d1f102c 重打包的 `dist/PocketForge-20260915-v0.9.13.zip`。

- 指纹独立复核：sha256 = `956f821b9c4ce1754eb247910cf6ac8d687d6815751bb07c1753cd2866c3ee7b`（25300 文件，与声称一致）✅
- 产物一致性：包内 `bin/forge-backup.js` 与 `conf/templates/forge-backup.tpl.js` 与仓内 `forge/conf/templates/forge-backup.tpl.js` 三者同哈希 `66ad92eddcda3b00…`（8086B）逐字节一致 ✅
- 方法（沿用上轮口径）：全新解压 → 降权 `runas /trustlevel:0x20000` 冷启 → bridge healthz 200 → `daily-backup` 终态 → **产品停止脚本停机 → 终态日志扫描**（pg.log 仅停机落盘，上轮勘误口径）。夹具 `tmp/s93c-qa/harness/{g1_run,stop_run,rescan,f3_verdict}.py`，证据 `tmp/s93c-qa/<tag>/`。

| 树 | bridge 就绪 | `daily-backup` exit | pg-dumps（两库） | backups zip | 终态日志命中 | 控制台命中 |
|---|---|---|---|---|---|---|
| a | 200 / 14.2s | **0** | `pg-*.sql:672` + `pg-bridge-*.sql:4019` | 12012B，含 `pg-dumps/` 两条 | none | none |
| b | 200 / 10.7s | **0** | 672B + 4019B | 12017B，含两条 | none | none |
| c2 | 200 / 14.2s | **0** | 672B + 4020B | 12015B，含两条 | none | none |
| d2 | 200 / 14.2s | **0** | 672B + 4020B | 12015B，含两条 | none | none |

- **FATAL 根除**：4/4 树控制台（`*-launch.log`）与停机后全 `data/logs/`，`FATAL / ENOENT / database ... does not exist / panic / Traceback / EADDRINUSE / denied / 不是内部或外部命令` 命中数 **全 0**（上轮同口径 4/4 树各 12 行 FATAL）。词典与判定脚本 `f3_verdict.py`（同 PATS）。
- **「首启桥库必落空」根除（新增实证）**：`data/pg/base/16384`（首个用户库目录）ctime vs `pg-bridge-*.sql` mtime：a 20:40:47→20:40:49、b 20:45:29→20:45:30、c2 21:02:18→21:02:19、d2 21:05:59→21:06:02（差 1-3s）。4/4 dump 内含 `CREATE TABLE`（`forge_archive_index` / `forge_workspace_map` / `schema_migrations` / `usage_daily`）= 非空壳；备份链注释「等待的价值=把 forge_bridge 备上」现已成立。窗口证据 `tmp/s93c-qa/f3/F3-window-after.txt`。
- **发布说明复核**：`docs/v0.9.13-release-notes.md:7/8` 的「两库 dump 均产出、停机后全日志零异常」与实测一致 → 上轮「与实测冲突」失真项关闭。
- 纪律：每树停机 rc=0、1.8-2.3s「all stopped.」、零残留进程、pc/faucet/pg 端口全闭（`<tag>-stop.json`）。
- **我自己夹具 bug 披露**：树 c/d 两跑因 bash 双引号内 `\\$t` 被吃成字面量，落到同一根 `C:\PF-S93C$t` 串行两跑（非产品缺陷；两跑各自含首启 bootstrap 标记、零残留停机、终态零命中，作旁证）。为严谨补跑 c2/d2 两棵独立树，凑足 4 棵全新树。
- **裁决：F3 关闭。release 放行**（4/4 全新树四项条件全绿：exit 0、两库 dump、停机后零异常、zip 含 pg-dumps）。
- 收尾：`C:\PF-S93C`、`C:\PF-S93C$t` 整树删除；历史遗留沙盒 `C:\PF-F1/F2/F3`、`C:\PF-V` 同删；挂起 wrapper cmd 清零；`Path -like 'C:\PF-*'` 进程 0；端口 8099/8091/8790/5432/4222/8222/8188 全闭。
