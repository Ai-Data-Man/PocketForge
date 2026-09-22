# 42 中国主流模型官方「思考深度/能力参数」规范事实表

> 2026-09-22。**承接 `40-official-thinking-param-specs.md`（智谱 GLM-5.3/5.3-Flash、DeepSeek），不重复其结论，只引用。** 本文补齐中国市场其余主流厂商：阿里通义、月之暗面、字节豆包、腾讯混元、百度文心、MiniMax、阶跃星辰；附带讯飞/商汤边界结论。
> 唯一权威源=厂商**官方原生文档**（`help.aliyun.com/zh/model-studio`、`platform.kimi.com`、`docs.volcengine.com` / `www.volcengine.com/docs/82379`、`cloud.tencent.com/document/product/1729`、`cloud.baidu.com/doc/qianfan*`、`platform.minimaxi.com`、`platform.stepfun.com`）。**禁止**中转/聚合站为依据。**未发任何真实请求**。
> 分级：VERIFIED-DOC=官方文档原文逐字直取；UNVERIFIED=文档缺失或仅间接证据。
> 抓取件（非仓库产物，勿引用）：`tmp/cn/**`（供应商 `.md`/`llms.txt`/OpenAPI JSON/页面抽文本）。

**方法说明（供复核）**：各站优先取官方 `llms.txt` 索引指向的 `.md` 原文（阿里百炼、Kimi、MiniMax、StepFun 均提供）；火山方舟为 SPA，正文以 Quill delta 内嵌在页面 JSON 中，需抽出 `insert` 序列并按 `zoneId` 出现顺序还原表格（一次性 node 脚本，未入库）；腾讯云混元为分页静态文档，逐页 grep。**没有任何一处依赖第三方转述。**

---

## 0. 结论速览（逐厂商「官方思考参数形态」）

| 厂商 | 当前旗舰 | 官方思考键（逐字） | 可分档? | 分级 |
|---|---|---|---|---|
| **阿里通义** | qwen3.8-max / qwen3-max | `enable_thinking`(bool) + `thinking_budget`(int) + `reasoning_effort`(str, **仅部分型号**) + `preserve_thinking`(bool) | 是（3.8 系 `low/medium/xhigh`；GLM/DeepSeek 直供另有档） | VERIFIED-DOC |
| **月之暗面 Kimi** | kimi-k3 | `reasoning_effort` ∈ {`low`,`high`,`max`}，默认 `max`；**无 `thinking`** | 是（三档） | VERIFIED-DOC |
| **月之暗面 Kimi（K2 系）** | kimi-k2.7-code / kimi-k2.6 | `thinking.type` ∈ {`enabled`,`disabled`} + `thinking.keep` ∈ {`null`,`all`} | 否（K2 系**不支持** `reasoning_effort`） | VERIFIED-DOC |
| **字节豆包** | doubao-seed-2-1-pro / seed-evolving | `thinking.type` ∈ {`enabled`,`disabled`,`auto`} + `reasoning_effort`(Chat)/`reasoning.effort`(Responses) ∈ 7 档 | 是（7 档 + 逐模型映射） | VERIFIED-DOC |
| **腾讯混元** | hunyuan-turbos / hunyuan-t1 | **`EnableThinking`(bool)，仅对 `hunyuan-a13b` 生效**；其余靠换模型或 `/no_think` 指令 | 否（无 effort 键） | VERIFIED-DOC |
| **百度文心** | ernie-5.0 / ernie-5.1 | `thinking.type`、`enable_thinking`、`thinking_budget`、`thinking_strategy`、`reasoning_effort` **五键并存**，按模型分别生效 | 是（`reasoning_effort` ∈ {high,max}，仅 DeepSeek 系） | VERIFIED-DOC |
| **MiniMax** | MiniMax-M3 | `thinking.type` ∈ {`adaptive`,`disabled`} + `reasoning_split`(bool) | 否（无 effort/budget） | VERIFIED-DOC |
| **阶跃星辰 Step** | step-5-preview / step-3.7-flash | `reasoning_effort` ∈ {`low`,`medium`,`high`}（Chat）/`output_config.effort`（Messages） | 是（三档，3.5-flash-2603 两档） | VERIFIED-DOC |
| 讯飞星火 | Spark 4.0 Ultra / 深度推理 X1·X2 | 公开 HTTP 文档**未见** thinking/effort 键 | UNVERIFIED | UNVERIFIED |
| 商汤 SenseNova | — | 未找到公开参数文档页（404） | UNVERIFIED | UNVERIFIED |

**三条跨厂商判决（与 research/40 互为补充）**：

1. **「深度=换模型」在部分厂商有官方依据，但在 GLM/DeepSeek 没有。** 百度官方同时存在 `ernie-5.0` 与 `ernie-5.0-thinking-preview/-latest/-exp`（**同代、按 model 名区分思考版**，见 §5.B），腾讯官方同时存在 `hunyuan-turbos`（快思考基座）与 `hunyuan-t1`（深度推理，官方原文"首个深度推理模型"）。→ PocketForge 的 `variant{fast,deep}` 机制**不是全无依据**；但它的具体配对（`X-flash ↔ X`）在 GLM/DeepSeek 仍无官方依据（research/40 §1.D 已判决），须按厂商分别判定。
2. **主力抽象是「同模型 + 档位」**：`reasoning_effort` 已成为 7 家中的 5 家（阿里部分型号、Kimi、豆包、百度部分型号、阶跃）的官方顶层键，且**值域高度同构**（`low/high/max` 或含 `medium`）。这直接支撑统一抽象层的档位模型。
3. **布尔开关仍是最大公约数**：`enable_thinking` 布尔族覆盖阿里全系与百度 5.0-thinking，`thinking.type` 对象族覆盖豆包/MiniMax/百度/Kimi K2.x/GLM/DeepSeek。抽象层若只留一条通道，**布尔开关 + 可选档位**是覆盖最广的组合。

---

## 1. 阿里通义千问（阿里云百炼 / DashScope）

**权威页**：`https://help.aliyun.com/zh/model-studio/deep-thinking`（深度思考）/ `.../qwen-api-via-openai-chat-completions`（OpenAI 兼容参数表）/ `.../text-generation-model`（模型能力与推荐表）/ `.../model-qwen3-max`、`.../qwen3-coder-plus`、`.../qwen-plus`、`.../qwen3-vl-plus`（逐模型页）。索引：`https://help.aliyun.com/zh/model-studio/llms.txt`。

### 1.A 思考参数真实形态（原文，`deep-thinking`）

> 百炼深度思考模型分为两种模式：
> - **混合思考模式**：可按请求开启或关闭思考，控制参数因模型而异。以下示例使用 `enable_thinking`，取值如下：
>   - 设为 `true`：模型先思考再回复；
>   - 设为 `false`：模型直接回复；
> - **仅思考模式**：模型始终在回复前进行思考，无法关闭。除无需设置 `enable_thinking` 参数外，请求格式与混合思考模式一致。

**四键并存（机读参数表逐字，`openaicompat`）**：

| 键 | 类型 | 官方说明（逐字摘要） |
|---|---|---|
| `enable_thinking` | `boolean` | 使用混合思考模型时是否开启思考模式。适用于 Qwen3.7/3.6/3.5/3、Qwen3-Omni-Flash、Qwen3-VL，以及 DeepSeek-V4.x、DeepSeek-V3.x、Kimi-K2.7-code、Kimi-K2.6/K2.5、GLM 系列。**非 OpenAI 标准参数**：Python SDK 需 `extra_body={"enable_thinking": xxx}`；curl/HTTP **直接放请求体顶层**；Node.js SDK **作为顶层参数**。 |
| `thinking_budget` | `integer` | 思考过程的最大 Token 数。适用于 qwen3.8-max/-0902/-flash/-2.4t-a95b/-27b、Qwen3.7/3.6/3.5、Qwen3-VL、Qwen3、GLM（阿里云直供）、Kimi（阿里云直供），**其中 kimi-k3 不支持**。默认值=模型最大思维链长度。 |
| `preserve_thinking` | `boolean` | 是否将历史 assistant 消息的 `reasoning_content` 拼接入模型输入。**qwen3.8-max/qwen3.8-flash 默认 `true`**，其余见模型卡。 |
| `reasoning_effort` | `string` | 控制推理力度。**各模型值域与默认值不同**（见 1.B）。`reasoning_effort` 是 **OpenAI 标准参数**，Python SDK 直接传，无需 `extra_body`。 |
| `thinking` | `object` | **仅**用于稀宇科技直供 `MiniMax/MiniMax-M3`，默认 `{"type":"adaptive"}`，取值 `adaptive`(默认)/`disabled`。百炼**不用** `enable_thinking` 调 M3。 |

### 1.B `reasoning_effort` 逐模型值域（原文，`openaicompat`；这是全表最关键的机读事实）

| 模型组 | 默认 | 可选值（逐字） | 兼容映射（逐字） |
|---|---|---|---|
| `qwen3.8-max`/`-0902`/`qwen3.8-flash`/`-2.4t-a95b`/`-27b` | **`xhigh`** | `xhigh` / `medium` / `low` | `max`→xhigh，`high`→xhigh，`minimal`→low，**`none`→`enable_thinking=False`** |
| `qwen3.8-omni-flash` | **`xhigh`** | `low` / `medium` / `xhigh`（可直接选） | 接受 `none,minimal,low,medium,high,xhigh,max`；`minimal`→low，`high`/`max`→xhigh，`none`=关闭思考 |
| `glm-5.3`/`ZHIPU/GLM-5.3`/`-Flash`/`-FlashX`、`kimi-k3`(阿里云直供) | **`max`** | `max` / `high` / `low` | （无映射）**glm-5.3 系列始终开启思考，`enable_thinking` 仅支持 `true`，传 `false` 会导致 API 请求失败**；`kimi-k3` 支持传 `false` 关闭思考 |
| `glm-5.2/5.1/5`、`deepseek-v4-pro`、`deepseek-v4-flash`(阿里云直供) | `high` | `high` / `max` | `low`/`medium`→high，`xhigh`→max |
| `kimi/kimi-k3`（月之暗面直供） | `high` | **仅 `max`** | — |
| `deepseek-v4-flash-0731`、`deepseek-v4-pro-0813` | `high` | `max` / `high` / `low` | `medium`/`xhigh`→high |
| `deepseek-v4.1-flash` | `high` | `max` / `high` / `low` | `minimal`→low，`medium`/`xhigh`→high，`ultra`→max |

