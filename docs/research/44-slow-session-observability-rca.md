# 44 · 「指定模型后慢 + 无过程可见 + 断线异常元素」取证报告

日期：2026-09-25 ｜ 取证人：s103-r1（取证研究员）｜ 环境：dev 栈（PFdrill2，桥 :8790，goose 1.46.0，providers 唯一活跃档「自家中转」 http://111.228.54.166:20128/v1 ）

用户报告原文：「指定模型后，会话响应非常慢，似乎并非空转，但完全不知道在做什么（也不知道思考内容或工具调用)。并且会话框内会出现奇怪的断线等异常ui元素」

事实分级：**VERIFIED-RUN** = 本机活体跑通（带日期）；**VERIFIED-DOC** = 源码/文件核实；**UNVERIFIED** = 未验证。
证据文件：`forge/tmp/s103-r1-wsrec/`（ev-*.jsonl 事件流、raw-*.jsonl 全帧、evidence-console.txt 控制台汇编）。

---

## 结论速览

| 问题 | 一句话结论 |
|---|---|
| Q1 无过程可见 | 桥**不丢帧**（无转发白名单）；是前端把 `agent_thought_chunk` 整族丢弃（chat.tpl.html:1432 `keep silent`）。长思考期 UI 只有「小 forge 正在干活」三点动画。glm 系思考帧全程流式到达前端门口被丢；deepseek 系连帧都没有（中继不下发 reasoning 流）——两层不可见。 |
| Q2 异常元素 | 至少四个独立来源在**会话框内**画异常元素：①健康条 health-bar 直接插进聊天流（探测 8s 超时 vs /models 实测 1.6~9.1s，抖动即闪现）；②S26 正则对**成功回复**的误报（回复含 rate limit/timed out 等词→「服务商不通」💡卡+触发 60s 后健康复检）；③栈/桥重启（dev 期 4~26 次/天，每次全员 ws 断线→顶栏断线点+工具卡翻「失败」）；④删当日最新会话后的 sid 复用竞态（切换模型报「切换失败」⚠卡/首轮救援）。 |
| Q3 慢在哪 | 慢的不是桥：switch_model 201ms、session/new 2.3~3.1s、prompt→首思考帧 8.5~10s（≈上游 TTFB 0.9~6.5s+goose 组装）、llmproxy 零额外延迟（流式逐块、无串行化、无压缩剥除——非别名路径不动 accept-encoding）。**分钟级耗时全部在模型思考期本身**：glm-5.3 上游默认开思考（实测小任务纯思考 32s）；glm-5.3-flash 的能力表默认档是 **max**（官方预置），新会话/无习惯时被 llmproxy 注入 reasoning_effort=max——「指定 flash 想要快」实际仍以最高思考档在跑。 |
| Q4 因果链 | 单一主因果：指定模型→默认思考档高/max→上游长时间只产 reasoning→思考帧要么被前端丢弃（glm）要么根本不存在（deepseek）→用户只见三点动画数分钟；期间任何健康抖动/S26 误报/栈重启就在会话框里画异常元素，叠加成「慢+黑箱+断线」的观感。断线元素与慢是**并列多因**，不是同一根因。 |

---

## Q1 长思考期前端到底显示什么

### 渲染链（VERIFIED-DOC）

- 忙碌视觉只有一处：`#typing`「小 forge 正在干活」+ 3 个点（chat.tpl.html:369，`setBusy` :1218-1220 控制 display）。没有计时器、没有阶段提示、没有进度。
- `onAgentEvent`（:1427-1436）分流：
  - `agent_message_chunk` → 隐藏 typing、流式上墙（:1430）；
  - **`agent_thought_chunk` → `/* keep silent */`（:1432）——思考内容零渲染路径**；
  - `tool_call`/`tool_call_update` → 工具卡（:1433，可见）；
  - `plan`/`available_commands_update` → 忽略（:1434-1435）；
  - `session_info_update`/`usage_update` 是独立 method，onAgentEvent 无分支，静默忽略。
