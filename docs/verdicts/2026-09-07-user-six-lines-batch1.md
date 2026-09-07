# 裁决书：用户六主线·第一批（A see-image 视觉辅助修复 / B 安全护栏 tab 归宿 / C 消息取回修改）

- 日期：2026-09-07 ｜ 决策人：pf-pm ｜ 输入源：用户（内测期硬核技术型用户）2026-09-07 点名六主线；主控代码级取证，本裁决抽核关键源码
- 结论先行：
  - **A=做**：vision.js 走 gen-xlsx 同款「conf/templates 模板 → bootstrap 物化进 forge/bin/」既有模式（s40 先例）；环境变量 `FORGE_VISION_MODEL` 持久化进 `data/secrets.env`，**由 vision.js 自身提供 `--get-model`/`--list-models`/`--set-model` 三个子命令**——agent 全程零接触 API key；SKILL.md 按新命令面重写，含未设置时的对话引导流程。
  - **B=拿掉 tab**：两句静态说明迁到工作模式切换现场（R3：解释跟着使用现场走），管理面板六标签→五标签（取代 ia-root-cure §4.2「六标签不增不减」）；动态工具清单（候选 b）挂起，触发器制。
  - **C=操作条重发改为「取回修改」**：载入输入框、聚焦、不自动提交；错误卡「换备用线路再试」的自动重发（s50e 韧性语义）逐位不动。候选 b（新增编辑按钮、重发保持自动提交）否决。
- 关联：ADR-0006 零二开 ｜ AGENTS.md §2 硬约束、§7 R3/R4 ｜ ia-root-cure §4.2（部分取代）｜ bootstrap s40 gen-xlsx 物化先例（bootstrap.ps1:157-160）｜ s50e/s50f 换线重发与竞态修复 ｜ s62/s63 msgText 正文提取唯一入口 ｜ s15 atomicWrite 纪律 ｜ s74 物化纪律③（改模板必须重跑 bootstrap）

## 0. 范围

用户点名六条主线，其中三条主控已直接处理、无需产品裁决；本文只裁 A/B/C。三条互相独立，可并行切片。

## 1. 事实基线（全部亲核源码）

| # | 断言 | 依据 |
|---|---|---|
| A1 | SKILL.md 指示 agent 执行 `<FORGE_ROOT>/tools/vision.js`，是全仓唯一引用点 | forge/.agents/skills/see-image/SKILL.md:16；全仓 grep 仅此一处 |
| A2 | vision.js 实际在仓库根 tools/（开发侧）；package.sh 对 forge/ 下出现 tools 目录直接拒打包；tools/ 本身不进包 | tools/vision.js；tools/package.sh:10-12 守卫 `for junk in docs DECISIONS tools` |
| A3 | vision.js 从 `forge/data/secrets.env` 读 FORGE_AGENT_HOST/FORGE_AGENT_API_KEY，OpenAI 兼容 `/chat/completions` 发图，默认模型硬编码 `myopencode/glm-5.2`，argv 可传 model；ROOT 计算假定自己住在 forge/ 的兄弟目录 | tools/vision.js:7,18,22,27-28 |
| A4 | secrets.env 是桥管理的用户数据文件（升级保留）；桥保存服务商档案时幂等重写，**只过滤 GOOSE_MODEL_NAME / FORGE_AGENT_HOST / FORGE_AGENT_API_KEY 三键，其余行原样保留**——新增键可存活 | chat-bridge.tpl.js:3197-3202、:3253-3258 |
| A5 | agent 侧先例：gen-xlsx 工具 = conf/templates/gen-xlsx.tpl.js 由 bootstrap Copy-Item 物化为 forge/bin/gen-xlsx.js，hints 以 `__FORGE_ROOT__\bin\...` 绝对路径教用 | bootstrap.ps1:157-160；goose-hints.tpl.md:81-93 |
| A6 | 桥向 goose 进程注入 PATH/FORGE_ROOT 环境变量 | STATE s47 路线决策行（VERIFIED；目标机复验项仍在） |
| B1 | 「安全护栏」tab 只有两张静态说明卡（档位解释 + 重要操作问我档下哪些动作先问），无任何逻辑 | chat.tpl.html:477-481 |
| B2 | 护栏本体=顶栏工作模式四档 select，真实生效（session/set_mode）；切换处当前零人话反馈，仅失败报错 | chat.tpl.html:320-325、:613、:1238 |
| B3 | permission.yaml：smart_approve.ask_before=26 个英文工具名，user.never_allow=browser_run_code_unsafe；goose 启动会自写规范化该文件，三键齐写否则 panic——它是 goose 运行时状态，不是产品配置 | conf/goose/config/permission.yaml；STATE s69 遗留⑦、research/12 §3.3 |
| B4 | 护栏 tab 零测试引用（e2e/ui-logic/fuzz 全 grep 无 guard 断言） | tools/e2e/ 全量 grep |
| C1 | 每条消息（用户+agent）操作条 [复制][重发]；重发=正文进输入框并立即 `submit()`，用户无修改窗口 | chat.tpl.html:2005、:2009 |
| C2 | 错误卡「换备用线路再试」=s50e 韧性特性：换线后自动重发**原文**，闭包内实现，带「用户已打新草稿则放弃」守卫（s50f） | chat.tpl.html:887、:982-986、:1156 |
| C3 | msgText() 为复制/重发/导出共用的正文提取唯一入口（剥 .mbar 操作条） | chat.tpl.html:2014（s62/P3、s63） |
| C4 | 操作条重发路径**零既有断言**；s50f-assert.js 断言的是错误卡闭包路径（submitted/removed/txtSet 三条） | tools/e2e/s50f-assert.js:32-34；e2e-chat.sh/ui-logic-probe.js/fuzz-chat.sh grep 无 retry/msgbtn |
| C5 | 操作条重发不回滚历史——是向会话**追加**一条新消息；自动提交版误点即烧一次真实 LLM 调用 | goose 会话语义（追加式）；chat.tpl.html:2005 行为推演 |

