# s89：s88 矩阵四红修复（R1-R4+Y1）+ R3 机理取证与升级演练

- 日期：2026-09-15 凌晨　执行：pf-engineer　输入：docs/runbooks/2026-09-15-s88-install-matrix.md §1
- 结论一句话：四红全修 + Y1 顺带修；R3 机理定案（pc down 按 PPID 可达性收杀进程树）并完整升级循环演练绿；基线 fuzz 189/189、e2e-chat 58/59（1 红=上游模型黑洞环境红）、e2e.sh §4-5 钉子 3/3 绿（§2 同环境红）。

## R1 聚合器粘行 FTL（自家协议形态下次启动死栈）

- 根因：两处聚合器（`forge/启动数字员工.cmd` 内嵌 PS + `forge/conf/dev-stack-up.ps1:22-30`）`-replace '(?m)^processes:\s*$',''` 只删行内容，剥行后的文件体被 `'processes:' + ($c -join NL)` 直接拼在 `processes:` 同一行。协议形态（forge-meta 首行注释、processes: 在第 2 行）→ 产物首行 `processes:# forge-meta: {...}`（`#` 紧贴冒号不成注释、`{` 进 flow mapping）→ pc up FTL。朴素形态（processes: 首行）剥行后残留 `\n` 侥幸不炸——这就是历批没暴露的原因。
- 修法：`('processes:' + [Environment]::NewLine + ($c -join [Environment]::NewLine))`——joined 内容强制另起一行。cmd 内嵌 PS 用 `[Environment]::NewLine` 表达式而非反引号转义（cmd 引号层零新增转义面）。
- 验证：① 单元级（C:\PF-FIX\r1，已删净）：旧形态字节级复现 `processes:# forge-meta:` 且 pc --dry-run FTL「did not find expected ',' or '}'」（与 s88 A6 错误串逐字一致=装置有判别力）；新形态 pc --dry-run "Validated 2 configured processes from 2 files"。② 真机冷启：e2e.sh §4-5 抽段重放（tmp/s89-e2e45-replay.sh，fixture=协议形态）3/3——热注册+8199 服务+runas 降权 relaunch 后自动回归；dev 树 conf/apps.env.yaml 字节级 `processes:\r\n# forge-meta:`。③ 升级演练中 v0.9.13-s89fix 重启链同绿。
- 回归钉子：e2e.sh §4 动态 fixture 改协议形态（forge-meta 首行+单引号），§5 重启持久从此每批都过这条路径。

## R2 模板/hints 教双引号值 → pc 插值反斜杠转义爆炸

- 根因：pc 在 YAML 解析前做 `${VAR}` 文本插值——`${FORGE_ROOT}` 替换成 `C:\...` 反斜杠路径后落进双引号标量 → `\P` 等未知转义 FTL（s88 A6 第二轮实锤）。厂内 process-compose.yaml 全单引号=正确惯例，模板却示范双引号。
- 修法：`forge/conf/_app-template.yaml` command/working_dir/log_location 全改单引号+规则第 5 条写明；`goose-hints.tpl.md` 应用注册协议补第 6 条（单引号铁律）+ 运行时清单补 command 照抄示例（单引号+`${FORGE_ROOT}`）。
- 验证：hints 物化 cmp 逐位一致（tpl 替换 `__FORGE_ROOT__`/`__FAUCET_PORT__` 后与 conf/goose/config/.goosehints 字节相等）；协议形态 app（单引号 command+`${FORGE_ROOT}`）真机热注册+冷启双过（e2e §4-5 重放 + 升级演练 drill-proto）。

## R3 栈内升级 runner 死于 stop 段（机理 UNVERIFIED → 已定案）

- 取证（单变量隔离，C:\PF-FIX\r3exp 四臂，宿主=pc 托管进程，心跳体每 300ms 落盘，活判据=行数增长）：
  - 现象：`pc down` 后臂 A（桥现行 `spawn(detached:true, stdio:'ignore').unref()`）与臂 C（+windowsHide+stdio 文件变体）心跳止步、进程死；臂 B（powershell Start-Process 中介即时退出）存活持续跳。
  - 对照：A/C 死排除「detached/windowsHide/stdio 形态可自保」；B 活排除 Job 对象全体收杀（Job 语义下 B 的 powershell 链也在 job 里应同死）。
  - 结论：pc down 按进程树 PPID 可达性收杀托管进程的后代；bridge spawn 的 runner 虽 detached 仍是桥的可达子孙，stopStack 执行 `pc down` 时连带死——s88 B3 的 status 永卡 stop/护栏同死由此而来。桥无 exit 钩子杀子（静态排查），杀手纯外部。
