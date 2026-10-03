# s108 闲时会话：从零安装全观测第三轮（2026-10-03）

章程拉起；主控全程。主线=用户方向②：反复从零安装测试+全观测猎缺陷逐一修复。测试模型 glm-5.3-flash（本地 9router 127.0.0.1:20128，key=apiKeys 表 hermes-agent 档）。台账 tmp/s108-findings.md。

## 一、环境与轮次

- iat124（3736e8fb≡dist 最新包）净冷装 C:\PF-TEST\s108a；cold-surface **19/19**（pg Ready——s107「pg 全盲」教训正面闭环）。
- Round-D（pg/数据链全观测）：配流零错；🗄️pg 表+R4 人话说明；备份链 pg_dump 真数据（1KB→3KB）+轮转；**f9 pg 停态可见性净装首验**（后端 tblMiss+前端降级句+恢复零残留）；报表 db 源正确。
- Round-E（小应用全生命周期）：agent 建成+注册（forge-meta 建账）→🚀面板→GUI 停止（诚实停注）→**f8 停止脚本真实环境首验两次全端口清零**→重启 10s→memo-web 自动回（F12②）→⏰定时链建卡+面板。
- Round-F（边界猎捕）：空格名/特殊字符/保留名 con/空名/204 长名/空输入连点——全过零 alert 零新缺陷；全天控制台零产品 warn 零 JS 异常。

## 二、缺陷账（四立案）

1. **D-1（P1）中文表名五面静默滤除**：RCA（docs/research/2026-10-03-s108-cjk-tablename-rca.md）+裁决（docs/verdicts/2026-10-03-s108-cjk-tablename.md 侧 A）+工程 f1。
2. **D-2（P2）建库卡墙**：27 卡/5 分钟（faucet MCP 无建库建表工具+hints 教 REST 直写+REST 不热加载三连）；裁决 docs/verdicts/2026-10-03-s108-db-write-path.md（db-create MCP 两工具，27→≤2 卡）。
3. **D-3（P3）技术坐标泄漏**：agent 回复给妻子 faucet 服务名/文件路径/8091/admin；同 D-2 裁决书 hints 人话否定清单。
4. **E-F1（P1）净装首配后首个装应用回合石沉大海**：配流写回 secrets→注册渲染漂移→只换桥→在飞回合零终态；单变量双向实证（漂移=换桥/匹配=PID 不变）；RCA docs/research/2026-10-03-s108-register-bridge-restart-rca.md +裁决 docs/verdicts/2026-10-03-s108-bridge-restart-turn-loss.md（D 双门烧漂移+C 悬空标记补帧+:5387 加门）。

（本节由收尾时补全工程/QA/验证轮终态）

## 三、环境事故（诚实记）

01:35 端口冲突双污染：工程师回归拉起 dev 栈占 8790 与主控沙盒轮互撞（s108b 桥从未服务、H2/H3 打在 dev 树、主控误杀 dev 栈）；Round-H 升级轮作废待重做；流程修正=dev 栈占用期间禁占 8790。副产品观察：双装同机碰撞=第二装聊天窗静默指向第一装（不立项，§8.1 单机单装假设）；v0.9.17 旧停止脚本 pc down 无预算可挂死（f8 价值反证）。

## 四、修复与验证

