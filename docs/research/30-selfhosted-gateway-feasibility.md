# 用户自建 OpenAI 兼容网关作为中转替代：可行性与收益裁决

日期：2026-09-13。调研人：取证研究员。性质：**给用户（硬核技术型）的基础设施建议，非产品代码改动**。背景输入：research/26 §结论4（模型下架最优解=官方映射+预告，OpenAI 先例；中转站零预告零映射是根因）、s77（代理客户端断中转路由）/s78（中转站静默下架 deepseek-v4-flash）两次链路事故。

验证等级图例：
- **VERIFIED-SRC** = 本机产品源码实读（文件:行号）。
- **VERIFIED-DOC** = 官方文档/README/GitHub API 原文已取。
- **VERIFIED-RUN** = 本机对照探针实测（命令+日期+结果）。
- **VERIFIED-2ND** = 搜索摘要级引证/社区多来源，未取到全文。
- **UNVERIFIED** = 单一二手说法或估计，不下游引用。

方法边界：查了 new-api/one-api/gpt-load/uni-api 四家自建网关（盘点+能力+Windows 约束）、DeepSeek/GLM 官方直连政策与价格、产品侧 host 消费面。排除面：LiteLLM（Python 重栈，同 uni-api 排除理由）、one-hub/Done-hub 等 one-api 二代 fork（一次事故面与 one-api 同源，无增量）、硅基流动/火山方舟等大厂聚合（属选项 C 变体，仅在裁决中提及）。

## 0. 结论先行

1. **当前真实痛点（模型名稳定性）的最优解不是自建网关，是官方直连。** 本轮拿到两个现行实证：DeepSeek 官方**今天仍接受 s78 被下架的那个名字**——"The legacy names deepseek-v4-flash and deepseek-v4-flash-vision-exp are still accepted"，旧名请求自动由 V4.1-Flash 处理（VERIFIED-DOC，官方定价页原文）；GLM 官方对下线模型做**预告+自动路由**——"GLM-4.5-Flash 将于 2026 年 1 月 30 日下线……正式下线后，相关请求将会自动路由至 GLM-4.7-Flash"（VERIFIED-DOC，docs.bigmodel.cn 原文）。这正是 research/26 §结论4 说的 OpenAI 先例三件套（预告+映射+自动迁移），**官方厂商白送，中转站不给**。事故②这一类风险在官方直连下结构性不存在。
2. **自建网关可行且成熟（Windows 零 Docker 约束下有原生跑法），但定位是聚合/统计升级件，不是止痛首选。** 四家全部支持模型名映射（=把下架改名的吸收权拿到自己手里，30 秒改映射平滑过渡），三家有 Windows 原生 .exe。但代价=新增一个自管常驻部件——本云主机 2026-09 有三次中断实录（STATE.md s77 节），若妻子链路改指向本机网关，等于把「外部供应商 SLA」换成「自家云主机可用性」，**拓扑劣化**。
3. **裁决：分场景两选。** 妻子/目标机主链路 → **选项 C（DeepSeek 官方直连）**，产品侧仅服务商面板改 host+key 两格、零代码（消费面已核，见 §6）；用户自己 dev 云主机 → 可选 **选项 B（gpt-load 或 new-api，127.0.0.1 自用）**，中转 key 降级为网关内备用渠道，兼得聚合+统计+实验场。选项 A（继续裸用中转站）仅作官方 key 开通前的过渡，v0.9.12 健康探测兜底已上线。
4. **候选排序（若走 B）：gpt-load ≥ new-api > one-api > uni-api。** gpt-load=Windows 一等公民（官方安装器直接装成低权限 Windows 服务+开机自启）、组级别名、凭证池调度；new-api=功能最全最活跃但 AGPL+RC 线+文档 Docker 向；one-api=Windows exe 最轻但**上游 8 个月未动**（2026-01-09 最后 push）；uni-api=无 Windows 发行资产（Python），出局。

## 1. 候选盘点（GitHub API，2026-09-13 取数，VERIFIED-DOC）