**关键机制（原文，`openaicompat`）——effort 与 budget 的互转与互斥**：

> **重要**：`qwen3.8-max`、`qwen3.8-max-0902`、`qwen3.8-flash`、`qwen3.8-2.4t-a95b`、`qwen3.8-27b` 不支持 `reasoning_effort` 与 `thinking_budget` 同时设置，**同时设置会报错**。但两者支持互转：
> - 未设置 `thinking_budget` 时，`reasoning_effort` 档位自动映射 `thinking_budget`：`low` 对应 4096，`medium` 对应 16384，`xhigh` 对应 262144。
> - 未设置 `reasoning_effort` 时，`thinking_budget` 自动映射回 `reasoning_effort`：0~4096 对应 `low`，4097~16384 对应 `medium`，16385~262144 对应 `xhigh`。
> - 两者均未设置时，使用默认 `thinking_budget`（131072），默认 `reasoning_effort`（`xhigh`）。

→ **这是全中国阵营里唯一给出「档位 ↔ token 预算」官方换算表的厂商**，价值极高：抽象层可用它把 `thinking_budget` 与 `reasoning_effort` 归一。

### 1.C 思考预算与 `max_tokens` 的关系（原文，`deep-thinking`）

> 在思考模式（`enable_thinking` 设置为 `true`）下，`max_tokens` 参数的有效取值范围为 **[1, 32768]**，超出该范围时接口返回 400 错误，错误信息为 `InvalidParameter: Range of max_tokens should be [1, 32768]`。非思考模式下无此限制。
>
> 建议使用 `max_completion_tokens` 参数替代 `max_tokens`。`max_completion_tokens` 限制模型的完整输出长度（包含思维链和最终回复），`max_tokens` 仅限制最终回复部分的长度。`max_tokens` 参数即将废弃。

`thinking_budget` 控制台侧取值范围 **1～32768，默认值 4000**（体验中心模型调试面板原文；与"默认值=最大思维链长度"的 API 表述口径不同，见 §9 UNVERIFIED-1）。

**提示词动态控制（原文）**：

> Qwen3 开源版混合思考模型以及 `qwen-plus-2025-04-28` 模型支持通过提示词动态控制思考模式。`enable_thinking` 为 `true` 时，在提示词中加入 **`/no_think`** 可关闭思考；多轮对话中如需重新开启，在最新提示词中加入 **`/think`** 即可。模型始终遵循最新的 `/think` 或 `/no_think` 指令。

### 1.D 输入模态 / 上下文 / 最大输出（逐模型页原文）

| 模型 | 输入模态 | 上下文 | 最大输入 | 最大输出 | 思考模式最大输出 | 最大思维链 |
|---|---|---|---|---|---|---|
| `qwen3-max` / `qwen3.8-max` | **Text** | 262144 | 258048 | 65536 | 32768 | 81920 |
| `qwen3-plus`(`qwen-plus`) | **Text** | **1000000** | 997952 | 32768 | 32768 | 81920 |
| `qwen3-coder-plus` | **Text** | **1000000** | 997952 | 65536 | 32768（思考模式最大输入 997952） | 81920 |
| `qwen3-vl-plus` | **Text / Image / Video** | 262144 | 260096 | 32768 | 32768 | 81920 |

（原文表格逐字："最大输入长度 / 最大输出长度 / 上下文长度 / 最大输入长度（思考模式下）/ 最大输出长度（思考模式下）/ 最大思维链长度"。）

`qwen3-coder-plus` 官方能力卡：Function Calling 支持、结构化输出**不支持**、前缀续写**不支持**。`qwen3-vl-plus`：Function Calling 支持、批量推理支持。

### 1.E 快/慢与「换模型」官方语义

- **`qwen3.8-max` 与 `qwen3.8-flash` 是不同规模模型，官方从不称为同一模型的快/深档。** `text-generation-model` 推荐表按"模型ID / 上下文 / 思考模式 / Function Calling / 内置工具 / 结构化输出"并列，旗舰定位逐字为：`qwen3.8-max` / `qwen3.8-flash` / `qwen3.7-plus` / `qwen3.7-flash`（100万上下文）。
- **官方确用「模型名后缀」表达仅思考版本**：`qwen3-next-80b-a3b-thinking`、`qwen3-235b-a22b-thinking-2507`、`qwen3-30b-a3b-thinking-2507` 被官方归类为"**仅思考模式**"（开源版）；对应非思考版同族名不带 `-thinking`。→ **开源版有官方 `-thinking` 后缀语义；商业版旗舰（qwen3-max/plus/flash）没有。**
- `qwen3-vl-plus` 官方描述逐字："实现思考模式和非思考模式的有效融合" —— 即**同一模型双模式**，不是换模型。

### 1.F 端点差异（OpenAI 兼容 vs DashScope 原生）

| 面 | OpenAI 兼容 | DashScope 原生 |
|---|---|---|
| base_url | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`（旧 `https://dashscope.aliyuncs.com` 已迁移） | `MultiModalConversation.call(...)` |
| 思考开关 | `enable_thinking` 非标准 → Python SDK 须 `extra_body`；HTTP 顶层；Node SDK 顶层 | `enable_thinking=True` **直接作为顶层调用参数** |
| **陷阱** | — | **Qwen3.5 系列的 DashScope API 采用多模态接口，用普通 `Generation` 调用会报 `url error`**（原文："以下示例会报错 `url error`，调用方式请参见 开启/关闭思考模式"） |
| 思考强度 | `reasoning_effort`（OpenAI 标准参数，直接传） | 同键 |
| Responses API | `reasoning.effort` 控制思考模式开关与深度（`text-generation-model` 逐字） | — |

→ **同一语义（开关/档位）在三个协议面键位不同**：OpenAI Chat=`enable_thinking`+`reasoning_effort`；Responses=`reasoning.effort`；DashScope=`enable_thinking` 顶层。抽象层需按协议翻译。

---

## 2. 月之暗面 Kimi / Moonshot

**权威页**：`https://platform.kimi.com/docs/guide/use-thinking-models`（思考模型）/ `.../use-reasoning-effort`（推理强度）/ `.../models`（模型列表）/ `.../api/models-overview`（参数差异）/ `.../pricing/chat`。原 `platform.moonshot.cn` **301 → `platform.kimi.com`**。

### 2.A 逐模型思考参数（原文，`models-overview` 参数差异表逐字）

| 参数 | `kimi-k3` | `kimi-k2.7-code` | `kimi-k2.6` |
|---|---|---|---|
| 上下文窗口 | **1M tokens** | 256K tokens | 256K tokens |
| `thinking` | **—（不支持）** | 可省略；显式设置时**仅接受** `{"type":"enabled","keep":"all"}` | `{"type":"enabled"}`（默认）、`{"type":"disabled"}`、`{"type":"enabled","keep":"all"}` |
| `reasoning_effort` | **`low`/`high`/`max`（默认 `max`）** | **不支持** | **不支持** |
| `temperature` | 固定 1.0 | 固定 1.0 | 思考 1.0 / 非思考 0.6 |
| `top_p` | 固定 0.95 | 固定 0.95 | 固定 0.95 |
| `n` | 固定 1 | 固定 1 | 固定 1 |
| `presence_penalty`/`frequency_penalty` | 固定 0 | 固定 0 | 固定 0 |

> 表中"固定"表示该参数不可修改：传入其他值会报错，建议不要显式传入。

**推理强度（原文，`use-reasoning-effort`）**：

> Kimi K3 始终进行推理，并通过请求顶层 `reasoning_effort` 配置 **推理强度**。该字段支持 `"low"` / `"high"` / `"max"` 三档，默认 `"max"`。
> 从 K2.x 迁移到 K3 时，**移除 K2.x 的 `thinking` 配置**，并按需使用顶层 `reasoning_effort`。

请求示例（逐字）：

```json
{
  "model": "kimi-k3",
  "messages": [{"role": "user", "content": "请推导一下这个数列的通项公式：1, 4, 9, 25, 64, ..."}],
  "reasoning_effort": "high"
}
```

**`thinking` 逐字定义（`use-thinking-models`）**：

> - `kimi-k2.6`：通过 `thinking` 参数控制思考行为，包含两个子字段：`thinking.type`：`"enabled"`（默认）| `"disabled"`；`thinking.keep`：`null`（默认，忽略历史轮次的思考）| `"all"`（保留历史轮次的 `reasoning_content`）。
> - `kimi-k2.7-code`：**始终开启思考**，仅支持 `{"type":"enabled","keep":"all"}`，传入其他配置会报错。
> - `kimi-k3`：**始终进行推理**，不支持 `thinking` 参数。

K2.7-code 与 K2.6 逐字关系：`kimi-k2.7-code` 是面向代码场景的思考模型，与 `kimi-k2.6` **共享同一套思考机制**（`reasoning_content`、多步工具调用、流式输出等），差异仅在 `thinking` 参数。其高速版 `kimi-k2.7-code-highspeed` **与之为同一模型、思考行为完全一致**。

### 2.B 思考预算与 `max_tokens`（原文）

> `reasoning_content` 中包含的 Tokens 也受 `max_tokens` 参数控制，`reasoning_content` 的 Tokens 数加上 `content` 的 Tokens 数应**小于等于 `max_tokens`**。
> 设置 `max_tokens>=16000` 以避免无法输出完整的 `reasoning_content` 和 `content`。

→ **Kimi 无独立思考预算键**；`thinking_budget` 在**阿里云百炼部署的 Kimi** 上可用（§1.A），在**月之暗面官方端点**不存在。

### 2.C 输入模态（原文，`models`）

| 模型 | 官方描述（逐字） |
|---|---|
| `kimi-k3` | 2.8 万亿参数，**原生支持视觉理解**，100 万 token 上下文窗口 |
| `kimi-k2.7-code` | Coding 模型，上下文 256k（快速开始页：支持 256K 上下文窗口、**文本/图片/视频输入**和思考模式） |
| `kimi-k2.6` | 支持**视觉与文本输入**、思考与非思考模式、对话与 Agent 任务，上下文 256k |