- 桥侧转发**没有内容白名单**：chat-bridge.tpl.js:1469-1472 把所有带 method 的 ACP 帧原样广播给会话订阅者（仅 :1468 humanizeDecline 改写拒绝文案）。任务简报里怀疑的「桥丢/降级子类型」不成立。

### 活体帧实录（VERIFIED-RUN 2026-09-25）

**探针 A（glm-5.3-flash，默认思考档）** `ev-A-flash-default.jsonl`：

```
+0.0s   prompt 发出
+0.0s   session_info_update（回合登记）
+9.3s   usage_update / available_commands_update（goose 回合簿记）
+10.0s  首个 agent_thought_chunk（"Simple riddle question. No tools needed..."）
+12.3s  首个 agent_message_chunk（typing 才隐藏）
+23.5s  stop（turn 结束）
全程 429 帧，其中 thought 90 帧——全部到达前端门口，全部被 1432 丢弃。
```

**探针 B2（glm-5.3 深档，纯推理任务）** `ev-B2-deep.jsonl`：

```
+0.0s   prompt
+8.5s   首个 thought chunk
+8.5s → +40.4s  纯思考期 31.9s：2378 个 thought 帧持续流式到达（零 >10s 间隙）
+40.4s → +60.2s  正文 1882 帧
+60.6s  stop
```

即：真任务 8-12 分钟档里，**分钟级的「黑箱期」内帧一直在流**（glm 系），前端有数据而不渲染。思考内容为英文（模型推理语言），渲染时还需考虑对中文用户的可读性。

**探针 B（deepseek-v4.1-flash）反例** `raw-B-deep-default.jsonl`：全程 **0 个 thought 帧**（agent_message 889 + tool_call 5）。直连上游对照（`evidence-console.txt` §3 补充）：deepseek 两个 effort 档 `firstReasoningMs=null`——**中继对 deepseek 根本不下发 reasoning 流**。此模型的长静默在协议层就无帧可渲染，UI 层修复救不了它，只能靠「进行中」心跳类提示。

### Q1 结论

「完全不知道在做什么」= 前端渲染缺口（glm 系：帧到门口被丢）+ 上游缺口（deepseek 系：无帧）。工具调用本身**是可见的**（工具卡路径正常，探针 B 五张卡全部到达）；不可见的是思考期与「决定调工具前」的规划期。

---

## Q2 「断线等异常ui元素」触发源

### a) 健康条闪现——「会话框内」最贴切的异常元素（VERIFIED-RUN + VERIFIED-DOC）

- 前端 `healthSync`（chat.tpl.html:2410-2441）把 `#health-bar`（class `msg agent info`，**聊天流首行**，:2425 `chat.insertBefore(el, chat.firstChild)`）插进会话框：「现在联系不上大模型服务商，发消息可能没回音…」。
- 桥健康探测（chat-bridge.tpl.js:1280-1296）GET 上游 `/models`，**超时 8s→down**；态变化广播全员（:1310）。
- 实测（2026-09-25 22:55）：`/models` 三连测 **9122ms / 5149ms / 1595ms**——横跨 8s 超时线。探针 A 连接时收到缓存态 `down`（桥 14:40 开机探测曾失败），10s 后复检翻 `ok`——抖动真实发生且会被全部客户端看见（条插入/移除）。
- 叠加：任何 S26 误报（见 b）都会在 60s 后触发一次复检（:1314-1318），复检再撞 8s 线就再翻一次 down。

### b) S26 正则对成功回复的误报（VERIFIED-RUN）

