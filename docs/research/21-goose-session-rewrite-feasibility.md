# 21. 「真正的消息撤回重写」goose 层可行性取证（2026-09-08）

日期：2026-09-08 21:50-22:40（本机实验窗口）｜取证研究员会话
任务背景：s76 已落「取回修改」（a3b47d0，裁决 docs/verdicts/2026-09-07-user-six-lines-batch1.md §4，当时 §4.5 明确不做编辑回滚，触发器 §5-T3=真机诉求≥2 次+PM 重新归约）。用户今日要求**重发后历史显示为改写后的消息，而非追加**。本文回答：goose 层（v1.46.0 AAIF 构建）支不支持、怎么支持、桥要动多少。
环境：goose.exe=forge/bin/goose/goose-package/goose.exe（v1.46.0，与 tmp/goose-src tag v1.46.0 源码对应）；实验沙盒=tmp/pfr21/（一次性，未触碰 forge/conf/goose 活体、forge/data/、C:\PocketForge-Test）；假 provider=本地 127.0.0.1:18321 OpenAI 兼容 SSE 服务器（离线、确定性）。

## 结论（先行）

1. **可行性档位：(b) 可实现但需独立批**。goose 层无阻断：手术 sessions.db + session/load 的完整产品序列（close→手术→load→改写后 prompt）已在**同一 goose 进程内**端到端跑通（实验 RB，VERIFIED-RUN），含工具调用密集的真实会话副本（实验 LIVE-D）。之所以不评 (a)：需要 PM 按 T3 重新归约交互形态（truncate-重发 vs 原地改写）、失败回滚（备份/恢复）与多客户端语义，且桥+前端+e2e 改动面是一个完整批次的量，不是一行 diff。
2. **存储真相（勘误任务前提）**：v1.46.0 会话**不是 JSONL**，是 SQLite（WAL）：`<GOOSE_PATH_ROOT>/data/sessions/sessions.db`，表 `sessions` + `messages`（schema 见 §2，源码 session_manager.rs:998-1050 DDL，活体只读实查一致）。legacy JSONL 仅在新库首建时一次性导入（import_legacy，:955）。
3. **session/load = 全量重放**：从 messages 表按 `(created_timestamp 秒, 自增 id)` 序读全部行、serde 严格解析 content_json、过滤 userVisible 后逐条 chunk 重放给客户端，并作为后续 prompt 的完整模型上下文（load_session.rs:269-329 + get_conversation :1816-1852）。**没有任何校验阻止手术后的历史**——删行/改行后 load 照常工作，模型上下文即手术后的形态。
4. **官方编辑/截断路径盘点**：goose 内部有 `replace_conversation`（全量重写，compaction 在用）与 `truncate_conversation`（按时间戳 DELETE）原语，但 **ACP 对外只有 `session/fork` 一条**，且其截断参数 `meta.conversationBefore` 被协议 schema 校验层**剥离**（判别实验 FORK-D：字符串型 meta 按源码必报 invalid_params，实测无错=meta 根本没到 handler，fork 退化为整份复制）。**结论：无官方截断通道，手术 DB 是唯一路径，且该路径已被产品先例背书**——桥的 delete_session（s75）就是在同一张表上裸 SQL 硬删。

## 1. 证据分级索引

| 断言 | 等级 | 来源 |
|---|---|---|
| 存储为 SQLite 而非 JSONL；路径/表结构/秒级时间戳 | VERIFIED-RUN | 活体只读查询 + 沙盒 DB + 源码 session_manager.rs:930-1050 |
| content_json 严格解析：一行坏 JSON→整个会话 load 失败，报「Session not found」（误导性文案） | VERIFIED-RUN | 实验 NEG；源码 get_conversation :1838 `?` 透传 + load :283 map_err 吞因 |
| load=全量重放进模型上下文 | VERIFIED-RUN | 实验 CTL（探针经假 provider 回显其收到的 messages） |
| 删最后 user 行（变体A）：load 正常，上下文无该文；但孤儿 turn-context + 悬空 assistant 回复残留 | VERIFIED-RUN | 实验 A |
| 从 user 行截断到尾（变体B，goose truncate_from_message 同款谓词）：干净回滚 | VERIFIED-RUN | 实验 B + RB + LIVE-D |
| 原地改写 user 行文本（变体C）：load 后重放与上下文均为改写文 | VERIFIED-RUN | 实验 C |
| 同进程 close→手术→load 同 sid→改写 prompt 全链 | VERIFIED-RUN | 实验 RB（rows 7-9 消失、10-12 为改写轮，无重复） |
| session/fork 整份复制可用；conversationBefore meta 被剥离、截断不可达 | VERIFIED-RUN | 实验 FORK + FORK-D 判别（字符串 meta 无 invalid_params）+ 源码 fork_session.rs:79-93 |
| 工具行（toolRequest/toolResponse/thinking）会话的中段截断 load 正常 | VERIFIED-RUN | 实验 LIVE-D（117 行真实会话副本删 57 行） |
| 桥先例：对 sessions.db 裸 SQL 删除 | VERIFIED-DOC | chat-bridge.tpl.js:3033-3038（delete_session） |

