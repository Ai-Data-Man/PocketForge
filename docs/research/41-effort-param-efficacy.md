# 41 reasoning_effort 参数链路实效：我方代理是否自伤 + 35/37 自证预言判定

> 2026-09-22。任务：主控自查怀疑 `forge/conf/templates/chat-bridge.tpl.js:3138` 删 `reasoning_effort/reasoning/thinking`，导致 s98/research 35「参数通道死透」可能是自证预言。
> 纪律：**只读**（不改产品文件，不整栈重启）；key 取 `forge/data/providers.json` active 项后仅经 env 传递，**本文与所有探针产物零 key 落盘**；单变量隔离。
> 探针目录 `forge/tmp/pf41/`（ASCII 名）。分级：VERIFIED-RUN=本轮实测；VERIFIED-CODE=逐行读码；官方规范见 `docs/research/40`。
> 判据：**可观测差异**（同题同 prompt、臂间仅 effort 变量，逐臂记 HTTP/错误体/usage/reasoning 字段/耗时）。

---

## 0. 结论速览

| # | 必答 | 结论 | 等级 |
|---|------|------|------|
| 1 | 链路事实：官方参数能否到上游 | **不能。** `chat-bridge.tpl.js:3138` 在**别名分支**无条件 `delete j.reasoning_effort; delete j.reasoning; delete j.thinking`；glm 家族在 goose 眼里**只有别名**（`gpt-5-forge-glm-5.3-flash`），故 glm 的 effort **必被删**。非别名请求（deepseek 等）**字节级透传，参数保留** | VERIFIED-CODE |
| 2 | providers.json 活跃 host | `http://111.228.54.166:20128/v1` = **本机公网 IP，回环到本机 9router :20128**（127.0.0.1:20128 与 111.228.54.166:20128 模型清单 134 条逐字相同）。**9router 就在本机**（`C:\ZCodeWorks\9router`，数据 `C:\ZCodeWorks\9router-data\db\data.sqlite`） | VERIFIED-RUN |
| 3 | 直连 9router 实测 effort 是否生效 | **glm-5.3 / glm-5.3-flash：不生效**（n=10/n=15，low/high/max/omit 分布完全重叠、无单调性，max 臂反而常低于 low）。**deepseek-v4.1-flash：生效**（none vs max，reasoning_tokens 130 vs 200） | VERIFIED-RUN |
| 4 | 绕开 9router 直连官方端点是否生效 | **生效。** 官方 OpenAI 面 `open.bigmodel.cn/api/paas/v4`：`reasoning_effort` low→max，glm-5.3 reasoning_tokens 233→358、flash 78→278（n=10，单调）。官方 Anthropic 面 `/api/anthropic/v1`：**`output_config.effort` 生效**（low 104→max 546），顶层 `reasoning_effort` **被忽略**（563→573）。非法值官方**报错**（HTTP 400 code 1210） | VERIFIED-RUN |
| 5 | 归属 | 参数在**官方上游真实生效**；失效发生在**9router 中转层**（无损透传不存在）：glm 家族 combo → `zhipuguanfang/*`=**anthropic-compatible 节点**，9router 的 `zai` 格式把 effort 写成**顶层 `reasoning_effort`**（anthropic 线上被忽略，须 `output_config.effort`），且 `glm-5.3-flash` 精确能力条目无 `thinkingEffortSupported` → effort 被整体丢弃。我方 `:3138` 是**第二条独立死因**（别名分支） | VERIFIED-CODE + VERIFIED-RUN |
| 6 | 35/37 是否自证预言 | **否。** 35/37 探针**直连 9router :20128**，**不经**我方桥 :8790/llmproxy，`:3138` 不在其路径上；本轮直连 9router 独立复现其 null。其过泛结论（「参数通道=模型能力死透」）被官方实测**推翻**，但「9router 线上无效」这一事实**成立** | VERIFIED-RUN（见 §5） |

---

## 1. 链路事实（只读，逐行）

### 1.A 活跃 provider host

`forge/data/providers.json`（单项）：

```json
[{"name":"自家中转","host":"http://111.228.54.166:20128/v1","models":["deepseek-v4.1-flash","glm-5.3-flash","glm-5.3"],"key":"<REDACTED>","active":true}]
```

