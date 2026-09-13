# s78e UX 自查修复批（2026-09-13）

上游：tmp/s78-ux-heuristic-audit.md 四发现（P1-1a / P2-2abc / P2-3abc / P3-4）「最小改法」节逐条落地。基线 e2e 57/57 + fuzz 178/178。

## 改动

### 前端 forge/conf/templates/chat.tpl.html（+1 CSS 规则）
- **P1-1a**：审批卡按钮按 `KIND[].o` 权重渲染（allow_once→reject_once→allow_always→reject_always；未知 kind 沉底保原相对序）——goose 回包恒 allow_always 居首（本轮 WS 实录），照单透出=最大按钮管持久化承诺。`allow_always` 文案改「✅ 以后都允许（会记住，之后不再问）」；卡面 ptitle 下新增 `.psub` 小字「选「以后」的会被记住，之后这类操作不再问。」。
- **P2-2a**：卡面 pnote 追加「一分钟没回应，会自动先跳过这次。」（渲染时预告，与超时后 note 衔接）。
- **P2-2c（预期管理路径）**：60s 超时 settle 文案改「（等太久没人选，自动帮你选了 🚫 这次不行。它可能会换个做法再来问你——想让它做，它再问时点「这次可以」就行。）」——顺带修正原「再点一次按钮」的失实指引（settle 后按钮已撤）。
- **P2-3a**：stopBtn 点击即 addInfo「⏹ 已让它停下，进行到一半的步骤会就地结束；想继续就再说一句。」
- **P2-3b**：`zombiePermcards()`——把未 settled 卡视觉收口（clearTimeout(_pto)+撤按钮+settled 类+「这轮已经结束，这张卡不用再选了。」），挂 stopBtn 点击与 stop 事件两收敛口；不发协议帧。会话切换路径由清墙天然覆盖（卡片随墙销毁）。
- **P2-3c**：忙碌补发从「拒绝+草稿留框」改为入队+占位（对齐 #3 会话开设路径文案模式）：busy 时回车→`pendingQueue.push`+清框+addInfo「它还在忙，这条已记下，等它干完手头的就自动发出去（不用再点一次）。」；stop 事件既有 flushPendingQueue 自动补发；用户主动停止则 rollbackQueue 放回输入框（控制权留给人，不与停止语义打架）。发送钮 busy 态仍禁用，真实入口=回车。
- **P3-4**：输入框 placeholder 改「想让我做什么？@ 引用文件或数据表，Tab=常用话术」。

### 桥 forge/conf/templates/chat-bridge.tpl.js
- **P2-2b**：`humanizeDecline(msg)` 人话门（ff03b03 同族——门先于透出）：session/update 的 tool_call(_update) content 文本块命中 `/the user has declined to run this tool/i` → 改写为「这一步没得到您的同意，没有执行。」；挂 onAcpData 转发前（含 session/load 回放同路帧）。只改转发帧，goose 自持会话史不动（agent 行为零影响）；前端 explain_tool 喂料读 card._out 同步吃人话版。

### 测试 tools/e2e/ws-subscribe-race-probe.js
- onAcpData 提取桩参数列补 `humanizeDecline`（同 classifyUpstream 既有的 `() => 'unknown'` 桩法传 no-op）——本段测广播豁免面，人话门由 GUI/WS 探针覆盖。**s78 教训 1 复验**：改公共函数体新增外部符号，提取面必须同步，否则 `ReferenceError: humanizeDecline is not defined` 打红探针（首轮 e2e 55/57 实锤后修复）。

## P2-2c 取证（为何不改协议语义）
- 超时拒绝=reject_once，agent 收拒绝后按其 prompt 自主换路（本轮活体再证实录：decline 文本含 "DO NOT attempt to call this tool again"——同会话内 agent 拒绝重请同一工具）。
- 桥侧「停任务」两条路均不安全：`session/close` 必删会话（research/18 断点①，closed_session_ids 守卫）；`session/cancel` 撞未决 request_permission 的语义零运行时证据（停止钮路径虽在产，但用户点击时序≠超时自动代发时序）。审计非目标区已裁决维持「超时=拒绝」语义（s71 G2）。
- 故按指示走预期管理：a 卡面预告 + 超时 note「它可能会换个做法再来问你」。P1-1b（已记住允许的撤销面板）为独立班车，本批未动。

## 取证与验证矩阵
- **decline 帧形状实录**（tmp/s78e-decline-shape.js，裸 WS 探针）：`tool_call_update.status=failed` + `content:[{type:'content',content:{type:'text',text:"The user has declined to run this tool. DO NOT attempt…STOP."}}]`（goose.exe 二进制串+活体帧双证）；同帧捕获 goose 选项序=allow_always,allow_once,reject_once,reject_always（P1-1a 重排必要性实证）。
- **门正证**（tmp/s78e-b-focus.js，GUI+WS 帧级）：拒绝后前端收到的帧 text 已是人话、工具卡输出区渲染中文、settle note 正确。
- **GUI 全量**（tmp/s78e-gui-verify.js，headless msedge，explorer 零开窗）21 断言 ALL-PASS：placeholder/按钮序四项/decline 零英文透出/排队占位+自动补发/停止交代/僵尸卡置灰/60s 超时 note 活体。
  - 探针设计坑两枚留档：①goose 帧发放有方差（有时整轮零 tool 帧=零工具卡，此时无英文可漏仍安全；正证走 WS 帧级探针）；②晚回合上下文模型倾向直接作答不出卡——卡类断言须新会话。
- **全量**：e2e-chat 57/57 + fuzz 178/178 顺序绿（首轮 55/57=上述探针参数列缺口，修复后 57/57）。
- **物化**：chat.tpl.html 桥每请求直读零物化；chat-bridge.tpl.js→bin cp+cmp 逐位一致+`node --check` 双过；仅 `pc process restart chat-bridge`（healthz ok，pg Ready restarts=0）。
- **清理**：交互探针会话 20260913_37..67 共 31 个经 WS delete_session 全清（每次删除后服务端关连接，逐会话独立连接；1 个超时重试成）；探针制品文件清零；套件自产残留（_68+）与基线同形态不属清理面。
