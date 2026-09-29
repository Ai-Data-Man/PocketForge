# research/48 — 思考内容持久留痕：三问定案

- 日期：2026-09-30（s105）
- 问题：主线「思考草稿」面板回合一结束即整体弃置（`thinkDiscard()`），用户想回头审查没有留痕。设计前需定案：① goose 是否把 thought 持久化进 sessions.db；② session/load 回放带不带思考；③ 若不带，桥侧自建留痕需要哪些锚点。
- 探针：`tmp/s105-thought-turn-probe.js`（真回合）、`tmp/s105-load-probe.js`（回放）、`tmp/s105-cleanup-probe.js`（清理）；输出 `tmp/s105-turn-out.json`、`tmp/s105-load-out.json`（后者被三次回放轮转覆盖，最终内容为 20260819_10 的回放）。
- 源码树：`tmp/goose-src-v150/`（GitHub aaif-goose/goose —— block/goose 已迁移——tag v1.50.0 浅克隆，已剥 .git 与 documentation/，留 crates/ 39MB 供后续 VERIFIED-DOC）。
- 验证等级：除特别标注外，活体=VERIFIED-RUN 2026-09-30 本机（Windows，dev 栈 8790，goose 1.50.0，9router 用户侧 fork，模型 glm-5.3-flash）；源码=VERIFIED-DOC（v1.50.0 tag 逐行）。

## 0. 结论速览

| 问 | 答案 | 等级 |
|---|---|---|
| Q1 goose 存不存思考？ | **存**。assistant 消息行 `content_json` 里以 `{"type":"thinking","thinking":"…","signature":""}` 块落库，与正文同行 | VERIFIED-RUN + VERIFIED-DOC |
| Q2 session/load 回放带不带？ | **带**。每个 thinking 块回放为一条 `agent_thought_chunk` 帧，携带与正文相同的 `messageId`（可精确归属到 assistant 消息） | VERIFIED-RUN + VERIFIED-DOC |
| Q3 桥自建留痕锚点？ | **不需要自建存储**——数据已在库、已在回放。真正的「弃置」发生在**前端**：openSession 完成回调 `setBusy(false)`（chat.tpl.html:1083）→ `thinkDiscard()`（:1276），把回放送来的思考帧丢掉 | VERIFIED-RUN |

**一句话**：留痕通路已经存在且全程在工作（goose 存→goose 回放→桥透传→前端收到→前端丢弃）。设计只需改前端的消费端，不需要任何新的存储层。

## 1. Q1 证据：goose 持久化思考内容

### 1.1 活体（VERIFIED-RUN 2026-09-30）

流程：WS 连桥 → `subscribe(null)` 新会话 → `switch_model glm-5.3-flash` → prompt「小明有3个苹果，上午买了2次每次5个，吃掉4个，下午又送人1个，现在他有几个苹果？只用一句话回答。」→ stop end 后查库。

- 回合计量：**30 个 thought 帧 / 80 字符，首帧 +8.5s**（s104 实证参照：61 字 prompt 1426 帧/507 字符——glm 的思考流是逐 token 微帧）；正文 19 帧/34 字符。
- 回合结束查 sessions.db（sid 20260929_3，测后已按桥通道删除）：

```text
SESSION: {"id":"20260929_3","name":"小明苹果数量应用题","provider_name":"openai",
  "model_config_json":"{\"model_name\":\"glm-5.3-flash\",…}","created_at":"2026-09-29 16:37:09"}
messages rows: 3
--- id=17435 role=user   blocks=text            （用户正文）
--- id=17436 role=user   blocks=text            （turn-context，userVisible:false）
--- id=17437 role=assistant blocks=thinking+text len=190
  block: {"type":"thinking","thinking":"Simple math: 3 + 2×5 − 4 − 1 = 8. One sentence answer, Chinese. No tools needed.","signature":""}
  block: {"type":"text","text":"小明现在有 3 + 2×5 − 4 − 1 = **8 个苹果**。"}
  meta:  {"userVisible":true,"agentVisible":true,"inference":{"provider":"openai","requestedModel":"glm-5.3-flash"},"usage":{…}}
```

要点：**思考与正文在同一 assistant 行**（一次落库），形态 `{"type":"thinking","thinking":<全文>,"signature":""}`（9router 走 openai 兼容层，signature 恒空串）；帧流 80 字符 = 库内 thinking 全文（回放取的是库内全文，见 §2）。

复现：`node tmp/s105-thought-turn-probe.js`（发回合+计量）→ 用 node:sqlite 只读查 `messages WHERE session_id=<sid>`。只读查询模板：

