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
