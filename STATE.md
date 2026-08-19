# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-08-19 会话 s01
- 阶段：P0 ✅ → P1 🔄

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
- s01：P1 四个后台调查 agent（R1 supervisor / R2 数据面 / R3 agent 运行时 / R4 浏览器栈）。

## 已确立决策
- ADR-0001 仓库信息架构 = 记忆拓扑（Accepted）

## 开放问题 / 风险（未验证关键事实）
- Faucet 项目确切身份（GitHub 重名多，待 R2 确认 repo 坐标、Windows 资产、许可证）。
- goose（block/goose）Windows 桌面端成熟度；CLI 是否有便携 zip；GOOSE_HOME 可否重定向（便携硬要求）。
- process-compose 是否支持运行期加载新增进程（注册协议设计依赖此事实）。
- browser-use 能否复用系统 Edge/Chrome channel（企业机禁下载浏览器的对冲）。
- 目标机 LLM 端点：交付时配置任意 OpenAI 兼容 key（开发机用 9router）。
- EDR 对未签名 exe 的拦截风险（nats/faucet/goose 等均为未签名二进制）。

## 环境事实（开发机，VERIFIED-RUN 2026-08-15 起）
- Windows Server 2022 (10.0.20348 x64)，Git Bash，git 2.53.0.windows.1。
- GitHub 直连不通，HTTP 代理 `http://127.0.0.1:7890`。
- 本机 LLM 路由 9router v0.5.55 `http://127.0.0.1:20128/v1`（OpenAI 兼容，key `sk-465eda008294ad45-mg7ffb-0052fa88`，模型前缀 `my/` 如 `my/glm-5.2`）。

## 交付物验收线（P6 时逐项核对）
1. 解压即用、双击启动、零系统污染（无注册表/PATH/服务/计划任务写入）。
2. 妻子自然语言完成：浏览器取数 → 入库 → 生成数据应用 → 重启后一切自动回来。
3. 全部组件许可证在白名单内，LICENSE 文本随包分发。
