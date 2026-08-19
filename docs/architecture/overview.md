# PocketForge 架构总览

## 分层（自下而上）
```
┌─ 妻子 ──── 自然语言（goose 会话 / 妻子手册里的固定短语） ──────────────┐
├─ Agent 层   goose v1.46.0（GOOSE_PATH_ROOT=forge/conf/goose 数据在 data/goose）
│             系统提示 = 数字员工人设 + 设施地图 + 注册协议（.goosehints）
│             MCP 扩展：faucet-mcp(数据库) / playwright-mcp(浏览器) / developer(shell,内置)
├─ 门面层    faucet :8091 REST+MCP（SQLite→CRUD/OpenAPI/Admin UI）
│            pc API :8099（进程编排 REST/CLI）
├─ 数据层    SQLite data/sqlite/*.db（system of record, faucet 挂载）
│            NATS :4222（JetStream KV/对象存储, data/js）
└─ 脊柱      process-compose（up 全栈拉起, 探针守护, 热重载 apps/*.yaml）
```

## 一次启动的时序
1. 双击 `启动数字员工.cmd` → 解析 %~dp0 → 注入 env（端口/GOOSE_PATH_ROOT/DISABLE_KEYRING/NODE/代理禁用）。
2. process-compose 按 conf/process-compose.yaml 拉起：nats →（healthz 探针）→ faucet → goose scheduler（如启用）。
3. Agent 可用能力：shell、数据库 CRUD（faucet-mcp）、浏览器（playwright-mcp，系统 Edge，profile 在 data/pw-profile）。
4. Agent 自建应用 → apps/*.yaml → `project update` 热注册（ADR-0003 协议）。
5. 关机/重启 → 再次双击 → 全部自动回来（状态全在 data/）。

## 安全边界
- 全部服务绑定 127.0.0.1；文件共享场景之外无网络暴露。
- pc API token（≥20 字符）启动器生成后写 data/（首启随机化）。
- LLM key 只存 goose secrets.yaml（GOOSE_DISABLE_KEYRING=1 下落便携目录）。
- 企业浏览器登录由妻子在可见 Edge 窗口人工完成（SSO 归属人）。

## 明确不自研清单（约束 8）
agent loop / 会话存储 / 调度 / 进程管理 / 消息总线 / DB 网关 / 浏览器驱动 —— 全部采用开源（ADR-0002）。自研仅限：启动器脚本、app 模板、妻子手册、goose 提示词。
