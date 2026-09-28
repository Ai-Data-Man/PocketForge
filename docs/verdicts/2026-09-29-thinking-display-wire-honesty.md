# 裁决：思考内容展示(可折叠)——wire 诚实化三切片 + 旋钮复活

日期：2026-09-29 ｜ 主控：s104 ｜ 依据研究：docs/research/47-thought-frame-gate-mechanism.md（三臂 VERIFIED-RUN，证据 forge/tmp/s104-r1-thought/ 39 件）

## 0. 一句话

用户触发原话（2026-09-29 主线指令）：「本次主线方向：1. 思考内容展示(可折叠) 3. 以上完成后，必须就已有的这些功能做反复的从零安装开始的测试，对任何日志、浏览器控制台输出等可观测点进行详细观察……」——逐字对应 s103 已交付的 S2 思考草稿**折叠**面板；「回合后回看/中文化」无用户信号（s103 裁决已定非目标且过门），不进本批范围。

S2 面板早已建成且零缺陷在等帧；帧死于「桥把官方默认思考档注入 wire × 用户侧 9router fork 在『思考键+system』联合条件下掐 reasoning 流」。本裁决不碰前端呈现，改桥的注入语义：**wire 上只放用户真选过的档**——官方默认档退回「显示但不上 wire」（上游自身默认与之等效，见 §2 等价性边界），显式选择（旋钮/用户改过的 default）照发。附带修复跨模型污染与 glm 旋钮被 goose 名字门拒绝两条真缺陷。

## 1. 事实基线（全部 VERIFIED-RUN 2026-09-29，research/47）

| # | 事实 | 来源 |
|---|---|---|
| F1 | goose 解析零模型名门控：reasoning_content → AgentThoughtChunk 无条件（1.46 源码逐行 + 1.50 部署二进制 mock 三模型名 31/31/31 帧逐字节一致） | 臂G |
| F2 | 用户侧 9router fork（v0.5.81）在「思考键（任意形态/值）× system」联合条件下不下发 reasoning 流；无键恒在场；删 system+键→在场；max 不稳定（flash 3/4、glm-5.3 0/2） | 臂D 差分矩阵 |
| F3 | 现行栈 0 帧真因链：subscribe(null) 池首 deepseek caps 默认 high → 种子**全局** lastThinkOverride → glm 轮注入 high → F2 掐流 | 臂L + 桥 :4925/:4930/:1118 |
| F4 | 净线（零思考键）现行栈 **deepseek-v4.1-flash 实测回推理流（24 帧到达前端）**；**glm 净线=臂G×臂D2 拼接推断**（goose 解析零门控+上游无键恒在场，3 轮 LLM 预算封顶未活体直测，research/47 §5 自记）——验收线 1 的 glm 活体探针即补钉此格 | 臂L L3 + research/47 §5 |
| F5 | set_think=max（glm）被 goose 名字门拒——现行 glm 旋钮改变档位必失败回执 | 臂L |
| F6 | research/46「goose 二进制丢推理」归因错误（自标未逐行核实）；research/44（2378 帧）与 s103 QA（0 帧）双真：fork v0.5.81 effort 透传上线前后行为翻转 | research/47 §矛盾裁决 |
| F7 | 官方 GLM 端点 reasoning_effort 真兑现（reasoning tokens 233→358）——注入在健康端点有效能，不能一刀切停发 | research/41 §3.D（引用，09-23 VERIFIED-RUN） |

## 2. 设计原则（本裁决的归约支点）

**wire 诚实 seam：桥只把「用户显式选过的档」放上 wire。** 依据：
- 官方默认档与上游自身默认的等价性**按端点分界**：官方端点由厂商文档背书（预置表即文档值，F7 同源），等价成立；**中继端点=假设非事实**（research/42 硬证据：同模型跨平台思考行为不同——阶跃原生开 vs 百炼关；预置表 75 条中 59 条 default 非空、其中 54 条无 (host,model) 二元组、对任意中继按模型名生效，其无键默认无人担保）。暴露面与观测触发器见 §6。
- 把默认再显式发一遍，在健康官方端点是冗余、在故障中继上是放大器（F2+F3 现行实证）。
- 显示与现实的一致性由「显示官方默认=官方端点将按官方默认执行」保证，中继上若分裂由 §6 触发器立项；用户偏离默认（旋钮换档/改 default 字段）才是需要 wire 表达的信号。
- 一句话推翻测试：「为什么不连用户改的 default 也不发？」→ 用户改 default=显式意图偏离上游默认，不发则编辑器成谎言。过门。
- 反向：「为什么不禁官方默认被注入后还保留 capsDefaultEffort 显示填充？」→ 显示填充只影响旋钮预选（:4925），是文档作用不是 wire 作用，保留。

**supersede**：s101/W3「default 真消费（新会话首档随动→上 wire）」条款中「上 wire」半句废止，改「首档随动=显示预选；仅用户改过的 default 上 wire」。W3 其余（字段级 user_fields 保鲜、越界停发、消费面闭环）全部维持。

## 3. 切片

### V1（桥·种子换轨）官方默认档不上 wire
- `applyParamRoute` seed 链 `effortIn || lastThinkOverride || capsDefaultEffort(model)` → `effortIn || lastThinkOverride || userDefaultEffort(model)`；`userDefaultEffort` = capsDefaultEffort 且该条目 `user_fields` 含 `'thinking.default'`（机制既有：s100/W3 user_fields 单一真相）。
- `subscribe` 处（:4925-4930）：客户端显式带来的 `msg.think` 照旧记 lastThinkOverride；**桥填充的默认档只回显给前端预选，不再写 lastThinkOverride**。跨模型污染（F3 池首种子）随之根除——lastThinkOverride 从此只含真选择。
- 效果：出厂态/不改档的会话零思考键 → 全池推理流到场（F4）→ S2 面板活，前端零改动。

