# 37 思考力度真杠杆：glm 线参数通道终审 + 模型双条目通道活体

> 2026-09-18。承接 `35-thinking-effort-factfind.md`（用户批评：思考深度"只能看不能选"，glm 系恒禁用态）。
> 探针在 `forge/tmp/tf37/`（ASCII 文件名）。9router 实测走 `127.0.0.1:20128`（与 `forge/data/providers.json` active 项 `111.228.54.166:20128` 同一路由，前轮同源）。**key 全部经 env 注入，本文与探针产物零 key 落盘**（tf37 仅含 `FORGE_PROBE_KEY` 变量名与 dummy key）。goose 实验全部在隔离 `GOOSE_PATH_ROOT`（`forge/tmp/tf37/arm-*`），未触碰产品 conf 与 dev 栈。9router 模型清单计数 125（前轮 124，上游动态漂移 +1，不影响结论）。

## 0. 结论速览

| # | 必答 | 结论 | 等级 |
|---|------|------|------|
| 1 | glm 家族全量枚举 | 裸名 `glm-5.3` **存在**（共 5 路前缀变体）；全池无任何 `-thinking`/`-reasoning` 变体；deepseek/qwen 也只有 pro/flash/fast、max/plus/flash 梯度 | VERIFIED-RUN |
| 2 | glm-5.3-flash 严格 A/B（5 样本×5 臂） | `thinking{enabled/disabled}`、`reasoning_effort{low/high}` 全部 200 且行为恒无差；effort-high 臂思考量均值反而最低——参数通道死透 | VERIFIED-RUN |
| 3 | glm-5.3 非 flash | 同款参数无效；但**模型间深度差真实**：难题上 reasoning 量 4 倍（1127 vs 279 chars）、正确率 3/3 vs 2/3 | VERIFIED-RUN |
| 4 | goose 双条目 | 同名双条目合法（首条 request_params 生效）；异名双条目均在 ACP 模型选项中、按条目挂参数精确上 wire；**会话内 `set_config_option(model)` 切换后 wire 模型名与参数同步换**——快/深零协议通道成立 | VERIFIED-RUN |
| 5 | 真杠杆排序 | L1=池内双条目快/深（唯一行为级真杠杆，本机全链路已证）；L2=reasoning 名单模型的原生 effort（前瞻）；参数级/别名级/reasoning 位全部判死 | 见 §6 |

---

## 1. 必答 1：9router glm/deepseek/qwen 家族全量枚举（/v1/models，2026-09-18）

全池 125 条。glm 家族 24 条：

- 顶级裸名：`glm-5.3`、`glm-5.3-flash`
- `zhipuguanfang/`：glm-4.5、glm-4.5-air、glm-4.6、glm-4.7、glm-5、glm-5-turbo、glm-5.1、glm-5.2、glm-5.3、glm-5.3-flash、glm-5.3-flashx
- `ocg/`：glm-5.3-flash、glm-5.3
- `ccp/z-ai/`：glm-5.3-flash、glm-5.3-flashx；`ccp/zai-org/`：GLM-5.3、GLM-5.2、GLM-5.2-Fast、GLM-5.1、GLM-5
- aliyuncs maas 兼容模式：glm-5.2、glm-5.3

要点：
- **非 flash 的 glm-5.3 存在**，且有 5 个入口（裸名 / zhipuguanfang / ocg / ccp/zai-org / aliyuncs）——"深端"候选成立。
- 无 `glm-5.3x`、`glm-5.3-air`、`glm-5.3-plus`；`glm-5.3-flashx` 是 flash 的兄弟变体（非"加深"档），`air`/`turbo` 只在旧家族（4.5/5）。
- **全池 0 条 `-thinking`/`-reasoning`/effort 后缀变体**（glm/deepseek/qwen 三家族逐一核对）。
- deepseek 10 条：`deepseek-v4.1-flash`、`ocg/deepseek-flash`、`ccp/deepseek-v4-pro|-v4-flash|-v4-flash-vision-exp|-v4-flash-fast|-v4.1-flash`、aliyuncs `v4-pro|v4-flash-0731|v4.1-flash`——只有规格梯度，无思考变体。
- qwen 20 条：3.6/3.7/3.8 × max/plus/flash 梯度，无思考变体。
- 与 L2（前瞻）相关：池内有 `ccp/claude-sonnet-5|opus-5|…`、`ccp/google/gemini-3.*`、`ccp/xai/grok-4.5|4.6`——这些**命中 goose `is_reasoning_model` 名字正则**，原生 effort 控制面对它们是活的。