| | one-api | new-api | gpt-load | uni-api |
|---|---|---|---|---|
| 仓库 | songquanpeng/one-api | QuantumNous/new-api（原 Calcium-Ion） | tbphp/gpt-load | yym68686/uni-api |
| Stars | 36,867 | 47,976 | 6,696 | 1,258 |
| 许可证 | MIT | **AGPL-3.0** | MIT（发行含 MPL/Apache/MIT 三份组件许可文本） | Apache-2.0 |
| 最后 push | **2026-01-09（8 个月未动）** | 2026-09-12 | 2026-09-13 | 2026-09-12 |
| 最新 release | v0.6.10（**2025-02-02，19 个月**） | v1.0.0-rc.37（2026-09-11） | v2.0.0-rc.15（2026-09-12，tag rc.16 已现） | v1.7.276（2026-09-12） |
| Windows 资产 | one-api.exe（35.2MB） | new-api-*.exe（126.7MB） | gpt-load-windows-amd64.exe（91.2MB）+ **setup.exe（22.3MB，Inno Setup）** | **无**（仅 linux/mac .pex） |
| 运行时 | Go 单二进制，默认 SQLite | Go 单二进制，默认 SQLite | Go 单二进制，默认 SQLite | Python（uvicorn） |

维护风险注记：
- **one-api 上游休眠**是硬数据（push/release 双停摆），issues 1035 开放无人清。research/26 已录其家族「自动禁用后无法恢复」公开翻车记录（new-api issues #7040/#5420，VERIFIED-2ND）——选它=接手一个冻结代码库。
- **new-api 活跃度最好但整个 v1.0.0 线全是 RC**（tags 实录 rc.33-37 连续 RC）；AGPL-3.0 对纯自用无义务，改造分发才触发开源。exe 跑法无官方文档（安装文档全 Docker 向），有 exe 自用模式登录坑的实录 issue #4174（VERIFIED-2ND）。
- **gpt-load 同为 RC 线**（v2.0.0-rc.*），但 Windows 是其一等公民：README 原文"Setup installs and starts a low-privilege Windows service, enables automatic startup"（VERIFIED-DOC），数据落 `%ProgramData%\GPT-Load\data`。
- uni-api 定位原文（README）："For personal use, one/new-api is too complex…you can try uni-api"——单人多渠道配置型（YAML 无 DB），但 Windows 需自备 Python 栈，与零依赖约束冲突，**出局**。

## 2. 关键能力对照（痛点逐项）

| 能力 | one-api | new-api | gpt-load | uni-api |
|---|---|---|---|---|
| **模型名映射**（直击事故②） | 渠道级：README §15「支持模型映射，重定向用户的请求模型」（VERIFIED-DOC） | 渠道级：「模型映射将用户请求的模型名映射为实际模型名，JSON 格式」+ 路径变量 original_model/upstream_model（VERIFIED-DOC，渠道管理文档） | **组级**别名："The application requests the alias; the gateway substitutes the actual upstream model name when forwarding"，官方用途含「版本收敛（带日期版本→稳定名）」（VERIFIED-DOC，docs/models） | provider.model YAML「上游名: 别名」（VERIFIED-DOC，README） |
| 健康检测 | 手动测试+CHANNEL_TEST_FREQUENCY 定期检查（VERIFIED-DOC，README） | 渠道「测试」/「测试所有渠道」+响应时间+红绿状态（VERIFIED-DOC，同 research/26 §1.5） | 调度页"Weights, affinity, retries, cooldown, and blacklisting"（VERIFIED-DOC，文档索引级） | —（见下行故障转移） |
| 故障转移 | 「支持失败自动重试」+多渠道负载均衡（VERIFIED-DOC，README） | "Automatic retry on failure"+渠道加权随机；失败重试次数可设（VERIFIED-DOC，README） | 重试+冷却+黑名单（凭证级，时间窗自动恢复——比 one-api 家「禁用难恢复」语义健康）（VERIFIED-DOC 索引级） | "when an API channel response fails, automatically retry the next API channel"（AUTO_RETRY，VERIFIED-DOC，README） |
| 自动禁用 | 定期检查按成功率禁用（阈值 0.8） | 「连续失败达到阈值时自动禁用该渠道」（VERIFIED-DOC）；**自动恢复仍是家族通病**（research/26 #7040/#5420） | 冷却/黑名单=时间窗自动恢复（索引级） | — |
| 用量统计 | 额度明细/兑换码/按美元显示（VERIFIED-DOC） | 数据看板+按请求/缓存命中计费统计（VERIFIED-DOC，README） | "Health, request logs, route inspection, usage, and cost"+cache hit rate（VERIFIED-DOC） | 后端日志（计费在独立 uni-api-web） |
| 多 key 轮询 | 渠道多 key 批量 | 「多 Key 模式……单个 Key 失败后自动跳过，恢复后重新启用」+轮询/加权随机（VERIFIED-DOC） | 凭证池即核心卖点（weights/affinity）（VERIFIED-DOC） | 多渠道多 key（YAML） |