### 2.D 官方「用不同模型表达深浅」的历史证据（重要）

`models` 页"已下线模型"逐字列出：`kimi-k2-thinking`、`kimi-k2-thinking-turbo`（下线）、`kimi-thinking-preview`（2025-11-11 下线）、`kimi-k2-0905-preview`/`kimi-k2-0711-preview`/`kimi-k2-turbo-preview`（下线）、`kimi-k2.5`（2026-08-31 下线）。

→ **官方曾用 `-thinking` 独立模型名表达思考能力**，但**已全部下线**，现役体系改用"同模型 + `reasoning_effort`"（K3）或"同模型 + `thinking.type`"（K2.6）。**这是"换模型表达深浅"正在被官方淘汰的直接证据**——收敛方向与 research/40 §1.D 的 GLM 判决一致。

### 2.E 端点

OpenAI 兼容 `https://api.moonshot.cn/v1`（亦见 `$MOONSHOT_BASE_URL`）；另提供 Anthropic 兼容 Messages（`kimi-api` 文档声明"兼容 OpenAI 与 Anthropic API 格式"）。**思考参数在两端点为同键**（`reasoning_effort` / `thinking`），无 §1.F 那类键位分裂。**注意**：K3 切档会破坏前缀缓存命中（原文 Warning："切换档位会破坏前缀缓存命中，建议在会话开始前确定 `effort` 档位"）——这是抽象层默认档位必须固定的运营理由。

---

## 3. 字节豆包（火山方舟 Ark）

**权威页**：`https://www.volcengine.com/docs/82379/1449737`（深度思考）/ `.../82379/1330310`（模型列表）。URL 由 `docs.volcengine.com` 301 到 `www.volcengine.com`。

### 3.A 思考开关（原文，深度思考页逐字）

> 提供 **`thinking`** 字段控制是否关闭深度思考能力，实现"复杂任务深度推理，简单任务高效响应"的精细控制。取值说明：
> - `enabled`：强制开启，强制开启深度思考能力。
> - `disabled`：强制关闭深度思考能力。
> - `auto`：模型自行判断是否进行深度思考。

请求示例（逐字，两协议同键）：

```bash
# Chat API
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{"model":"doubao-seed-2-1-pro-260628",
       "messages":[{"role":"user","content":[{"type":"text","text":"..."}]}],
       "thinking":{"type":"disabled"}}'
```
```json
// Responses API
{ "model": "doubao-seed-2-0-lite-260215", "input": [...],
  "previous_response_id": "resp_...", "thinking": {"type": "enabled"} }
```

**支持 `thinking` 的模型（原文逐字清单）**：`doubao-seed-evolving`、`doubao-seed-2-1-pro-260915`、`doubao-seed-2-1-lite-260915`、`doubao-seed-2-1-pro-260628`、`doubao-seed-2-1-turbo-260628`、`doubao-seed-2-0-lite-260428`、`doubao-seed-2-0-mini-260428`、`doubao-seed-2-0-pro-260215`、`doubao-seed-2-0-lite-260215`、`doubao-seed-2-0-mini-260215`、`doubao-seed-2-0-code-preview-260215`（以上"支持 `enabled`（默认）、`disabled`"）；`glm-5-3-flash-260828`（仅 `enabled` 默认，原文括号："始终启用思考，不再支持禁用思考"）；`glm-5-2-260617`、`doubao-seed-character-260628`、`deepseek-v4-1-flash-260910`、`deepseek-v4-pro-ga-260813`、`deepseek-v4-flash-ga-260731`、`deepseek-v4-pro-260425`。

### 3.B 思考长度分档（原文，7 档 + 逐模型映射表逐字）

> 提供字段 **`reasoning_effort`（Chat API）、`reasoning.effort`（Responses API）** 调节思维链长度。取值如下：
> `none`：关闭思考。`minimal`：关闭思考，直接回答。`low`：轻量思考，侧重快速响应。`medium`：均衡模式，兼顾速度与深度。`high`：深度分析，处理复杂问题。`xhigh`：更高强度思考。`max`：最高强度思考，适配高难度推理任务。
>
> 下表展示支持调节思考长度的模型，以及各模型对 `reasoning_effort`（Chat API）、`reasoning.effort`（Responses API）的默认取值与兼容映射规则。**所有支持该字段的模型均接受全部 7 档取值**，部分取值将按表中规则自动映射至等效档位。

| 支持模型 | 默认取值 | 兼容映射（逐字） |
|---|---|---|
| `doubao-seed-evolving`、`doubao-seed-2-1-pro-260915`、`doubao-seed-2-1-lite-260915`、`doubao-seed-2-1-pro-260628`、`doubao-seed-2-1-turbo-260628` | **`high`** | 传入 `minimal`：将关闭思考；传入 `none`：将映射为 `minimal`；传入 `xhigh`/`max`：将映射为 `high` |
| `doubao-seed-2-0-lite-260428`、`-mini-260428`、`-pro-260215`、`-lite-260215`、`-mini-260215`、`-code-preview-260215`、`doubao-seed-character-260628` | **`medium`** | 传入 `minimal`：将关闭思考；传入 `none`：将映射为 `minimal`；传入 `xhigh`/`max`：将映射为 `high` |
| `glm-5-3-flash-260828` | **`max`** | `none`/`minimal`/`low` → `low`；`medium`/`high` → `high`；`xhigh`/`max` → `max` |
| `glm-5-2-260617` | `high` | `none`/`minimal` → 关闭思考；`low`/`medium` → `high`；`xhigh` → `max` |
| `deepseek-v4-1-flash-260910` | `high` | `none` → 关闭思考；`minimal` → `low`；`medium`/`xhigh` → `high`；`ultra` → `max` |
| `deepseek-v4-pro-ga-260813`、`deepseek-v4-flash-ga-260731` | `high` | `none`/`minimal` → 关闭思考；`medium` → `low`；`xhigh` → `high` |
| `deepseek-v4-pro-260425` | `high` | `minimal` → 关闭思考 |

请求示例（逐字）：

```json
// Chat API
{ "model": "doubao-seed-2-1-pro-260628",
  "messages": [{"role":"user","content":"What are some common cruciferous plants?"}],
  "reasoning_effort": "low" }
// Responses API
{ "model": "doubao-seed-2-1-pro-260628",
  "input": [{"role":"user","content":"What are some common cruciferous plants?"}],
  "reasoning": {"effort": "low"} }
```

→ **豆包是全阵营档位最细的厂商（7 档），且官方声明"所有支持模型均接受全部 7 档"**——即客户端可无条件发 7 档中的任意值，由服务端映射。这对抽象层极友好：**同一 `reasoning_effort` 键可跨豆包内全部模型使用**。

### 3.C 思考预算与输出长度（原文）

- **无独立思考预算键**。原文（深度思考页）："设置最大输出长度：模型输出内容由**思维链（Chain of Thought, COT）和最终回答（Answer）两部分组成**。合理控制模型输出长度…完整示例请参见 控制输出（回答＋思维链）长度。"
- 输出长度键：Chat API `max_completion_tokens`；Responses API `max_output_tokens`（响应示例逐字含 `"max_output_tokens": 32768`）。
- 思考摘要与计费（原文逐字）：
  > 默认会开启 **thinking summary** 能力，不会输出模型原始的思考内容，会返回模型思考内容摘要（`choices.message.reasoning_content`）、思考内容加密原文（`choices.message.encrypted_content`）。
  > `reasoning_effort`：仅作用于模型的原始思考内容，不适用于思考摘要。
  > `usage.completion_tokens_details.reasoning_tokens`：为原始思考内容的 tokens，计费仍然按原始思考内容 token 计算。

### 3.D 输入模态 / 上下文 / 最大输出（模型列表页逐模型格）

| 模型 | 上下文窗口 | 最大输入 | 最大回答（默认 4k） | 最大思维链 |
|---|---|---|---|---|
| `doubao-seed-2-1-pro-260915`（推荐） | 1024k | 1024k | **256k** | 256k |
| `doubao-seed-2-1-pro-260628` | 1024k | 1024k | 256k | 256k |
| `doubao-seed-2-1-lite-260915` | 256k | 256k | 256k | 256k |
| `doubao-seed-2-0-pro/mini/lite/code-preview-260x` | 256k | 224k | 128k | 128k |
| `glm-5-3-flash-260828`（方舟托管） | 256k | 256k | 256k | 256k |
| `doubao-seed-evolving` | 1024k | 1024k | 384k | 128k |
| `deepseek-v4-pro-ga-260813` / `-flash-ga-260731` | 1024k | 1024k | 384k | 128k |

模态（能力标签逐字）：`doubao-seed-2-1-pro-*` 带 **深度思考 / 文本生成 / 多模态理解 / GUI 任务处理 / 工具调用 / 结构化输出**；`doubao-seed-2-0-*` 带 **深度思考 / 文本生成 / 多模态理解 / 工具调用 / 结构化输出**（无 GUI）；`doubao-seed-evolving` 带 **深度思考 / 文本生成 / 工具调用 / 结构化输出**（无多模态理解标签）。

**模型列表页总纲（原文，极重要）**：

> 其中带"**深度思考**"能力标签的模型，**默认调用即启用深度思考**；如需仅执行文本生成任务，可通过调用参数关闭深度思考（Chat API 传入 `thinking.type=disabled`，Responses API 传入 `reasoning.effort=minimal`）后使用。未带"深度思考"能力标签的模型（如 `doubao-seed-character-251128`）本身不支持深度思考。

→ **官方给出"默认开思考 + 显式关"的语义，并明确两条关闭通道**。抽象层默认档应取官方默认（`high`/`medium`/`max` 按模型，见 §3.B 表）。

### 3.E 端点

`https://ark.cn-beijing.volces.com/api/v3`（Chat）/ `.../api/v3/responses`（Responses）。**思考键名按协议分叉**：Chat=`reasoning_effort`，Responses=`reasoning.effort`；`thinking` 对象两协议同名。另官方提示：深度思考耗时更长，**流式输出是推荐做法，非流式场景建议 timeout ≥ 30 分钟**（Go SDK 亦然）。