```bash
node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('forge/conf/goose/data/sessions/sessions.db',{readOnly:true});
console.log(db.prepare('SELECT id,role,content_json FROM messages WHERE session_id=?').all('<sid>'));db.close()"
```

### 1.2 存量基线（不是新行为）

全库扫描（只读）：**1301 行 messages 带 thinking 块（恰 1 块/行），覆盖 247 个会话，464,629 字符**，最早 2026-08-19。按模型分布（有 thinking 会话数 / 该模型总会话数）：

| 模型 | 有思考 | 总数 | 模型 | 有思考 | 总数 |
|---|---|---|---|---|---|
| myopencode/kimi-k2.7-code | 41 | 44 | deepseek-v4-flash | 144 | 200 |
| myopencode/glm-5.2 | 39 | 94 | deepseek-v4.1-flash | 18 | 401 |
| gpt-5-forge-glm-5.3-flash | 3 | 9 | glm-5.3 / glm-5.3-flash | 0 / 1 | 1 / 1 |

即：**凡是上游真回了 reasoning 的回合，goose 都存了**——与模型家族无关，与该回合有无推理流有关（deepseek-v4.1-flash 大多数会话无 thinking，呼应 research/47 结论5：旧中继掐流，fork v0.5.81 后才恢复）。

### 1.3 源码链（VERIFIED-DOC，v1.50.0 tag）

1. **来源**：`crates/goose-provider-types/src/formats/openai.rs:1558-1567` — OpenAI 兼容流式处理把 `delta.reasoning_content`（DeepSeek/9router 风格）或 `delta.reasoning`（vLLM 风格，:141-146 注释「Prefer reasoning_content over reasoning」）逐块转成 `MessageContentBlock::thinking(reasoning, signature)` 内容块。
2. **块定义**：`crates/goose-provider-types/src/conversation/message.rs:232-235` — `struct ThinkingContentBlock { thinking: String, signature: String }`；枚举 `MessageContentBlock`（:318-334，serde tag="type" camelCase）→ 序列化即 `{"type":"thinking","thinking":…,"signature":…}`，与库内形态逐字段吻合。
3. **入库**：`crates/goose/src/agents/agent.rs:3548-3550` — 回合循环末 `for msg in &messages_to_add { session_manager.add_message(...) }`；thinking 块在 :2806（无工具响应时随 response 整体入列）与 :3110-3115（带工具调用时合并进 carrier/request 消息，`request_msg = request_msg.with_content(thinking.clone())`——这解释了 §2.3 里 thinking 与 toolRequest 同行）。
4. **存储**：`crates/goose/src/session/session_manager.rs:1903-1937` — `add_message` 把 **`message.content` 整体** `serde_json::to_string` 进 `content_json`，**无任何 Thinking 过滤**。写入在 `BEGIN IMMEDIATE` 事务内。

结论：Q1 = **存，且从来就存**（本机库从 2026-08-19 起的证据一致）。

## 2. Q2 证据：session/load 回放思考内容

### 2.1 活体（VERIFIED-RUN 2026-09-30）

对三个会话做 openSession 同款流程（裸 WS：`subscribe(sid)` → `rpc session/load {sessionId, cwd, mcpServers:[]}`），抓全部回放帧：

**① 本轮新建会话（20260929_3，glm-5.3-flash，无工具）**：

```text
REPLAY FRAME COUNTS: {"user_message_chunk":1,"agent_thought_chunk":1,"agent_message_chunk":1,"usage_update":1,"available_commands_update":1}

user_message_chunk   msgId=msg_a6f0acb9-…   「小明有3个苹果…」
agent_thought_chunk  msgId=chatcmpl-msg_20260930003731294bc21d30eb4611   「Simple math: 3 + 2×5 − 4 − 1 = 8. …」
agent_message_chunk  msgId=chatcmpl-msg_20260930003731294bc21d30eb4611   「小明现在有 3 + 2×5 − 4 − 1 = **8 个苹果**。」
```

思考帧**全文一次到达**（非逐 token 微帧），且**与正文帧同 messageId**（同库行的 message_id）。

**② 工具回合会话（20260921_205，deepseek-v4.1-flash）**：

```text
user_message_chunk → tool_call ×2 → agent_thought_chunk(577字符) → agent_message_chunk
（thought 帧与其后正文帧同 msgId=24a1e94a-…，位置紧贴正文前）
```

**③ 跨工具归属会话（20260819_10，glm-5.2）**：

