# P2 本机验证日志（VERIFIED-RUN 基线）

日期：2026-08-19 · 开发机 Windows Server 2022 · 组件版本见 `tools/components.yaml` + `tools/checksums.txt`

| # | 验证项 | 结果 | 关键事实/坑 |
|---|---|---|---|
| 1 | process-compose v1.122.0 zip 解压 | ✅ | `process-compose.exe version` → v1.122.0 |
| 2 | nats-server v2.14.5 + JetStream KV | ✅ | conf 内路径必须**正斜杠**（`C:/...`）；反斜杠转义会 Parse error。`healthz` ok；`kv add/put/get` 全通；store_dir 落便携目录 |
| 3 | nats CLI v0.4.0 | ✅ | `-s 127.0.0.1:4222` 直连 ok |
| 4 | faucet v0.1.12 serve | ✅ | 必须 `--foreground`（默认自后台化+PID 文件，与进程管理器冲突）；`--host 127.0.0.1`（默认 0.0.0.0）；`--data-dir` 钉死便携目录（默认 ~/.faucet） |
| 5 | faucet 管理面 | ✅ | `role create` → `key create --role`（key 只显一次）；`admin create`；db add sqlite dsn |
| 6 | faucet REST | ✅ | `/api/v1/{svc}/_table/{t}` list/insert 正确；filter 语法是 **RSQL 风格** `filter=qty>10`（URL 编码 `%3E`），不是 `gt.` 也不是 `qty gt 10` |
| 7 | faucet MCP stdio | ✅ | `faucet mcp --data-dir <portable>`；**不传 --data-dir 时回退 ~/.faucet 找不到服务**（goose 挂载时 env 必须显式）；工具：list_services/list_tables/describe_table/query/insert/update/delete/raw_sql；raw_sql 需服务级 `raw_sql_allowed` |
| 8 | faucet 服务热加载 | ⚠️ | `db add` 后运行中 server 不立即可见，**重启 serve 后可见** → 设计上 DDL 后 restart faucet 进程（process-compose restart） |
| 9 | goose v1.46.0 便携化 | ✅ | `GOOSE_PATH_ROOT` 收敛 config/data/state；复测 AppData 零残留（首次冷启动会产生一个空日志文件，删除后不再出现）；`GOOSE_DISABLE_KEYRING=1` 必须 |
| 10 | goose + 任意 OpenAI 兼容端点 | ✅ | config.yaml 用 `GOOSE_PROVIDER: openai` + `GOOSE_MODEL: <model>` + `openai:` 块（OPENAI_API_KEY/HOST/BASE_PATH env 展开）。**goose 把模型名里的 `/` 当 provider 分隔符**：9router 前缀模型 `my/...` 不可用，`myopencode/glm-5.2` 这类"provider/model"形式恰好兼容；headless `goose run -t ... --no-session` 全通（LLM 回答"二"） |
| 11 | 建表通道 | ✅（临时用 python sqlite3） | 目标机无 python → 需随包 sqlite3.exe 或开 raw_sql_allowed；决策留给 P3 |

## 结论
全部核心组件在本机"解压即用"成立，便携化路径全部打通。未验证项：goose Desktop、process-compose 托管全栈联动、热重载增进程、browser-use（P2b）。