## 2. 必答 2：glm-5.3-flash 严格 A/B（弥补前轮 3 样本不足）

协议：每臂 5 样本、max_tokens=512、同题（素数求和+3^7）、顺序发单。探针 `probe37.mjs chat`（arm/model/samples 均环境变量）。

reasoning_content 字符数（5 样本）与 completion_tokens 均值：

| 臂 | reasoning chars（逐样本） | 均值 | completion 均值 | 异常 |
|----|------|------|------|------|
| baseline | 142/276/63/272/275 | 206 | 180 | — |
| thinking{enabled} | 154/117/217/134/188 | 162 | 187 | — |
| thinking{disabled} | 318/249/266/112/66 | 202 | 194 | — |
| reasoning_effort=low | 222/202/152/161/163 | 180 | 183 | — |
| reasoning_effort=high | 156/126/140/193/80 | **139** | 166 | — |

- 五臂全 200、finish=stop、model 回声恒 `glm-5.3-flash`、prompt 恒 2844 tokens、`completion_tokens_details` 恒 null。
- **分布完全重叠，无单调性**（high 臂均值最低，方向都与语义相反）。
- 判决：`thinking` 与 `reasoning_effort` 在 9router×glm-5.3-flash 上**行为恒无差**。前轮"强制思考、无 off 开关、深度不可分辨"在 5×5 样本下坐实。glm 线唯一可能的行为杠杆=模型选择本身。

## 3. 必答 3：glm-5.3 非 flash 同款 A/B + flash 对照

**(a) 五臂 A/B（同协议）** reasoning chars 均值：baseline 298（162–386）、think-en 298、**think-dis 329**（disabled 臂反而最高，再次证明无语义）、effort-low 308、effort-high 310；completion 均值 247/246/228/235/260。→ 非 flash **同样强制思考且参数无效**。

**(b) 简单题基线对照**（baseline 臂）：reasoning 298 vs flash 206（+45%）、completion 247 vs 180（+37%）。分布有重叠，仅作方向性证据。

**(c) 深题能力对照**（阶梯迭代题"3 起步，每步翻倍减 1，10 步后?"，唯一解 2049；3 样本、max_tokens=1024）：

| 模型 | reasoning chars | 均值 | completion 均值 | 正确 |
|------|------|------|------|------|
| glm-5.3-flash | 333/316/187 | 279 | 259 | **2/3**（1 发收敛到 2047，带错验证） |
| glm-5.3 | 869/1141/1372 | **1127** | 721 | **3/3**（全部带闭环自查步） |

- **4 倍思考量级差 + 正确率差**，且 glm-5.3 的响应含"闭合式验算并打勾"行为，flash 没有提速路径能补。
- 注意 completion 均值 721 vs 259：深档的单回合成本约 2.8 倍——快/深档位需要呈现成本/延迟代价。

## 4. 必答 4：goose declarative provider 双条目实验（隔离 root，mock 落盘 wire body）

复用 tf35 的 `mock9r.mjs`/`dump-bodies.mjs`；新臂脚本 `run-arms37.sh`、`acp-probe37.mjs`。goose 二进制 1.50.0，源码残卷 1.46.0 交叉。

