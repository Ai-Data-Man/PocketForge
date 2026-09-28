# research/47 — thought 帧门控机制定案（三臂裁决：44 vs 46 矛盾）

- 日期：2026-09-29（s104-r1）
- 问题：`agent_thought_chunk` 帧到底被谁掐死——research/44（09-25 活体，glm-5.3 真名 2378 帧持续流式）与 research/46 E0 / s103 QA P2-2（09-26 起，现行栈非 gpt-5 系 0 帧）正面冲突，两证必有一伪或条件不同。
- 证据目录：`forge/tmp/s104-r1-thought/`（探针+全 SSE/帧录制+差分矩阵）；探针源在 `tmp/s104-r1-thought/`。
- 验证等级：除特别标注外全部 VERIFIED-RUN 2026-09-29 本机（Windows，goose 1.50.0 部署二进制，9router 111.228.54.166:20128 用户侧 fork）。

## 0. 结论速览（先看这个）

1. **两证都真，46 的归因错了**。goose 1.50 对 `reasoning_content` → `agent_thought_chunk` 的映射**没有模型名门**（臂G 三名同流 31/31/31 帧 + 1.46/1.50 双版本源码逐行）。「goose 二进制对非 gpt-5 系不产 thought 帧」不成立——46 E0 自己也标注了「源码未含该层，未逐行核实」，本次补上源码并实测证伪。
2. **现行 0 帧的真凶在用户侧 9router 中继**：当请求同时满足「带思考控制键（reasoning_effort/thinking）」×「带 goose 级 system 提示」时，中继**不下发 reasoning 流**（直发差分 4/4 稳定复现）。无思考键时推理流恒在场（4/4）。
3. **桥侧放大器**：全局思考档 `lastThinkOverride` 跨模型污染——subscribe(null) 经池首 deepseek-v4.1-flash（caps 默认 high）种子后，glm 轮恒注入 `reasoning_effort=high`，正中中继掐流条件。**现行栈 glm 真名会话 0 帧是确定性复现的**（臂L）。
4. **净线端到端已证**（臂L3）：同栈同模型同 prompt，线上一旦无思考键，thought 帧即刻到达前端（24 帧）——S2 折叠面板等的就是它，前端零改动即亮。
5. 附带新事实：**deepseek-v4.1-flash 在现行中继上净线也回推理流**（09-25 前该模型 0 推理是当时中继行为，已随用户侧 fork v0.5.81 上线而改变）。

## 1. 三臂结果

### 臂D 上游直连（绕过 goose/桥，直打 9router /v1/chat/completions，stream）

模型 glm-5.3-flash，短算术 prompt，每变体×2 发。全矩阵（含 goose 精确载荷差分 D2/D3 与边界复核）见 `forge/tmp/s104-r1-thought/stability-matrix.md`。

| 变体 | 结果 | reasoning 块 | 首块延迟 |
|------|------|-------------|---------|
| A1 无思考参数 | 推理流在场 | 42/35 | 0.7-2.5s |
| A2 reasoning_effort=max（裸体） | 推理流在场 | 31/44 | 0.7-1.2s |
| A3 thinking:{type:enabled}（裸体） | 推理流在场 | 10/9 | 0.8-1.1s |
| D2 goose 精确体（system+18 工具，33.6KB）无思考键 | 推理流在场 | 92/50 | 4.0-4.1s |
| D3 goose 精确体 + effort=high | **零推理（4/4 稳定）** | 0 | — |
| D3/复核 goose 精确体 + effort=low | **零推理** | 0 | — |
| 复核 goose 精确体 + thinking:{type:enabled} | **零推理（2/2）** | 0 | — |
| 复核 goose 精确体 + effort=max | 不稳定 | flash 3/4 有、glm-5.3 0/2 | — |
| 边界 goose 体删 system + high | 推理流在场 | 41 | 3.8s |
| 边界 裸体+短 system + high | 推理流在场 | 10 | 1.1s |

**线形态**（推理在场时）：`delta:{content:"<think>"}` → N×`delta:{reasoning_content:"…"}` → `delta:{content:"</think>"}` → 正文（罐装实录 `armD-A2-effort-max-r1.sse.txt`，37 帧全录，臂G 直接回放此文件）。

