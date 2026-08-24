# 07 制品版本管理选型（P28 / ADR-0007）

更新：2026-08-24。结论服务于 ADR-0007。

## 需求归约
小白要的三件事：改坏能回上一版；每版有时间；每版有"为什么改"的大白话说明。不是分支/合并/diff 全量 VCS 语义。对象 = data/artifacts 下的小体量制品（xlsx/docx/png/txt）。

## 候选核证

| 方案 | 许可证 | 形态 | 结论 | 验证状态 |
|---|---|---|---|---|
| git 本体 | GPLv2 | — | 违反许可证白名单（仓库契约 §2.5），排除 | VERIFIED-DOC（gnu.org/licenses） |
| libgit2 / nodegit | Apache-2.0 | 原生二进制绑定 | 解压即用与 EDR 风险，排除 | UNVERIFIED（未实测，按约束否决） |
| **isomorphic-git** | **MIT** | 纯 JS npm 包，55 依赖共 ~8.3MB | **采纳**：便携 node 直接 require，无原生编译 | **VERIFIED-RUN 2026-08-24**：本机 node v22.21.1 + iso-git 1.41.9，init→中文文件名两次提交→`log({filepath})`→`readBlob` 读旧版内容全通；registry.npmjs.org 元数据核对（version/license/deps/unpackedSize） |
| kopia | Apache-2.0 | Go 单 exe，Windows amd64 zip ≈15.4MB（api.github.com/repos/kopia/kopia v0.23.1 资产 size=15383234） | 合规备选：去重压缩+保留策略+自带 UI；仓库不透明、预览需 restore → 升级路径保留 | VERIFIED-DOC |
| restic | BSD-2-Clause | Go 单 exe | 白名单外（MIT/Apache-2.0/PD），排除除非扩 ADR | VERIFIED-DOC（GitHub repo license 字段） |
| rclone --backup-dir | MIT | Go 单 exe | 仅同步事件产生副本，非真版本管理 | VERIFIED-DOC（license） |

## 本机实证记录（VERIFIED-RUN 细节）
- 环境：Windows Server x64，forge 自带便携 node v22.21.1，npm 经 127.0.0.1:7890 代理安装。
- 沙盒：C:\PocketForge-Test\iso-git-probe\probe.js —— `git.init/add/commit/log(filepath)/readBlob` 全通；中文文件名 `季度报表.xlsx` 正常；旧版 blob 内容逐字节一致。
- 已知坑：`readBlob`/`expandOid` 不接受短 oid → 桥接与 CLI 均先 `expandOid` 展开 40 位。
- 已知坑：`log({filepath})` 过滤"该文件无变化的提交"，恢复前自动保存若内容未变则不显示——符合小白语义。

## 运行时落点
- vendor：`forge/bin/vendor/artifact-vcs/node_modules/isomorphic-git@1.41.9`（LICENSE.md 随包）。
- CLI：`forge/bin/artifact-vcs.js`（agent 用）；HTTP：桥 `/api/vcs/*`（UI 用）；仓库根 = 各工作区目录。

## 复核信号
单区体积/文件数涨到备份量级、或需要自动清理策略 → 重评 kopia。
