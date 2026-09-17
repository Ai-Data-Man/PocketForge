# 2026-09-16 s95：能力域 IA 去重 + 清单膨胀 R2 补课 + 小应用启停 + 从零安装复测

用户四主线：①「管理小forge/本事/技能」IA 归类重叠 ②老早提过的数据膨胀在技能+管理面板仍可能出现、未全用分页缓解、缺过滤维度 ③小应用缺启停 ④基础能力盘点；⑤以上完成后从零安装反复测试观察一切可观测点逐一修复。测试模型=9router glm-5.3-flash。

## 裁决（PM，df04956）

docs/verdicts/2026-09-16-capability-ia-bloat-startstop.md。要点：IA 病根=词汇撞车（本事/本领同义）+MCP 生命周期按动作裂两地 → 按实体划界（本事收窄纯自带/插件 tab 启停钮归位/技能全周期+来源 chips，词汇分职「自带 vs 学会的」）；R2 逐清单重declare（09-05「渲染无压力」豁免作废，关切=找回效率）；supersede s87 启停/日志裁掉（POST /api/apps 三道闸，「停」=运行态+诚实文案）；D1 应用日志随批做（折叠技术区）；D2-D6 挂 backlog 带触发器。非目标：7 tab 不重组、台账零触碰、持久停用不做。

主控补证两条入裁决：pc CLI 全套控制通道（start/stop/restart/logs，VERIFIED-RUN）；09-05 膨胀论证历史脉络。

## 基线复核（会话开工）

e2e 60/61（唯一红=§18c ws-rollback 批载瞬态家族，STATE s78 已记录；单跑 31/31 绿定性，非产品回归，取证沙盒清理）+ fuzz 190/190。

## 工程批（pf-engineer，12 commits 37b34b4..0ba4e22）

S1a GET 收窄纯内置四行（撤 s57 并入）/S1b 插件 tab 启停钮/S1c 本事词汇分职/S2a 技能来源 chips+local 徽标/S2b db 分组分页 30/页+桥护栏 50→200/S2c apps-q/S2d sched-q/S2e mcp-q/S3a POST /api/apps 三道闸（deny-list 9 键）+D1 logs 端点/S3b 启停钮+停止注/日志子区/S3c apps-probe 44→69ck+apps-fuzz 21→22 asserts。

**F12 验证结论（tmp/f12/findings.md）**：①stop 不被 on_failure 拉起（T2 不触发）③absent start 快速失败→absent 卡无 ▶ 钮④deny-list 实核 9 键（勘误：nats/pg 键名与猜测不同）⑤--tail 有效、无挂起。**意外自证：apps/\*.yaml 声明 infra 键经 -f 合并覆盖真定义→pg crash-loop（聚合/启动层此前无守卫）→ 主控拍板立项聚合器守卫（跳过坏文件+人话告警，栈健康优先），独立工程师批实施中。**

验收线：e2e 61/61+fuzz 190/190+物化 cmp 逐位一致+零残留（apps/ 基线、pc 表 10 进程、git 干净）。

## QA 复审（pf-qa，通过；报告 tmp/qa-s95-review.md）