- 修法：`chat-bridge.tpl.js` /api/update/start 的 runner spawn 改 base64 Start-Process 中介（同文件 2668 行先例）+`-WindowStyle Hidden`（node 控制台程序防弹窗）；参数逐个 base64 过渡（PS 零插值零转义面）。中介退出 → runner PPID 链 spawn 期即断 → 脱离桥进程树；runner 既有落盘日志/心跳/20min 超时回滚（s75）自此真正可达。
- 演练（C:\PF-FIX\drill，已删净）：v0.9.12 官方包基座+注入修复桥/runner/bootstrap → 注册协议形态 app → 桥上传 v0.9.13-s89fix 补丁包（官方 zip+修复文件重打，sha256 5a3fca83…）→ check→start 全绿：`heartbeat: 停栈 完成 +648.8s`（runner 存活过 pc down，s88 死点）→ 差量替换 → 重启 → `done True 已升级到 v0.9.13`；升级后栈 healthz ok、协议 app 自动回归+服务中。plan 段 walkMap 25k 文件哈希 ~10min（AV 环境），护栏余量观察项维持。

## R4 升级删用户 apps（v0.9.12 存量升级路径）

- 根因（s88 已定）：执行升级的 runner 是装机版（v0.9.12 无 apps/ 保护）。
- 产品侧修：桥 preUpgradeBackup 备份集 `['conf/goose/config','data/config']` 补 `'apps'`；恢复说明.txt 加 apps 步骤。
- 演练实证：pre-upgrade-*/manifest.json `items: {"apps": 2}`，备份内 apps/drill-proto.{yaml,js} 在位。
- 诚实边界（已写入代码注释）：此修只对 v0.9.13+ 桥发起的升级生效（v0.9.12→v0.9.13 存量升级时执行侧桥是 v0.9.12 的，无此备份）；v0.9.12 用户升级后可从 data/updates/backup-*/apps/（runner 差量备份）或本修产生的 pre-upgrade 备份补回。release notes 责任段主控已排（fe3f060 补的就是这条手动步骤）。

## Y1 FAUCET_ADMIN_PW 种子拆裸行

- 根因：bootstrap.ps1 数组元素 `'K=' + expr,`——PS 逗号优先级高于 `+`，拼成 string+数组展开多元素，WriteAllLines 落成裸行。
- 修法：加括号 `('FAUCET_ADMIN_PW=' + …)`。验证：单元（4 元素、PW 单行 len=40）+ 演练基座首启 secrets.env 实测（PW 恰 1 行、零裸行）。

## 环境红留档（非本批改动面）

- 上游模型路由本窗全黑洞：goose 真会话 banner 后零输出（600s+ timeout 对原生 Windows 进程不生效，taskkill 解卡）；小载荷直连也 40s 超时（比 s88 A5「小载荷 200」更差）。受累：e2e.sh §2（截停于 set -e，§4-5 已抽段重放绿）、e2e-chat sid-reuse-rescue 1 项（注释明示依赖 LLM 连通）。恢复后建议整跑 e2e.sh 一次。

## 验证与留痕

- fuzz 189/189、e2e-chat 58/59（1 环境红）、e2e §4-5 钉子 3/3、apps-probe 44/44、apps-fuzz 21/21、物化 cmp 逐位一致、node --check 桥/runner 过。
- 沙盒纪律：C:\PF-FIX（r1/r3exp/drill）整删，零进程零端口残留复核；dev 栈终态=PFdrill2 正统承载 8 进程+e2e-report（e2e 跑后常态）。
- 打包未做（主控统一重建）；STATE 未动（主控收口）。
- 过程教训两枚：cmd 脚本注释禁非 ASCII（GBK 代码页把 UTF-8 中文 rem 解析成乱码命令）；按命令行串杀进程时过滤词会匹配到自家 shell（本会话自伤一次，已复核实证无残留）。