```text
user_message_chunk(msg_93d4…) → agent_thought_chunk(chatcmpl-5c6e…) → tool_call → agent_message_chunk(chatcmpl-6692…)
```

此例证明归属语义：thought 帧的 msgId=**携带 thinking 的那行 assistant 消息**（库内 row 35 = thinking+toolRequest），不是最终答案行（row 37 = text）。即：**thought 属于「决定调工具前的规划」，messageId 可精确挂靠**——审查 UI 不依赖帧相邻性。

**rpc 回包本身**：`session/load` result keys = `["modes","configOptions","_meta"]`——**没有 history 数组**；历史全部以 session/update 通知帧回放（前端 `onAgentEvent` 同一入口消费）。桥对 result 只做 configOptions 翻译（chat-bridge.tpl.js:1498-1504），不碰帧流。

复现：`node tmp/s105-load-probe.js <sid>`（任意带 thinking 的历史会话均可）。

### 2.2 源码链（VERIFIED-DOC，v1.50.0 tag）

1. **回放转换**：`crates/goose/src/acp/server/load_session.rs:181-190` — `MessageContent::Thinking(thinking) => cx.send_notification(SessionUpdate::AgentThoughtChunk(content_chunk_for_message(message, TextContent::new(thinking.thinking))))`。逐消息逐块转帧。
2. **帧带 id**：`crates/goose/src/acp/server/message_meta.rs:72-77` — `content_chunk_for_message` 给每个 chunk 挂 `message_id` + `_meta.goose`（messageId/created 等）。回放与直播（server.rs:1403-1411 同款转换）共用此函数——所以直播帧同样带 messageId。
3. **过滤面**：`load_session.rs:24-35` `messages_for_acp_replay` 只按 `is_user_visible()` 过滤消息、`user_visible_content()` 过滤块；块级 `user_visible_content`（message.rs:466-470）对 Thinking 默认放行（仅当块被标注 audience=assistant 才剥）。`replay_tail`（load_session.rs:91-105 定义、:123 应用）只在客户端 meta 带 `replayTail` 时截尾——桥不带，恒全量回放。
4. **compaction 不删思考**：`crates/goose/src/context_mgmt/mod.rs:141-146` — 压缩只是给原消息打 `with_agent_invisible()`（agent 不可见、**user 仍可见**），原文含 thinking 全部保留 → 回放照旧。审查的长期可达性成立。
5. **边界（负验证）**：`load_session.rs` 的 match 臂覆盖 Text/Image/ToolRequest/ToolResponse/Thinking/Error/SystemNotification，**没有 RedactedThinking 臂**（落 `_ => {}` 静默丢弃）。即：若某 provider 回的是加密思考（Anthropic redacted_thinking 形态），库里存了但回放不出。本栈无此形态——全库 assistant 行块类型分布仅 thinking/text/toolRequest/toolResponse，LIKE 'redacted' 4 命中全部是 user 行普通文本（API-key 脱敏叙述），非 RedactedThinking 块。此边界不触发现行栈，仅设计时知悉。

结论：Q2 = **回放，带 messageId，全量（含 2026-08 起的历史会话），全文一次到帧**。

## 3. Q3：通路测绘（若走桥/前端侧，锚点在哪）

前提修正：Q1/Q2 均为「是」，所以「桥自建留痕存储」不再必要；本节把锚点测绘留给设计对照用。

### 3.1 真正的弃置点（前端，两处）

- chat.tpl.html **:1083**：`openSession` 的 `session/load` then 回调 `endStream(); setBusy(false);` → **:1276** `setBusy(false)` 分支调 `thinkDiscard()`（:1266-1271：清 thinkBuf、藏面板）——**回放送来的思考在这被丢**。
- chat.tpl.html **:1494**：`agent_message_chunk` 帧处理先调 `thinkDiscard()`（首正文帧=想完了）——直播与回放共用此路径，回放时每个 assistant 正文帧都会触发一次（无害但说明思考帧已被 :1496 `thoughtFeed(u)` 喂进 thinkBuf 后又被丢弃）。
- 回放期间面板本来也不可见：`#think-peek/#think-draft`（DOM :374）在 `#typing`（忙碌条）内，非 busy 态整个隐藏。

### 3.2 桥侧 thought 帧经过的点（全部透传，零解析）

