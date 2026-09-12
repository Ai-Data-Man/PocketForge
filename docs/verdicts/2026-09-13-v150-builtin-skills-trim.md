# 裁决书：goose v1.50 捆绑内置技能 web-search / goose-doc-guide 去留

- 日期：2026-09-12 ｜ 裁决人：pf-pm ｜ 输入：journal s78 升级节观察项、research/23 §9.4、research/12（防护底稿）、docs/verdicts/2026-09-05-goose-guardrails.md（s69 先例）
- 证据等级：机制事实 VERIFIED-DOC（v1.50.0 tag 源码，GitHub raw + 本地 v1.46 树比对）；运行时事实 VERIFIED-RUN（dev 栈 v1.50 转储 + 仓库内代码直读）。本裁决新增取证 6 处，行内标注。
- 约束重申：零 fork、最小 diff、最小能力面（s69 G3 先例）、真机护航期=验证优先于扩张、目标机出网受企业管控、「设施细节对 Agent 透明」。

---

## 0. 归约：三次为什么

### 0.1 事实勘误（先还账再裁决）

升级批留档写「v1.50 新捆绑内置 skill web-search/goose-doc-guide」——**半失实**（本裁决新增取证：v1.46 本地源码树 builtins 目录仅 goose_doc_guide.md；v1.50.0 GitHub API 确认 builtins = goose_doc_guide.md 3942B + web_search.md 2107B，VERIFIED-DOC）。goose-doc-guide 自 v1.46 起就在产品里跑（research/12 §2.3 已档），从未被正式裁决过；v1.50 的真实增量只有 web-search 一条。本裁决 = web-search（首次过堂）+ goose-doc-guide（存量补审），两者同机制同批处置。

### 0.2 web-search 三问

1. **上游为什么捆绑它**：给 goose CLI 大众用户一个零 key 联网搜索默认路径（正文：默认 DuckDuckGo 走 `uvx ddgs`，需装 uv；Tavily/SearXNG 需 env key；另含 curl+html2text 抓页配方。全文已档 tmp/s78d-web-search.md，VERIFIED-DOC）。
2. **妻子场景值什么**：零。她的三类任务（报表/抓数入库/定时）全部内网闭环；公网信息需求在目标机上被企业出网管控结构性排除。技能描述却是常驻广而告之——「Use whenever the task needs current information, facts not in training data, **or content from a specific URL**」（dev 栈 v1.50 转储实见该行，VERIFIED-RUN）。
3. **留下的代价**：这条 prompt 行是给弱模型（deepseek-v4-flash）的持续指令，指向一条**产品不可见、不可管、必然失败**的路径——激活后走 shell（user.always_allow，**零卡**，permission.yaml 实读）尝试 `uvx`→装 uv（`curl|sh`，POSIX 形态在 cmd 下还会变形）→出网被拦。失败链烧轮数、产生 EDR 噪音、且全程不经过 s69 建立的审批卡纪律——shell 是卡墙上现成的洞，这个技能的内容就是照着洞写的。

**重叠度**：其「抓取指定 URL」配方与 fetch_url（fetch-mcp）功能 ~100% 重叠，但 fetch 是商店可装、面板可管、有来源的治理通道；其「搜索」增量恰好是部署环境唯一排除的能力。**结论：web-search 的能力增量 = 目标机不允许的能力；与其重叠的部分 = 产品已有更好治理的通道。**

### 0.3 goose-doc-guide 三问

1. **上游为什么捆绑它**：让 goose 运维者（开发者）写配置不靠幻觉字段。
2. **妻子场景值什么**：零。她永远不运维 goose；产品手册（hints）通篇不提 goose 名字，agent 自认「小 forge」，描述里的触发词（recipes/extensions/providers/goose-specific）在妻子语料里出现率≈0。**纯开发者向，对最终用户无可见价值**（正文已档 tmp/s78d-goose-doc-guide.md）。
3. **留下的代价**：产品未设 GOOSE_DOCS_ROOT（全仓 grep 零命中，本裁决新增取证）→ 默认回落 `https://goose-docs.ai`（v1.50 mod.rs:110，VERIFIED-DOC）。即：这个技能在目标机上是**结构性坏死的**——一旦触发（如 agent 改配方时自我对号入座「recipes」），MUST 语气强制它去抓一个抓不到的文档站，空烧轮数后输出「I could not find documentation」。无事故记录≠已验证：是从未有人走过，不是走通过。

---

## 1. 裁决（三选一）

| 技能 | 裁决 | 一句话理由 |
|---|---|---|
| web-search | **裁剪** | 零场景点名 + 与治理通道全重叠 + 常驻广告一条产品不可见不可管的 shell 出网/装包路径——比 s69 关掉的 analyze 更该关（analyze 无害只是噪音，这个是带导航的噪音） |
| goose-doc-guide | **裁剪**（同批） | 零受众 + 结构性坏死（默认文档源不可达）+ s69 G3 同类（纯选择噪音）；边际成本≈0（与 web-search 共用同一物化块同一探针） |

