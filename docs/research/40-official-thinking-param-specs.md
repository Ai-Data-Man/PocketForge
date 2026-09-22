# 40 官方思考/推理参数规范事实表（模型面唯一权威源）

> 2026-09-22。任务纠偏：**不以中转（9router 等）为依据**——中转只是透传基础设施，不承载"模型能干什么"的真相。本文唯一权威源=各厂商**官方原生 API 规范**。
> 取证方式：直连官方文档站取原文（`docs.z.ai`、`docs.bigmodel.cn`、`api-docs.deepseek.com`，含 `llms.txt` / `llms-full.txt` / `openapi.json`）。**未发任何真实 LLM 请求**；dev 栈只读（`forge/data/providers.json`、`forge/data/model-caps.json`）。
> 分级：VERIFIED-DOC=官方文档原文直取的逐字规范；UNVERIFIED=文档缺失或仅有间接证据。
> 抓取原始件（本地临时）：`/tmp/zmd/*.md`、`/tmp/zfull.txt`、`/tmp/bmfull.txt`、`/tmp/zopenapi.json`、`/tmp/ds_*.html`。**非仓库产物，勿引用**。

---

## 0. 结论速览（逐模型「官方思考参数形态」）

| 模型（官方真名） | 官方思考参数形态 | 分级 |
|---|---|---|
| **glm-5.3** | 强制思考不可关（`thinking.type` 只能 `enabled`，传 `disabled` **报错**）；深度=`reasoning_effort` ∈ {`low`,`high`,`max`}，默认 `max`。**三档，官方原生** | VERIFIED-DOC |
| **glm-5.3-flash** | 与 glm-5.3 完全同款参数（`thinking.type` 仅 `enabled`；`reasoning_effort` ∈ {`low`,`high`,`max`}，默认 `max`）；差别只在**原生多模态**与成本/延迟 | VERIFIED-DOC |
| **deepseek-v4.1-flash**（官方名=`deepseek-flash`） | 思考**可开可关**：`thinking.type` ∈ {`enabled`,`disabled`}（默认 enabled）；深度=`reasoning_effort` ∈ {`none`,`low`,`high`,`max`}，默认 `high`；`none` 关思考，其余开。兼容映射 `minimal→low`、`medium/xhigh→high`、`ultra→max` | VERIFIED-DOC |

**最重要的一条官方判决**：智谱官方明确写"**关闭思考配置会转换为 low，不会切换到其他模型**"（`docs.z.ai` devpack / `docs.bigmodel.cn` coding-plan）——即"深度=换模型"**不是**官方语义；官方语义是**同模型 + effort 档位**。PocketForge 的 `variant{fast,deep}` 家族换模型机制**没有官方依据**。

---

## 1. 逐模型官方规范事实表

### 1.A 智谱 GLM-5.3

**权威页**：`https://docs.z.ai/guides/llm/glm-5.3`（英文）/ `https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3`（中文）/ `https://docs.z.ai/guides/capabilities/thinking`（Deep Thinking）/ `https://docs.z.ai/guides/overview/concept-param`（Core Parameters）/ `https://docs.z.ai/openapi.json`（机读 schema）。

**（1）思考参数真实形态**（原文，`docs.z.ai/guides/capabilities/thinking`）：

> `thinking.type`: Controls the deep thinking mode
>  * `enabled` (default): Enable dynamic thinking. … while `GLM-5.3`, `GLM-5.3-FLASH`, `GLM-4.7` and `GLM-4.5V` use forced thinking
>  * `disabled`: Disable deep thinking, provide direct answers

> Note: GLM-5.3 and GLM-5.3-FLASH no longer support disabling thinking (**an error will occur if the `thinking.type` parameter in the API request is set to `disabled`**).

**（2）分档**（原文，`docs.z.ai/guides/llm/glm-5.3` Feature Changes）：

> GLM-5.3 always operates with reasoning enabled and supports **three reasoning effort levels: `low`, `high`, and `max`**. Disabling reasoning is no longer supported.

| Parameter | Values | Default | Description |
|---|---|---|---|
| `thinking.type` | `enabled` | `enabled` | Supports reasoning only; disabling reasoning is not supported. |
| `reasoning_effort` | `low`, `high`, `max` | `max` | `low` – Lightweight Reasoning; `high` – Enhanced Reasoning; `max` – Deep Reasoning |

