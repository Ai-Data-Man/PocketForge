# 43 国际主流模型「思考深度/能力参数」官方规范事实表（国际阵营唯一权威源）

> 2026-09-22。任务=纠偏前两轮（35/37/40）只覆盖 GLM/DeepSeek。本文覆盖国际阵营：OpenAI、Anthropic、Google Gemini，另附 xAI Grok、Mistral 结论。
> **唯一权威源=厂商官方文档/官方 SDK 类型定义/官方 OpenAPI**；**禁止**以中转/聚合/第三方博客为依据；**未发任何真实 LLM 请求**（纯文档级）。
> 分级：**VERIFIED-DOC**=官方原文或官方机读 schema 直取逐字规范；**UNVERIFIED**=文档缺失或仅间接证据。
> 抓取原始件（本地临时，**非仓库产物勿引用**）：`/tmp/pf43/`（`k_c2d126`=OpenAI reasoning 官文、`openai_openapi.yaml`=`openai/openai-openapi@master`、`a_4c9fb654`=`@anthropic-ai/sdk` messages.d.ts、`anth_models.d.ts`=anthropic SDK models.d.ts、`g_07bec0`=`@google/genai` d.ts、`gem_thinking.md`/`q_8ef3fe`=Gemini thinking 官文、`xai_full.txt`=docs.x.ai/llms-full.txt、`z_*`/`zt_*`/`hh_*`=Anthropic 官文经 reader 直取）。

---

## 0. 结论速览（逐厂商「官方思考参数形态」）

| 厂商 | 当前旗舰 | 官方思考参数形态 | 可分档? | 默认 | 分级 |
|---|---|---|---|---|---|
| **OpenAI** | `gpt-6-astra`（`gpt-5.6-sol`/`gpt-5.6`、`gpt-5.5`、`gpt-5.1`） | Responses:`reasoning:{effort, summary, mode, context}`；ChatCompletions:`reasoning_effort`。值域**七档** `none, minimal, low, medium, high, xhigh, max`（模型相关子集）。另有 `verbosity` 三档、`reasoning.mode` 二档 | **是**（原生枚举，官方文档直载） | 六代 `medium`（`gpt-5.2`/GPT-6 Sol/Luna 默认 `none`） | VERIFIED-DOC |
| **Anthropic** | `claude-opus-5-5` / `claude-sonnet-5`（Haiku=`claude-haiku-4-5`） | **两套并存**：新=`thinking:{type:"adaptive"}` + `output_config.effort` 五档；旧=`thinking:{type:"enabled", budget_tokens:N}`（Legacy，4.7+ 已拒收） | **是**（新=effort 五档；旧=预算 token 连续值，非档位） | effort 默认 `high`（Opus 5.5=`medium`）；adaptive 多数模型开 | VERIFIED-DOC |
| **Google Gemini** | `gemini-3.8-flash` / `gemini-3.1-pro-preview` | **三代切键**：Gemini 3=`thinkingConfig.thinkingLevel` 四档 `minimal/low/medium/high`；Gemini 2.5=`thinkingConfig.thinkingBudget` int（`0`=关，`-1`=动态）；另有 `thinking_summaries` | **是**（3.x=档位；2.5=预算 token） | 3.8F/3.7F/3.5F=`medium`；3.1 Pro/3 Flash=`high`；2.5=`dynamic` | VERIFIED-DOC |
| xAI Grok | `grok-4.7`（附 4.6/4.5） | `reasoning_effort` 四档 `low, medium, high, xhigh`（无 none，**不可关思考**） | 是 | `high` | VERIFIED-DOC |
| Mistral | `mistral-medium-3-5` / `mistral-small-latest` | `reasoning_effort` 二档 `high, none`（magistral 系**已弃用**） | 是（仅两档） | UNVERIFIED（文档未载默认） | VERIFIED-DOC(存在)/UNVERIFIED(默认) |

**最重要的一条跨厂判决**：**四家全部把「深浅」表达为同一模型上的参数（effort 档 / 预算 / level），无一以「换模型」表达深度。** 「思考型号变体」（OpenAI `-pro`/`-codex`、xAI `-reasoning`/`-non-reasoning`、Gemini `live-extended-thinking`）是**独立产品线/端点**，不是同一模型的深浅开关；且这些变体自身**也**接受 effort 参数。→ PocketForge 家族 `variant{fast,deep}` 换模型机制在**国际阵营同样无官方依据**，与 40 号文档对 GLM 的结论一致。

---

## 1. 逐厂商官方规范事实表

### 1.A OpenAI（GPT-5.x / GPT-6 / o 系）

**权威源**：
- 官文 `https://platform.openai.com/docs/guides/reasoning`（`.md` 镜像 `…/reasoning.md`；经 reader 直取，逐字）
- 官方机器可读 OpenAPI `https://github.com/openai/openai-openapi`（`openapi.yaml` v2.3.0，本机抓取 3.6 MB）
- 官方 SDK 类型 `npm:@openai/openai@7.21.0`（`resources/shared.d.ts`、`resources/responses/responses.d.ts`、`resources/chat/completions/completions.d.ts`）
- 官方模型页 `…/docs/models/<id>.md`

#### ① 思考参数真实键名/类型与完整值域（逐字）

**Responses API** —— `reasoning` 对象（官方 OpenAPI `#/components/schemas/Reasoning`）：官方原文

> `reasoning.effort` — `Constrains effort on reasoning for reasoning models. Currently supported values are `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.`
> `reasoning.summary` — `enum: auto, concise, detailed`（`generate_summary` 已 **@deprecated**）
> `reasoning.mode` — `'standard' | 'pro'`（官方原文：`GPT-5.6 and GPT-6 models support standard and pro reasoning modes in the Responses API. standard is the default.`）
> `reasoning.context` — `'auto' | 'current_turn' | 'all_turns'`（官方原文：`The gpt-5.6 model family defaults to all_turns; earlier models default to current_turn.`）

官方 OpenAPI `ReasoningEffort` schema **逐字枚举**：
```yaml
ReasoningEffort:
  anyOf:
    - type: string
      enum: [none, minimal, low, medium, high, xhigh, max]
      default: medium