- **十三修复/工程 commit 全落地**（本地未 push 待收口）：d1=5e72354+0d9c665；d2/d3=fcf2723/efa17c6/4f4bd0b/71af418/9fda04b/6ffe201；ef1=03af523/5a817d1/dfedc3e/b4a6b13（+b280eae docs）。
- **d1 验收**：五臂红绿（tmp/s108-d1/）+§8.2 十二套绿（工程师轮）。
- **d2 验收**：27 卡→**2 卡**、墙钟 5 分钟→30 秒、技术坐标扫描 0 命中、CJK 消费面全亮、热加载断臂（restart 编排进卡内 <5s）+负检查+升级物化臂；三轮实录返工（faucet_* 同会话盲区诚实化+追加模式+description 可省）；证据 tmp/d2-accept-last.json。两处裁决-现实偏离主控追认（tmp/s108-findings.md）。
- **ef1 验收**：红=iat128 复刻 iat124 全形态 10/0；绿=iat129 五臂（converge 5.7s 收敛闭环/核心臂注册零换桥+完整回复/killturn 通知 2007ms≤10s/S9 本体不动/升级臂标记存活零误报）+负检查四项+§8.2（e2e 61/1 当时判瞬时——后 QA 证伪，见下）。
- **QA 合并对抗审判 REWORK**（tmp/qa-s108-review.md）：P1-1=e2e-chat 恒 1F（ef1 漏迁 rescue-guard 桩→61P/1F 两复跑，「十二套全绿」声明与 HEAD 不符）；P2-1=入库探针 ROOT 差一级+驱动引未入库 tmp 探针+沙盒整删致 iat128/129 无处对账；P2-2=同 sid 并发双回合竞态（先完成者无条件清标→后发回合桥死无补帧，窄门复活）；P2-3=spawnForgeConverge 零观察面（rc=4 无 events 行）。正面确认：三裁决边界逐条对照基本全落位+d2 验收抽验吻合+db-create 离线 fuzz 87/0（27 类型混淆+坏行 70KB 不杀+零路径泄漏）+五套复跑与工程师一致（fuzz/ui/ia/capeditor/sem）。
- **返工批 cce2a05（QA REWORK 四项全闭）**：P1-1 rescue-guard vm 桩补 turnInflightMark/Clear 真语义（e2e-chat 62/62 两复跑）；P2-1 入库探针 ROOT 上提+ws-probe 入库+驱动改引（wrapgate 7/0、uiarm 17/0 入库位）；P2-2 清标回合令牌化（三路收口带参只清自己/会话级四路无条件保持/同 sid 覆写原文保持；桩级 48/1→49/0）；P2-3 converge exit 监听+providers_converge_failed{rc} 行+正常路零噪音（新探针 3/2→5/0）。证据 tmp/s108-rework/ 全留。**QA 收口核对终判 PASS**（四项零残留+一条注记=同 sid 后发先完成乱序窄窗属裁决覆写语义固有，记档）。
- **主控终验轮 iat130（1aec54f9，C:\PF-TEST\s108v 净冷装+全新浏览器 profile）**：cold-surface 19/19；**E-F1 核心臂决定性 PASS**——同序列（配流→立刻「搭个小应用」）从 iat124 的「忙碌条 103 秒石沉大海零终态」变为：保存点 converge 照设计换桥一次（age 6s 实证）+**注册全程桥 PID 15028 贯穿零换桥**+回合完整交付+回复零技术坐标（「设置面板的应用页…点打开看看」）；**D-2 臂 PASS**——「记一张表」4 卡（2 真同意卡=db create service/table，todo×2=已录噪音家族；对照 iat124 同任务 27 卡）+墙钟 ~25 秒；**D-1 臂 PASS**——🗄️面板中文库名「家庭记账」+中文表「日常花销」+建账人话说明全亮；f8 停栈 7 口全清。**V-1 新发现（已修）**：保存点 converge 跳过 hotRestartProvider→前端缺 model_set 帧→首配保存后顶栏常显「未设置」（reload 自愈、功能正常）——s108/ef1 新回归（s104/R1-F2 同族）。

- **V-1 修复 e248b3f**（providers 帧随行活跃档 model〔actKv 空安全写法〕+页侧非空才喂 lastKnownModel；红绿 tmp/s108-v1/redgreen.js 8/8+e2e 62/ui 168/fuzz 225 三套绿）→**iat131=3100a6e 终门活体闭环（s108w 净冷装+新 profile）**：保存点 converge 照发（桥 age 16s+events providers_converge{model,host} 行在场）**且顶栏当帧「自家中转 · glm-5.3-flash」+全程零控制台错误**——修复在真实首配序列上证毕。

## 五、收尾（环境与账）

- 环境：PF-TEST 零残留（s108a/s108v/s108b 全整删；`start` 调用形态的停止脚本 /K 宿主窗滞留记观察项不立项）；junction 归还 dev 树；dev 树主控污染已清（providers=[]+secrets 三键复位空值=当日 00:35 基线）；dev 栈 PFdrill2 复位 healthz 200。
- 会话总账：**观测三轮（D/E/F）+升级轮作废重做判砍+四缺陷（D-1 P1/D-2 P2/D-3 P3/E-F1 P1）全闭环+V-1 终验猎获即修**；修复/工程 commit 十四枚+返工一枚+docs；研究底稿 2+裁决书 3+QA 报告 1（REWORK→返工→PASS 闭环）；测试包 iat125-130 在 dist 不入发布序。
- 流程教训：①**沙盒与 dev 栈端口互斥必须显式协调**（01:35 双污染事故：工程师回归占 8790 与主控沙盒互撞→误杀+双污染，已通报+清理+串行化守则）；②多代理并行时「谁占端口」要有单点账；③启动器必须在解压完成后点火（iat130 首发抢跑部分树，重启即愈）。
- backlog 新增：V-1 已修但「重连即重拉活跃模型」模式值得在下次回归中盯 ui-logic 断言；QA P3×4（save_config 死分支/db-create 入参长度与截断告知/补帧渲染位置/apps-fuzz 偶发）+P4×11；hints :8 硬编码 8099；faucet 上游「MCP 进程内新库不可操作」登记；同 sid 后发先完成乱序窗注记；busySids 内存 Set 同款竞态（独立跟进）。