---

## 4. 腾讯混元

**权威页**：`https://cloud.tencent.com/document/product/1729/105701`（对话 API 参考）/ `.../1729/111007`（OpenAI 兼容调用示例）/ `.../1729/104753`（产品概述·模型列表）/ `.../1729/97765`（产品动态）。

### 4.A 思考参数真实形态（原文，`105701` 输入参数表逐字）

> **EnableThinking** `Boolean`（否）
> 模型思维链开关 说明：
> 1. 未传值时默认开启，打开模型思维链推理能力。
> 2. 关闭后，关闭模型思维链推理能力。
> **开关当前仅对 `hunyuan-a13b` 模型生效**
> 示例值：true

**混元自定义参数全表（`111007` 逐字）**：`citation`、`enable_enhancement`、`enable_multimedia`、`enable_recommended_questions`、`force_search_enhancement`、`search_info` —— **全部为搜索/功能增强类，无 `reasoning_effort`、无 `thinking_budget`、无 `enable_thinking`**。

`tools` 字段原文：`可调用的工具列表，仅对 hunyuan-turbos、hunyuan-t1、hunyuan-functioncall 模型生效。`

→ **腾讯没有 effort 分档键，也没有通用思考开关**。唯一开关 `EnableThinking` 只对 `hunyuan-a13b` 生效。

### 4.B 「深浅」如何表达（原文，`104753` 逐字）

> **hunyuan-a13b**（2025-06-25）
> 2. 模型能力和特征：混元**第一个混合推理模型**，hunyuan-standard-256K 的升级版本，总参数80B，激活13B，**默认是慢思考模式**，支持**通过参数或者指令进行快慢思考模式切换**，快慢思考切换方式为 **query 前加 `/no_think`**；整体能力相对上一代全面提升，特别是数学、科学、长文理解和 Agent 能力提升显著。
> 最大输入 224k / 最大输出 32k

> **hunyuan-t1-vision-20250916**（2025-09-16）：混元最新版 t1-vision **视觉深度思考模型**…最大输入 28k / 最大输出 20k

> **Tencent HY Vision 1.5 Instruct**（`hunyuan-vision-1.5-instruct`）：基于文本 TurboS 基座生成的**图生文快思考模型**…最大输入 24k / 最大输出 16k

> **hunyuan-turbos-vision-video**：基于混元 turbos-vision 的**视频理解模型**…最大输入 24k / 最大输出 8k

产品动态原文（`97765`）：

> `hunyuan-t1-latest`：腾讯正式发布**首个深度推理模型 Hunyuan-T1**，该模型基于3月初发布的业界首个超大规模 Hybrid-Transformer-Mamba MoE 大模型 **TurboS 快思考基座**，扩展了推理能力。

→ **官方用「TurboS=快思考基座」与「T1=深度推理模型」两个模型族表达快/慢**，并用 `hunyuan-a13b` 的 `/no_think` 指令 + `EnableThinking` 表达同模型切换。**这就是"换模型有官方依据"的最强证据之一**（判别式：官方文案里明确出现"快思考基座"与"深度推理模型"的对举）。

### 4.C 官方平台迁移提示（对抽象层有直接影响）

> 为进一步提升大模型服务体验，腾讯混元大模型相关功能将**逐步迁移至 TokenHub**。迁移后，原平台将不再新增模型能力，并停止支持新购模型服务。

`97765`/`131925`（旧版模型下线迁移公告，2026-05-20）逐字：旧版模型（含 `hunyuan-2.0-instruct-20251111`、`hunyuan-2.0-thinking-20251109`、`hunyuan-2.0-thinking-dev-20251012`、`hunyuan-t1-latest`、`hunyuan-t1-2025xxxx`、`hunyuan-turbos-latest`、`hunyuan-turbos-20250226` 等）于 **2026-06-22 00:00** 起下线，建议迁移至 **`hy3-preview`**；原平台 **9 月 30 日全面停服**。

→ **`hunyuan-2.0-thinking-*` 也是官方"用模型名表达思考版"的实例**（同上判别式）。

---

## 5. 百度文心（千帆）

**权威页**：`https://cloud.baidu.com/doc/qianfan-docs/s/Wm95lyynv`（深度思考）/ `https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb`（文本生成 API 参数）/ `https://cloud.baidu.com/doc/qianfan/s/rmh4stp0j`（模型列表）。

### 5.A 五键并存（API 参数表逐字）

| 键 | 类型 | 默认 | 官方说明（逐字摘要） |
|---|---|---|---|
| `thinking` | `object {1}` | — | 是否开启思考模式。子属性 `type`：`string`，**默认值为 `disabled`**，可选 `enabled`（开启）/`disabled`（关闭） |
| `enable_thinking` | `boolean` | **`false`** | `true`：开启；`false`：未开启，默认值为 `false` |
| `thinking_budget` | `integer` | **`16384`** | 思维链的最大长度，当模型思考过程生成的 Token 数超过 `thinking_budget` 时，推理内容会进行截断并立刻开始生成最终回复。**（1）默认为 16384，最小值为 100，最大值为各模型支持的思维链长度** |
| `thinking_strategy` | `string` | — | 思考策略，主要用于减少思维链输出。可选 `short_think`（简短思考）、`chain_of_draft`（Chain-of-Draft（草稿链）式思考） |
| `reasoning_effort` | `string` | **`high`** | 控制模型的推理深度与计算强度。可选 `high`（默认值，标准推理强度…）、`max`（最大推理强度，适用于复杂 Agent 类请求）。**为保持向下兼容，传入 `low` 或 `medium` 将映射为 `high`；传入 `xhigh` 将映射为 `max`** |

输出字段：`reasoning_content`（思维链内容，与 `content` 同级）。

### 5.B 逐键生效模型清单（原文，`deep-thinking` 逐字）

| 键 | 支持清单（逐字） | 默认/备注 |
|---|---|---|
| `thinking` | `deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-v3.2`、`kimi-k2.5`、`glm-5.1`、`glm-5` | 请求体示例 `"thinking": {"type": "enabled"}` |
| `enable_thinking` | `qwen3-32b`、`qwen3-14b`、`qwen3-8b`、`ernie-4.5-turbo-vl-preview`、`ernie-4.5-turbo-vl-32k-preview`、`ernie-4.5-vl-28b-a3b`、**`ernie-5.0-thinking-preview`** | 默认为 `false`…**特别说明：`ernie-5.0-thinking-preview` 模型的 `enable_thinking` 默认为 `true`**，要关闭可设为 `false` |
| `thinking_budget` | **`ernie-5.1`**、**`ernie-5.0-thinking-preview`**（仅思考模式生效）、`deepseek-v3.2-think` | 最小值 100，默认值为各模型支持的思维链长度 |
| `thinking_strategy` | `deepseek-v3.2-think` | 注意：`Deepseek-R1` 系列模型**只支持** `chain_of_draft` 思考策略 |
| `reasoning_effort` | `deepseek-v4-pro`、`deepseek-v4-flash` | 对普通请求默认 `high`；对复杂 Agent 类请求（如 Claude Code）**自动设置为 `max`** |

原文（`enable_thinking` 使用说明）：

> `ernie-5.0-thinking-preview` 模型的 `enable_thinking` 默认为 `true`，表示开启深度思考，如果要关闭深度思考，可设置为 `false`。

→ **`ernie-5.0-thinking-preview` 是"同模型可关思考"的官方实例**（默认真，可设假），与 §1 阿里混合思考模式同构。

### 5.C 输入模态 / 上下文 / 最大输出（模型列表逐字）

**旗舰（`文本生成`·推荐模型）**：

| 模型 | 上下文 | 最大输出 |
|---|---|---|
| `ernie-5.1` | 128k | 64k |
| `ernie-5.0` | 128k | 64k |
| `ERNIE-4.5-Turbo-128K` | 128k | 16k |
| `DeepSeek-V4-Pro` | 1M | 384k |

原文（`ernie-5.0` 定位）："文心新一代模型**文心5.0是原生全模态大模型**，采用原生的全模态统一建模技术，将**文本、图像、音频、视频联合建模**，具备综合的全模态能力。"

**深度思考表**：

| 模型 | model 参数 | 上下文 | 最大输入 | 最大输出 | 思维链长度 |
|---|---|---|---|---|---|
| ERNIE 5.0 | `ernie-5.0` | 128k | 119k | [1，65536] | **60k** |
| ERNIE 5.0 | `ernie-5.0-thinking-preview` | 128k | 119k | [1，65536] | 60k |
| ERNIE 5.0 | `ernie-5.0-thinking-latest` | 128k | 119k | [1，65536] | 60k |
| ERNIE 5.0 | `ernie-5.0-thinking-exp` | 128k | 119k | [1，65536] | 60k |
| ERNIE X1.1（**即将下线**） | `ernie-x1.1-preview` / `ernie-x1.1` | 64k | 55k | [1，65536] | **64k** |

原文（同表脚注逐字）：`ernie系列思考模型，不支持thinking_budget。同时，max_tokens限制reasoning_content+content总长度。`
原文（DeepSeek 段）：`DeepSeek系列思考模型支持设置thinking_budget，输出长度控制请参考上下文管理。`

**视觉理解表**：`ernie-5.0` / `ernie-5.0-thinking-preview` / `ernie-5.0-thinking-latest` 均 128k/119k/[1，65536]；`ernie-4.5-turbo-vl` 128k/123k/[2，16384]。

**其他**：`deepseek-flash` 1M/1M/[1,393216]；`deepseek-v4-pro`/`-0813` 1M/1M/[1,393216]（思维链 32k）；`deepseek-v3.2` 128k/96k/32k；`deepseek-v3.2-think` 144k/96k/[1,65536]（思维链 32k）。

### 5.D 端点

`https://qianfan.baidubce.com/v2/chat/completions`（亦见 `https://qianfan.bj.baidubce.com/v2/chat/completions`）。

### 5.E 「换模型表达深浅」的现行证据

**`ernie-5.0` 与 `ernie-5.0-thinking-preview`/`-latest`/`-exp` 在官方模型列表中作为四个独立 model 参数并列**，上下文/输入/输出/思维链数字完全相同，差异只在"是否思考版"。X1.1 亦为独立"深度思考"模型线（即将下线）。→ **百度是现行体系中"用不同模型名表达思考版"的最清晰实例。**

