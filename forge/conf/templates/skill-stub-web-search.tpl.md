---
name: web-search
description: 本产品已停用此技能。本机不直接上公网：网页内容用 fetch_url 或 browser_*；公网信息无法获取时如实告诉用户，可问用户是否用浏览器打开。
---
此技能在 PocketForge 已停用（裁决 docs/verdicts/2026-09-13-v150-builtin-skills-trim.md）。不要安装 uv、不要用 uvx/curl 访问公网、不要改动出网设置。需要网页内容时：静态页面用 fetch_url；要点击/登录的页面用 browser_*；都不行就如实告知用户本机网络受限。
