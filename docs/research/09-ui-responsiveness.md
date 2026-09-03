# 09 · UI 响应性取证（「慢半拍」根因）

- 日期：2026-09-03（s61，pf-researcher 取证 + pf-engineer B 修复）
- 验证状态：VERIFIED-RUN（本机实测，数据见下；内测真机未覆盖——磁盘/杀毒环境差异可能放大 #7/#9）

## 结论

「UI 慢半拍」的主体**不是真实 IO 延迟**，是感知层反馈缺失 + 代码里写死的固定毫秒延迟。桥 API、WS 推送链路、DOM 规模、上游网络四条主流嫌疑全部实测排除。

## 排除项（实测证据）

| 嫌疑 | 排除方式 | 数据 |
|---|---|---|
| 桥 API 慢 | 13 个 GET 端点各 3 次 curl | 全部 <20ms（/api/db/overview 230ms 除外，前端已有 60s 缓存） |
| WS 推送缓冲 | 代码审查（无节流/批量）+ 回放探针 | 147 帧间隔 p50=0ms / p95=1ms / max=32ms；并发 20 个 /api/workspaces 期间重测无差异 |
| 长会话重排 | 直读 sessions.db | 168 会话 1598 条消息，最长 99 条（133KB）；addMsg 增量 append 非全量重绘 |
| 上游网络 | TCP/TTFB 探测 | 建连 1-4ms，TTFB 11-15ms（9router 中转） |
| 前端轮询 | 全文定时器审查 | 无周期轮询（仅 3 处条件触发：MCP 安装 5s / 升级 2.5s / 标题闪烁 1.2s） |

## 根因清单（s61 修复前状态）

| # | 根因 | 位置（修复前） | 体感 |
|---|---|---|---|
| 1 | 等待回复期 typing 静态无动画 | chat.tpl.html `.typing` 无 keyframes | 发消息后页面完全静止（最大感知来源） |
| 2 | 换线后重发硬等 800ms | subscribed 分支 setTimeout 800 | s51c 竞态修复的防御余量，非必需（见下） |
| 3 | 新对话未就绪发送直接被拒 | submit() `if(!sessionId)` return | 点新对话→打字→回车→失败→手动重发 |
| 4 | 删会话后 800ms 盲等刷新 | askDeleteSession setTimeout | 列表滞后一拍 |
| 5 | WS 断线固定 2s 重连 | ws.onclose setTimeout 2000 | 桥重启后空窗期长 |
| 6 | @ 菜单每键一次 fetch | 无防抖 | 打 @ 引用时输入发涩 |
| 7 | statsBump 同步写盘在 WS 消息路径 | writeFileSync+renameSync | 磁盘/杀毒抖动时冻首帧 |
| 8 | 跨供应商切模型热重启 acp ~5s | 桥 hotRestart | 已有提示，保留 |
| 9 | 同步 IO handler（workspaces/search/skills）阻塞事件循环 | readdirSync walk | 当前 8-17ms 不可感；机械盘/EDR 机器风险 |
| 10 | /api/db/overview 230ms faucet 串行子进程 | 首次 @ 触发 | 已有缓存，可预热 |

## #2 的 800ms 为何可去（s51c 竞态不回归论证）

s51c 竞态根因 = `provider_switched` 后**同步**重发打到 hotRestart 未清的旧 wsSession 绑定。修复关键是挂到 subscribed 回执，800ms 只是当时对齐 pendingSwitch 旧范式的防御余量。桥侧时序：`wsSession.set(ws, sessionId)`（session/new 回调内）严格先于 `ws.send('subscribed')`，而 prompt 路由只信 wsSession——前端收到 subscribed 帧时桥侧绑定必已就绪。s61 实测：subscribed→0ms 直发→STOP end 6333ms 收到 chunk，无 session not found。

## s61 修复范围

#1 #2 #3 #4 #5 #6 #7 已修（chat.tpl.html +45/-12，chat-bridge.tpl.js statsBump 防抖异步化 2s 合并+fs.promises 原子写）。#8 保留。#9 #10 挂 backlog（同步 IO 移 worker、db/overview 预热——当前不可感，真机反馈驱动再动）。

## 未验证项

- LLM 端到端 TTFT（需真实 prompt 写库，取证时禁止）；内测真机磁盘/杀毒环境（#7/#9 放大风险）。
