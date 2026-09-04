# 对标产品 2026 Q3 动向（Manus / OpenHands / 本地个人 agent 全景 / 共同趋势）

- 结论：ADR-0001/0006 选型在 2026 Q3 证据下更稳（无人满足「Windows 原生便携 + 免管理员 + 真实执行面」三条件）；两条 P32 设计输入（数据主权话术、Plan Mode 交互）+ 一条 MCP 商店护栏挂 backlog
- 取证：pf-researcher，2026-09-05，检索窗 2026-06~09-04，一手官方源优先，全程只读
- 验证状态：标注 per 条目；DATE 推算项与 UNVERIFIED 项已标

## Manus
- **数据删除事件**：Meta 收割后回归独立（2025-12-29），监管要求删除部分辖区用户全部数据；备份窗 8/11-8/23，8/23-24 删除+锁号 2 天，9/1 恢复（manus.im/blog"A Note to Our Users"/"Resumes Independent Operations"）。**"个人数字员工的记忆随平台存亡"从假设变成已发生事实——本地便携形态的最强外部论据**。
- Branch（07-09）：一上下文派生多平行方向；印证 backlog「多会话并行=低频不追」裁决。
- Plan Mode（07-22）：随时 /plan+可编辑蓝图+确认才执行；对非技术用户有效的交互已被官方验证——**P32 任务选择层解冻时的设计输入**（与现有 ACP request_permission 确认卡同构）。
- Projects Master Instruction / self-updating Projects（用户批准制）：backlog「工作区级项目指令」条目的对标杆。
- Wide Research（分解→并行→综合，实测 250 项）：同 Branch，不追。

## OpenHands
- SDK 本地模式已免 Docker（LocalWorkspace 单进程，官方 "no Docker required"，docs.openhands.dev/sdk/arch/overview，09-04 核对）——**research/04 旧论据"GUI 依赖 Docker/WSL"过时已勘误**。
- 但 Windows 原生仍不受支持：CLI "requires WSL… Native Windows is not officially supported"；工具面 Linux 中心（bash 执行器）；交付形态 pip 安装违反解压即用。**结论拒维持，理由更新**。

## goose 生态外新进入者
- **OpenClaw**：2026 爆火但安全面崩塌——CVE-2026-25253 一键 RCE（Hunt.io 实测 17,500+ 公网暴露实例）、CVE-2026-32922 提权、CVE-2026-26327 认证绕过、ClawJacked localhost WS 劫持、CSA 四 CVE 连锁（2026-05）；社区共识=专机隔离。与零权限企业环境正面冲突。**WATCH 降为"仅跟踪安全态势"，不升格**。
- 2026 全景（Vellum 8 强，二手 05-05）：无一满足三条件——OpenClaw/Hermes 需 WSL2；QwenPaw pip/Docker；AnythingLLM/Jan/PyGPT 是聊天+RAG 无执行闭环；Leon 2.0 仅 developer preview。

## 共同趋势
- **agentskills.io**：~40 兼容产品（06，二手），Q3 规范无 breaking；已 ADOPT，路径碎片化（.claude/ vs .agents/）是已知摩擦。
- **MCP 2026-07-28 规范**（最大修订）：stateless core（initialize/Session-Id 退役）、Multi Round-Trip、Streamable HTTP 头路由、Roots/Sampling/Logging 弃用（12 月窗）、HTTP+SSE 弃用。stdio 在新 spec 下的地位 UNVERIFIED；goose 跟进计划 UNVERIFIED。**风险入口=商店第三方 npm 包升 SDK 大版本与 goose（旧 spec）协议错位——商店选型清单加护栏**。
- **记忆层**：LoCoMo/BEAM 基准化；Letta Filesystem 基准宣称纯文件存储 74.0% 胜专门记忆层（**厂商自证未复现**）——方向上佐证 ADR-0005 memory/*.txt 文件即记忆。

## 可执行建议（裁决落档）
1. 采纳→P32：Manus 数据删除事件写成 welcome/项目须知用户话术（护航期不动文案）。
2. 采纳→P32：Plan Mode 三要素（随时/蓝图可编辑/确认执行）作为任务选择层解冻的设计输入。
3. 观察→backlog：MCP 商店选型加"检查包 MCP SDK 大版本"护栏。
4. 观察→backlog：Letta 文件即记忆基准作为 ADR-0005 外部佐证引用（标注未复现）。
5. 拒绝：任何运行时更换评估（OpenHands/OpenClaw/8 强）——三条件无全达者。