```
SDK 类型逐字（`shared.d.ts:221`）：
```ts
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
```

**Chat Completions API** —— 平铺键 `reasoning_effort`（`completions.d.ts:1865`：`reasoning_effort?: Shared.ReasoningEffort | null;`），**值域同上**，但**无 `reasoning.summary/mode/context`**（这三个只在 Responses 面）。
→ **两套 API 差异（关键）**：官方原文
> `We recommend the [Responses API]. While the Chat Completions API…`
> `Use the Responses API for function calling. Chat Completions does not support function calling with GPT-6 Astra.`
> `GPT-6 Sol and Luna support function calling in Chat Completions only with reasoning_effort: "none". Use Responses for reasoning with tools.`

**`verbosity`** —— 独立于思考的「回复长度」档，**Responses=`text.verbosity`，ChatCompletions=顶层 `verbosity`**，两处**同值域**：
```yaml
Verbosity:
  enum: [low, medium, high]
  default: medium
```
官方原文：`Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. The default is medium.`

#### ② 是否分档 / 语义

**是，官方原生枚举**。官方逐档语义表（`reasoning.md`，逐字）：

| Effort | 官方 Best for（摘） |
|---|---|
| `none` | Latency-critical tasks that do not benefit from any reasoning… voice, fast information retrieval, classification |
| `minimal` | （枚举在册；GPT-6 迁移建议：`If your existing request uses minimal, start with low and compare results`） |
| `low` | Efficient reasoning with a modest latency increase… tool-use, planning, search, multi-step decision making |
| `medium` | When quality and reliability matter… Default configuration for most workloads |
| `high` | Hard reasoning, complex debugging, deep planning |
| `xhigh` | Deep research, asynchronous workflows and agentic tasks that require long runs |
| `max` | Maximum reasoning for your most complex tasks |

**逐模型支持子集（官方模型页逐字，重要）**：
- `gpt-6-astra` / `gpt-6-sol`: `none, low, medium (default), high, xhigh, max`（**Astra 不支持 `none`**：`Setting reasoning.effort … to none returns HTTP 400.`）
- `gpt-5.6-sol`（别名 `gpt-5.6`）: `none, low, medium (default), high, xhigh, max`
- `gpt-5.5`: `none, low, medium (default), high, xhigh`
- `gpt-5.4` / `gpt-5.2`: `none (default), low, medium, high, xhigh`
- `gpt-5.3-codex` / `gpt-5.2-codex`: `low, medium, high, xhigh`
- `gpt-5.1-codex`: （模型页未列 effort 集；Responses-only）
→ 官方原文：`Some models support only a subset of these values, so check the relevant model page.`

**`mode`（GPT-5.6/GPT-6 专属第二旋钮）**：官方原文 `Reasoning mode and reasoning effort are independent. Mode selects standard or pro execution, while reasoning.effort controls how much reasoning the model applies within that mode.`

#### ③ 思考预算参数与 max_tokens 关系

**官方无思考预算键**（无 `budget_tokens`/`thinkingBudget`）。宽度键=`max_output_tokens`(Responses)/`max_completion_tokens`(Chat)，官方原文：
> `An upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens.`
> `While reasoning tokens are not visible via the API, they still occupy space in the model's context window and are billed as output tokens.`

#### ④ 输入模态（官方模型页逐字）

所有当前旗舰/gpt-5.x/gpt-6 系：`Input modalities: text, image` / `Output modalities: text`。**无 PDF、无视频**原生输入声明（文档级）。
官方总览页：`All latest OpenAI models support text and image input, text output, multilingual capabilities, and vision.`

#### ⑤ 上下文窗口与最大输出（官方逐字数字）

| 模型 | context window | max output |
|---|---|---|
| `gpt-6-astra` / `gpt-6-sol` | 1,050,000（max input 922,000） | 128,000 |
| `gpt-5.6-sol`（=`gpt-5.6`）/`-terra`/`-luna` | 1,050,000（max input 922,000） | 128,000 |
| `gpt-5.5` | 1,050,000 | 128,000 |
| `gpt-5.4` | 1,050,000 | 128,000 |
| `gpt-5.1` | 400,000 | 128,000 |
| `gpt-5-codex` / `gpt-5.1-codex` / `gpt-5.1-codex-max` / `gpt-5.2-codex` / `gpt-5.3-codex` | 400,000（max input 272,000） | 128,000 |

#### ⑥ 同厂快/慢、thinking/非 thinking 的官方语义

**OpenAI 三层并存，官方语义明确**：
1. **同模型参数**（深浅主通道）：`reasoning.effort` + `reasoning.mode`——**这是官方唯一的「深浅」表达**。
2. **产品线变体**（独立模型 ID，每个**自身也接受** effort）：`-pro`（`Official: Version of GPT-5.5 that produces smarter and more precise responses`）、`-codex`（`A version of GPT-5 optimized for agentic coding in Codex`，`available in the Responses API only`）、`-chat-latest`（`model used in ChatGPT`）、`-mini`/`-nano`（`cost-efficient`）、`Sol`/`Terra`/`Luna`（智能/成本梯度）。
3. **推理/非推理同族**：`gpt-4.1`= `Smartest non-reasoning model`（官方明确「非推理」的独立模型）；GPT-5 起全系 `Reasoning token support`。
→ 官方**从未**把「同一模型名 + 快/深**换模型**」写成语义；变体是**并列产品**，深度是**参数**。**「换模型」无官方依据。**

#### ⑦ 兼容层/端点差异（官方「某参数不支持」声明）

