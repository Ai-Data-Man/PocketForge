# 用户侧修复清单：9router 思考参数透传（s101，2026-09-23）

> 背景：docs/research/41 实测证明——**官方端点上思考参数真生效**（glm-5.3 `reasoning_tokens` 233→358、glm-5.3-flash 78→278、Anthropic 面 `output_config.effort` 104→546、非法值 HTTP 400 code 1210），但我方 PocketForge 经 9router 调用 glm 时参数**在 9router 层被丢弃**。我方自伤（桥 `:3138` 无条件删 `reasoning_effort`）已在 W1（58b3c0e）修复，端到端仍无效的剩余原因全在 9router 侧。
> 归属：9router 是用户自部署 fork（记忆：`niner/local-fixes` 分支），本清单交用户侧处理；**不阻塞** PocketForge 侧 W1-W6。

## 证据（research/41 §2-4，VERIFIED-RUN）

| 观测 | 结论 |
|---|---|
| 直连官方 OpenAI 面（`open.bigmodel.cn/api/paas/v4`）发 `reasoning_effort` | **生效**：reasoning_tokens 随档位单调变化 |
| 直连官方 Anthropic 面发 `output_config.effort` | **生效**：104→546 |
| 经 9router → glm 节点（Anthropic 协议）发 `reasoning_effort` | **无效**：分布完全重叠（n=10/15） |
| 9router 侧配置线索 | glm combo 指向 anthropic 兼容节点；`applyFormat case "zai"` 把 effort 写成**顶层 `reasoning_effort`**，而 Anthropic 面只认 `output_config.effort` → 键与线不匹配 |
| `glm-5.3-flash` 能力条目 | 缺 `thinkingEffortSupported` → 精确条目短路模式表 → effort 整体丢弃 |

## 修复选项（三选一，按代价升序）

1. **改 `applyFormat case "zai"`**：targetFormat 为 claude/anthropic 时改发 `output_config:{effort}` 而非顶层 `reasoning_effort`。（最小改动，推荐首选）
2. **补能力表**：给 `MODEL_CAPABILITIES["glm-5.3-flash"]` 补 `thinkingEffortSupported: true`（消除"精确条目短路模式表"导致的整体丢弃）。
3. **给 glm 家族增配 OpenAI 面节点**（`open.bigmodel.cn/api/paas/v4`，`reasoning_effort` 已实测生效），combo 指向该节点。（改配置不改代码）

**验证法**：改后重跑 `tmp/w1-effort-param-probe.js` Part B（改动前记录：low/high/max 三臂 reasoning_tokens 全 null、耗时 3310/3056/2851ms 无有序差异）；修好后应出现随档位单调变化的 reasoning_tokens。

## 与 PocketForge 的关系

- 修好后 PocketForge **无需任何改动**——W1 已保证参数正确带到出站帧（`tmp/w1-effort-param-probe.js` Part A 11/11 断言出站帧含官方参数）。
- 未修期间的行为是**诚实**的：顶栏档位照官方值域显示（W4）且切换会写到出站帧，只是中转层丢弃；不会出现"界面宣称已切、实跑另一模型"的静默背离（这正是 s98 家族机制的旧病，W4 已降级）。
