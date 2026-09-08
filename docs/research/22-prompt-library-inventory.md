# 22 提示词库 + 输入框 Tab 触发：现状与集成点盘点

- 日期：2026-09-08（s76c 后）
- 性质：纯取证，未改任何产品代码、未动用户数据（只读探针）
- 用途：pm 裁决「提示词管理（库+搜索+分页）」与「输入框 Tab 唤起提示词搜索」两条主线的供料
- 验证级别标注：`VERIFIED-DOC`=本机源码核对（文件:行号）；`VERIFIED-RUN`=本机跑通（含日期）；未标注=推断（UNVERIFIED）

## §1 输入框与键盘现状（forge/conf/templates/chat.tpl.html，下称 tpl）

### 1.1 输入框元素
- `#txt` = **单行 `<input>`**（非 textarea）：tpl:334。`autocomplete="off"`，placeholder=「想让我做什么？输入 @ 引用文件或数据表」（只宣传 @，无 Tab 字样）。[VERIFIED-DOC]
- 位于 `#inputbar`（tpl:333-338），同容器挂 `#at-menu`（tpl:337，CSS tpl:273：absolute、bottom:100% 上弹、max-height:200px、z-index:50）。
- 单行 input 意味着：**无多行语义**，Shift+Enter 换行物理上不存在（也没有任何 Shift+Enter 绑定）。

### 1.2 现有按键绑定全景
| 键 | 行为 | 位置 |
|---|---|---|
| Enter（非 IME 组合态） | 发送；slash 菜单开着→执行高亮项；at 菜单有高亮→选中该项 | tpl:1160-1172 |
| ↑/↓（非 IME 态，slash/at 菜单开着） | 环形移动菜单高亮 `menuHl` | tpl:2199-2207 |
| Esc（输入框，非 IME 态） | 关 slash/at 两菜单 | tpl:2208 |
| Ctrl+K（document 级） | 新对话 | tpl:1189 |
| Ctrl+/（document 级） | 打开技能弹窗 | tpl:1190 |
| Esc（document 级） | 逐层关：model-pick 下拉→设置→管理→技能弹窗 | tpl:1191-1197 |
| Enter/Space（model-pick 聚焦时） | 开合模型下拉 | tpl:903-904 |
| Esc（chat-search 框） | 清搜索面板 | tpl:1491 |

- Enter 发送守卫：`!e.isComposing`（tpl:1161）。[VERIFIED-DOC]

### 1.3 Tab 键现状：完全未占用
- 全文件唯一 "Tab" 字样是 tpl:902 注释（model-pick `tabindex="0"` 可被 Tab 聚焦的 a11y 兜底，Enter/Space 激活）。**没有任何 `e.key==='Tab'` 处理器**；输入框内按 Tab = 浏览器默认焦点跳走。[VERIFIED-DOC]
- 含义：Tab 可安全绑定为「唤起提示词搜索」；代价是输入框内失去键盘焦点移动语义（a11y 出路：Tab 唤起菜单后菜单本身可 Esc 退出、焦点仍回输入框，参照 at-menu 先例 tpl:1840）。

### 1.4 中文 IME 输入态处理
- **没有** compositionstart/compositionend 监听；全部走 keydown 的 `e.isComposing` 属性判断，共两处：Enter 分支（tpl:1161）、菜单键盘导航分支（tpl:2201，注释明说「IME 组合期 ↑↓/Esc 属输入法操作（选字翻页/取消组合），不劫持」，qa 返工 P2-1）。[VERIFIED-DOC]
- Tab 触发必须加同款 `if(e.isComposing) return;` 守卫——选字态按 Tab 是部分输入法的翻页键，劫持会打断选字。
- @ 菜单的 IME 兼容路线=输入事件驱动（`input` 事件在 IME 提交后才携带组合文本，天然避开采字中间态）+ 上述 keydown 守卫；Tab 方案照抄即可。

### 1.5 @ 引用菜单机制（Tab 菜单最直接的形态参照）
- 触发：`txt` 的 input 事件，正则 `/@([^@\s]*)$/` 匹配 value 尾部（tpl:2183）；防抖 180ms（tpl:2180-2184）；竞态守卫 `atGen` 代际号（tpl:1826-1831）。
- 数据源：`/api/artifacts?ws=`（当前工作区文件）+ `/api/db/overview`（库表，60s 缓存 dbOvCache，tpl:1820-1824）。
- 上限 12 条 + 溢出提示「还有 N 张表没列出来，多打几个字缩小范围。」（tpl:1833 文件段 slice(0,12)；tbl 段 slice(0,12) tpl:1856 + 溢出提示 tpl:1862-1866）。[VERIFIED-DOC]
- 选中行为：正则替换掉 `@xxx` 尾缀为引用文本+空格、收菜单、焦点回输入框（tpl:1840,1859）。

