# 记忆地图（本仓库的信息架构）

设计原则：工作区可读文件拓扑 = 当下记忆；git log = 过去记忆路径；单一可信源；权威分层。

## 我想知道…… → 去哪读

| 问题 | 位置 | 权威级 |
|---|---|---|
| 现在做到哪了、接下来做什么、还有什么没验证 | `STATE.md` | 最高 |
| 当初为什么选 X 不选 Y | `DECISIONS/00NN-*.md`（索引 `DECISIONS/README.md`） | 高（不可变） |
| 某开源项目的许可证/Windows 支持/版本/本机验证结果 | `docs/research/*.md` | 高（带验证状态） |
| 系统长什么样、分层与契约 | `docs/architecture/*.md` | 高 |
| 某操作怎么做（启动/打包/测试） | `docs/runbooks/*.md` | 中 |
| 时间线上每天发生了什么 | `docs/journal/*.md` + `git log` | 低（叙事） |
| 产品本身（交付物） | `forge/` | — |

## 验证状态三级（research 底稿必标）
- `UNVERIFIED`：二手说法，未核对官方源。
- `VERIFIED-DOC`：已对照官方仓库/文档/发布页核对（记 URL 与日期）。
- `VERIFIED-RUN`：已在本机实际运行验证（记日期、版本、命令、结果）。

## 写入纪律
- 会话结束四件套：更新 STATE → 新决策写 ADR → 新事实入 research 底稿 → journal + commit。
- ADR 只增不改（supersede 机制）；STATE 只留"现在"（历史进 git）。
- journal 只记要点与指针，不复制内容。