## 2. 存储格式（取证细节，VERIFIED-DOC 源码 + RUN 实查）

- 路径：`Paths::data_dir()` 尊重 GOOSE_PATH_ROOT（config/paths.rs:8-12）→ `<root>/data/sessions/sessions.db`（SESSIONS_FOLDER/DB_NAME，session_manager.rs:28-29）。WAL 模式，busy_timeout 30s（:920-925）。
- `sessions` 行：id（`YYYYMMDD_N`）、name、session_type（acp 会话= 'acp'）、working_dir、goose_mode、extension_data、usage 累计列、parent_session_id 等（:998-1028）。
- `messages` 行：`id` 自增主键、`message_id`（goose 侧 UUID）、`session_id`、`role`（user/assistant）、`content_json`（**MessageContent 数组**：`{"type":"text","text":…}` / `thinking` / `toolRequest{id,toolCall…}` / `toolResponse{id,toolResult…}` 等）、`created_timestamp`（**秒**）、`metadata_json`（`userVisible/agentVisible/turnContext` 等）。
- 每轮 prompt 产生 3 行：user 正文（userVisible:true）+ user turn-context（userVisible:false,turnContext:true，含工作目录/时间，**会发给模型**）+ assistant 回复（可多行，工具轮 toolRequest/toolResponse 各成块）。同秒按自增 id 定序（get_conversation :1822 注释明示）。
- 读回：`get_conversation` 按 (created_timestamp,id) 序、`serde_json::from_str` 严格解析 content_json（坏行=Err）、未知 role 字符串**静默跳过**（:1832-1836）——改 role 为怪值不会报错但会丢消息，不作为依赖面。

## 3. 实验矩阵（全部 VERIFIED-RUN，2026-09-08，沙盒 tmp/pfr21）

复现基建（全部可重跑）：
```
node tmp/pfr21/fake-openai.js            # 假 provider（记录每个请求的 messages 到 provider-log.jsonl）
node tmp/pfr21/acp-driver.js seed <root> # 建 3 轮会话（U1 石榴红/U2 煤球/U3 杭州）
node tmp/pfr21/surgery.js <op> <root> <sid> [text]  # dump/last-user/del-user-only/del-from-user/rewrite-user/corrupt-user
node tmp/pfr21/acp-driver.js loadprompt <root> <sid> <探针>  # session/load + prompt + 报告
node tmp/pfr21/acp-driver.js rollback <root> # 单进程全产品序列
```
探针设计：假 provider 把 goose 发来的 messages 原文回显（PROBE_PREV=上一条 user 原话；PROBE_ALL=全部 user 原话）——「模型上下文」是直接观测的请求载荷，不靠转述。

| 实验 | 操作（单变量，均自 pristine 副本） | 结果 |
|---|---|---|
| CTL | 无手术 load+probe | 重放含 3 轮全部 user 文本；上下文=3 轮+turn-context+探针，逐字吻合 |
| A | 只删最后 user 正文行 | load 正常；重放与上下文均无「杭州」句；**但该轮 turn-context 与 assistant 回复残留**（上下文里 PREV=孤儿 turn-context）——语义脏，不推荐 |
| B | 从该 user 行起全删（`(ts,id)>=boundary` 谓词，=goose truncate_conversation_from_message :2472-2474 逐字同款） | load 正常；上下文=U1+U2；「上一条 user 原话」=U2（煤球）——**正是 ChatGPT 式回滚语义** |
| C | UPDATE 该行 content_json 为改写文 | load 后重放=改写文；上下文 PREV=改写文逐字；原句不残留；后续 prompt 不回写旧文 |
| NEG | 该行 content_json 改坏 JSON | load 直接 error「Session not found: …」——**一行坏数据砖掉整会话且文案误导**；手术必须事务化+可恢复 |
| FORK | session/fork + meta.conversationBefore=U3 时间戳 | 新 sid=整份复制，**未截断** |
| FORK-D | meta.conversationBefore='NOT_AN_INT'（判别） | 按源码必 invalid_params；实测成功复制=**meta 在 schema 校验层被剥离，根本没到 handler** |
| RB | 单进程：new→3轮→close→node:sqlite 手术(B 型)→load 同 sid→prompt 改写文→probe | 全绿：行 7-9 消失（rowid 跳号，无害）、改写轮=rowid 10-12；上下文=U1+U2+改写文，无原句无重复；close 过的 sid 被 load 复活（load 会清 closed_session_ids，load_session.rs:327） |
| LIVE-BASE | 活体快照（VACUUM INTO 只读）117 行工具密集会话 load+probe | 正常重放+上下文吻合 |
| LIVE-D | 同快照从第 60 行（工具流量中段）截断 57 行后 load+probe | 正常；上下文=剩余 60 行；**严格解析跨 toolRequest/toolResponse 行无恙** |

