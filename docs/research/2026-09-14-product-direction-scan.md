# 产品设计与优化方向调研（用户点名支线）：T1 对标扫描 / T2 零技术用户可用性 / T3 内测度量缺口

日期：2026-09-14。调研人：pf-researcher。验证等级按仓库三级制（UNVERIFIED / VERIFIED-DOC / VERIFIED-RUN）；外部事实逐条带 URL，仓库内事实带文件引用。方法边界：T1 检索窗 2026-09-01~09-14（goose 上游用 GitHub API 直核）；T2 以仓库自有证据为主、业界做法仅作命名引用（详细对标已存在于 research/25/26/27，不重复）；T3 只评估不实现。

**结论先行**：T1 外部扫描零新增 backlog 硬需求（goose 无 >v1.50 版本；OpenClaw 安全集群延续 WATCH；Manus/本地工作台动向均为已裁决方向的旁证）；真正的高价值优化全部来自仓库内部证据——T2 七条候选中最高优先是「s85 已验证未落地的中文路径冷启修法」（真机新装 100% 阻断家族）；T3 现有度量只能回答「用了没有/错在哪层/问了几次」，回答不了「做成了没有/卡在哪句话」，补 6 项 S 级计数后自动面到顶，剩余必须人工标注。

---

## T1 对标扫描（2026 现势）

### 1.1 goose 上游（本机 v1.50.0）

**核查结论：v1.50.0（2026-09-08 发布）仍是最新 release，无 >v1.50 版本。** VERIFIED-DOC（api.github.com/repos/block/goose/releases 直核，2026-09-14）→ 升级窗口未开，零动作；巡检周期照旧（research/04 playbook）。

对现状有信息量的 v1.50.0 条目回溯（VERIFIED-DOC，release notes API 正文）：
- "Preserve permission revocations across managers"——权限撤销跨管理器持久化。与 research/27 B 题（「以后都允许」撤销面板）直接相关：撤销语义在 goose 侧被当一等公民维护，佐证 B1 面板「单条恢复每次询问」的语义稳定性。
- "Prefer latest MCP version"——goose 对 MCP 版本偏好新。与 backlog「商店选型加 MCP SDK 大版本护栏」（research/11 §共同趋势）同题：上游追新不改第三方包升级风险，护栏维持。
- ACP client/acp binary 拆分 npm 包——对我们零影响（零 npm 运行时依赖不变）。
- "Resolve UI freeze after renaming session"——goose 桌面 UI 项，我们不用 goose desktop，无影响。

判断：无 backlog 新增。

### 1.2 Manus