> * For GLM-5.3 and GLM-5.3-FLASH, only `max`, `high` and `low` are supported. **Any other input will result in an error.**

迁移提示（原文）：若当前用 `thinking.type: "disabled"`，须改 `enabled` 且 `reasoning_effort=low`，否则**请求失败**。

**（3）思考长度/预算参数**：**官方无 `thinking.budget_tokens`**。`docs.z.ai` 全文与 `openapi.json` 的 `ChatThinking` schema 仅含 `type` 与 `clear_thinking` 两键（见 §1.C）。预算相关的唯一键=`max_tokens`（输出上限，思考 token 计入输出），不构成"思考预算"旋钮。

**（4）输入模态**：**纯文本**。原文：`GLM-5.3 currently supports text-only inputs, with a 1M-token context window and a maximum output length of 128K tokens.`（模型概览页 `Input Modalities: Text / Output Modalities: Text`）。

**（5）上下文/最大输出**：上下文 **1M**，最大输出 **128K**（原文同上；`concept-param` 表：`glm-5.3` 默认 `max_tokens=65536`，上限 `131072`）。注：`z.ai` 旧版 `glm-5` 页写 200K/128K，**不是** 5.3。

**（6）同名不同档官方关系**：见 §1.D。

**（7）端点差异**：见 §1.E。

---

### 1.B 智谱 GLM-5.3-Flash

**权威页**：`https://docs.z.ai/guides/vlm/glm-5.3-flash`（英文）/ `https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash`（中文）。

**（1）思考参数真实形态**（原文）：

> `thinking.type` only supports `enabled`; thinking cannot be disabled.

> **参数说明**：文本参数与 GLM-5.3 保持一致，支持 1M 上下文。

**（2）分档**（原文，推荐设置）：

> **Recommended Settings**: `temperature: 1`, `top_p: 0.95`, and `reasoning_effort: max`. `thinking.type` only supports `enabled`; we recommend setting `thinking.clear_thinking: false`.

`openapi.json` 的 `ChatCompletionVisionRequest.reasoning_effort` 枚举**逐字**为 `["max","high","low"]`，默认 `max`（中文页同款事实：`reasoning_effort` 支持 `low`/`high`/`max` 三档，默认 `max`）。→ **与 glm-5.3 同档位集，官方一致**。

**（3）思考长度/预算**：同 glm-5.3，**无 budget_tokens**；`max_tokens` 上限 128K（`131072`）。

**（4）输入模态**：**原生多模态**——`Input Modality: Video / Image / Text / File`；`Output Modality: Text`（页首四卡逐字）。
- 图片：`messages[].content[]` 加 `type: image_url` 块，传 URL 或 Base64 Data URL，可多图。
- 文件：`type: file` + `file: { file_url: … }`，官方示例含 **PDF**（`demo1.pdf`）与 txt。
- 视频：`type: video_url`。
- 官方还给出 `GLM-5.3-FlashX`（同族更快版，200 tokens/s），文本/视觉参数与 Flash 同款。

**（5）上下文/最大输出**：上下文 **1M**，最大输出 **128K**（原文四卡；`openapi.json` vision schema `max_tokens` 上限 `131072`）。

**（6）同名不同档官方关系**：见 §1.D。

**（7）端点差异**：见 §1.E。

---

### 1.C 智谱 `thinking` 对象与 `clear_thinking`（机读 schema 逐字）

`https://docs.z.ai/openapi.json` → `components.schemas.ChatThinking`（**逐字**）：

```
ChatThinking: { type: object, description: "Only supported by GLM-4.5 series and higher models. …",
  properties: {
    type: { type:string, default:"enabled", enum:["enabled","disabled"],
      description: "Whether to enable the chain of thought(`GLM-5.3` `GLM-5.3-FLASH` series can only be enabled,
        and the thinking depth is controlled by `reasoning_effort`; for other models, when enabled,
        GLM-5.2 GLM-5.1 GLM-5 GLM-4.6 GLM-4.5 and others will automatically determine whether to think,
        while GLM-4.7 and GLM-4.5V will think compulsorily), default: enabled" },
    clear_thinking: { type:boolean, default:true,
      description: "Controls whether to clear `reasoning_content` from previous conversation turns. …
        `false`: Retains `reasoning_content` from prior turns and includes it in the context sent to the model.
        To enable Preserved Thinking, you must forward the full, unmodified, and correctly ordered historical
        `reasoning_content` in `messages`. …" } } }
```