---

## 6. MiniMax

**权威页**：`https://platform.minimaxi.com/docs/api-reference/text-chat-openai`（OpenAI 兼容）/ `.../text-chat-anthropic`（Anthropic Messages）/ `.../text-openai-api`（API 概览与模型表）/ `.../models/openai/list-models`。机读：`.../api/openapi-chat-openai.json`、`.../api/openapi-chat-anthropic.json`。

### 6.A 思考参数（两协议机读 schema 逐字——**默认值不同，这是关键发现**）

**OpenAI 兼容**（`components.schemas.ChatCompletionReq.properties.thinking` 逐字）：

```
thinking: { type: object,
  description: "控制 MiniMax-M3 thinking。省略时默认开启 adaptive thinking，响应会包含 thinking
    内容。对于 M2.x 模型，thinking 无法关闭。",
  properties: { type: { type: string, enum: ["disabled","adaptive"], default: "adaptive",
    description: "- `disabled`：让 MiniMax-M3 跳过 thinking 并直接回答。对于 M2.x 模型，thinking 仍会保持开启。\n- `adaptive`：为 MiniMax-M3 开启 adaptive thinking。省略 `thinking` 时默认使用该值。" } } }
```

**Anthropic Messages**（`components.schemas.CreateMessageReq.properties.thinking` 逐字）：

```
thinking: { type: object,
  description: "控制 MiniMax-M3 thinking。省略时默认关闭 thinking，响应不会包含 thinking 块。
    对于 M2.x 模型，thinking 无法关闭。",
  properties: { type: { type: string, enum: ["disabled","adaptive"], default: "disabled",
    description: "- `disabled`：关闭 MiniMax-M3 的 thinking 输出。省略 `thinking` 时默认使用该值。…\n- `adaptive`：开启 MiniMax-M3 的 thinking 输出，并返回 thinking 块。" } } }
```

→ **同一模型、同一键名、同一值域，但 OpenAI 端点默认 `adaptive`（开），Anthropic 端点默认 `disabled`（关）。** 抽象层若跨协议复用，必须显式发 `thinking`，不能依赖默认。

### 6.B 输出格式开关（不控制开关，逐字）

> `reasoning_split`（`boolean`）：输出格式开关。启用后将 thinking 内容拆分到 `reasoning_content` 和 `reasoning_details` 字段。**这不会开启或关闭 thinking。**
> 为 `false` 时，原生 Chat Completions 响应会将 thinking 保留在 `content` 字段中的 `<think>...</think>` 标签内。

原文（`text-openai-api`）："原生的 OpenAI API 的 `MiniMax-M3` `MiniMax-M2.7` … 模型 `content` 字段会包含 `<think>` 标签内容，**需要完整保留**"。

**无 `reasoning_effort`、无 `thinking_budget`。** `service_tier` ∈ {`standard`,`priority`}（priority 价 1.5×）——这是**速度/成本**档位，**不是思考深度档位**，勿混淆。

### 6.C 上下文 / 最大输出 / 模态（逐字）

| 模型 | 上下文窗口 | 模型介绍（逐字） |
|---|---|---|
| `MiniMax-M3` | **1,000,000** | 最新 M 系列语言模型，适用于 Agent 推理、工具调用、代码和长上下文任务 |
| `MiniMax-M2.7` / `-highspeed` | 204,800 | 开启模型的自我迭代（输出速度约 60 / 100 TPS） |
| `MiniMax-M2.5` / `-highspeed` | 204,800 | 顶尖性能与极致性价比 |
| `MiniMax-M2.1` / `-highspeed` | 204,800 | 强大多语言编程能力 |
| `MiniMax-M2` | 204,800 | 专为高效编码与 Agent 工作流而生 |

输出上限（机读 `max_completion_tokens` 逐字）：**`MiniMax-M3` 推荐值 131072（128K），上限 524288（512K）；其他模型推荐 65536（64K），上限 204800（200K）。**

多模态（原文）："OpenAI API 兼容的 Chat Completions 支持在 **`MiniMax-M3`** 中输入**文本、图片和视频**。"

**M2.x 思考不可关（两协议逐字一致）**："对于 M2.x 模型，thinking 无法关闭；即使传入 `thinking: {"type":"disabled"}`，thinking 仍会保持开启。"

### 6.D 快/慢表达

官方用 `-highspeed` 后缀表达**同模型加速版**（原文："M2.5 极速版：**效果不变**，更快，更敏捷"；"`kimi-k2.7-code-highspeed` 与之为同一模型、思考行为完全一致"为 Kimi 侧同款语义）。→ **`-highspeed`/`-flash` 类是"速度版"而非"浅思考版"**：官方明示"效果不变"，深度不变。这与 PocketForge 把 `-flash` 当"快档"的用法**方向一致但语义不同**（是速度档，不是浅思考档）。

---

## 7. 阶跃星辰 Step

**权威页**：`https://platform.stepfun.com/docs/zh/guides/models/step-3.7-flash` / `.../step-5-preview` / `.../guides/developer/reasoning`（推理模型最佳实践）/ `.../api-reference/chat/chat-completion-create` / `.../api-reference/chat/messages-create`。

### 7.A 思考参数（原文逐字）

Chat Completions（`chat-completion-create` 参数表）：

> `reasoning_effort` `string` ***optional***：控制模型的推理深度。**支持三档推理强度的模型可选值为 `low`、`medium`、`high`；`step-3.5-flash-2603` 兼容 `low`、`high` 两档。** 值越高，模型会进行更深入的思考，但响应时间可能更长。

Messages（Anthropic 兼容）：

> `output_config.effort` —— Chat Completions API 使用 `reasoning_effort`；Messages API 使用 `output_config.effort`。
> （参数表另有注：`output_config.effort` 字段会被忽略 —— 该注记出现在"与 Anthropic 字段差异"表中，指不被识别的 Anthropic 原生字段；Step 侧以 `output_config.effort` 为有效键，见示例 Tab「使用 output_config.effort」。）

档位语义（`reasoning` 指南原文表）：

| 推理强度 | 适用场景（逐字） |
|---|---|
| `low` | 简单问答、摘要、改写、信息抽取 |
| `medium` | **默认推荐**，适合一般推理和多步骤任务 |
| `high` | 复杂推理、数学、规划、代码分析 |

`step-3.7-flash` 模型页原文："`step-3.7-flash` 支持**三档推理强度**，可根据任务复杂度灵活选择"。

### 7.B 模型事实（逐字）

| 模型 | 上下文 | 最大输出 | 模态 | 定位（逐字） |
|---|---|---|---|---|
| `step-5-preview` | **1M tokens** | **64k tokens** | 文本/图片/视频 | 面向真实任务的新一代旗舰基模，重点覆盖编程与专业知识工作 |
| `step-3.7-flash` | 256K tokens | — | **原生支持图片和视频理解** | 旗舰多模态推理模型；198B 总参数 / 11B 激活稀疏 MoE |
| `step-3.5-flash` | — | — | 纯文本 | 最强大的开源基座模型；1960 亿参数，激活 110 亿 |

`step-3.5-flash` 另有 Agent 优化版原文："可切换至低推理模式大幅降低 Token 消耗…**支持 `reasoning_effort` 字段（`low` / `high`）**"。

### 7.C 「换模型」官方语义

`model-migration`（2026-07-08 下线公告）逐字：`step-3` → 推荐替代 `step-3.7-flash`；`step-2x-large` 将于 2026-10-10 下线。**未见 `step-r1` 或 `-reasoning` 类思考版后缀模型**；官方用**同一 `reasoning_effort` 三档**表达深浅，属"同模型档位"阵营。

### 7.D 跨平台差异（重要，`stepfun` 在阿里云百炼的直供版行为不同）

阿里百炼 `stepfun` 页原文："`stepfun/step-3.7-flash` 和 `stepfun/step-5-preview` 是阶跃星辰直供的多模态推理模型，**默认关闭思考模式**，您可以通过设置 **`enable_thinking`** 为 `true` 开启思考模式。开启后…您可以通过 `reasoning_effort` 参数（可选值：`low`、`medium`、`high`）控制推理深度。"

→ **同一模型，阶跃官方端点默认开推理（`medium` 推荐）；阿里百炼直供版默认关闭思考、需 `enable_thinking=true` 开。** 抽象层若按"平台+模型"建 caps，必须区分 host；若只按模型 ID 建，会把两平台默认值混为一谈。**这是全表中最强的"caps 必须按端点而非模型名寻址"的证据。**

---

## 8. 统一对照表（模型 × 关键维度）

`ctx/maxOut` 单位 token，取官方逐字数字。`深浅=` 列回答"官方表达深度差的手段"。