## 2. 主线 A：see-image 视觉辅助修复

### 2.1 归约（三次为什么）

1. **为什么这是缺陷而非新功能？** 交付物里技能指向的文件物理不存在（A1+A2）——技能在生产上是坏的。视觉辅助是交付验收线明确列出的一项（STATE 交付物验收线「视觉辅助 ✅」），该 ✅ 只在 dev 树成立，交付包内为假。验收线失真比功能缺失更重。
2. **为什么用户点名的是「环境变量持久化设模型」而不是「修好就行」？** 归约到真任务：用户要的是「agent 与我沟通后，自己把视觉模型定下来，以后一直用它」。即三件事：得知候选模型 → 与我确认 → 持久化。持久化的落点必须是升级保留、agent 可写、vision.js 可读的地方——`data/secrets.env` 三条全占（A4），且桥重写不会冲掉新键。
3. **为什么不让 agent 直接改 secrets.env / 直连桥 API？** secrets.env 同时载有 API key——教 agent cat/编辑该文件 = 密钥进对话上下文与日志，一次教训换不回来；agent 默认无桥通道（已验证事实），为视觉功能开通道违反最小 diff 且破「设施对 agent 透明」约束（§2-8）。所以写入口必须收在 vision.js 自己手里，agent 只会调命令，永远不会看见 key。

### 2.2 裁决

**修，按 A5 先例物化 + 子命令化。**

1. **落位**：`tools/vision.js` → `forge/conf/templates/vision.tpl.js`（git mv，真相源入库）；bootstrap.ps1 增「5f) vision 工具生成」Copy-Item 物化为 `forge/bin/vision.js`；打包后 forge/bin/vision.js 随包。ROOT 计算改一行：`path.resolve(__dirname, '..')`（bin/.. = FORGE_ROOT），secrets 路径不变。
2. **环境变量设计**：
   - 变量名 `FORGE_VISION_MODEL`，写 `data/secrets.env`（升级保留，A4 已证桥重写可共存）。
   - vision.js 增三个子命令（均在无 key 泄漏的前提下工作）：
     - `--get-model`：打印当前生效视觉模型（env 值 → 缺省回退硬编码 `myopencode/glm-5.2`），不碰网络。
     - `--list-models`：读 secrets 中的 host/key，GET `{host}/models`，**只打印模型 id 列表**（与前端 list_models 同一数据通道，chat-bridge.tpl.js:3127-3138 同款）；key 永不出现在 stdout/stderr。
     - `--set-model <id>`：幂等重写 secrets.env——过滤既有 `^FORGE_VISION_MODEL=` 行、原子写（tmp+rename，s15 纪律）、追加新值；打印「视觉模型已设为 X，立即生效」。
   - 正常看图路径：每次调用重新读 secrets.env（现行为），`FORGE_VISION_MODEL` > argv model > 硬编码缺省。设完即生效，零重启。