- 桥在 turn 正常结束时对**当轮全文**跑 `/Ran into this error|Server error|rate limit|timed? out|ECONN|fetch failed|could not connect|network error/i`（:1551-1556）；前端 endStream 对**最终正文**跑同款正则并画「💡 看起来是大模型服务商那边暂时不通…」卡+「换备用线路再试」按钮（chat.tpl.html:1291-1316）。
- 活体：fp-probe（`evidence-console.txt` §2）让 flash 正常回答含 "rate limit"/"timed out" 两个短语——回合 9.7s 正常 stop，**stats `errorsByType.upstream +1`、`upstreamByKind.rate +1`**（成功回合被计为上游故障），且 60s 后收到 healthFailDebounce 复检回执帧。前端同一文本必中同一正则→💡异常卡上墙（渲染路径 VERIFIED-DOC）。
- 误报面很宽：讨论超时/限流/网络问题的任何正常回复（用户抱怨「慢」时最常聊到的话题）都会中招。

### c) 断线（顶栏点变非 ok + 会话框内收口元素）的真实触发源（VERIFIED-DOC + 数据）

桥侧对客户端 socket 的 destroy 只有三族（grep 全量核实）：
1. upgrade 时 Origin/key 校验（:4514-4519）——连接期，不相关；
2. `delete_session`/`delete_sessions`：**删除会话会 destroy 该会话全部订阅者的 ws**（:4877-4885、:4924-4929）——多窗口同看一个会话时，一个窗口删除=其他窗口断线；
3. 桥进程退出：acp 子进程死→`process.exit(1)`（:1387-1395，200ms 补发终态帧后退出）→pc 拉起。**无心跳/无空闲超时/无负载保护**——桥不会主动断空闲连接。

数据（VERIFIED-RUN，pc.log 09-14~09-25 窗口）：栈重启（nats "Server is ready"）**09-18:22 次、09-19:26 次、平日 3~11 次/天**；桥启动 207 次；`acp exited` **0 次**（goose 无崩溃史）。→ 用户看到的断线绝大多数是**栈/桥重启**（dev 期高频；每次重启=所有页面顶栏「连接已断开，正在重连」+ `ws.onclose` 收口：`setBusy(false)`+`endStream`+`zombieToolcards`——进行中的工具卡被翻成「失败」红字（chat.tpl.html:740-745、:1544-1550），这正是「会话框内奇怪的断线元素」的另一半）。stats 里 websocket 错误计数 46~200/天（:4547 仅异常断连计数）与高频刷新/重启一致。

### d) sid 复用竞态的「切换失败」⚠卡（VERIFIED-RUN ×2）

删当日最新会话后，goose 按 DB 当日 MAX+1 发号会**复用刚 close 的号**（research/18 已知家族，本次两度活体复现）：
- 探针 B：新订阅拿到死号 34 → `switch_model` 写 set_config_option 撞 `Session not found` → 前端收「⚠ 切换失败，试试重开对话」（桥 :5221）；紧接着 prompt 撞同一守卫→首轮救援重建会话（+2s）。用户视角：指定模型后先见一张错误卡，随后「像什么都没发生」地在旧模型上继续跑。
- 第二次（catalog-probe 连跑）：连续两个死号 35，重试一次即逃逸到活号 36。

### Q2 结论

「会话框内的异常元素」不是单一故障，是四条独立通路在聊天流里画东西：health-bar（a）、💡服务商不通卡（b）、断线收口的失败工具卡/⚠卡（c、d）。其中 a/b 在连接完全健康时也会出现。

---

## Q3 慢在哪一段（分段计时）

