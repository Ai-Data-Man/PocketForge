# s101 会话：思考深度改用官方原生参数（2026-09-23）

## 触发（用户三连批评）

1. 「模型配置的预置错得离谱——你按哪个次元设的思考深度？拍脑袋？更可笑的是直接焊死，识别错了也修正不了，和 zcode 完全不同」
2. 「你怎么按 9Router 调查思考深度？这不是要去查官方原生模型的调用参数吗（deepseek、质谱官网），你管 9router 干什么，人家只是个中转」
3. 「调研的模型也太少了，没覆盖中国市场主流」+「中国人也有很多在用 codex，claude 也有人用」

## 流程

- **研究四处**（研究面经两次纠偏后覆盖到位）：
  - research/40：GLM/DeepSeek 官方规范（glm-5.3 强制思考、档位 {low,high,max} 默认 max；glm-5.3-flash 同档位且**原生多模态**；deepseek {none,low,high,max} 默认 high；官方逐字「关闭思考会转换为 low，**不会切换到其他模型**」）。
  - research/42：中国 8 厂 26 模型（阿里/月之暗面/字节/腾讯/百度/MiniMax/阶跃 + 讯飞商汤边界结论）。
  - research/43：国际 5 厂 19 模型（OpenAI/Anthropic/Google/xAI/Mistral），跨阵营 6 族归类。
  - research/41：**参数有效性实测**——官方端点真生效（233→358 / 78→278 / 104→546 / 非法 400）；失效在我方桥（自伤）+9router 层；**非自证预言**（35 探针直连 9router 不经我桥），但 35/37 结论被过度外推。
- **裁决 v3**（ad9c71c，supersede s100 §2.3 与 s99 §3.1 的 thinking 部分）。
- **六切片**：W1 停自伤 / W2 官方预置表 71 条 / W3 字段级用户可修正 / W4 家族降级+顶栏官方驱动 / W5 QA 全量+iat23 / W6 恢复官方默认入口。
- **用户侧清单**：docs/user-side-9router-effort-passthrough.md（9router 两处修复项，不阻塞）。

## 关键新事实（防重查）

1. **官方端点参数真生效**——「glm 参数通道死透」是两层实现问题（我方 :3138 无条件删 + 9router zai 键族错配），非模型能力。
2. 预置必须**逐模型来自官方文档**，默认档五种并存（max/xhigh/high/medium/off），维度（context/模态/档位）官方全有真值。
3. 同模型**跨平台能力不同**（阶跃原生 vs 百炼、MiniMax OpenAI 面 vs Anthropic 面）→ 匹配键必须 `(host, model)` 二元组。
4. 官方普遍以**同模型参数**表达深浅；「换模型」仅百度/腾讯有独立模型名对举（仍属两套模型名，非"深度=换模型"语义）。
5. pc v1.122 健康 daemon `status` 恒 `Launching`（判活用 `is_running`）。
6. 9router 是**中转**，不是能力真相来源——研究模型能力只认厂商官方文档。

## 留痕

- commit：ad9c71c(裁决+四研究)/58b3c0e(W1)/6e0ddf3(W2)/cd3d6c7(W3)/c93e260(W4)/824a674(W6)+本 docs——本地未 push。
- 测试包：iat23（sha256 f2fc5f90…）不入发布序；证据 tmp/qa-s101-review.md、tmp/s101-*-redgreen/。
- 遗留：9router 侧两项（用户侧）；dev 树 caps 残留 W1 前 user 标记（显示用户旧改动，出厂取官方）；P4 两项留档；W3 遗留 thinking.keys 写侧仅实现 reasoning_effort/output_config 两族（表已声明四族，扩写器接上即通）。
- 环境终态：dev 栈 healthz 200；C:\PF-TEST 空。