| 臂 | 配置形态 | 结果 | 判决 |
|----|------|------|------|
| dup | 同 wire 名两条目（首条带 `request_params{reasoning_effort:high}`） | 配置加载**不报错**；wire body 含 `reasoning_effort:high`（首条生效） | 同名双条目合法共存；首声明者胜。VERIFIED-RUN |
| dist-flash / dist-deep | 异名两条目：`glm-5.3-flash`（无参数）+ `glm-5.3`（带 `reasoning_effort:high` + `thinking{enabled}`） | `GOOSE_MODEL=glm-5.3-flash` → wire 裸参数；`=glm-5.3` → wire 带该条目全部参数。**参数严格按条目挂载** | 异名双条目=每条目独立行为档。VERIFIED-RUN |
| ACP 会话内切换 | 同 dist 臂；`session/new` 后 `set_config_option(configId='model', value='glm-5.3')`，再发一回合 | model 选项列出两条目；set 接受且回读 `current='glm-5.3'`；切换后 wire 模型名变 `glm-5.3` 且**其 request_params 自动跟随上 wire** | **快/深会话内切换端到端成立，零新协议**。VERIFIED-RUN（wire 双落证据：mock 日志 n=3/4 flash 裸 → n=5/6 glm-5.3 带参） |
| disp | 条目内加未知字段 `"display_name":"DEEP MODE"` | 配置容忍（serde 忽略未知字段）、wire 名不变 | 显示名≠wire 名在 goose 层不存在（`ModelInfo` 无 display/alias 字段，`resolved_model` 仅进遥测，前轮已证）。VERIFIED-RUN + DOC(1.46 schema) |
| acpbit | 条目加 `"reasoning": true`（无 request_params） | ACP `thinking_effort` 选项**仍被遮蔽为仅 off**；wire 仍无思考键 | **`reasoning` 位是 openai 引擎下的死字段**：活体证伪 + 源码解释（`ModelConfig` 构建恒 `reasoning: None`，从不搬运 `ModelInfo.reasoning`；全库生产代码仅 openrouter/bedrock 写该位且与 declarative 无关）。VERIFIED-RUN + DOC |

补充源码级排除（DOC，1.46 源码 + 1.50 二进制机制在场）：
- **名字后缀别名排除**：`extract_reasoning_effort` 首行按 `is_openai_responses_model`（o*/gpt-5* 正则）短路，glm 系 `-high` 后缀既不剥离也不注入——"条目名 `glm-5.3-flash-high` 自动还原裸名"这条路不存在。
- **engine=openrouter 的注入旁路**（`apply_reasoning_config`）：`request_params.reasoning_effort` + 会话 thinking_effort 非 off 时可绕过名字门控注入 `reasoning:{effort}`——但必答 2/3 已证该参数在 9router 上**行为恒无差**，wire-true 而 behavior-null，不构成真杠杆。其固定路径 `/api/v1/chat/completions` 与 9router 的兼容性未测（UNVERIFIED，亦无必要测）。

## 5. 排除项汇总（本轮新增）

- glm 系参数通道（`thinking.type`、`reasoning_effort` low/high）：5×5 双模型 A/B，行为零差——排除（前轮 3 样本疑虑消除）。
- declarative 条目 `reasoning:true` 解除 ACP 遮蔽：活体证伪——排除。
- goose 条目名 effort 后缀做伪别名：源码短路——排除。
- 条目级 display_name/alias：schema 无此字段，未知字段被忽略——排除。
- 同名双条目做隐藏参数档：合法但 UI 不可分辨（选项列表同名），无产品价值——排除。

## 6. 必答 5：PocketForge 真杠杆排序

判据：「用户可见形态」= 选择器选中后必须产生**可观测 wire 差异 + 可测行为差异**（9router 线上前者易后者难）；「切换成本」；「风险」。

