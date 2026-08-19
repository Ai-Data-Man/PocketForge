# ADR-0003: 交付树布局 + 应用注册协议

- 状态：Accepted
- 日期：2026-08-19
- 关联：ADR-0002；runbooks/p2-verification-log.md（热重载/faucet 重启语义均为 VERIFIED-RUN）

## 背景 / 约束
"一次双击启动 + 删文件夹卸载 + Agent 自建应用可注册进托管、重启后自动回来" 是核心验收线。process-compose 支持多 `-f` 合并与 `project update -f` 热重载（已验证）；faucet `db add` 后需重启 serve 才可见（已验证）；goose 的 GOOSE_PATH_ROOT 收敛全部状态（已验证）。

## 决定

### 交付树（forge/）
```
forge/
  启动数字员工.cmd        # 唯一入口：设 env → 起 process-compose（up -t=false）
  停止数字员工.cmd
  conf/
    process-compose.yaml  # 基础设施进程：nats / faucet / goose-scheduler
    nats.conf             # 回环 + JetStream store_dir 指向 data/
    goose/                # GOOSE_PATH_ROOT 目标（config.yaml + custom_providers + .goosehints）
  apps/                   # Agent 自建应用落点：每个 app 一个 *.yaml（pc 进程定义）
  bin/                    # 全部 pinned 二进制（components.yaml 复现）
  data/                   # 全部运行时状态（js/ faucet/ sqlite/ goose/ logs/ pw-profile/）
  vendor-licenses/        # MIT/Apache-2.0 全文
  使用说明.md             # 妻子手册（零术语）
```
一切路径写**相对启动脚本解析的绝对路径**（cmd 变量 %~dp0），启动器注入所有 env（GOOSE_PATH_ROOT、BROWSER 相关、端口）。

### 应用注册协议（Agent 遵循的稳定契约）
1. **放置**：新应用 = 写 `apps/<name>.yaml`（process-compose 进程定义，模板见 forge/conf/_app-template.yaml）。
2. **生效**：运行 `pc project update -f conf/process-compose.yaml -f apps/*.yaml`（或重启 forge）→ 进程立即受托管（已验证热重载）。
3. **数据**：应用数据一律入 `data/sqlite/*.db`；需 REST/MCP 暴露时 `faucet db add` + 重启 faucet 进程（`pc process restart faucet`，重启后服务可见已验证）。
4. **发现**：Agent 通过 goose 的 MCP 扩展（faucet mcp + playwright mcp）与 `pc` CLI 操作一切；对妻子只暴露自然语言。

### 端口分配（默认，冲突时启动器自动 +1 重试——P4 实现探测）
4222 NATS / 8222 NATS monitor / 8091 faucet REST / 8099 process-compose API / （goose 无端口，CLI/ACP 按需）。

## 后果与变更成本
- apps/*.yaml 合并语义依赖 pc 的 `-f` 顺序合并（后者覆盖标量）→ 模板约束：apps 文件只定义自己的进程键，禁止覆盖基础键。
- faucet 重启语义 = 短暂 REST 中断（<3s，healthz 探针自动恢复）→ 可接受，无需更复杂方案。
- 端口探测逻辑放启动器（cmd/ps1），是唯一一处自研"基础设施代码"（约 50 行）。

## 复核条件
- 应用数量 > 20 或出现跨 app 依赖 → 引入 namespace 分组约定。
- goose schedule 常驻方式验证后若有变化 → ADR-0004 修订。