**臂D 裁决**：上游对 glm-5.3-flash 无条件给推理（无参数也给）；掐流门=「思考键 × goose 级 system」联合条件，值维度上 high/low/thinking-enabled 稳定掐、max 不稳定、无键恒通。触发面与 system 体积/形态相关（短 system 不触发），未再细分——不影响裁决，但影响杠杆选择（见 §5）。

### 臂G goose 解析门（mock 上游 × 部署二进制，零 LLM 预算）

回放臂D 录得的真实 SSE 罐装流（31 个 reasoning_content 块），spawn 独立 `goose.exe acp`（**部署版 1.50.0**，`goose.exe --version` 实测），env 完全复刻桥 spawnAcp 形态（GOOSE_PROVIDER=openai、OPENAI_HOST=http://127.0.0.1:18790/v1、OPENAI_BASE_PATH=chat/completions、临时 GOOSE_PATH_ROOT 隔离）。单变量=GOOSE_MODEL。

| GOOSE_MODEL | thought 帧 | message 帧 | 首帧延迟 | stopReason |
|-------------|-----------|-----------|---------|-----------|
| glm-5.3-flash | **31** | 2 | 1202ms | end_turn |
| gpt-5-forge-fast | **31** | 2 | 1183ms | end_turn |
| gpt-5-codex | **31** | 2 | 1829ms | end_turn |

- 31/31/31 = 罐装流 31 个 reasoning_content 块逐一成帧，thoughtChars 82/82/82 逐字节一致；模型名零门控。
- 出站请求体三变体形状相同：goose 自身**不携带任何思考参数**（keys=messages/model/stream/stream_options/tools），模型名原样上 wire（`armG2-req-*.json` 实录）。
- 副产：goose 实际 wire 路径=`/v1/chat/completions`（OPENAI_HOST 的 /v1 不剥）——桥内注释「实际 wire 路径=/llmproxy/chat/completions」过时，llmproxy.log 的 path 字段（`/llmproxy/v1/chat/completions`）才是对的。

**臂G 裁决**：goose 的门不在模型名，只在「响应流里有没有 reasoning_content/reasoning/<think> 内联」。46 E0 的「推理内容在 goose 二进制内被丢」被二进制级证伪。

### 臂L 全链活体（现行 dev 栈零改动，裸 WS 录全帧）

| 轮 | 条件 | wire（llmproxy.log 对账） | thought 帧 | 证据 |
|----|------|--------------------------|-----------|------|
| L | subscribe(null)→switch_model glm-5.3-flash→prompt | model=glm-5.3-flash **effort=high** status=200 | **0**（1 message 帧，10.5s） | ev-raw-armL-glm-flash |
| L2 | 同上 + set_think max | set_think 被**拒**（goose 名字门：glm 无 thinking_effort 配置项，白名单空）→ wire 仍 high | **0** | ev-armL2-*.jsonl |
| L3 | subscribe(think:'zzz' 越界串→注入停发) | model=deepseek（见下）**effort=''**（净线） | **24**（12.2s 到达，含英文推理全文） | ev-armL3-*.jsonl |

- L 的 effort=high 来源（污染链，代码级）：`subscribe(null)` → `msg.model` 缺 → `dm=effectiveModel()=池首 deepseek-v4.1-flash` → `capsDefaultEffort='high'`（model-caps.json 实测 default=high）→ `lastThinkOverride='high'`（chat-bridge :4923-4931 无条件记账）→ glm 轮 `applyParamRoute` seed=lastThinkOverride（:1118）→ wire high → 中继掐流。
- L3 的 24 帧出站行 model=deepseek-v4.1-flash：subscribe 带模型对 goose 目录外真名 **set_config_option 静默失败**（无 config_option_update 回执），prompt 触发救援代开新会话、未钉模型跑池首 deepseek（research/46 E5 同族行为）。净线 → deepseek 推理流在场 → 24 帧。**活体链路完整性由此证明**（净线→帧→前端门口）；glm 的净线活体格未单独跑（预算 3 轮封顶），由臂G（glm 名解析）+臂D2/D3（glm 净线推理流 4/4）拼接覆盖，缺格属可拼接推断非实测，如实标注。
- LLM 预算：活体 3/3 轮封顶（L/L2/L3，每轮另含桥自动标题生成 1 发）；直发 20 发（6 裸体 + 14 goose 体回放）。

## 2. 源码解析链（reasoning 流 → thought 帧完整通路）