**网关层切换 vs 客户端切换的取舍**（对比我们的零自愈裁决边界 s50e）：网关做故障转移**不与产品层零自愈冲突**——产品看到的仍是单一 provider，重试被中间层吸收；但代价有二：①同一别名背后换了上游，模型行为漂移对用户不可见（质量无感知切换）；②one-api 家「自动禁用容易自动恢复难」的翻车记录证明**网关自愈同样有边界**，不是免费可靠性。我们的定位不变：产品层探测+人话+人工换，网关（若有）只做路由层容错。

## 3. Windows 云主机现实约束（零 Docker/WSL）

- **纯二进制跑法：Go 三家全部成立。** one-api 手动部署文档齐：`./one-api --port 3000`，初始账号 root/123456（VERIFIED-DOC，README 手动部署节；.exe 同理）。new-api exe 同族跑法（默认账号 root/123456 为 VERIFIED-2ND，官方文档摘要级+社区多源；首登必改密）。gpt-load 最顺：setup.exe 一次管理员批准→低权限 Windows 服务+开机自启+管理页快捷方式（VERIFIED-DOC，README §deploy）；便携跑法 `HOST=127.0.0.1 DATA_DIR=./data ./gpt-load-windows-amd64.exe` 前台常驻。
- **uni-api 无 Windows 发行资产**（最新 release 仅 linux-x86_64/macos-arm64 .pex，VERIFIED-DOC），需 Python 环境自维，出局。
- **内存档位：UNVERIFIED 估计**——Go 单二进制+SQLite 网关空载 RSS 通常 50-150MB 量级（同类通用工程经验，本轮未实测、文档未载明）；uni-api（Python+SSE 缓冲）更高。本机 dev 栈已跑 pg/NATS/goose/桥，再加一个 Go 网关压力不大，**以任务管理器实测为准**。
- **s77 代理事故面的网关解**：goose 走 IE 代理注册表（s77 实录）。网关拓扑下产品→127.0.0.1（需确认回环在代理客户端直连名单）；网关自身是 Go 进程，Go 标准库只认 HTTP_PROXY 类环境变量、不读 IE 注册表（高置信工程事实，未逐一核源）——**上游出口结构性摆脱 IE 代理摆布**，这是 B 对事故①类的真实增益。

## 4. 官方直连证据（选项 C 的核心）

- **DeepSeek 官方**（VERIFIED-DOC，api-docs.deepseek.com/quick_start/pricing，2026-09-13 取）：
  - 现役两模型：deepseek-flash（=DeepSeek-V4.1-Flash）与 deepseek-v4-pro（=DeepSeek-V4-Pro-0813）。
  - **旧名兼容**："The legacy names deepseek-v4-flash and deepseek-v4-flash-vision-exp are still accepted"——s78 被中转站下架的名字，官方至今收下并自动按 Flash 计费服务。**事故②在官方侧已被预告+别名机制吸收。**
  - 价格（每 M token）：flash 输入缓存未命中 $0.15（谷）/ $0.30（峰），输出 $0.60/$1.20，缓存命中 $0.003/$0.006；"Off-peak rates are half of the peak rates"。并发限制 Flash 2500 / Pro 500。v4-pro 明确承诺 2026-09-14 后继续服务（公告级）。
  - 路由形态本机实测（VERIFIED-RUN，2026-09-13，无 key 探针）：`/v1/models`、`/models`、`/v1/chat/completions`、`/chat/completions` 全部 401（=路由存在，两种 base 形态皆可用）→ 产品面板 host 可填 `https://api.deepseek.com/v1`（与现面板 host 的 /v1 尾形一致）。
- **GLM 官方**（docs.bigmodel.cn，VERIFIED-DOC 模型页 + VERIFIED-2ND 发布记录）：
  - **"GLM-4.5-Flash 将于 2026 年 1 月 30 日下线……正式下线后，相关请求将会自动路由至 GLM-4.7-Flash"**——预告日期+自动路由双件套原文实取。付费线 GLM-4.5/GLM-4.5-X 同样标注「即将下线，建议选择最新旗舰 GLM-4.7」（VERIFIED-2ND，官方文档摘要级）。
  - GLM-4.7 定价页 JS 渲染未取到（UNVERIFIED，决策非关键：当前主用模型族是 DeepSeek flash）。
- **诚实缺口**：中转站单价未知（用户自查面板），与官方价的差值无法代算。官方 flash 谷段输入 ≈ $0.15/M（≈¥1.1/M，随汇率浮动），量级上属市场最低档；中转站的既有余额不是沉没成本——若走 B 可留作网关内备用渠道继续消耗。

