# 裁决 · 慢会话黑箱 + 观测性缺口修复（s103）

日期：2026-09-25 ｜ 裁决人：pf-pm ｜ 输入：research/44（主线1 RCA）+ research/45（主线2 覆盖矩阵）+ AGENTS §7/§8.2/§9 + STATE s102 顶行
用户原话：①「指定模型后，会话响应非常慢，似乎并非空转，但完全不知道在做什么（也不知道思考内容或工具调用)。并且会话框内会出现奇怪的断线等异常ui元素」②「应用观测性非常差，没有覆盖每个环节，导致日志反馈功能形同虚设，抓不住有效信息。典型代表：模型提供商的测试与拉取模型完全没有留痕」

---

## 1. 背景与问题陈述

**主线1（慢+黑箱+异常元素）**：谁在痛——用户指定模型（尤其 -flash 系）后，分钟级只见「小 forge 正在干活」三点动画；期间健康条/误报卡/失败工具卡在会话框里随机闪现。频率——每个思考型模型会话必遇（glm-5.3 小任务纯思考 31.9s，真任务 8-12min 常态）。不解决的代价——产品看起来「坏了」，而它其实在正常干活；用户无法把「慢」归因到「思考档」，也就无从调整。

三问：用户何时遇到？发起任何会话即遇。不用它怎么死磕？盯着三点动画数分钟，或误以为断网去重启。做错的代价？渲染全部思考原文=英文技术流淹没妻子面；降默认档=悄悄背离官方真值（s101 血训同族）。

**主线2（观测性）**：谁在痛——用户反馈问题时，「日志反馈功能形同虚设」。频率——每次排障。不解决的代价——所有「慢/失败」类反馈永久不可归因，团队只能靠一次性探针复取证。

三问：何时遇到？点测试/拉取模型、遇慢请求、生成 📮 报告时。不用它怎么死磕？手工跑探针对照盘上文件（s103-r1/r2 本身就是死磕产物）。做错的代价？全环节高保真埋点=日志爆炸+维护面扩张。

---

## 2. 两份研究的关键事实（裁决依据，全部引用自 research/44、45）

| # | 事实 | 分级 | 对裁决的意义 |
|---|---|---|---|
| F1 | 桥不丢帧；前端把 `agent_thought_chunk` 整族丢弃（chat.tpl.html:1432 `keep silent`） | VERIFIED-DOC+RUN | 黑箱是渲染缺口，不是传输缺口 |
| F2 | glm 系思考帧全程流式到达（B2：31.9s 内 2378 帧，零 >10s 间隙）；deepseek 系中继无 reasoning 流（0 帧，直连对照 firstReasoningMs=null） | VERIFIED-RUN | 两族需两种诚实呈现 |
| F3 | 慢不在桥：switch 201ms、prompt→首思考帧 8.5-10s≈上游 TTFB；分钟级耗时=思考期本身 | VERIFIED-RUN | 不做无意义的桥优化 |
| F4 | glm-5.3-flash 官方预置 default=max、deepseek-v4.1-flash default=high；新会话/无习惯时桥注入 caps 默认档 | VERIFIED-DOC+RUN | 「指定 flash 想快」实际跑最高思考档 |
| F5 | 四条独立通路在会话框画异常元素：①health-bar 插聊天流首行+/models 1.6-9.1s 撞 8s 超时线抖动 ②S26 正则对成功回复误报💡卡+60s 复检 ③栈/桥重启→zombie 工具卡翻「失败」 ④删当日最新会话→sid 复用→「切换失败」⚠卡 | VERIFIED-RUN | 断线元素=并列多因，逐条取舍 |
| F6 | ①②在连接完全健康时也发生 | VERIFIED-RUN | ①②优先级高于③④ |
| F7 | 桥 console.log→pc.log 受冲刷限制（8h 无新行实证）；test_model/list_models 零留痕双重实锤（代码无调用+盘上 mtime/size 不变） | VERIFIED-DOC+RUN | 主通道必须直写文件 |
| F8 | LLM 非别名主路径生产静默（09-25 六笔真实请求，llmproxy.log 停在 09-22）；报告只读最弱通道组合 | VERIFIED-RUN | G1+G5 是「慢可诊断」的仪器 |
| F9 | s102 终态原则：预置=官方真值+用户可修正+三态来源标注；claude 默关族 default high→null 修的正是「运行时悄悄改变官方默认行为」 | STATE s102 | 数据真值层与首档策略层必须分开答 |

