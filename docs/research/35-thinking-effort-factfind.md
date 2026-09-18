# 35 会话内思考 effort：机制取证（goose 1.50.0 × 9router × glm-5.3-flash）

> 2026-09-18。服务问题：主线「会话内选择模型思考 effort」。探针脚本在 `forge/tmp/tf35/`（ASCII 文件名）。
> 纪律：单变量隔离；goose 实验在隔离 GOOSE_PATH_ROOT（`forge/tmp/tf35/arm-*`）跑，未触碰产品 conf 与 dev 栈进程；9router 探针独立发；**key 已全部脱敏**（来自 `forge/data/providers.json` active 项 / `forge/conf/goose/config/custom_providers/forge-router.json` 的 `api_key_env: FORGE_AGENT_API_KEY`，本文一处都不落）。

## 0. 结论速览

| # | 问题 | 结论 | 等级 |
|---|------|------|------|
| 1 | goose 有原生思考控制面吗 | 有：`GOOSE_THINKING_EFFORT`（全局默认）+ ACP `set_config_option(configId='thinking_effort')`（per-session，5 档 off/low/medium/high/max）。CLI 无旗标 | VERIFIED-RUN |
| 2 | 对 glm-5.3-flash 走 openai 引擎有效吗 | **无效。** 档位写入 `request_params.thinking_effort` 后在 wire body 合并时被排除；`reasoning_effort` 仅对 o*/gpt-5*/grok 家族注入；UI 选项还被遮蔽成只剩 off | VERIFIED-RUN |
| 3 | 9router 有思考参数通道吗 | 六种参数形态全部 200 无报错；但 glm-5.3-flash **强制思考**（每响应都带 reasoning_content），无 off 开关；effort 深度差异不可分辨 | VERIFIED-RUN（深度 UNVERIFIED） |
| 4 | 9router 有模型名变体通道吗 | 无。glm 家族无 `-thinking` 等变体，只有上游前缀变体（zhipuguanfang/ ocg/ ccp/ 等） | VERIFIED-RUN |
| 5 | 哪条路能落地"档位" | 唯一被本机实证能改 goose wire body 的通道 = declarative provider `models[].request_params`（通道 C），但它是**静态按模型条目**——做成用户档位仍需模型名变体配合。工程排序见 §6 | 见 §6 |

---

## 1. Q1：goose v1.50.0 的思考控制面

**证据 1.1（源码残卷，1.46.0）** `tmp/goose-src`（Cargo.toml version=1.46.0）：

- `goose-provider-types/src/thinking.rs:277`：`enum ThinkingEffort { Off, Low, Medium, High, Max }`（serde lowercase）；`FromStr` 接受 `off|disabled|none`、`low`、`medium|med`、`high`、`max|xhigh`。
- `goose/src/config/base.rs:1173-1220`：`get_goose_thinking_effort()` = `get_param("GOOSE_THINKING_EFFORT")`（env 可注入，`get_goose_thinking_effort_reads_env` 测试在侧）；legacy 回落链：`CLAUDE_THINKING_TYPE`（adaptive|enabled→high，disabled→off）→ `CLAUDE_THINKING_ENABLED`（true→high，false→off）→ `GEMINI3_THINKING_LEVEL`（low|high）。
- `goose/src/model_config.rs`：每次构建 ModelConfig 都 `.with_default_thinking_effort(config.get_goose_thinking_effort())`——即**全局默认档**；per-session 覆盖经 `with_thinking_effort` 写入 `request_params["thinking_effort"]`。
- `goose/src/acp/server/dispatch.rs:167-172`：`session/set_config_option` 的 `config_id="thinking_effort"` → `agent.on_set_thinking_effort(session_id, value_id)` → `agents/agent.rs update_thinking_effort` → **按会话重建 provider**。set 路径无 is_reasoning_model 门控（任意档字符串都接受）。
- `goose/src/acp/response_builder.rs:303-345`：session/new 的 configOptions 含 `id="thinking_effort"`（category `thought_level`）；**档位列表与回读值被 `model_config.is_reasoning_model()` 遮蔽**：非 reasoning 模型只有 `["off"]` 且回读恒 "off"（`test_build_config_options_masks_non_reasoning_thinking_effort` 佐证）。
- `is_reasoning_model()`（`goose-provider-types/src/model.rs:242`）：`ModelConfig.reasoning` 显式位 → 否则按模型名：`is_openai_responses_model`（正则 `(?:^|[-/])(?:o\d+(?:$|-)|gpt-5(?:$|[-.]))`）、claude、gemini-3、grok-4.5/4.3/4.20/3-mini 等。**glm 系全部不命中。**

