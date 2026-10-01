# s107 闲时会话：从零安装反复全观测轮（2026-10-02）

章程拉起；主控全程。主线=用户方向②：对已有功能做反复从零安装测试，全观测（浏览器控制台/日志）猎捕缺陷逐一修复。测试模型 glm-5.3-flash（9router，host 用 dev 树同源 111.228.54.166:20128）。

## 一、冷启动与前置

- 对表：git 账实相符（s106 尾 5 commit 已推，此前「已 push」声称为分支误比 origin/main 的虚警）；dev 栈 healthz 200；junction 归 dev 树（s106 遗留核对项关账）。
- iat116 打包：sha256=bd406357… 与 iat115 逐位一致（其后 5 commit 全 docs）——构建确定性再证。
- 9router 探活：/models 143 条，glm-5.3-flash 在列；127.0.0.1:20128 本轮挂起（CLOSE_WAIT）禁用，走公网 host。

## 二、Round-A 净冷装全观测（C:\PF-TEST\s107a，iat116）

全判卷面与缺陷台账：tmp/s107-roundA-findings.md。要点：

- 主线链全绿：冷启 10s/黄条/5 chip 单份/配流 143 拉取/顶栏当帧/首回合忙碌条两阶段+答案正确/思考面板+消息尾回放入场/回放一致。
- B 面全绿：批删三连 confirm+UTC 当日诚实拒绝 banner（s106/1.2 出厂保持）/记忆 permcard+落库/🧠八 tab 母句/上传双形态回执（成功汇总+CON.txt 逐项拒因）/⚙️三分类/能力编辑器官方档面/报表两问向导（CSV 进选择器）。
- 控制台零 JS 错误零产品 warn（唯一 verbose=Chromium 密码框建议；/api/upload 400=network 固有噪音）；llmproxy 18 轮全 200；events.log 零坏行；pc.log respawn=0。
- 勘误翻案：A3「reload 保持会话」=探针靶窗混乱误读；真行为=每次页面加载 subscribe(null) 开新会话（既有设计，R-B-P4-2 种子家族在 backlog）；P3-3 无再现销案。

## 三、缺陷与修复

| # | 级 | 缺陷 | 处置 |
|---|---|---|---|
| 1 | P3 | 工作区/文件树删除与改名**失败臂** 7 处 alert()——s106/S1 只迁了成功臂 | f1=034bf13：7 处 alert→addErr 消息流；桩页红绿 10红/5绿→15/15+CDP 真页红绿+ui-logic 168 |
| 1b | P3 | 同族创建/打开/引入失败臂 7 处（8 实例）——同面板不同通道不一致+孪生不对称 | f1b=0c79693：同款迁移；红绿 11红/8绿→19/19；弹窗内 in-context 族按 s106 裁决明确不动 |
| 2 | P2 | 默认 smart_approve 下报表向导 happy path 首步撞权限卡超时墙（单任务 7 卡 6 超时实录；@ 引用同族摩擦=纯路径文本） | 研究在飞（read 工具档位）→待裁决 |
| 3 | P3→定案 | junction 沙盒停后停指沙盒、PFdrill2 重启不自愈——**根因定案 VERIFIED-RUN：任务链以 forge-sbx 账户跑**（drill-devrel.log 实证），自愈的是 forge-sbx 的 junction；Administrator 的只能运营守则兜底 | f3=守卫三态日志行+保守留置态红字 WARNING（可观测性）；s106 UNVERIFIED 疑点销案 |

回归（f1+f1b 合并树 0c79693）：e2e-chat 62/62 + fuzz 225/225 + ui-logic 168/168。iat117=3209767e…（含 f1/f1b）。

## 四、Round-B 升级路径轮（s107b，官方 v0.9.17 基→iat117）

任务书 tmp/s107-roundB-taskbook.md；证据 tmp/s107b-u1.json / s107b-u3u6.json / s107b-pre-upgrade.sha。

- U1 基座：冷启 10s；配流 143；1 轮真会话答案正确；**基座顶栏「未设置」实录**（s104/R1-F2 修晚于 v0.9.17 发布=升级差量锚）。
- U2 升级：update-runner 差量语义（data/ 永触）→robocopy 模拟 /XD data，14 文件净差落地。
- U3 双判据：providers.json sha **逐字节保持**；会话内容保持+**「它当时怎么想的 ▸」随升级出现**（s105 思考回放差量锚活体）+**顶栏当帧修复生效**（「未设置」→「自家中转 · glm-5.3-flash」）。sessions.db 文件级 hash 变化=新启写入（UI 判内容保持成立）。
- U4 修复面：文件级断言（s107b 树 12 处 addErr 字面+bootstrap 守卫日志行在场）；行为证据=工程师 CDP 真页红绿（同模板字节）。我方 U4 UI 驱动打偏两次（all-list 对活跃 ws 无删除钮=设计内；建文件确认=native prompt 非 DOM 钮）——教训记入。
- U5 升级窗格 v0.9.17 在场（relTime null=robocopy 模拟不走 update-runner 不写升级史，非缺陷）。
- U6：respawn=0 零 FATAL；events.log 13 行零坏行。

## 五、Round-C 净装 iat117 冒烟（s107c）

- 冷启 10s；配流 143 顶栏当帧；**f1b 保留名活体亲测**：native prompt 填 `con`→消息流「⚠ 没建成：这个名字是 Windows 保留的，换一个吧」**零 alert**（promptText 正规打法）；1 轮正确（「四个季节」+思考回放入口）；零控制台错误。
- 清场：PF-TEST 四目录整删零残留；junction 归还 dev 树；dev 栈恢复 200。

## 六、#2 报表权限卡（P2）研究→裁决链

- 研究定案 docs/research/2026-10-02-s107-read-tool-permission.md：goose **无 read 工具**（v1.46/1.50/1.51 三版一致）；smart_approve 分级=read_only 注解确定性放行/无注解 LLM judge/write 注解自动回写 ask_before（种子移出无效）；可行最小修法=产品 MCP 通道挂 read_only 注解只读文件工具。
- PM 裁决 docs/verdicts/2026-10-02-s107-report-permission-readtool.md（在飞）。

## 七、会话收尾

（待补：#2 修复批+终验、环境终态、产出总账）