### V2（桥·set_think 桥侧兜底）glm 旋钮复活
- 前置红证：工程批先钉死 goose 1.50 对 glm `session/set_config_option(thinking_effort)` 的真行为（F5 拒绝——按臂L；若复核为接受则本切片自然空转，只留红绿证据）。
- 修法：goose 回 error 且 `thinkDomain(sid)` 含 v 时，桥本地记账（lastThinkOverride=v + sidThinkApplied）并回执 ok——真翻译本来就在本桥 llmproxy（set_think 块头注既有语义），goose 的配置簿记拒收不代表 wire 无效。回执 configOptions 用本地合成（当前值=v，values=域）。
- 边界：goose 拒因非名字门（会话不在了等）不兜底，照旧人话回执——区分依据=error 文本/会话在册判断，工程批定夺并留证。
- **已知交互（PM 红队质询3 定案，不瞒）**：现行故障中继上用户调任何档 → wire 带键 → 思考流被掐（F2）→ S2 面板消失，且深度档在中继上的真实兑现无 reasoning_tokens 证据（F7 只在官方端点）。V3 手册句对此给人话告诫；fork 修复（V4）后按 §6 触发器复核。

### V3（手册）「看看它在想什么」引导 + 旋钮告诫
- 使用说明 §33 补半句（口径与 S2 母句一致：想的过程可展开看，原文可能是英文，收起不留）。若已有等义句则只校对。
- 补人话告诫句（PM 红队质询3）：「调过思考力度后，想的过程可能暂时看不到——服务商中转的已知问题，修复中」（零术语口径）。

### V4（用户侧留档）9router fork 掐流缺陷清单
- 更新 docs/user-side-9router-effort-passthrough.md：新增「思考键×system 联合掐 reasoning 流」缺陷（F2 复现矩阵四臂 10 行可跑，引 research/47）。部署在用户家里，本会话不可达——归用户侧。

### V5（顺手批，同文件摊销）S9 一行修
- 前端：unknown 卡（断线中性收口）也给「这是干啥？」解释入口（:1461 条件补 `||st8==='unknown'`）。
- 桥：explain 词表 stt 补 `'unknown'→'结果不确定（连接断了，没等到收尾）'`——解释者拿到诚实状态行，不再空猜。

## 4. 验收线

1. **活体探针（新，同时补钉 F4 的 glm 净线推断格）**：现行栈新会话 glm-5.3-flash 短 prompt → thought 帧 >0 + 页面 think-peek 出现（真桥真 WS，禁桩）；预算 flash ≤3 轮。
2. **红绿对照**：V1（改前净线复刻 F3 红=注入 high 0 帧/改后 0 键有帧）、V2（改前 set_think 拒/改后回执 ok 且 llmproxy 行 effort 随动 + **同会话 set_think 后 thought 帧计数臂**——现行故障中继预期 RED（键上即掐），留证归 V4 证据包，不算本批失败）、V5（改前 unknown 无按钮）。
3. **§8.2 十五套全量**：触及 chat-bridge.tpl.js + chat.tpl.html，全套必跑；期望随迁（proxythink/modelcaps/w2-preset/llmproxy-xlate 的 capsDefault 注入断言按新语义改写，红绿留证）。
4. 手册 grep 口径一致；物化链 tpl→bin cmp 逐位一致 + restart chat-bridge + healthz 200。
5. lastThinkOverride 语义迁移说明写入本裁决附注（老部署内存态无持久化，桥重启即净，无迁移步骤）。

## 5. 否决项（带证据）

- 全停 glm 族思考键注入（research/47 杠杆1 原案）：一刀切对健康端点损失真效能（F7），且随中继修复即过时；换轨方案在两端都诚实。
- **探测-退键自适应**（按 provider 观测注入后有无 reasoning 流、失败自动退键——PM 红队补录）：中继 v0.5.81 一夜翻转行为证明探测态会腐烂；同回合恢复语义破产（重发=双倍 LLM 成本+工具副作用不可重放，只能救下一回合=新会话首回合必黑，恰是主线场景）；max 3/4 不稳定致探测抖动（与「注入 max」同死因）；管理的仍是「没人选过的默认键」——V1 在概念上先赢；探针层编码的是用户侧 bug（V4 可修），修完即死代码。
- 注入 max（3/4 不稳定）、thinking 形态改写（同样被掐）、家族别名复辟（解析零门控后无增益）、Responses 面（桥恒走 chat/completions 不可达）、官方 host 才注入/机制进配置面（AGENTS §9.4）——证据 research/47 §杠杆。
- 桥侧旁路合成 think 帧（llmproxy 见流直接发前端）：F4 后无必要，纯增机制。

## 6. 留档 backlog

- 用户侧 fork 修复后（V4），可重开「注入档位下思考流可见性」复核（healthy 键+system 应有流）。
- **显示默认 vs 端点无键默认分裂**（PM 红队质询4 立项）：暴露面=预置表 59/75 条 default 非空、其中 54 条无 host pair 在中继上生效。触发器=llmproxy 行补记 usage.reasoning_tokens（stream_options 已带，成本一个字段）；无键请求的 reasoning tokens 系统性低于官方默认量级即立项。
- goose 1.50 set 路径门控行为若与 1.46 源码注释漂移（「set 无门控」），记 research/47 附注，升级 playbook 参照。
