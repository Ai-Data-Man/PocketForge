# Research 38：ZCode 模型配置解剖（s100 设计依据，2026-09-22）

> 背景：用户裁决 s99 能力设置「彻底失败」并点名「ZCode 自己的代码已经开源，去研究下再说设计」+三条新批评（inline 展开反人类/池尾加模型蛋疼/无搜索）。
> 证据面三重互证：①本机安装包解包 `%LOCALAPPDATA%\Programs\ZCode\resources\app.asar`（@zcode/desktop，renderer bundle `out/renderer/assets/IntlProvider-DW5rmeLm.js` 含全量中文文案 504 条）②CLI 主体 `resources/glm/zcode.cjs`（CEL 求值与请求合并）③用户真实配置 `~/.zcode/v2/provider_config.json`（schemaVersion:1，key 已脱敏读取）。
> 状态：VERIFIED-RUN（本机解包读码+文件读取，2026-09-22）；GLM 默认 CEL 映射全文=UNVERIFIED（推荐配置云端下发本地无缓存，映射**形态**由截图+帮助文案确证）。

## 1. 模型配置 schema（ZCode 的"体系化抽象"本体）

```
modelConfigRules.providerModelRules[] = {
  providerId, modelId,
  config: {
    enabled: boolean,                     // 模型行启用开关（图2 行尾 toggle）
    properties: {                         // 静态元数据（信息行/校验用）
      contextWindow: int,
      inputFormat: { supportsImage, supportsPdf, ... },   // 输入类型复选
      supportsJsonSchemaOutput: boolean                    // 模型能力-结构化输出
    },
    optionSpecs: {                        // 会话可调选项的"规格"（对齐 harness 的 configOptions）
      maxOutputTokens: { max: int },
      reasoningLevel: {
        values: string[],                 // 推理等级（从低到高）——有序档位集，UI 可增删
        map: <CEL 表达式>                 // 推理参数映射：reasoningLevel → 请求字段 JSON
      }
    }
  }
}
```

关键概念分离：
- **档位（values）= UI/会话概念**：聊天时选的档，必须按推理强度低→高排列（i18n `reasoningLevelsOrdered` 原文：「请勿配置模型不支持的推理等级」）。
- **参数映射（map）= 翻译层**：CEL 表达式（截图实例 `reasoningLevel == "disabled" ? {"thinking":{"type":"disabled"}} : ...`）；帮助原文（i18n `help.reasoningLevelMapping`）：「使用 CEL 表达式，将当前推理等级 `reasoningLevel` 映射为模型接口的请求字段。表达式返回的 JSON 对象会合并到实际发送的请求体中。」
- **求值侧**（zcode.cjs）：`optionSpecs.reasoningLevel={values, map}`，发请求时 `apply(o,s)` 合并；`s.reasoningLevel===undefined` 抛 "reasoningLevel requires an effort"；`values` 不含所选档抛 "Unsupported reasoning effort"；错误面有 `reasoning-level-not-supported`。
- **智能配置**（i18n `help.followRecommendedConfig` 原文）：「根据模型 ID、Base URL 和 API 格式，为您智能匹配推荐配置。ZCode 会持续更新推荐配置，并自动同步给您。如果手动修改某项配置，该项将转为手动管理，不再跟随推荐更新；其他配置仍由智能配置管理。」——**按项转手动**的推荐配置库，不是全局开关。
- 编辑形态（图1+ i18n `editModel`）：模型行 → 「编辑模型配置」**独立弹窗**（上下文窗口/最大输出Token/高级配置折叠：输入类型/模型能力/推理等级+推理参数映射）。

## 2. 负验证：ZCode 无"换模型"形态

grep `想深点|换成另一个模型|deepModel|variantDeep` 于 renderer bundle=**0 命中**；CLI 侧 reasoningLevel 命中 163 处全部为档位校验/映射语义，无跨模型配对。
**结论：「深档用哪个模型」是 PocketForge 自造假需求**——ZCode 的思考深度=同模型的档位（values+map），从不配对另一个模型。

## 3. 三条新批评对照（用户 2026-09-22 补充）

| 批评 | ZCode 形态 | PocketForge 现状（s99） | 判定 |
|---|---|---|---|
| 点「能力」配置在下方 inline 展开=反人类 | 行尾编辑钮 → **弹窗**（图1） | openCapEditor 在 model-pool 内 append 面板（chat.tpl.html openCapEditor） | 错，改弹窗 |
| 列表长时「手动加模型」放末尾 | 池头固定「+ 添加模型」按钮（图2 右上） | 池尾 addrow（renderModelPool 尾部） | 错，移池头 |
| 无搜索 | 列表行搜索/筛选（图2 模型清单） | 零 | 错，补搜索（用户点名=翻案 §7 池"0-8 档无搜索"存量声明） |

## 4. 对 PocketForge 的映射（设计输入，非设计本身）

- goose 的 `configOptions.thinking_effort`（五档）与 ZCode 的 `optionSpecs.reasoningLevel.values` **同构**——都是"harness 声明此模型支持哪些会话档位"。
- 桥 llmproxy 的 effort→参数/模型翻译 = ZCode `map` 的等价物（翻译层）；差异=GLM 线参数通道在 9router 不生效（research/35/37 实测），翻译目标混入"模型路由"（X-flash↔X 家族）——**这是桥的实现细节，用户面只需 ZCode 形态的"档位集"**。
- 智能配置的"云端推荐"我们没有（本地启发式识别+（猜的）标注已有）——等价物=启发式预填+可改。
- 消费面裁剪判据（s99 §3.1）**维持有效**：ZCode 的 maxOutputTokens/输入类型在我们这边无 goose 消费面，数据面可存、呈现面降级或不搬；但 **reasoningLevel.values 有真消费面**（goose configOptions），必须呈现。

## 5. 遗留 UNVERIFIED

1. GLM 线默认 CEL 映射全文（云端推荐配置本地无缓存；形态确证于截图+帮助文案）。
2. 推荐配置库的下发通道/本地缓存位置（不影响本设计）。
3. ZCode 截图1「智能配置开关」与 `followRecommendedConfig` 按项语义的对应度（UI 总开关 vs 按项状态汇总，截图只见总开关）。
