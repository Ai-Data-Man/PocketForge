# 2026-08-29 s49 — P31-③ 匿名本地使用统计 v1

## 规格（主控按已拍板路线直接归约，最小实现）
- 目的：护航期开始前就位，第一天就采集数据驱动 P32+；仅本地文件零外传零 UI。
- data/stats/usage-YYYYMMDD.json：date / sessionsCreated / messages / errors+errorsByType(upstream/websocket/other) / permissionCards(shown/approved/denied/timeout) / artifactsGenerated / updated。
- 实现：桥内存计数器 + 每事件原子写（复用 atomicWrite）；跨天归零；启动恢复当日文件；事件挂点全复用现有路径（subscribe 新建、switch_model 自动建会话、prompt、acp_reply、request_permission 广播、socket error、s26 错误正则复刻于桥内 stop 事件）；全 try 包裹，统计故障不杀桥。新增 GET /api/stats（走既有 Origin 规则）。

## 验证（VERIFIED-RUN）
- pc process restart chat-bridge → /api/stats 出当日 JSON；WS 探针真走 subscribe→session/new → sessionsCreated=1；重启后计数恢复=1（恢复路径✓）。
- fuzz-chat.sh +1 断言（stats 形状）13/13；e2e-chat 18/18 跑两遍。
- node --check 模板；模板与 bin/chat-bridge.js 逐字节一致（bootstrap 直拷机制）。

## 已知占位（诚实标注在代码注释）
- artifactsGenerated 恒 0：gen-xlsx 走 goose 扩展不经桥，无侵入拿不到事件；不为它加工作区 diff 扫描。
- timeout 与手动 approve 在桥内不可区分（前端 60s 兜底发同款 acp_reply）——若要真实 timeout 数据需前端 settle 带来源标记，独立跟进项。

## 备注
- 探针产生的 orphan 空壳会话由 s30 修剪兜底。
- 沙盒/交付包同步：stats + s48 报表卡均未进 v0.9.5；两者 GUI 复核（报表卡）通过后随 v0.9.6 一起打包。
