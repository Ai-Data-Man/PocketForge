# 2026-09-18 s97：膨胀 R3 机制内建制 + 启动器就绪开窗 + 热注册缺陷族 F-7~F-11 连环修复 + 从零测试四轮

用户三主线：①数据膨胀第三次提出（技能/管理小 forge 仍有膨胀可能、未全用分页缓解、搜索缺过滤维度）②命令行启动应真的就绪后再开 welcome+自动跳转小 forge 地址+打印到黑窗口 ③以上完成后从零安装反复测试观察一切可观测点逐一修复。测试模型=9router glm-5.3-flash。

## 主线1：膨胀 R3 机制内建制（裁决 b8bf3a7 + 工程 37ce615）

- 裁决 docs/verdicts/2026-09-18-bloat-r3-built-in.md：根因=「终态规模预期」判据错误（apps/sched 是 agent/对话驱动无上限，给最活跃引擎挂最弱护栏）；关键裁刀=区分「机制已建 UI 阈值内隐藏」（ins 合规）vs「机制没建只有注释承诺」（apps/sched 欠账）。
- 实施：apps pageSlice 12/页+状态 chips 四态（全部/✅运行中/⏹已停/⚠️出错了，过滤字段=徽章同源显示态含 uiStopped 修正）；sched pageSlice 30/页+暂停 chips 三态（drift 不入）；AGENTS.md §7 R2 整条替换为机制内建制文本（无上限增长清单强制三件套：分页+搜索+≥1 结构维度；「>N 再加分页」式声明=审查不过）。
- 验证：ui-logic 56/56、ia-logic-probe 11→28ck（D/E 组伪造数据渲染单测）、fuzz 190/190、e2e 61/61。

## 主线2：启动器就绪门控（6cbc0f7 + QA P2 034e55a）

- 新增 conf/open-when-ready.ps1（UTF-8 BOM）：轮询 TCP 8790+healthz 200（240s 超时）→ 打印地址+中文人话 → 首启 welcome（3s 后改名保 s50 语义）→ Edge --app 开聊天窗（与 跟数字员工聊天.cmd 逐参数同款，缺 Edge 回落默认浏览器）→ 超时只打印人话不弹窗。
- 启动数字员工.cmd：删旧「pc up 前开 welcome」块，加 start /b waiter（共享控制台）。
- QA P2-2 修正：超时文案次序改 pc.log 先行（删「重新双击启动器」引导——preflight 会拦）。
- 出厂实证（s97a 冷启）：welcome+聊天窗均由就绪后 waiter 打开（Edge 进程 --app=8790+沙盒专用 profile 铁证）；QA 四路径桩测全过。

## 回归修复：faucet-rawsql SQLITE_BUSY（e7f69ae）

QA 复跑发现 e2e 5 红（4×backup+1×apps A9/A11），干净 HEAD 同红=环境态。根因=faucet-rawsql（oneshot）与 faucet-provision 并发写 faucet.db 撞锁 → exit 1 → daily-backup depends_on 被跳过。修=PRAGMA busy_timeout=5000+3 次退避；EXCLUSIVE 锁 holder 阴阳对照实证判别力；从零安装 s97a 复验 faucet-rawsql Completed exit=0+备份链全通。

## 主线3：从零安装四轮（iat7~iat11 × s97a/b/c-d/g，glm-5.3-flash）

冷启恒 10-13s、五端点 200、welcome 后置、apps/sched chips+分页容器在场、零 JS 控制台错误、faucet-rawsql/backup 链全通。**缺陷连环（全部修复+复验）**：

