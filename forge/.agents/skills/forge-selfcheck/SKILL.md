---
name: forge-selfcheck
description: 对 PocketForge 自身做健康自检——列出全部托管进程状态、faucet/nats 健康检查、发现问题时的处置建议。当用户说"做个体检/自检/一切正常吗"时使用。
---

# PocketForge 自检流程

1. 运行 `"%FORGE_ROOT%\bin\pc\process-compose.exe" -p <pc.port 内容> process list`（端口读 data/pc.port）。
2. curl http://127.0.0.1:<faucet.port>/healthz 与 http://127.0.0.1:8222/healthz。
3. 任一失败：给出一句人话诊断 + 建议动作（重启对应进程 / 重启整个 forge）。
4. 全部正常：回复"一切正常"，附各进程一行状态。
