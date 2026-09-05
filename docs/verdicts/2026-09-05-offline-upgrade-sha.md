# 裁决书：离线升级 sha256 通道缺口收口（缺陷3）

- 日期：2026-09-05（s67 裁决）｜补档说明：本文件正文在 s67 当日**声称归档但实际未落盘**（af4e007 仅写了 verdicts/README.md 索引行，与 s44「项目须知.md 声称已建」同族事故第二例），s69（2026-09-06）实施时发现缺口，由主控按 STATE 遗留⑨定案口径与实施记录重建补档。
- 决策人：pf-pm（s67）；实施：pf-engineer（s69，1c4a1e0 桥端通道 + 64feedb 顺带 config 保全，见 STATE s69 遗留①）
- 关联：STATE s67 遗留⑨、s50c 全局 POST 上限预检、update-runner verifySha 既有消费端

## 缺陷（s67 实锤）
1. 离线升级 UI 不收 .sha256 上传（端点白名单拒），而 update-runner 硬性要求校验文件——小白离线升级流程走不通。
2. /api/update/upload 不校验内容：非 zip 内容也落盘留垃圾暂存。

## 裁决（c 方案）
- **桥端自算自验**：upload 端点双形态收 zip 与 .sha256；zip 侧魔数（PK\x03\x04）预检+字节数对账；.sha256 落位后桥对 zip 实算 sha256 比对，通过才转正配对——runner **零改动**（verifySha 原样消费同构文件）。
- **失败清理**：任何校验失败不留 .part/暂存垃圾；已上传的 zip 不因 sha 错配被销毁（用户不必重传 325MB 包）。
- **小白单文件工作流**：zip 与 .sha256 两个文件挨个上传即完成暂存+校验，顺序容错（sha 先到给人话指引）。
- 端点防护同门既有全局门（Origin 403/文件名白名单）；s50c 的 50MB 全局上限对本端点豁免保持（s67 dfe46b0 先例），但不外溢其他端点。
- 随 v0.9.10 实施；UI 上传控件属配套工作流（s69 遗留：首批只落桥端 API）。

## 验收清单（8 条，s69 实施时逐条实证于 fuzz 100/100）
1. 合法 zip 上传 staged + 正确 sha256 配对 verified + status 列表可见
2. 哈希不符拒（人话），.sha256 不落，zip 保留供重配
3. 非 zip 魔数拒，零残留
4. 字节数不符拒（协议层 400 + 业务层对账双保险），零残留
5. 失败路径清理暂存（.part 机制，成功才 rename）
6. 端点防护同门不回归（文件名白名单/Origin 403/尺寸豁免不外溢）
7. runner 零改动（升级流程/GitHub 路径/回滚未动，verifySha 兼容实证）
8. 顺序容错与小白工作流（sha 先到友好拒）

## 同批顺带（64feedb，s69 遗留①）
升级差量对用户态配置的保全：config.yaml / custom_providers/ / conf/goose/config/memory/ 进 update-runner PROTECTED（升级包本就不含它们，此前被差量按 deleted 删盘→bootstrap 纯模板重建丢 s17 开关与 mcp-* 块）；permission.yaml 不保全=有意（护栏默认靠升级送达，goose 首启自规范化）；data/config/* 天然幸存。bootstrap 合并路径沙盒 8/8 实证。
