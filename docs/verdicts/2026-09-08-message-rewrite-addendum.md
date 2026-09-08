# 补篇裁决：真正的消息撤回重写（主线 5 定案）

- 日期：2026-09-08（batch2 同日补篇）｜ 决策人：pf-pm ｜ 输入源：research/21（本日 22:40 收口，VERIFIED-RUN）+ batch1 §4（「取回修改」裁决与红线）+ batch2 §6（框架）
- 结论先行：
  - **交互形态=B 型（从 user 行截断到尾），C 型永久否决**。撤回的是「轮」不是「条」：该轮及其后全部内容（turn-context、assistant 回复、工具行）从会话史消失，改写发送后历史=改写轮，视图重放与模型上下文一致。验收线写死 ChatGPT 式回滚语义；「取回修改」与错误卡自动重发红线零触碰，三入口共存。
  - **手术安全=七步协议**：busy 门（桥侧权威）→ session/close（失败即中止）→ BEGIN IMMEDIATE → SELECT 被删行（零命中即中止，不猜边界）→ tombstone 先写（atomicWrite，失败即回滚）→ DELETE+rowcount 对账 → COMMIT+广播刷新。恢复路径=修复脚本 INSERT 回，非用户功能。
  - **message_id 方案=A（桥透传 meta.goose.messageId+前端持有）**：桥零持久状态、前端存取两处小改、message_id 是 DB 一等列——变更成本斜率最低。回放帧是否携带该 meta 属 UNVERIFIED，实施批第一步验证；证伪则退化为「桥旁路记录序数映射」，边界解析协议不变。
  - **边界写死**：多客户端=广播刷新+最终一致，不做冲突检测；usage 累计列不修；extension_data/归档索引/workspace-map 零改动（sid 不换号）；制品/文件系统不回滚（/api/vcs 兜底）。
  - **实施=独立批**（五线批之后），内含桥/前端/e2e 三步；**开工前置=v1.46→实际部署版本复核门**（research/21 实验矩阵 CTL/B/RB/NEG 复跑全绿），非本补篇前置。
- 关联：research/21 §2-§4 ｜ batch1 §4.2-5/§4.4（红线与测试面）｜ batch2 §6/§7 切片五 ｜ ADR-0006（手术对象是 goose 的库，但走桥侧裸 SQL 先例=delete_session s75，非二开）｜ s15 atomicWrite 纪律 ｜ STATE goose 升级窗口裁决（09-09±3 / v1.48 评估）

## 0. 前置事实（全部已验证，引自 research/21）

| # | 断言 | 依据 |
|---|---|---|
| G1 | 手术 sessions.db+session/load 全产品序列（close→手术→load→改写 prompt）同进程端到端跑通，含 117 行工具密集真实会话中段截断 | 实验 RB/LIVE-D（VERIFIED-RUN） |
| G2 | B 型谓词 `(created_timestamp,id)>=boundary` = goose truncate_conversation_from_message 同款（:2472-2474 逐字），删后上下文=前轮+改写文，无残留无重复 | 实验 B/RB |
| G3 | C 型（只改 user 行文本）load 可行但下方回复残留=回复对应不存在的问题；A 型（只删 user 正文行）残留孤儿 turn-context——均语义脏 | 实验 A/C |
| G4 | 官方截断通道不存在：session/fork 的 conversationBefore meta 被 schema 校验层剥离（判别实验 FORK-D），手术 DB 是唯一路径；桥有同表裸 SQL 先例（delete_session :3033-3038） | §4 结论 |
| G5 | 坏行砖会话：一行坏 content_json → load 报「Session not found」（误导文案）；B 型纯 DELETE 不改行内容，砖险主要来自边界错删与并发写 | 实验 NEG |
| G6 | close 过的 sid 被 load 复活（load 清 closed_session_ids）；compaction 的 replace_conversation 会全量重写内存会话——手术前必须 close 回收 Agent | RB + agent.rs:2119 |
| G7 | 桥已具备：对 sessions.db 的 SQL 通道、rpc2 直通 session/load、前端 openSession 刷新通道 | §4 联动面 |

## 1. 交互形态定案：B 型

### 1.1 裁决