- **Responses vs Chat Completions**：官方逐字差异见 ①。Chat 面**无** `reasoning.summary/mode/context`；GPT-6 Astra 的工具调用**仅** Responses；GPT-6 Sol/Luna 在 Chat 面**仅** `reasoning_effort:"none"` 时支持 function calling。
- **采样参数受限（官方逐字）**：`When reasoning effort is not none, remove temperature, top_p, and top_logprobs. For Chat Completions, also remove logprobs. For Responses, remove message.output_text.logprobs from include.`（来源 `guides/latest-model`）
- `none` 能力跨模型不一致：`gpt-6-astra` 传 `none` → **HTTP 400**。

---

### 1.B Anthropic Claude（Opus / Sonnet / Haiku）

**权威源**：官文 `platform.claude.com/docs/en/…`（经 reader 直取 `docs.anthropic.com` 镜像，逐字）；官方 SDK `npm:@anthropic-ai/sdk`（`resources/messages/messages.d.ts`、`resources/models.d.ts`）。**官方文档站对区域封锁返回 "App unavailable in region"，须走镜像域名直取；SDK 类型不受区域影响，为最硬证据。**

#### ① 思考参数真实键名/类型与完整值域（逐字）

**SDK 类型逐字（`messages.d.ts`）**：
```ts
export type ThinkingConfigParam =
  | ThinkingConfigEnabled | ThinkingConfigDisabled | ThinkingConfigAdaptive;

export interface ThinkingConfigEnabled {
  budget_tokens: number;            // Must be ≥1024 and less than max_tokens.
  type: 'enabled';
  display?: 'summarized' | 'omitted' | null;   // 默认 summarized
}
export interface ThinkingConfigAdaptive {
  type: 'adaptive';
  display?: 'summarized' | 'omitted' | null;
}
export interface ThinkingConfigDisabled { type: 'disabled'; }
```
→ **`thinking.type` 值域 = `enabled` | `disabled` | `adaptive`**（三值，非布尔）。官方原文定义：
> `Configuration for enabling Claude's extended thinking. When enabled, responses include thinking content blocks… Requires a minimum budget of 1,024 tokens and counts towards your max_tokens limit.`

**effort 独立键（不是 thinking 的子键）**：`output_config.effort`。SDK 逐字（`messages.d.ts:2035`）：
```ts
export interface OutputConfig {
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  format?: JSONOutputFormat | null;
}
```
官方原文：`Set output_config.effort on the request.` / `The top-level effort parameter is available on all supported models with no beta header required.`

**`display` 值域**：`summarized` | `omitted`（+ beta `updates`，需 header `thinking-display-updates-2026-08-18`）。

#### ② 是否分档 / 语义

**官方两代形态并存**（官方原文）：
> `Extended thinking (thinking.type: "enabled" with budget_tokens) is deprecated on the Claude 4.6 models… Claude 4.7 and later models do not support it and reject requests that use it, returning a 400 error. On Claude 4.5 and earlier models that support thinking, extended thinking is the only available thinking mode.`

**新形态（4.6+，含 5.x）用 effort 五档**，官方逐档语义：

| Level | 官方语义（逐字摘） |
|---|---|
| `max` | Absolute maximum capability with no constraints on token spending |
| `xhigh` | Extended capability for long-horizon work（>30 分钟 agentic/coding，token 预算百万级） |
| `high` | Spends as many tokens as the task needs for excellent results（**除 Opus 5.5 外所有支持 effort 模型的默认**） |
| `medium` | Balanced approach with moderate token savings（**Opus 5.5 默认**） |
| `low` | Most efficient. Significant token savings with some capability reduction（如 subagents） |

**官方关键定性（逐字）**：
> `The thinking parameter controls whether Claude thinks in thinking blocks before answering; the effort parameter controls how much work Claude puts into the whole response… Don't pass adaptive as an effort value: adaptive is a thinking mode, not an effort level.`
> `Effort controls thinking volume, not visible response length`
> `Effort is soft guidance. max_tokens is a strict limit.`

**官方「哪些模型支持哪些 effort 档」逐字（`effort.md` Compatibility，关键）**：
- `max`：Fable 5.1、Mythos 5.1、Fable 5、Mythos 5、Mythos Preview、Opus 5.5、Opus 5、Opus 4.8/4.7/4.6、Sonnet 5、Sonnet 4.6
- `xhigh`：Fable 5.1、Mythos 5.1、Fable 5、Mythos 5、Opus 5.5、Opus 5、Opus 4.8/4.7、Sonnet 5
- `Official: Not every model that supports max supports xhigh.`
- **Haiku 4.5：`Not supported`（无 effort）**。

#### ③ 思考预算参数与 max_tokens 关系（官方逐字，核心）

> `budget_tokens must satisfy these constraints:`
> `- Minimum of 1,024 tokens. The API rejects smaller values.`
> `- Less than max_tokens. Thinking tokens count toward the max_tokens limit for the turn, so the budget must leave room for the final response. The one exception is interleaved thinking, where budget_tokens can exceed max_tokens…`
> `- No cache pre-warming. Because budget_tokens must be less than max_tokens, extended thinking cannot be combined with max_tokens: 0.`
> `The budget is a target rather than a strict cap… max_tokens remains the hard ceiling on total output.`

**默认值**：`enabled` 无官方默认 budget（必填 `number`）；`display` 默认 `summarized`（旧模型）/`omitted`（新模型）。**effort 默认**：`high`（Opus 5.5=`medium`；Haiku 4.5=不支持）。

#### ④ 输入模态（官方逐字）

> `All current models support text and image input, text output, multilingual capabilities, vision, and tool use.`
→ 旗舰/次旗舰：**文本 + 图像**；无视频/PDF 原生输入声明（PDF 仅在 API 支持 `document` block 的 `application/pdf` base64，属内容块能力非「模态」行；本表按官方模态行记 image）。Haiku 4.5：`Input → output: Text and images → text`。

#### ⑤ 上下文窗口与最大输出（官方逐字）

| 模型 | context window | max output | 默认 effort |
|---|---|---|---|
| `claude-opus-5-5` | **1M tokens** | **128K tokens**（Batch beta 300K） | `medium` |
| `claude-sonnet-5` | **1M tokens** | **128K tokens**（Batch beta 300K，header `output-300k-2026-03-24`） | `high` |
| `claude-fable-5-1` | 1M | 128K | `high` |
| `claude-haiku-4-5` | **200K tokens** | **64K tokens** | 不支持 effort |