标注不确定：ZCode 推荐配置的默认档选择策略 UNVERIFIED（research/38 只确证 reasoningLevel 是会话层概念、undefined 即抛「requires an effort」——会话层必须自己拥有档位，不依赖 API 默省）；flash 不注入 effort 时中继实际档位未单独实测（官方文档称默认 max；B2 只证 glm-5.3 本体）；hotRestart 耗时未活测；生产机栈重启频率未知（dev 4-26 次/天是开发期数据）。

---

## 3. 逐项裁决

### 3.1 thought 流渲染——状态优先于内容，内容折叠供给

**归约**：「完全不知道在做什么」与「思考内容原文」是两个需求。用户的母痛点是前者（liveness+进度+归因）；原文是次要供给（beta 技术户会看，妻子面看不懂英文推理流——F2 实证思考内容为英文）。工具调用本就可见（F1 报告：五张工具卡全到达），用户感知里的「工具调用不可见」实为「决定调工具前的规划期」不可见。

**裁决**：
- **主修复=忙碌条升级**（对两族模型同时生效）：`#typing` 从裸三点升级为「阶段+计时+当前档」状态条——阶段由既有帧推导（thought 流动=在想 / tool_call=在动手 / message_chunk=在写答案），计时=setInterval 秒数；**思考期显示当前思考档人话**（复用 THINK_LABELS/knob 单一真相源，如「它正在尽全力想 · 已 90 秒」）。这一行字同时闭合「慢↔思考档」因果链——用户第一次能把慢归因到可调的东西（顶栏旋钮既有，W3 已支持改模型默认档）。
- **次级供给=思考草稿折叠面板**（仅 glm 系有帧时出现）：忙碌条内「看看它在想什么 ▸」展开，尾部跟随自动滚动，**不插聊天流、不留会话库、回合结束即弃**。默认折叠；展开面板显示缓冲区尾部（上限 32KB 显示缓冲，防 8-12min 深档会话的无界 DOM——R2 同族约束）。
- **deepseek 诚实降级**：无帧=只有计时+通用阶段（「正在干活 · 已 N 秒」），不造「它在想」的假象，也不加「这个模型不播报思考」的厂商比较文案（妻子无行动可用，纯噪音）。两点黑箱收成一点：时间在走=活着。
- **不做**：AI 摘要/翻译（新模型调用成本）、思考原文进聊天流（research/44 亲证聊天流插临时元素正是异常元素病根 a）、thought 持久化（sessions.db 不加表）。

**IA 检查单（R1-R4）**：R1——状态条归属输入区忙碌域，不进聊天消息域（与 F5① 的教训同向）；R2——非清单，无界内容用 32KB 尾缓冲截断；R3——档位配置仍在顶栏（改了去哪看效果就在哪），状态条只读；R4——标签全人话（THINK_LABELS 既有），英文原文是机器产物、由人话标题承载身份，不编造用途。

**母句（三问可答）**：这是它干活前边想边说的草稿——从哪来：模型自己边想边写的（原文可能是英文）；怎么变：想到哪更到哪，只露最后一段，想完开口说话就自动收起；变了什么：收起后不留在对话里，对话只留正式回答。

### 3.2 默认思考档放大器——表不动，首档不降，靠可见性闭合

三次为什么：用户选 flash 的真实任务是什么？→ 快（名字即厂商自己的快变体命名）。官方 default=max 的语义？→ API 层「开发者不传参时的缺省」，是厂商事实，不是产品对用户任务的推荐。ZCode 先例？→ reasoningLevel 是会话层拥有的概念（undefined 抛错），档位选择权在会话/产品层，不外包给 API 默省——但 ZCode 默认档怎么选 UNVERIFIED。

