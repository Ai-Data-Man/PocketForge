# s80g QA 专项：§11b ws-close-reclaim 套件内红——根因收口与测试基建修复（2026-09-13）

主报告：tmp/s78g-qa-11b.md（证据链全量）。要点：

## 裁决
- 根因=假说②（§11 刚 delete → §11b 立即跑 → baseline 含 teardown 未完成的旧树）成立；①（稳定积累）证伪（矩阵 A：12 棵泄漏树下 standalone 5/5 绿）；③（pc 句柄）证伪（红窗口 pc 零重启）。
- 细化机理：冷/载下扩展树装配 1.8s→6-11s+，§11 的 fire-and-forget close 与 in-flight spawn 竞态 → §11 树残留 90s+/永久泄漏（pid-birth 实证）；§11b baseline 采到残树 + 自身树被卡 → count 钉死 baseline。**门限放宽结构性无效**——是断言算术问题（count 必须超过被瞬态污染的基线），不是速度问题。
- 忠实批复现：重启→全量×3 = 3/3 红（baseline 9/36/63），+27/run 台阶与 catalog 批 grab 27→54→81 同签名（+27=§18-B+§18-rescue+§11b红泄漏，三树/轮；pid-birth 对账逐树吻合）。

## 修复（测试基建三件，产品代码零触碰）
1. e2e-chat.sh §11↔§11b 位次交换：reclaim 探针前移紧跟 §10（无会话操作前置），回执探针后置（断言不依赖进程树态）。ck 文案零改动。
2. ws-close-reclaim.js：计数断言→pid-SET 断言（增长=基线集外新 pid；回收=pid 全落回基线集）——外来瞬态结构性免疫；红时自清补发 delete_session（原版红=自身泄漏 +9，3/3 实证）。
3. §13 pg 就绪门假就绪修复（附带发现自修）：`grep -q Ready` 命中「Not Ready」子串 → 补反选；批载下 state-A dump 撞 Launching 中 pg 的实锤红随之消除。

## 验证
- 忠实批复验（同 3/3 红配方）：reclaim 3/3 绿（含冷 run）+回执 3/3 绿。
- 净栈终验：e2e-chat 57/57 + fuzz 178/178（tmp/s80g-final-e2e.log / s80g-final-fuzz.log）。

## 产品侧新发现（转 engineering）
「新建会话→秒删」在树装配完成前发 close = 永久泄漏 9 进程（research/17 s80g 补录；修向=close 带装配完成等待或确认重试）。

## 附带发现（独立家族，未扩案）
- 冷窗 §11 session/new 快败（矩阵 B 5/5 vs 复跑 0/3；首红形态被套件 rm 吞——建议 ws-delete-receipt 失败留 tmp 日志）。
- §10 GH_TOKEN 脱敏断言状态依赖红（FAKE stats 未进报告聚合；疑 pg usage backfill 时序，待单列）。
- §18c ws-rollback 沙盒探针批载竞态（前批 1/3、后批 2/3、净机绿——沙盒桥起活竞态族）。
- pg 孤儿 --forkchild startup 占共享内存 → restart 崩溃环（s69③ 第 2 实锤；手清 taskkill+restart 即愈）。
- 泄漏卫生（建议非本批）：批验证周期间 restart chat-bridge / tools/clean-orphan-mcp.ps1；fuzz ws-fuzz-s50h 5 会话/轮泄漏可于 wsSession helper resolve 后补 delete。

## 环境终态
pg 孤儿手清+restart（Ready）+ chat-bridge restart（healthz ok）；explorer 0 窗；假路由未触碰；dev 栈保持运行。