**判定**：GLM 的思考开关面=**两个键**（`type` 开关、`clear_thinking` 历史保留），**深度面=独立顶层键 `reasoning_effort`**。**不存在** `thinking.budget_tokens`（`docs.z.ai`+`docs.bigmodel.cn` 全文 `budget_tokens` 命中 0）。

`ChatCompletionTextRequest.reasoning_effort`（机读，**逐字**）：`enum:["max","xhigh","high","medium","low","minimal","none"]`, `default:"max"` —— 但**说明文字**明确：`For the GLM-5.3 GLM-5.3-FLASH model, only the low / high / max levels are supported`；多出的 `xhigh/medium/minimal/none` 是**为 GLM-5.2 与跨协议兼容**（`none`/`minimal` 让 5.2 放弃思考；`low`/`medium`→`high`；`xhigh`→`max`）。**故 5.3/5.3-flash 的有效档位集={low,high,max}**。

---

### 1.D 同代两模型官方关系（"家族换模型"是否官方语义）

**官方对 glm-5.3 的定位**（`docs.z.ai/guides/llm/glm-5.3`）：`latest flagship model … It uses the same base model as GLM-5.2, with all improvements driven by post-training.`（文本旗舰）。

**官方对 glm-5.3-flash 的定位**（`docs.z.ai/guides/vlm/glm-5.3-flash`）：`the first native multimodal model in the GLM-5 series, delivering stronger intelligence than GLM-5.2 at an exceptionally low cost`；`320B total params / 18B activated … reducing attention computation and KV cache by 3.01× and 4.44× versus GLM-5.3`。

**判定**：两者是**同一代（GLM-5）下的「旗舰文本模型」与「低成本原生多模态模型」**，差异在**多模态能力 + 成本/延迟/吞吐**，**不是**同一能力的"浅档/深档"配对。官方推荐"更深"的**唯一**手段=`reasoning_effort`（同模型内），并**显式**声明：

> 关闭思考配置会转换为 low，**不会切换到其他模型**。（`docs.bigmodel.cn` coding-plan / `docs.z.ai` devpack 逐字）

> 若模型参数加上 `[1m]` 后缀……（1M 上下文靠后缀 `[1m]` 开启，非换模型）

**结论**：PocketForge 的 `thinking.mode="variant"`（X-flash ↔ X 家族快/深）**没有官方语义依据**；把 glm-5.3-flash 当"快档"、glm-5.3 当"深档"是**自造机制**。官方语义下两模型的正确关系是"**两条独立可选项**（成本/模态权衡）"，各自内部才有 effort 三档。

---

### 1.E 端点差异（OpenAI 兼容 vs Anthropic 兼容）

**智谱端点**（`docs.z.ai/guides/llm/glm-5.3` 逐字表）：

| Protocol | Base URL |
|---|---|
| OpenAI Chat Completion | `https://api.z.ai/api/coding/paas/v4`（Coding Plan）/ 通用 `https://api.z.ai/api/paas/v4` |
| OpenAI Response | `https://api.z.ai/api/v1` |
| Anthropic Message | `https://api.z.ai/api/anthropic` |

智谱 Anthropic 端点（`docs.bigmodel.cn/cn/guide/develop/claude/introduction`）：`base_url=https://open.bigmodel.cn/api/anthropic`，`model="glm-5.3"` 直接可用。**Anthropic 协议下的思考键**（`docs.z.ai` devpack 逐字）：

> Claude Code uses `thinking.type` and `output_config.effort`; Codex uses `reasoning.effort`. Disabling the thinking configuration is converted to `low` and does not switch to another model.

→ Anthropic 面：开关=`thinking.type`，**强度=`output_config.effort`**（非顶层 `reasoning_effort`）。档位映射表（逐字）：