**证据 1.2（二进制交叉验证，1.50.0）** 对 `forge/bin/goose/goose-package/goose.exe` 提取可打印串：`GOOSE_THINKING_EFFORT`×2、`thinking_effort`×4、`reasoning_effort`×6、`Thinking effortControls reasoning effort for models that support extended thinking.`、`GOOSE_THINKING_EFFORTVOICE_AUTO_SUBMIT_PHRASES…`（PREFERENCE_DEFS 与源码同序）、`lowmediumhighxhigh` 档位串、`thinking_budgetbudget_tokensenable_thinking…`（INHERITED_SESSION_PARAM_KEYS 同串）——1.46 源码的机制在 1.50 二进制中全部在场。

**证据 1.3（CLI）** 隔离 root（`GOOSE_PATH_ROOT=forge/tmp/tf35/goose-root`）跑 `goose.exe --version` → ` 1.50.0`；`--help` 全子命令、`run/session/acp --help` grep `think|effort|reason` → **零命中**。无命令行旗标。

**证据 1.4（ACP 活体，glm-5.3-flash）** `tmp/tf35/acp-probe.mjs` spawn `goose acp`（env：`GOOSE_PROVIDER=openai GOOSE_MODEL=glm-5.3-flash OPENAI_HOST=http://127.0.0.1:20191/v1 OPENAI_BASE_PATH=chat/completions`，mock 端点）：

```json
raw thinking_effort option: {"id":"thinking_effort","name":"Thinking effort","category":"thought_level","type":"select","currentValue":"off","options":[{"value":"off","name":"off"}]}
set thinking_effort=high -> accepted; raw option now: {...同上, currentValue 仍 "off"}
```

**证据 1.5（ACP 活体，gpt-5 正控）** 同探针 `ARM_MODEL=gpt-5`：options = `off,low,medium,high,max`；`set thinking_effort=high` → 回读 `currentValue:"high"`。**控制面本身工作正常，遮蔽只打在 glm 身上。**

**Q1 结论**：goose 有完整思考控制面（env 全局默认 + ACP per-session 五档），但暴露面与 wire 效果都以 `is_reasoning_model()` 为闸门，glm-5.3-flash 被闸门外。等级：VERIFIED-RUN（本机 1.50.0 活体）+ 源码 1.46.0 佐证（版本差 4 个 minor，机制符号二进制在场）。

---

## 2. Q2：openai 引擎的 wire body 构造与注入面

**证据 2.1（源码）** `goose-provider-types/src/formats/openai.rs create_request_for_model_with_options`（1615-1745 行）：

- `reasoning_effort` 进 body 的**唯一**路径：`is_openai_responses_model(model)` 或 `supports_xai_reasoning_effort`（grok-4.5/4.3/3-mini）时，由 `model_config.thinking_effort()` 映射（`openai_reasoning_effort_for_thinking` / `xai_reasoning_effort_for_thinking`）。glm → 不进。
- `model_config.request_params` 泛型并入 body，排除键仅两个：`thinking_effort` 本身 + 保留键 `messages|model|stream|stream_options`。**即任何其他键（含 `thinking`、`reasoning_effort`、`reasoning`）都能被 request_params 注入 body。**
- `goose-providers/src/openai.rs stream()`（chat 分支）：declared model 的 `ModelInfo.request_params` 经 `apply_declared_request_params` 二次并入（同样只排保留键）。