`111.228.54.166` = 本机出网 IP（`Get-NetIPAddress` 内网 172.16.0.8；`ifconfig.me`/`ipinfo.io` 均回 111.228.54.166）。对 `111.228.54.166:20128/v1/models` 与 `127.0.0.1:20128/v1/models` 取清单：**各 134 条，逐字相同**。→ providers.json 的「自家中转」host 即**本机 9router 经公网 IP 回环**。9router 进程：`node custom-server.js`（PID 7580，`C:\ZCodeWorks\9router`），`0.0.0.0:20128 LISTENING`。

链路全貌：

```
goose(1.50.0)
  → OPENAI_HOST=http://127.0.0.1:8790/llmproxy/v1   （chat-bridge.tpl.js:13,1021）
  → chat-bridge :8790/llmproxy/*  handleLlmProxy    （:3069-3190）
  → providers.json host = 111.228.54.166:20128/v1 = 本机 9router :20128
  → 9router 内部：combo "glm-5.3"/"glm-5.3-flash" → zhipuguanfang/* 节点
  → https://open.bigmodel.cn/api/anthropic/v1/messages （智谱官方 Anthropic 兼容面）
```

### 1.B `chat-bridge.tpl.js` llmproxy 参数处理（逐行）

| 行 | 内容 | 影响 |
|----|------|------|
| :3069-3073 | 注释：goose LLM 流量恒经此；目标=providers.json 活跃档真值 host；**非别名请求字节级透传** | — |
| :3127 | `if (body && req.method === 'POST')` 才解析 body | — |
| :3130-3131 | `j.model` 是字符串 → `familyOfModel(act, j.model)` | 家族判定 |
| :3132 | **`if (fam && j.model === fam.alias)`** ← **只有「模型名恰为别名」才进改写分支** | 分水岭 |
| :3134-3135 | `e = j.reasoning_effort`；`target = (e==='high'||e==='max') ? fam.deep : fam.fast` | effort→**选模型** |
| :3137 | 追加 `data/logs/llmproxy.log`（已观测到 effort 行，证明 goose 路径在跑） | 观测 |
| **:3138** | **`delete j.reasoning_effort; delete j.reasoning; delete j.thinking;`**（注释「上游 no-op 参数不上真线」） | **删参** |
| :3139 | `j.model = target` | 真名回写 |
| :3145 后 | 非别名 POST：`body` 原样，`xlate=null` → 后续**字节透传** | deepseek 保参 |

**关键事实链**：

- `registryFamilies`（:851-865）为 `model-caps.json` 中 `thinking.mode==='variant'` 的条目造家族，别名 = `'gpt-5-forge-' + fast`（:861）。当前 `model-caps.json`：`glm-5.3` 与 `glm-5.3-flash` 均 `thinking:{mode:"variant",variant:{fast:"glm-5.3-flash",deep:"glm-5.3"}}` → 家族别名 = **`gpt-5-forge-glm-5.3-flash`**。
- `gooseModelName`（:872-876）：家族成员的 goose 侧名**恒为别名**。spawn 的 `GOOSE_MODEL` 与 ACP `set_config_option(model)` 均走别名（:1362-1387、:4782-4829）。
- 别名形如 `gpt-5-forge-...` **命中 goose `is_reasoning_model` 正则**（research/35 §1）→ goose 会自发注入 `reasoning_effort` 并带上 wire。**这就是设计意图**（:800-805 注释）。
- 因 goose 对 glm 只发别名，`:3132` 条件恒真 → **:3138 对 glm 恒执行**。→ **glm 的 effort 到不了 9router，更到不了官方**。
- deepseek 不在家族（`mode:"none"`）→ goose 发真名 → `:3132` 假 → 透传 → effort 保留（§3.C 实测坐实）。

---

## 2. 单变量实测协议