- **P2-1 当场修（da38d81）**：🔌插件开关钮 no-op——`next=!(m.enabled===false)` 取当前态非翻转态，点击恒 POST 原状态=开关永不生效（GUI 冒烟 S2e 实证 POST enabled:true on 已开行）。漏网原因=工程批验收只做语法块过+healthz 无行为测——GUI 浏览器级冒烟的独占价值实证。一行修，修后 GUI 68/68+e2e 61/61+fuzz 190/190。
- **写通道安全 70/70**：三道闸单变量全拒（未知/超长/Unicode/遍历 id、16 态类型混淆、Origin 伪造、deny-list 9 键×stop+logs 逐键、日志端点 9 负向量+405）+幽灵 proc 正对照过闸。
- **GUI 冒烟 68/68**：本事 3 行+fnote 逐字/启停钮翻转+失败回滚/chips 四态/db 分页组头跨页（20 表计数=匹配总数）/三搜索域/启停三态+absent 无钮/停止注生死/日志按需+零重复/全页零 JS 错误。
- **P3×3 留档**：①ia-logic-probe S3c-sync 是提取同步非断言同步（变异判据仍绿=裸奔，QA GUI 冒烟会话级钉住）②APP_INFRA_PROCS 手工拷贝无 ⊇yaml 交叉核对 ③桥闸×聚合守卫缝隙面（守卫落地后建议同源）。P4×4 备注（空日志文案/alert 拼接/chip 空态复用/空 procs stop 形态——均无害留档）。
- 探针判别力 M1/M2/M3 变异必红；物化 tpl==bin 字节一致；fixture 零残留。F12② 冷启链路未验（禁重启纪律）→归 §8 从零测试批。

## 聚合器守卫批（pf-engineer，5fbebfa+554db36）

