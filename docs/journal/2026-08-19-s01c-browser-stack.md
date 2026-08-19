# 2026-08-19 s01c — P2b 浏览器栈验证（结论反转）

- 便携 Python embeddable + browser-use[cli] 安装成功，但 SDK BrowserSession 在 Edge 上三处缺陷死锁（详见 research/05 更新）。
- 排障路径：launch 模式 → targetCrashed 连发；cdp_url 模式 → file:// 拦截 + focus 竞态 + ws 重连循环；cdp-use 裸客户端 + 手动 Edge CDP 完全正常 → 定位为 browser-use 会话管理层问题，非 Edge/CDP 问题。
- 切换 @playwright/mcp：playwright-core msedge channel 直跑全通；MCP stdio navigate+snapshot 全通（注意 stdin 保持打开）。
- 决策：浏览器栈主选 playwright-mcp（需便携 Node）；browser-use WATCH。research/05 已重写。
- 待办转入 P3：便携 Node 采购（pinned zip）、`--user-data-dir` 便携化、`.playwright-mcp` 输出目录钉死。
