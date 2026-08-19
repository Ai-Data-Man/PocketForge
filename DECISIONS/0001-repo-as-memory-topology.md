# ADR-0001: 仓库信息架构 = 记忆拓扑

- 状态：Accepted
- 日期：2026-08-19
- 关联：docs/memory-map.md（展开版）

## 背景 / 约束
本项目由单一 AI agent 跨多个会话长周期推进（调查→验证→设计→实现→测试→交付）。任何新会话必须能零摩擦恢复"当下"，并能按需要追溯到"过去"。项目所有者明确要求：工作区可读文件拓扑 = 当下记忆拓扑，git log = 过去记忆可追溯路径。

## 候选与证据
1. 只靠 git log + commit message：不可读拓扑、恢复慢、无"现在"视图。否。
2. 单一大文档（PROGRESS.md 万能笔记）：无结构、无限增长、新旧混杂。否。
3. ADR + 状态文件 + 事实底稿 + 叙事日志分层（本方案）：借鉴成熟方法论——ADR（M. Nygard, 2011）、docs-as-code、Diátaxis 的"分文档类型"思想、SSOT（单一可信源）原则、conventional commits。采纳。

## 决定
拓扑分五层，权威递减：
1. `STATE.md` = 现在（唯一权威的当下状态；任何冲突以它为准）。
2. `DECISIONS/00NN-*.md` = 持久的为什么（不可变，只可被 supersede）。
3. `docs/research/*.md` = 外部事实底稿（每条带来源与验证状态三级：UNVERIFIED / VERIFIED-DOC / VERIFIED-RUN）。
4. `docs/architecture/ | runbooks/` = 稳定结构与操作知识。
5. `docs/journal/` = 叙事流水（低权威）。

git log = 时间轴：commit message 必须引用所改 ADR/STATE 语义。
仓库分区：`forge/` = 产品运行时树（交付打包只取它）；`tools/` = 开发侧（下载 manifest/打包/e2e）；`bin/ data/ dist/` 不入库，由 manifest+脚本可复现（保证仓库轻、交付重）。

## 后果与变更成本
- 成本：每会话收尾多 3 个动作（STATE/journal/commit）。
- 收益：新会话恢复成本 ≈ 读 2 个文件；历史不可篡改；事实与观点分层可审计。
- 锁定效应：低。拓扑调整本身可用一篇新 ADR 完成。

## 复核条件
- 文件总数 > ~200 或交叉引用失控时重构分层。
- 出现"STATE 与文档矛盾"两次以上时，升级为自动化一致性检查（tools/ 内脚本）。
