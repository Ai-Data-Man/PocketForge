# 裁决 v3：思考深度=官方原生参数 + 官方预置表 + 用户可修正（s101，2026-09-23）

> 触发：用户三连批评——①「模型配置的预置错得离谱，按哪个次元设的思考深度？拍脑袋？更可笑的是直接焊死，识别错了也修正不了，和 zcode 完全不同」；②「你怎么按 9Router 调查？这不该查官方原生模型调用参数吗（deepseek、智谱官网），9router 只是中转」；③「调研模型太少，没覆盖中国市场主流」+「中国人很多在用 codex，claude 也有人用」。
> 研究出处：docs/research/40（GLM/DeepSeek 官方）、41（参数有效性实测）、42（中国主流 8 厂 26 模型）、43（国际主流 5 厂 19 模型）。
> **本裁决 supersede 2026-09-22-capability-config-v2 的 §2.3（variant 桥自管）与 2026-09-21-settings-model-caps-redesign 的 §3.1 消费面裁剪判据中关于 thinking 的部分**；左导航（s99 §2）、弹窗形态/池头搜索（s100 §2.1-2.2）维持有效。

## 1. 三处硬错误（主控认账）

1. **预置=拍脑袋**：`capsDefault` 纯名字启发式（`-flash` 后缀配对、名字命中 goose 名单→五档、其余→零档），与实际官方规范**对不上**——glm-5.3 官方档位是 `{low,high,max}`（强制思考、无 off），我们写五档含 off/medium；glm-5.3-flash 官方**支持看图**（原生多模态），我们启发式判 false；context 官方有真实数字（1M/262144 等），我们恒 null 靠"估计"。
2. **焊死=用户零修正**：s100 把 thinking 的 variant/mode/levels 三类用户写**全部拒收**（P3-4 由我拍板"整体关"）——"识别错了改不了"，与 ZCode「智能配置给默认、用户改哪项哪项转手动」正相反。
3. **依据错位**：s98 的 research/35 在**中转链路**上测出"参数全无效"，被当成模型能力定论，进而把"换模型"写成唯一机制。**真相**（research/41 实测）：参数在**官方端点真生效**（glm reasoning_tokens 233→358 / flash 78→278 / anthropic 面 104→546 / 非法值 400）；失效是**两层实现问题**：①我方桥 `:3138` 在别名分支无条件 `delete reasoning_effort`（glm 恒走别名→恒删）；②9router 的 `zai` 格式只写顶层 `reasoning_effort`，而其 glm 节点走 Anthropic 协议（只认 `output_config.effort`）。research/35 探针直连 9router、不经我桥，故**非自证预言**，但结论被过度外推。

## 2. 设计定稿

### 2.1 预置=官方规范表（数据驱动，取消名字启发式）

- 新增内建数据 `forge/conf/model-presets.json`（随包发布，模板→bootstrap 物化），逐模型条目：
  `{match:{host?|model 名}, context_len, max_output, input:{image,pdf,video}, thinking:{keys:[...], levels:[原生值域], default, off_supported:bool}, source_url, verified}`。
- 数据来源**只许官方文档**（40/42/43 已产出 45 个模型逐条原文；首批落池内模型：glm-5.3 / glm-5.3-flash / deepseek-v4.1-flash + 官方可查的常见项）。
- 匹配顺序：**精确 (host, model) 二元组 > model 名 > 厂系默认**（research/42 硬证据：同模型跨平台能力不同，如阶跃原生开 vs 百炼关）。**(host,model) 二元组=数据面结构升级 `_schema:3`**（ADR-0009 迁移义务）。
- 匹配不到→**诚实缺省**（context 显示"未知"不编造、thinking 显示"不确定，开对话看顶栏"）+「（官方未收录）」标注；启发式仅作最后兜底且必须标注「（猜的）」。

### 2.2 用户可修正（ZCode 模式：改哪项哪项转手动）

