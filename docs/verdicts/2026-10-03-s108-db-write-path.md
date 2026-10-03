# S108 裁决：建库写路径权限卡墙（D-2，P2）+ 聊天回复技术坐标泄漏（D-3，P3）

裁决 pf-pm 2026-10-03。证据：主控沙盒实录（iat124 净冷装，glm-5.3-flash，40 调；「帮我在数据库里记一张表：三笔开销」=27 张权限卡、约 5 分钟；终态数据/建账全对）+ research/2026-10-03-s108-cjk-tablename-rca.md（REST 写/CLI 通道 VERIFIED-RUN）+ ADR-0006 + f4 先例（2026-10-02-s107-report-permission-readtool）。姊妹裁决 2026-10-03-s108-cjk-tablename（侧 A 扩白名单）同批联动，验收臂三依赖它。

**事实修正（对主控实录机理①）**：faucet v0.1.12 MCP 工具面不是只读——vendored README:213-220 明列 faucet_insert/update/delete/raw_sql。真实缺口是**「建」无工具**：无建服务、无建表工具（insert 只能进运行中网关已可见的已存表），加上不热加载，建库全程只剩 shell 一条路。此修正不改结论，只改工具规格的边界（不重复造 insert）。

## 裁决一（Q1/D-2）：修，选 A——产品自建 db-write MCP（f4 同通道吸收重造）

### 三问归约
① 任务为何撞 27 卡：建库/建表零 MCP 覆盖，唯一路径=shell（CLI db add、node fetch REST 探路、读 .apikey、pc restart、ping 轮询）——shell=ask_before，每机械步一卡。② 为何是产品缺陷而非安全摩擦：妻子一句「帮我记一张表」=一次明确意图=一次同意；27 张卡把一次同意摊成 27 次机械点头（mkdir/where/README 也卡），卡的语义（每张=她的一次真实拿主意）被稀释到失效。与 f4 同族意图误分类、方向相反：f4 是已同意的读被路由进 write 卡，D-2 是一次同意的写在 27 个 write 步里碎屑化。③ 做错的代价：旗舰故事「跟她说话就能记账」首单即 27 卡 5 分钟——卡制度被教成噪音，下次真危险的卡她也点头；且 agent 被迫读 .apikey/README 进上下文=安全面变宽而非变窄。

### 工具规格（边界清单，实现照此；机制不进配置面、无开关，同 f4）
新 vendored stdio MCP（goose-config 新 extension，包内 node 零依赖，先例=read-file-mcp/memory-mcp）。能力清单人话名「建数据库」+一行解释（R4）。密钥（faucet .apikey）只进工具进程、不进 agent 上下文——比 D-2 的 shell 读 .apikey 是收紧。**只做「建」，不复制「写」存量**（日常插入仍是 faucet_insert，hints :12 原句）：

1. `db_create_service`（name/description/source）：内部=建 sqlite 文件 data/sqlite/\<名\>.db → faucet db add（execFile，中文参数原生安全，RCA §二）→ 探 REST 服务可见（宽限 ~3s）→ 不可见 → **经 pc REST API（127.0.0.1:8099）restart faucet → healthz 等待 → 复验可见** → 写 forge_meta 建账行（REST insert）。回人话摘要（建了什么库、账已留、等了几秒）。
2. `db_create_table`（service/table/columns/description/rows?）：REST POST `_schema`（表名在 JSON body，中文安全，RCA §三）→ 写 forge_table_info 建账行 → 可选首批 rows 走编码 path REST insert（RCA §三 VERIFIED）。