#### ⑥ 同厂快/慢、thinking/非 thinking 的官方语义

- **参数层**：`thinking.type`（开关/模式）+ `output_config.effort`（深浅档）——**同一模型上表达深度，官方明文**。
- **产品线变体**：`Fable`（`For demanding reasoning and long-horizon agentic work`，最慢）/`Opus`（`For long-running agentic coding and knowledge work`）/`Sonnet`（`The best combination of speed and intelligence`）/`Haiku`（`The fastest model with near-frontier intelligence`）——官方按**延迟/成本**分层，**非「同模型深浅」**。
- **强制思考不可关的官方清单（关键，用于 off 语义）**：`Always on`（拒 `disabled`）：Fable 5.1、Mythos 5.1、Fable 5、Mythos 5、Opus 5.5、Mythos Preview。`On`（默开但**可**关）：Opus 5（**但 effort `xhigh`/`max` 时拒 `disabled`**，返回 400）、Sonnet 5。`Off`（默关）：Opus 4.8/4.7、Opus 4.6、Sonnet 4.6、Opus 4.5、Haiku 4.5、Sonnet 4.5。

#### ⑦ 兼容层/端点差异（官方「某参数不支持」声明，Anthropic 面）

**官方 OpenAI SDK 兼容层页（`anthropic.com` 侧，reader 直取）逐字限制表**：
- `reasoning_effort` → **`Ignored`**（官方逐字！）
- `temperature` → `Between 0 and 1 (inclusive). Values greater than 1 are capped at 1.`
- `top_p` 全支持；`logprobs`/`metadata`/`response_format`/`seed`/`presence_penalty`/`frequency_penalty`/`logit_bias`/`store`/`user`/`modalities` → `Ignored`
- thinking 支持：`You can enable thinking by adding the thinking parameter… Although thinking improves Claude's reasoning for complex tasks, the OpenAI SDK doesn't return Claude's detailed thought process. For full thinking features… use the native Claude API.`
- 官方总则：`Most unsupported fields are silently ignored rather than producing errors.`
- **原生 Sonnet 5 新增限制**：`Setting temperature, top_p, or top_k to non-default values returns a 400 error.`

---

### 1.C Google Gemini（3.x / 2.5）

**权威源**：官文 `ai.google.dev/gemini-api/docs/thinking.md.txt`（官方 `.md.txt` 镜像，逐字）；官方模型页 `…/models/<id>.md.txt`；官方 SDK `npm:@google/genai`（`dist/genai.d.ts`）。

#### ① 思考参数真实键名/类型与完整值域（逐字）

**SDK 类型逐字（`genai.d.ts:15795`）**：
```ts
export declare interface ThinkingConfig {
  /** Indicates whether to include thoughts in the response. */
  includeThoughts?: boolean;
  /** Indicates the thinking budget in tokens. 0 is DISABLED. -1 is AUTOMATIC.
   *  The default values and allowed ranges are model dependent. */
  thinkingBudget?: number;
  /** Optional. The number of thoughts tokens that the model should generate. */
  thinkingLevel?: ThinkingLevel;
}
export declare enum ThinkingLevel {
  THINKING_LEVEL_UNSPECIFIED, MINIMAL, LOW, MEDIUM, HIGH
}
declare type ThinkingLevel_2 = "minimal" | "low" | "medium" | "high" | (string & {});
```
→ **键名按代次切换**：Gemini 3=`thinkingConfig.thinkingLevel`（字符串档）；Gemini 2.5=`thinkingConfig.thinkingBudget`（int）；两者**不可同发**：
> `You cannot use both thinking_level and the legacy thinking_budget parameter in the same request. Doing so will return a 400 error.`
> `Gemini 2.5 series models don't support thinkingLevel; use thinkingBudget instead.`

**`thinking_level` 值域**：`minimal, low, medium, high`（`minimal` 在部分模型**报错**）。
**`thinking_budget` 值域**：int；**`0`=DISABLED，`-1`=AUTOMATIC（动态）**，上限模型相关。
**`includeThoughts`/`thinking_summaries`**：`includeThoughts`(content API) 布尔；Interactions API 用 `thinking_summaries: "auto"|"none"`。

#### ② 是否分档 / 语义（官方逐字表）

**Gemini 3 档位（`thinking_level`，逐模型支持，官方原文表）**：

| Level | 3.8&3.7F | 3.6&3.5F | 3.1 Pro | 3.5&3.1 FL | 3.1 FL-Image | 3 Flash | 语义 |
|---|---|---|---|---|---|---|---|
| `minimal` | **Not supported (error)** | 支持 | 不支持 | 支持(默认) | 支持(默认) | 支持 | Matches the "no thinking" setting for most queries |
| `low` | 支持 | 支持 | 支持 | 支持 | 不支持 | 支持 | Minimizes latency and cost |
| `medium` | 支持(默认) | 支持(默认) | 支持 | 支持 | 不支持 | 支持 | Balanced thinking |
| `high` | 支持(动态) | 支持(动态) | 支持(默认,动态) | 支持(动态) | 支持(动态) | 支持(默认,动态) | Maximizes reasoning depth |

官方定性：
> `You can use the thinking_level parameter, which controls the maximum depth of the model's internal reasoning process… Gemini 3 treats these levels as relative allowances for thinking rather than strict token guarantees.`

**Gemini 2.5 预算表（官方逐字，含「关思考」）**：

| Model | Default | Range | Disable | Dynamic |
|---|---|---|---|---|
| 2.5 Pro | Dynamic | `128`–`32768` | **N/A: Cannot disable** | `-1`(默认) |
| 2.5 Flash | Dynamic | `0`–`24576` | `0` | `-1`(默认) |
| 2.5 Flash-Lite | Model does not think | `512`–`24576` | `0` | `-1` |