## 5. 三选项对照与裁决

| 维度 | A 继续中转站 | B 自建网关（gpt-load/new-api） | C 官方直连（DeepSeek，辅 GLM） |
|---|---|---|---|
| 模型名稳定（痛点②） | 零预告随时再来（已两次实证） | 自持映射：上游改名→面板 30 秒改映射，产品无感（**但改名情报仍靠探测/人工**） | **官方预告+旧名自动路由（两厂商现行实证）——根因消失** |
| 链路稳定（痛点① s77） | 受代理客户端摆布 | 回环+网关出口不走 IE 代理，结构性免疫 | 走 goose 的 IE 代理链到官方域名，同 s77 风险面（需代理规则含官方域名直连） |
| 新增部件 | 0 | +1 常驻服务（本云主机有三次中断实录；RC 线升级维护） | 0 |
| 妻子链路拓扑 | 外部 SLA（中转站） | 若指向本云主机=自管可用性（**劣化**）；若妻子机装网关=每机一部件（不可接受） | 官方 SLA，拓扑不变 |
| 成本 | 已充值 key | 软件 0+内存电费 | 官方按量（flash 谷段 $0.15/M in）+新开户充值 |
| 用量可见性 | 无 | 全套（日志/看板/成本估算） | 官方后台（够用） |
| 多厂商聚合 | 中转站给啥有啥 | 任意渠道任意组合 | 每家一个服务商档案（产品原生支持多 profile） |

**裁决**：
- **主链路（妻子/目标机）：C。** 痛点②的根因是「供应商不给预告不给映射」，C 直接换掉供应商属性，且 DeepSeek 官方今天仍收 deepseek-v4-flash 旧名是最硬的现行实证。改动=面板两格（host/key），产品零代码。
- **用户 dev 机：可选 B（gpt-load 优先）。** 作为聚合实验层+统计层，中转 key 作备用渠道继续消耗余额；官方 key 为主渠道，渠道级故障转移白拿。
- A 仅过渡。若用户暂不开官方账号：维持 A+v0.9.12 探测兜底（事后告警），B 不解决「提前知道」只解决「快速改」。

## 6. 落地步骤

**路线 C（推荐先行，10 分钟）**：
1. platform.deepseek.com 注册→充值→建 API key（官方支持国内支付；最低充值额 UNVERIFIED 未核）。
2. 产品服务商面板：活跃档 host 改 `https://api.deepseek.com/v1`，key 改官方 key，模型名在官方 /models 拉取列表中选择（deepseek-flash）。
3. 代理：确认代理客户端对 api.deepseek.com 直连（s77 教训；或维持当前 ProxyEnable 策略）。
4. 验证：产品打开即知（v0.9.12 健康探测）+ 发一条真实消息。

**路线 B（若上自建，gpt-load 版）**：
1. 下载 `gpt-load-windows-setup.exe`（22.3MB）→一次管理员批准→装成低权限 Windows 服务+开机自启，管理页 http://127.0.0.1:3001，保存安装完成页显示的管理 key（副本在 `%ProgramData%\GPT-Load\data\auth.key`）。
2. 渠道：OpenAI Compatible，base url `http://111.228.54.166:20128/v1`，key=现有中转 key；再加第二渠道 api.deepseek.com + 官方 key。
3. 组：模型 deepseek-flash 上游+固定别名（「版本收敛」用法）；今后上游任何改名，改组别名即可，产品无感。
4. 产品面板：host 改 `http://127.0.0.1:3001/v1`，key 改网关 AccessKey（gpt-load 对客户端的 OpenAI 兼容前缀以 /v1/models 实测为准，落地时一 curl 即验）。
5. 代理：127.0.0.1 加入代理客户端直连名单。
6. new-api 版替代：`new-api.exe --port 3000`→root/123456 首登改密→渠道+模型映射 JSON（{"产品侧模型名":"上游实际名"}）→令牌页建 sk- 令牌→面板 host `http://127.0.0.1:3000/v1`+令牌作 key。

**产品侧「只改 host 一处」已验证（VERIFIED-SRC）**：host 唯一真相源= `forge/data/secrets.env` 的 `FORGE_AGENT_HOST`，由服务商面板回写（chat-bridge.tpl.js:44-52 rewriteSecretsEnv），桥侧所有消费点同源读（:650 探锚/:739 OPENAI_HOST→goose/:1073/:3369/:3413/:3456/:3473），vision.js:38/:90 同键消费。改面板 host+key 两格=桥/探测/vision 全生效，零代码改动。两点注记：①`forge/data/providers.json` 存各档案 host，切换应对**活跃档编辑或新建档案**（s78 修复后编辑上下文优先，不会回写覆盖）；②网关若做模型映射，GOOSE_MODEL_NAME 无需动——名字稳定性由映射层持有，这正是收益。