- 重开 thinking 用户写通道（撤回 s100 P3-4 的"整体拒收"）：用户可改 **档位集是否含 off、默认档、各字段值**；改过的字段打 `user:true` 逐字段粒度（不再整条），启发式/官方表**永不覆写**用户改过的字段，未改字段随官方表更新——与 ZCode `followRecommendedConfig` 按项转手动语义逐字对齐。
- 前端编辑器（弹窗）恢复"可改"形态：档位集按**官方值域**渲染（不是我们的五档常数）、默认档选择、每项带来源标注（「官方」/「（猜的）」/「你改的」）。
- **消费面判据仍适用**：可改字段必须真被消费（goose configOptions/桥翻译读它）；翻译层同步实现（§2.3），否则不许做成旋钮。

### 2.3 翻译层=统一档位语义 → 各厂商原生参数形态

- 内部统一：`levels`（原生值域字符串，有序）+ `default` + `keys`（该模型认的键名）。
- 桥内翻译（llmproxy/直调链）按 `keys` 生成请求体：
  - `reasoning_effort` 族（OpenAI/Grok/Mistral/Kimi/豆包/阶跃/GLM/DeepSeek…）
  - `thinking:{type,budget_tokens}` 族（Anthropic/豆包/MiniMax/百度…）
  - `thinkingConfig.thinkingBudget|thinkingLevel` 族（Gemini）
  - `enable_thinking` 布尔族（阿里/百度部分）
  - 无参数族 → 诚实禁用顶栏档位
- **删除 `:3138` 的 `delete reasoning_effort`**（保留确证 no-op 的 `thinking` 剥离条件化）；采样参数门（推理模型移除 temperature/top_p）按 43 号结论一并实现。
- 兼容层差异（43 号：Anthropic 的 OpenAI 兼容面**忽略** reasoning_effort；Gemini 兼容面**映射**之）→ 按 `keys` 声明，不做猜测。

### 2.4 家族换模型机制降级（不废除，但退出主路径）

- 官方普遍以**同模型参数**表达深浅；GLM 官方逐字「不会切换到其他模型」。故：**原生参数可用时一律走参数**；家族机制降为「模型完全无深度参数时的兜底」，且**永不进用户面**（s100 已达成）。
- GLM 线的家族机制：待 §2.3 参数链修好并实测生效后，**默认关闭**（config 开关，非删除；回滚位保留）。9router 侧 zai 格式问题=**用户侧 fork 修复项**（裁决附注给出证据，归用户）。
- 前端顶栏：档位来自翻译层声明的 levels（原生值域人话化映射），家族两档仅在无参数兜底时出现。

## 3. 切片

- **W1 停自伤+参数真通**：`:3138` 只删确证 no-op 者；别名分支保留 `reasoning_effort`；直调链参数门（temperature 移除）；实测 glm effort 经我方桥生效（红绿对照：改前 reasoning_tokens 无差 → 改后有序差异）。
- **W2 官方预置表**：`model-presets.json` 建表（首批=池内三模型+常用项，字段带 source_url）+ bootstrap 物化 + 缺省应用（context/modal/levels/default 来源标注）+ `_schema:3`（含 (host,model) 二元组）。
- **W3 用户可修正**：thinking 写通道重开（字段级 user 标记）+ 编辑器档位/默认档可改 + 来源标注三态。
- **W4 家族降级开关** + 顶栏 levels 由翻译层驱动（无参数模型诚实禁用）。
- **W5 QA 全量+回归+出厂复验**；9router 侧修复项**单独出用户侧清单**（不阻塞 W1-W4）。

## 4. 挖掘自查（AGENTS §9 过门）

- **一句话推翻**：「预置哪来的？」→ 每条带 source_url+官方原文（表内字段）；「改了没用？」→ 每可改字段有翻译层消费点+探针（W1/W3 验收）；「官方表过期呢？」→ `verified` 字段+「（官方未收录）」降级+用户可改兜底。
- **机制没入口**：家族兜底=自动且不可见（仅无参数模型触发）；9router 侧=用户侧清单，不假装产品能修中转。
- **时间底线**：W1 半天 / W2 半天（表数据已有）/ W3 半天 / W4 半天 / W5 半天。
- **负验证**（本轮已做）：45 个模型逐条官方文档；「参数无效」论断已用绕代理实测推翻；「换模型=官方语义」已用官方原文否证。