**证据 2.2（对照实验，四臂）** `tmp/tf35/{mock9r.mjs, run-arms.sh, dump-bodies.mjs}`：本地 mock OpenAI（127.0.0.1:20191，NDJSON 落盘请求体），隔离 GOOSE_PATH_ROOT 各臂独立。每臂 `goose run -t "hi" --quiet`，对比 mock 收到的 body：

| 臂 | GOOSE_MODEL | GOOSE_THINKING_EFFORT | mock 收到（top-level keys） |
|----|----|----|----|
| 1 负控 | glm-5.3-flash | 未设 | `messages,model,stream,stream_options(,tools)` |
| 2 通道 A | glm-5.3-flash | `=high` | **与臂 1 完全相同，无任何思考键** |
| 3 正控 | gpt-5 | `=high` | 走 `/v1/responses`：`reasoning:{effort:"high",summary:"auto"}`（run 模式）；ACP 模式走 `/v1/chat/completions`：`reasoning_effort:"high"` |
| 4 通道 C | glm-5.3-flash，declarative provider `models[0].request_params={"thinking":{"type":"enabled"},"reasoning_effort":"high"}` | 未设 | body 含 `"thinking":{"type":"enabled"}` + `"reasoning_effort":"high"` |

臂 4 的 declarative provider 文件（隔离 root `arm-decl/config/custom_providers/decltest.json`，new 全 schema：engine=openai、models 为对象数组、`requires_auth:false`、`dynamic_models:false`）——**通道 C（body 注入）本机实证可行**。

**风险注记**：臂 4 实测 URL = `/chat/completions`（base_url 里的 `/v1` 后缀被丢弃，请求按 host + base_path 拼接）；产品现行 legacy schema（`forge-router.json`：models 为字符串数组 + `model_provider` 键 + base_url 带 `/v1`、无 base_path）与 new schema 不同源，桥 spawn env 的防双前缀锚是 `OPENAI_BASE_PATH:'chat/completions'`（chat-bridge.tpl.js:766）。采用通道 C 时路径拼接必须先探针复核。另：9router 对 `/v1/v1/chat/completions` 双前缀也容错（200，本机实测），这解释了配置形态漂移不炸的原因。

**证据 2.3（ACP 能不能每会话下发任意 request_params）** 源码：dispatch 的 `set_config_option` 四个分支（provider/mode/model/thinking_effort）全部不传 request_params（None）；`on_set_model` 传 `Some(&current_model_config)` 只继承 `INHERITED_SESSION_PARAM_KEYS = [thinking_effort, thinking_budget, budget_tokens, enable_thinking, preserve_thinking_context, preserve_unsigned_thinking]`（会话内切模型不丢 effort——对通道 A 的 reasoning 模型是利好）。**ACP 无任意 body 参数下发面。**

**Q2 结论**：goose 对 glm 系不自发任何思考参数；可注入面 = declarative `models[].request_params`（静态）；env/config 的 `GOOSE_THINKING_EFFORT` 与 ACP `thinking_effort` 对 glm 是 no-op。等级：VERIFIED-RUN。

---

## 3. Q3：9router × glm-5.3-flash 实测

探针：`tmp/tf35/probe9r.mjs`（node 直连 127.0.0.1:20128，与 goose 链同源；providers.json active key 经 env 注入，未落盘）。注意：非 stream 请求 9router 也回 SSE，第一轮探针因解析器不认 SSE 得出过"无 reasoning_content"的假象——**修正观测层后**以下才是事实。

**(a) /v1/models（200）**：glm 家族 = `glm-5.3`、`glm-5.3-flash`、`zhipuguanfang/glm-4.5…5.3-flash…5.3-flashx`、`ocg/glm-5.3-flash`、`ocg/glm-5.3`、`ccp/z-ai/glm-5.3-flash`、`ccp/zai-org/GLM-5.3…`（全表 124 个模型）。**无 `-thinking`/`-reasoning`/effort 后缀变体**——模型名通道（通道 B）在路由侧现列表上不存在，需要路由侧加别名才可行。

