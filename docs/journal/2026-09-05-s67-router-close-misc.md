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

## 验收
9router 复测 28/28；dev 栈 node 实证恢复（healthz 14ms/pg probe READY）；仓库树净。
