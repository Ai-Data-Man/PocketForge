# ADR-0002: 组件技术栈（五件套 + 便携运行时）

- 状态：Accepted
- 日期：2026-08-19
- 关联：research/01-05（全部 VERIFIED-DOC，核心项 VERIFIED-RUN，见 runbooks/p2-verification-log.md）

## 背景 / 约束
8 条硬约束（AGENTS.md）：免管理员、无容器、便携零污染、许可证白名单、封闭系统走浏览器、业务无关、设施透明、Agent 运行时禁自研。

## 候选与证据（详表见 research/）
- 进程编排：process-compose ✅ vs pm2(AGPL)❌ vs supervisord(无Win)❌ vs NSSM/计划任务(污染)❌。
- 数据面：NATS(KV/对象/消息) ✅ + faucet(SQLite→REST+MCP) ✅（退路 PocketBase）vs PostgREST/Hasura(需PG/Docker)❌。
- Agent 运行时：goose ✅（GOOSE_PATH_ROOT 便携已验证）vs Letta/OpenHands(需PG/Docker)❌ vs SDK 自建(违反约束8)❌。
- 浏览器：playwright-mcp+msedge ✅（已验证）vs browser-use(Edge 死锁→WATCH)❌ vs nodriver(AGPL)/camoufox(MPL)❌。
- 运行时底座：便携 Python embeddable（3.12.10，已验证 pip 可用）；便携 Node v22.21.1（playwright-mcp 宿主，已验证）。

## 决定
全栈 = process-compose v1.122.0（spine）+ NATS server v2.14.5/CLI v0.4.0（消息/KV/对象）+ faucet v0.1.12（SQLite→REST+MCP）+ goose v1.46.0（Agent 运行时，CLI 优先）+ @playwright/mcp（浏览器，系统 Edge）+ 便携 Node（pw-mcp 宿主）+ 便携 Python（辅助脚本位）。版本全部 pinned（tools/components.yaml + checksums.txt）。

## 后果与变更成本
- faucet 0.x 早熟：锁版本；Agent 只依赖其 MCP 工具名与 REST 路径形状，可换 PocketBase。
- browser-use 转 WATCH：视觉点击能力暂缺（playwright-mcp 有 --caps=vision 可开，未验证）。
- goose Desktop 未采用（P4 先 CLI + 自带会话；UI 层见 ADR-0004）。

## 复核条件
- faucet 停更 > 6 个月或 CVE 未修 → 启动 PocketBase 替换评估。
- browser-use 修复 Edge 会话管理 → 复测，可替换 playwright-mcp。
- goose Desktop 便携化验证通过且妻子需要图形界面 → 评估切换。