| 工具传入值 | 实际档位 | 处理 |
|---|---|---|
| `thinking.type` 未传 / `true` / `enabled` / `adaptive` | max | 使用默认档 |
| `thinking.type` 为 `false` / `disabled` / `none` / `off` | **low** | 继续请求；仍会轻量思考 |
| `reasoning_effort` ∈ `minimal`,`light`,`low` | low | 自动转换 |
| `reasoning_effort` ∈ `medium`,`high` | high | 自动转换 |
| `reasoning_effort` ∈ `xhigh`,`max`,`ultra` | max | 自动转换 |
| 其他未知字符串 | max | 回退默认档并记录提示 |

**处理优先级**：显式 Effort > thinking 开关 > 默认 max。（**注意**：此表是**Coding Plan 网关**对 Claude Code 的收敛行为，`disabled→low` 仅在此收敛层成立；**标准 API 端点**对 glm-5.3 传 `disabled` 是**报错**——两处官方口径需分清。）

**ZCode CEL 映射示例核对面**：`reasoningLevel == "disabled" ? {"thinking":{"type":"disabled"}} : …` —— `thinking.type:"disabled"` 表达式**只对 GLM-5.2/GLM-4.x 与 DeepSeek 合法**，对 **glm-5.3/glm-5.3-flash 会报错**；Anthropic 面强度键是 `output_config.effort`（非 `reasoning_effort`）。

---

### 1.F DeepSeek（官方名 `deepseek-flash`；我方池中 `deepseek-v4.1-flash`）

**权威页**：`https://api-docs.deepseek.com/`（Your First API Call）/ `.../guides/thinking_mode`（Thinking Mode）/ `.../quick_start/pricing`（Models & Pricing）/ `.../api/create-chat-completion`（机读 schema）/ `.../guides/vision` / `.../guides/anthropic_api`。

**模型名事实**（原文，Pricing）：
> Use `deepseek-flash` as the model name. The legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are still accepted, but the corresponding models have been retired, their requests are served by the **DeepSeek-V4.1-Flash** model and billed at the Flash price.

→ 官方在册模型=`deepseek-flash`、`deepseek-v4-pro` 两个（`/models` 官方响应示例逐字）。**我方池中 `deepseek-v4.1-flash` 不在官方在册名单**（其为已退役 legacy 名的近似变体）；`deepseek-v4.1-flash` 是否被接受=**UNVERIFIED**（官方只保证 `deepseek-v4-flash`/`deepseek-v4-flash-vision-exp` 被接受并路由到 V4.1-Flash）。

**（1）思考参数真实形态**（原文，Thinking Mode 四列对照表逐字）：

| | OpenAI Format | Anthropic Format | Responses API Format |
|---|---|---|---|
| Thinking Mode Toggle⁽¹⁾ | `{"thinking": {"type": "enabled/disabled"}}` | 同左 | `{"reasoning": {"effort": "none/low/high/max"}}`（`none` disables thinking mode） |
| Thinking Effort Control⁽²⁾ | `{"reasoning_effort": "low/high/max"}` | `{"output_config": {"effort": "low/high/max"}}` | 同左 |

> ⁽¹⁾ Thinking mode is enabled by default, with the default effort being `high`.

**（2）分档**（原文，映射表逐字）：

| Requested effort | Actual mapped effort |
|---|---|
| minimal | low |
| low | low |
| medium | high |
| high | high |
| xhigh | high |
| max | max |
| ultra | max |

`create-chat-completion` 机读 schema 逐字：`reasoning_effort: { Possible values: [none, low, high, max]; "Controls the thinking mode toggle and the thinking effort. `none` disables thinking mode; `low` / `high` / `max` enable thinking mode. The default effort is `high`. For compatibility with existing software, `minimal` is accepted and mapped to `low`, and `medium` / `xhigh` are accepted and mapped to `high`." }`
`thinking: { Possible values: [enabled, disabled]; Default value: enabled; "If set to enabled, then use thinking mode. If set to disabled, then use non-thinking model." }`

→ DeepSeek 官方**真档位集={low,high,max} + 一个 off（`none`）**，共 **4 个有效档**；官方建议深浅实现=**同模型 effort**（非换模型——官方无 `-thinking` 类模型变体）。