**裁决一致性声明**：s69 关停 analyze 的判据是「妻子场景零点名 + 给弱模型减选择噪音」，对只读无害工具照关不误。web-search/goose-doc-guide 同判据过堂，且 web-search 还多一条「指错路」的主动危害。若这次不裁，s69 的最小能力面原则就成了选择性执行。

**为什么不是观察期**：观察要换信息。这里没有任何待学事实——目标机无 uv、出网受控是已知部署参数，技能坏死是结构性推论而非待验假设；而观察窗内的第一次误触发就是 B1/B2 最坏后果（见 §2），事后转储只能记录不能阻止。真机护航期原则=验证优先于扩张，方向是收面不是留待爆面。

**为什么不是保留**：见 §2 最坏后果表 B 列。

---

## 2. 最坏后果表

| 选项 | 最坏后果 | 可观察性 | 可逆性 |
|---|---|---|---|
| **裁剪（本裁决）** | ①上游未来版本改发现顺序/改名内置技能 → 遮蔽失效、内置技能带新形态回流（G6 同族升级失配，已知回归类）；②妻子某天真需要公网信息，被桩挡下 | ①升级 playbook T2 转储断言（本裁决 §3.4 已挂）当场暴露；②桩文案本身给逃生口（「问用户要不要开浏览器」），浏览器路径不受影响 | 删两个桩目录即回今天状态；重开条件见 §5 |
| **保留** | 妻子一句「查查XX最新」→ load_skill（smart_approve judge 可静默放行，load_skill 不在 user 键）→ shell（user.always_allow **零卡**）尝试装 uv / 拉 PyPI / 出网 → 失败烧轮 + EDR 告警落在**她**的机器上；若代理环境部分放行，则 PyPI 供应链代码在零卡零审计下本地执行 | **产品侧零可见**：不经权限卡统计、不经商店、不在任何面板列出——hints 第 21 行教用户「本事来自设置面板可增减」，这两条恰恰是面板管不到的暗能力，破坏产品自己的能力管理契约 | 事后只能靠下一次升级窗口再裁 |
| **观察期** | 同「保留」的后果在观察窗内原样暴露（转储只做事后取证）；另付出持续巡检成本，换回零信息增量 | 同上，且护航期本就要盯的指标被稀释 | 同上 |

---

## 3. 最小裁剪方案（可打包、可验证）

### 3.1 机制事实（先查底稿再动手，非拍脑袋）

- **上游无禁用键**（VERIFIED-DOC，v1.50.0）：builtin.rs 与 v1.46 逐字同逻辑，`get_all()` 无条件返回全部内嵌 md；config 只参数化技能**目录**（`all_skill_dirs_with_config`），不管 builtins。
- **唯一覆盖通道 = 同名遮蔽**（VERIFIED-DOC，v1.50 mod.rs:613-637）：`discover_skills_with_config` 先扫文件系统目录（`seen` 去重），再补 builtins 且 `if !seen.contains(name)` 才加——**同名文件系统技能优先于内置**。文件系统形态 = `<技能目录>/<name>/SKILL.md`（带 frontmatter `name:`）。
- **落点选 `<GOOSE_PATH_ROOT>/config/skills/`**（= conf/goose/config/skills，与 .goosehints/permission.yaml 同树）：①goose 发现根之一且先于 builtins；②**产品 UI 不可见**——`/api/skills` 只扫 `.agents/skills`（chat-bridge.tpl.js:2177-2179 直读，VERIFIED-RUN），「我的技能」列表不会冒出怪条目；③不进技能市场管理面（origin.json/s70 体系只管 .agents/skills）。
- **分层正确性（设计属性，非 bug）**：若妻子日后从商店**显式安装**同名技能（cwd/.agents/skills 扫描序更先），用户意愿 > 产品桩 > 上游内置。桩只杀「未经同意的捆绑」，不拦「同意过的选择」。

### 3.2 改动面（最小 diff：2 模板 + 1 物化块）

1. 新增 `forge/conf/templates/skill-stub-web-search.tpl.md`、`skill-stub-goose-doc-guide.tpl.md`（文案见 §3.3，无占位符，走模板仅为对齐 1b-2「模板=唯一真相源」惯例）。
2. bootstrap.ps1 新增 **1b-8** 幂等物化块（结构抄 1b-2 .goosehints：**每启覆盖重建** `conf/goose/config/skills/web-search/SKILL.md` 与 `conf/goose/config/skills/goose-doc-guide/SKILL.md`；非 1b-7 的 copy-if-missing——桩是产品自有静态物，非用户数据，覆盖式可自愈、可随版改文案）。
3. 不改：goose-config.tpl.yaml、permission.yaml、桥、前端、hints（工具清单 46=46 不动，零工具面变化）。

### 3.3 桩文案（裁决定稿，实现照抄）

**web-search 桩**——skills 行从「广告位」改造成「护栏位」：

