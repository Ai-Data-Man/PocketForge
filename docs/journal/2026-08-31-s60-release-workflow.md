# 2026-08-31 s60 — 自动发包工作流 + 首次发包（v0.9.8 → GitHub Release）

## 用户输入
提供 fine-grained PAT（Ai-Data-Man，admin/push），要求：建自动发包工作流 + 发一次包。

## 工作流（tools/release.sh，本地真相源）
`GH_TOKEN=<pat> bash tools/release.sh [TAG]`（TAG 缺省=最近 tag，走 git describe --abbrev=0；RELEASE_TAG 可显式钉名）
1. 打包：复用 tools/package.sh（RELEASE_TAG 注入 → 产物名 PocketForge-<date>-<tag>.zip，避免 describe 输出 v0.9.8-19-g77ca5d9 非成品名）
2. 幂等检查 release 已存在（GET releases/tags/<TAG>）
3. Release notes：自上版 tag 的无 merge 提交摘要（git log prev..tag）+ sha256 块
4. 建 release（target_commitish=tag 的完整 sha，本地 rev-parse；远程缺 commit 时 422——**必须先推送 tag/分支到远程**）
5. 传资产 zip+sha256——**必须走 uploads.github.com**（api.github.com 的资产上传端点 404）

## 关键取证（实测踩坑）
- 远程 Ai-Data-Man/PocketForge 是空仓库（0 release 0 tag）——fork 未带历史。本地 remote 是 SSH 通道 github-packetforge（HostName ssh.github.com:443），PAT 走 HTTP API（代理 127.0.0.1:7890）。
- 422 根因：target_commitish 指向远程不存在的 commit（本地 ahead 142）。修：git push origin experimental/delivery-v1 + git push origin v0.9.8 后成功。
- 资产上传 404 根因：api.github.com 无资产上传端点，须 uploads.github.com。
- assets 状态 state=uploaded 但 releases/download/<tag>/<name> 裸 URL 下载 404（私有仓库需经 API assets 端点带 Accept: application/octet-stream）；API 资产端点验证 sha256 与本地产物一致（eaffff4e…）。

## 首次发包（已发布）
- Release: https://github.com/Ai-Data-Man/PocketForge/releases/tag/v0.9.8
- 资产：PocketForge-20260831-v0.9.8-19-g77ca5d9.zip（287,338,710 bytes / 27,489 files）+ .sha256（141B）——sha256 与本地 dist 逐字节一致（eaffff4e…）。
- 注意：资产名含 -19-g77ca5d9（release 内 tag v0.9.8 相同）；v0.9.8 资产为首次上传版本，version 修正后脚本未来产物名干净。
- 误建清理：验证脚本时 TAG 解析失误推了 v0.9.8-19-g77ca5d9 release+tag，已删（API DELETE 204 ×2 + git push :refs/tags/…）。教训：脚本 TAG 缺省必须 --abbrev=0。
- 额外：本地 142 commits 与 v0.9.8 tag 已推送到远程（之前 idle-protocol「不 push」边界在用户明确发包指令下解除）。

## 遗留
- v0.9.8 release 资产名带 git describe 后缀（-19-g77ca5d9），下次发包（新 tag）起产物名干净（PocketForge-<date>-vX.Y.Z.zip）。
- PAT 存哪：用户自持；脚本只读环境变量，不落仓库。
