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

## 并行批（进行中）

- pf-qa 复审工程批+GUI 浏览器级冒烟（工程批桩测的补面）+独立回归。
- pf-engineer 聚合器 infra 键守卫（启动器 .cmd+dev-stack-up.ps1 同款，键集从主 yaml 现读，段级+静态验证，禁动 dev 栈）。
- 主控：使用说明.md 三处同步（commit 已落）；STATE s95 开工行+路线条目+s87/s57 勘误注记（0f55fdf）；research/04-goose s95 节（v1.50.1 补丁不追+schedule run-now CLI 确认=D4 机制前提 VERIFIED-CLI，114b65e）。

## 待办（下一步）

QA+守卫完工→journal 终态+push→主线5 从零安装反复测试（打包含全量新码→C:\PF-TEST 沙盒→冷启→新功能面活体（含 F12② 停→冷启→自动带起）→logscan+控制台横扫→发现分级修复循环→反复轮）。