```markdown
---
name: web-search
description: 本产品已停用此技能。本机不直接上公网：网页内容用 fetch_url 或 browser_*；公网信息无法获取时如实告诉用户，可问用户是否用浏览器打开。
---
此技能在 PocketForge 已停用（裁决 docs/verdicts/…-goose-v150-skills.md）。不要安装 uv、不要用 uvx/curl 访问公网、不要改动出网设置。需要网页内容时：静态页面用 fetch_url；要点击/登录的页面用 browser_*；都不行就如实告知用户本机网络受限。
```

**goose-doc-guide 桩**：

```markdown
---
name: goose-doc-guide
description: 本产品已停用此技能。你的运行环境由 PocketForge 统一配置管理，不要读取外部 goose 文档、不要修改 goose 配置文件；配方写法以手册（.goosehints）既有条款为准。
---
此技能在 PocketForge 已停用。goose 相关配置不归你改。新建/修改定时任务配方时，遵守手册「定时任务」三条铁律（max_turns、登录类不定时、改配方重新登记）；不要访问 goose-docs.ai 或任何外部文档站。
```

### 3.4 验收（可打包可验证的判据）

1. **生效探针**：bootstrap 后 dev 栈起一真会话，`conf/goose/state/logs/llm_request.*.jsonl` 断言：skills 段两条描述=桩文案；全文零 `DuckDuckGo`、零 `goose-docs.ai`、零 `uvx` 字样。
2. **load_skill 行为**：假 provider 隔离会话（pfr21 同法）调 `load_skill web-search` → 返回桩正文而非上游正文。
3. **自愈性**：删桩目录 → 重跑 bootstrap → 桩重建（同 1b-2 语义）；存量包升级路径同验。
4. **回归面**：e2e-chat/fuzz 全量（应零变化——技能非工具）；升级 playbook 第 3 步（T2 转储巡检）**新增常驻断言**：skills 段两条桩描述在、上游文案不在（§2-A1 的哨兵）。
5. **UI 无感**：「我的技能」列表不含两个桩（/api/skills 不扫 config/skills，机制已证）。

### 3.5 成功指标与观察窗

- 指标：护航期全部转储中零 web-search/goose-doc-guide 上游文案出现；零 `uvx|astral|goose-docs.ai` 出网尝试记录。
- 观察窗：真机护航期全程 + 每次升级窗口（§3.4-4 断言）。
- 负向信号（重开数据源）：妻子出现「要查公网信息」类诉求 → 记 STATE，作为商店上架**治理型搜索 MCP** 的需求证据——重开的是「受治理的搜索能力」，不是这个 shell 技能。

---

## 4. 否决项（本轮明确不做）

| 否决 | 理由 |
|---|---|
| 设 GOOSE_DOCS_ROOT 指向本地随包 goose 文档镜像 | 为零受众坏死功能引入需长期同步的上游文档资产，负收益；配方写法的本地真相源已存在（hints 三条铁律） |
| 产品 UI 增加「内置技能管理」面板 | 暗示可管理性而机制上只有遮蔽一招；两个条目的 UI 面积与收益不成比例。上游出现原生禁用键后再议 |
| permission.yaml 层拦截（如锁 load_skill） | load_skill 是全部技能共用的单一工具名，无法按技能区分；锁它=瘫痪产品自有 5 技能与市场技能 |
| 只加 hints 一句「不要用 web-search」 | s69 已否决同类：「提示词不是限制机制」——何况这里的执行通道 shell 本就 always_allow，提示词是唯一防线=没有防线。桩的遮蔽是机制层（上游正文不可达），hints 仅作补充不承担门禁 |
| 观察期 | §1 已陈：零信息增量，窗内首触即最坏后果 |
| 保留 web-search 等「以后可能有用」 | 「以后做做看」不是待办；公网搜索若成真需求，正确载体是商店里带 key、可审计的搜索 MCP |

---

## 5. 遗留与观察

1. **升级窗口哨兵**（§3.4-4）是本裁决唯一长期成本：每次 goose 升级，T2 转储巡检断言桩在、上游文案不在。上游若把这两个技能转成 extension 或提供禁用键，迁移到原生机制、撤桩（§4 第 2 行重开条件）。
2. 若 anthropics/baoyu 技能源出现同名「web-search」条目且妻子安装，属同意流程内的用户选择（§3.1 分层），不拦；但商店侧可考虑给「联网类」技能加提示语（P32+，不动现版）。
3. journal s78 升级节「新捆绑 web-search/goose-doc-guide」表述建议随本裁决落档时勘误为「新增 web-search；goose-doc-guide 为 v1.46 存量补审」。
4. 本裁决为草稿（tmp/），主控复核后晋升 docs/verdicts/2026-09-12-goose-v150-skills.md；实现切片（2 模板+1b-8 块）与 STATE 记账随晋升同批。

## 主控复核（s78d，2026-09-13）
- 通过。勘误采信（v1.50 真实增量仅 web-search；goose-doc-guide 系 v1.46 未裁决存量——journal 升级节「两个新捆绑」措辞随之修正）。
- 遮蔽机制分层（用户同意>产品桩>上游捆绑）与 s69 纪律一致性确认；实施随本裁决同窗口落地。