工程批意外自证（apps/*.yaml 声明 infra 键经 -f 合并覆盖真定义→pg crash-loop）→ 主控拍板：栈健康优先。交付=conf/apps-aggregate.ps1 单一真相源（两聚合器 12 行内联段各收敛为 1 行 -File 调用；启动器去 >nul 让告警可见）；守卫=顶层进程键命中主 yaml 现读键集→跳过该文件+人话告警（console+conf/apps.guard.log 每启覆写零告警即删）；主 yaml 缺失 fail-open。验证：段级 24/24（含勘误键名钉：postgres/nats-server 放行不误伤、pg-init 拦截）+真树静态断言（apps.env.yaml SHA 前后恒等）+apps-probe 69/69+主控复跑 24/24。bootstrap 零触及（查证不复制聚合器）；package.sh 仅补清理条目。工程留档：PS5.1 `return ,@()` 陷阱（`@(fn|Where-Object)` 的 $_=整个数组）。

## 收尾小批（完成）

QA P3 收尾（bafbb51+b2e6af2）：桥 deny-list 同源化（启动时现读 conf/process-compose.yaml 顶层键，读失败回落 9 键常量 fail-safe；双形态 PID 驱动实证）+ia-logic-probe 补 chip 行为断言（7→11ck，变异 self→selfx 必红）；e2e 61/61。

## 主线5：从零安装测试（v0.9.15-iat1，沙盒 C:\PF-TEST\s95a）

包：323,600,652B/25,303 文件，sha256 d6434c68…。全量发现清单=tmp/s95/findings.md。**三缺陷**：

- **F-3（P1，阻断）真会话 agent 热注册永久挂起**：agent 按 hints 第 5 条执行 `pc project update -f conf/process-compose.yaml -f apps/today-quote.yaml`（首次真正启动新进程）→ shell 卡 in_progress **14 小时**、typing 常亮、零错误卡零超时。证据链：同款命令 node spawnSync 受控测量 **945ms 正常返回**；挂起时进程树无残留 process-compose.exe；时间线排除测试污染（挂起在 00:2x，GUI stop/start 在 14:20）。假设=update 启动的新进程继承 goose shell 管道写端→永不 EOF（Windows 句柄继承家族）。影响=新装机搭应用主路径。→ pf-researcher 单变量取证中。
- **F-2（P2，核心可用性）手动停止显示「⚠️ 出错了」**：pc 手动 stop 后 `exit_code=1`（非 0），桥 procState 必判 fail；S3b 的停止注与「已停」徽章从未出现，用户自己停的被报「出错了→去问 agent」。→ 修复批中。
- **F-1（P3，显示）apps 面板注册时间 08:00**：s94 F-7 只修了台账路径，appsPaint 同款 UTC 解析漏修（yaml created_at 纯日期串）。→ 修复批中。

**通过面（含 s94 修复保持全链）**：冷启 6s/首启供给 .apikey 72B/五端点 200/logscan 仅 1 条已知良性 WARN/控制台零 JS 错误；配置流（添加后 host+Key 保留→保存→拉 121 模型→首配切换 info 正确→引导条即消）；**真会话搭应用 agent 自发全链**（写 yaml 含 forge-meta 四键→/api/apps 完整 human/url/srcSid/srcTitle/listenPorts→真实监听 8123）；🚀 面板（徽章/人话名/启停钮/详情/日志子区/搜索框）；S1c 本事 3 行+分职句逐字；S2a chips 四态+过滤；db/sched/mcp 三搜索域；**F-11 渲染流修复保持**（工具卡实时追加无冻结）；**F12① 现场正证**（stop 后 restarts=0 不被拉起）+启停双向可用。

观察项：Playwright actionability 对页内按钮超时（元素无遮挡+零 JS 错误→IAB 判定问题，非产品）；agent 首次热注册前有缺 cd 的失败卡后自愈（hints 可补半句）。

环境：沙盒已停（端口零残留）；dev 栈 PFdrill2 /End+/Run 恢复（healthz 200）。

## 主线5 缺陷修复

- **F-1/F-2（8f82bb7）**：F-1 桥侧复用台账同源 parseAssetTs 增 `createdAtTs`(epoch ms)，前端只格式化（形态分流：纯日期串→本地零点、完整 ISO→原值；活体 `2026-09-15`→`Tue Sep 15 2026 00:00:00 GMT+0800`）；F-2 前端 `appsUserStopped` 命中且桥判 fail 时按「已停」呈现（徽章/进程行/停止注/动作面全走 state；判别力=无标记真 fail 仍「⚠️ 出错了」+⟳重启）；刷新降级（标记会话内）已注释留档。回归 e2e 61/61（apps-probe 69→75ck）+fuzz 190/190。
- **F-3 根因（f8f2d31，docs/research/31）**：原「管道写端继承」假设**被三证否定**（真实 pc update 起新进程时调用方 cmd 747ms rc=0 退出、stdout 729ms EOF；goose v1.50 源码排空硬上限 500ms；新进程父=pc 守护非调用方）。**真根因**=hints 教的 `pc project update -f` 文件集不含启动器三件套（缺 conf/ports.env.yaml + conf/apps.env.yaml）→ pc update 以给定文件集**整体替换项目**（差异即重启、缺项即删除）→ **chat-bridge 自身被重启** → 桥退出 → goose acp stdin EOF 退出 → 在飞回合孤儿化、前端零终态（卡恒 in_progress、typing 常亮 14h）。证据：sessions.db 该 shell 调用无 toolResponse 行 + pc.log 00:23:39.9–40.7 全体重启 + 隔离单变量复现替换语义。
- **F-3 修（30732f5 + 04b981e）**：A1 hints 热注册教法改为**启动器同款完整文件集**（逐字可跑命令+补 cd /d+防自作主张删 -f 的人话因果）；B **会话中断终态兜底**（acp 退出/会话中断时桥向订阅者补发终态错误帧+前端清 busy/settled 化未完成卡）——覆盖任何中断向量（不限于 F-3）。
- **F-4（7e49636）**：降权重启路径的外层 cmd 宿主 `/K` 常驻 → 停栈后安装目录被占用、无法整删（阻断「删文件夹=完全卸载」验收线；s94「TUI 窗口残留」标注修的是 pause 门控载体，此为 runas 外层窗口**另一形态**）。修=降权拉起后终止外层宿主（收窗）；b3 语义（启动失败留窗可读日志）保持。

## 待办（下一步）

QA+守卫完工→journal 终态+push→主线5 从零安装反复测试（打包含全量新码→C:\PF-TEST 沙盒→冷启→新功能面活体（含 F12② 停→冷启→自动带起）→logscan+控制台横扫→发现分级修复循环→反复轮）。