**官方默认值**：`If you don't specify a thinking level, Gemini will use the Gemini 3 models' default thinking level (e.g., "high" for Gemini 3.1 Pro, and "medium" for Gemini 3.5 Flash).`
**官方「不能关思考」**：`You cannot disable thinking for Gemini 3.1 Pro. Gemini 3 Flash and Flash-Lite also do not support full thinking-off.` / `Reasoning cannot be turned off for Gemini 2.5 Pro or 3 models.`

#### ③ 思考预算参数与 max_tokens 关系（官方逐字）

> `The max_output_tokens generation parameter sets the maximum number of tokens a response can generate, including thought tokens.`
> `When set, this parameter acts as a hard cutoff enforced by the infrastructure **without changing how the model allocates its thinking budget (thinking_level)**.`
> `If the model hits this limit while reasoning, it stops … with finish_reason: MAX_TOKENS … To reduce cost or latency without truncating responses, lower thinking_level (low or medium) instead of setting a small max_output_tokens.`
→ 与 OpenAI/Anthropic **同构**：思考 token 计入输出上限；**预算/档位与 max_output 相互独立**。

#### ④ 输入模态（官方模型页逐字）

`gemini-3.8-flash` / `gemini-3.1-pro-preview`：**Inputs: Text, Image, Video, Audio, and PDF**；**Output: Text**。
`gemini-2.5-pro`：**Inputs: Audio, images, video, text, and PDF**；Output: Text。
→ **国际阵营中模态最全的一家**（唯一官方列出视频与 PDF 输入）。

#### ⑤ 上下文窗口与最大输出（官方逐字）

| 模型 | Input token limit | Output token limit |
|---|---|---|
| `gemini-3.8-flash` | **1,048,576** | **65,536** |
| `gemini-3.1-pro-preview` | **1,048,576** | **65,536** |
| `gemini-2.5-pro` | **1,048,576** | **65,536** |

（官方 Gemini 3 指南另写 `1M / 64k`，与 1,048,576/65,536 同一事实的取整表述。）

#### ⑥ 同厂快/慢、thinking/非 thinking 的官方语义

- **Pro vs Flash**：官方逐字 `Gemini 3.1 Pro is best for complex tasks…` / `Gemini 3 Flash… with Pro-level intelligence at the speed and pricing of Flash.` —— **速度/成本产品线**，非「同模型深浅」。
- **各代同名变体**：`gemini-3.8-live` vs `gemini-3.8-live-extended-thinking`（官方：`Our high-reasoning audio-to-audio model, recommended when higher background reasoning is required during live interactions`）——**这是国际阵营里唯一以「模型名」承载 thinking 深浅的官方案例**，属 Live API 专用线，**不是通用文本模型的深浅机制**。
- **同模型深浅=参数**：`thinking_level` / `thinkingBudget`，官方明文。

#### ⑦ 兼容层/端点差异（官方 OpenAI 兼容页逐字）

官方 OpenAI 兼容文档给出 **`reasoning_effort` ↔ Gemini 原生键的映射表**（逐字）：

| `reasoning_effort`(OpenAI) | thinking_level(3.1 Pro) | thinking_level(3.1 FL) | thinking_level(3 Flash) | thinking_budget(2.5) |
|---|---|---|---|---|
| `minimal` | `low` | `minimal` | `minimal` | `1,024` |
| `low` | `low` | `low` | `low` | `1,024` |
| `medium` | `medium` | `medium` | `medium` | `8,192` |
| `high` | `high` | `high` | `high` | `24,576` |

> `If you want to disable thinking, you can set reasoning_effort to "none" for 2.5 models. Reasoning cannot be turned off for Gemini 2.5 Pro or 3 models.`
> `reasoning_effort and thinking_level/thinking_budget overlap…`（映射优先级见官方页）
> 原生键也可经 `extra_body.google.thinking_config` 透传。
> 兼容层仍标 beta：`Support for the OpenAI libraries is still in beta while we extend feature support.`

---

### 1.D xAI Grok（附，一句结论级）

**权威源**：`docs.x.ai/llms-full.txt`（官方全文索引，1.6 MB）、`docs.x.ai/developers/models/grok-4.7`。

- `reasoning_effort`，**四档 `low, medium, high, xhigh`，默认 `high`**，官方逐字：`If not specified, reasoning_effort defaults to "high". **Reasoning cannot be disabled.**`
- `xhigh` 仅 4.6+；官方：`On models that do not support it, such as grok-4.5, requests with "xhigh" are treated as "high".`
- 与推理模型冲突的参数（官方逐字）：`presencePenalty, frequencyPenalty, and stop cannot be used with reasoning models. Requests that include them return an error.`
- 模型页：`grok-4.7` context **500,000**，模态 `Text, Image`，`Reasoning efforts: Supported low, medium, high, xhigh / Default high`。
- **无 `thinking.budget`、无 bool 开关**；另有 `include: ["reasoning.encrypted_content"]`（加密推理回传，非深度控制）。
- **「换模型」线索**：xAI 存在 `grok-4.20-0309-reasoning` 与 `grok-4.20-0309-non-reasoning` 两个独立 slug（官方价目表并列），但 4.5+ 起改用同模型 `reasoning_effort`（官方原文为 `grok-4.7, grok-4.6, and grok-4.5 support the reasoning_effort parameter`）→ **官方已从「双模型」迁到「同模型参数」**。

### 1.E Mistral（附，一句结论级）

**权威源**：`docs.mistral.ai/capabilities/reasoning/`（经 reader 直取）。

- `reasoning_effort` 仅**两档**：官方逐字 `reasoning_effort = "high": The response includes a full thinking chunk before the final answer` / `reasoning_effort = "none": The model thinks minimally and the thinking chunk is omitted`。
- 适用模型官方逐字：`mistral-small-latest`、`mistral-medium-3-5`（`For agentic and code use cases, reasoning_effort="high" is recommended`）。
- **magistral 系已弃用**：`Looking for native reasoning models (magistral-small-latest, magistral-medium-latest)? These have been deprecated.`
- 响应形态：`high` 时 `message.content` 为 chunk 列表（含 `ThinkChunk`），`none` 时为普通 str。

