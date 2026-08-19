# Faucet（faucetdb/faucet）

- 结论：ADOPT（带风险标注；BACKUP = PocketBase）
- 一句话用途：Go 单二进制把 SQLite（及 PG/MySQL 等）自动变成 REST CRUD + OpenAPI + Admin UI + MCP。
- 许可证：MIT（api.github.com 核对，2026-08-19）。
- Windows/便携性：发布资产 `faucet_0.1.12_windows_amd64.zip`（~15.6MB）。
- 版本与活跃度：v0.1.12（2026-03-04）；107 stars，仓库建于 2026-02-18，最后 push 2026-07-02（调查日已 ~7 周无提交）；README 自述 "under active development"，未宣称 production-ready。
- 验证状态：VERIFIED-DOC（2026-08-19，来源：api.github.com/repos/faucetdb/faucet、releases/latest、raw README）。

## 对本项目的关键事实
1. REST：`/api/v1/{service}/_table/{table}`，filter/order/limit/offset/fields；`/openapi.json` 自动生成；内嵌 Admin UI；默认端口 8080。
2. MCP：内建，8 工具 + 2 资源（list_services/list_tables/describe_table/query/insert/update/delete/raw_sql）；`faucet mcp`（stdio）与 `faucet mcp --transport http --port 3001` 双传输 —— Agent 可直接以 MCP 客户端身份查改库。
3. 认证：SHA-256 API key + JWT + RBAC（按表按动词）+ 行级过滤；支持 DDL 与存储过程；SQLite 3.35+ 文件/内存直连；Faucet 自身配置存内嵌 SQLite 文件。
4. 待本机验证：配置/内嵌 SQLite 落盘路径能否钉死在便携目录（README 未写明，P2 冒烟必测）；Windows 二进制实际可跑性；0.x API 漂移风险 → 锁版本。

## 风险与退出路径
- 0.x + 停更 7 周：视为"可替换件"。退路 A：PocketBase（MIT，单二进制+REST+Admin UI，MCP 用社区件）；退路 B：自建薄层（sqlite3 CLI + 极小 REST）。设计上 Agent 只依赖 MCP 工具集与 REST URL，不深耦合 Faucet 特性。