| 段 | 实测 | 来源 |
|---|---|---|
| switch_model（同 provider 非家族，set_config_option 往返） | **201ms**（3 次一致） | 探针 A/B2/fp |
| session/new（订阅→subscribed） | 2.3~3.1s | 探针 A/B/B2 |
| prompt→首个 thought 帧 | 8.5~10s | 探针 A/B2 |
| 上游直连 TTFB（同 host 同模型流式） | 0.9~6.5s（identity，流式立即可达） | upstream-ttfb |
| 纯思考期 | 任务相关：B2 小任务 31.9s；深档真任务 8-12min（简报已知） | B2 / 简报 |
| llmproxy 额外延迟 | 未测出：流式逐块转发（:3558 非别名 pipe / :3533-3537 别名逐块替换），无全局锁无串行化（:3428 每请求独立闭包），非别名路径**不剥 accept-encoding**（:3521 仅别名剥）；A/B2 全程零 >10s 帧间隙 | VERIFIED-DOC + VERIFIED-RUN |
| hotRestartProvider（跨 provider） | 未活测（需改 providers.json，纪律禁止）；代码路径=杀+spawn+initialize（20s 超时）+session/load，前端播报「大约 5 秒」 | VERIFIED-DOC / UNVERIFIED-RUN |

**「指定模型后」特有放大器（本报告核心新事实）**：

1. **glm-5.3-flash 能力表默认思考档 = max**（data/model-caps.json，官方预置 `source:official, default:"max"`）。消费链：新会话 subscribe 无显式档→桥按 caps 默认发 thinking_effort（chat-bridge.tpl.js:4805）；llmproxy 出站注入 seed=`lastThinkOverride || capsDefaultEffort`（:1071）。→ **用户选 flash（名字暗示快）+ 不碰思考旋钮 = 每个请求以 reasoning_effort=max 跑**。前端旋钮确实预选了「尽全力想」（chat.tpl.html:1140 初始值链），但藏在顶栏、默认即最慢档。
2. deepseek-v4.1-flash（池首/默认模型）默认档 = high——同样的放大器。
3. glm-5.3 本体：上游默认开思考（B2 未注入任何 effort 仍流式思考 32s），深模型 + 大上下文 = 分钟级，属模型本性。
4. 家族别名路径当前**关闭**（VARIANT_FAMILY_ENABLED 仅 env `FORGE_VARIANT_FAMILY=1` 强制开，:819；全仓无设置点；llmproxy.log 最后一条别名记录 09-22）——09-23 前的「effort=max model=glm-5.3」别名路由行为已不生效，现在是真名+参数注入路线。

另注（与慢无关但同路径）：goose 目录**接受全部三个池内模型名**（catalog-probe2 VERIFIED-RUN，含别名形态）；glm 系 thinking_effort 被 goose 遮蔽成 `["off"]` 而别名形态给五档——档位旋钮的「诚实降级」依赖桥侧 caps 补值域。

---

## Q4 统一因果链

```
用户在顶栏「指定模型」
  ├─ 选 glm-5.3（深档）────────────┐
  ├─ 选 glm-5.3-flash ──默认档 max─┤   （若此前用过 set_think，则跟随全局习惯）
  └─ 选 deepseek-v4.1-flash ─默认 high┘
        ↓
   上游 LLM 长时间只产 reasoning（真在干活，非空转——用户直觉正确）
        ↓
   ┌─ glm 系：thought 帧全程流式到前端 → chat.tpl.html:1432 丢弃 → 黑箱
   └─ deepseek 系：中继无 reasoning 流 → 协议层就无帧 → 黑箱
        ↓ 期间 UI 恒为「小 forge 正在干活」三点
   并行独立的三条噪声通路随时在会话框画异常元素：
   ① /models 1.6~9.1s × 8s 探测超时 → health-bar 闪现（聊天流首行）
   ② 回复含 S26 关键词（成功也被判）→ 💡「服务商不通」卡 + 60s 后复检（复检又可能触发 ①）
   ③ 栈/桥重启（dev 期 4~26 次/天）→ 顶栏断线点 + 工具卡翻「失败」
   （④ 刚删过当日最新会话 → 死号复用 → 「切换失败」⚠卡 / 首轮救援 +2s）
        ↓
   观感合成：「非常慢 + 完全不知道在做什么 + 会话框内奇怪的断线异常元素」
```

主因果（慢+黑箱）是**一条**链；「断线元素」是**并列多因**（①②在连接健康时也发生，③是环境重启，④是既有已知竞态）。不存在单一根因同时解释全部三症状。