### 1.6 草稿持久化：不存在
- 草稿=内存中的 `txt.value`，刷新即失。全文件无 `pf_draft`、无 `beforeunload`、无 sessionStorage。[VERIFIED-DOC]
- 仅有的「草稿保卫」机制（均非持久化）：
  - rollbackQueue 让位草稿上墙展示，**200 字截断**「…（太长，只显示前 200 字）」tpl:890（s62/P3 落地、s63 journal 2026-09-04-s63-p3-clear.md:9 记录）。[VERIFIED-DOC]
  - pendingRetry 草稿守卫（换线路自动重发遇新草稿则放弃，tpl:986，s50f）。
  - 「取回修改」把消息装回输入框（tpl:2019-2020，载入+聚焦+光标到末尾、**不自动发送**——pm 裁决 2026-09-07-batch1 C 红线）。
- localStorage 只存主题（pf_mode_ui/pf_skin/pf_fsz/pf_dens，tpl:536-553）与工作模式 pf_mode（tpl:606,1249）。[VERIFIED-DOC]

## §2 可复用机制盘点

### 2.1 斜杠命令（s13：中英模糊匹配+技能并入）
- 常量 SLASH 7 条（tpl:2162-2170），形状 `{cmd:'/新对话', alias:['new','xin','开新'], desc, run}`；技能动态并入 `loadSkillCmds`（fetch `/api/skills` → `/技能·名字` 条目，tpl:2154-2161）。[VERIFIED-DOC]
- **匹配算法 `slashHits(q)`（tpl:2171-2179）**：haystack = cmd(去首/) + desc + alias 数组拼接，整体 lowercase；token 化 `/[\s\/·]+/` 后 `token.startsWith(q)` **或** 整串 `includes(q)`。「中英拼音」= 中文命令字直接可搜、英文/拼音全拼进 alias。纯前端、无依赖。[VERIFIED-DOC]
- 复用判定：提示词条目映射成 `{cmd, alias:[用户起的名/标签], desc:内容摘要}` 即可直接喂给 slashHits；中文提示词正文长，需额外决定是否把正文纳入 haystack（现状 desc 参与匹配，先例支持）。
- 显示上限 14 条 slice(0,14)（tpl:2190），**无溢出提示**（slash 场景未在 AGENTS.md:74 存量声明里，规模小未被审查要求；提示词库若复用此 UI 且预期 >14 需补溢出提示对齐 R2「截断必须有出路」）。
- 菜单容器 `#slash-menu` 挂 body、bottom:64px、z-index:40（tpl:376）。

### 2.2 @ 引用菜单（R2 天然合规先例）
- AGENTS.md:74 存量声明原文：「@引用菜单=输入驱动即时过滤（12 条上限+溢出提示），R2 天然合规」。
- UI 形态（上弹菜单+.mi 行+主名 b+右侧灰注）、防抖/竞态/上限/溢出提示/选中回填全套可复用（见 §1.5）。键盘导航与 slash 菜单共用 `menuHl`（tpl:2147-2153，函数声明提升供上方 keydown 引用——**第三个菜单（提示词）可继续共用**）。[VERIFIED-DOC]

### 2.3 分页器组件（s76 fa07896 + s71）
- `pageSlice(arr,key,n)`（tpl:1924-1929）：通用切片，缺省页大小 SKILL_N=12（卡片型），行型传 PAGE_N=30（tpl:2226）；页号集中存 `listPage`（tpl:1923，key 需新增注册）。
- `pagerPaint(id,page,pages,total,go)`（tpl:1930-1939）：pages<=1 时整块不渲染（阈值内零机制）；‹› 按钮（热区≥32px）+「第 p/P 页 · 共 N 条」。
- 会话列表=搜索+分页完整样板：arch-q oninput 防抖 200ms、过滤变化回第 1 页（tpl:748-749）；renderSessions 活跃/归档两视图各自分页共用容器（tpl:704-731）。[VERIFIED-DOC]
- **规模声明活样板**：tpl:722-724 注释「单机个人使用，活跃会话终态预期 ≤100 条…当前落 R2 31-100 档=分页+搜索」——新清单提交时的声明格式照此写。