- **注解策略：两把工具全部 write 注解（readOnlyHint=false → smart_approve 自动入 ask_before，research/2026-10-02-s107-read-tool-permission.md :74）**。不选无注解走 judge：judge 对写操作按次裁决=卡数不确定，验收数字不可判，且可能在妻子离场时无上下文弹卡。不选拆「建账+插数」异注解：建账是工具内置义务（hints :11/:16 本就框成义务非独立动作），首批行搭建表车，拆开只增卡或增 judge 方差，不新增任何用户有意义的同意边界。**不拿 read 注解伪装写工具**（f4 原则：「不拿注解说谎」）。
- **restart 归属：进 db_create_service 工具内部，不做独立工具，insert 路径永不动它**。理由：热加载缺口实测 40s+ 不刷新（主控实录）——「写后等就绪+失败才提示重启」只是把墙延后，且重新引出 agent 侧 shell restart=又一卡；ADR-0006 已把此缺陷裁为不 fork，对冲=pc restart <3s+healthz 自愈，连接杀面有界且自动恢复；重启发生在已同意的建库卡之内（卡的描述写明「可能需要几秒让数据库服务重新加载」）=知情同意。失败臂：restart/等待失败→人话报错+下一步指引，禁止自动重试风暴。宽限探查保留：上游若未来修好热加载，工具零改动自然跳过 restart。
- 名字卫生：service/table 入参沿用 CJK 裁决二同款白名单 `^[\p{L}\p{N}_\-]{1,64}$/u`（同语义两处执行点：桥闸门+本工具入参），拒绝也给构造性人话错误。

### 为什么不是 B/C（衡量指标：妻子自然语言建表任务的卡数）
- B（只修 hints 教一次性脚本）：只能消探索卡（where/README/ping ≈27 中的十余张），核心卡（CLI 建库、restart、写数据）是结构性的——无建类工具则 shell 是唯一路径，地板仍是 10+ 卡，≤2 的验收数字不可达。
- C（fork faucet 加热加载）：撞 ADR-0006 零 fork——该缺陷 2026-08-20 已逐项裁过「否」，fork 触发线 c 要求「对冲的体验成本被真实使用证明不可接受」，被证明不可接受的是 **agent-shell 编排成本**而非 restart 本身；A 把编排成本整体移进已同意的卡内，上游零改动。且 fork faucet 会武装「第二个需 fork 缺陷→整体切 PocketBase」条款——为权限卡 UX 问题换数据库引擎，比例失当。

### 验收数字（Q1 定量化）
同一自然语言建表任务 permcard：**27 → ≤2**（两张均为真同意：①新建一个数据库 ②建这张表并写入这三笔；卡文案人话可懂）。硬顶 3：追加拍若因 faucet_insert 上游注解面（UNVERIFIED，s107 research :123 残留）现第三张，记录留档不返工。负检查：shell/edit/write/read_image 照卡，read 工具与 faucet_query 读新库仍零卡。

## 裁决二（Q2）：hints 教法迁移 + 兼容判定
- :10 改写：建新库用 db_create_service 工具——删去 faucet db add CLI 教法与「然后 pc process restart faucet」人肉步骤。
- :11 尾句「刚建的新库要用 faucet REST 直接写（地址见下方『应用运行时清单』）」**整句删除**——这是本次卡墙的教唆源头（引 agent 读 .apikey+node fetch）；改述为「新库建好后 faucet_* 工具立即可见，插数据用 faucet_insert / 建表用 db_create_table」。建账义务句保留（description/source 即建账，工具内置）。
- :12 日常读写原句不动（faucet_insert=追加路径）。
- 「应用运行时清单」:70（REST 地址+.apikey）**保留**——它的消费者是 agent 自建应用的运行时（app.js 里取数），不是 agent 自己的建库路径；D-2 里 agent 读 .apikey 的动因随新工具消失。
- **兼容=伪问题，零 shim**：bootstrap.ps1:62 每次启动无条件从 tpl 重建 .goosehints（模板=唯一真相源，s20 先例），升级用户下次 .cmd 启动自动获得新教法。唯一残留=正在运行的会话持旧 hints 至会话结束，下次会话自愈，接受。