**（3）思考长度/预算参数**（原文，`create-chat-completion` 逐字）：

> `max_tokens`: … The value must be between 1 and 384K (393216). **When not set, the default is 8K in non-thinking mode, 64K in thinking mode (128K with `reasoning_effort` set to `max`).**

→ **思考预算无独立键**，官方以"thinking 模式默认 max_tokens 抬升"表达；Anthropic 面显式声明 `thinking`: `Supported (budget_tokens is ignored)`（`guides/anthropic_api` 逐字）。

**（4）输入模态**（原文）：
- `guides/vision`：`The deepseek-flash model accepts images alongside text … Supported image formats: JPEG, PNG, GIF, and WebP. The format is detected from the actual file content`；三种传图法（base64 data URL / 外链 / Files API `file_id`）；限制：请求体 48 MiB、单图外链 32 MiB、单文件上传 64 MiB。
- **PDF 不支持**：官方图片格式仅列图像；Anthropic 面 `array, type = "document"` → **Not Supported**（逐字）。
- Pricing 表：`Vision` 一列 `deepseek-flash ✓ / deepseek-v4-pro Not supported`。
→ **`deepseek-flash`=支持图片（不含 PDF）；`deepseek-v4-pro`=不支持视觉**。

**（5）上下文/最大输出**（原文，Pricing 表逐字）：对 `deepseek-flash`：`CONTEXT LENGTH 1M`；`MAX OUTPUT MAXIMUM: 384K`。`max_tokens` 取值 1–384K；thinking 默认 64K，effort=max 时 128K。

**（6）同名不同档官方关系**：无同代快/深配对；官方两模型=`deepseek-flash`（快/便宜，支持视觉）与 `deepseek-v4-pro`（强，无视觉），差异为**能力/成本梯度**，深度仍由 `reasoning_effort` 承担。

**（7）端点差异**：OpenAI=`https://api.deepseek.com`，Anthropic=`https://api.deepseek.com/anthropic`。Anthropic 面兼容细节（逐字）：`thinking` Supported（`budget_tokens` is ignored）；`output_config` **Only `effort` is supported**；`top_p` 仅 thinking 模式生效（下界 0.95），非 thinking 恒 1.0；`temperature` 在 thinking 模式**不生效**（设置不报错但无效）；`anthropic-version`/`anthropic-beta` 被忽略（Files API 端点需 `files-api-2025-04-14`）。
→ OpenAI 面强度键=`reasoning_effort`，Anthropic 面=`output_config.effort`（**键名不同，值域同 {low,high,max}**）。

---

## 2. 「官方语义 vs 我们现状」对照表

现状取 `forge/conf/templates/chat-bridge.tpl.js`：`capsDefault` 名字启发式（约 816–832 行）、`validModelCapsPatch` 拒收（约 878–903 行）、`llmproxy` effort→模型翻译（约 3125–3140 行）；数据取 `forge/data/model-caps.json` 现值。

