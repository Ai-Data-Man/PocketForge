# 裁决书：permission.yaml 追踪待遇——停追踪运行时副本，首启种子显式化（s76 遗留⑥）

- 日期：2026-09-08 ｜ 裁决人：pf-pm ｜ 输入：STATE s76 遗留⑥（qa s76b P3-C）、s69 遗留⑦、AGENTS.md §3.5、research/12 §3.3、update-runner.js:63-70+258-297、package.sh:24-34、bootstrap.ps1 全文、cold-surface-probe ④、git log 追认史、本裁决新增取证（§0 标注）
- 结论先行：**选 (a)**——停止追踪运行时副本，新增 `conf/templates/permission.tpl.yaml` 为真相源，bootstrap 首启种子（copy-if-missing，**不**逐启重写），package.sh 剥离。(b) 现状否决，(c) 否决（主痛点不治，且其升级免疫收益被 (a) 天然包含）。
- 约束重申：bootstrap 首启种子语义不破坏（新装首启三键齐写，缺键 panic 家族不变）；零二开 goose；最小 diff；本裁决只落文档，代码/配置改动由工程师按 §3 执行。

## 0. 事实核验（区分事实/假设）

| 断言 | 状态 | 依据 |
|---|---|---|
| permission.yaml 被追踪；4 天内 4 次运行时追认提交（4b1e999 s69→e3c910f s75→375d2c5+b10b5af s76b），最近一夜 2 次 | 事实 | `git log -- forge/conf/goose/config/permission.yaml` |
| **bootstrap.ps1 现在不种 permission.yaml**（177 行全文无 permission）；「首启种子」实际=被追踪的运行时副本随包直发 | 事实（新增取证） | bootstrap.ps1 全文；package.sh:28 只剥 config.yaml 与 memory/，permission.yaml 进包 |
| update-runner 差量会**删盘上「包不含」的文件**；config.yaml 契约「包不含→差量判 deleted→bootstrap 重建」已在代码注释成文 | 事实（新增取证） | update-runner.js:63-66（注释）+258-297（deleted 判定与执行） |
| permission.yaml 不在 PROTECTED（update-runner.js:68）；升级覆盖风险当下存在但从未发作（内容=种子，goose 启动会再规范化收敛） | 事实 | update-runner.js:68；s69 遗留⑦ |
| **goose 对 permission.yaml 有真实回写**且内容非纯排序（e3c910f：goose 自写 memory__retrieve_memories 入 ask_before）；research/12 §3.3 标注 smart_approve 段=judge 缓存语义 → 回写内容可能含运行状态 | 事实+假设（回写语义未完全考证，标注） | research/12 §3.3；git log e3c910f |
| 缺键即 panic 实锤（crash-loop 一次）；**缺整个文件的行为 UNVERIFIED**（只证过缺键） | 部分 | research/12 §3.3（s69 S-A 补记②） |
| 无 UI/桥写 permission.yaml；唯一写者=goose 运行时+开发手改 | 事实 | grep chat-bridge.tpl.js/chat.tpl.html 仅有读侧与统计字段 |
| bootstrap 由 `启动数字员工.cmd:8` 调用，dev 与目标机同源 → copy-if-missing 两端一并生效 | 事实（新增取证） | forge/启动数字员工.cmd:8；dev-stack-up.log 显示 dev 同用 forge/ 启动流 |
| cold-surface-probe ④ 对目标树 `conf/goose/config/permission.yaml` 断言 user 三键+never_allow，运行于冷启后（bootstrap 已跑） | 事实 | tools/e2e/cold-surface-probe.js:135-139；probe.sh 前置说明 |
| .gitignore 已有「运行时生成的 conf 文件不入库」先例（ports.env.yaml、conf/goose/config/memory/） | 事实 | .gitignore:14-24 |

## 1. 归约与三问

三次为什么：
1. 为什么处理这个文件？→ 它是被 git 追踪的运行时演化物，goose 每次启动都可能改写它，开发工作树反复变脏。
2. 为什么这是真痛不是洁癖？→ 4 天 4 次被迫追认提交（最近一夜 2 次）；每次追认都是一次「忘掉则下次有意手改与运行时噪声混进同一 diff」的审查风险；STATE 已连续两个会话为此挂遗留项。
3. 为什么解法是「停追踪+显式种子」而不是「管住 goose」？→ goose 是黑盒零二开红线，其规范化/回写行为不可关闭；而「运行时副本不该入库」是本项目已裁决过的同类问题（config.yaml：模板=真相源+打包剥离+升级不覆盖），permission.yaml 与它同题同解，只差一处：**permission.yaml 的回写可能带状态（judge 缓存语义），所以种子必须 copy-if-missing，不能像 config.yaml 逐启重写**。

