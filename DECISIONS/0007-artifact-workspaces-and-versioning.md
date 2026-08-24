# ADR-0007: 制品工作区架构——每会话一区 + isomorphic-git 版本管理

- 状态：Accepted
- 日期：2026-08-24
- 关联：docs/research/07-artifact-versioning.md；P28（journal s13）；ADR-0005（记忆架构）

## 背景 / 约束
P25/P27 交付的制品区是单一共享目录 `data/artifacts/`，用户实测反馈：版本历史会随任务增多而杂乱。硬约束不变：许可证白名单（MIT/Apache-2.0/公有领域）、解压即用、无管理员权限、零系统污染。用户明确裁决：**物理上按会话区分工作区目录**，跨会话延续靠记忆系统兜底（agent 从对话上下文拿完整路径）；"引入"机制给强保证。

## 候选与证据
- git 本体：GPLv2，违反白名单 → 否。
- libgit2/nodegit：需原生二进制，解压即用风险 → 否。
- **isomorphic-git 1.41.9：MIT、纯 JS、55 包约 8.3MB、便携 node 直接跑；本机 VERIFIED-RUN（2026-08-24，中文文件名/提交/按文件 log/读旧版全通）→ 选它。**
- kopia v0.23.1：Apache-2.0 单 exe 约 15MB，备份级去重压缩，但仓库不透明、预览需 restore → 作为量级增长后的升级路径保留。
- restic：BSD-2 不在白名单 → 否（除非扩白名单 ADR）。
- rclone --backup-dir / 纯拷贝约定 / SQLite 内容寻址：无法原生给出"每次改动的大白话原因"这一核心价值或需手搓劣化版 VCS → 否。

## 决定
1. 每个对话一个工作区目录 `data/artifacts/ws-<月日>-<时分秒>/`，uploads 与外部目录 junction 都在其中；**每区独立 .git**（版本史按任务天然隔离）。
2. 版本引擎 = vendored isomorphic-git（`bin/vendor/artifact-vcs/`，锁 1.41.9）。agent 走 `bin/artifact-vcs.js` CLI（snapshot/log/restore），UI 走桥接 `/api/vcs/log|blob|restore`（均带 ws 参数）。
3. 会话与工作区解绑存活：删会话不删区；绑定关系持久在 `data/workspace-map.json`。全局视角 `/api/workspaces` 列出全部区（含孤儿）+ 元信息；UI「引入到当前对话」= 重绑 sid。
4. 强保证的实现层语义：@ 引用插入带工作区前缀的完整相对路径，agent fs 域覆盖 forge 根，路径在提示词里即可读。
5. 恢复前自动 snapshot 当前内容（防手滑）；恢复本身也入历史。
6. 旧数据一次性迁移至 `ws-imported/`（含旧 .git，历史保留），标记文件 `.migrated-v3` 防重跑。

## 后果与变更成本
新增 vendored 依赖 8.3MB（包体占比小）；桥接端点全部 ws 化（前端同步）；工作区目录名对用户可见（时间命名，可接受）。退出成本低：isomorphic-git 是标准 git 对象库，任何 git 工具可读。

## 复核条件
- 单区制品体积 > 数百 MB 或文件数 > 千级 → 评估换 kopia（去重压缩+保留策略）。
- 出现跨区频繁引用痛点 → 评估工作区级"收藏/快捷方式"而非回退共享目录。
- isomorphic-git 上游停维或出现兼容性破损 → 锁版本 + fork 补丁（零 fork 策略不受影响，属依赖修复）。