---

## 修复建议面（只列不实现）

1. **渲染思考流**（对 Q1 收益最大）：把 `agent_thought_chunk` 渲染成可折叠的「思考中…」气泡（默认折叠+流式预览若干字+已用时秒数）；glm 系即刻从全黑箱变半透明。deepseek 系需在 typing 指示器上加「已思考 Ns」计时（无帧可渲染时的诚实反馈）。
2. **忙碌指示器加计时与阶段**：`#typing` 加 elapsed 计时（一行 `setInterval`），配合 1 大幅缓解「不知道在做什么」。
3. **默认档复核**：glm-5.3-flash 官方 default=max 与产品「快」的暗示冲突——建议预置表把 flash 系默认调 low，或在切模型时把思考旋钮同步显式化（当前只在顶栏角落预选）。
4. **S26 误报收窄**：正则只对**异常收尾**的回合判定（如 stop reason / 空正文 / reject 路径），或要求多个关键词共现；至少排除用户主动要求输出这些词的场景不可判——那就把「成功 stop + 命中正则」从 upstream 计数与健康复检触发里摘出。
5. **健康探测去抖**：/models 慢≠不可用——超时从 8s 放宽到 ~15s，或连续 2 次失败才翻 down（down→ok 各加一次确认），防 health-bar 闪现；探测目标可换成更轻的端点。
6. **断线收口文案分级**：ws.onclose 的 zombieToolcards 把进行中工具卡标「失败」——桥重启/栈重启场景下并未失败，建议标「连接中断，结果未知」中性态。
7. **sid 复用竞态**（既有 research/18/21 家族，本次再度活体复现）：删除后强制发号避开 closed 号段（如 DB 删行后给 goose 侧留墓碑/空壳会话占号）。
8. **观测缺口**：llmproxy 目前只记别名翻译一行（:3490，且别名路径已停用）——建议给全部 /llmproxy 请求记一行「ts+model+effort+首字节ms+总ms」，Q3 类分段计时就不用直连对照了。

## 排除项（怎么排除的）

- 桥转发丢帧：onAcpData :1469-1472 全量广播，无类型白名单；活体录到 thought/tool/message 全谱帧。
- 桥主动断连（心跳/超时/负载保护）：grep 全部 destroy/terminate/setInterval 点，仅 Origin 校验、客户端 close、delete_session 族、进程退出四处；无服务端 ping。
- llmproxy 串行化/压缩剥除致慢：非别名路径不动 accept-encoding、每请求独立闭包；直连 TTFB 与桥路径首帧差 < 数秒；A/B2 录帧零 >10s 间隙。
- 家族别名路径（llmproxy.log 09-21/22 的 effort 路由）：VARIANT_FAMILY_ENABLED=false（无设置点），现行为非别名。
- goose 拒绝切换 glm-5.3（catalog）：直连 rpc set_config_option 三名全收（OK 回包）——探针 B 的「切换失败」是死号竞态非目录。

## 复现清单（forge/tmp/s103-r1-wsrec/）

- `rec.js <tag> [model] [maxsec] [prompt]` — 全帧录制（wslib.js 裸 WS 客户端，Origin 必带）
- `catalog-probe2.js` — 死号逃逸 + goose 目录接受度
- `fp-probe.js` — S26 误报（stats diff + 60s 复检回执）
- `upstream-ttfb.js <model> <effort>` — 上游直连 TTFB/reasoning 流探测
- `evidence-console.txt` — 控制台证据汇编；`ev-*.jsonl`/`raw-*.jsonl` — 帧序列原始档

预算消耗：glm-5.3 深档 1 轮（60.6s）+ flash 3 轮 + deepseek 1 轮 + 直连 5 小发。足迹已清（探针会话全删、data/perm-check.js 已删；今日 stats 计数含探针噪声）。