3. **未设置/调用失败时的对话引导流程**（写入 SKILL.md）：调用报错（模型不存在/服务商不通）→ vision.js 输出人话错误（含指引语）→ agent 跑 `--get-model` 报当前值 → 跑 `--list-models` 得候选 → 向用户列候选并建议（glm-5.2 已验证支持视觉）→ 用户点头 → `--set-model` → 复述确认 → 重新看图。
4. **SKILL.md 重写要点**：①命令全部改为 `%FORGE_ROOT%\bin\vision.js`（FORGE_ROOT 由桥注入，A6；SKILL.md 附一句「若 %FORGE_ROOT% 为空，安装目录见系统提示/工作区路径」兜底）；②新增「换看图模型」节 = 上述引导流程；③**硬边界条款：禁止读取或输出 secrets.env 内容**（看图/换模型都不需要它）；④保留「坑」节（kimi-k2.7-code 不行、glm-5.2 可以、1x1 红图验证法）。
5. **纪律**：零 goose 侧改动；桥零改动；dev 树改模板后必须重跑 conf/bootstrap.ps1（s74 物化纪律③）。

### 2.3 明确不做（A）

- 不做 agent 直达桥 API 的通道（§2.1-3）。
- 不做设置面板「视觉模型」UI 选择项：用户点名要的就是对话式设置；UI 重复入口违反验证优先，且视觉模型是技能参数，不是服务商档案字段（R3 归属不符）。
- 不做「可选池快照文件」（桥把 providers.json 的勾选池写成 data/model-pool.txt）：省 6 行桥改动的诱惑不成立——`--list-models` 走 live 接口零同步面；【假设标注：live /models 可能返回全量目录而非勾选池，条数偏多，由 agent 向用户转述时自行收敛】。挂起触发器见 §5。
- 不扩多图/多视觉模型路由/图片生成。

### 2.4 验收标准（A）

1. 交付链：重跑 bootstrap 后 forge/bin/vision.js 存在且与模板一致；重打包，解压后 bin/vision.js 在、forge/tools 不在（打包守卫零触发）。
2. 实景闭环（dev 栈 VERIFIED-RUN）：agent 收到「看看这张图」→ 调 bin/vision.js 返回正确描述。
3. 持久化实景：`--set-model X` 后 secrets.env 出现且仅一行 FORGE_VISION_MODEL；再跑看图使用 X；桥端保存服务商档案（触发 secrets.env 幂等重写）后该键仍在；重启桥后仍生效。
4. 引导实景：删掉 FORGE_VISION_MODEL 且默认模型在该服务商不存在 → vision.js 报人话错误 → agent 按 SKILL.md 走完 list→确认→set→重试全流程。
5. 密钥纪律：`--list-models` 输出与 SKILL.md 全文 grep 无 key 形态字符串（sk- 扫描）；agent 会话上下文无 key。
6. e2e-chat / fuzz 全绿不降线。

## 3. 主线 B：安全护栏 tab

### 3.1 归约（三次为什么）

1. **为什么用户说「很迷」？** 一个叫「安全护栏」的 tab 打开只有两句说明，且说明的对象（工作模式切换器）住在顶栏——解释与被解释物分居两个入口。用户期待「功能」实际是「解释」，而解释又没长在解释对象旁边。
2. **为什么它长成静态卡？** s17 建它时的本意=「把 permission 机制翻译成人话」（裁剪实现前先还原本意：用户意图=让妻子理解护栏，不是要一个管理界面）。意图本身仍然成立，错的是摆放位置。
3. **为什么不是补功能（候选 b 动态清单）？** 数据源 permission.yaml 是 goose 运行时自写状态（B3），26 个英文工具名直接上 UI 违反 R4（非中文人话主名必须带解释）——要合规就得维护一张 26 项人话映射表，且 goose 规范化重写随时改变条目，展示层永追运行时。零观测证据（B4 零测试引用、妻子侧无一例「想知道哪些会问」反馈）支撑不了这个维护面。**内测期验证优先于扩张：先删错位，功能化挂触发器。**