---

## 2. 统一对照表（模型 × 思考键/值域/默认/可分档/预算参数/模态/context/maxOut/深浅机制）

| 厂商·官方模型 | 思考键（逐字） | 值域 | 默认 | 可分档? | 预算参数 | 输入模态 | context / maxOut | 深浅=参数 or 换模型 | 分级 |
|---|---|---|---|---|---|---|---|---|---|
| OpenAI `gpt-6-astra` | Responses `reasoning.effort` / Chat `reasoning_effort` | `none,low,medium,high,xhigh,max`（**无 none**，传 `none`→400） | `medium` | 是（6 档） | 无（宽度=`max_output_tokens`） | text, image | 1,050,000 / 128,000 | **参数** | VERIFIED-DOC |
| OpenAI `gpt-6-sol` | 同上 | `none,low,medium,high,xhigh,max` | `medium`（`gpt-5.2`=none） | 是（6 档） | 无 | text, image | 1,050,000 / 128,000 | **参数** | VERIFIED-DOC |
| OpenAI `gpt-5.6-sol`(=`gpt-5.6`) | 同上 + `reasoning.mode`(standard/pro) + `reasoning.context` | `none…max`(6) | `medium` | 是 | 无 | text, image | 1,050,000 / 128,000 | **参数**（+`mode`） | VERIFIED-DOC |
| OpenAI `gpt-5.5` | 同上 | `none,low,medium,high,xhigh` | `medium` | 是（5 档） | 无 | text, image | 1,050,000 / 128,000 | 参数 | VERIFIED-DOC |
| OpenAI `gpt-5.4`/`gpt-5.2` | 同上 | `none,low,medium,high,xhigh` | **`none`** | 是 | 无 | text, image | 1,050,000 / 128,000 | 参数 | VERIFIED-DOC |
| OpenAI `gpt-5.3-codex`/`gpt-5.2-codex` | 同上（Responses only 或 400k） | `low,medium,high,xhigh` | 未载 | 是（4 档） | 无 | text, image | 400,000 / 128,000 | 参数 | VERIFIED-DOC |
| OpenAI `gpt-5.1-codex`/`gpt-5-codex` | 同上（**Responses only**） | 模型页未列集 | 未载 | 是 | 无 | text, image | 400,000 / 128,000 | 参数 | VERIFIED-DOC(端点)/UNVERIFIED(档集) |
| Anthropic `claude-opus-5-5` | `thinking:{type}` + **`output_config.effort`** | type:`adaptive`（`enabled`/`disabled`→**400**）；effort:`low,medium,high,xhigh,max` | effort `medium`；thinking 恒开 | 是（effort 5 档） | 无（新形态无 budget） | text, image | 1,000,000 / 128,000 | **参数** | VERIFIED-DOC |
| Anthropic `claude-sonnet-5` | 同上 | type:`adaptive`/`disabled`（`enabled`→400）；effort 5 档 | effort `high`；adaptive 默开 | 是 | 无 | text, image | 1,000,000 / 128,000 | 参数 | VERIFIED-DOC |
| Anthropic `claude-fable-5-1` | 同上 | type:`adaptive` only（`enabled`/`disabled`→400）；effort 5 档 | effort `high`；恒开 | 是 | 无 | text, image | 1,000,000 / 128,000 | 参数 | VERIFIED-DOC |
| Anthropic `claude-haiku-4-5` | **`thinking:{type:"enabled", budget_tokens:N}`**（Legacy only） | type:`enabled`/`disabled`（`adaptive`→400） | 默关；budget 必填 | **否**（预算连续值，无 effort） | **`budget_tokens` ≥1024 且 < `max_tokens`** | text, image | **200,000 / 64,000** | 预算（非档位） | VERIFIED-DOC |
| Anthropic `claude-opus-4-5`/`sonnet-4-5` | 同上（Legacy only） | 同上 | 默关 | 否 | `budget_tokens`（Opus 4.5 **另**支持 effort 组合） | text, image | 未在本次页载 | 预算 | VERIFIED-DOC |
| Google `gemini-3.8-flash` | `generationConfig.thinkingConfig.thinkingLevel` | `low,medium,high`（`minimal`→**error**） | `medium` | 是（3 档） | 无（宽度=`max_output_tokens`） | text,image,video,audio,PDF | 1,048,576 / 65,536 | **参数** | VERIFIED-DOC |
| Google `gemini-3.1-pro-preview` | 同上 | `low,medium,high`（`minimal` 不支持） | **`high`** | 是 | 无 | text,image,video,audio,PDF | 1,048,576 / 65,536 | 参数 | VERIFIED-DOC |
| Google `gemini-2.5-pro` | `thinkingConfig.thinkingBudget` | int `128–32768`；`-1`=动态；**不可关** | `-1`（动态） | 否（连续预算） | `thinkingBudget` | audio,image,video,text,PDF | 1,048,576 / 65,536 | 预算 | VERIFIED-DOC |
| Google `gemini-2.5-flash` | 同上 | int `0–24576`；`0`=关 | `-1`（动态） | 否 | `thinkingBudget` | **text,image,video,audio（官方页无 PDF）** | 1,048,576 / 65,536 | 预算 | VERIFIED-DOC |
| xAI `grok-4.7`/`4.6`/`4.5` | `reasoning_effort` | `low,medium,high,xhigh`（4.5 无 xhigh 实际降 `high`） | `high`（**不可关**） | 是（4 档） | 无 | text, image | 500,000 / 未载 | **参数** | VERIFIED-DOC |
| Mistral `mistral-medium-3-5`/`small-latest` | `reasoning_effort` | `high, none`（2 档） | UNVERIFIED | 是（2 档） | 无 | 未载 | 未载 | 参数 | VERIFIED-DOC(存在) |

---

## 3. 「预置应有值」表（字段对齐 PocketForge `model-caps.json` 形态）