**裁决**：
1. **预置表 default 字段一个字不动**（conf/model-presets.json / data/model-caps.json 官方源值）。s102 刚立「预置=官方真值」并修完 71→75 条审计；改 default=把产品判断伪装成厂商事实，且方向上复刻 s102 刚修掉的「运行时悄悄改变官方默认行为」——那次是悄悄开，这次是悄悄关，同族错误。
2. **不做「flash 系默认 low」的名字启发式首档改写**。理由：无用户行为证据支撑「选 flash 的用户都要快」（只有一条抱怨样本）；按名字猜档位正是 s101 被用户点名「预置拍脑袋」的同类动作。首档策略是产品自由度（F9 两层分离+ZCode 会话层先例），但**行使它需要证据，本次不动**。
3. **本批的修法=可见性**：3.1 的档位人话进忙碌条，把「为什么慢」从隐藏状态变成决策时刻可见。用户想要快→顶栏调低一次→lastThinkOverride 习惯记账，永久生效；想让某模型永远低档→能力编辑器改 default（W3「default 真消费」既有能力）。**既有出路已经全在，缺的只是让人看见。**
4. **重开触发器（留档）**：本批上线后若（a）📮 报告/日志显示高思考档会话占比仍高 且（b）「慢」类反馈持续——则以真实数据立项「新会话首档策略」，不再靠猜。

### 3.3 断线四通路——①②③进本批，④backlog

按「用户感知严重度 × 修复成本」排序取舍：

| 通路 | 感知 | 成本 | 裁决 |
|---|---|---|---|
| ① health-bar 插聊天流+8s 抖动 | 高（会话框内、健康时也闪，F6） | 低 | **进**。健康类瞬时态永远退出聊天流（聊天流只留对话实体），由既有顶栏断线点+顶部提醒条承载；探测去抖=down 需连续 2 次失败确认、超时 8s→15s（/models 实测 1.6-9.1s，F5——慢≠不可用） |
| ② S26 正则误报 | 高（成功回复画💡「服务商不通」卡+触发复检又可能喂①，用户聊「慢/限流」必中招） | 低 | **进**。收窄判定面：成功 stop 的回合**不再**进 upstream 计数、不触发健康复检、前端不画💡卡；正则分类只保留给异常收尾（流错误/die/空正文/reject）路径。注意取舍：这会拿走报告现有的（失真）上游信号，由 3.4-S4 的真实状态码/错误体行替代——净观测能力上升 |
| ③ 重启收口工具卡翻「失败」 | 中高（dev 期高频；每次重启全员进行中工具卡翻红） | 极低（文案+态） | **进**。ws.onclose 的 zombieToolcards 改中性态「连接断了，这一步的结果不确定」——桥重启/栈重启场景下并未失败，不许撒谎 |
| ④ sid 复用竞态 | 中（仅删当日最新会话后触发；救援已自愈 +2s，可见残渣=一张⚠卡） | 中高（动 goose 发号，需墓碑/占号设计，research/18/21 家族） | **不进**。backlog 留档：触发器=生产环境复现记录或「切换失败」卡反馈再现；候选修法=RCA 建议 7（占号空壳）。本批不碰 goose 会话发号 |

### 3.4 观测通道——直写双文件 + 报告补读，G1-G9+G14 进批

**主通道=appendFileSync 直写**（F7 实证 console.log→pc.log 不可靠；llmproxy.log 直写是既有先例）。选型：
- **按域两文件**，不搞单一 events.log 大杂烩：`data/logs/llmproxy.log` 扩展为 LLM 请求域（别名+非别名**同一行格式**，替换现有半行）；新增 `data/logs/events.log` 承载产品运维事件（test/list_models、providers 变更、switch/set_think、健康探测、hotRestart）。理由：两域写入频率/消费场景不同（每请求 vs 每操作），且 llmproxy.log 已有身份与读者；单一真相源按域不按文件名。
- **行格式**：单行 JSON 文本（ts+域字段），不引结构化日志框架。llmproxy 行=RCA 建议 8：`ts/model/effort/首字节ms/总ms/状态码/错误体前120字节`——**effort 必须在行内**，这是「为什么慢」归因链的钥匙。events 行=`ts/事件类型/host域名（脱敏同 reportSanitize 口径）/结果/耗时/错误摘要`。
- **体积护栏进本批**：两文件同款轮转（5MB×3 备份，写前查大小）。现状 llmproxy.log 无轮转，全请求留痕落地后不设护栏=违反 R2 无上限增长同族纪律。

**缺口取舍**（对照 research/45 §4）：进批=G1（LLM 主路径行）、G2（test_model 行+statsBump `providerTests.{ok,fail}`）、G3（list_models 行）、G4（由 G1 覆盖+报告纳入）、G5（报告补读：llmproxy 尾30+events 尾50+ring buffer `pc process logs chat-bridge` 尾50——appsAppLogs :2746 现成复用）、G6（providers 变更行）、G7（switch from→to/set_think 行）、G8（hotRestart 触发源行——写 events.log 不写 console）、G9（健康探测收敛行：state/kind/耗时ms）、G14（报告会话概况节补 usage_ledger 近 7 天请求数/模型分布聚合一行）。挂 backlog=G10（explain/optimize 直调留痕）、G12（sched 操作）、G13（apps 启停）——低频低感知，等 events.log 写入器沉淀一个周期再补行；G11（pc.log 冲刷）无动作项，靠 G5 缓解（pc 产品行为不可改）。

