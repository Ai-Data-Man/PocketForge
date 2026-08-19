# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-08-19 会话 s01（P2 中）
- 阶段：P0 ✅ → P1 ✅ → P2 🔄（核心四件全通，剩 pc 联动/browser-use）

## 阶段总览
| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 信息架构/记忆拓扑落地 | ✅ |
| P1 | 开源项目四路深查（supervisor / 数据面 / Agent运行时 / 浏览器栈） | 🔄 |
| P2 | 本机验证：下载 pinned 二进制 + 冒烟 | ⬜ |
| P3 | 设计：ADR 0002+ / 架构文档 / Agent 手册 / 注册协议 | ⬜ |
| P4 | 实现：forge/ 产品树 | ⬜ |
| P5 | 测试：fake PLM + 端到端 | ⬜ |
| P6 | 交付：便携打包 + 妻子手册 | ⬜ |

## 当前正在进行
- P2 冒烟：pc+nats+faucet+goose 单件全通（见 docs/runbooks/p2-verification-log.md）。下一步：process-compose 托管全栈联动 + 热重载 + P2b 便携 Python/browser-use。

## 已确立决策
- ADR-0001 仓库信息架构 = 记忆拓扑（Accepted）
- P1 选型结论（待正式化为 ADR-0002..0005）：process-compose（spine）/ NATS+faucet（数据面）/ goose（agent 运行时）/ browser-use（浏览器栈）+ 便携 Python。

## 开放问题 / 风险（未验证关键事实）
- ~~Faucet 项目身份~~ 已确认 faucetdb/faucet v0.1.12 MIT（VERIFIED-RUN）。
- ~~goose 便携化~~ GOOSE_PATH_ROOT 收敛已验证（CLI）；**Desktop 未验证**。
- process-compose 热重载 `POST /project`/`project update -f` 增进程立即启动与否：待联动测试。
- browser-use 0.13.8 msedge channel + MCP：待 P2b。
- 目标机 LLM 端点：交付时配置任意 OpenAI 兼容 key（开发机用 9router，模型名需 `provider/model` 形式，goose 限制）。
- EDR 对未签名 exe 拦截风险（全部二进制未签名；只能在真实企业机验证）。
- 建表通道：目标机 DDL 路径（sqlite3.exe 随包 vs faucet raw_sql_allowed）→ P3 决策。
- goose schedule/acp --enable-scheduler Windows 常驻方式未验证。

## 环境事实（开发机，VERIFIED-RUN 2026-08-15 起）
- Windows Server 2022 (10.0.20348 x64)，Git Bash，git 2.53.0.windows.1。
- GitHub 直连不通，HTTP 代理 `http://127.0.0.1:7890`。
- 本机 LLM 路由 9router v0.5.55 `http://127.0.0.1:20128/v1`（OpenAI 兼容，key `sk-465eda008294ad45-mg7ffb-0052fa88`，模型前缀 `my/` 如 `my/glm-5.2`）。

## 交付物验收线（P6 时逐项核对）
1. 解压即用、双击启动、零系统污染（无注册表/PATH/服务/计划任务写入）。
2. 妻子自然语言完成：浏览器取数 → 入库 → 生成数据应用 → 重启后一切自动回来。
3. 全部组件许可证在白名单内，LICENSE 文本随包分发。
