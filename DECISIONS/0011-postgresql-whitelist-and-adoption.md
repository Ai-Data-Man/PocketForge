# ADR-0011: 许可证白名单扩列（PostgreSQL License / ISC）与 PG 作为自建应用首选库的采纳路线

- 状态：Accepted
- 日期：2026-09-05
- 关联：research/10（PG 便携化取证）、ADR-0002（组件技术栈）、ADR-0009（状态 Schema 演进）、AGENTS.md §2.5（硬约束·许可证白名单）

## 背景 / 约束
用户 2026-09-04 建议"为小forge实现正经后端+数据库，数据库建议 PG，用基础设施管理，作为 forge 自建应用首选数据库"。research/10 取证结论：技术形态完全兼容硬约束（zonky 便携渠道 +104MB、无注册表/无服务/删目录即卸载），唯一门槛是 PG 本体许可证（PostgreSQL License，SPDX 独立条目）不在现行白名单（MIT/Apache-2.0/公有领域）字面内；npm `pg` 依赖树同时卷入 ISC（MIT 等价类）。白名单属仓库硬约束（AGENTS.md §2.5），扩列须用户拍板。

用户裁决（2026-09-05，原文）："同意，PG 的能力比 SQLite 全面，只要没有实质法律风险，即可"。

## 候选与证据
- **扩列（采纳）**：PostgreSQL License 为 OSI 认证宽松许可证（2010-02-10 通过），官方自述 "similar to the BSD or MIT licenses"；无 copyleft、无网络条款、无专利陷阱；条件仅保留版权声明与免责段落（postgresql.org/about/licence，VERIFIED-DOC 2026-09-04）。ISC 为 MIT 等价变体（npm pg-int8/pg-numeric）。**实质法律风险核验：干净**——义务仅为分发时附带许可文本（vendor-licenses/ 既有流程覆盖）。
- 不扩列（被否）：用户裁决否决；且中文搜索痛点（FTS5 硬边界，research/10 §五）在 SQLite 侧无善价解。
- 换其他数据库（被否）：MySQL GPL 双许可风险；嵌入式新 SQL 库无一满足"白名单+便携+能力全面"三条件（research/10 §三/§五）。

## 决定
1. **AGENTS.md §2.5 白名单扩列一行**：新增 "PostgreSQL License、ISC（2026-09-05 用户批准扩列，ADR-0011）"。分发纪律不变：LICENSE 文本随包（vendor-licenses/ 流程）。
2. **PG 采纳路线（分三阶段，每阶段独立可回退）**：
   - **阶段一（基础设施接线）**：zonky 渠道便携 PG 进交付树（bin/pg/），process-compose 托管（initdb 到 data/pg/、非提权保障、`-E UTF8 --locale=C`、localhost 单端口）；作为基础设施组件对 agent/应用透明。
   - **阶段二（自建应用首选库）**：forge 自建应用（chat-bridge 及后续自建应用）的新增结构化存储默认 PG；迁移对象按价值排序（消息检索>工作区/制品索引>统计），**不迁移 goose 内部 sessions.db 与 faucet 内部存储**（组件自迁移纪律，ADR-0006 零二开、§3.5）。
   - **阶段三（检索升级）**：/api/search 消息正文迁 PG 全文检索（评估 pg 默认中文能力后定方案），SQLite FTS5 条目作废。
3. **"SQLite 可彻底拿掉"的边界澄清**：可拿掉的是 forge **自有存储层**的 SQLite 依赖（node:sqlite 只读会话库的检索路径随阶段三转 PG）；goose 与 faucet 内部的 SQLite 属组件私有，按零二开纪律保留，对用户不可见。

## 后果与变更成本
- 交付树 287MB→约 391MB（+36%）；新增 postmaster 多进程运维面（process-compose 托管、崩溃清理）；ADR-0009 Schema 纪律适用于 PG（迁移脚本入注册表）。
- 新增 UNVERIFIED 项须在阶段一沙盒实测：initdb 耗时、企业 EDR 对用户目录 postgres.exe 的态度（真机护航随包验证）、node pg 客户端 vendored 体积。
- 退出成本：阶段一低（删 bin/pg+data/pg）；阶段二起有数据迁移沉没（故每阶段独立可回退，默认导出路径先行）。

## 复核条件
- 沙盒/真机任一实测：initdb >60s 或 EDR 拦截 postgres.exe 且无白名单化解法 → 冻结阶段二，回退评估。
- goose 上游若原生提供结构化检索能力（ACP 或配置面）→ 重估阶段二/三必要性。
- PG 便携渠道（zonky/npm）断供或许可变化 → 重开选型。