问题陈述：开发者与自动化在每个跑过 goose 栈的会话结束后，都要人肉执行「查 status→发现脏→追认提交」仪式；不做的代价=diff 污染+审查噪声+漏检风险，已发生 4 次。目标机不受 git 影响，但升级覆盖隐患与 s69 遗留①（config.yaml 丢失）同族，属同一裁决应一并关闭的面。

三问回答：
- 用户（开发者/自动化/护航者）何时遇到？每个运行 goose 栈的 dev 会话收尾时（已实证 4 次/4 天）；护航者首次会在升级路径复核时遇到覆盖问题（尚未发作）。
- 不解决怎么死磕？继续追认提交仪式，靠记性与 STATE 遗留项提醒；死磕成本=每次会话尾的固定税+漏检时被污染的 diff。
- 做错的代价？错在「只删不种」→ 新装首启文件缺失/缺键，goose panic crash-loop（e5a2f4a 实锤家族）；错在「逐启重写」→ 若回写确含 judge 缓存，每启清缓存=权限卡重问风暴，直接伤妻子侧体验。本方案对两点分别以「种子+copy-if-missing」与「不覆盖」规避。

## 2. 候选裁决

### (a) 停追踪运行时副本+模板种子显式化：✅ 裁决
- **真相源**：新建 `conf/templates/permission.tpl.yaml`（内容=当前 b10b5af 追认版逐字节拷贝，无占位符）。模板即首启种子，与 gen-xlsx/vision「真相源入库」先例同构——此前种子寄居在被追踪的运行时副本里，是本缺陷的根：一个文件被迫同时扮演「运行时状态」与「新装种子」两个角色，git 只能全或无地对待它。
- **bootstrap 首启种子（copy-if-missing，不逐启重写）**：与 config.yaml（逐启重写+merge）与 .goosehints（逐启覆盖）刻意不同——goose 回写语义未完全考证（§0 第 5 行），逐启重写会清掉可能带状态的回写内容；copy-if-missing 精确满足约束原文「新装机器第一次启动就要有正确的 permission.yaml」，且 dev 新 clone 同收益（同一启动器）。
- **打包剥离**：permission.yaml 出包后，升级差量判 deleted 删盘→bootstrap 首启重建——这正是 update-runner.js:63-66 已成文的 config.yaml/.goosehints 契约，零新机制；同时 (c) 想要的「升级不覆盖运行时副本」被天然包含（包不含=永不覆盖）。
- **git 侧**：`git rm --cached` + .gitignore。追认史的历史价值（规范化发现、三键 panic、G1/G5 前缀核查）已沉淀 research/12 与 STATE，不依赖未来继续积累；「goose 改了什么」的可见性降级为按需 `git diff --no-index conf/templates/permission.tpl.yaml forge/conf/goose/config/permission.yaml`，并挂起项③转为升级必查清单一行。

### (b) 继续追踪+每次追认（现状）：⛔ 否决
持续脏树是主痛点本身；追认提交是税不是机制（无成功指标、无观察窗口，只有重复劳动）；已实证 4 次/4 天且随 goose 行为变化频率波动。

### (c) PROTECTED 化+继续追踪：⛔ 否决
只治升级覆盖（未发作），不治脏树（每天发作）；且 (a) 落地后包不含 permission.yaml，PROTECTED 对它失去作用对象。PROTECTED 化转入挂起项①（带触发器，防 judge 缓存在升级删盘+重建中丢失）。

### (d) 其他形态归约记录：均否决
- `skip-worktree/assume-unchanged`：隐藏状态，上游一改文件即 checkout/pull 陷阱；库内副本冻结腐化为假种子。
- git clean/smudge filter 抹平 goose 规范化：等于在 git 里复刻 goose 序列化器，跨升级脆弱，触碰零二开红线邻域。
- 只剥包不停追踪：升级面治了，脏树主痛点原样保留。

## 3. 实现要点（工程师执行清单；本裁决未改任何代码/配置）

1. `git rm --cached forge/conf/goose/config/permission.yaml`（保留磁盘副本，dev 栈不中断）。
2. 新建 `forge/conf/templates/permission.tpl.yaml`：内容=现磁盘副本（b10b5af 版）逐字节拷贝，无占位符；文件头加一行注释「首启种子；goose 运行时会规范化/回写，回写语义见 research/12 §3.3」。
3. `.gitignore` 增一行 `forge/conf/goose/config/permission.yaml`（落于 :24 `forge/conf/goose/config/memory/` 同组）。
4. `forge/conf/bootstrap.ps1` 新增 1b-7 段（建议放 1b-2 .goosehints 段旁，同族「模板→config 目录」物化）：`Test-Path` 守卫的 copy-if-missing；注释必须写明「不逐启重写：goose 回写可能含 judge 缓存，语义未完全考证」。
5. `tools/package.sh:28` 的 rm 清单追加 `"$TMP/forge-pkg/conf/goose/config/permission.yaml"`（与 config.yaml 并列；该行已是多路径续行格式，原地追加）。
6. update-runner.js **不动**：PROTECTED 不加；「包不含→差量删→bootstrap 重建」契约已由 ：63-66 成文覆盖。
7. 留痕随实现批做：STATE s76 遗留⑥ 销账+journal 记录；research/12 §3.3 补「缺整个文件行为」考证结果（见 §5 挂起②）。

