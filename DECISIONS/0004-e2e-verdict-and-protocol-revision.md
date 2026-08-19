# ADR-0004: P5 端到端验收结论与协议修订

- 状态：Accepted
- 日期：2026-08-20
- 关联：ADR-0003（本篇修订其"重启回来"与"建表通道"两点）

## 背景 / 约束
P5 端到端（tools/e2e/e2e.sh，VERIFIED-RUN 2026-08-20）暴露了 ADR-0003 两处设计缺口：
1. agent 建表通道：faucet 服务默认 `raw_sql_allowed=0`，工具集无法 DDL，任务被卡（agent 正确地停下来询问，行为符合人设）。
2. 重启回来：pc up 只挂主配置，apps/*.yaml 不在其中，重启后自建应用丢失。

## 证据
- E2E 全链路（goose 用 browser MCP 抓动态表格 6 行 → raw_sql 建表 → insert → REST count=6 → 热注册 app → 全栈重启 → app 自动回归 + 数据 6 行仍在）全部 PASS。
- 修复后 process list：e2e-report / faucet / goose-scheduler / nats 并存。

## 决定（ADR-0003 增补）
1. **建表通道**：faucet 服务注册后一律 `raw_sql_allowed=1`（bootstrap 阶段对 faucet.db 的 services 表置位；本地单用户场景，风险接受——REST 层仍有 API key+RBAC）。升级路径：多用户时改回关+预置 DDL 流程。
2. **重启回归**：启动器把 `apps/*.yaml` 聚合为 `conf/apps.env.yaml`（剥掉各文件的顶层 `processes:` 行后拼接），pc up 第三个 -f 挂载。app 注册协议从"project update 热加载或重启"收紧为"写 apps/*.yaml 后热加载；重启自动聚合"。
3. E2E 的 LLM 步骤用 `GOOSE_MODE=auto`（headless）；妻子交互用 `goose session`（smart_approve 需交互终端）。

## 后果与变更成本
- apps 聚合是字符串拼接，依赖"每 app 只写自己的进程键"约定（模板已约束）。
- raw_sql 开启=agent 可 DROP；约束在 .goosehints 行为准则（删前问人）+ data/ 目录快照备份（P6 后续可加，暂缓）。

## 复核条件
- faucet 未来版本若提供 `db add --raw-sql` flag → 换官方开关。
- apps 数量 >20 → 聚合改由 pc 原生多 -f 生成器（Go/python 工具）替代字符串拼接。