单变量纪律说明：每变体独立 root 副本；假 provider 全程同一实例（唯一差异=手术内容）；LIVE 系有一次探针污染失误（基线 probe 落进了副本）已用干净快照重做（LIVE-D）。

## 4. 桥侧联动面盘点（若走「手术 DB + session/load」）

已有事实（代码定位）：
- 桥**已在**对 sessions.db 裸 SQL 删行（delete_session，chat-bridge.tpl.js:3033-3038），手术同类操作有生产先例。
- 前端 openSession 已走 `rpc2('session/load')`（chat.tpl.html:836-839）经桥 rpc 直通到 goose——**手术后的视图刷新通道现成**：桥做完手术后让前端重跑 openSession(sid) 或桥主动发一帧刷新指令即可。
- PG 三表=usage_daily/forge_archive_index/forge_workspace_map（PG_MIGRATIONS :181-184）——**不含消息行**，消息手术无 PG 同步负担。
- 归档索引/workspace-map 键=sid：回滚**保留原 sid**（B 型不换号），两表零改动。

改动面清单（B 型=推荐形态）：
1. 桥新增 WS 消息 `rollback_rewrite {sessionId, boundaryMessageId 或前端消息序}`：busy 门（对齐 openSession 前端 busy 护栏）→ `session/close(sid)`（回收 Agent，防内存态经 compaction replace_conversation 复活已删内容——agent.rs:2119 compaction 即全量重写）→ 事务手术（备份被删行到 tombstone 文件 → DELETE 谓词同 B）→ 回执。
2. 前端：消息操作条「取回修改」旁新增「撤回重写」（或改造语义）：调 rollback → 收回执后清空聊天区+重跑 openSession(sid) → 输入框预填原文（复用现取回修改逻辑）→ 用户改完发送=普通 prompt。
3. e2e：18c 节「撤回重写」钉子（手术→load 重放断言历史无原句→prompt→回文；NEG 防御=手术失败必须可恢复且不砖会话）。
4. 升级预案（research/04）新增必查：v1.46→v1.49 messages 表结构/时间戳语义/load 行为差异（本轮实验全部锚定 v1.46.0；v1.49 源码未复核此面）。

风险与注意：
- **坏行砖会话**（NEG）：手术必须 BEGIN IMMEDIATE 事务 + 预备份被改行；失败回滚原行。恢复路径=把备份行 INSERT 回去。
- **同秒边界**：谓词用 `(created_timestamp,id)` 二元组（goose 同款），无同秒误删风险；但 boundary 必须取自 user 正文行的 message_id/rowid，前端消息需带可定位标识（现前端消息无 goose message_id 映射——**桥需在转发 session/update 时透传 meta.goose.messageId 并由前端保存**，或桥自己维护 sid→消息行号索引；这是改动面里最大的一块）。
- **usage 累计漂移**：删行不动 sessions 行的 token 累计列（accumulated_* 语义=历史用量，保留合理；total_* 会继续增长）——记录不修。
- **多客户端**：另一订阅者会在前端重跑 openSession 时看到新历史；手术瞬间若恰有 prompt 在飞（busy 门应拦）。
- **extension_data/工作区制品不回滚**：与现「取回修改」一致——文件侧版本由 /api/vcs 兜底，不在本面。
- **撤回的是「轮」不是「条」**：B 型删到轮尾（含 assistant 回复与工具行）。若产品要「只改我那句话、保留它下面的回复」=C 型，但那会让上下文里回复对应不存在的问题（实验 A 证明残留形态），不建议。

对照 s76 裁决书 C 节：本方案不动「取回修改」现有行为与错误卡自动重发红线；「取回修改」保留为不改历史的轻量路径，「撤回重写」为新会话史手术路径——两者共存，红线零触碰。

## 5. 遗留

1. v1.49.0 的 sessions schema/load 行为未复核（升级窗口临近，按 §4-4 入预案）。
2. fork 的 meta 剥离点未定位到 agent-client-protocol-schema 1.0.1 源行（本机无 cargo registry；二进制判别实验已足够定论）。若上游后续版本把 conversationBefore 放行，可替换手术路径为官方 fork——形态从「原地回滚」变「分叉新会话」，交互语义不同（sid 换号，workspace-map/归档要跟着迁）。
3. 沙盒 tmp/pfr21 保留（30M）供复跑；fake-openai.js 已停。

## 6. s77 前置验证：回放/直播帧的 user messageId（补篇裁决 §3.2 前置 0，2026-09-09，VERIFIED-RUN）

