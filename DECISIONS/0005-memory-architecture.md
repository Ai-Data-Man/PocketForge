# ADR-0005: 数字员工记忆架构（四层）

- 状态：Accepted
- 日期：2026-08-20
- 关联：research/04-goose.md；journal 2026-08-20-s02-memory.md

## 背景 / 约束
隐含需求显性化：agent 须"记得住人、事、约定"才配当数字员工。约束：便携零污染、MIT/Apache、非技术用户零维护、LLM 端点任意 OpenAI 兼容（embedding 不保证有）。

## 候选与证据（R5 调查 + 本机实测）
- goose 内置 memory（`goose mcp memory`）：txt 存储、显式写入、每会话注入、零新组件。✅
- chatrecall：sessions.db SQL LIKE 关键词召回，无嵌入依赖。✅
- @modelcontextprotocol/server-memory：JSONL 知识图谱，与 memory 扩展能力重叠且多一个 Node 进程。❌
- doobidoo/mcp-memory-service：本地 ONNX 嵌入语义记忆，重（Python+模型），目标机嵌入不确定。❌（观察：用户抱怨"找不到很久以前的事"再启用）
- basic-memory：AGPL。❌
- 自研记忆 MCP：违反"能不造就不造"。❌

## 决定
四层记忆，全部随 goose 现有能力：
1. `<GOOSE_PATH_ROOT>/config/.goosehints` = 静态手册（人设/设施地图/规矩；注意必须在 config/ 子目录）。
2. memory 扩展（stdio 挂 `goose mcp memory`）= 事实/偏好层；存储经 junction 落便携目录。
3. chatrecall = 历史召回层（关键词级）。
4. session --resume = 任务连续层。

便携化关键：goose-mcp 硬编码 `%APPDATA%\Block\goose\config\memory`（无视 GOOSE_PATH_ROOT，源码级确认），bootstrap.ps1 建 NTFS junction（mklink /J 免管理员）重定向到 `conf/goose/config/memory`；卸载脚本删 junction。这是**唯一一处系统足迹**（文件系统对象，非注册表/服务）。

## 后果与变更成本
- 记忆=纯文本：人可读可编辑可备份（拷目录即迁移）；无语义检索（接受）。
- junction 依赖 NTFS（企业 Windows 必然满足）。
- 若 goose 未来支持 memory 的路径 env → 删 junction 逻辑即可。

## 复核条件
- 记忆类别数 > ~50 或用户找不到旧记忆 → 评估 doobidoo 语义层（需嵌入端点确认）。
- goose 上游修复便携 → 移除 junction。
