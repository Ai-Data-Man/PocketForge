# 浏览器自动化栈（browser-use 主选；@playwright/mcp 备选）

## browser-use（browser-use/browser-use，Python）
- 结论：ADOPT（主选）
- 许可证：MIT（LICENSE "Copyright (c) 2024 Gregor Zunic"，PyPI 分类器一致；云服务另 ToS 不影响 OSS 层）。2026-08-19 核对。
- 版本：0.13.8（2026-08-16）；`requires_python >=3.11,<4`。
- Windows/便携性：纯 pip 包；0.13.0 起弃用 Playwright 改原生 CDP（deps: cdp-use、browser-harness）；复用系统 Edge：`BrowserConfig(channel='msedge')` / `executable_path` / `cdp_url`；`headless` 默认 None=有显示器则有头；`Browser.from_system_chrome()` 自动探测。
- MCP 模式：`browser-use --mcp`（stdio）；env：`BROWSER_USE_HEADLESS=false`（MCP 下默认 headless，要人可见需显式关）、`BROWSER_USE_DISABLE_SECURITY=true`。挂 goose：`extensions: { type: stdio, cmd: <portable>\Scripts\browser-use.exe, args: [--mcp] }`。
- 验证状态：VERIFIED-DOC。待本机验证：0.13 Rust/CDP 重写（beta）对 msedge channel 的实际探测成功率；Windows 回归无公开报告 → 锁 0.13.8 + P2 冒烟。

## @playwright/mcp（microsoft/playwright-mcp）
- 结论：BACKUP
- 许可证：Apache-2.0。活跃（36k+ stars）。
- 运行：`npx @playwright/mcp@latest`（stdio 默认，`--port` 走 HTTP）；需 Node ≥18（便携 Node 需随包）。
- 系统 Edge：`--browser msedge`；默认 accessibility-snapshot 模式（不截图，对怪异 DOM 稳）；`--caps=vision` 开视觉坐标点击。
- profile 落 `%LOCALAPPDATA%\ms-playwright\mcp-*` —— 便携化需 `--user-data-dir` 显式重定向（P2 如启用再测）。

## 已拒（许可证白名单）
- nodriver：AGPL-3.0。拒。
- camoufox：MPL-2.0 弱 copyleft。拒。
- patchright（Apache-2.0）：反检测 fork，内部系统无需求。不采用。
- Selenium 4.47（Apache-2.0）：Selenium Manager 自动下 driver 需外网，锁死机不利。次选。

## 便携 Python（embeddable）打包坑（VERIFIED-DOC，python.org 官方文档）
1. zip 不含 pip/tkinter/Scripts：用 get-pip.py，入口脚本一律 `python -m pip`。
2. `python3xx._pth` 必须解锁 `import site` 并加 `Lib/site-packages`，否则装的包不可见。
3. embeddable zip 自带 vcruntime140(_1).dll；但 Win10/11 原生仅含 UCRT，**msvcp140.dll 不保证存在** → 随包携带 VC 运行库 DLL 或选不依赖的版本（P2 实测）。
4. 离线交付：全部 wheel 预下载进包（`pip download`），目标机零外网。

## 真实 PLM 的未知数（只能现场测）
- PLM 是否需要 IE 模式/ActiveX：IE-mode 页面 CDP/Playwright 无法正常自动化 → 若命中需人工兜底方案（设计时预留"人工模式"占位）。
- SSO：妻子用自己的企业账号在可见浏览器里登录一次，profile 持久化在便携目录。
