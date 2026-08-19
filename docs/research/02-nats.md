# NATS 套件（nats-io/nats-server + nats-io/natscli）

- 结论：ADOPT（消息/KV/对象存储底座）
- 一句话用途：单二进制提供 localhost 消息总线 + JetStream KV + Object Store。
- 许可证：Apache-2.0（nats-server 与 natscli 均是；api.github.com license 字段核对，2026-08-19）。
- Windows/便携性：发布 zip 资产 `nats-server-v2.14.5-windows-amd64.zip`（~7MB）、`nats-0.4.0-windows-amd64.zip`（~9.9MB）；Go 单文件，无 installer，不写注册表/服务/家目录。
- 版本与活跃度：server v2.14.5（2026-08-12）；cli v0.4.0（2026-05-01）；仓库当日仍活跃。
- 验证状态：VERIFIED-DOC（2026-08-19，来源：api.github.com/repos/nats-io/nats-server 及 releases/latest、docs.nats.io/reference/config）。

## 对本项目的关键事实/风险（编号来源见 journal s01 R2）
1. JetStream 非默认启用：需 `jetstream: { store_dir: <portable>/data/js }`；不设 store_dir 会落 %TEMP% —— 便携硬伤，必须显式配置。[docs.nats.io config][discussion #6142]
2. 默认监听 0.0.0.0:4222 无认证 → 必须显式 `host: 127.0.0.1`（回环绑定后无认证可接受）。
3. 无内置 Windows 服务安装（官方用 sc.exe/NSSM，需管理员）——我们本就不装服务，由 process-compose 拉起。
4. KV/对象存储是 JetStream 内建上层，无需额外组件；CLI：`nats kv add/put/get/watch`、`nats object add/put/get`、`nats pub/sub/req`、`nats context save`。
5. 待本机验证（VERIFIED-RUN 缺口）：空闲内存（社区口径 20-50MB，无官方数字）、KV watch 吞吐、JetStream 磁盘放大。