| # | 模型（官方真名） | 思考键 | 值域 | 默认 | 可分档? | 输入模态 | context / maxOut | 深浅 = 参数 还是 换模型 |
|---|---|---|---|---|---|---|---|---|
| 1 | `qwen3.8-max` | `enable_thinking` + `reasoning_effort` + `thinking_budget` | bool；`xhigh/medium/low`；int | `xhigh`（budget 131072） | ✅ 3 档 | Text | 262144 / 65536（思考 32768） | **参数**（effort↔budget 可互转，不可同设） |
| 2 | `qwen3.8-omni-flash` | `reasoning_effort` | `low/medium/xhigh`（+7 档兼容） | `xhigh` | ✅ 3 档 | 多模态（Omni） | — / — | **参数** |
| 3 | `qwen3-max` | `enable_thinking` | `true/false` | **不开启** | ❌ 无档 | Text | 262144 / 65536（思考 32768） | 参数（开关）+ 换模型（3.8-max） |
| 4 | `qwen-plus` | `enable_thinking` | `true/false` | **不开启** | ❌ 无档 | Text | 1000000 / 32768 | 参数（开关） |
| 5 | `qwen3-coder-plus` | **官方页未列思考键** | — | — | UNVERIFIED | Text | 1000000 / 65536（思考 32768） | UNVERIFIED |
| 6 | `qwen3-vl-plus` | `enable_thinking` + `thinking_budget` | `true/false`；int | 见模型卡 | ❌ 无档 | **Text/Image/Video** | 262144 / 32768 | 参数（开关） |
| 7 | `kimi-k3` | **`reasoning_effort`（无 thinking）** | `low/high/max` | **`max`** | ✅ 3 档 | Text+Image | 1048576 / — | **参数** |
| 8 | `kimi-k2.7-code`（+`-highspeed`） | `thinking`（不可关） | `{type:enabled,keep:all}` 唯一 | 始终思考 | ❌ | Text/Image/Video | 262144 / — | 参数（无档）|
| 9 | `kimi-k2.6` | `thinking.type` + `thinking.keep` | `enabled/disabled`；`null/all` | `enabled`；`null` | ❌ 无档 | Text+Image | 262144 / — | 参数（开关） |
| 10 | `doubao-seed-2-1-pro-260915` | `thinking.type` + `reasoning_effort`/`reasoning.effort` | `enabled/disabled/auto`；7 档 | `enabled`；`high` | ✅ 7 档 | 多模态理解 | 1048576 / 262144 | **参数** |
| 11 | `doubao-seed-evolving` | 同上 | 同上 | `enabled`；`high` | ✅ 7 档 | Text | 1048576 / 393216 | **参数** |
| 12 | `doubao-seed-2-0-pro-260215` | 同上 | 同上 | `enabled`；**`medium`** | ✅ 7 档 | 多模态理解+GUI | 262144 / 131072 | **参数** |
| 13 | `glm-5-3-flash-260828`（方舟托管） | `thinking.type`（仅 enabled） + `reasoning_effort` | 仅 `enabled`；7 档 | `max` | ✅（映射到 low/high/max） | 多模态理解 | 262144 / 262144 | **参数** |
| 14 | `hunyuan-a13b` | **`EnableThinking`** | `true/false` | `true`（未传值默认开启） | ❌ | Text | 224k in / 32k out | 参数（开关）+ `/no_think` 指令 |
| 15 | `hunyuan-t1`（含 `-vision`） | **无思考参数** | — | 始终思考 | ❌ | Text（vision 版含图） | t1-vision 28k in / 20k out | **换模型**（t1 = 深度推理；turbos = 快思考基座） |
| 16 | `hunyuan-turbos` | 无思考参数 | — | 快思考（不思考） | ❌ | Text | — | **换模型** |
| 17 | `ernie-5.0` | `thinking.type` / `enable_thinking` / `thinking_budget` / `thinking_strategy` / `reasoning_effort` | 见 §5.A；`reasoning_effort` ∈ {`high`,`max`} | `thinking.type`=`disabled`；`enable_thinking`=`false` | 部分（effort 2 档，仅 DeepSeek 系） | **原生全模态** | 131072 / [1，65536]（思维链 60k） | **参数 + 换模型**（`-thinking-preview`） |
| 18 | `ernie-5.0-thinking-preview` | `enable_thinking` + `thinking_budget` | `true/false`；int（min 100） | **`true`** | ❌ 无档 | 原生全模态 | 131072 / [1，65536]（思维链 60k） | **参数（开关）** |
| 19 | `ernie-5.1` | `thinking_budget` | int（min 100） | 各模型最大思维链长度 | ❌ 无档 | 原生全模态 | 131072 / 65536 | 参数（仅预算） |
| 20 | `ernie-x1.1`（即将下线） | 深度思考模型（独立模型线） | — | 始终思考 | ❌ | Text | 65536 / [1，65536]（思维链 64k） | **换模型** |
| 21 | `MiniMax-M3` | `thinking.type` + `reasoning_split` | `adaptive/disabled`；bool | **OpenAI=`adaptive`；Anthropic=`disabled`** | ❌ 无档 | Text/Image/Video | 1000000 / 524288 上限（推荐 131072） | 参数（开关，且两协议默认相反） |
| 22 | `MiniMax-M2.7`/`-highspeed` | `thinking`（**无法关闭**） | 传入 `disabled` 也保持开启 | 始终思考 | ❌ | Text（M3 才多模态） | 204800 / 204800 上限（推荐 65536） | **换 `-highspeed`=速度版（效果不变）** |
| 23 | `step-5-preview` | `reasoning_effort` / `output_config.effort` | `low/medium/high` | **`medium`** | ✅ 3 档 | Text/Image/Video | 1048576 / 65536 | **参数** |
| 24 | `step-3.7-flash` | `reasoning_effort` / `output_config.effort` | `low/medium/high` | `medium` | ✅ 3 档 | Text/Image/Video | 262144 / — | **参数** |
| 25 | `step-3.5-flash`（Agent 优化版） | `reasoning_effort` | `low/high` | — | ✅ 2 档 | Text | — | **参数** |
| 26 | `stepfun/step-3.7-flash`（**百炼直供**） | `enable_thinking` + `reasoning_effort` | bool；`low/medium/high` | **关闭思考** | ✅ 3 档 | 多模态 | 262144 / — | 参数 |

**对照表行数：26 行，覆盖 8 家厂商（阿里、月之暗面、字节、腾讯、百度、MiniMax、阶跃）共 26 个模型条目。**

---

## 9. 「预置应有值」表（PocketForge caps 字段口径）

字段口径对齐 `forge/data/model-caps.json`：`context_len` / `context_est` / `multimodal` / `thinking.mode` / `thinking.levels` / `thinking.default` / `thinking.off_supported`，新增 `thinking.request`（参数映射）。**`thinking.mode` 建议取值扩充为 `native|switch|none|variant`**：`native`=同模型官方档位；`switch`=同模型官方布尔开关（无档）；`variant`=官方以独立模型名表达深浅（**仅百度 `-thinking-*`、腾讯 t1/turbos 类有依据**）；`none`=无任何官方思考控制键。

| 模型 | `context_len` | `context_est` | `multimodal` | `thinking.mode` | `thinking.levels` | `thinking.default` | `thinking.off_supported` | 请求映射（官方键） |
|---|---|---|---|---|---|---|---|---|
| `qwen3.8-max` | **262144** | false | false | `native` | `["low","medium","xhigh"]` | **`"xhigh"`** | true（`none`→`enable_thinking:false`） | `{"enable_thinking":bool}` 或 `{"reasoning_effort":<low\|medium\|xhigh>}`（**二者互斥，同设报错**） |
| `qwen3.8-omni-flash` | — | — | **true** | `native` | `["low","medium","xhigh"]` | `"xhigh"` | true（`none`） | `{"reasoning_effort":<...>}` |
| `qwen3-max` | **262144** | false | false | `switch` | `[]` | **`"off"`** | true | `{"enable_thinking":true/false}` |
| `qwen-plus` | **1000000** | false | false | `switch` | `[]` | `"off"` | true | 同左 |
| `qwen3-coder-plus` | **1000000** | false | false | UNVERIFIED | — | — | UNVERIFIED | — |
| `qwen3-vl-plus` | **262144** | false | **true** | `switch` | `[]` | 见模型卡 | true | `{"enable_thinking":bool}` |
| `kimi-k3` | **1048576** | false | **true**（原生视觉） | `native` | `["low","high","max"]` | **`"max"`** | **false**（始终推理，无 thinking 键） | `{"reasoning_effort":<low\|high\|max>}` |
| `kimi-k2.7-code` | **262144** | false | true | `native` | `[]` | `"on"` | **false**（传 disabled 报错） | `{"thinking":{"type":"enabled","keep":"all"}}`（省略亦可） |
| `kimi-k2.6` | **262144** | false | true | `switch` | `[]` | `"on"` | true | `{"thinking":{"type":<enabled\|disabled>,"keep":<null\|"all">}}` |
| `doubao-seed-2-1-pro-260915` | **1048576** | false | **true** | `native` | `["none","minimal","low","medium","high","xhigh","max"]` | **`"high"`** | true（`minimal` 或 `reasoning_effort:none`） | `{"thinking":{"type":<enabled\|disabled\|auto>},"reasoning_effort":"<...>"}` |
| `doubao-seed-evolving` | **1048576** | false | false（能力标签无多模态理解） | `native` | 同上 7 档 | `"high"` | true | 同左 |
| `doubao-seed-2-0-pro-260215` | **262144** | false | **true** | `native` | 同上 7 档 | **`"medium"`** | true | 同左 |
| `glm-5-3-flash-260828`（方舟） | **262144** | false | true | `native` | `["low","high","max"]`（7 档经映射） | **`"max"`** | **false**（仅 enabled） | `{"thinking":{"type":"enabled"},"reasoning_effort":"<...>"}` |
| `hunyuan-a13b` | **229376**（224k in） | false | false | `switch` | `[]` | **`"on"`**（官方默认慢思考） | true | `{"EnableThinking":bool}`（**仅此模型生效**；或 query 前缀 `/no_think`） |
| `hunyuan-t1` / `hunyuan-t1-vision-*` | —（vision 28k in） | — | vision 版 **true** | `variant`（**有官方依据**） | `[]` | `"on"` | false | 无思考键；换 `hunyuan-turbos` 取快档 |
| `hunyuan-turbos` | — | — | false | `variant` | `[]` | `"off"` | — | 无思考键 |
| `ernie-5.0` | **131072** | false | **true（原生全模态）** | `switch` | `["high","max"]`（仅 DeepSeek 系支持 effort，本模型 ❌） | **`"off"`**（`thinking.type` 默认 disabled） | true | `{"thinking":{"type":<enabled\|disabled>}}` 或 `{"enable_thinking":bool}`（默认 false） |
| `ernie-5.0-thinking-preview` | **131072** | false | true | `switch` | `[]` | **`"on"`**（`enable_thinking` 默认 true） | **true**（可设 false 关闭） | `{"enable_thinking":bool,"thinking_budget":int}` |
| `ernie-5.1` | **131072** | false | true | `switch`（仅预算） | `[]` | 见模型卡 | — | `{"thinking_budget":int}`（min 100） |
| `ernie-x1.1`（**即将下线，勿预置**） | 65536 | false | false | — | — | — | — | — |
| `MiniMax-M3` | **1000000** | false | **true** | `switch` | `[]` | **按协议：OpenAI=`"on"`，Anthropic=`"off"`** | true | `{"thinking":{"type":<adaptive\|disabled>},"reasoning_split":bool}` |
| `MiniMax-M2.7`/`-highspeed` | **204800** | false | false | `switch` | `[]` | `"on"` | **false**（传入 disabled 也保持开启） | `{"thinking":{"type":"adaptive"}}`（无实际作用） |
| `step-5-preview` | **1048576** | false | **true** | `native` | `["low","medium","high"]` | **`"medium"`** | **false**（无关闭语义，仅档位） | `{"reasoning_effort":"<low\|medium\|high>"}` |
| `step-3.7-flash` | **262144** | false | **true** | `native` | `["low","medium","high"]` | `"medium"` | false | 同左（Messages 面 `{"output_config":{"effort":"<...>"}}`） |
| `stepfun/step-3.7-flash`（百炼） | 262144 | false | true | `switch`+`native` | `["low","medium","high"]` | **`"off"`**（官方默认关思考） | true | `{"enable_thinking":bool,"reasoning_effort":"<...>"}` |