**(b) chat/completions 六形态（各 max_tokens=64，"1+1"）**：

| 形态 | status | reasoning_content | content 开头 | finish |
|------|--------|------|------|--------|
| baseline | 200 | 有（79 字符） | `<think></think>2` | stop |
| `thinking:{type:enabled}` | 200 | 有（58） | `<think></think>2` | stop |
| `thinking:{type:disabled}` | 200 | 有（25） | `<think></think>2` | stop |
| `reasoning_effort:"high"` | 200 | 有（31） | `<think></think>2` | stop |
| `reasoning_effort:"none"` | 200 | 有（49） | `<think></think>2` | stop |
| `reasoning:{effort:"high"}`（openrouter 风格） | 200 | 有（84） | `<think></think>2` | stop |

要点：①**六形态全 200**——无报错通道，与桥 s78 直调 `reasoning_effort:'none'` 400 降级的经验一致（9router 对该参数宽容钳制）；②**强制思考**：disabled/none 也照常返回 reasoning_content，无 off 开关；③content 恒带空 `<think></think>` 前缀（上游 think 标签被路由摘除后的残迹）；④`usage.completion_tokens_details` 恒 null，无 reasoning token 计量；⑤prompt 恒 ~2817 tokens——路由侧注入了大 system prompt（9router 自带 scaffold，与思考无关但影响成本核算）。

**(c) effort 深度 indicative（max_tokens=1024，素数求和题，各 2 发）**：high = 422/369 completion tokens，none = 378/379——**重叠，不可分辨**。上游 zhipu 侧是否兑现 reasoning_effort/thinking.type 深度语义，从这条链的响应**不可观测** → **UNVERIFIED**。若要定案需路由侧日志或上游文档佐证。

**(d) 桥既有先例交叉印证**：chat-bridge.tpl.js 直调路径已带 `reasoning_effort:'none'` + 400 降级重试（s78，行 3657/3677/3695）——直调单发通道的参数注入是既有能力；主聊天回合走 goose ACP，不经此路径。

**Q3 结论**：9router 这条链上，参数形态全部被接受但无一产生可观测的思考开关/深度差；事实通道既不是参数也不是现成模型变体，**在路由侧配置之前，"思考档位"没有可实证的 wire 差异**。等级：VERIFIED-RUN（接受性、强制思考）；深度 UNVERIFIED。

---

## 4. Q4：可实现档位排序（工程建议）

前提事实：glm-5.3-flash 强制思考——"快回答/想深点"实际是"**推理深度**"档位，不存在"关思考"档。

### 通道 B（推荐先探）：9router 路由侧模型名变体
- 做法：在 9router 上为 glm-5.3-flash 配别名档（如 `glm-5.3-flash-deep` → 同一上游 + 注入思考参数）；PocketForge 池子加名，复用 s76 `set_config_option(configId='model')` 切换链，**零新协议、零 goose 侧改动**。
- 最小 diff 面：providers.json models 数组 + 前端档位 UI（或把"档位"直接做成池内模型条目）。
- 可观测锚：现成——`lastModelOverride` / `effectiveModel` / `models[0]` / `provider_switched` 通知（qa s78b P3-2 同源），面板"当前档位"即当前生效模型名。
- 风险：①9router 别名+参数注入能力 **UNVERIFIED**（需路由管理面确认，是此路唯一卡点）；②别名即模型名， goose/桥全线把它当普通模型——无额外风险；③上游若不兑现深度（Q3c），档位退化为占位——上线前用路由日志或双档对照回答 Q3c。
- 附注：通道 C（declarative `request_params`）与 B 是天然搭档——若不想动 9router，可在 goose 侧 declarative provider 里声明两个**不同名**条目（如 `glm-5.3-flash` / `glm-5.3-flash-deep`）各自静态 request_params，但两者 wire 模型名不同，**仍要求 9router 把 `-deep` 名识别为同一上游模型**——绕不开路由侧别名，故 C 单独不成立，已实证的只是"注入能到达 wire"。