## 4. 验收标准

1. `git ls-files | grep permission.yaml` 为空；`.gitignore` 含该路径；磁盘文件仍在且 dev 栈无感（不重启即继续可用）。
2. 模板内容与 b10b5af 版逐字节一致（`git show b10b5af:forge/conf/goose/config/permission.yaml` vs 模板 diff 为空）。
3. 新装冷启（沙盒）：解压包→启动→bootstrap 后 `conf/goose/config/permission.yaml` 存在且三键齐写→goose 无 panic→cold-surface-probe 15/15（含 ④ 三键+browser_run_code_unsafe never_allow）。
4. 打包守卫：产物 zip 内**无** `conf/goose/config/permission.yaml`、**有** `conf/templates/permission.tpl.yaml`。
5. 升级路径：由旧包（含 permission.yaml）升级到 (a) 后首版，update-runner 差量判 deleted 删盘→bootstrap 重建→goose 正常→probe 过；此后各版升级该文件不在差量内=零触碰（一次性过渡，发布说明沿用既有「升级前手动备份 conf/goose/config/」步骤即可，无需新增）。
6. 脏树终验：连续两个运行 goose 栈的 dev 会话收尾，`git status --porcelain` 无 permission.yaml 条目。

## 5. 挂起项

1. **PROTECTED 化 permission.yaml**：触发器=升级后权限卡重问明显增多（judge 缓存重置实证伤用户）或 goose 升级改变回写语义；在此之前升级删盘+首启重建的一次性缓存清空可接受。
2. **goose「缺整个文件」行为考证**（缺键 panic 已实锤，缺文件 UNVERIFIED）：工程师实现时顺手考证（改名→启动→观察→复原），结果回填 research/12 §3.3；若 goose 缺文件会自建默认，风险面进一步收窄。
3. **模板漂移巡检**：升级必查清单（STATE s69 升级段）加一行「diff 模板 vs 运行时副本」；goose 回写出的有意义新增（如新扩展工具入 ask_before）由工程师评审后回灌模板——评审制追认，替代 git 噪声追认。
4. **逐启重写（config.yaml 同款）永久搁置**，除非挂起②考证确认 goose 回写内容无状态价值。

## 6. 取舍明示

选 (a) 即对「git 历史里持续可见 goose 回写轨迹」说不——用 `git diff --no-index`+升级清单巡检替代，历史语义已沉淀 research/12；对 (b) 说是以自动化负担与审查噪声为代价，拒绝；对 (c) 说是以「治未发作的升级覆盖、放任每天发作的脏树」为代价，拒绝。信息架构检查：本裁决是同一问题（运行时演化 conf 文件）的第二次个案处理（第一次 config.yaml），按 AGENTS.md 关键规则 4 已核对是否需要重组——当前仅两例、机制同族已共用（模板+剥离+bootstrap 重建），不新建抽象；若出现第三例（如 custom_providers 出现运行时回写）再议统一框架。

## 勘误 2026-09-08（qa 对 54ec3a3 审查 P2-1 实测复核后追加；上文为裁决原文，不改写）

- **§2(a)「包不含=永不覆盖」有误**：update-runner 的 deleted 判定=「盘上有、新包无」（update-runner.js 主流程对 curMap 逐项查 newMap，不在即 deleted）。package.sh 剥离是每次打包都执行，故仅按 (a) 落地时**每次升级**都会把 permission.yaml 判 deleted 删盘→bootstrap 重建→judge 缓存每次升级清空一次。(a) 并不「天然包含 (c) 的升级免疫」，恰恰命中 (c) 要治的病。
- **§4.5「一次性过渡」有误**：同理，不存在「此后各版升级该文件不在差量内=零触碰」——剥离持续发生，删盘+重建会随每次升级重复。
- **§5.1 挂起项①（PROTECTED 化）已采纳落地**：`conf/goose/config/permission.yaml` 已入 update-runner PROTECTED 清单（文件路径式条目，同 config.yaml 形态；isProtected 对单文件走精确匹配分支）——差量 added/applied 与 deleted 两轮循环均 `continue`，该文件升级永不删改。触发器不再等待「权限卡重问增多」，qa P2-1 直接兑现。语义定版：permission.yaml=用户运行时状态，升级永不删改；bootstrap 只管新装首种（1b-7 copy-if-missing 不变）。
