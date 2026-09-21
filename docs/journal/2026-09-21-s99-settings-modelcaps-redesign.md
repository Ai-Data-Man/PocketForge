# s99 会话：设置左导航 + 模型能力体系重设计（2026-09-21）

用户两主线：①设置模块多分类线性滚动一个视窗劣质 → 左侧分类标签页（ZCode 参考图）；②模型能力配置/深度思考挡位文案视觉垃圾 + 预设 9router + 「模型替换」垃圾设计 → 病根=没体系化梳理模型 API 规范到 goose 的映射、没先抽象再翻译给小白。主线3：同族问题统一盘点。

## 流程（闲时章程全循环：找活→派活→验收→留痕）

- **环境事故+修复**：自定义子智能体角色（~/.zcode/agents/pf-*.md 带 `model:` 钉死 custom provider）派发报 `reasoning-level-missing` 全灭；修复=删 model 钉死行（继承会话模型，备份 .bak-s99 留在原目录）；降级通道验证=general-purpose 承载人设内联派发。
- **PM 裁决** 5164004 docs/verdicts/2026-09-21-settings-model-caps-redesign.md；研究员事实底稿 tmp/s99-redesign-factbase.md（21 探针锚点图+caps 15+5 消费方+出厂字面值五消费方+首启链静态推演）。
- **工程四切片**（热区串行）+ **QA 首审判返工**（tmp/qa-s99-review.md）+ **返工 5ce50e9** + **QA 复验通过** + **iat20b 从零验证 PASS**。全绿基线与细节见 STATE.md 顶部行。

## 关键裁决/发现（新事实，防重查）

1. **批评点1 归约**：不是缺左导航，是三信息域共一个弹窗级滚动容器——修滚动归属与域边界（S1）。
2. **消费面裁剪判据立规**（设计B核心）：能力字段只有存在机制消费面（影响某条请求/某 UI 行为）才允许进用户面；ZCode 的 max_tokens/输入类型/能力复选/推理参数映射**不搬**（无消费面=假把式新一轮）。
3. **「模型替换」重设计**：机制（llmproxy 家族翻译）保留，呈现改「给它配一个深档」能力归属框架；措辞禁令全用户面（含手册/welcome）清零机制内幕词。
4. **forge-router.json=随每个出厂包发行的硬编码 9router 预设**（package.sh 从不剔它，package rm 行已补目录级防再犯）——「预设9router」的出厂实体，git rm。
5. **出厂空态定案**（沙盒臂A 19/19）：goose 空模型无崩溃环（ACP initialized model 空串）；首启=黄条 key-guide 指引非红条误诊；F-11 字面自愈与新空值无交集、逐字保留。
6. **QA P1=caps 镜像帧→页断裂**（s98 1874b94 引入）：桥嵌 list[].caps 页读帧级 m.caps 恒 {}；既有探针全桩绕过=系统性假绿。修=页侧合并+capeditor-probe 活体臂（真桥真 WS 帧）44→64。**教训：凡「帧→页」数据通道必须有一条活体探针，桩探针只验逻辑不验链路。**
7. **think-grad 预存红 RCA**（tmp/s99-thinkgrad-red-rca.md）：探针期望过时非产品缺陷（1874b94/72350ca 有意变更未随迁+验证清单漏跑）；**流程改进：触桥批必跑清单纳入 think-grad-probe**。
8. iat20b 挡位翻译终证：mock 上游实收 model=glm-5.3（深）/glm-5.3-flash（快），别名零泄漏。

## 留痕清单

- commit：5164004(verdict)/8d9520c(S1)/87dcea8(S2)/a700c96(S3)/818fd40(S4)/5ce50e9(qa-rework)+本文档——本地未 push（闲时批次协调惯例）。
- 测试包：dist/*iat20a.zip（sha256 55769aa5…）/​*iat20b.zip（sha256 559dcc7f…）不入发布序。
- tmp 资产（gitignored）：s99-redesign-factbase / s99-thinkgrad-red-rca / qa-s99-review(+复验节) / s99-iat20b-probe / capeditor-probe(64ck 活体臂+P4-9 自清) / think-grad-probe(随迁 19ck) / s99-s1-nav-probe(25ck) / rework-s99-gui-probe / qa-s99-rework-replay。
- 遗留与触发器：见 STATE.md 顶部行「盘点遗留」节（P3 深侧开态预选空、MCP 技术区折叠后续批、两条挂起、welcome 首启物化边界、e2e 瞬时抖动观察项）。
- 环境终态：dev 栈 PFdrill2 healthz 200；C:\PF-TEST 空；~/.zcode/agents/*.bak-s99 角色文件备份（model 钉死行删除的回滚位）。
