# s17 会话记录 — 2026-08-27 晚（能力中心 + 记忆管理）

## 目标
用户长期自主工作指令（至 2026-08-28 04:30）：自主发掘需求/找 bug/体验优化/研究/设计/开发/测试/审查/留痕。起头方向：goose 内置能力与配置未小白化暴露、记忆管理黑盒、skill/mcp 无商店。双视角要求：小白（妻子）能用 + 小forge（agent 本体）能力最大且安全。

## 取证结论（全部 VERIFIED-RUN 本机，2026-08-27）
1. `goose mcp <SERVER>` 可独立起的内置服务仅 `memory` + `tutorial`；todo/summarize/chatrecall 等 platform 型内嵌于 acp 进程，不经子命令。
2. `conf/goose/config/config.yaml` 由 bootstrap.ps1 **每次启动幂等重写**（模板占位符替换）→ 运行时/桥直接改该文件会被下次启动覆盖。
3. memory MCP 工具面 = remember_memory / remove_memory_category / remove_specific_memory / retrieve_memories；global 存储实路径 = `%APPDATA%\Block\goose\config\memory`（junction）→ `conf/goose/config/memory/<category>.txt` 纯文本。目前目录为空 + 探针写入成功（wife_profile.txt），**妻子无任何 UI 可见/可控 agent 记忆 —— 隐私盲区**。
4. ACP `session/new` 返回 4 modes（auto/smart_approve/approve/chat）+ configOptions(provider/model)。前端顶栏 mode 下拉已接 `session/set_mode`，会话级生效。config.yaml `GOOSE_MODE: smart_approve` 为新会话默认档。
5. permission.yaml ask_before 已含 browser 全家桶/shell/write/edit/faucet 写 ——「重要操作问我」护栏已在，但**用户不可见**（不知道哪些操作会先问她）。
6. schedule 子系统完整（add/list/remove/run-now/sessions）但零 UI；s14 曾因 cron 误配出事故 → 一期不暴露写操作。
7. skills 有 /api/skills + 弹窗（只读）；recipes 目录仅 daily-memory-check 样例。「商店」一期不做（需外网源+审核机制，收益低风险高）。

## 定案（ADR-0010）
- **A 能力开关**：设置面板新区块，4 扩展（faucet-db 数据库/browser 浏览器/memory 记忆/chatrecall 会话回忆）enabled 开关；桥 `/api/extensions` GET/POST 直接改 config.yaml 的 enabled 值；**bootstrap 改为保留现有 config.yaml 中可调字段（enabled + GOOSE_MODE）**——最小合并逻辑。
- **B 记忆管理**：「小 forge 记住的事」面板。读 = 直接解析 conf/goose/config/memory/*.txt（免起 MCP 进程）；删单条/清空分类走文件级原子重写（与 MCP 同格式）。不提供写入口（agent 自动记，人工写易造成脏数据+越权代记）。
- **C 护栏可见化**：设置面板说明当前档位 + ask_before 清单大白话（哪些动作会先问您）。
- schedule 写入口、skill 商店、recipe 管理：缓做，理由如上。

## 实现
（随提交补充）