### 2.4 管理面板五标签结构（s76 a26499b）与「提示词」域归属候选
- 现五标签：🧠本事(ext)/🗄️数据(db)/💭记忆(mem)/⏰定时(sched)/🔌插件(mcp)（tpl:417-423）；六→五=安全护栏 tab 拿掉、四档人话迁工作模式现场（STATE.md:3，a26499b）。[VERIFIED-DOC]
- 技能弹窗双 tab（我的技能/＋添加新技能，tpl:381-384），各自搜索框+分页器（tpl:386-394）。
- **新「提示词」域候选位置**（R3 判据=「配置跟着『改了它去哪看效果』走」，AGENTS.md:71）：
  1. **管理面板第六 tab**。依据：面板自述「它是什么样、会什么、记了什么、几点干活」（tpl:416），提示词库=个人资产，与记忆/定时同类。反依据：R3 字面——提示词的**效果出现在聊天输入框**（插入即用），不在管理面板；且刚从六减到五再加回六有结构反复嫌疑。
  2. **技能弹窗内新 tab**。依据：结构成本低（tab+spane 现成）。反依据：R1 一 modal=一类实体，提示词≠技能（技能=它怎么做，提示词=你要它做什么），塞进 🧩 语义错位；用户找「我说过的话」不会去点技能图标。
  3. **使用域就近入口（推荐给 pm 权衡）**：输入框旁（`#inputbar` 内）小图标按钮开提示词面板/popover；编辑/删除同域收进面板内。依据：R3 效果判据直指输入框；先例=技能源配置从管理面板搬进技能弹窗使用域（IA-1，tpl:396-411「技术设置：技能从哪进货」details.tz 折叠，R3 同域不同层）；Tab 触发入口也天然在输入框。
- 结论倾向（供 pm 裁决，非定论）：按 R3「改了它去哪看效果」，提示词库偏**使用域（输入框近旁）**；管理面板是按资产类型聚类的技术相似性路线，与本仓 R3 文字相悖。

### 2.5 其他可复用件
- 「取回修改」操作条（msgButtons tpl:2022-2028 + 事件委托 tpl:2019-2020）：载入+聚焦+光标末尾、不自动提交。提示词「选中即插入」行为建议对齐该裁决精神（插入≠发送），最终语义归 pm。
- QUICK_PROMPTS 开场快捷 chips（tpl:752-758，硬编码 5 条示例任务，点击填入输入框不发送 tpl:763）：「提示词快速使用」的最小先例。
- s48 报表引导（tpl:768-816）：结构化组装提示词后走 submit——与库无关，列作语境。

## §3 「已有提示词」语义候选

系统现存提示词类数据盘点：

| 留存 | 现状 | 位置/证据 | 可否当「已有提示词」 |
|---|---|---|---|
| 已发消息历史 | sessions.db messages 表 role='user' 共 **1709 条**（410 会话）[VERIFIED-RUN 2026-09-08，dev 库只读查询] | 桥只读入口 `/api/search`（chat-bridge.tpl.js:2114-2148，LIKE 匹配、LIMIT 40、防注入转义） | 会话粒度非条目粒度；无收藏/编辑；dev 库含大量调试噪音 |
| 草稿 | 不持久化（§1.6） | — | 无源可采 |
| 技能 | forge/.agents/skills 5 个目录**全部随包**（artifact-versioning/forge-selfcheck/scrape-table-to-db/see-image/skill-sediment，均无 origin.json）[VERIFIED-RUN 2026-09-08 目录遍历] | 技能=操作手册，非用户提示词；不混 | 不可 |
| 欢迎页示例任务 | QUICK_PROMPTS 5 条硬编码（tpl:752-758）；welcome.tpl.html 仅 44 行、无任务清单 [VERIFIED-DOC] | tpl 内嵌 | 可作为库的首批种子（是否入池归 pm） |
| 消息级复用 | 「取回修改」每条消息 hover 可取回（tpl:2019-2020） | 单条复用最小机制，无库化 | 入库动作的天然素材源 |

- **解读 A：历史自动留存（用户发过的都算）**——数据已在（1709 条），但全量入库=垃圾场（dev 树里短交互/探针居多）；且 sessions.db 归 goose 自迁移、永不手改（AGENTS.md §3.5），只读可行（/api/search 先例）、写入禁走。可行路径=**从历史/当前输入框「收藏」动作**抽取入库，而非全量自动留存。
- **解读 B：手工收藏库（显式保存）**——零存量，需新存储+CRUD；语义干净、规模可控、R2 声明容易。
- 两种解读最终落在同一个新存储上，差异只在入库动作的来源（B 纯手工新建；A=B+「从历史消息/输入框一键收藏」）。Tab 搜索消费的是同一个库，两解读对 Tab 功能零差异。

## §4 存储与桥端点候选