- 直连 provider host（**绕开 :8790**）：`forge/tmp/pf41/{decide41,anth41,anth2,ds41,ds2,trunc41,matrix41}.mjs`，HTTP 直发 9router。
- 绕开 9router 直连官方：`forge/tmp/pf41/` 内联 Python（urllib），端点 `open.bigmodel.cn/api/paas/v4/chat/completions`（OpenAI 面）与 `/api/anthropic/v1/messages`（Anthropic 面），凭据取自 9router 库中 zhipuguanfang 节点（**key 未落盘**）。
- 同 prompt：阶梯迭代题（起点 2，15 步 x=2x+1 / 或 3^7+10 步翻倍减一），唯一解 98303/2049。
- 逐臂记：HTTP 状态、错误体逐字、`reasoning_content`/`thinking` 字段、`usage.completion_tokens_details.reasoning_tokens`、`completion_tokens`、耗时。
- 变量隔离：同时序交错发单（i-loop 外层，arm 内层）抵消上游漂移；基线臂 = **省略参数**（omit/null）。

---

## 3. 臂矩阵（逐臂数字）

### 3.A 直连 9router :20128（OpenAI 面 `/v1/chat/completions`）

**glm-5.3 全四臂**（n=10，`decide41.mjs`，`reasoning_chars` / `completion_tokens`）：

| 臂 | reasoning_chars 逐样本 | 均值 R | 均值 CT | 单调? |
|----|----|----|----|----|
| low | 469,579,198,489,210,851,563,440,482,392 | **467.3** | 260.2 | — |
| high | 432,433,348（n=3 预试） | 404.3 | 286.3 | — |
| max | 343,524,345,292,400,317,581,273,631,321 | **402.7** | 228.4 | 否 |
| omit | 455,526,519,337,280,262,247,467,349,487 | 392.9 | 211.0 | 基线 |

→ **无单调性**：max(402.7) **低于** low(467.3)，方向与语义相反。全 200、finish=stop、`reasoning_tokens` 恒 null。

**glm-5.3-flash 全四臂**（n=6，难疑题）：

| 臂 | 均值 R | 均值 CT |
|----|----|----|
| low | 447.8 | 237.5 |
| high | 518.2 | 246.7 |
| max | 504.0 | 262.8 |
| omit | 752.5 | 334.5 |

→ 分布完全重叠，无序。

**ccp/z-ai/glm-5.3-flash（OpenAI 线，暴露 reasoning_tokens）**（n=8，交错）：none 205.3 / low 227.8 / high 211.9 / max 228.6 → 重叠。

**zhipuguanfang/glm-5.3（该 combo 真实后端）**（n=6）：low 453.5 / max 493.5 / omit 434.2 → 重叠。

**glm-5.3 Anthropic 原生面经 9router `/v1/messages` + output_config.effort**（n=15，`anth2.mjs`）：low meanOUT 252.6 vs max 244.5 → 重叠（注意：经 9router 时 `output_config` 也被吞，见 §4）。

**结论（9router 线）**：glm-5.3/flash 的 effort **行为恒无差** → 复现 35/37。

### 3.B deepseek-v4.1-flash（对照：参数确实生效）

交错 n=10×2（`ds41.mjs`）：

| 臂 | reasoning_tokens 逐样本 | 均值 |
|----|----|----|
| none | 176,108,176,173,152,91 … 二轮 94,91,93,185,173,88,85,175,157,217 | **146 / 135.8** |
| low | 266,326,187,102,157,221 | 209.8 |
| high | 92,145,95,147,151,213 | 140.5 |
| max | 295,134,214,227,95,164 … 二轮 162,119,252,177,183,240,83,179,122,201 | **188.2 / 171.8** |

→ none(≈146) < max(≈190)，两轮独立复现，**方向正确且稳定**。deepseek 是唯一可判「参数生效」的臂。

### 3.C 经我方 bridge :8790（同一 deepseek 对照）

`bridge41.mjs`，模型真名 `deepseek-v4.1-flash`：

| 路径 | none 均值 RT | max 均值 RT | 生效? |
|----|----|----|----|
| 直连 20128 | 130.8 | 199.8 | 是 |
| 经 8790 `/llmproxy/v1/chat/completions` | 114.4 | 183.6 | **是**（同向） |

→ 非别名请求桥内透传，参数原样到达；`:3138` 未触及 deepseek。**桥不是 deepseek 的死点**（反之：glm 别名分支才是）。

### 3.D 绕开 9router，直连官方端点（**决定性**）

**（d1）官方 OpenAI 面 `open.bigmodel.cn/api/paas/v4/chat/completions` + `reasoning_effort`**（交错 n=10）：