字段口径沿用 40 号文档：`context_len` / `multimodal` / `thinking{mode, levels, default, off_supported}` / 「翻译到请求体的形态」。**深度字段全部落在同一模型上，`variant` 无官方依据，应删。**

| 字段 | `gpt-6-astra`(OpenAI) | `gpt-5.6-sol` | `gpt-5.1-codex` | `claude-opus-5-5` | `claude-sonnet-5` | `claude-haiku-4-5` | `gemini-3.8-flash` | `gemini-3.1-pro-preview` | `gemini-2.5-flash` |
|---|---|---|---|---|---|---|---|---|---|
| `context_len` | 1050000 | 1050000 | 400000 | 1000000 | 1000000 | 200000 | 1048576 | 1048576 | 1048576 |
| `context_est` | false | false | false | false | false | false | false | false | false |
| `max_output` | 128000 | 128000 | 128000 | 128000 | 128000 | 64000 | 65536 | 65536 | 65536 |
| `multimodal` | true（text+image） | true（text+image） | true（text+image） | true（text+image） | true（text+image） | true（text+image） | **true（含 video/audio/PDF）** | **true（含 video/audio/PDF）** | true（text+image+video+audio，**无 PDF**） |
| `thinking.mode` | `native`(effort) | `native`(effort) | `native`(effort) | `native`(effort) | `native`(effort) | **`budget`** | `native`(level) | `native`(level) | **`budget`** |
| `thinking.levels` | `["off","low","medium","high","xhigh","max"]`（**去 off**，见下） | `["off","low","medium","high","xhigh","max"]` | `["low","medium","high","xhigh"]` | `["low","medium","high","xhigh","max"]` | `["low","medium","high","xhigh","max"]` | `[]`（预算） | `["low","medium","high"]` | `["low","medium","high"]` | `[]`（预算） |
| `thinking.default` | `"medium"` | `"medium"` | UNVERIFIED | `"medium"` | `"high"` | 关 | `"medium"` | `"high"` | `"dynamic"` |
| `thinking.off_supported` | **false**（`none`→400） | true（`none`） | true | **false**（`disabled`→400；effort≥xhigh 亦 400） | true（`disabled`） | true（不发 thinking 即关） | **false** | **false** | **true**（budget 0 / effort none） |
| 预算键 | 无 | 无 | 无 | 无（新形态） | 无 | **`budget_tokens`(≥1024,<max_tokens)** | 无 | 无 | **`thinkingBudget`(0=关,-1=动态)** |
| 请求体形态 | Responses `{"reasoning":{"effort":"<..>"}}`；Chat `{"reasoning_effort":"<..>"}` | 同左（+`{"reasoning":{"mode":"pro"}}`可选） | Responses `{"reasoning":{"effort":"<..>"}}` | `{"thinking":{"type":"adaptive"},"output_config":{"effort":"<..>"}}` | 同左 | `{"thinking":{"type":"enabled","budget_tokens":N}}` | `{"generationConfig":{"thinkingConfig":{"thinkingLevel":"<..>"}}}` | 同左 | `{"generationConfig":{"thinkingConfig":{"thinkingBudget":N}}}` |
| `thinking.variant` | **删除** | **删除** | **删除** | **删除** | **删除** | **删除** | **删除** | **删除** | **删除** |

要点：
1. **深度=同模型参数**（四家一致）；`variant{fast,deep}` 与 `mode:"variant"` 在**国际阵营同样无官方依据**。
2. **off 语义逐模型不同**：OpenAI `none` 跨模型不一致（Astra 无）；Anthropic 新旗舰**禁止关**（400）；Gemini 3 系**禁止关**；xAI **不可关**。预置若给 `["off",…]` 一律与官方冲突。
3. **Haiku 4.5 是 Anthropic 唯一的预算族**：`budget_tokens`，无 effort，无 interleaved thinking。
4. **Haiku 4.5 与 Sonnet/Opus 5 不可共用同一 thinking 翻译**（前者 `enabled+budget_tokens`，后者 `adaptive+output_config.effort`，互发即 400）。
5. **Gemini 3 vs 2.5 键名不同**：`thinkingLevel`(str) 与 `thinkingBudget`(int) **同发即 400**；预置须按模型代次选键。
6. **`temperature` 限制**：OpenAI 推理模型（effort≠none）须移除 `temperature/top_p/top_logprobs`；Sonnet 5 非默认 `temperature/top_p/top_k` → 400；Gemini 3 强烈建议保持 `1.0`。预置若暴露温度旋钮需按模型加门。
7. **兼容层不等价**：Anthropic OpenAI 兼容层**忽略 `reasoning_effort`**（官方明文）；Gemini 兼容层**映射** `reasoning_effort`→level/budget。同一 `reasoning_effort` 字段在不同 host 上语义**不同**。

---

## 4. 跨阵营归类（抽象层设计的直接输入）

按「参数形态」分族（本次国际 5 厂商）：

**A 族 · `reasoning_effort` 字符串枚举族（值域随模型变化）** —— 代表：**OpenAI**（`reasoning.effort`/`reasoning_effort`，`none…max` 7 值 **⊃** 各模型子集）、**xAI Grok**（`reasoning_effort`，4 值）、**Mistral**（`reasoning_effort`，2 值）、**Gemini OpenAI 兼容面**（把 `reasoning_effort` 映射到原生键，4 值）。
特征：键名跨厂几乎同名（`reasoning_effort` / `reasoning.effort`）；**值域是「各模型子集」，不是全局集合**；官方一律「同模型参数」。

**B 族 · 数值预算族（`thinking.budget_tokens` / `thinkingBudget`）** —— 代表：**Anthropic Legacy**（`thinking:{type:"enabled",budget_tokens:N}`，约束 ≥1024 且 `< max_tokens`）、**Google Gemini 2.5**（`thinkingConfig.thinkingBudget`，`0`=关/`-1`=动态/上界模型相关）。
特征：**连续 token 值**而非档位；`0`/`-1` 有特殊语义；官方已标记为**旧代/兼容保留**（Anthropic 4.7+ 拒收；Gemini 官方建议 3 系改 `thinkingLevel`）。

