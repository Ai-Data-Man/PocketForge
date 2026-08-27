# s17 会话记录 — 2026-08-27 晚（能力中心 + 记忆管理）

## 目标
用户长期自主工作指令（至 2026-08-28 04:30）：自主发掘需求/找 bug/体验优化/研究/设计/开发/测试/审查/留痕。起头方向：goose 内置能力与配置未小白化暴露、记忆管理黑盒、skill/mcp 无商店。双视角要求：小白（妻子）能用 + 小forge（agent 本体）能力最大且安全。

## 取证结论（全部 VERIFIED-RUN 本机，2026-08-27）
1. `goose mcp <SERVER>` 可独立起的内置服务仅 `memory` + `tutorial`；todo/summarize/chatrecall 等 platform 型内嵌于 acp 进程，不经子命令。
2. `conf/goose/config/config.yaml` 由 bootstrap.ps1 **每次启动幂等重写**（模板占位符替换）→ 运行时/桥直接改该文件会被下次启动覆盖。
3. memory MCP 工具面 = remember_memory / remove_memory_category / remove_specific_memory / retrieve_memories；global 存储实路径 = `%APPDATA%\Block\goose\config\memory`（junction）→ `conf/goose/config/memory/<category>.txt` 纯文本。目前目录为空 + 探针写入成功（wife_profile.txt），**妻子无任何 UI 可见/可控 agent 记忆 —— 隐私盲区**。
4. ACP `session/new` 返回 4 modes（auto/smart_approve/approve/chat）+ configOptions(provider/model)。前端顶栏 mode 下拉已接 `session/set_mode`，会话级生效。config.yaml `GOOSE_MODE: smart_approve` 为新会话默认档。
5. permission.yaml ask_before 已含 browser 全家桶/shell/write/edit/faucet 写 ——「重要操作问我」护栏已在，但**用户不可见**（不知道哪些操作会先问她）。
6. schedule 子系统完整（add/list/remove/run-now/sessions）但零 UI；s14 曾因 cron 误配出事故 → 一期不暴露写操作。
7. skills 有 /api/skills + 弹窗（只读）；recipes 目录仅 daily-memory-check 样例。「商店」一期不做（需外网源+审核机制，收益低风险高）。

