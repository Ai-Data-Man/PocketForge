# 2026-09-05 s67 — 9router 缺陷结案 + dev 栈宕机事故复盘（同日续）

## 9router 大工具集缺陷结案（22bbb67）
- 复测：deepseek-v4-flash，N=1..50 阈值曲线（含 s19 事发区间 40+）28/28 采样全部正常 tool_calls、零 502。真实 goose 栈 40-45 工具在已验证安全域内。
- 溯源：s19 当夜归因在 journal s20/s22 已撤回（真因=IE 系统代理劫持 + glm-5.2 账号锁定），research/04 s19-4 漏同步——本日补齐，结案。
- 9router 现为 0.5.65（09-03 更新）。哨兵：glm-5.2 用前单发 N=40 探针。铁律重申：手工探针必须 NO_PROXY 或直连 TCP。
- 方法论亮点：研究员先证伪自己的探针（prompt 目标工具不在场导致假信号），再采信数据；遵守主控纠偏全程未用 curl 打本地端点。

## dev 栈宕机事故（见 s66 journal 事故记录）
- 沙盒轮后 runas 重拉静默失败 → 栈宕 → Bash curl 沙盒代理假 200 骗过全部后续验证 → 主控收尾核查用 node/netstat/IAB 三方见真相 → runas 重拉恢复（node 实证）。
- 教训已入 STATE 观察项与记忆 pitfalls：验服务生死用 node 直连/浏览器/netstat，禁采信 Bash curl 本机 200。

## 真实检索基线
2038 条消息 LIKE 0-3ms（冷扫 149ms）——阶段三触发器"近 1 万条"维持不变。

## v0.9.9 候选包沙盒冷启冒烟（全过）
- 制品自检：sha256 一致/28977 文件 unzip -t 无错/forge-backup 含 fc948e9 守卫/pg 4 exe/VERSION=v0.9.9。
- 冷启：pg Ready restarts=0、pg-init Completed、bridge 200/4ms（node 计时）；**fc948e9 真实事故路径直证**——冷启 daily-backup exit 0、空 pg-dumps 被挡、zip 完整（修复前此路径 Compress-Archive 删 zip 必崩）；冷启首备份天然无 dump（daily-backup 由 faucet-rawsql 触发不依赖 pg，设计内失败面），pg Ready 后与第二轮启动均产出 dump（kept=2 新 zip 含 pg-dumps）。
- 重启幂等（PG_VERSION mtime 逐位一致）/报告豁免口径外零 PG 字节/停止无 postgres 残留；dev 栈 node 实证恢复（10 进程全绿，pg Ready）。

## 四皮肤×昼夜视觉 sweep（令牌计算样式客观审计，8 组合全过）
- 方法：IAB 真页面逐组合切换（skin × light/dark），读 .quickchip 边框/底色、#send 底色、侧栏底色、截断提示行色、消息边框的 computed style，与 --acc 令牌比对。**方法论坑：后台标签页 transition 节流会把 computed 值冻结在起始值——审计前必须注入 `*{transition:none!important}`**（首跑"芯片边框恒绿"即此伪影，注入后消失，非产品缺陷）。
- 结果：8 组合全部正确——--acc 四皮肤昼/夜值逐一命中（绿 #0e7a43/#2ea36b、靛青 #1a6fd4/#4d94e8、暮紫 #6d48b8/#a184e8、石墨 #3d4a54/#8fa3b0）；芯片边框/底色、发送键、侧栏、消息边框、弱色提示全部跟随令牌。结合 s65 未定义引用审计（0），设计令牌体系完整性双重验证通过。

## goose v1.50 监控检查点
2026-09-05 14:xx：latest 仍为 v1.49.0（09-03）。下次检查点 09-06+；若 v1.50 发布→按 research/goose-upgrade-playbook.md 启动升级窗口。

## 验收
9router 复测 28/28；dev 栈 node 实证恢复（healthz 14ms/pg probe READY）；仓库树净。