### L1（推荐落地）：池内双条目快/深 = 会话内切模型
- 形态：9router declarative provider 声明两条目 `glm-5.3-flash`（快）+ `glm-5.3`（深）；PocketForge UI 呈现"思考力度：快 / 深"，选中即 `session/set_config_option(configId='model', value=<条目名>)`。**行为差异本机已证**：深档 reasoning 量 4 倍、难题正确率 3/3 vs 2/3。
- 用户可见性：真实可选、真实生效；现成观测锚 `configOptions[id=model].currentValue` / `lastModelOverride` / `effectiveModel` / `provider_switched` 通知（qa s78b 同源）。注意 UI 标签（"深度"）由 PocketForge 自渲染，goose 侧不要求显示名≠wire 名。
- 成本：providers.json 池 +1 条目；桥 1 个 JSONRPC 调用（`set_config_option` model 分支，前轮 s76 已验证的切换链）；UI 两档。零协议新增。
- 风险：①深档成本/延迟约 2.8 倍（completion 721 vs 259），UI 需标注代价；②条目名必须与 9router 实际模型名严格一致（本机已核：`glm-5.3` 在池）；③两档均强制思考——**不要做"关思考"档**，诚实命名"快/深"。
- **不要顺手挂 `request_params`**：9router 对这些参数行为零差，挂上就是新的假把式。

### L2（前瞻布线，glm 线外）：reasoning 名单模型的原生 effort
- 池内 `ccp/claude-*`、`ccp/google/gemini-3.*`、`ccp/xai/grok-4.5|4.6` 命中 goose 名字正则，`thinking_effort` 控制面原生五档（tf35 已在 gpt-5 活体验证 set+wire）。若未来这类模型入池，桥把 `set_config_option(thinking_effort)` 与 `session/new` 回读取通（~20 行），档位即真。
- 对 glm 名字永不为真（三重闸门：UI 遮蔽、wire 名字门控、ModelConfig.reasoning 死字段）。

### 判死清单（不要立项）
- 9router 参数档（thinking/reasoning_effort）：行为零差（5×5 实证）。
- 9router 别名档：需路由管理面配别名——上游无 `-thinking` 变体、goose 侧别名通道全部封死后理论上仍可走 9router 管理面，但 L1 已零成本达成同目标，别名档无增益。

### 「会话内选思考力度」怎样才算不假（9router 线的边界）
能做到的真实上限：**两档**（flash=快、glm-5.3=深），会话内即时切换、wire 模型名与行为双重可验证——这就是 L1。做不到的：连续/五档 effort 标度——在 glm 名字上无论走参数、别名、reasoning 位还是引擎旁路，都只能做到 wire-true 或 UI-true 之一，无法两者皆真。当前"禁用态"若不落地 L1，反而是诚实的；落地 L1 后选择器才算真的。

## 7. 探针清单（可重跑）

| 脚本/产物 | 用途 | 复跑要点 |
|------|------|------|
| `forge/tmp/tf37/probe37.mjs` | 9router models 枚举 + 五臂 A/B（样本数/题面/max_tokens 环境变量化，支持 EXPECT 答案命中） | `FORGE_PROBE_KEY=$(providers.json active key) node probe37.mjs models`；`MODEL=… ARM=… SAMPLES=5 MAXTOK=512 node probe37.mjs chat` |
| `forge/tmp/tf37/run-arms37.sh <arm> <provider> <model>` | declarative 双条目 wire-body 臂（复用 tf35 mock9r/dump-bodies，端口 20191） | provider JSON 在 tf37 目录（dup/dist/disp/acpbit），臂 root 自动创建于 `arm-*` |
| `forge/tmp/tf37/acp-probe37.mjs` | ACP configOptions 读取 + 会话内切模型双落 wire | 先起 mock（MOCK_LOG 绝不在 mock 运行中删除——tf35 已踩过的已删 inode 陷阱）；`ROOT_DIR=… PROVIDER=dist MODEL=glm-5.3-flash SWITCH_TO=glm-5.3 node acp-probe37.mjs` |
| wire 双落证据 | 快/深切换 | `forge/tmp/tf37/acpbit.ndjson` n=3/4（flash 裸）→ n=5/6（glm-5.3 带参） |