### 3.2 裁决

**候选 a（拿掉 tab + 解释迁往使用现场），具体为：**

1. 删除 mpane-guard 块与 rtab 行的护栏按钮（chat.tpl.html:423、:477-481），相关 JS 引用清零；管理面板六标签→五标签（本事/记忆/定时任务/插件/数据）。**本条取代 ia-root-cure §4.2「六标签不增不减」**——该条是防扩张约束，本裁决是用户点名的收缩，方向一致。
2. 两句说明精简为**每档一句人话**，落到工作模式切换现场：
   - 切换档位时 addInfo 一句反馈（现状 :1238 切换成功零反馈）：auto=「已切到自动干活：它不再逐项问您，重要操作做完会说明」；smart_approve=「已切到重要操作问我（推荐）：执行命令、改写文件、动数据库、开网页会先问您；只读的事直接做」；approve=「已切到每步都问我：它每做一步都先问您再动」；chat=「已切到只聊天不动手：它只回答，不碰文件和网页」。文案零术语审读。
   - select 的 title 同步为当前档位一句话解释（悬停兜底）。
   - 会话恢复路径（:613 saved!==cur 的 set_mode）静默，不弹提示——恢复不是用户决策时刻。
3. 静态卡内容准确性与 smart_approve.ask_before 实态核对一次（执行命令/改写文件/动数据/开网页与 B3 的 26 项大类吻合，无需改写，迁移时逐字过一遍即可）。

### 3.3 明确不做（B）

- 不做动态工具清单（候选 b）主体——挂起，触发器 §5-T2。
- 不做护栏 tab 内任何**可写**配置：permission.yaml 手改三键齐写缺一 panic（B3），UI 写通道=高风险零需求，永久否决。
- 不给顶栏加常驻解释文字（顶栏已满，且切换提示已覆盖决策时刻）。

### 3.4 验收标准（B)

1. 「护栏」按钮与 mpane-guard 全仓（模板+产物 .goosehints 之外面）grep 零残留；rtab aria/tabindex 无孤儿。
2. 四档逐一切换各出一句对应人话提示，取消/失败路径不弹；切回同档不弹（值未变则无 set_mode 语义——以 :1238 handler 实际触发为准，不另造）。
3. session/set_mode 零回归：含恢复路径 :613 与昼夜双主题目视。
4. e2e-chat / fuzz 全绿不降线；qa 按 R1/R3 走查五标签结构（本裁决是 R3 的正向应用案例）。

## 4. 主线 C：消息编辑后重发

### 4.1 归约（三次为什么）

1. **为什么用户要编辑重发？** 发出去后发现错字/表达不准/想补一句——沟通常态，高频；现状重发立即提交，落笔窗口为零（C1）。
2. **为什么自动提交是错的默认？** C5：本产品重发是**追加**不是回滚——自动提交意味着误点即烧一次真实调用，且把旧文重复灌进上下文；「重发」二字让用户误以为有 ChatGPT 式回滚语义。把决定权留在输入框（载入→目视→回车），语义才诚实。
3. **为什么不做候选 b（编辑+重发双钮）？** 两个按钮语义重叠（编辑=取回不发送；重发=取回即发送），差一次回车却让每条消息操作条从 2 钮涨到 3 钮；而「免回车的原样重发」的真实场景=服务商失败后重试——那条路已有专属实现（错误卡换线重发，C2），语义恰当地分离了：**错误卡=韧性自动补发，操作条=我要改改再说。两个任务两个入口，不要合并。**

### 4.2 裁决

**候选 a：操作条重发改为「取回修改」。**