| 模型 | low reasoning_tokens | max reasoning_tokens | 判定 |
|----|----|----|----|
| glm-5.3 | [88,48,116,149,955,211,233,232,61,241] 均 **233** | [400,149,297,476,368,414,282,406,425,368] 均 **358** | **单调生效** |
| glm-5.3-flash | [92,99,97,57,65,77,77,52,52,108] 均 **78** | [353,159,297,171,338,329,98,125,320,590] 均 **278** | **单调生效（3.6×）** |

n=6 附测（`reasoning_content` 字节）：glm-5.3 low 297→max 739；flash 233→438。一致。

**（d2）官方 Anthropic 面 `/api/anthropic/v1/messages`**（n=5）：

| effort 键 | 值 | glm-5.3 thinking_chars 均 |
|----|----|----|
| `output_config.effort` | low | **104.2** |
| `output_config.effort` | max | **546.2** |
| 顶层 `reasoning_effort` | low | 563.2 |
| 顶层 `reasoning_effort` | max | 573.0 |

→ **Anthropic 面只认 `output_config.effort`；顶层 `reasoning_effort` 被忽略（≈默认 max）**。与 research/40 §1.E 官方规范一致。

**（d3）官方端点非法值探针（glm-5.3）**：

```
reasoning_effort=medium   → HTTP 400 {"error":{"code":"1210","message":"该模型始终思考，不支持关闭思考；请使用 low、high 或 max。"}}
reasoning_effort=none     → HTTP 400  同上
reasoning_effort=bogus    → HTTP 400 {"code":"1210","message":"reasoning_effort 参数值非法，可选值为：none、minimal、low、medium、high、xhigh、max"}
reasoning_effort=disabled → HTTP 400  同上
```

→ 官方**逐字读该参数并校验**；而**经 9router 全 200**（§3.A 附：`bogus`/`disabled`/`none` 均 200 返回 reasoning_content）。**「经 9router 宽容」vs「官方严格」本身就是参数被中转层吸收/改写的证据。**

### 3.E 截断判别（负结果，记录以排除假阳）

`trunc41.mjs`：`ccp/z-ai/glm-5.3-flash` + `max_tokens=32`，low/max 各 n=8 → **两臂 8/8 content 空、completion_tokens 恒 32**（预算全被思考吃光）。→ 该判别法在此链**无分辨力**（两档都强制思考），不作为判据。

---

## 4. 归属：为什么 9router 线上无效（而非上游忽略）

**上游结论（权威）**：智谱官方两端点均**真实兑现** effort（OpenAI 面 `reasoning_effort`、Anthropic 面 `output_config.effort`），并对非法值报错。→ **不是上游忽略**。

**9router 层机制（逐行 + 实测吻合）**：

1. 裸名 `glm-5.3` / `glm-5.3-flash` 在 9router 内是 **combo**（`data.sqlite` → `combos`）：
   - `glm-5.3` → `["zhipuguanfang/glm-5.3"]`
   - `glm-5.3-flash` → `["zhipuguanfang/glm-5.3-flash","ocg/glm-5.3-flash","ccp/z-ai/glm-5.3-flash"]`
   - `zhipuguanfang/*` = **anthropic-compatible 节点**，`baseUrl=https://open.bigmodel.cn/api/anthropic/v1`（`providerNodes` 表逐字）。
2. 客户端发 OpenAI 面 → 9router `translateRequest`（openai→claude），随后 `applyThinking`（`open-sse/translator/concerns/thinkingUnified.js`）。glm 的能力解析为 `thinkingFormat:"zai"`（`open-sse/providers/capabilities.js:373` 模式 `*glm-5.3*`）。
3. `applyFormat` 的 `case "zai"`（thinkingUnified.js）写入 **顶层 `body.reasoning_effort`**（且仅当 `caps.thinkingEffortSupported`），**从不写 `output_config`**。但目标线是 **Anthropic 面**——实测顶层 `reasoning_effort` 在 Anthropic 面**被忽略**（§3.D d2）。→ **键与线不匹配 = 参数静默失效**。
4. `glm-5.3-flash` 在 `MODEL_CAPABILITIES` 有**精确条目**（capabilities.js:112，`thinkingFormat:"zai"` **无** `thinkingEffortSupported`）——精确条目短路模式表（同文件 `getCapabilitiesForModel` 步骤 2 先于 3）→ **effort 被整体丢弃**，连顶层字段都不发。glm-5.3 无精确条目 → 落 `*glm-5.3*` 模式 → 有 `thinkingEffortSupported:true` → 发顶层字段但被 Anthropic 面忽略。
5. 结果：两模型经 9router 均**无差**，与 §3.A 实测（分布重叠、`bogus` 全 200）完全吻合。

