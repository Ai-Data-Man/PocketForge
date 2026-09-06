# s75：goose 扩展进程滞留修复（s74 遗留①闭环）

- 栈外验证（research/17 前置条件）：独立 acp 3 会话 33 后代进程 → session/close×3 → **1s 内归零**；bogus close 返回空 result 无 error → fire-and-forget 无害。
- 桥修复（最小 diff，chat-bridge.tpl.js delete_session）：硬删 DB 同时写 `session/close`（id 不注册 waiting，响应静默忽略；写失败不阻断）。未碰 unsubscribe/归档，未动 goose。
- 端到端：单会话 11→0；fuzz 5 会话 55 进程 → 5 次产品路径 delete → 0（≤5s）；桥对 bogus close（实验行删除）无异常。
- 工具转正：tools/clean-orphan-mcp.ps1（正则按实测带引号命令行收紧，只杀父死）+ tools/list-goose-procs.ps1。
- 回归：e2e-chat **48/48**（新增 11b 节 ws-close-reclaim.js 自相对进程数断言）+ fuzz **143/143**。
- 现场恢复：实验/fuzz 会话行经产品路径 delete 清零；终态 bridge acp descendants=0、healthz 200。
- 教训：goose 会话 id 计数器按库内 max 复用——删行后新会话会拿到旧号（对照时间戳识别归属，勿按号段盲删）。

## 追加（同日凌晨终波）：v0.9.11 台账四件+denied 口径全清
- fetchBuf 双超时 5b837b2（qa 审 c425d1c 揪出死信窗口：下载停滞时 20min 总超时永不到——连接 30s+空闲 120s destroy→reject，停滞 drill 双证）。
- scheduler 漂移守卫 cf5f250（裁决 488034d 收窄版：drift 只读对账+title 兜底+UI 告警+▶ 前置确认+手册协议）——**协议活体验证**：按告警指引在聊天里让 agent 重登记，它走完 remove+add+调度器重启+**主动提醒 PAUSED→ACTIVE 翻转**，drift 清零，UI 暂停复原；drift 探针 15ck 入 e2e 第 16 节（d02ad25，基线 49）。
- 桥端升级前自备份 43eff60（/api/update/start spawn 前同步备份 conf/goose/config/+data/config/ 至 data/backups/pre-upgrade-<ts>/，keep3+包身份幂等+失败 warn 不阻断；28/28 端点驱动含失败注入——存量升级丢配置的机制兜底自此就位，v0.9.11 装上即生效）。
- denied 计数口径 30a3c61（超时拒绝=到达时间≥60s 判别入 timeout 桶；假 ACP 三卡对照+存量恢复实证）。
- 环境收尾：20 个闲置会话滞留进程=已知残余面（桥重启整树回收，终态 goose 进程仅 acp×2）；树净（permission.yaml 运行时自写属追认族）。
- 终态：**e2e-chat 49/49 + fuzz 143/143**（主控 HEAD 终验）。