## 定案（ADR-0010）
- **A 能力开关**：设置面板新区块，4 扩展（faucet-db 数据库/browser 浏览器/memory 记忆/chatrecall 会话回忆）enabled 开关；桥 `/api/extensions` GET/POST 直接改 config.yaml 的 enabled 值；**bootstrap 改为保留现有 config.yaml 中可调字段（enabled + GOOSE_MODE）**——最小合并逻辑。
- **B 记忆管理**：「小 forge 记住的事」面板。读 = 直接解析 conf/goose/config/memory/*.txt（免起 MCP 进程）；删单条/清空分类走文件级原子重写（与 MCP 同格式）。不提供写入口（agent 自动记，人工写易造成脏数据+越权代记）。
- **C 护栏可见化**：设置面板说明当前档位 + ask_before 清单大白话（哪些动作会先问您）。
- schedule 写入口、skill 商店、recipe 管理：缓做，理由如上。

## 实现
（随提交补充）

## s19 续作（同夜 23:00 前）
- **权限请求小白面板落地**（conf/templates/chat.tpl.html）：`session/request_permission` 从"自动批第一项"改为对话流内确认卡（warn 底色、工具标题+参数摘要、四个大按钮：这次可以/以后都允许/这次不行/以后都别问、60s 超时自动选第一项防挂死）。选项 kind → 小白文案映射；回复走既有 acp_reply 通道。CSS 用三层令牌（warn-bg/warn-line/warn-tx/acc/danger），昼夜自适应。语法过；DOM 真验证因下述链路问题挂起。
- **护栏实证调查（未完案）**：approve/smart_approve 模式探针"写文件零权限请求"——根因不是 goose 护栏失灵（源码证实 inspect 链 fail-closed），而是 **9router 上游对 goose 大工具集（40+ schema）请求丢失 tool_calls/返回 502**，agent 根本没机会调工具。curl 同形状复现：1 工具=正常 tool_calls；40 工具=纯文本/502。glm-5.2、deepseek-v4-flash 均现。→ 修在上游（9router 换上游/调参），PocketForge 侧记录风险。
- research/04-goose.md 补 5 条 s19 取证（permission 语义/ACP 权限形态/router 缺陷/provider 优先级）。
- 教训再录：heredoc f-string 的 `{}` 会被 python f-string 吃掉（用字符串拼接写测试脚本）；bytes stdout 记得 decode。

## s20（同夜 23:20 前）— .goosehints 污染修复 + 502 真因定案
- **.goosehints 603KB 污染**（P11 期 3b57906 起随每次提交入库）：同段「经验沉淀」重复 2208 次、"PocketForge" 字符散斑穿插。写入者 = P11 会话期的开发侧 agent 脚本（一次性；bootstrap/bridge/backup 均只读该文件）。修复：从 019622f 干净版重建 4.3KB 手册（补沟通规矩/制品/gen-xlsx 段），模板化 conf/templates/goose-hints.tpl.md 为唯一真相源，bootstrap 每启幂等重建 + 越界（>50KB/<1KB）留档 data/logs。单测：坏文件→guard 触发→重建成功。
- **502 真因（9router-server.log 实锤）**：glm-5.2 combo 的 myopencode 线路对 goose 形状请求（STREAM·40TOOL）回 **401→锁定120s→429→锁定300s**，双线全锁后 combo 报错（goose 收到 502）。之前"40 工具丢 tool_calls/大 payload 502"的 curl 归因是时序巧合，撤回。修复在上游线路（9router 换 key/换线），PocketForge 无需改动。
- 沙盒 C:\PocketForge-Test 无 hints（老包），下次打包自然带上干净版。

## s21（23:30 前）— 快赢双件套
- **干完了提醒**：长任务结束（busy→idle 边沿）时若页面在后台，document.title 以 1.2s 轮转「✅ 干完了 — 小 forge」；visibilitychange 回前台即停并复位标题。
- **聊天记录搜索**：左栏顶部搜索框（≥2 字，300ms 防抖）→ `/api/search`（只读 sessions.db，messages.content_json LIKE，40 条上限）→ 结果卡（会话名+中文时间+命中片段）→ 点击 openSession 跳转。片段提取含 text 与 thinking 块（toolRequest/Response 用 JSON 摘要兜底）。GUI 实测：搜「报表/库存」命中真实历史会话，点击跳转正常。
- 修复 3 处：桥端 DatabaseSync 作用域漏 require；sqlite TIMESTAMP 字符串被当 unix 秒致 NaN 日期（改字符串解析）；空片段兜底文案。

## s22（23:40 前）— 502 终案 + 权限面板真机验证通过
- **502 双因定案**：①IE/WinINET 系统代理（127.0.0.1:7890，ProxyEnable=1）劫持 goose 进程出网——goose/reqwest 读系统代理，对 127.0.0.1:20128 的请求被 Clash 转发后 502；curl/python 不读 IE 代理故反复"复现失败"。NO_PROXY=127.0.0.1,localhost 即解。②叠加 glm-5.2 myopencode 线路 401/429 账号锁定。生产链路 pc 已给 chat-bridge 注入 NO_PROXY 并随 process.env 传给 acp 子进程，无暴露；仅手工探针环境缺此变量。
- **权限确认卡端到端 VERIFIED-RUN**：approve 模式真会话 → agent 发起 write 工具调用 → 卡片渲染（标题 write · 路径 / rawInput JSON / 四按钮 / 护栏说明）→ 点「✅ 这次可以」→ 工具执行 → agent 汇报创建成功。permission.yaml 工具名前缀核查（agent.rs:98 + extension_manager.rs:1467）：MCP 工具全名 browser__browser_click 形态与清单一致，内置工具 write/shell/edit 直名匹配。
- 收尾：permission-ui-test.txt 已清理。

## s25/s26（23:50 前）
- **真启动验证**：跑真实 bootstrap.ps1（EXIT=0）——hints 保持 4384B 干净版、config.yaml 幂等重建且用户 enabled 保留、占位符替换完整。
- **报错大白话转译**：endStream 时检测上游故障模式（Ran into this error/Server error/rate limit/timeout），追加小白提示卡（等一两分钟重发/换模型）。
- **新对话模型回落修复（STATE #4 关闭）**：前端 subscribe(null) 携带当前模型 → 桥在 session/new resolve 后自动 session/set_config_option(model)。GUI 验证：切 glm-5.1 → 新对话 → 保持 glm-5.1（修复前回落池首）。跨 provider 非法值时 set 失败降级为现状行为（安全）。

## s27（00:00 前）— 端口冲突小白化（STATE #2 关闭）
- chat-bridge listen 失败（EADDRINUSE）不再裸崩：GET /api/update/status 探测占用者——200 = 数字员工已在运行（带版本号），退出码 0；非 200/探测失败 = 端口被其他程序占用，提示重启电脑/找人帮。两分支均实测（双实例 + python http.server 占位）。
- 副产品发现：goose 出网受 Windows IE 系统代理（127.0.0.1:7890）影响，探针/手工跑 goose 需 NO_PROXY=127.0.0.1,localhost；生产链 pc→chat-bridge→acp 已覆盖。

## s28/s29（00:15 前）
- **e2e-chat.sh 补搜索断言**（16→18）。
- **终审轮产出**：EADDRINUSE 探测补 3s 超时；bootstrap hints 重建容错缺模板（老包升级路径）；权限卡超时注释修正。
- **s29 截图粘贴上传（高频小白路径，替换原"暂不支持贴图"拒绝提示）**：paste 事件捕获 image items → getAsFile → 复用 /api/upload 通道 → 自动填 @ 引用 + 提示补话。系统剪贴板 Set-Clipboard + 真实 Ctrl+V 端到端验证：png 落盘（200x100 完整）+ .forge 元数据 + 输入框自动引用。

## s30（00:20 前）— 空壳会话修剪
- 观察：259 会话中 199 个「New Chat」空壳（探针/误开双击残留），污染左栏。
- 修复：pruneScheduled 护栏扩展——无任何消息、name='New Chat'、存在超 1 天的 acp 会话启动时删除（先删 messages 引用完整性由 goose 自管；workspace-map 悬空由 P30c orphan 降级兜底）。实跑：102 条过期空壳已清，剩余 64 条明日到期自动清。

## 会话收束（2026-08-28 00:35）
自主工作段 s17–s31 共 23 提交。关键产出：
1. ADR-0010 能力中心+记忆可视化（扩展开关/记忆面板/护栏说明）
2. HTTP 层 CSRF 修复（Origin 校验，覆盖全部变更端点）
3. e2e-chat.sh 18 断言（STATE #7 关闭）
4. 权限确认卡端到端验证（STATE #3 关闭）
5. .goosehints 603KB 污染重建+模板化+启动防护
6. 聊天记录搜索 /api/search + 左栏 UI
7. 干完了标题闪烁 / 报错大白话转译
8. 新对话保持当前模型（STATE #4 关闭）
9. 端口冲突小白化双分支（STATE #2 关闭）
10. 空壳 New Chat 会话启动修剪（102 条已清）
11. 截图粘贴上传+@引用（真实剪贴板 E2E）
12. welcome/使用说明覆盖新能力

502 事件复盘：IE 系统代理劫持（NO_PROXY 已是生产链标配）+ glm-5.2 myopencode 线路 401/429 锁定，均非产品代码问题。

## s32（01:00 前）— 对标研究第一轮：Manus 定时任务
- 研究 manus.im/docs/llms.txt（Mintlify 站点可用 llms.txt 索引抓 md 原文；本机需走 7890 代理）。
- **洞察**：Manus 小白写定时任务不用 cron——自然语言（"每周一早8点做X"）+ 三步结构（任务/时间/产出）。s17 裁掉的是"暴露 cron"，不是定时任务本身。
- **落地**（ADR-0010 复议）：①hints 增「定时任务」段教 agent 用 goose schedule add（用户说人话→agent 造 cron→复述人话）；②桥 /api/schedules GET（schedule.json + recipe title 人话名）/POST（goose CLI remove）；③设置面板「⏰ 定时任务」区块（cronHuman 转"每天 09:00"）+删除。hints 模板新增 __FORGE_ROOT__ 占位符支持。
- GUI 验证：daily-mem 显示「每日记忆自检 · 每天 09:00 · 已暂停」+ 🗑。

## s33（01:30 前）— 对标研究第二轮 + 开场快捷任务
- Manus Projects（master instruction + knowledge base）→ 对应「工作区级项目指令」：判 backlog（首月低频，skill-sediment 可部分覆盖），不实现。
- Manus Skills = agentskills.io 同构；管理页/商店维持裁剪。
- **落地：开场快捷任务 chips**——新对话欢迎语下方 4 个按钮（做个体检/看看我的文件/你能干什么/分析一张图），点击填入输入框。GUI 验证通过。
- 对标矩阵：定时任务✓ 记忆✓ 贴图✓ 通知（标题闪烁，够用）/ 项目指令（backlog）技能商店（裁剪）/ 多会话并行（backlog）。

## s35（01:45 前）— 模糊测试矩阵固化
- tools/e2e/fuzz-chat.sh：12 项异常输入断言（空体/null/字符串体/类型混淆/遍历 id/正则元字符/内部路径泄漏检测），全部通过。
- 当轮真实收获：修 3 个问题——①搜索结果态无恢复路径（✕ 按钮 + Escape + 空 query 恢复，残留状态类 bug）；②/memory 的 category 数字类型绕过正则致 ENOENT 内部路径泄漏（typeof 校验 + existsSync 前置）；③ws/new、ws/bind 的 sid 无格式校验（sidValid 白名单）。
- 方法论：交互矩阵残留状态 + 类型混淆 fuzz 比肉眼 review 高效，后续每加端点应同步补 fuzz 断言。

## s36/s37（01:50 前）
- s36：搜索陈旧响应守卫（seq 序号，防慢响应覆盖新结果）。
- s37（Windows 特有）：fs/new、fs/rename、upload 统一拒绝保留设备名 con/prn/aux/nul/com1-9/lpt1-9（含带扩展名形态 CON.txt）——这类文件资源管理器/cmd 均无法删除，会造成工作区永久污染。实测矩阵：con 拒/CON.txt 拒/connect.md 过/auxiliary.md 过。
- fuzz-chat.sh 固化 12 断言 + e2e-chat 18 断言双回归通过。

## s42（02:30 前）— 技能商店（本地优先）
- 用户点名需求重新论证：ADR-0010 裁掉的是"商店基础设施"，不是"低摩擦能力扩展"。技能=纯文本 SKILL.md，安装=整目录复制，无执行面，天然安全 → 做成"技能收集"而非"市场"。
- 落地：forge/skills-repo/（周报生成/工作区清理两个初始技能）+ 桥 /api/skillstore GET|POST install（复制到 .agents/skills/）+ 技能弹窗「🛒 可添加的技能」区（先看内容预览全文 → ⬇添加）。
- 生命周期验证：API 安装 → 目录复制一致 → installed 标志翻转 → goose skills list 发现 → 卸载清理。GUI 渲染 + 点击安装闭环通过。
- 远程化预留：skills-repo 目录与 GitHub repo 同构，将来 sync 即得"远程技能源"。