版本注记：部署二进制=**1.50.0**；本地源码树 tmp/goose-src=**v1.46.0**（git tag 实测）。任务简报「源码 1.46.0 与部署二进制同版本」不实。1.46 逐行 + 1.50 关键三文件 WebFetch（raw.githubusercontent v1.50.0 tag）交叉核对：**三处关键机制 1.46→1.50 逐字一致**。

1. **引擎选择**（goose-providers/src/openai.rs，1.46 :377-411 = 1.50 同文）：
   - `should_use_responses_api(model_name, base_path)`：base_path 含 `chat/completions`（`is_chat_completions_path`，子串匹配）→ **恒走 chat/completions 引擎，不看模型名**。桥 spawn env `OPENAI_BASE_PATH='chat/completions'`（chat-bridge.js:1422）命中此分支——gpt-5 名也走 chat/completions，Responses 引擎在 PocketForge 形态下**永不上场**。
   - `is_openai_responses_model` 正则 `(?:^|[-/])(?:o\d+(?:$|-)|gpt-5(?:$|[-.]))`（formats/openai.rs:1777-1782）只在默认 base_path 下才参与引擎路由。
2. **流式解析**（goose-provider-types/src/formats/openai.rs，1.46=1.50 同机制）：
   - `Delta` 结构 ：122-131 含 `reasoning_content`/`reasoning`/`reasoning_details` 三字段；`reasoning_text()` :136-141 **优先 reasoning_content**（DeepSeek/OpenRouter 形态）回落 `reasoning`（vLLM 形态）。
   - 累计：:1250-1261（含工具调用内层 :1321-1330）把 delta 文本推入 `accumulated_reasoning_content`。
   - **发射（内容分支）**：:1499-1506——`delta.reasoning_text()` 非空即 `content.push(MessageContentBlock::thinking(...))`，**无任何模型名条件**。
   - 发射（工具分支前冲刷）：:1401-1412；流尾 `<think>` 内联冲刷：:1554-1568（`pending_inline_thinking`/ThinkFilter，仅当结构化 reasoning 全程缺席时才吐）。
3. **ACP 发射**（goose/src/acp/server.rs :1083-1090，1.46=1.50 同文）：`MessageContent::Thinking` → `SessionUpdate::AgentThoughtChunk` 通知，**无条件转发**（唯一前置=会话仍在册）。
4. **名字门真实位置（请求侧，非解析侧）**：`ModelConfig::is_reasoning_model()`（goose-provider-types/src/model.rs:242 起，research/35 已证 glm 不命中）只决定 goose 自己**发不发** reasoning 参数、以及 ACP `thinking_effort` 配置项暴不暴露（→ 桥 set_think 白名单空，臂L2 实测被拒）。它**不拦截响应解析**。
5. **桥侧消费点**：llmproxy 真名路径 `applyParamRoute`（chat-bridge.js:1107-1132，seed :1118）；响应面对非别名请求**字节级透传**（SSE 逐块零缓冲，:3524 块头注）——桥不剥 reasoning_content，臂L3 净线 24 帧到达即透传完好的活证。

## 3. 矛盾裁决：44 vs 46

**两证的观测都真实，差异条件=线上思考键状态 × 中继版本的联合演化：**

- research/44（09-25 22:48-22:54）：glm-5.3 真名 2378 帧。当时线上要么无思考键（lastThinkOverride 空 / glm-5.3 caps default=null / 预置表 rev .3 当日才落），要么中继还在旧版（s101 research/41 已证：**旧 9router 对 effort 参数全收无一有效**——键上了线也是 no-op，模型默认思考开）。两路都归于「模型侧实际无 effort 生效」→ 推理默认开 → goose（无名字门）正常成帧。具体走哪一路不可回溯（当轮 llmproxy 行已轮转丢失），但两路收敛同一机制。
- research/46 E0（09-26）：glm-5.3-flash effort=max 上线、直连有推理、goose→客户端 0 帧。结合本次矩阵：max+system 本就不稳定（flash 3/4、glm-5.3 0/2），E0 单观察落在掐流分布内，与 44 不冲突。**但 46 的归因（goose 二进制丢推理）错误**——臂G+源码双证。46 当时已自标「解析门在 goose.exe 二进制内，未逐行核实」，本次为更正提供实证。
- 时间线吻合件（VERIFIED-DOC）：用户侧 9router fork **v0.5.81 effort 透传**在 s102（09-25）窗口上线记账（STATE s102 行）——正是它让思考键真正到达模型侧，从而暴露/引入「键×system 掐流」行为。09-25 晚（44 探针）处于新旧中继交界面，09-26 起（E0）全程新行为。

