# s102 会话：闲时自主——W3 扩写器+预置表全量审计+goose-scheduler 同族根治+v0.9.16 发布（2026-09-25）

## 触发

闲时章程拉起。读 idle-protocol → STATE → AGENTS → s101 journal，无 [idle-ready]，栈健康。
尾段用户令：「fix 完，最后按记忆发个 release」。

## 做了什么（为什么）

1. **W3 扩写器**（s101 遗留）：THINK_KEY_WRITERS 补族。两族实现（enable_thinking/EnableThinking，官方机读表依据）；五族有据不实现（thinking 值形态跨厂分裂必 400 某厂/thinking_budget 缺换算依据/reasoning=Responses API 面/thinkingConfig 走兼容面官方键=reasoning_effort 安全回落/thinking_strategy 策略键非深度档）——诚实降级+回落语义修复（声明键全未实现=落空不发，消错发窗口）。P4-1 空 patch 拒收顺带。
2. **预置表全量审计**（QA 71 条逐位对底稿，补 s101 抽检 16 条的死角）：P2×3/P3×6/P4×9。P2 全修=①#7 正则集合错（glm-5 失覆盖/不存在的 glm-5.5 误覆盖）②claude 默关族 default high→null（原值运行时把官方默认关思考的模型默认打开）③normalizeEffort 别名先于成员检查（38 条原生档被改值/丢弃，qwen3.8 选轻档静默得重档最重→改域内值优先）。卫生批=P3 五项+P4 四项+4 新条目（71→75）+配置钮 title。
3. **goose-scheduler Skipped 同族根治**（research/39 §4.2 敞口）：研究员源码级定案（healthy 闩锁一次性、最小正确集=带 depends_on 的 daemon 全体、StartProcess 幂等）→ daemon 补跑组 {pg,goose-scheduler} 三处 -contains 单一真相源 → **沙盒三臂 PASS**（R1 3/3 复现 iat18 形态/G1 3/3 救回含 Skipped→Pending→Launching 弧线/N1 常态）→ b08d526 旗标收窄终态集（N1 🟡 converge 窗 Pending 误旗标噪音，救回路径证据不受影响）。
4. **QA 批审 REWORK→PASS**：P2-1 off/none 对布尔门族被值域门吞成「显式开+最低档」（工程 21 断言全绿下的真红——两探针臂恰好都落在缺陷象限外；QA 真桥新向量+跨模型习惯记账路径逮住）+P3-1 拒收门键级→字段级。返工=thinkOffViaGate 象限+writeThinkKeys 三消费点统一+对照组零回归；复验 PASS（QA 自有仪器 53 断言+14 项独立攻击零新红）。
5. **手册同步**（思考档位主形态=官方档位下拉+配置弹窗/三态标注/恢复官方默认引导）；用户侧 9router effort 透传已修记账（fork 3ed55d53/v0.5.81，与 AI 栈记忆交叉验证一致）。
6. **v0.9.16 发布**（用户令）：说明 docs/v0.9.16-release-notes.md+VERSION+发布门+tag/release 全流程（见尾段）。

## 关键新事实（防重查）

1. thinking 族值形态跨厂分裂（GLM=enabled 强制/K2.6=enabled|disabled/K2.7 仅 {enabled,keep:all}/MiniMax=adaptive|disabled/豆包含 auto）——表 keys 不带子形态，统一 writer 必 400 某厂；要支持需表 schema 携带子形态。
2. W1_EFFORT_ALIASES 的教训：别名表必须在**值域 membership 之后**应用（域内原生档直接放行）——否则原生档选择被改值（本次 P2-③ 根因）。
3. off/none 的表达通道按族分流：levels 含 none → reasoning_effort=none；布尔门族（off_supported=true ∧ keys 含 enable_thinking/EnableThinking）→ 只发布尔 false；其余就近收敛（现值域门语义）。
4. pc healthy 型 depends_on 挂起是一次性闩锁：闩 pre-Ready 且随后被杀的 faucet 实例才 Skipped（iat18 精确交错 UNVERIFIED 但重构链自洽）；带 depends_on 的 daemon 全体={pg,goose-scheduler} 收口即闭包（无 depends_on 者结构性免疫）。
5. pc readiness_probe 自定义命令默认 timeout_seconds=1s——延迟旋钮必须同时补 timeout_seconds（三臂首轮实录，配方缺陷）。
6. 预置表审计方法：抽检盖不住转录/集合类缺陷（本次 6 处底稿外/矛盾条目全在抽检样本外）；全量 schema 断言+逐位对底稿才是完整覆盖（w2-preset 已加新条目断言防漂移）。
7. gh CLI 不在环境；PAT 在 zcode db part 表（全库唯一 github_pat_，len 93），用后经环境变量直传不落文件。

## 留痕

- commit：285fc3e(用户侧记账)/dee08f1(手册)/af5d4ff(sched 组)/4d9f3f3(W3)/7ea9fa4(P4-1)/15b87b4(审计 P2)/e107527+6bd42c6(卫生)/da687af(QA 返工)/b08d526(旗标收窄)+发布序（VERSION/说明/STATE/本 journal+发布落账）——**随 v0.9.16 一并 push**（用户发版令覆盖闲时不推边界）。
- 报告：tmp/s102-sched-rca.md（sched 取证）/tmp/s102-preset-audit.md（表审计）/tmp/qa-s102-review.md（批审+复验）/tmp/s102-sched-arms/report.md（三臂）/tmp/s102-*/（各批探针 log）。
- 测试包：iat24（sha 124c17c1…，G1/N1 用）不入发布序。
- 遗留：审计 P4 未选项+QA R1-R5+工程三项（qwen3.8 max→xhigh 换算表=表 schema 升级/thinking 族子形态 schema/off 表达通用化）——STATE 顶行留档。
- 基线：e2e 62/62+fuzz 225/225+ui 56+ia 34+sem 38+capeditor 141+modelcaps 43+w2-preset 15+think 35+think-grad 27+proxythink 30+xlate 10+w1-effort 14+s102-redgreen 28+qa-s102r 53。

## v0.9.16 发布记录（尾段）

- 发版门：最终包全新解压冷装冒烟（cold-surface 全绿+新面 spot-check）——结果见发布落账 commit。
- 发布：tag v0.9.16+branch push → tools/release.sh（精修正文 RELEASE_NOTES_FILE=docs/v0.9.16-release-notes.md）双资产上传 → API 下载对账+releases/latest 核对 → dev 栈恢复+环境终态。尖峰检测：exe 哈希 vs v0.9.15 全一致（脚本自动核对，发布说明 EDR 段）。