**📮 报告补读后能答**：「你刚才那次操作（测试/拉取/切换/慢请求）发生了什么」——host、HTTP 码、耗时、effort、错误摘要全在；这正是用户主线2的原话诉求。

### 3.5 测试面——触桥批全清单 + 新增留痕/渲染断言

- 任何触 chat-bridge.tpl.js 的切片（S3-S8）：§8.2 全清单必跑——e2e 62 + fuzz 225 + ui-logic 56 + ia-logic 34 + semantics-r5 38 + think-grad + capeditor（活体臂）+ modelcaps + proxythink + llmproxy-xlate + w2-preset，基线不破。
- S1/S2/S9（前端帧消费/呈现）：至少一条**活体探针**（真桥真 WS 帧，禁桩——s99 QA P1 假绿教训）覆盖帧→页链路 + ui-logic/ia-logic + e2e/fuzz 全量。
- S8 触 S26 语义变更：rescue-guard-probe 等既有 S26 锚点**同批随迁**（红绿对照留证，§8.2 明文）。
- 新断言全部要求**修前红**（判别力实证）：fp-probe 复刻=成功回复含 rate limit/timed out → 零💡卡/零 upstream 计数/零复检回执；s103-r2 零留痕探针反转为留痕断言（执行 test/list 后 6s 观察窗内 events.log mtime+行数变化+statsBump 键）。

---

## 4. 不做什么（负面清单）

1. 不改官方预置表 default 值（model-presets.json / caps 官方源）——官方真值原则。
2. 不做 flash/名字启发式的首档降档——无证据，s101 同族错误；重开需触发器（3.2-4）。
3. 不修 sid 复用竞态（④）——backlog 带触发器，不碰 goose 发号。
4. 思考原文不进聊天流、不进 sessions.db、不翻译、不 AI 摘要。
5. 不引日志框架/结构化日志改造/新依赖——单行 JSON 文本够用。
6. 不动 pc.log 冲刷行为（pc 上游产品行为）。
7. 不做 G10/G12/G13（本批），不做「该模型不播报思考」类厂商比较文案。
8. 不把思考旋钮搬进聊天流或新建设置面——顶栏既有，忙碌条只读展示。
9. 不重排/删除既有 statsBump 键，只新增（providerTests 等）。
10. 不做健康探测的「更轻端点」更换（RCA 建议 5 的可选半句）——去抖已足够，换端点引入新变量留观察。

---

## 5. 验收标准（逐项可验证）

| 切片 | 验收 |
|---|---|
| S1 忙碌条 | 活体探针（真桥 glm-flash 真会话）：prompt 后 15s 内忙碌条出现「想」阶段+档位人话+秒数递增；首个 message_chunk 阶段翻「写答案」；deepseek 臂：无 thought 帧仍有计时+通用阶段；ui-logic/ia-logic 绿 |
| S2 思考面板 | glm 臂：展开见 thought 尾部文本且随帧增长、自动滚尾；首 message_chunk 自动收起；回合结束内容弃置（重开回合面板为空）；32KB 缓冲上限生效（灌帧探针）；聊天流 DOM 断言零新增消息节点 |
| S3 events 留痕 | ws 触发 test_model/list_models（假 provider ok+fail 双臂）→ events.log 各一行含 ts/host/http/耗时/错误摘要；statsBump providerTests.{ok,fail} 落当日文件；探针修前红（当前零留痕）实证 |
| S4 llmproxy 行 | 一笔真实请求 → 一行含 model/effort/首字节ms/总ms/状态码；别名+非别名同格式（llmproxy-xlate 探针随迁）；轮转：写超 5MB 产生 .1 备份并截断主文件 |
| S5 运维事件行 | providers 保存/switch（含 from→to 与原因）/set_think/hotRestart（触发源）/健康探测（state/kind/耗时ms）各操作一行落 events.log；host 脱敏断言 |
| S6 报告补节 | 实测生成报告含：llmproxy 尾30 行、events 尾50 行、ring buffer 尾50 行、usage_ledger 近 7 天聚合行；当日操作可在报告内回答「刚才那次测试/请求发生了什么」 |
| S7 健康条 | 假 provider 慢 /models（>8s<15s）单次探测失败：不翻 down、不插聊天流；连续 2 次失败才 down 且只反映顶栏；聊天流 DOM 断言零 health-bar（修前红） |
| S8 S26 收窄 | fp-probe 复刻：成功 stop+命中关键词 → 零💡卡/zero upstream 计数/零复检回执帧；真错误臂（SSE error 体/401）仍计数仍人话卡；既有探针锚随迁红绿留证 |
| S9 中性收口 | 模拟 ws.onclose（重启桥）→ 进行中工具卡显示「连接断了，这一步的结果不确定」，不出现「失败」红字 |
| 批级 | §8.2 全清单基线不破（e2e 62/fuzz 225/ui 56/ia 34/sem 38/capeditor 141/modelcaps 43/w2-preset 15/think 35/think-grad 27/proxythink 30/xlate 10/w1-effort 14）；新探针全部修前红实证；探针残留自清（§8.1） |