- **onAcpData**（chat-bridge.tpl.js:1481-1550）：ACP stdout 逐行解析。带 method 的通知帧走 :1511-1548 分支；**thought 帧无任何专门处理**（`grep -n thought chat-bridge.tpl.js` = 0 命中）——它作为 `session/update` 通知原样过以下三站：
  - :1523-1534 stats 块（只累计 `agent_message_chunk` 文本做 s26 错误判定 + busySids 记账，**只读不改**）；
  - :1543 `humanizeDecline(msg)`（拒绝文案人话化，不涉 thought）；
  - **:1544-1547 转发点**：`const set = sid ? sessionClients.get(sid) : null; const obj = { agent: msg }; if (set && set.size) for (const ws of set) ws.send(obj);`——**若桥要自建留痕，hook 就插在这里**（模式照抄 :1526 的 `agent_message_chunk` 判定，加一个 `agent_thought_chunk` 分支）。
- 结论：桥是纯透传（任务背景里的判断「桥只做转发+跨界翻译」成立，行号坐实）。

### 3.3 桥现有 per-session 持久化先例（按新旧）

| 先例 | 行号 | 模式 |
|---|---|---|
| rewrite-tombstones（最近，主线5） | TOMB_DIR :4700；writeTombstone :4718-4731 | 每 sid 独立 JSONL，`atomicWrite` 整写（非 append），每 sid keep-3 滚动删除 |
| workspace-map.json | WSMAP_FILE :687；read/write :688-689 | readJson + atomicWrite，文件先行 + pgStateSync 镜像 |
| session-archive.json | ARCH_FILE :697-699 | 同上 |
| sessions.db 直读（只读） | sessionMeta :709-719；sidKnownToDb :723-729 | node:sqlite `DatabaseSync` 打开即查即关 |
| sessions.db 手术（写） | rollbackRewrite :4749-4764 | `PRAGMA busy_timeout=30000` + `BEGIN IMMEDIATE` + tombstone 先写 + 对账 |

若仍要桥侧存储（通路 C），参照= tombstones 模式（每 sid 一文件、atomicWrite、定长滚动）。

### 3.4 前端 history 渲染点（审查 UI 挂点）

- `openSession` **:1069-1091**：subscribe(:1076) → `rpc2('session/load')`(:1082) → then(:1083) `endStream()+setBusy(false)`；失败还原现场(:1084-1090)。
- `onAgentEvent` **:1491-1497**：session/update 路由器。:1494 `agent_message_chunk`→`addMsg(text,'agent')`；:1495 `user_message_chunk`→`addMsg` + **`el.dataset.gmid`**（回放帧双冗余 messageId 挂元素——**这就是审查 UI 的挂点先例**：thought 同样可按 msgId 挂到对应 assistant 消息元素上）；:1496 `agent_thought_chunk`→`thoughtFeed`。
- `addMsg` **:1324-1336**：追加 `div.msg.<who>`；agent 消息流式进 `streamEl`（dataset.live=1）。
- `endStream` **:1341-1345**：直播消息定稿（`mdRender` + `msgButtons`）——持久审查入口（如消息内折叠条）在此或 :1494 挂靠最顺。
- 消息结构：`div.msg.agent` + `dataset.live` + （user 侧）`dataset.gmid` + 操作条 `msgButtons()`。

### 3.5 体量事实与磁盘估算

**单回合思考体量**（决定 UI 截断与存储上限）：

| 样本 | 帧数 | 字符数 | 备注 |
|---|---|---|---|
| s105 活体（glm-5.3-flash，49 字 prompt） | 30 | 80 | 首帧 +8.5s |
| s104 实证（glm-5.3-flash，61 字 prompt） | 1426 | 507 | 首帧 6.8s，effort='' |
| 20260921_205 回放（deepseek-v4.1-flash） | — | 577 | 单块 |
| 全库 1301 块分布 | — | p50=227 / p90=719 / p99=2127 / **max=13088** | 均值 357 字符/块 |

**会话级**：247 个有思考会话均值 1874 字符；最大单会话 29,345 字符（20260830_13）。思考占全库 messages 文本量 5.2%（0.46MB / 8.87MB）。

**磁盘估算（若桥自建留痕，通路 C）**：本机 6 周真实使用积累 464,629 字符 ≈ 原始 0.5MB（UTF-8 英文思考约 1 B/字符，中文 3 B/字符，加 JSONL 包装翻倍也在 1-2MB 量级）——**增长引擎极慢**。建议上限（若做）：**每回合截断 32KB**（对齐前端 THINK_BUF_MAX 尾窗口径，且为实测最大块 13KB 的 2.4 倍——实际不会触发）；**每会话滚动 512KB**（实测最大会话 29KB 的 17 倍）。但注意：goose 侧已经存了同一份（无新增成本），桥再存=双写，只有当桥要存「直播逐帧原文（含被 goose 合并前的碎片）」或「goose 1.46 等不落库形态」时才有增量价值——现行栈无此需求。