- 恢复独立运营（09-01）+ 作为条件删除部分用户数据（财联社二手转述官方公告，VERIFIED-DOC 官方 blog 存在性已核）——P32 数据主权话术既有 backlog 条目的素材更新点；载体勘误（项目须知.md 从未落库）仍在，先建文件再挂话术。〔STATE 路线决策区 P32 候选①既有〕
- Manus 1.6：Max 性能档 / Mobile development / Design View（manus.im/blog/manus-1.6-release，VERIFIED-DOC）——云端全栈生成继续加码，与「Windows 本地便携+零权限」场景零交叉。不跟进。
- Manus 1.5 Builder（一提示生成含后端/登录/数据库/通知/分析的完整应用）+ 无限上下文（research/27 已核）——「一提示成应用」方向的旁证；我们的对应面=faucet 自然语言建库建表+apps/*.yaml，P32 观察维持，内测期不扩张。
- Recommended Connectors（任务需要未启用的连接器时主动建议配置）——「能力主动推荐」形态。对我们的 MCP 商店是**反面**参照：我们的裁决是闸门制（真实需求触发才进，docs/verdicts/2026-09-05-marketplace-ecosystem.md §3），主动推荐=打扰面。不跟进。

判断：无新增条目；数据主权话术条目维持。

### 1.3 OpenClaw（仅安全态势，WATCH 维持）

2026-09-14 复核，集群仍在延续而非收敛：
- ClawJacked CVE-2026-1847：任何网页可经 localhost WebSocket 劫持 agent 全控工作站，v2026.2.25+ 修复（Oasis Security 一手，oasis.security/blog/openclaw-vulnerability，VERIFIED-DOC）。
- CVE-2026-24763 命令注入（2026.1.29 前版本，NVD nvd.nist.gov/vuln/detail/CVE-2026-24763，VERIFIED-DOC）。
- Claw Chain CVE-2026-0517 等四 CVE 连锁（CSA，2026-05，research/11 已录）。
- Cyera 新披露四漏洞、称影响 180,000+ 企业部署（cyera.com 研究页，VERIFIED-DOC 标题级）。

**对本产品唯一有信息量的一条**：ClawJacked 的攻击面=「浏览器任意网页 → localhost WS」。我们 chat-bridge 同为 localhost WS，但 s15/s17 已修 CSWSH 家族（WS+HTTP 双层 Origin 校验），此类攻击对桥不成立。建议（零成本注记，非产品项）：升级 playbook 常规检查项加一句「e2e Origin/CSWSH 断言随 goose 升级必跑」——现有套件已含该断言，只是把「为什么必跑」锚到外部事件。

判断：WATCH 维持，无升格无降格，无新 CVE 驱动的产品动作。

### 1.4 本地/便携 agent 工作台新形态（VERIFIED-2ND 为主——搜索摘要级，降级标注）

- **Claude Cowork**（Anthropic）：local-first、在 Claude Desktop 内对本机「批准的文件夹」执行、含定时任务与插件生态，近期扩到 mobile/web（the-decoder.com 报道 + agensi.io 对比页，VERIFIED-2ND）。信息量有三：①「本地执行面」被头部厂商验证为主流方向，我们形态选择的External 旁证（可进 P32 对标叙事）；②仍需 Claude Desktop 安装器+Anthropic 云模型，不满足我们「零 installer+企业零权限+自带 Key」三条件，不构成替代威胁；③「folders you approve」目录级授权是权限面板（research/27 §B）的同类先例，设计输入已足，无需新增。
- **ChatGPT Work/Agent Mode**：云沙箱执行、小时级驻留（openai.com 官宣，VERIFIED-2ND）——与本地便携正交。不跟进。
- **LM Studio Bionic**：本地模型产出文档/幻灯/PDF（lmstudio.ai，VERIFIED-2ND）——「本地工作台+制品三件套（建/管/找回）」标配化的旁证；我们 s83「做过的东西」已落地此形态。无新增。
- **OpenWork / Eigent / Open Cowork**：开源 Cowork 平替（github.com/different-ai/openwork 等，VERIFIED-2ND）——均面向开发者，无零技术用户设计证据。不跟进。
- **AnythingLLM**：无账号无 API key 全设备内——本地小模型极；企业零权限办公机无 GPU 假设下跑不动，维持不跟进（research/11 结论延续）。

判断：无新 backlog 条目。T1 整体产出=「外部无新增动作」这个否定结论本身 + 两处叙事素材（Cowork 旁证、OpenClaw 事件锚点）。

---

## T2 零技术用户可用性优化候选（7 条，按优先级排序）

业界成熟做法（渐进式披露/错误人话化/进度透明化/可撤销性/为跳过引导者设计）已在 research/25/26/27 与 tmp/s78-ux-heuristic-audit.md 系统对标过，且大半已落地（audit §二「做得好的」七项）。下列候选=仓库证据里的**残余缺口**，不重复已达标项。

| # | 候选 | 解决什么问题（仓库证据） | 最小形态 | 风险 | 验证状态 |
|---|---|---|---|---|---|
| U1 | **中文路径冷启修法落地（s85 P2+P3）** | 安装路径含非 ASCII（中文用户名=中国企业机默认态）时 .cmd 被 cmd.exe 误解析错位 → initdb 因 share 目录非 ASCII 必失败并**自删数据目录**（PG 上游限制）——真机新装即 100% 阻断，观感乱码（P1）同根 | 修法已验证未落地：`chcp 65001` + .cmd 改 `%~dp0` 纯 ASCII（**两者必须成套**，单独任一改法实测失败）；发布门冷启矩阵加中文路径档（AGENTS.md §8 纪律已就位） | cmd 转义层吃反斜杠序列（通用陷阱）→ 改动走脚本文件不走内联；PG 上游限制不可修，只能保路径纯 ASCII 传导 | 修法 VERIFIED-RUN（docs/runbooks/2026-09-14-cold-start-codec-audit.md P1-P7+最小改动清单）；落地属 engineering |
| U2 | **memory junction 悬挂自愈（s85 P4）** | %APPDATA% memory junction 悬挂时 `Test-Path=True` 守卫永不修复——改名/搬迁后「长期记忆」**静默失忆**，妻子零感知，是对「它记得我」信任承诺破坏面最大的缺陷家族 | bootstrap 每启校验 junction 解析目标真实可达（`Get-Item.Target`+目标 Test-Path），不可达即重建+日志留账一行 | 循环 junction 防环逻辑须复用（s14 引入）；重建失败要降级为可见告警而非静默 | 根因 VERIFIED-RUN（s85 runbook P4）；修法未验证 |
| U3 | **「以后都允许」撤销面板 B1（含前置计数）** | 一次点击永久直通+全 UI 无查看/撤销入口；dev 栈实锤：历史「以后都允许」累积后 shell 任务零审批卡直行——连开发团队自己都未察觉承诺被架空（tmp/s78-ux-heuristic-audit.md P1-1 活体证据） | 面板=⚙️ 只读清单（permission.yaml user 段，0-8 条档直列）+单条「恢复每次询问」；设计起点已固定=research/27 §B.4；生效时机文案=「下一轮生效」（s82 热感知 VERIFIED-RUN） | 改 PROTECTED 文件须走桥+并发锁（#11383 已验）；触发器维持「真机误允求助≥1」——但先把 allow_always 计数分裂（见 T3-A）让触发器可被数据观测，面板本体待触发 | 设计输入 VERIFIED-DOC/RUN（research/27 §B+末尾附注）；实现未做 |
| U4 | **首次存偏好出权限卡的预告半句（s76 遗留⑤）** | 记忆面板承诺「它自己记住」，首次实际弹权限卡；妻子若点「以后都别问」=记忆功能**静默失效**——与 U3 同根（承诺与首次体验落差），但成本是 U3 的百分之一 | 记忆面板/welcome 补半句「第一次它会问你一句，点『这次可以』就行」 | 纯文案，零 | 缺陷 VERIFIED-DOC（STATE s76 遗留⑤+research/18 P4 备注） |
| U5 | **出厂默认模型打包期存活校验（s85 P6 防复发）** | v0.9.12 出厂默认 deepseek-v4-flash 已从中转站路由下架（实测 109 模型名单无此名）——真机首任务即撞 stale 链路（健康探测+TURN_STALE_TEXT 已兜底，但首体验=开局失败） | 发布门/package.sh 加一条探针：默认模型在当前 provider /models 存活才放行；升级 playbook 同步 | 发布时点存活≠用户首启时点存活（中转站零预告是根因，research/26 §0.2），只能压缩窗口不能根除；stale 文案兜底已就位 | 事实 VERIFIED-RUN（s85 runbook P6）；检查项属发布流程 |
| U6 | **回合中模式切换的时机半句（s74 遗留②）** | 「切自动干活」在回合进行中不生效（goose 按回合生效，合理设计），文案略误导——妻子在长任务中途切档会以为已生效 | 切换时若当前会话在 busySids 内补 addInfo「下一轮开始生效」 | 纯文案+1 条件分支 | 缺陷 VERIFIED-RUN（STATE s74 遗留②，判 P4 不立项——建议维持不立项、随下批顺手带） |
| U7 | **welcome 无浏览器关联兜底（STATE 开放问题 5）** | 无默认浏览器关联的极端机器上 welcome 不弹，首屏黑盒 | 启动器检测弹窗失败时 console 输出「用浏览器打开 127.0.0.1:8790」+使用说明同句 | 极低；但真机未实录此形态——**观察即可，不建议动**（不扩张原则） | 现象 UNVERIFIED（未实录） |

裁掉项（防扩张，记录理由）：审批卡倒计时/进度条动画（ASP 反模式，s78 audit §三已裁）；生成式 UI（research/25 §3 已裁）；能力主动推荐（见 T1.2）；首任务独立向导页（s51d 已裁决由 chips+引导条实现）。

---

## T3 内测期度量缺口

### 3.1 判据倒排：P32 各门槛需要什么信号

| 门槛（出处） | 需要的信号 | 现有度量能否回答 |
|---|---|---|
| P31 主指标「≤3 步零术语零问人」（STATE s83 §6） | 任务成败 | **否**——无 outcome 信号 |
| Plan Mode 解冻 T1 意图错配≥2（verdicts/2026-09-06-plan-mode-thaw.md） | 错配次数 | 否（无自动判「错配」的可靠途径） |
| Plan Mode 解冻 T2 单任务卡≥8 且误触 | 权限卡计数+误触 | **半**——shown/denied/timeout ✓；「误触」只能以 denied+timeout 代理 |
| Plan Mode 解冻 T3 成功率<50% 或同类重复≥3 | 成功率/重复求助 | **否**（成功率）；「同类重复」可用重试代理补（见 D） |
| P31-④ 半自动 failover 准入：upstream 错误≥10 且换线成功率≥50%（STATE 路线区） | upstream 计数+换线成败 | **半**——upstreamByKind ✓；换线点击与换线后成功**零采集** |
| B1 触发器：真机误允后求助≥1（STATE s78 挂账④） | allow_always 计数 | **否**——approved 把 allow_once/allow_always 合并计数（chat-bridge.tpl.js:3593） |
| P32 数据驱动三候选（PLM 适配/工作流模板/日程提醒） | 使用频率+产出物频率 | **半**——messages ✓；artifactsGenerated **恒 0 占位**（s49 journal 自认） |

另有规格-实现落差（本报告新发现，证据在案）：**P31-③ 路线条目写的三件套是「活跃会话数/报错计数/卡点关键词」，实现只有前两件且口径为「新建会话数」**——卡点关键词从未实现（journal 2026-08-29-s49 规格即无此项；grep 桥模板零「卡点/keyword」命中，2026-09-14 核）。这不是漏做，是 s49 归约时静默收窄——底稿在此把落差显式化，规格怎么改由主控裁决。

### 3.2 补度量最小清单（6 项，全部 S 级：既有 statsBump/flush 挂点各加 1-3 行，零新面板零新端点零外传）

| # | 补什么 | 挂点（文件:行） | 回答哪个判据 |
|---|---|---|---|
| A | permissionCards 分裂 allowAlways/allowOnce 两键（读侧 statsRestore 按旧文件补默认，:207 先例） | chat-bridge.tpl.js:3593 一处 | B1 触发器可观测（T2-U3 前置）+Plan T2 |
| B | 换线按钮点击计数 + 换线后同会话 10 分钟内首条成功计数（分子分母） | 前端 pendingRetry 回调（chat.tpl.html:975 族）+桥 provider_switched | failover 准入「成功率≥50%」——**不补此项该准入永久无法自动判** |
| C | turnLost / rescued（含 SID_RESCUED 守卫命中）三处计数 | 桥 :898-903（现仅 console.log） | s83b closed-sid 家族触发器「真机妻子路径实录到同款→升级产品缺陷」的自动证据；否则真机发生我们看不见 |
| D | retryAfterError：同会话出错后 10 分钟内再发 prompt 计数（**卡点频率代理，替代关键词本体抓取**——单用户护航期「卡在哪句话」靠 📮 报告人工描述已够，关键词自动抓取有隐私/体积代价，违反不扩张） | 桥 prompt 路径（turnText/error 状态已内存持有） | Plan T3「同类重复≥3」代理 |
| E | assetsCount 每日快照：每日首次 flush 顺带调 /api/assets 同源计数（三源聚合 s83 已就绪，无 diff 扫描）——artifactsGenerated 占位转真或并行新键 | statsFlushDebounced（:183） | P32「工作流模板」候选的使用证据 |
| F | 健康态转换计数（stale/down/down+key）+ 升级事件计数（update/start、成败） | healthFailDebounce（:888 族）+/api/update/start（:2415） | 模型链韧性决策+自动升级信心 |

配套两条零代码项：
- **护航纪律一句进护航须知**：真机只跑产品不跑测试——dev 数据 09-13 sessionsCreated=1086（fuzz 探针污染，forge/data/stats/usage-20260913.json 实查），真机单用户本无此问题，但护航者若顺手跑任何探针即污染判据分母。
- **人工标注双轨**：任务成功率本体与意图错配本体**不自动补**（自动判「成」需要 outcome 分类机制=扩张）；建议护航清单附录加「每周 5 分钟标注」（每任务成/败/放弃三选一），P32 门槛裁决=自动信号 A-F+人工标注对账。这是诚实边界：这两个判据从设计上就是观察型触发器。

### 3.3 回答题设：护航期结束时能不能进 P32？

**当前度量不够。** 现状能答：「她用了没有」（messages>0）、「错在哪层」（errorsByType 四细分）、「问了她几次」（permissionCards）；不能答：「做成了没有」（无 outcome）、「卡在哪」（无重试/救援计数）、「换线救没救回来」（零采集）、「误允过没有」（approved 合并计数）。补 A-F 后自动面到顶；「成功率/意图错配」两判据必须人工标注轨。建议 A-F 一个批次落地（工程量=S 级×6，全挂既有路径），人工标注协议随护航须知更新——两者都就位，P32 门槛裁决才不是拍脑袋。

---

## 来源与验证等级

| 来源 | 等级 | 核对日期 |
|---|---|---|
| api.github.com/repos/block/goose/releases（v1.50.0 为最新+正文条目） | VERIFIED-DOC | 2026-09-14 |
| oasis.security/blog/openclaw-vulnerability（ClawJacked CVE-2026-1847）；nvd.nist.gov/vuln/detail/CVE-2026-24763；cyera.com（四漏洞 180k+，标题级）；labs.cloudsecurityalliance.org（Claw Chain，research/11 已录） | VERIFIED-DOC（Cyera 标题级降档） | 2026-09-14 |
| manus.im/blog（1.5/1.6 存在性与要点，research/27 已核部分+本轮搜索摘要）；cls.cn/detail/2451875（恢复独立运营，二手转述官方） | VERIFIED-DOC / VERIFIED-2ND 混合 | 2026-09-14 |
| Claude Cowork local-first/定时任务/mobile-web（the-decoder.com、agensi.io）；ChatGPT Work 云沙箱（openai.com）；OpenWork/Eigent/LM Studio Bionic/AnythingLLM（各官网与汇总页） | VERIFIED-2ND（摘要级，未取全文） | 2026-09-14 |
| 仓库内：docs/runbooks/2026-09-14-cold-start-codec-audit.md（P1-P7）；tmp/s78-ux-heuristic-audit.md；docs/research/25/26/27；docs/journal/2026-08-29-s49-usage-stats.md；forge/conf/templates/chat-bridge.tpl.js:120-211/783-801/888-903/1885-1944/3592-3594；forge/conf/templates/chat.tpl.html:975/1065-1084；forge/data/stats/usage-20260913.json（实测污染样本）；STATE.md 路线决策区/挂账/遗留族 | 仓库三级制既有等级（多 VERIFIED-RUN） | — |

### 遗留 UNVERIFIED

1. U2（junction 自愈）修法未验证——根因实证但「重建+防环」组合需 engineering 批次实证。
2. U7（welcome 无浏览器关联）现象本身未在任何真机实录——维持观察不动。
3. Manus 1.6/1.5 全部功能细节为摘要级（官方 blog 未逐篇取全文）；不影响「不跟进」结论（判断依据是形态正交，不是功能细节）。
