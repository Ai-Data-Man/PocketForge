# v0.9.13 出厂包 §8 全功能复测矩阵（冷装 + 升级装）runbook

- 日期：2026-09-15 凌晨（s88）　执行：pf-qa
- 被测物：`dist/PocketForge-20260915-v0.9.13.zip`（323,565,103B，sha256 `fc64ac25e85f6b33f59ce5ea8ba81787122d320c716ae280c369d19aea0e36ec`，随包 .sha256 在位且一致——本地 sha256sum 复核）。
- 旧版（升级源）：`dist/PocketForge-20260914-v0.9.12.zip`。
- 纪律：AGENTS.md §8（解压安装 + 升级安装，禁止 dev 树冒充）；矩阵期间 dev 栈零进程（端口 8099/8790/8092/5432 空闲起步，结束时经 PFdrill2 恢复）；探活一律 node 直连；沙盒栈一律 `runas //trustlevel:0x20000` 降权 GBK wrapper（e2e.sh:88-110 先例，每轮 relaunch 前清旧 wrapper cmd——s67 家族，本轮 4 次 relaunch 全程未再踩）。
- 沙盒根：`C:\PF-S88`（终态整树删除，零进程/端口残留复核过）。探针脚本与日志留档 `tmp/`（s88-* 前缀，未入库正文，见本文各命令）。

## 0. 结论总表