## 4. 设计三通路对比

### 通路 A：goose 原生回放直用（推荐）

- **做法**：前端把回放期的 `agent_thought_chunk` 帧（:1496）按 messageId 缓存，挂到对应 assistant 消息元素（挂点先例 :1495 dataset.gmid；渲染定稿 :1341 endStream），openSession 不再把它们丢进 thinkBuf→discard；直播期维持现面板不变（或直播结束也落挂）。
- **前提**：Q1/Q2 已双双 VERIFIED-RUN——即插即用；历史会话（2026-08-19 起 247 个带思考会话）即刻可审查。
- **风险**：① 帧序依赖——thought 帧先于其正文帧到达（三例实证），缓存-挂靠逻辑要按 msgId 配对而非按相邻性（20260819_10 例：thought 与正文中间隔着 tool_call）；② 回放是「块全文一次到帧」，直播是逐 token 微帧——两态消费要统一（前端已类似处理正文流式）；③ `RedactedThinking` 不回放（§2.2-5，现行栈不触发）；④ 回放无 stop 帧语义，需以 load 完成（:1083）为收口（现有代码已如此）。
- **改动面**：仅 `chat.tpl.html`（onAgentEvent 分支 + openSession 收口 + 消息元素挂靠渲染），估计 30-60 行；桥/goose/sessions.db 零改动。R1-R4 面：新 UI 元素属「assistant 消息内部折叠件」，同域不同层，参照工具卡（toolCard）先例；母句要改（现「收起后不留在对话里」的承诺与留痕冲突——这是**产品语义变更**，需主控拍板措辞）。

### 通路 B：桥读 sessions.db 补发

- **做法**：openSession 时桥在 load 回包/回放流里补发库内 thinking（或前端按需 rpc 查询）。
- **前提/风险**：完全多余——goose 回放已含同样数据（Q2）；桥再查库补发=同帧双份+顺序竞争（补发帧与原生回放帧的交错顺序不受控）。唯一价值场景=goose 升级后回放行为变化时的兜底，属应急通路。
- **改动面**：桥 +30 行（sessionMeta 先例 :709）+ 前端消费——**不推荐**。

### 通路 C：桥自建留痕（直播帧旁路落盘）

- **做法**：桥在 :1544-1547 转发点加 `agent_thought_chunk` 分支，按 sid 落 JSONL（tombstones 模式 :4718-4731）。
- **前提/风险**：双写 sessions.db（同一数据两处存，删会话/撤回重写时两处都要动——rollbackRewrite 只删库行，桥文件会留**已撤回内容**，违反 G6「删除内容不复活」红线，除非同点联动清理）；唯一独有价值=保存「直播逐帧原文」与 goose 无关的独立留存。
- **改动面**：桥 +50 行（含 schema 版本号与迁移义务，ADR-0009）+ 前端消费 + 撤回/删除联动——**改动面最大，红线风险最高，不推荐**。

## 5. 遗留与注意

1. **sid 复用提示（s76 家族）**：测试会话 20260929_3（goose 当日最新号）已走桥 `delete_session` 通道删除（回执 session_deleted，库内 sessions/messages 行=0；无工作区绑定，workspace-map 无该 sid）。若桥 goose 时钟仍在 09-29 日内，下一次 `session/new` 会按 当日_MAX+1 复用 20260929_3——桥已有 flushPendingCloses + 首轮 prompt Session-not-found 救援（research/18 断点①加固），无需处置；若用户首条消息报「这一轮没能完成」，重发即自愈。
2. **模型差异**：思考留痕覆盖面=「该回合上游真出 reasoning 的会话」。现行栈 glm-5.3/glm-5.3-flash 净线有帧（research/47 + 本活体）；deepseek-v4.1-flash 大多数存量会话无 thinking（旧中继掐流期产物）。审查 UI 必须诚实处理「这回合没有思考」——对齐现面板「无帧不出现」口径，不造假。
3. **母句变更义务**：面板现承诺「收起后不留在对话里，对话只留正式回答」（chat.tpl.html:374）。持久留痕落地=承诺改写（R1 母句三问），需主控拍板新母句后再动 UI。
4. **本文件零改动面**：全程只读取证（forge/conf/templates/ 未动、桥/前端未动、无重启、无回归）；仅 tmp/ 新增探针 3 支 + goose v1.50.0 源码树（39MB）。