1. 行为：`$('txt').value=msgText(msg)`（C3 唯一入口，照旧）+ `$('txt').focus()` + 光标移到末尾；**删去 `submit()`**（chat.tpl.html:2005 一行级改动）。
2. 标签：`'retry','重发'` → `'retry','取回修改'`（:2009）。标签必须跟着行为改——保留「重发」二字而行为变为不发送，是下一轮「很迷」的预约。
3. 草稿覆盖不做确认：点击「取回修改」=明确意图，覆盖输入框既有草稿与旧行为一致，不弹窗。
4. 用户消息与 agent 消息行为统一：agent 消息取回=把它的输出当草稿改，是合法用途（「照这个格式再要一份」）；不为消息类型做差异化分支（最小 diff）。
5. **红线：错误卡「换备用线路再试」逐位不动**（:982-986 闭包含 s50f 草稿守卫）——那是 s50e/s50f/s51c 三轮实修的韧性特性，自动提交正是其语义。

### 4.3 既有测试影响评估

- s50f-assert.js:32-34 断言的是错误卡闭包路径（submitted/removed/txtSet）——本裁决**不触碰该路径**，三条断言必须原样保持绿。
- 操作条重发路径经全量 grep **零既有断言**（C4）——无需改写任何断言。
- 新增一条 ui-logic 断言：点击操作条「取回修改」→ txt.value=剥操作条正文、**未触发发送**（无 ws send / busy 不变）。
- msgText() 为复制/导出共用（C3），零改动零回归面。

### 4.4 验收标准（C）

1. 任意消息点「取回修改」→ 正文进输入框、聚焦、光标在末尾、不发送；连点两次行为幂等。
2. s50f-assert 三条原样全过；错误卡实景（假 50x）换线→自动重发原文→草稿守卫生效，与改前逐位一致。
3. 复制/导出含操作条尾部文案时不再误裁（s62/P3 回归点）零变化。
4. e2e-chat / fuzz 全绿不降线；新 ui-logic 断言入第 14 节。

### 4.5 明确不做（C）

- 不做 ChatGPT 式编辑回滚/消息分支：会话史由 goose 侧持有，回滚需动会话数据结构且与「追加式」语义冲突——零二开纪律下成本收益不成立，挂起观察（触发器 §5-T3）。
- 不做行内编辑 UI（点击消息正文变输入框）：交互重构，超出本裁决范围。
- 不动错误卡重发语义（§4.2-5 红线）。

## 5. 挂起项与升级触发器（写死，防重新谈判）

| 挂起项 | 触发器（满足其一即重开，重开起点=本裁决对应小节，不重新归约） |
|---|---|
| A：可选池快照（data/model-pool.txt，桥写） | T1：真机反馈「看图该用哪个模型」迷路/选错 ≥2 次（live 列表对小白过长实锤时） |
| B：护栏动态工具清单（只读渲染 permission.yaml + 人话映射） | T2：妻子/用户反馈「到底哪些动作会被问」≥2 次且切换提示不够用 |
| C：编辑回滚/消息分支 | T3：真机出现「想把对话退回去重来」类诉求 ≥2 次，且伴随 PM 重新归约成本模型 |
| 反触发清单（不构成重开理由）：「竞品有」「顺手加一下」「反正 diff 不大」 | 先例：scheduler-drift-guard §4、plan-mode-thaw §5 |

## 6. 非目标（本批全部切片）

- 不二开 goose / faucet（ADR-0006）；桥零改动（A、C 两线不触碰 chat-bridge.tpl.js；B 线仅动 chat.tpl.html）。
- 不动服务商/模型池体系、不动工作模式后端语义（B 只动解释层呈现）。
- 不做视觉模型设置 UI、不做消息历史回滚、不做护栏写通道。
- 不回灌 v0.9.10 冻结包：三切片全部进下一班车（沿用 plan-mode-thaw §4 先例）。

## 7. 成功指标与 STATE 同步建议（主控执行）

- A：交付包内 see-image 实景可用（验收 2.4-2/3 全过=唯一硬指标）；护航期「看图失败/不知道用哪个模型」类反馈=0。观察窗=真机首周。
- B：管理面板五标签零「很迷」复述；工作模式切换提示被截图/转述≥1 次=解释层被消费的证据；「哪些会被问」追问≥2 次则 T2 触发。
- C：「发出去的消息无法修改」类反馈清零；误触重发导致的意外 LLM 调用不可直接观测，以用户无此类抱怨为间接信号。
- STATE：s75 后新增本裁决条目，三切片标记「已裁决待实施（下一班车）」；docs/verdicts/README.md 登记；六主线中另三条由主控直接处理、不在本裁决范围。