**C 族 · 档位枚举族（非 effort 命名，自有键）** —— 代表：**Google Gemini 3.x**（`thinkingConfig.thinkingLevel` ∈ `minimal/low/medium/high`）。
特征：与 A 族**语义同类（档位）但键名/值名不同**，且**同一厂商内按代次切换**（3.x=level，2.5=budget）。是「A 族键名归一」的最大障碍：厂商自己都没统一。

**D 族 · 模式枚举族（思考模式，非深度）** —— 代表：**Anthropic 新形态**（`thinking.type` ∈ `adaptive`/`disabled`，深度另由 `output_config.effort` 承载）。
特征：**开关/模式键与深度键彻底分离**（两个顶层字段）；`effort` 同时作用于文本与思考 token；`adaptive` 不是 effort 值（官方**显式**警告）。

**E 族 · 布尔开关族** —— **本次国际 5 厂商旗舰中不存在纯布尔 `enable_thinking`**。最接近者=Anthropic 的 `disabled`（但它是三值枚举的成员）与 Gemini 2.5 的 `budget=0`（数值表意）。布尔族在本阵营**无代表**。

**F 族 · 无思考参数族** —— **本次国际 5 厂商旗舰中不存在**（连 `gpt-4.1` 这类官方「非推理模型」也是独立模型而非「同模型关思考」）。xAI 历史上用 `-reasoning`/`-non-reasoning` 双 slug，但 4.5+ 已改参数化。

**对抽象层的直接推论**：
1. **深度控件只有三种可归一形态**：(i) 字符串档枚举（A+C 合并，需键名+值名双层映射）、(ii) 数值预算（B）、(iii) 模式枚举与深度分离（D）。建议抽象层建 **`{ dial: "levels" | "budget" | "mode", levels[], default, off }`** 三元模型，而非把 D 强行压进 A。
2. **`reasoning_effort` 不是通用键**：Anthropic 原生面**忽略**它（官方逐字），必须写 `output_config.effort`；Gemini 原生面**没有**它，只有 `thinkingLevel`/`thinkingBudget`。跨厂统一只能靠**适配层做键名映射**，不能靠「所有上游都认 effort」。
3. **`off` 必须逐模型判定**：官方四家三种态度——可关（OpenAI 部分 / Anthropic Sonnet5 / Gemini 2.5）、不可关且报错（Anthropic 5.x 旗舰 / Gemini 3.x / xAI）、概念不存在（OpenAI Astra 的 `none`→400）。预置的 `levels` 若含 `off` 必须按模型生成。
4. **「换模型」在本阵营无官方语义**——与 40 号文档对 GLM 的判决**同向**，可升级为**跨阵营通则**：深度=参数，产品线变体=独立模型（且变体自身也接受参数）。

---

## 5. UNVERIFIED 清单

1. **`gpt-5.1-codex` / `gpt-5-codex` 的 `reasoning.effort` 值域**：模型页未列 effort 集（仅 5.2/5.3-codex 列出 `low,medium,high,xhigh`）=UNVERIFIED。
2. **OpenAI 各模型 `minimal` 是否有效**：全局枚举含 `minimal`，但无逐模型 `minimal` 支持表；官方迁移建议只说 `If your existing request uses minimal, start with low`=UNVERIFIED（逐模型）。
3. **Anthropic `budget_tokens` 的官方默认值**：`ThinkingConfigEnabled.budget_tokens` 为**必填** `number`，文档未给默认=UNVERIFIED（是否可省略）。
4. **Anthropic 模型页自身数字**：`docs.anthropic.com/en/docs/models/<id>/overview` 直连返回区域封锁页；本文 Opus 5.5/Sonnet 5/Haiku 4.5 的 context/maxOut 取自该路由的 reader 镜像（逐字一致于 models overview 表）=**VERIFIED-DOC 但经镜像**，未在无代理下重申。
5. **Claude 5 系 `xhigh` 之外是否存在未文档化档位**：SDK 枚举只有 5 值，采信=VERIFIED-DOC；无更多档位。
6. **Anthropic「thinking 恒开」模型传 `display` 之外的手段降低思考**：官方唯一手段=`effort`（逐字 `effort is the primary control`）=VERIFIED-DOC，但「effort=low 时是否仍必有 thinking block」官方只说 `At lower levels, Claude can skip thinking entirely for simpler problems`=UNVERIFIED（是否 100% 跳过）。
7. **Gemini `thinking_level` 到 token 量的定量映射**：官方显式否定（`relative allowances for thinking rather than strict token guarantees`）=官方**拒答**，非文档缺失。
8. **Mistral `reasoning_effort` 的默认值与完整值域**：官方只举 `high`/`none` 两例，未给枚举全集与默认=UNVERIFIED。
9. **xAI Grok max output tokens**：模型页只给 context 500,000，未见 max output 数字=UNVERIFIED。
10. **各厂商中转/兼容端点的逐字参数面**：官方文档只约束官方域名；`api.anthropic.com` 等对本文环境返回 403，**未发任何真实请求**，故「上游 host 是否逐字实现」=UNVERIFIED（且按 40 号口径，中转不承载真相，**不作为依据**）。

---

## 6. 与既有研究的关系（不覆盖、只订正/补面）

- `40-official-thinking-param-specs.md`：国内阵营（GLM/DeepSeek）官方面。本文=国际阵营，结论**同向**（深度=同模型参数，换模型无官方依据），可合并为跨阵营通则。
- `35-thinking-effort-factfind.md` / `37-thinking-effort-real-levers.md`：以中转实测为依据，其「参数通道在链路上无效」是**链路面事实**；本文给出**规范面事实**（四家官方均支持参数化深度）。设计面以本文+40 号为准。
- `38-zcode-model-config-anatomy.md`：与本文「四家官方从不以换模型表达深度」互证。