**摘要（≤10 行）**：
1. **`context_len` 有官方确定数字**：阿里 1M/262144 两档、Kimi 1048576/262144、豆包 1048576/262144、MiniMax 1000000/204800、阶跃 1048576/262144、百度 131072。全阵营**`context_est` 应为 false**（无一家需要估算）。
2. **`multimodal` 官方原文判定**：true = `qwen3-vl-plus`、`kimi-k3`、`kimi-k2.7-code`、`kimi-k2.6`、全部 `doubao-seed-2-1-*`/`2-0-*`、`glm-5-3-flash-260828`、`MiniMax-M3`、`step-5-preview`、`step-3.7-flash`、`ernie-5.0*`；false = `qwen3.8-max`、`qwen3-max`、`qwen-plus`、`qwen3-coder-plus`、`hunyuan-a13b`、`hunyuan-turbos`、`MiniMax-M2.7*`。
3. **档位集最多 3 档**（Kimi 3、阶跃 3、阿里 3.8 系 3、GLM 3），**唯豆包 7 档**，**百度/腾讯/MiniMax 0 档**。→ 抽象层的档位上限取 **3**（`low/medium/high`）即可覆盖除豆包外全部厂商；豆包 7 档可按映射收敛到 3 档。
4. **默认档不可统一**：`max`（Kimi K3、GLM-5.3、方舟 glm-5-3-flash）、`xhigh`（qwen3.8 系）、`high`（豆包 2-1 系、DeepSeek 系、百度 effort）、`medium`（豆包 2-0 系、阶跃）、`off`（qwen3-max/plus、百度 ernie-5.0、百炼 stepfun）。→ **`thinking.default` 必须逐模型配置，不能有全局缺省。**
5. **`off_supported` 的官方边界**：不支持关闭 = `kimi-k3`、`kimi-k2.7-code`、`glm-5.3`/`-flash`（research/40）、方舟 `glm-5-3-flash-260828`、`MiniMax-M2.7*`、`step-5-preview`/`step-3.7-flash`；支持关闭 = `kimi-k2.6`、`ernie-5.0-thinking-preview`(默认真)、全部豆包、qwen3-max/plus、MiniMax-M3。
6. **`reasoning_effort` 词汇表跨厂商收敛**：`low`/`high`/`max` 是 Kimi/阿里(GLM·DS 直供) 的逐字值；`low`/`medium`/`high` 是阶跃逐字值；`xhigh` 仅阿里 3.8 系；`none`/`minimal` 被阿里/豆包/百度接受为"关闭"或"最低档"。
7. **`reasoning_effort` 与 `thinking_budget` 互斥只在阿里 3.8 系成立**（同设报错），其余厂商 `thinking_budget` 与档位并存（百度 ernie-5.0-thinking-preview 同时有 enable_thinking + thinking_budget）。
8. **腾讯 `EnableThinking` 只对 `hunyuan-a13b` 生效**，不可作为通用 caps；t1/turbos 无思考参数。
9. **MiniMax 两协议默认值相反**（OpenAI 开/Anthropic 关）→ caps 需带协议维度，或实现层强制显式发送 `thinking`。
10. **阶跃/百炼 stepfun 同模型默认值相反**（原生开/百炼关）→ caps 需带 host 维度（**这是"caps 按模型名寻址会出错"的硬证据**）。

---

## 10. 跨阵营归类（抽象层设计的直接输入；与 research/43 国际阵营同口径）

按**思考控制的官方参数形态**归为五族。与 research/43（国际阵营）同口径，可直接合并成一张全局表。

### A. `reasoning_effort` 顶层字符串族（同模型、单键、有序档位）

