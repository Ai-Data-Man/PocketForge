# v0.9.13 发版执行清单（用户拍板后照跑；预制于 2026-09-15 s88 会话）

前置事实（全部已验证）：终版包 dist/PocketForge-20260915-v0.9.13.zip（sha256 799dfd44…，25,298 文件；差量 17 文本/零 exe）已过发布门（§8 矩阵冷装+升级装+终包冒烟全绿）；发布草稿 docs/v0.9.13-release-notes-draft.md 就绪。

## 执行步骤

1. ~~**前置复跑**~~ **已完成（2026-09-15 晨）**：deepseek 官方故障期间换线 mimo-v2.5 后 e2e-chat 全量 **59/59**（§18 救援路径实录回话）；基线 59/59+fuzz 189/189+appcap 13/13 全绿。
2. **tag 先行**（发版流程教训一）：`git tag v0.9.13 && git push origin v0.9.13`（当前分支 experimental/delivery-v1；tag 打在 0681362 或其后收口提交上——39fe8ff 之后的 docs 提交不影响包内容）。
3. **发布**：`GH_TOKEN=<PAT> bash tools/release.sh v0.9.13`
   - 自动：RELEASE_TAG 精确名打包（会重打包，指纹应与 799dfd44 一致——若不一致说明 tag 后有产品代码变动，停下核对 diff）→ 校验 → 信誉尖峰检测（预期输出「无信誉尖峰」，本版零 exe 变更）→ GitHub Release 创建+双资产上传+回执。
   - PAT 取用：用户 s60 所赠存于 zcode db input_history（s78 ⑩ 先例），不落仓库。
4. **发布说明**：正文用草稿精修版；必须保留 R4 段（v0.9.12 存量升级前手动备份 apps\ 的步骤）与 EDR 段（零程序变更口径）。
5. **对账**：API 下载双资产 sha256 与本地一致（release.sh 已内置回执）；tag/branch/release 三处可见。
6. **收尾**：STATE 顶行「v0.9.13 已发布（id/指纹）」+ journal 一行；dist 旧演练包归档惯例照旧。

## 回滚

Release 删除=GitHub 页面操作；tag 删除 `git push origin :refs/tags/v0.9.13`；已升级机器按发布说明回滚段（pre-upgrade 备份恢复）。
