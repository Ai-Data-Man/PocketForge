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

## 收尾小批（进行中）

QA P3 收尾：桥 deny-list 同源化（现读 yaml+常量回落 fail-safe）+ia-logic-probe 补 chip 行为断言。完成后打 v0.9.15-iat 测试包进主线5。

## 待办（下一步）

QA+守卫完工→journal 终态+push→主线5 从零安装反复测试（打包含全量新码→C:\PF-TEST 沙盒→冷启→新功能面活体（含 F12② 停→冷启→自动带起）→logscan+控制台横扫→发现分级修复循环→反复轮）。