### 通道 A（备用/前瞻）：goose 原生 thinking_effort
- 对 glm-5.3-flash **已证死路**（UI 遮蔽 + wire no-op，三重实证）。但对未来入池的 o*/gpt-5*/claude/gemini-3/grok 系是原生通道：桥把 `session/set_config_option {configId:'thinking_effort', value}` 与 `session/new` 的 `configOptions[thinking_effort].currentValue` 读写接上即可，per-session、五档、无需 env 重启。
- 最小 diff 面（前瞻布线）：桥 +~20 行（一个 JSONRPC 调用 + 回读缓存）；UI 档位选项动态取自 configOptions，非 reasoning 模型自动只剩 off（天然降级）。
- 可观测锚：`configOptions[id=thinking_effort].currentValue`（session/new 与 set 响应都回传，本机实证）。
- 风险：模型分类是 goose 名单制（`is_reasoning_model` 名字正则），池内换名可能突然激活/失活；档位语义随 provider 引擎不同（responses API 走 `reasoning.effort`，chat 走 `reasoning_effort`，本机两种都实证过）。

### 通道 C（仅作 B 的搭档，不单独立项）：见上。

### 落地前必答（按序）
1. 9router 管理面：能否配"别名 → 同上游 + 固定参数"？→ 决定通道 B/C 生死。
2. 上游 zhipu glm-5.3-flash 对 `reasoning_effort` / `thinking.type` 是否有深度语义？→ 决定档位是真控温还是占位（现 UNVERIFIED，双档对照或上游文档可定案）。
3. 若 1、2 都否：诚实的替代设计是把"快/深"档位映射为**池内不同模型**（flash ↔ 非 flash glm-5.3），这是当前链路上唯一可实证产生行为差异的"档位"。

## 5. 排除项与已证伪

- CLI 旗标通道：run/session/acp help 无 thinking 旗标（本机 grep 零命中）——排除。
- `resolved_model` 别名（ModelInfo 字段）：仅进 InferenceMetadata 遥测（agent.rs:2193-2202），**不改 wire 模型名**——goose 侧别名法排除。
- ACP 任意 request_params 下发：dispatch 四分支全传 None——排除。
- 保留键注入 `model` 字段做伪别名：`messages|model|stream|stream_options` 在保留键清单里——排除。
- 观测工具干扰两例（已纠正后重测）：①9router 非 stream 请求也回 SSE，首轮解析器漏 reasoning_content；②mock 落盘文件在进程持有句柄时被 rm，写入进了已删除 inode——重启 mock 后重测。两次均为观测层问题，非被测系统行为。
- 源码残卷版本差：tmp/goose-src=1.46.0 vs 二进制 1.50.0。所有源码结论经二进制字符串交叉在场（§1 证据 1.2），关键行为（遮蔽、set 接受、wire no-op、五档）另经 1.50.0 活体独立实证——不依赖源码版本假设。

## 6. 探针清单（可重跑）

| 脚本 | 用途 | 复跑命令要点 |
|------|------|------|
| `forge/tmp/tf35/probe9r.mjs` | 9router models/chat 六形态+深度探针 | `FORGE_PROBE_KEY=$(providers.json active key) node probe9r.mjs models|chat <variant>`（key 不落盘） |
| `forge/tmp/tf35/mock9r.mjs` + `dump-bodies.mjs` + `run-arms.sh` | goose wire body 四臂对照 | 先起 mock（MOCK_PORT=20191）再 `bash run-arms.sh 20191`；勿删 mock 正在写的日志 |
| `forge/tmp/tf35/acp-probe.mjs` | ACP configOptions/set/prompt 端到端 | `ARM_MODEL=glm-5.3-flash node acp-probe.mjs arm-glm-baseline`（需 mock 在跑） |
| 隔离 root | `forge/tmp/tf35/arm-*` | GOOSE_PATH_ROOT 隔离，未触碰产品配置 |