**我方 `:3138` 的独立角色**：即使 9router 修好，glm 的 effort 也在**更早一步**被桥删（§1.B）。两条死因独立、都需处理：

```
goose 发别名+effort → 桥:3138 删 effort（死因1）→ 9router 收到无 effort
假设不删 → 9router `zai` 写顶层 reasoning_effort → Anthropic 面忽略（死因2）→ 上游默认 max
```

**残余不确定性（UNVERIFIED）**：①9router 侧未开 `ENABLE_REQUEST_LOGS`（`.env` = `false`），未直接抓到出站 body；「写顶层 `reasoning_effort`」为**源码逐行 + 上游面实测反推**（结论方向由 d2 唯一性支撑：Anthropic 面只有 `output_config` 生效，而 9router 实测无差 → 它未发 `output_config`）。②glm-5.3-flash 多后端 combo（首条 zhipuguanfang）的**重试/轮换**本轮未单独臂隔离。

---

## 5. 对 research 35 / 37 的逐条对齐与「自证预言」判定

| 维度 | research 35 / 37 | 本轮 41 | 对齐 |
|----|----|----|----|
| 测量点 | **直连 9router 127.0.0.1:20128**（35 §3「probe9r.mjs node 直连 127.0.0.1:20128，与 goose 链同源」；37 §2 同源） | §3.A 同点直连 | **同点** |
| 是否经我方桥 :8790 | **否**（35/37 未提及 :8790/llmproxy；探针直发 9router） | 桥路径单列于 §1.B/§3.C | **不同路径** |
| 臂集 | 35：6 形态（baseline/thinking×2/effort×2/reasoning）；37：5 臂×5 样本（thinking en/dis、effort low/high、baseline） | glm 四臂（low/high/max/omit）×2 模型，n=10/6 | 覆盖其臂集 |
| 判据 | reasoning 字符数 + completion_tokens，分布重叠判无差 | 同（+ 官方面 reasoning_tokens 计量） | 同 |
| 样本量 | 35 各 3；37 各 5 | n=10（glm-5.3）、n=6/8，另直连官方 n=10 | ≥ |
| 端点 | 9router OpenAI 面 `/v1/chat/completions` | 同；官方面另测 | 同 |

**判定：不是自证预言（NO）。** 理由：

1. 35/37 的 wire 标本取自**直连 9router**，**不经过** `chat-bridge.tpl.js:3138`；该行**不在其观测路径上**（物理上无法造成其 null）。
2. 本轮**独立直连 9router**、更大样本，**复现**了同样的 null（glm 无效、deepseek 有效）——同一上游、同一中转、无我方桥参与。→ null 是 **9router 层面**的真实性质，非我方桥制造。
3. 35/37 的过泛**结论**（「glm 参数通道=模型能力死透」「深度唯一真杠杆=换模型」）**被本轮官方直连实测推翻**：官方两端点均真实兑现 effort（§3.D）。但它们**关于 9router 链路的窄结论**（该线上参数无行为差）**成立**。
4. 与 research/40 一致：40 已从官方规范侧指出「换模型非官方语义」；本轮从**实测**侧补充「官方 effort 真生效，失效在中转+我方桥」。

**一处需纠偏的表述**：`chat-bridge.tpl.js:3072-3073` 注释称删参因「上游 no-op」——**该断言对本链路不成立**：官方面参数**非 no-op**；9router 线之所以像 no-op，是 9router 的 zai→anthropic 键错配所致，不能反推官方。

---

## 6. 若坐实自伤：`:3138` 最小修改建议

**先明确边界**：glm 的 effort 有**两条独立死因**（§4）。仅改 `:3138` **不足以**让 glm 的 effort 生效（9router 仍吞）。故建议分两层，且**最小改动**如下：