1. **B 型（从 user 行截断到尾）**。「撤回重写」作用于一条 user 消息：以该行（含同秒 turn-context 行，G2 谓词天然覆盖）为边界，边界及其后**全部**删除；改写发送=普通 prompt 追加。撤回的是「轮」不是「条」——**「只改我那句话、保留它下面的回复」永久否决**（G3：回复对应不存在的问题，模型上下文语义脏）。
2. **撤回首条（U1）允许**——第一句就说错是合法诉求。边缘：撤回后该 sid messages 零行，空会话 load 行为 UNVERIFIED，实施批补一条空会话 load 探针；若证伪砖会话，降级为拒绝撤回会话内唯一 user 轮+人话「这是唯一一轮，开新对话更干净」。
3. **验收线（写死）**：撤回某轮 user 消息 → 该轮及其后全部内容从会话史消失 → 改写发送后，openSession 重放与模型上下文（假 provider 回显探针）**一致呈现改写后形态**：无原句、无追加痕迹、无重复轮。
4. **三入口共存（红线零触碰）**：错误卡「换备用线路再试」自动重发（s50e/f/s51c）逐位不动；「取回修改」=不改历史的轻量路径，行为与既有断言不动；「撤回重写」=历史手术路径。复制/取回修改/撤回重写三钮语义不重叠（复制=拿文本；取回=改了再说不动历史；撤回=连历史一起改）。撤回重写只挂 **user 消息**操作条（撤回的是用户自己的话）。

### 1.2 用户操作流

user 消息操作条点「撤回重写」→ 行内二次确认（「撤回这条及之后所有来回？」→「确认撤回」，对齐主线 1 删除二次确认与会话首删提醒先例精神；撤回删的是一整段尾部，必须有一道闸）→ 桥七步协议（§2）→ 收回执 → 前端清空聊天区+重跑 openSession(sid)+**预填原文进输入框+聚焦+不自动发送**（复用「取回修改」载入逻辑；预填覆盖既有草稿不确认，batch1 §4.2-3 同判据）→ 用户改完发送=普通 prompt。

## 2. 手术安全设计定案（七步协议）

桥新增 WS 消息 `rollback_rewrite {sessionId, messageId}`（messageId 形态见 §3），处理序：

1. **busy 门（桥侧权威）**：该 sid 存在活动请求（prompt/流式未收尾）→ 拒绝+人话「这一轮还在进行中，等它做完再撤回」。前端按钮 busy 态只是 UI 预防，桥拒绝是权威门（双客户端场景前端门不可信）。
2. **await session/close(sid)**：回收 Agent，防内存态经 compaction replace_conversation 复活已删内容（G6）。close 失败 → **中止**+人话错误，不降级裸做手术。
3. **BEGIN IMMEDIATE 事务**；按 message_id 查边界行（`SELECT id, created_timestamp FROM messages WHERE session_id=? AND message_id=?`），再 SELECT 谓词 `(created_timestamp,id)>=边界` 的全部被删行。**边界行不存在或被删行数为零 → ROLLBACK+人话错误——不猜边界**。
4. **tombstone 先写**：被删行全列（id/message_id/session_id/role/content_json/created_timestamp/metadata_json）按原 id 序写 `data/rewrite-tombstones/<sid>-<序号>.jsonl`（每次手术独立文件，atomicWrite，非 append）。**写失败 → ROLLBACK+人话**（tombstone 是 DELETE 的前置条件，fail closed）。
5. **DELETE 同谓词**；`changes()` ≠ SELECT 行数 → ROLLBACK+人话（对账防并发插行错删）。
6. **COMMIT** → 回执 `{ok, removed:n}` → 向**所有**订阅该 sid 的 WS 客户端广播刷新指令。
7. 前端收回执/刷新指令 → §1.2 操作流后半段。

**tombstone 保留策略**：每 sid 最近 3 次手术（keep-3，对齐 pre-upgrade 备份先例），新文件写入后裁剪超额旧文件。**无 UI、无「撤销撤销」功能**——恢复=修复路径：`tools/` 脚本（或桥内部 op）读 tombstone → 事务内按原 id 序 INSERT 回 → load 验证；触发条件=用户报告+qa 发现，不是常规操作。定位是保险与审计，不是产品能力。

**失败恢复路径（对应用户可见语义）**：任一步失败 → DB 未被触碰（事务回滚）或 tombstone 孤儿文件（无害，下次该 sid 手术覆盖序号）→ 前端收人话错误 → 重跑 openSession 恢复原视图（close 过的 sid 可 load 复活，G6；视图即原史）。

