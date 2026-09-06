# s75：goose 扩展进程滞留修复（s74 遗留①闭环）

- 栈外验证（research/17 前置条件）：独立 acp 3 会话 33 后代进程 → session/close×3 → **1s 内归零**；bogus close 返回空 result 无 error → fire-and-forget 无害。
- 桥修复（最小 diff，chat-bridge.tpl.js delete_session）：硬删 DB 同时写 `session/close`（id 不注册 waiting，响应静默忽略；写失败不阻断）。未碰 unsubscribe/归档，未动 goose。
- 端到端：单会话 11→0；fuzz 5 会话 55 进程 → 5 次产品路径 delete → 0（≤5s）；桥对 bogus close（实验行删除）无异常。
- 工具转正：tools/clean-orphan-mcp.ps1（正则按实测带引号命令行收紧，只杀父死）+ tools/list-goose-procs.ps1。
- 回归：e2e-chat **48/48**（新增 11b 节 ws-close-reclaim.js 自相对进程数断言）+ fuzz **143/143**。
- 现场恢复：实验/fuzz 会话行经产品路径 delete 清零；终态 bridge acp descendants=0、healthz 200。
- 教训：goose 会话 id 计数器按库内 max 复用——删行后新会话会拿到旧号（对照时间戳识别归属，勿按号段盲删）。