**裁决句**：不是「谁对谁错」，是**中继行为在 09-25/26 之间变了，而 46 把变化错记在 goose 头上**。现行 0 帧由桥侧 high 注入（跨模型污染）+ 中继掐流联合保证，确定性复现。

## 4. 杠杆清单（让 glm 真名会话拿到 thought 帧）

| # | 路径 | 证据 | 代价/风险 | 评级 |
|---|------|------|----------|------|
| 1 | **用户侧修 9router fork**（根因）：排查 zai 格式翻译层在「思考键+system」联合条件下为何掐 reasoning 流（疑把 system 合并/换模板后落进关思考路径）。复现矩阵=stability-matrix.md，四臂 10 行直接可跑 | 差分 4/4 vs 4/4，单变量铁证 | 用户家里自建设施，PocketForge 只能递证据；修好后 effort 语义全链恢复 | 根治 |
| 2 | **桥停发思考键（glm 族）**：applyParamRoute 对 glm-5.3-flash/glm-5.3 不注入（或注入白名单里这两名→''）。净线=推理恒在场（4/4） | 臂D 4/4 + L3 端到端 24 帧 | 思考档旋钮对 glm 本就是**假旋钮**（goose 名字门拒 set_think，L2 实测）+现行唯一实际效果是掐流——停发=纯收益；max 档用户失去「更深」选项（本就不稳定 3/4） | **推荐，最小 diff** |
| 3 | **修跨模型污染**（正交bug）：subscribe 默认档种子按会话目标模型取，而非池首模型（:4923-4931 dm=effectiveModel()）。修后 glm-5.3-flash 新会话种子=caps default=max→wire max→3/4 推理（不稳定，不如 #2 干脆） | 代码级+caps 实测 | 不单独解决（max 不稳），但该污染同样影响 deepseek 档位语义，值得修 | 推荐（配合 #2） |
| 4 | **llmproxy 流改写**：出站把 effort 改写成 GLM 官方 thinking 形态——**无效**（thinking:{type:enabled}+system 同样被掐 2/2） | 臂D 复核 | 死路，勿走 | 否决 |
| 5 | **注入 max 而非 high**（若不动中继只改桥种子）：flash 3/4 有推理、glm-5.3 0/2——**不稳定，不可作产品路径** | 臂D 复核 | 用户会看到时有时无的面板 | 否决 |
| 6 | 家族别名复辟（gpt-5-forge-*）：只会恢复 goose 侧 set_think 旋钮（名字门），wire 仍是真名+注入→同样被中继掐；且违背 W4 裁决 | 臂G（别名对解析无增益 31/31/31） | 高 | 否决 |
| 7 | Responses 引擎路径：PocketForge 形态下恒 chat/completions（源码 :392-411），且中继只有 chat/completions 面 | 源码 | 不可达 | 不可行 |

**推荐组合**：#2（桥停发 glm 思考键，即刻全绿）+ #1（向用户递根因证据包）+ #3（顺手修污染）。#2 落地当天，glm 两模型思考面板即恢复（L3 已证前端零改动即亮）。

## 5. 注意事项与边界

- 「短 system 不触发、goose 级 system 触发」的精确边界（长度？内容？工具共存？）未细分——不影响本次裁决（现行栈 system 恒在），但用户侧修中继时需要它；递证据包时可补一轮 goose 体+逐步裁剪 system 的二分（直发，零 LLM 预算以外的活体成本，每发约 3k flash tokens）。
- glm 净线活体格（live glm + 无键）未实测（3 轮预算封顶），属臂G×臂D2 拼接推断；下次任何活体窗口可 1 轮补钉。
- L3 的 24 帧由 deepseek 产出（subscribe 带模型对目录外名字静默失败→救援跑池首）——顺带再证 research/46 E5「救援轮跑错模型」在现行栈仍在（backlog 已有，非本次范围）。
- 桥内两处注释需随本次更正：spawnAcp 头注的 wire 路径（/llmproxy/chat/completions→实为 /llmproxy/v1/chat/completions）；「goose 对 glm 系不发/不解析 reasoning」的后半句（发=真，解析=伪）。