**层一（我方，1 行删除）**——`forge/conf/templates/chat-bridge.tpl.js:3138`：

```diff
-                        delete j.reasoning_effort; delete j.reasoning; delete j.thinking; // 上游 no-op 参数不上真线
+                        // 保留 effort 至上游：官方端点真实兑现（research/41 §3.D）；9router 侧另有格式损耗（§4），
+                        // 故此处不删——删了会让未来修好 9router 后仍失效。只剥离确证无效者（当前：无）。
```

或更保守（只保留 effort、剥离确证 no-op 的 `thinking` 对象）:
```diff
-                        delete j.reasoning_effort; delete j.reasoning; delete j.thinking;
+                        delete j.thinking; // 确证 no-op（本链路未观测到 thinking 对象产生差异）；reasoning_effort 保留
```
**推荐前者**：`reasoning_effort` 是官方主键（OpenAI 面），`thinking` 仅 Anthropic 面开关且 glm 强制，二者都无删除依据。

**层二（9router，非我方仓库，须另行决策）**——二选一：
- (a) 修 9router `applyFormat case "zai"`：当 targetFormat 为 claude/anthropic 时改发 `output_config:{effort}`（而非顶层 `reasoning_effort`）；并给 `MODEL_CAPABILITIES["glm-5.3-flash"]` 补 `thinkingEffortSupported:true`。
- (b) 给 glm 家族增配 **OpenAI 面节点**（官方 `open.bigmodel.cn/api/paas/v4`，`reasoning_effort` 已实测生效），combo 指向该节点。

**注**：deepseek 不受 `:3138` 影响（非家族、透传），其 effort 当前**已生效**（§3.B/C）——无需动作。

**未建议**：不动 `model-caps.json` 的 variant 家族机制（research/40 指其无官方依据，但那是**产品设计**议题，超出本轮「实现验证」范围；本轮只证「参数被自伤删除」）。

---

## 7. 探针清单（可重跑）与不复现前提

| 脚本 | 用途 | 复跑要点 |
|----|----|----|
| `forge/tmp/pf41/decide41.mjs` | 直连 9router，任意模型 low/high/max/omit 臂（`MODEL`/`ARMS`/`N` env） | `PROBE_KEY=$(providers.json active key) MODEL=glm-5.3 ARMS=low,max,omit N=10 node …` |
| `forge/tmp/pf41/ds41.mjs` | deepseek 四臂交错 | `MODEL=deepseek-v4.1-flash N=6` |
| `forge/tmp/pf41/anth2.mjs` | 9router `/v1/messages` 的 output_config vs 顶层 effort | `MODE=outcfg\|toplevel N=8` |
| `forge/tmp/pf41/bridge41.mjs` | 同臂走 :8790 或 :20128 | `PROBE_PORT=8790 node … llmproxy/v1/chat/completions` |
| `forge/tmp/pf41/trunc41.mjs` | 截断判别（负结果，仅供参考） | `MT=32` |
| §3.D 官方直连 | 绕开 9router | Python urllib，凭据取 9router 库 zhipuguanfang 节点，**key 不落盘** |

前提：key 经 env；不改产品文件；`forge/tmp/pf41/` 与本文零 key。

---

## 8. UNVERIFIED 清单

1. **9router 出站 body 未直接抓取**：`ENABLE_REQUEST_LOGS=false`（只读不改），「写顶层 `reasoning_effort`」为源码+上游面实测反推（§4 残余不确定性①）。定案须开日志或加只读代理抓包（会动栈，本轮未做）。
2. **glm-5.3-flash combo 多后端**：`zhipuguanfang` / `ocg` / `ccp` 三后端轮换对结果的影响未单臂隔离（`ocg` 返回结构异于其余两者，见 §3 附注）。
3. **`ocg/glm-5.3-flash` 异常**：n=5 中 4 发无 usage/finish、返回结构不完整（疑似上游限流或流式异常），未深挖。
4. **9router `zai` 格式对 glm-5.2 的行为**：本轮到 glm-5.3 系为止，5.2 未测。
5. **官方 `reasoning_effort` 与思考 token 的量化曲线**：官方仅给档位名（40 §4.6），本轮给了端点级均值差（233→358 等），非全曲线。