| # | 面 | 官方语义（VERIFIED-DOC） | 我们现状 | 判定 |
|---|---|---|---|---|
| 1 | GLM 深度机制 | 同模型 `reasoning_effort` ∈ {low,high,max}，默认 max | `mode:"variant"` → effort `high/max` **换模型**到 `glm-5.3`，`off/low/medium`→`glm-5.3-flash`（llmproxy `delete j.reasoning_effort; delete j.thinking`） | **冲突**：官方深度=同模型档位；换模型非官方语义，官方显式否定（"不会切换到其他模型"） |
| 2 | GLM 开关 | glm-5.3/5.3-flash **不可关**，传 `disabled` 报错 | levels 含 `off`，家族档位 `off` 被映射为 fast 模型 | **冲突**：官方无 off 档；glm 线 `off` 概念不成立 |
| 3 | GLM 档位集 | {low, high, max}，参数枚举只这 3 个有效 | 注册表写 `["low","max"]`（`model-caps.json`），桥缺省写五档 `["off","low","medium","high","max"]`（`capsDefault`） | **错**：既非官方 3 档，且 GLM 侧多出的 off/medium 会被上游**报错或映射**（5.3 未知值报错） |
| 4 | 家族配对 | 官方两模型=同代"旗舰文本 / 低成本多模态"，非快深配对 | `variant{fast:"glm-5.3-flash", deep:"glm-5.3"}` | **无官方依据**（自造） |
| 5 | GLM 输入模态 | glm-5.3=纯文本；glm-5.3-flash=**视频/图片/文本/文件（含 PDF）** | 两条均 `multimodal:false`；启发式 `MULTIMODAL_RE=/vision\|4o\|omni\|\bvl\b\|gemini\|claude/i` **不匹配** `-flash` 名 | **错**：flash 多模态被误判 false（正是"看图"预置错项） |
| 6 | GLM 上下文 | 两模型 1M；最大输出 128K | `context_len:null` + `context_est:true`（=无预置） | **缺**：官方有确定数字 |
| 7 | DeepSeek 深度机制 | 同模型 `reasoning_effort` ∈ {none,low,high,max}，默认 high；`thinking.type` 可关 | `mode:"none"`、`levels:[]` | **缺**：官方有完整 4 档真值 |
| 8 | DeepSeek 开关 | `thinking.type: disabled` 合法（关思考） | 无任何开关表达（`mode:"none"`=不可调） | **缺** |
| 9 | DeepSeek 输入模态 | 支持图片（JPEG/PNG/GIF/WebP），**不支持 PDF** | `multimodal:false`；`MULTIMODAL_RE` 不匹配 `deepseek-v4.1-flash` | **错**：看图能力被误判 false |
| 10 | DeepSeek 上下文/输出 | 上下文 1M；最大输出 384K；thinking 默认 max_tokens 64K（effort=max 时 128K） | `context_len:null` | **缺** |
| 11 | 思考预算键 | GLM 无 budget_tokens；DeepSeek Anthropic 面 `budget_tokens` **被忽略** | 无（未使用） | 一致（都无预算旋钮，官方也不支持） |
| 12 | 用户面写通道 | 官方档位集是**模型能力**，应由配置呈现 | `validModelCapsPatch` 对任何 `thinking` patch **一律拒收**（`'variant' in t` → 家族自管；`'mode' in t` → 自管；兜底 → "快慢档位由系统自动管理"） | **过封**：官方三档是真实可配能力，全关写通道使档位集无法被纠正/维护 |
| 13 | 端点 | OpenAI 面键=`reasoning_effort`；Anthropic 面 GLM=`output_config.effort`、DeepSeek=`output_config.effort` | 桥恒用 OpenAI 兼容面（`/llmproxy/v1/chat/completions`），CEL 示例混用 Anthropic 风格 | **部分冲突**：`thinking.type:disabled` 表达式对 5.3 非法 |
| 14 | 家族别名 | 无官方别名概念 | `gpt-5-forge-<fast>` 别名骗过 goose `is_reasoning_model` 闸门 | 自造（可用但非官方；官方无 gpt-5 前身语义） |

---

## 3. 预置应有的正确值（逐模型逐字段，纯官方数据）

命名按**官方真名**；括号内为我方池中现名。

| 字段 | glm-5.3 | glm-5.3-flash | deepseek-flash（池中 `deepseek-v4.1-flash`） |
|---|---|---|---|
| `context_len` | **1000000**（1M） | **1000000**（1M） | **1000000**（1M） |
| `context_est` | false | false | false |
| `max_output`（如需） | **131072**（128K），默认 65536 | **131072**（128K），默认 65536 | **393216**（384K）；thinking 默认 65536，effort=max 时 131072 |
| `multimodal` | **false**（纯文本） | **true**（video/image/text/file，含 PDF） | **true**（image only：JPEG/PNG/GIF/WebP；**PDF false**） |
| `thinking.mode` | **native**（官方原生 effort 档） | **native** | **native** |
| `thinking.levels` | **["low","high","max"]** | **["low","high","max"]** | **["off","low","high","max"]**（off=`reasoning_effort:none`） |
| `thinking.default` | **"max"** | **"max"** | **"high"** |
| `thinking.off_supported` | **false**（传 disabled 报错） | **false** | **true**（`reasoning_effort:"none"` 或 `thinking.type:"disabled"`） |
| 思考预算键 | 无（无 `budget_tokens`） | 无 | 无（Anthropic 面 `budget_tokens` 被忽略） |
| 请求参数映射 | `{"thinking":{"type":"enabled"},"reasoning_effort":"<low\|high\|max>"}`（**永不发 disabled**） | 同左（另 `thinking.clear_thinking:false` 推荐） | `{"reasoning_effort":"<none\|low\|high\|max>"}`（或 off→`{"thinking":{"type":"disabled"}}`） |
| `thinking.variant` | **删除**（无官方依据） | **删除** | **删除** |