## 裁决三（Q3/D-3）：hints 人话纪律句；/admin 不进 hints
- 现状：:52/:72 两句「说人话」无否定清单，D-3 实录（服务名 home、data\sqlite\family.db、http://127.0.0.1:8091/admin 三连漏）证明挡不住。**「沟通规矩」节加一句具体否定清单**：回复里不出现文件路径、盘符、端口号、IP 地址、服务内部名、反引号代码块——指位置说「在设置面板的数据页能看到」，给入口说「我放到聊天窗口的文件区了」。
- **8091/admin 不写进 hints**（grep 实证：hints 现全文未提 /admin 与 8091）：泄漏源=agent 被迫读 faucet README（D-2 的 15×shell 之一），修 D-2 即断主源；/admin 是上游管理 UI（含 RBAC/key 面），对妻子无用且是误操作面，产品面已有 🗄️ 数据面板承担「看数据」——写进 hints 等于制造第二个泄漏源。
- 边界：本轮到 hints 句为止，不做聊天输出过滤/改写层（新机制新边界，超出最小修）；hints 句+泄漏源消失双管齐下后若真机复现，再立独立裁决。

## 验收臂（Q4；§8 纪律：dist 出厂包，C:\PF-TEST\<场景>，完测整删）
1. **核心臂**：净冷装冷启，同 prompt「帮我在数据库里记一张表：三笔开销」→ events.log permcard ≤2、两卡文案人话；数据全对（表+三行+forge_meta/forge_table_info 各一行）；回复零技术坐标（路径/盘符/端口/IP/反引号逐项断言，按 D-3 泄漏形态）；全程 shell 无写面命令、无 pc/ping 轮询。若现 todo 卡：沿用 s107 验收 6 预案（提示词补「直接做」），不占 2 卡预算、不复算机理。
2. **热加载断臂**：维持上游不热加载现状 → db_create_service 内编排生效断言：卡仍 ≤2、faucet 重启 <5s、返回时 REST 已可见、无 agent 侧 restart/轮询调用。
3. **可见性臂**：建好的中文表出现在 🗄️ 数据面板（含建账人话说明）——**依赖 CJK 侧 A 同批或先行落地**，两裁决合并为一个工程批次交付。
4. **追加臂**：「再记一笔」走 faucet_insert，卡数照实记录（注解现状 UNVERIFIED；零卡留证、现卡记第三张留档）。
5. **负检查**：让模型跑 shell/write/edit → 卡照常；read/faucet_query/faucet_list_services 零卡回归。
6. **回归与升级臂**：本批改 goose-hints.tpl.md+goose-config.tpl.yaml+新 vendored MCP+bootstrap 物化链，chat-bridge.tpl.js 不动 → §8.2 全清单不触发；跑 e2e-chat 全量+物化断言（.goosehints 从新 tpl 重建、config 含新 extension）+升级路径一臂（旧包建过库→新包覆盖→冷启→新 hints 在场、旧库照读）。

## 非目标
- 不放宽任何既有 write 授权；shell/edit 卡照旧；不做通用 SQL 执行工具（上游 faucet_raw_sql 已有且 admin-only，不复制）。
- 不动 faucet 上游（零 fork 维持，ADR-0006）；不做建库向导 UI/面板按钮——妻子已能用自然语言成功下单，缺的是权限面不是交互面，验证优先于扩张。
- 工具通用不预设业务（任意库名/表名/列定义，「三笔开销」只是验收剧本）；D-3 不做输出过滤机制。

## 成功指标与观察窗
主指标：同任务 permcard 27→≤2（验收沙盒即测）。伴生：任务墙钟 5 分钟→目标 <1 分钟（轮询消失）；回复技术坐标扫描 0 命中。观察窗：验收沙盒+下一次真机使用；真机反馈后重读 ADR-0006 复核条件（restart-in-tool 的连接杀面若真机显示问题，登记复核点，不预先加机制）。