### 4.1 文件型状态存储先例（chat-bridge.tpl.js，下称 bridge）
- `atomicWrite(file,data)`：tmp+rename 断电安全（bridge:42-46，审查 I7）。[VERIFIED-DOC]
- `readJson(f,dft)`：读 JSON 剥 BOM（bridge:95，s50e）。[VERIFIED-DOC]
- data/ 下既有状态文件与读写函数：providers.json（bridge:569-581）、workspace-map.json（bridge:498-500）、session-archive.json（bridge:507-510）、stats/usage-*.json（bridge:99-118）、config/skill-sources.json（bridge:821+）、config/mcp-catalog.json（bridge:1138+）。dev 树实存 providers.json/session-archive.json 等 [VERIFIED-RUN 2026-09-08 ls forge/data]。[VERIFIED-DOC]
- **STATE_SCHEMAS 注册表**（bridge:419-469，ADR-0009）：新自有状态文件格式必须注册（_schema 起步版本+幂等迁移步骤+迁移前 .pre-migration 备份）；AGENTS.md §3.5 同款义务。
- pgStateSync 双写镜像（bridge:500,510，s73 切片2「文件先行 + pg 态整表同步镜像」）：文件=真相源，PG=镜像，可暂不挂。
- 内测期存储哲学旁证：/api/search 注释「当前量级（千条）毫秒级，量级上来再考虑 FTS5」（bridge:2115-2116）；schedule.json 归 goose 自管不手改（bridge:2150-2152）；记忆只读+删、不给人工写入口（bridge:2508「agent 自动记；人工代写易造成脏数据」）。[VERIFIED-DOC]

### 4.2 存储落点候选
- `data/prompts.json`（**推荐**）：与 providers/workspace-map/session-archive 同款先例（readJson+atomicWrite+STATE_SCHEMAS 注册 `'prompts.json': {latest:1, steps:{}}`），pg 态可后挂 pgStateSync。条目形状建议 `{id, name, body, created_at, updated_at}`（name 供 slashHits 式匹配与 R4 人话主名）。
- conf/ 下：不合适——conf/ 是产品配置树，用户数据先例全在 data/。
- 入 PG / 写 sessions.db：无必要先例；sessions.db 永不手改（AGENTS.md §3.5）；文件+atomicWrite 即内测期答案。

### 4.3 桥端点清单候选（对照现有命名习惯）
现有习惯：全小写路径 `else if (url === '/api/xxx')` 路由链（bridge:1774 起）；GET 读 POST 写；响应 `{ok, err}` 约定（bridge:2495-2500）；Origin 跨站写拒绝（bridge:1778-1783）与 POST 预算预检（bridge:1787-1795）自动覆盖新端点。两种 CRUD 风格都有先例：
- op 风格（对齐 /api/memory，bridge:2549-2558）：
  - `GET /api/prompts` → 全量条目（量级小全量返，前端 pageSlice 分页，对齐 skills/store 前端分页 tpl:1885-1917/1948-1984）
  - `POST /api/prompts` → `{op:'add'|'update'|'delete', ...}`
- 动词后缀风格（对齐 /api/fs/new|rename|delete，bridge:2745-2800）：`/api/prompts/add` 等。
- 搜索：**前端过滤**（对齐 skills-q/store-q 的 lowercase includes，tpl:1888-1889,1950-1951）——条目 <几百 时无需服务端搜索；slashHits（tpl:2171-2179）可同时喂 Tab 菜单。

### 4.4 桥存活验证
- `GET http://127.0.0.1:8790/healthz` → `ok` [VERIFIED-RUN 2026-09-08]
- `GET /api/skills` → JSON 数组正常返回（Git Bash 控制台显示 GBK 乱码系**本机控制台解码问题**，响应 charset=utf-8 且与目录清单内容一致——观测工具干扰已排除，非服务端问题）[VERIFIED-RUN 2026-09-08]

## §5 规模预期素材（R2 声明参考，归 pm 定档）

- **妻子场景**（零技术背景）：常用话术高度重复（报表/查数/看图），预期起步 0-8 档、终态 9-30 档（R2=必须带搜索）。
- **硬核内测用户**（当前唯一真实用户）：dev 库 user 消息 1709 条 [VERIFIED-RUN 2026-09-08]——若走「历史全量留存」即 >100 档（R2：搜索+分页即满足找回，单实体清单不强造分组，AGENTS.md:70）；若手工收藏制，个人活跃话术通常 10-50 条 [UNVERIFIED——推断，无本地实证数据源]。
- 设计建议（供 pm）：按 **31-100 档**声明与实现（搜索+分页：卡片 12/页或行型 30/页，pageSlice/pagerPaint 现成），上覆盖硬核用户终态、下兼容妻子场景（≤8 条时 pagerPaint 自动零机制 tpl:1933）；>100 靠搜索+分页，不造分组。QUICK_PROMPTS 5 条若作种子，起步规模即 5。

## 附：本报告排除项
- 未验证线上（产品树）与 dev 树的 diff——全部取证基于仓库 dev 树（forge/conf/templates + forge/data）。
- 未做任何浏览器端按键实测（Tab/IME 行为结论全部来自源码静态核对 + isComposing 守卫先例的既验证历史）；如 pm 需要活体证据，可在 dev 栈上用 browser-use 走一遍 Tab/选字态实测。