要点：
1. **GLM 两模型档位集完全相同**（{low,high,max}），深度差异靠 effort 而非换模型——预置不该有 `variant`。
2. **glm-5.3 必须禁掉 off 语义**；任何把 `off/disabled` 发往 5.3 的路径都会触发官方报错。
3. **glm-5.3-flash 与 deepseek-flash 的 `multimodal` 应为 true**（现预置 false 是最直接的"看图"错项）。
4. **DeepSeek 是唯一官方支持"关思考"的池内模型**（4 档：off/low/high/max）。
5. 若上游为 OpenAI 兼容端点，强度键用 `reasoning_effort`；若走 Anthropic 兼容端点，GLM/DeepSeek 均为 `output_config.effort`（键名需按端点切换）。

---

## 4. UNVERIFIED 清单

1. **`deepseek-v4.1-flash` 是否被官方端点接受**：官方在册名=`deepseek-flash`/`deepseek-v4-pro`；legacy `deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 被接受并路由到 V4.1-Flash。`deepseek-v4.1-flash` 这一具体串**未见于官方文档**（UNVERIFIED）。不引官方端点实测（无 key/不发明测请求）。
2. **第三方 OpenAPI 转售端点（我方 providers.json 的 host）的参数面**：官方文档只约束官方域名；我方 host 是否逐字实现官方参数集=UNVERIFIED（不属本次官方源范围，且中转不承载真相）。
3. **`glm-5.3` 输入模态是否严格纯文本**：官方模型概览页写 `Text`；`openapi.json` 中 glm-5.3 归入 `ChatCompletionTextRequest` 枚举（vision schema 的 model 枚举**不含** glm-5.3）——两处一致，但**未逐字见"拒绝图片"的明确表述**，按"官方列示=文本"采信（弱 UNVERIFIED）。
4. **GLM-5.3-Flash 的 PDF 支持粒度**：官方示例 `type: file` + `demo1.pdf` 证明文件块可传 PDF，但**未给 PDF 页数/大小上限**（GLM-OCR 页的 100 页/50MB 不适用本模型）=UNVERIFIED。
5. **Anthropic 端点下 GLM 是否支持 `thinking.clear_thinking`**：Anthropic 收敛表只列 `thinking.type` 与 `output_config.effort`，`clear_thinking` 未在该表出现=UNVERIFIED（OpenAI 面确认支持）。
6. **`reasoning_effort` 对 GLM 思考 token 的量化关系**：官方只给档位名（low/high/max）与"思考 token 计入输出"，**无 token 量级表**=UNVERIFIED（此项只能实测，官方文档定不了）。
7. **ZCode 推荐配置中 GLM 的默认 CEL 映射全文**：延续 `38-zcode-model-config-anatomy.md` §5 遗留，云推荐本地无缓存=UNVERIFIED。

---

## 5. 与既有研究的关系（不覆盖、只订正）

- `35-thinking-effort-factfind.md` / `37-thinking-effort-real-levers.md`：这两篇以**中转（9router）实测**为依据，其"glm 参数通道死透""唯一真杠杆=池内双条目换模型"结论是**中转面事实**；本文从官方源给出**规范面事实**——官方明确支持 `reasoning_effort` 三档并**显式否定换模型**。两篇的 L1 结论（参数在中转上无效）仍可用于解释**当前链路为何只能用换模型**，但**不能**作为"官方语义"或"预置应有值"的依据。设计面须以本文为准。
- `38-zcode-model-config-anatomy.md` §2「ZCode 无换模型形态」：与本文官方源**互证**（官方也从不配对另一模型）。
