# 浏览器自动化栈（@playwright/mcp 主选；browser-use 降级 WATCH）

## 最终结论（2026-08-19 VERIFIED-RUN 推翻初版）
- **主选：`@playwright/mcp`（Apache-2.0）**：`--browser msedge` 复用系统 Edge + `--user-data-dir` 便携 profile，MCP stdio navigate/snapshot 全通。
- **browser-use 0.13.8（MIT）降级 WATCH**：SDK `BrowserSession.start()` 在 Edge 151 上死锁（三处独立缺陷，见下）；CDP 底层（cdp-use 直连）完全正常。观察上游修复后复测。

## VERIFIED-RUN 事实（2026-08-19，开发机 Edge 151）
1. `chromium.launchPersistentContext(channel:'msedge')`（playwright-core）：导航/取文本/点击全通 → **系统 Edge 复用成立**。
2. `npx @playwright/mcp@latest --browser msedge --user-data-dir <portable>`：MCP stdio `browser_navigate` + `browser_snapshot`（accessibility YAML 含 ref）全通。
3. MCP 测试方法：stdin 必须**保持打开**（EOF 会让 server 退出）；用 `(sleep N; printf ...; sleep N)` 管道喂 JSONRPC。
4. cdp-use 裸客户端连 Edge 40s 稳定，setDiscoverTargets(filter page+iframe) 与 setAutoAttach 均正常 → Edge CDP 本身无问题。

## browser-use 0.13.8 在 Edge 上的缺陷清单（P2b 排障记录）
- launch 模式（executable_path 指 Edge）：Edge 内置扩展 background_page 触发 `Inspector.targetCrashed` 连发 → session 初始化挂起（watchdog 30s TIMEOUT）。
- cdp_url 附加模式：`SecurityWatchdog` 默认拦截无 host URL（file:// 必拒；`urlparse` 无 host → False），并主动关 tab → focus 竞态 `ValueError: Target ... not found` → ws 反复重连，`start()` 不返回。
- `--disable-extensions` 额外 args 反而让 launch 阶段卡死（原因未深挖，非必须）。
- CLI（browser-harness 0.1.9）Windows 只探测 Chrome 不探测 Edge（chrome.py `find_chrome_executable` 仅 Chrome 路径）。
- 附加发现：默认下载 uBlock 扩展（目标机无外网即失败）；须 `BROWSER_USE_DISABLE_EXTENSIONS=1`。
- 便携 Python（embeddable 3.12.10）：`._pth` 加 `import site` + `Lib/site-packages` 后 pip/browser-use 安装成功，CLI 可跑（证明 Python 便携层本身没问题，可复用于其他用途）。

## 风险与后续
- playwright-mcp 需 Node ≥18 → 交付包带便携 Node zip（node.exe 单目录，无污染；P4 打包时 pinned）。
- `.playwright-mcp` 输出目录默认 cwd 相对 → 由启动器钉 cwd 到便携数据目录。
- browser-use 复测触发条件：其 GitHub release 修复 Edge session 管理（关注 0.14+）。
- 真实 PLM 的 IE-mode/ActiveX 仍是现场未知数（两方案同样受限，人工兜底预案不变）。