| 格 | 内容 | 结果 | 一句话证据 |
|---|---|---|---|
| A1 | 冷装解压+降权冷启 | 🟢 9/9 | healthz 200；8 进程=5 守护 running + 3 一次性 Completed exit=0 restarts=0；pg Ready restarts=0；welcome.shown；日志零「不是内部或外部命令」族；banner `[PocketForge] starting... pc=8099 faucet=8091` |
| A2 | cold-surface 探针 | 🟢 15/15 | `PF_ROOT=C:/PF-S88/pkg cold-surface-probe.sh` 全绿（S1-S6 两步向导/双源/mcp 目录/permission 三键/扩展关停/能力一致） |
| A3 | 新面 spot-check | 🟢 7/7 | `/api/apps`={ok,apps:[]}；页面含 `data-pane="apps"`+「🚀 小应用」；memory-mcp.cmd/pg-init.cmd 纯 ASCII+CRLF+`%~dp0`（字节级）；解压树无 tmp//apps//dev-stack-up.ps1 |
| A4 | P3 非 ASCII 路径预检 | 🟢 5/5 | 中文路径 wrapper 启动→日志两行人话（「…路径里有中文或特殊字符…移动到纯英文、数字的路径下（例如 D:\PocketForge）…」）+ 无 data/ 副作用 + 顶层树不变 + 零 postgres（命令行级甄别，A 沙盒 pg 不误计） |
| A5 | 真模型 GUI 等价链路 | 🟡 半绿 | **配置链全绿**：⚙️ 同源 WS 路径 add→list_models(109)→勾选保存→hot restart→secrets 重写（5/5）；**agent 轮次红=环境**：上游对完整 goose 会话 502/黑洞（3 轮：502、600s 黑洞、502；同窗小载荷直连 200 "ok"）——按预算降级「dev 侧已活体验证（s87 7/9），沙盒 agent 建账留下一窗口」 |
| A6 | 重启持久（S5.4） | 🔴/🟢 | **协议形态（forge-meta 首行注释）=红**：下次启动 pc up FTL（R1）；**对照（无注释+全单引号）=绿 5/5**：聚合自动带起+面板 run+url（probe 层合成）+落真实页+human=null 诚实降级 |
| A7 | 干净卸载面 | 🟢 4/4 | pc down+树删后零栈进程/零 PF-S88 node/业务端口全空；junction 指回 dev 树（target 存在）——P4 守卫语义，未手清 |
| B1 | v0.9.12 装机（带 legacy app） | 🟢 | healthz 200；VERSION=v0.9.12；legacy-web 聚合拉起 running；`/api/apps` 非 JSON（v0.9.12 无此端点=正确基线） |
| B2 | 种子+死模型→换模型 | 🟢 | 4/4+：真 host+死模型池首→**stale-model 告警帧实测**；顶栏 switch acknowledged；告警文案路径（拉取→勾选→保存）→池变 live-only+secrets 重写 deepseek-v4.1-flash+health ok。会话/ws/制品/记忆/faucet 库+forge_meta 行种子齐（哈希留档）；「真会话建库」同 A5 环境红，faucet 种子改走 hints 记载的机械路径（建文件+db add+restart） |
| B3 | 栈内升级 | 🟡/🔴 | upload zip→upload sha256（verified:true）→check（staged 在列）→start 全绿 4/4；**completion 红**：runner 死于 stop 段（见 R3）；同 runner 手动（提权、栈已停）完整走完 v0.9.12→v0.9.13（plan 5m10s→stop 3s→apply→restart→healthz→done） |
| B4 | 升级后断言 | 🟢（两红单列） | VERSION=v0.9.13；种子 4 文件 sha256 逐位不变（记忆/制品/faucet 库/legacy.yaml*）；faucet s88b2+forge_meta 在 /api/db/overview；updates backup-*+pre-upgrade-* 在位；🚀 tab 锚在页；legacy 降级显示 human=null 无编造+state=run+8187 落真实页；cold-surface 15/15 复跑全绿。*legacy.yaml 本体被旧 runner 删（R4），从 backup 恢复后断言 |
| B5 | 差量核对 | 🟢 | 包对包 CRC diff：17 文本变/0 增/7 删（tmp/*+dev-stack-up.ps1=P5 卫生）+ **exe 零变更**（EDR 段口径成立）；升级 applied=17 与包 diff 对账：16 个未保护文本+1 个运行期重生成 pyc（无害漂移）；`custom_providers/forge-router.json` 在包内变但 PROTECTED 跳过=「升级保留用户配置」语义实测（P6 只改出厂默认） |

## 1. 红项分级清单（产品侧，不修，交工程）

### 🔴 R1（P1·阻断）apps 聚合把 forge-meta 注释行粘上 `processes:` → 下次启动整栈 FTL
- 位置：`forge/启动数字员工.cmd:33-37`（聚合 PowerShell 块）与 `forge/conf/dev-stack-up.ps1:22-30`（同款逻辑，双证同病）。
- 机理：`-replace '(?m)^processes:\s*$',''` 只删行内容不删换行→文件体首行保留；拼接 `'processes:' + ($c -join NL)` 把**第一个** app 文件的首行直接粘到 `processes:` 后。S1 协议规定 forge-meta 注释是首行 → 产物首行=`processes:# forge-meta: {"description":...`（注释失效+`{`进 flow mapping）。
- 复现（A6 首轮）：`apps/s88seed.yaml` 首行带协议注释 → 降权 relaunch → `FTL Failed to parse C:\PF-S88\pkg\conf\apps.env.yaml error="yaml: did not find expected ',' or '}'"`（launch.log 留证）；对照（去掉注释行）同机同法启动成功。
- 影响面：**任何 agent 按协议第 5 条建账的 app，用户下次双击启动=整栈起不来**（S5.4 验收项恰是本批新增面，从未被前批覆盖——s87 活体清了 yaml 才重启、dev 树残留 app 均无注释首行）。裁决书 §0「注释行穿透无害」的判断只在「行独立」时成立，粘行后失效。
- 修复方向（供工程）：剥行连换行（`'(?m)^processes:\s*\r?\n'`）或 join 前对每文件体 trim、输出 `processes:`+NL+体；修后必须把「协议形态 app 存在时冷启」纳入探针。

### 🔴 R2（P1·阻断）_app-template/hints 推 `${FORGE_ROOT}` 进双引号值 → pc 解析期反斜杠转义爆炸
- 位置：`forge/conf/_app-template.yaml`（command/log_location 双引号占位）+ `goose-hints.tpl.md` 运行时清单（「绝对路径用 ${FORGE_ROOT}」）。
- 机理：process-compose 在 YAML 解析前做 `${VAR}` 文本插值→`C:\PF-S88\pkg/bin/...` 进双引号标量→`\P` 未知转义。厂内 `process-compose.yaml` 全单引号（正确惯例），模板却教双引号。
- 复现（A6 第二轮）：command 改单引号后错误**移动**到 line 10 `log_location: "${FORGE_ROOT}/..."` → `FTL ... line 10: found unknown escape character`；第三轮全单引号→启动成功（A6 对照 5/5）。热注册路径（agent 跑 project update）同撞。
- 修复方向：模板+hints 全部改单引号形态；探针加「模板 yaml 逐值引号断言」。

### 🔴 R3（P1·阻断，机理 UNVERIFIED）栈内升级 runner 死于 stop 段，升级永久卡死+栈停
- 现象：B3 真实路径（上传→check→start）4/4 后，runner 日志止于 `[upd] stop 停止数字员工…`（17:57:37.647Z），进程消失（tasklist 零 node update-runner），status.json 永停 `stage=stop`，栈已停、启动器窗 pause；20min 护栏随 runner 一起死=**无自愈无回滚**。
- 对照实验：同一 staged 包、同一 runner 代码，从我（提权）shell 手动执行 → 完整成功（`=== 升级完成 v0.9.12 -> v0.9.13 ===`，plan 5m10s/stop 3s/apply/restart/healthz 全过）→ 差量/重启机制本身健康，**死因在「由桥 spawn 的 runner 随栈收杀」这一上下文**（候选：pc down 收杀桥进程树时波及 detached 子——Windows job/`taskkill /T` 语义；本轮事件日志零崩溃记录，支持被杀而非崩）。
- 版本核对：up 树 runner（v0.9.12）与 dev 树（v0.9.13）仅差 PROTECTED+=apps/（50cb103），核心自 c425d1c 未动——非 v0.9.13 回归，但真实用户路径今晚实测即死。历史演练通过 vs 本轮死亡的差异未定（UNVERIFIED），交工程取证；处置方向：runner 自保（breakaway/job 隔离）或 stop 段前先自我再拉起（watchdog）。
- 用户侧后果画像：向导永远转圈+栈是停的+零提示（status 卡 stop）。

### 🔴 R4（P1·升级语义）v0.9.12→v0.9.13 升级删用户已注册 app（S5.5 验收红）
- 铁证：`data/updates/backup-2026-09-14-18-14-05/manifest.json` `deleted:['apps/legacy.yaml', ...]`；升级后 `up/apps/legacy.yaml` 消失。
- 机理：**执行升级的是装机版 runner**（v0.9.12，PROTECTED 无 'apps/'），修复 50cb103 在进包侧——护不到「运送它自己的这次升级」。v0.9.13→未来版本已受保护（本轮 applied 的 bin/update-runner.js 已含）。
- 影响面：全部 v0.9.12 存量用户（按真实路径升级）丢已注册 app；备份副本在 `data/updates/backup-*/apps/`（本轮从备份恢复后续跑断言）。至少需发布说明显眼补丁步骤（升级前备份 apps/，升级后拷回）；工程侧可评估 start 前自愈/文档化。

### 🟡 Y1 出厂种子 FAUCET_ADMIN_PW 值被拆成裸行（bootstrap 数组解析怪癖）
- 位置：`forge/conf/bootstrap.ps1:132` `'FAUCET_ADMIN_PW=' + (& $chars).Substring(0,24),`——首次落盘产物实为 `FAUCET_ADMIN_PW=\r\n<24位随机串>\r\n`（hexdump 留证）；自 60c8（2026-08-20）起历版皆然，本轮 §8 字节级首启检视才现形。
- 影响评估：全包零消费者（bin/templates/process-compose 全 grep）；副作用=启动器 for /f 把裸行 set 成空值随机名变量+secrets 里留一行无 `=` 垃圾；桥 rewriteSecretsEnv 首次保存 provider 即自愈（形状门滤掉）。判应修不阻断：修法一行（表达式加括号），另评估 FAUCET_ADMIN_* 两键是否该继续播种。

## 2. 观察项（💭 不立项）

- 顶栏 `switch_model` 不落 secrets（s78c 设计：override 内存态）；告警条文案指的「⟳ 拉取→勾选→保存」路径才重写 models[0]——两路径行为差异实测符合设计，文案与行为自洽。
- `%APPDATA%\Block\goose\config\memory` junction 机器级唯一：A 沙盒首启时 junction 有效指向 dev 树→P4 守卫（Junction+Target 双条件）判定 ok 不重建→沙盒 goose 的记忆面映射到 dev 树。本轮零写入（dev 树 git status 0 行、memory 文件 mtime 未动）；多安装共存共享记忆目录=潜在行为，单安装目标场景不触发，留研究注记。
- runner plan 段 5-10 分钟（25k 文件 walk+hash，AV 环境下）——20min 总护栏被吃掉一半，R3 修复时一并评估。
- 首启 daily-backup 与 pg-init 竞速：pg_dump 连接拒绝→graceful skip exit 0（幂等语义，非新缺陷）。
- A5/B2 上游模型路由：小载荷 200、完整 goose 会话 502/黑洞（同窗三次）——环境侧故障形态留档；配置链/面板链/换模型链均不依赖它已全绿。
- 升级 applied 集含 1 个运行期重生成文件（pywin32_bootstrap .pyc，mtime 型漂移）——无害，差量对账口径已知形态。

## 3. 环境与复位记录

- 沙盒：`C:\PF-S88`（pkg/数字员工/up 三树）终态整删；零栈进程/零业务端口/explorer 窗 3→0（close-explorer-windows.ps1）；junction 按 P4 语义未动。
- dev 栈恢复：PFdrill2 停栈后呈僵尸「正在运行」（s80 已知态）→ `/End`+`/Run` 补丁 → healthz 200 + 8 进程 5 守护 running+3 一次性 Completed exit=0 restarts=0（drill-devrel.log 留证）。**兼为新启动器（chcp 65001+P3 预检）经计划任务真实路径的首证**：任务→wrapper→`启动数字员工.cmd`（v0.9.13 形态）→栈健康、banner 正常、零解析错误。

## 4. 复现资产

- 探针与日志：`tmp/s88-*.js|log|json|txt`（a1 断言/a3 spot/a4 预检/a5 活体与配置/b2 provider 与 faucet/b3 升级/三份 launch 日志/种子哈希）。
- 关键命令形态：降权冷启=python 写 GBK+CRLF wrapper（`call "<根>\启动数字员工.cmd" > log 2>&1`）→清旧 wrapper cmd→`cmd //c runas //trustlevel:0x20000 "<wrapper>"`→等 ≥45s 再断言；cold-surface=`PF_ROOT=<根> bash tools/e2e/cold-surface-probe.sh`；包 diff=zipfile 中心目录 CRC 对账。