## 3. message_id 透传方案定案：A（桥透传+前端持有）

### 3.1 裁决与理由

**选 A：桥在转发 session/update 时透传 `meta.goose.messageId`，前端把它存在每条 user 消息上，rollback_rewrite 回传 messageId，桥按 message_id 列查边界。**

变更成本斜率判据：
1. **桥零持久状态、零内存索引、零重建逻辑**——方案 B（桥自维护 sid→行号索引）必须处理桥重启丢索引（重建=重放 load 或 DB 查询复制 goose 的 userVisible 过滤），复杂度常驻；A 的映射住在前端 DOM/状态里，桥重启天然无损。
2. **message_id 是 DB 一等列**（G 系实验的 join 键），边界解析=一条索引查询，不依赖过滤逻辑复制——B 的 DB 重建变体要复刻 goose 的 userVisible 过滤，过滤漂移=**删错行**的静默风险，错误代价远高于 A 的透传耦合。
3. 前端已有同构先例：工具卡按 toolCallId 关联（research/19 §1.2）——给 user 消息挂 id 是模式复制，前端改动=一处存+一处发。
4. 回放与直播走同一转发路径（G7），透传一次改动覆盖新旧消息，无迁移面。

### 3.2 验证义务与证伪退化（写死）

- 回放帧（session/load 重放的 user_message chunk）是否携带 `meta.goose.messageId` 属 **UNVERIFIED**（工具帧 `_meta.goose` 已证实存在，research/19 真帧 #1；user 文本帧未抓证）——**实施批第一步=真会话 openSession 抓帧验证**（30 分钟量级）。
- **若证伪**（回放帧无该 meta）：退化为「桥旁路记录」——桥逐帧转发时顺手把 user 消息的（若帧内确无任何 id 则按转发序计数）sid→序数映射记在内存，前端回传「倒数第 k 条 user 消息」，桥查内存映射定边界；映射缺失（桥重启后未重开该会话）→ 人话「先重新打开这个对话再撤回」（重开即 load 重放=映射重建）。**边界解析协议与七步协议不变**，只有「谁持有映射」换位。不做第三方案（文本匹配定位：重复文本歧义，否决）。

## 4. 联动边界写死

| 面 | 定案 |
|---|---|
| 多客户端 | 手术成功 → 广播刷新指令给所有订阅该 sid 的客户端 → 各自重跑 openSession，最终一致。**不做跨客户端手术冲突检测**（单机单用户，妻子场景无并发；busy 门按 sid 全局拦截在飞请求已覆盖实质冲突） |
| usage 累计列 | **不修**：accumulated_* = 历史用量语义，撤回不退款；total_* 继续增长。SQL 断言手术前后该行累计列逐位不变 |
| extension_data / 归档索引 / workspace-map | 键=sid，B 型保留原 sid → **零改动** |
| 制品与文件系统 | **不回滚**：与「取回修改」一致；文件侧版本由 /api/vcs（🕘时间线）兜底。撤回重写只手术会话史 |
| 模型上下文 | =手术后的 DB（load 全量重放，G1/G2 已证），无独立同步面 |
| 红线 | 错误卡自动重发+「取回修改」行为与既有断言（s50f-assert 三条、batch1 §4.4）零触碰 |
| 并发写 | busy 门+close 已消本 sid 写者；跨 sid 写者与 DELETE 谓词（WHERE 含 session_id）不相交；WAL+busy_timeout 30s 兜底锁竞争 |

## 5. 实施切片与验收

**一个独立实施批**（排在 batch2 切片一至四之后；桥+前端+e2e 是完整批次量，research/21 结论 1），内三步+一前置：

| 步 | 内容 | 依赖 |
|---|---|---|
| 前置 0 | §3.2 抓帧验证 message_id；v1.4x 复核门（§6） | — |
| 步 a | 桥：rollback_rewrite 处理器（七步协议）+messageId 透传（或旁路记录）+tombstone 写清理+刷新广播 | 前置 0 |
| 步 b | 前端：user 消息操作条「撤回重写」+二次确认+回执处理（清区→openSession→预填不发送） | a 的协议定义 |
| 步 c | e2e 18c 节+GUI 断言+tombstone 恢复演练脚本 | a+b |