任务：验证 session/load 重放的 user 文本 chunk 是否携带 goose messageId（补篇 §3.2 写死的实施批前置 0）。环境：同 §5 基建（goose.exe v1.46.0 AAIF、假 provider 127.0.0.1:18321、沙盒 root=tmp/pfr21/root-s77）；驱动=新增 tmp/pfr21/frame-capture.js（不改 acp-driver.js），两相分离抓档：直播相（新进程 new+3 轮 prompt+close）与重放相（**另一个全新 goose 进程** load 同 sid）。

### 6.1 结论（先行）

1. **档位=非 A/B/C 原文任一，是 B 的镜像**：**重放帧带且与 DB 全等；直播期根本不发射 user_message_chunk（无帧可谈）**。
   - 重放：3/3 user 文本 chunk 均携带**两处冗余 id**——顶级 `update.messageId` 与 `update._meta.goose.messageId`，两处同值，且逐条等于 sessions.db messages 表该行 `message_id` 列（rowid 1/4/7 ↔ msg_03d55a54… / msg_9d5b6693… / msg_33305348…）。`_meta.goose.created` 亦等于该行 created_timestamp 秒值（帧↔行对应双锚点）。
   - 直播：17 帧全档中 user_message_chunk=0（4 usage_update+1 available_commands_update+9 session_info_update+3 agent_message_chunk）。源码定因（VERIFIED-DOC，v1.46.0 tag）：正常文本轮 reply_impl 只持久化 user 消息、**从不 yield user 事件**（agent.rs:2046-2054 add_message 无 yield；仅斜杠命令早退路径 :2020 yield）；ensure_message_event_id（:1829）只是兜底赋 id，不创造事件。故直播无 user 帧=版本行为，非实验缺陷。
2. **对补篇 §3.2 的意义：退化预案（桥旁路记录）未触发**——其触发条件是「回放帧无该 meta」，实测回放帧有（且字段名实为 `_meta`，与 research/19 工具帧 `_meta.goose` 同形；补篇原文写 `meta.goose` 系字段名笔误，两处 id 同值，读任一即可）。
3. **新发现（实施批需补决策面，本任务只取证不实施）**：直播期刚发出的 user 消息没有服务端帧，前端本地回显的该消息在**下次 openSession（load 重放）之前**拿不到 goose messageId——透传 A 案对「当前视图内直播轮」的边界定位存在空洞（对「重开过会话的消息」全部成立）。补篇 §3.2 的旁路退化方案（按转发序计数）恰好只在这个局部有用武之地；取舍归实施批/PM，不在此裁决。
4. 边缘观察（一行，不构成结论）：直播与重放的 agent_message_chunk 的 messageId=_meta.goose.messageId=provider 响应 id（本沙盒恒为 `chatcmpl-fake`），即 assistant 行 id 取自 provider；user 行 id 恒为 goose 自产 `msg_<uuid4>`（message.rs:1012-1014）。

### 6.2 帧原文（tmp/s77m-replay.jsonl 首条，逐字）

```json
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"20260908_1","update":{"sessionUpdate":"user_message_chunk","content":{"type":"text","text":"s77-U1 石榴红"},"messageId":"msg_03d55a54-96b5-4885-9583-6377889acf7a","_meta":{"goose":{"created":1788897616,"messageId":"msg_03d55a54-96b5-4885-9583-6377889acf7a"}}}}}
```

DB 对照（tmp/s77m-db.json，node:sqlite 只读）：rowid 1, role=user, message_id=msg_03d55a54-96b5-4885-9583-6377889acf7a, ts=1788897616——与上帧两处 id 及 created 逐位相等。

### 6.3 档案与复跑（全部本机 2026-09-09 跑通）

```
tmp/s77m-live.jsonl      直播相原始帧 17 条（含 0 条 user_message_chunk 的反证）
tmp/s77m-replay.jsonl    重放相原始帧 8 条（3 user + 3 agent + 2 杂项）
tmp/s77m-db.json         messages 行 dump（含 message_id/userVisible/turnContext）
tmp/s77m-report.json     自动对照报告（7 项 checks）
tmp/pfr21/frame-capture.js  抓档驱动；tmp/pfr21/root-s77  会话沙盒
复跑：node tmp/pfr21/fake-openai.js（后台）→ node tmp/pfr21/frame-capture.js <root>（直播相，输出 sid）→ node tmp/pfr21/frame-capture.js <root> <sid>（重放相+报告）
```

方法论记录：首轮提取器误读字段名（查 `meta`，线上实为 `_meta`），已修正后从原始帧档重出报告——原始帧档为唯一事实源，教训与 research/19 工具帧先例互证。单变量纪律：直播相与重放相各自独立 goose 进程、帧档分离；假 provider 单实例全程。