成功指标（观察窗=上线后下一反馈周期）：主线1——「不知道在做什么」类反馈归零；高思考档会话在忙碌条上可见档位（活体断言代位）。主线2——用户点名两操作 6s 内盘上有痕（对 s103-r2 零留痕实证的直接反转）；📮 报告可独立回答「刚才那次操作发生了什么」。

---

## 6. 切片划分（pf-engineer 执行序，每片独立 commit）

热区串行，先让用户看见，再止血异常元素，再补仪器：

| 序 | 切片 | 一句话 | 触达 |
|---|---|---|---|
| S1 | 忙碌条三要素 | 阶段（想/动手/写答案）+秒计时+当前档人话（THINK_LABELS 单一真相源），thought 分支从 keep silent 改为喂状态 | forge/conf/templates/chat.tpl.html |
| S2 | 思考草稿面板 | 忙碌条内折叠展开、尾随滚动、32KB 缓冲、回合结束弃置 | forge/conf/templates/chat.tpl.html |
| S3 | events.log+测试拉取留痕 | appendFileSync 写入器+test_model/list_models 行+providerTests 计数 | forge/conf/templates/chat-bridge.tpl.js |
| S4 | llmproxy 全请求行+轮转 | 非别名/别名同一行格式（ts/model/effort/首字节/总时/码/错误摘要）+两日志 5MB×3 轮转 | forge/conf/templates/chat-bridge.tpl.js |
| S5 | 运维事件行 | providers 变更/switch from→to/set_think/hotRestart 触发源/健康探测耗时，全落 events.log | forge/conf/templates/chat-bridge.tpl.js |
| S6 | 报告补读四节 | llmproxy 尾30+events 尾50+ring buffer 尾50+usage_ledger 7 天聚合 | forge/conf/templates/chat-bridge.tpl.js（报告生成段） |
| S7 | 健康条出聊天流+去抖 | 删聊天流插入路径（顶栏断线点+提醒条承载）；down 需连续 2 次失败、超时 15s | chat-bridge.tpl.js + chat.tpl.html |
| S8 | S26 收窄 | 成功 stop 回合摘出 upstream 计数/复检/💡卡；异常收尾保留；探针随迁 | chat-bridge.tpl.js + chat.tpl.html + tools/e2e 探针 |
| S9 | 断线中性收口 | zombieToolcards「失败」→「连接断了，这一步的结果不确定」 | forge/conf/templates/chat.tpl.html |

backlog（带触发器）：④ sid 复用竞态（修法候选=占号空壳，触发=生产复现/反馈再现）；G10/G12/G13 事件行（触发=events.log 沉淀一周期）；首档策略（触发=3.2-4 双条件）；S26 正则最终形态（若 G1 数据显示异常收尾分类仍漏真错，再议多关键词共现）。

## 7. 对研究结论的采纳/拒绝（留痕）

- 采纳：research/44 全部根因链与建议 1/2/4/5(去抖半)/6/8；建议 3（预置表调低 flash 默认）**拒绝**，理由见 3.2；建议 5 的「换更轻探测端点」半句拒绝（负面清单 10）；建议 7（sid 占号）backlog 不进批。
- 采纳：research/45 G1-G9、G11 缓解、G14；G10/G12/G13 backlog。矩阵「报告答不了」清单全部由 S6 关闭或显式 backlog。