## 7. 排除与方法注记 + 止损

- 已排除：LiteLLM（Python 重栈）；one-hub/Done-hub 等 fork（无增量）；硅基流动/火山方舟聚合（C 的变体，用户有需要自行同法评估）；gpt-load 调度/错误码机制子页（索引级证据已够裁决，落地时再深读 docs/internals/scheduling）。
- 降级标注：GLM-4.7 价格（JS 页未取到）；new-api 默认口令与 #4174（2ND）；网关内存档位（估计）；Go 不读 IE 代理（高置信工程事实未核源）；DeepSeek 最低充值额（未核）。
- 检索止损：四家网关在官方文档级证据到手后停止扩源（社区评测零增量）；官方直连政策各取到一页原文实证即停。
- **前 3 高价值源**（后续深挖按序）：
  1. https://api-docs.deepseek.com/quick_start/pricing —— 旧名兼容原文+价格+并发（裁决核心证据，C 路线全部依据）。
  2. https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash —— 「预告+自动路由」官方原文（供应商选择论的对照组）。
  3. https://www.gpt-load.com/docs —— 组级别名/调度/Windows 服务机制（B 路线落地依据）。

## 来源清单

- GitHub API 仓库元数据（stars/license/pushed_at，2026-09-13）：songquanpeng/one-api、QuantumNous/new-api、tbphp/gpt-load、yym68686/uni-api（VERIFIED-DOC）
- GitHub API latest releases 资产清单（同日）：one-api.exe 35.2MB；new-api-v1.0.0-rc.37.exe 126.7MB；gpt-load-windows-amd64.exe 91.2MB + setup.exe 22.3MB；uni-api 仅 .pex（VERIFIED-DOC）
- GitHub API tags：new-api v1.0.0-rc.33..37、gpt-load v2.0.0-rc.14..16（VERIFIED-DOC）
- one-api README（API raw 全文）：模型映射 §15、失败自动重试 §16、CHANNEL_TEST_FREQUENCY、手动部署 `./one-api --port 3000`+root/123456（VERIFIED-DOC）
- new-api README（API raw 全文）：Key Features 表、Automatic retry on failure、失败重试次数设置路径（VERIFIED-DOC）
- new-api 渠道管理文档：模型映射 JSON 语义/original_model/upstream_model/多 Key 模式轮询+失败跳过+恢复重启用/测试所有渠道（VERIFIED-DOC，docs.newapi.pro/zh/docs/guide/feature-guide/admin/channel）
- gpt-load README（API raw 全文）：Windows 服务安装器/便携跑法/DATA_DIR/调度与凭证池/usage-cost（VERIFIED-DOC）
- gpt-load 文档站 docs/models：组级别名机制与「版本收敛」用途（VERIFIED-DOC，www.gpt-load.com/docs/models）；调度/监控为索引级（VERIFIED-DOC 索引）
- uni-api README（API raw 全文）：AUTO_RETRY 故障转移、provider.model 重命名映射、"one/new-api is too complex"定位（VERIFIED-DOC）
- DeepSeek 官方定价页：legacy names still accepted、flash/pro 价格与并发、off-peak 半价、v4-pro 延续公告（VERIFIED-DOC，api-docs.deepseek.com/quick_start/pricing）
- DeepSeek 路由形态本机探针：4 路径全 401（VERIFIED-RUN，2026-09-13）
- GLM-4.5-Flash 官方模型页：2026-01-30 下线+自动路由 GLM-4.7-Flash 原文（VERIFIED-DOC，docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash）
- GLM-4.5/X 下线建议迁移 4.7（VERIFIED-2ND，docs.bigmodel.cn 摘要级）
- new-api issues #4174（exe 自用模式登录实录）、#7040/#5420（自动禁用难恢复，research/26 已录）（VERIFIED-2ND）
- 产品源码：forge/conf/templates/chat-bridge.tpl.js:44-52/:650/:739/:1073/:3369/:3413/:3456/:3473；forge/bin/vision.js:38/:90；forge/data/secrets.env（FORGE_AGENT_HOST 现值=中转 /v1）；forge/data/providers.json:4（VERIFIED-SRC）
- 事故与环境背景：STATE.md s77/s78 节（云主机三次中断、ProxyEnable 处置、下架实录）（本仓一手记录）
