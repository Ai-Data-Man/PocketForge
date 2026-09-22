# s100 会话：能力设置重做 v2（ZCode 研究驱动）+ 出厂首启 pg Skipped 根治（2026-09-22/23）

## 触发（用户两批评，实时输入）

1. 「深档用哪个模型」=假需求——正常人谁会把思考深度设置等同于换模型；能力设置从功能需求站不住脚；**zcode 已开源，研究下再说设计；没有研究调查的设计纯属盲动**。
2. 三新批评：点能力 inline 下方展开=反人类；长列表添加模型放池尾=蛋疼；模型列表无搜索。

## 流程（研究 → 裁决 → 工程 → QA → 出厂复验 → 新 P2 根治）

- **研究先行**（docs/research/38，VERIFIED-RUN）：ZCode 本机安装包三面互证（`%LOCALAPPDATA%\Programs\ZCode` app.asar 解包 IntlProvider bundle 全量中文文案 504 条 + glm/zcode.cjs CLI 求值侧 + 用户真实 `~/.zcode/v2/provider_config.json`）。
  - schema=`properties{contextWindow,inputFormat,supportsJsonSchemaOutput}`+`optionSpecs{maxOutputTokens, reasoningLevel:{values 有序档位, map CEL→请求字段合并}}`；智能配置=云端推荐按项转手动；档位校验 `values.includes` 抛 "Unsupported reasoning effort"。
  - **负验证：ZCode 全库 0 处换模型形态**——「深档用哪个模型」系 PocketForge 自造假需求（代码级实锤）。
- **经验固化**（用户点名）：AGENTS §9（研究出处节/负验证/一句话推翻=过门/机制默认不进配置面）+ dev-lessons #30 + 记忆 feedback-no-research-no-design。
- **裁决** 4fc8b00（supersede s99 §3.3/3.4/#7；§3.1 消费面判据与设计A/3.6 维持）→ 工程 51b38c8（T1 弹窗化+删三选 / T2 池头搜索添加+caps v2+variant/mode 桥自管门）。
- **QA 首审抓 P2**：档位 chips=零消费方假旋钮（裁决书自身违消费面判据）→ 返工 71a0318（只读信息行三态+逃生口+thinking 用户写关）+修订节 a194585 自罚 + P3-4 levels 孤儿写关 601adbc（主控亲手，红臂实证）。**QA 复验通过**（12 套件独立绿+红臂区分力+原推翻句不可构造）。
- **出厂复验**：iat21（51b38c8 态，sha256 e7798661…）→ 终态 **iat22**（sha256 473b7a2c…，A-F 全绿；Z2 零出站断言误报复核=本机 BtSoft 服务，真出站 0）。
- **iat22 挖出 P2：出厂首启 postgres 永久 Skipped（3/3）**→ **research/39 单变量定案**：根因=fc5464a（s98/R2 沉降早退收窄阻塞集）→converge 在 initdb 在飞时 taskkill 杀 pg-init(exit=1)→pc wontRun 永久 Skipped；臂2 跳 converge=pg Running；v0.9.15 正式包不含 R2 未流出；iat18 曾把该态误判正常（判卷口径已禁）。
- **修法 A d2b524b**：layer1 pg-init 单键特判终态+layer2 补跑名单加 pg（is_running 判据）+backup 文案分流。沙盒绿 3/3×9/9+红 3/3×7/7；**QA 终审通过**（P1-P3 零，P4×4 留档）。

## 关键新事实（防重查）

1. ZCode 模型配置=「元数据 properties + 选项规格 optionSpecs（档位集+CEL 映射）」；档位是会话概念、映射是翻译层、模型配对不存在。
2. pc v1.122 健康 daemon `status` 恒 `Launching`（判活用 `is_running`）；Skipped 的 exit=1 系 pc 合成，进程从未 spawn。
3. `pc project update` 全表重启按 Go map 随机序杀 oneshot——同场景 1/6 轮自愈（pg-init 先 update 则好），5/6 终态 Skipped。
4. pg-init.log 720B 截断真因=update 杀 initdb 丢 CRT 缓冲尾（非 pc 管道/未写）。
5. iat 系探针判卷新口径：**pg Skipped 不得归一为正常首启态**。

## 留痕

- commit：4fc8b00(verdict+research38+AGENTS§9+lesson30)/51b38c8(T1+T2)/71a0318(QA-P2)/a194585(修订节)/601adbc(P3-4)/d2b524b(pg 修+research39)+本 docs——本地未 push。
- 测试包：dist iat21/iat22 不入发布序；证据 tmp/qa-s100/、tmp/rca39/、tmp/s100p34-redgreen/（gitignored）。
- 遗留：pg 上游竞态本体+goose-scheduler 同族 daemon Skipped 风险（research/39 §4.2，挂后续批）；backup 分流双向窄窗 P4；dev pg restarts=3 达上限（整栈重启清零）；levels 重新立项触发器见裁决修订节。
- 环境终态：dev 栈 healthz 200（nats/bridge/pc PID 逐字未漂）；C:\PF-TEST 空。