| 厂商 | 键（逐字） | 逐字值域 | 默认 | 备注 |
|---|---|---|---|---|
| Kimi（月之暗面官方） | `reasoning_effort` | `low`/`high`/`max` | `max` | 仅 `kimi-k3` |
| 字节豆包（Ark） | `reasoning_effort`（Chat）/`reasoning.effort`（Responses） | `none`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max` | 逐模型 `high`/`medium`/`max` | **全 7 档无条件接受** + 服务端映射 |
| 阶跃星辰 | `reasoning_effort`（Chat）/`output_config.effort`（Messages） | `low`/`medium`/`high`（3.5-flash-2603：`low`/`high`） | `medium` | — |
| 阿里百炼 | `reasoning_effort` | 3.8 系 `xhigh`/`medium`/`low`；GLM·DS 直供 `max`/`high`/`low` 或 `high`/`max`；`kimi/kimi-k3` 仅 `max` | 逐模型 `xhigh`/`max`/`high` | 仅**部分**型号；**OpenAI 标准参数**（无需 extra_body） |
| 百度千帆 | `reasoning_effort` | `high`/`max`（`low`/`medium`→`high`，`xhigh`→`max`） | `high`（Agent 类请求自动 `max`） | 仅 `deepseek-v4-pro`/`deepseek-v4-flash` |
| 智谱（research/40） | `reasoning_effort` | `low`/`high`/`max` | `max` | — |
| DeepSeek（research/40） | `reasoning_effort` | `none`/`low`/`high`/`max` | `high` | — |

**族特征**：单键、字符串、有序、默认值各异、映射规则由服务端承担。→ **抽象层最应采用的统一键**：`reasoning_effort`。收敛方式：把各厂档位映射到统一三档 `low/medium/high`，豆包 7 档用官方映射表降维（`minimal`→off，`none`→off，`xhigh`/`max`→high 或保留）。

### B. `thinking_budget` 整数族（token 预算）

| 厂商 | 键（逐字） | 类型/范围 | 默认 | 与档位关系 |
|---|---|---|---|---|
| 阿里百炼 | `thinking_budget` | int；控制台 1～32768；API 默认=模型最大思维链长度 | 见模型卡 | **与 `reasoning_effort` 互斥且可互转**（3.8 系：low=4096/medium=16384/xhigh=262144；默认 131072） |
| 百度千帆 | `thinking_budget` | int；min 100，max=各模型思维链长度 | **16384**（API 参数表）／"各模型最大思维链长度"（深度思考页，两处不一致） | 与 `enable_thinking` 并存；**ernie 系列思考模型不支持**此键 |

→ **注意：中国阵营的预算键是顶层 `thinking_budget`（整数），不是 Anthropic 风格的嵌套 `thinking.budget_tokens`。** research/40 已证 GLM/DeepSeek 官方无预算键（DeepSeek Anthropic 面 `budget_tokens` 被忽略）。抽象层若要暴露预算，应向上映射为 `thinking_budget` 整数，并对不支持者降级到档位。

### C. `enable_thinking` 布尔族

| 厂商 | 生效面（逐字） | 默认 |
|---|---|---|
| 阿里百炼 | Qwen3.7/3.6/3.5/3、Qwen3-Omni-Flash、Qwen3-VL、DeepSeek-V4.x、DeepSeek-V3.x、Kimi-K2.7-code、Kimi-K2.6/K2.5、GLM 系列 | 逐模型（3.8 系/GLM-5.3 视为 always-on，qwen3-max/plus 默认 false） |
| 百度千帆 | `qwen3-32b`/`14b`/`8b`、`ernie-4.5-turbo-vl-preview`、`ernie-4.5-turbo-vl-32k-preview`、`ernie-4.5-vl-28b-a3b`、`ernie-5.0-thinking-preview` | `false`；**`ernie-5.0-thinking-preview` 为 `true`** |
| 阿里百炼（stepfun 直供） | `stepfun/step-3.7-flash`、`stepfun/step-5-preview` | **关闭**（官方原文） |
| 智谱（Coding Plan 网关，research/40） | GLM-5.3 仅 `true`，传 `false` 请求失败 | `true` |

→ **覆盖最广的布尔开关**；非 OpenAI 标准参数，SDK 需 `extra_body`（阿里；Node SDK 例外为顶层）。

### D. `thinking{type}` 对象族

| 厂商 | 键 | 逐字值域 | 默认 |
|---|---|---|---|
| 字节豆包 | `thinking.type` | `enabled`/`disabled`/**`auto`** | `enabled`（带深度思考标签的模型默认即启用） |
| MiniMax | `thinking.type` | `adaptive`/`disabled` | OpenAI `adaptive` / Anthropic `disabled` |
| 百度千帆 | `thinking.type` | `enabled`/`disabled` | **`disabled`** |
| Kimi（K2.6） | `thinking.type` + `thinking.keep` | `enabled`/`disabled`；`null`/`all` | `enabled` / `null` |
| 智谱（research/40） | `thinking.type` + `clear_thinking` | `enabled`/`disabled`；bool | `enabled` / `true` |
| DeepSeek（research/40） | `thinking.type` | `enabled`/`disabled` | `enabled` |

→ **共同的 `type` 子键，值域 `{enabled, disabled}` 是最大公约数**（豆包多 `auto`，MiniMax 用 `adaptive` 代 `enabled`）。抽象层可用 `thinking:{type:...}` 统一，`auto`/`adaptive` 建议归一为 `enabled`（语义上都是"模型自主判断"）。

### E. 无参数族（仅靠换模型或提示词指令）

| 厂商 | 官方手段（逐字） |
|---|---|
| 腾讯混元 | 除 `hunyuan-a13b` 的 `EnableThinking` 外无参数；深度靠**换模型**（`hunyuan-t1`=深度推理 vs `hunyuan-turbos`=快思考基座），或 `hunyuan-a13b` 的 query 前缀 **`/no_think`** |
| 讯飞星火 | 公开 HTTP 文档未列思考参数；X1/X2 为独立"深度推理"服务线 |
| 商汤 SenseNova | 未找到公开参数页 |
| 纯提示词 | 阿里 Qwen3 开源版 + `qwen-plus-2025-04-28`：`/no_think`、`/think` |

→ **族特征：无参数可调，官方以"独立模型名"承担深度差**。抽象层对这类模型只能做"模型名切换"，不能伪造档位参数（否则报错或静默无效）。

### F. 跨族归一建议（给抽象层）

1. **对外统一键**用 `reasoning_effort`（A 族已是 7 家事实标准）。
2. **对内落点**按 caps 的 `thinking.mode` 三态翻译：`native`→发 `reasoning_effort`；`switch`→发 `thinking:{type}` 或 `enable_thinking`；`variant`→切模型 ID；`none`→什么都不发。
3. **档位值域归一为 `{off, low, medium, high}`**（`max`/`xhigh` 上折到 `high`，`minimal`/`none` 下折到 `off`），逐模型查官方映射表落回原生值。**豆包需双向映射**（官方 7↔3）；**阿里 3.8 系需查 effort↔budget 换算表**。
4. **默认档必须逐模型**（§9 第 4 条），禁止全局缺省。
5. **caps 键应为 `(host, model)` 二元组**，不是 `model` 单键（§7.D 阶跃/百炼、§6.A MiniMax 双协议两处硬证据）。
6. **协议面差异需在适配器内吸收**：阿里（OpenAI/Responses/DashScope 三面）、豆包（Chat/Responses）、阶跃（Chat/Messages）、MiniMax（OpenAI/Anthropic）。

### G. 与 research/43（国际阵营）同口径合并要点

本表刻意复用 research/43 的族名（`reasoning_effort` 族 / `thinking.budget` 族 / `enable_thinking` 布尔族 / 无参数族）。合并时的关键观察：
- **国际阵营以 `reasoning_effort` 为绝对主流**（含 `none`/`minimal` 低档）；中国阵营**除腾讯/讯飞外也已收敛到 `reasoning_effort` 或 `thinking.type`**。两阵营的归一结论可合流为一条：**`reasoning_effort`（有序档位）+ `thinking.type`（布尔开关）双键抽象**，`variant`（换模型）仅作 fallback。
- **预算族（`thinking_budget`）是中国阵营相对突出的形态**（阿里、百度均有一等公民预算键），国际阵营更常见 Anthropic 式嵌套 `budget_tokens`。合并时建议以整数 `thinking_budget` 作对外键，适配器内翻译。

---

## 11. UNVERIFIED 清单

1. **阿里 `thinking_budget` 默认值口径不一致**：`deep-thinking` 页写"默认值为模型的最大思维链长度"，`openaicompat` 参数表同；但控制台体验中心段写"取值范围 1～32768，**默认值 4000**"。两处均为官方，**未判定哪一处是生产默认**（UNVERIFIED）。建议实现时显式传值，不依赖默认。
2. **`qwen3-coder-plus` 是否支持 `enable_thinking`**：该模型页与 `deep-thinking` 支持清单**均未出现** `qwen3-coder-plus`；`openaicompat` 温度表出现"Qwen3-Coder系列（非思考模式）"，暗示存在非思考模式，但**未见思考开关的正面声明**。→ UNVERIFIED。同理 `qwen-flash`、`qwen-turbo` 的具体思考键未逐一页面核验（`deep-thinking` 清单仅写"千问Flash系列/千问Turbo系列（混合思考模式，默认不开启思考模式）"）。
3. **百度 `thinking_budget` 默认值两处不一致**：API 参数表写 **16384**，深度思考页写"默认值为各模型支持的思维链长度"。均官方，未判定（UNVERIFIED）。
4. **百度 `ernie-5.1` 是否支持开关**：`ernie-5.1` 仅出现在 `thinking_budget` 支持清单，**未出现在 `thinking`、`enable_thinking`、`reasoning_effort` 任一清单**。其思考默认态（常开？可关？）UNVERIFIED。
5. **腾讯 `hunyuan-t1` / `hunyuan-turbos` 是否有未公开的思考参数**：`105701` 参数表与 `111007` 自定义参数表均无 thinking 类键；`EnableThinking` 明示仅 `hunyuan-a13b` 生效。是否存在仅 SDK/白名单可见的键 → UNVERIFIED。
6. **腾讯混元迁移至 TokenHub 后的参数面**：原平台 9/30 停服，TokenHub 的思考参数规范（`cloud.tencent.com/document/product/1772` 返回 200 但未取到内容）→ UNVERIFIED。
7. **火山方舟 `reasoning_effort` 与 `thinking` 同时设置的优先级**：文档未说明两者冲突时以谁为准（豆包 `thinking.type:disabled` 与 `reasoning_effort:high` 同传的行为）→ UNVERIFIED。
8. **`doubao-seed-evolving` / `doubao-seed-2-1-*` 的模态标签与其模型页细目**：模型列表能力标签中 `doubao-seed-evolving` **无"多模态理解"标签**，但 `doubao-seed-2-1-*` 有；模型页细目未逐一核验输入类型 → 弱 UNVERIFIED。
9. **阶跃 `output_config.effort` 在"与 Anthropic 字段差异"表中标注"字段会被忽略"**，而示例 Tab 又给出该键用法。两处官方表述需调和：推测前者指"Anthropic 原生未识别字段"、后者为 Step 扩展键，但**未逐字确认生效条件** → UNVERIFIED。
10. **讯飞星火 X1/X2 思考参数**：公开 HTTP 文档（`www.xfyun.cn/doc/spark/HTTP调用文档.html`）仅覆盖 Lite/Pro/Max/4.0 Ultra 与内置搜索工具，**未见任何 thinking/effort/预算键**；X1.5/X2/X2.5 仅有控制台服务页（`console.xfyun.cn/services/bmx1`），无公开 API 规范 → UNVERIFIED。
11. **商汤 SenseNova 思考参数**：`platform.sensenova.cn` 可达（200），但候选文档路径（`/chat/ChatCompletions/ChatCompletions.md` 等）均 404 → UNVERIFIED。
12. **「中转私有名在官方无对应物」的处置（沿 research/40 结论并扩展）**：
    - `deepseek-v4.1-flash`：research/40 已判 UNVERIFIED（官方在册 `deepseek-flash`/`deepseek-v4-pro`）。**本次新增证据**：阿里百炼 `deep-thinking` 与 `openaicompat` **逐字把 `deepseek-v4.1-flash` 列为在册模型**（"混合思考模式，默认开启思考模式：deepseek-v4.1-flash"、"`deepseek-v4.1-flash` 模型：默认值为 `high`…`minimal` 映射为 `low`…`ultra` 映射为 `max`"）。火山方舟与百度千帆则用 `deepseek-v4-1-flash-260910` / `deepseek-flash` 等另一套名。→ **`deepseek-v4.1-flash` 在阿里百炼官方端点确实存在，但在 DeepSeek 官方端点不在册**：这是"同名模型跨平台存在性不同"的判例，**precedence 须按 host 判定**。
    - **处置建议（给 PocketForge）**：caps/`thinking` 不得只按 `model` 字符串寻址；应建立 `provider_host → model_name` 映射表，并对每个 host 独立核验模型存在性。任何仅在第三方池中出现、官方文档查不到的模型名，**caps 一律标 `context_est:true` 且 `thinking.mode:"none"`**（宁可不发参数，也不发可能报错的参数）；同时把该条目挂上 UNVERIFIED 标记等待实测。
13. **`kimi-k2.7-code` 的输入是否含视频**：`models` 页写"文本/图片/视频输入"（快速开始），`use-thinking-models` 未列模态；未逐页交叉确认 → 弱 UNVERIFIED。
14. **火山方舟模型列表的列对齐**：方舟模型列表为复杂嵌套表（grid 布局 + Quill delta），本文数字来自按 `zoneId` 出现顺序还原的单元格序列（一次性还原脚本，未入库）。**同一单元格序列在跨列表格处可能错位**；`doubao-seed-2-1-pro-260915` 的 1024k/256k、`doubao-seed-2-0-*` 的 256k/224k/128k 已多次交叉出现且互相一致，置信较高；但**未逐格人工核对整张表** → 标注为"高置信、非逐格核验"。

---

## 12. 与既有研究的关系（不覆盖，只接续）

- `40-official-thinking-param-specs.md`：GLM-5.3/5.3-Flash、DeepSeek 的规范结论本文**全部引用不复述**。本文对其有一处**重要补充订正**：research/40 §1.D 判"换模型非官方语义"，该判决**对 GLM/DeepSeek 成立，但不能外推到全部中国厂商**——百度（`ernie-5.0` vs `ernie-5.0-thinking-*`，**现行在册**）与腾讯（`hunyuan-turbos` vs `hunyuan-t1`，**现行在册**）都用独立模型名表达思考版，且官方文案明确对举（"快思考基座"／"深度推理模型"）。**故 `variant` 机制应保留为厂商级开关而非全局删除**；对 GLM/DeepSeek 仍应删除（research/40 结论不变）。
- 交叉印证：Kimi 官方已**下线全部 `-thinking` 独立模型名**（`kimi-k2-thinking`、`kimi-thinking-preview` 等），改采"同模型 + `reasoning_effort`"——**这是"换模型表达深浅正在被淘汰"的独立证据**，与 research/40 的 GLM 判决方向一致，也与百度/腾讯的现状构成"收敛中但未收敛完"的真实图景。
- `35-thinking-effort-factfind.md` / `37-thinking-effort-real-levers.md`：仍只解释**当前链路为何只能用换模型**（中转面事实），不得作为官方语义依据；本文与 research/40 同为规范面依据。
- `38-zcode-model-config-anatomy.md`：§2「ZCode 无换模型形态」与本文的官方源结论**互证**（官方主流确不配对另一模型；仅百度/腾讯有例外）。
- 与研究 `43`（国际阵营，如已产出）：本文 §10 族名与之一致，可与 §10.F 的归一建议直接合并为全局抽象层设计输入。