**验收标准：**

1. **e2e 18c（探针形态，假 provider 沙盒）**：seed 3 轮会话 → rollback_rewrite(U2) → 断言 DB：U2 轮行（正文+turn-context+回复）消失、U1 轮原样 → session/load 重放无 U2 原句 → prompt 改写文 → 假 provider 回显上下文=U1+改写文（无 U2 原句、无重复）→ 会话全程不砖。
2. **手术失败可恢复分支**：注入失败（tombstone 写失败/边界 message_id 不存在/锁竞争）→ DB 行数与内容逐位原样 → 人话错误回执 → openSession 恢复原视图。
3. **tombstone 恢复演练**：恢复脚本 INSERT 回 → load 恢复原史（探针回显含原句）；keep-3 裁剪断言（种 4 次手术，第 1 个文件被清）。
4. **busy 门**：流式中发起 → 桥拒绝+人话；流式收尾后发起 → 成功。
5. **GUI 断言**：user 消息操作条出现「撤回重写」（agent 消息不出现）；二次确认两步；收回执后聊天区重绘=改写机会话（历史显示=改写文本、**无追加痕迹**、无重复轮）；输入框预填原文+聚焦+**未触发发送**（无 ws send 断言）。
6. **红线回归**：s50f-assert 三条原样绿；「取回修改」断言不降线；错误卡换线自动重发不回归。
7. **边界**：手术后工作区文件 hash 不变；usage 累计列 SQL 断言不变；双 WS 订阅同 sid，一端手术另一端收刷新重拉一致（e2e 或人工一次）。
8. e2e-chat（+18c）/fuzz 全绿不降线。

## 6. 升级窗口前置（实施批开工门）

**v1.46→实际部署版本的 messages 表/load 行为差异复核=实施批开工前置条件**（不是本补篇前置——补篇是产品判断，与目标版本解耦；实施锚定的是将要部署的 goose）。

1. **必查面**（锚 research/21 全部结论于 v1.46.0）：messages 表 DDL（列名/类型/秒级时间戳/自增 id 语义）；get_conversation 排序谓词与严格解析行为；load 对 closed/空会话语义；fork meta 剥离是否放行；compaction replace_conversation 行为。
2. **过门方法**：research/21 实验矩阵 **CTL/B/RB/NEG 四项在目标版本沙盒复跑全绿** = 过门（基建 tmp/pfr21 可复跑，fake provider 离线确定性）。
3. **形态级风险（唯一）**：若上游版本把 fork 的 conversationBefore 放行 → 官方截断通道出现，但形态=分叉新会话（sid 换号，workspace-map/归档要跟着迁）≠ 原地回滚——**届时本裁决交互形态重开归约**，其余安全设计仍适用。
4. 与 STATE 既有升级窗口裁决联动（09-09±3 未发 v1.50 则评估 v1.48.0）：升级预案（research/04 playbook）新增本必查项；**实施批若在升级后开工，先过门再动工**。

## 7. 明确不做

- **C 型原地改写 / 只撤单条不撤轮**：G3，回复对应不存在的问题；永久否决。
- **官方 fork 分叉路线**：meta 被剥离不可达（G4）；上游放行再归约（§6-3）。
- **tombstone 用户 UI /「撤销撤销」**：恢复=修复路径非产品能力（§2）。
- **跨客户端冲突检测**：单机单用户（§4）。
- **usage 回改 / 制品回滚**：语义与兜底既有归属（§4）。
- **「取回修改」并入本功能**：两任务两入口（不改历史的轻量 vs 历史手术），batch1 §4.1-3 同款判据。
- **文本匹配定位消息**：重复文本歧义（§3.2）。

## 8. 成功指标与 STATE 同步

- 用户复验「重发后历史还是旧的/出现两条」批评消解（他点的形态=历史显示改写文）；护航期「撤回后历史不对/会话打不开」反馈=0。
- 手术失败回执可观测（e2e 18c 失败分支常驻）；tombstone 恢复脚本演练一次入档。
- STATE：主线 5 从「框架（batch2 §6）」更新为「补篇已出 docs/verdicts/2026-09-08-message-rewrite-addendum.md，B 型+七步协议+透传 A 案定案；实施批排五线批后，开工前置=v1.4x 复核门」；docs/verdicts/README.md 登记；升级 playbook 补必查项。