- **F-7（a3f445f）wrapper env 自备**：s95 F-6 wrapper 只设 FORGE_ROOT；pc project update 用调用方 env 重渲染全部 ${VAR}——agent shell 缺端口/secrets 时空值插值被判漂移（对照组：pg 空 ${PG_PORT} crash-loop 死透+chat-bridge 重启）。修=wrapper 自备启动器同款完整 env（端口文件+缺省 8099/8091/5432+secrets.env 遍历+GOOSE_*/NODE_DIR/NO_PROXY）。
- **F-8（ed88399）_app-template 规则4 教法**：原教裸拼 `pc project update -f conf/process-compose.yaml -f apps/<name>.yaml`（缺两个 -f=F-3 崩溃族配方），改教 wrapper 单命令。
- **F-9（2a07ecc）wrapper ROOT 归一化**：`ROOT=%~dp0..\..` 从未归一——启动器建立的 ${FORGE_ROOT}=干净路径，wrapper update 全部渲染成 `...\bin\pc\..\..` 脏串 → 31 处 command/working_dir/log_location 全漂移 → pc 全表重启（含 chat-bridge）→ 在飞回合孤儿化无终态；客户端随树被杀 → errorlevel 1 假报 register failed（实际注册成功）。**s95 轮3/4「restarts=0」是 update 整体替换后计数器归零的假象（诚实锚=pc.log ACP initialized 计数，教训入注释）**。修=`for %%i in ("%~dp0..\..") do set "ROOT=%%~fi"`。
- **F-10（d8a04da）hints 时长教学**：冷启后头几分钟管家排队做启动收尾（s97c 实录 daily-backup 与 update 同秒），update 跟着慢 >60s，agent 自设 timeout_secs:60 掐死正在成功的注册（"(no output)"+exit 1）。修=hints 教 timeout≥300 秒。s97d 复验 agent 已用 300。
- **F-11（9e4420d）bootstrap 真值种子**：bootstrap 种的 FORGE_AGENT_HOST 缺省（127.0.0.1:20128/v1/ 死地址）被桥 provider 同步改写成真值 → 启动器导出旧值≠文件现值 → update 判漂移重启桥。修=bootstrap 启动时从 data/providers.json 活跃档案种 FORGE_AGENT_HOST/API_KEY/GOOSE_MODEL_NAME 真值（缺失/坏 JSON/无 active 回落缺省 fail-safe；升级自愈分支：出厂缺省字面值→档案真值对齐一次，用户自设不动）。单元 29/29；端到端：真桥 provider 同步后 secrets 哈希恒同（三点恒同物证）+新栈窗口净化 env 注册 1 秒完成 ACP 零增长。
- **F-12（已根治，机理源码定案）**：富 yaml（readiness_probe http_get+availability）注册在 agent 路径仍见桥重启+update 长等待（s97b 03:14/s97d 04:24/s97g 05:33 三次同签名：注册秒桥重启+daily-backup 重跑）。**researcher 源码定案（docs/research/34，a9ae505）=pc v1.122.0 Vars 类型漂移**：update 客户端 POST 渲染后项目 JSON，templater 恒注入 PC_REPLICA_NUM(int)→JSON 往返变 float64→守护 reflect.DeepEqual 判不等→**守护生命周期内第一次 JSON update 必全表重启**；服务端 reload 恒零漂移的分叉实验定案；「冷启 2-4 分钟窗口」是行为模式假象（agent 注册总恰逢首更）；配方 A 的挂起/ACP+2 残角 UNRESOLVED 留探针（research/34 §五）。**根治（5bbf70c）**：forge-register.cmd 增 `converge` 模式（三件套 update，空参仍 usage）；open-when-ready.ps1 在 healthz 首达后、开窗前静默自跑收敛+重等 healthz——首更重启消耗在无人对话窗口。出厂时间线铁证：08:40:20 收敛全表重启（开窗前）→08:40:25 才开 welcome/聊天窗；收敛后净化 env 注册新应用=纯 add+ACP 零增长+四 PID 不变（对照修前同型注册=全表重启+回合孤儿化）。附带源码定案：pc 对比=16 直比+12 DeepEqual（readiness/availability 参与）、纯字符串无归一化（P2-2 坐实）、新增进程不连带重启、update 不等 readiness。

## QA 复审

- 早批（launcher/分页chips/rawsql）：tmp/qa-s97-review.md **通过**（P2×2 留修已落 034e55a：fuzz svc-14 快照排除 sqlite 瞬态伴生文件+超时文案；P3×5 留档）。
- 晚批（F-7~F-11 五 commit）：tmp/qa-s97-late-review.md **轻返工→已闭环**（独立复跑 e2e 61/61+单元 29/29+物化链；两 P2）：**P2-1** F-11 残余=退化活跃档（host/池空）bootstrap 种缺省 vs 桥写空值→三点恒同破缺；**P2-2** F-9 残余=pc 漂移对比**大小写敏感**（QA 活体：盘符 C:→c: 即全表重启），agent 手打路径 case 不一致即触发。修（c28d898）：bootstrap 镜像桥写值形态（退化档种空值，恒同优先于好看）+`data\forge-root.txt` 规范形（端口文件同款先例，wrapper 优先读+%~fi 兜底）；单元 39/39（+U8 退化档）；iat12 沙盒红绿对照（修后小写盘符手打路径 exit 0+ACP/pid 恒定；修前同形全表重启）。QA 建议级六条留档（报告内）；「冷启后首次 update 单次重启」现象与 F-12 同域未定案。
- 独立复跑：e2e 61/61（×2）、fuzz 冷热两轮 190/190、ui-logic 56、ia-logic 28。

## 观察项（非缺陷留档）

- 工具卡 GBK 乱码：agent shell 的 cmd 中文输出（dir 卷标等）按 UTF-8 渲染成乱码——显示层 P3，backlog。
- 栈 wedge 态时 pc down 客户端永久挂起、阻塞停止脚本 hard_stop 升级段（s91 已知风险自认，本次再触发）——跟进项。
- 会话残留 ACP 惰性初始化：页面重连触发桥 goose 再初始化（非重启），计数解读时注意区分（pc.log 相邻行时间可辨）。

## 收官终验（iat13/s97h 零干扰整回合——s95 遗留「整回合终态证据」正式闭环）

完整修复栈（F-7~F-12 全含）出厂包冷启 12.8s（含收敛段）→单会话零主控干扰真任务「搭常驻家庭备忘应用」（glm-5.3-flash）→ **全链首次完整走通**：agent 写 yaml（forge-meta 四键）→ hints 教法调 wrapper（timeout 300s 已学）→ **注册卡成功**（`Project updated successfully`+`registered:` 输出完整捕获）→ agent 自验（process list）→ **终态回复全文在场**（网址 8123+用法+看管方式+「电脑重启后自己回来」说明）→ 应用真实服务（HTTP 200）。全程 ACP=2 恒定（两次都在启动窗内=初始+收敛，注册零重启）、零控制台错误、typing 正常收束。s95 轮4 起缺的「整回合终态证据」至此取得。环境：沙盒整删零残留、dev 栈 PFdrill2 复位健康（10 进程）。

## 会话终态

19 commit 全推 origin（6cbc0f7→4a6ce89+本收尾）；测试包 iat7~iat13 在 dist（iat13=完整修复栈，含启动收敛）；终态基线 e2e 61/61+fuzz 190/190+ui-logic 56+ia-logic 28。
