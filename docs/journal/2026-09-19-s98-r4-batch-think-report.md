# 2026-09-19 s98：膨胀 R4 三支柱落地（页大小可调×批量×mem 转分页）+ 能力域去重 + 报表卡双源 + 思考力度选择器 + 从零出厂验证

用户五主线：①膨胀第四次提出——技能/管理小 forge/浏览全部仍有膨胀可能、无批量操作、页大小不可调 ②官方 MCP 与 MCP 插件信息重叠+技能/本事/插件侧多处重叠，要求产品概念重组保证不重叠 ③不能会话时选择模型思考 effort ④报表卡不能引用文件或数据表 ⑤以上完成后从零安装反复测试观测一切可观测点逐一修复。测试模型 9router glm-5.3-flash。

## 基线与裁决

- 开工基线复核：e2e-chat 61/61 + fuzz 190/190（tmp/e2e-baseline-s98.log / tmp/fuzz-baseline-s98.log），栈 PFdrill2 healthz 200。
- PM 裁决 docs/verdicts/2026-09-19-bloat-r4-batch-pagesize-dedupe.md（0d7abaa）：16 事实核验+8 切片；主线1 根因=R3 立了「找回」没立「清理+适配」→三支柱；主线2 根根=容器内部同一实体双渲染（插件 tab 主清单×技术区目录清单同源 readMcpCatalog）+「官方出品」tab 级概念失真+官方条目删除无效陷阱；实体归属表=同一实体同一信息全产品只渲染一处；supersede r3 mem 条款/s95 §7-6、收窄 s81 批量反触发（台账域禁令维持）。
- 主控随批并入 AGENTS.md §7 R2 修订（29adc7e）：档位默认+用户可调、渐进式限有界清单、存量声明 r4 基线+6 处漏网清单声明。

## 主线4：报表卡双数据源（f851b49）

「用哪个表格？」双来源：optgroup 工作区表格文件（sheetFiles 原样）+「🗄️ 库里的数据表」（dbOverview，排除两张建账表，行数 N 条/－）；表选择发送组装「数据库表 服务.表」（@ 菜单逐字同款）；双空→手填降级；dbOverview 失败静默只显文件组。+22/−6；探针 15/15 红绿对照过；e2e 61+fuzz 190。

## 主线1 前三件：E-A（3bdf8eb）

- S1 页大小可调：PS_TIERS{card:[12,24,48,96],row:[30,60,120,240]}+「一页看全」500 上限截断提示；localStorage pfPageSize 全局按形态；pageSlice(arr,key,form) 形态参数；pagerPaint 追加「每页 N 条」select（改档回第 1 页）；12 清单接入；浏览全部手写分页迁 pageSlice（第二份分页实现消灭）。
- S3a mem 转分页：memPaint pageSlice('mem',row)+翻页器；MEM_PAGE/memShown/「显示更多」全删（渐进式 DOM 无上限例外撤销）。
- S3b @菜单文件侧溢出提示（>12 补「还有 N 个文件没列出来」，表侧先例同款）。
- 探针 27/27 红绿对照；ia-logic 28/ui-logic 56/e2e 61/fuzz 190。

## 主线2 去重：E-B（084a495）

- S4a：桥 mcpOfficial(id) 计算字段；/api/mcpstore 条目+official；marketView mcpCatalog 撤 installed/enabled（技术区不再消费状态）；前端主清单官方条目「官方」徽标；技术区收窄「自己加的插件（技术）」只列 official:false、零状态字段、删除钮仅自加条目（官方条目删除陷阱消失）；h3「插件（给它装的新本事）」+fnote 重写（MCP 一词退出妻子面）。
- S4b：技能 chips「📦 自带」→「📦 出厂的」（skillOriginBadge 内置本无徽标=零改动，裁决表述与代码事实的偏差按代码事实执行）。
- S3c 热修（E-A 工程师范围外发现+主控 grep 坐实）：浏览全部 #all-q/#all-sort 自 s14 引入起零事件接线（死控件，allFilter.q/sort 恒初始值）——apps-q 同款防抖接线。R2 存量声明「全部面板=搜索」此前实际是空话，本批治好。
- fuzz 基线 190→191（market 形状断言迁移+official 三真一假）。

## 主线3 思考力度：取证（research/35，19a85fb）+ E-D（ff6ef43）

- 取证：goose v1.50 原生 thinking_effort（ACP set_config_option 五档 off/low/medium/high/max）活体实证；但 is_reasoning_model 名单把 glm 系遮蔽为 ["off"]（set 无效、wire 无思考键）；9router 六参数形态全收无一有效（glm 强制思考、effort 深度不可分辨 UNVERIFIED）；唯一实证 wire 通道=declarative request_params（静态）。工程方向=goose 原生+按模型能力显隐+诚实降级；9router 别名通道=用户侧开放问题（STATE 记录）。
- 实现：桥 sidThinkValues 缓存五刷新点（subscribe/rescue/switch_model 两分支/set_think/session/load sniff）+共用 acpSetThink；subscribe 可选 think 与 model 帧同批；set_think 校验∈values 不合法人话拒绝零 ACP 帧；model 全点位同步 think；model_switched 回执补带 configOptions（会话内切模型三态刷新闭环——简报预判只对无会话分支成立，实测补齐）。前端三态 select（五档人话标签/["off"] 禁用+「这个模型想多深它自己定，调不了快慢」/无键隐藏）+pfThinkEffort 记习惯。真栈活体三态②实证（现役 deepseek-v4.1-flash 同为遮蔽类）。think-probe 24/24 红绿对照；rescue-guard 41/ui-logic 56/ia-logic 28/e2e 61/e2e.sh 8/fuzz 191。
- 勘误：dev 现役模型是 deepseek-v4.1-flash 非 glm-5.3-flash（用户指定的 glm-5.3-flash 是从零测试沙盒用模型；等价遮蔽类）。

## 主线1 批量三件：E-C（411867d / 52cc184 / 71ecd40）

- S2a 工作区批量清理：桥 wsDeleteOne 抽出（单删行为零变化）+POST /api/ws/delete_batch 逐项复用守卫（当前区/被引用拒删）顺序执行+{ok,deleted,failed} 汇总；前端整理模式（orgCheckBox/orgBarPaint 共用组件）+勾选资格=未关联+已归档+全选跨页+双重防线三段（首用完整说明→计数预览含体积→二次确认）。探针 28/28。
- S2b 归档会话批量删除：hardDeleteSession 抽出+delete_sessions 单消息批量（delete_session 回执断连的协议约束→必须桥内循环+末尾单封 sessions_deleted 汇总回执）；归档门双验（前端归档视图+桥 readArch 校验）；**当日号段拒批——工程师活体逮住真 bug：goose sid 前缀按 UTC 生成（本地 09-19 凌晨 sid 仍 20260918_*），本地日期判基漏判致当日会话被批删→closed 集污染→新会话连环 Session-not-found（s76 家族活体复现）；UTC 判基修正后批后连开 5 新会话零 Session-not-found（真栈臂非 mock）**。探针 25/25。
- S2c 记忆分类清空：组头「这一类全忘掉」+单确认+桥既有 forget_all（零新桥代码）。探针 13/13。
- 终态 fuzz 197（+6 批量断言）。

## QA 复审（tmp/qa-s98-review.md）：通过，零 P1/P2

- 独立复跑：七探针 144/144+qa-s98-utc-probe 7/7+e2e 61+ fuzz 197+ui-logic 56+ia-logic 28。
- 变异测试证红成立（delete_sessions 守卫 if(false) 短路→B4/B5a 必红，断言网非永真）。
- P3×3：①S2b「今天」文案与 UTC 判基窗口错位（本地 00:00-07:59 创建=昨日 UTC 前缀零保护被删，QA 探针恰在窗口实锤）②think 三旁路（subscribe/prompt 对账/switch_model）无白名单校验+乐观记账，goose 拒帧静默丢 ③e2e 首跑 apps-probe 间歇红再现（归因 UNVERIFIED）。
- P4×4（两条留档不修：failed[].err 路径反射[单删同族预存在]、fuzz 缺遍历/类型混淆批量向量；两条转快赢修复）。

## QA 返工批（a86a8f6）

- P3-1 守卫扩窗：阈值=本地今日零点对应 UTC 日期（guardDate），拒一切 sid 前缀>=guardDate——本地今天创建的会话全保护（跨 UTC 边界安全方向，顺带保守多护昨日下午段，注释写明取舍）。修前红实证（明日向量被旧码实删）+全窗不变量（GUARD<=UTC 今日→真当日必拒）。
- P3-2 think 白名单：thinkAllowed() 共用函数，三旁路链入（不发帧+不记账+debug 日志诚实降级）；think-probe 修前 4 红→修后 26/26（新增 B(off)4/5 对账哨兵）。
- P3-3 apps-probe 黑匣子：失败断言名+上下文落盘 tmp/apps-probe-last-fail.txt（覆盖式，全绿不写）。
- P4 快赢：批量 200 条上限（delete_batch+delete_sessions 双通道人话拒绝「一次最多处理 200 条，分几批来」+fuzz 双向量）；AGENTS.md §7 补报表卡双源声明。
- **工程师范围外发现留档：rescue 路径（~L1017 noteThinkOptions 后随行 acpSetThink）是 think 旁路第四处，同款 1 行修——并入主线5修复批**。
- 终态基线：**e2e 61/61（首跑即绿）+fuzz 199/199+ui-logic 56+ia-logic 28**。

## 环境卫生活（主控）

- dev 树 e2e-report 残留注册清除（09-15 起）：pc stop→yaml 删→聚合器重跑→forge-register converge（Project updated successfully，chat-bridge PID 不变 restarts=0=纯移除零重启）→apps.env.yaml 键清零。
- **新观察点：pc process stop 后 cmd 包装的 python 子进程成孤儿**（8199 http.server 孤儿手清；s91 hard_stop node 孤儿家族新数据点——pc Windows 进程树回收对 cmd 中介孙进程不可达）。
- fake-PLM :8124 测试服务器残余（E-D e2e.sh 首跑挂死元凶）已 kill。

## 主线5：从零出厂验证（iat14）

- 包：dist/PocketForge-20260919-v0.9.15-iat14.zip（323,634,769B/25,306 文件，sha256 df6a1e42…；**与 v0.9.15 正式包文件级零差异**——s98 全为既有文件内容更新，无新文件入包）。
- R1（C:\PF-TEST\s98a，iat14）：**PASS 零阻断零应修**——冷启 35.4s（healthz 11.5s→converge 03:36:31 先于开窗 03:36:36.7 ✓）；五端点 200+oneshot 四链 Completed；日志零 FATAL；**控制台 JS 异常 0**（唯一 error=favicon 404）；新面 a-h 全过；真任务终态在场（glm-5.3-flash 8 分钟建 s98r1.purchases 5 行+服务端对账一致+权限门诚实链全走通）；**报表卡双源真链全通**（「🗄️ 库里的数据表」组含 s98r1.purchases→组装数据库表引用→2 分钟生成 xlsx+「没编任何数」）。发现 P3×3+P4×4：F1 /api/ws/new 不校验 sid（旧窗重连绑 4 个幽灵区）/F2 open-while-ready 误报「收敛失败（rc=）」/F3 补跑三连「未受理」噪音/F4 favicon 404/F5 首启 GBK 伪命令噪声/F6 starting 打印两次/F7 归档空态沿用活跃文案+整理钮可点。
- **R1 修复批（dc7e8ce+19909eb，全部红绿对照）**：F1=sidKnownToDb 绑定前校验（fail-open，归档 sid 不误拒；e2e 基线 61→62 含新负向量）；F2=**QA 机理修正**——三臂 40 轮实验证明仅 WaitForExit() flush 不够，句柄保持（$null=$p.Handle 预读）才是决定项；F3=第二层根因=$LASTEXITCODE 被 Get-PcProcs 原生调用冲掉+2s 瞬态复核；F4=/favicon.ico→204；F5=**找到确切行**：启动数字员工.cmd:67 中文 rem 行 DBCS 切断（dev 树 drill-devrel.log:3 同错自证），65-67 三行整块 ASCII 化（单行修会漂移复发）；F6=bootstrap.ps1:296 重复行删；F7=归档空态分文案+sess-org disabled；+rescue think 第四旁路链入 thinkAllowed（wire 实录改前直发帧→修后零帧）。终态 **e2e 62/62+fuzz 199/199+ui-logic 56+ia-logic 28**。
- iat15 出包（0d53dc27…，323,636,720B）；R2（C:\PF-TEST\s98b）：修复复验+膨胀造数（60 工作区/500 记忆/30 归档会话）+三支柱实操（页档/批量清理/批删含当日拒批活体/分类清空/@溢出）。
- **R2 结果：F1-F7 七项修复全部确认；三支柱实操硬数字全过——但膨胀场景真刀真枪练出批量管理硬伤，裁决需要返工**（tmp/s98-iat15-r2-findings.md）：
  - 三支柱证据：页档（77 区 30→60→120 档页数递减正确+mem 520 条 30/页 17 页+一页看全 500 行+截断注+localStorage 记住）；工作区批量（56 未关联→全选 55 跨页语义→三段确认含 33.3MB→deleted=54 failed=1 被引用区拒+人话+磁盘核对+解除引用补删成功）；归档批删（最终 24 全选→deleted=21 skipped=3+人话注上墙+归档区自动转未关联文件完好+**批后 5 连开 sid 连续零烧号**）；ASCII 分类清空走通；搜索/三排序/@溢出注全过；控制台 9+ 次加载零 error；冷启 54.2s（30s 沉降等满为主因）。
  - **P1：服务端 ws/delete_batch 与 ws/delete 无状态门——直呼 API 活跃区+本对话区连删（deleted=2 failed=[]），UI「也不会被批量删除」承诺协议面不成立**；P2-1：session/list 恒「最近 50 ∩ 有消息」→ 归档积压从管理面消失（30 归档只露 5 分四批删）；P2-2：坏 created_at 行→session/list 报错被前端 catch 静默吞→侧栏永空零诊断；P2-3：中文记忆分类 forget 双双必败（category 正则仅 ASCII；中文分类是正常使用必然产物，dev 先例 个人.txt）；P3-1：零消息归档会话永不可见不可删（并入 P2-1 修）；P3-2：浏览全部搜索 hay（前端 50 窗标题）与行显（桥侧 DB 标题）不同源，重启后行显标题搜不到；P4×3：一页看全后翻页器隐藏无档位回退/沉降等满 30s/批删日志未落 pc.log（已知缓冲家族）。
  - R2 修复批（fc5464a，+71/−16，红绿对照探针 tmp/r2fix-probe.js 31/31）：**P1 状态门**=wsDeleteOne 增活跃绑定拒删（fail-closed，读不清拒删；既有四路径不破：当前区/归档区可删/junction 引用拒/未关联可删）；**P2-1+P3-1**=归档视图数据源换 readArch() 索引全量（与 goose 50 窗解耦；31 零消息归档 31/31 可见+单批 31 全清）；**P2-2**=前端 catch 显式「对话列表读取出错，刷新试试」+console.warn（不吞 goose 错，桥侧自查询容错）；**P2-3**=category 校验放宽 Unicode 文件名安全集（\p{L}\p{N}_\- 1-64+fileNameSafe，con/路径分隔/超长仍拒）；P3-2 搜索 hay 换 wsDisplayName 同源；P4-1 一页看全档 select 保留可逃逸；P4-2 沉降早退（全 Running/Completed 即走，30s 保底；dev 冷启实测未吃满）。期间工程师另发现 conf/dev-stack-up.ps1:30 三件套第三件 $out 未定义（s96 遗留）——主控当日小修 efffff7（显式 conf\apps.env.yaml）。
- **R3 终验（iat16，C:\PF-TEST\s98c）：全 PASS 零红零黄**（tmp/s98-iat16-r3-findings.md，探针 53/53+冒烟 15/15）：P1 门活体（真会话绑定区单删/批删双拒 deleted=0+人话；未关联/归档照旧可删）；归档 35/35 全可见+单批 deleted=30 skipped=5 今日守卫按实况；中文分类清空+单删走通+6 负向量仍拒；一页看全 select 可逃逸；**冷启 21.1s（R2 54.2s→沉降早退生效）**；坏行诚实降级路径在场；五端点+favicon 204+CDP console 零 error/零网络失败；官方徽标/技术区空态/思考力度禁用态/三排序/搜索全过。B1（零消息零文件绑定区按噪音判据归 orphan 可删——同源 wsState 设计声明内，判可接受留档）/B2（收敛输出无文件日志）建议级留档。沙盒 s98a/b/c 三清零，C:\PF-TEST 空。

## 会话终态

- **五主线全部闭环**：主线1 膨胀三支柱（页大小可调+批量三件+mem 转分页+@溢出+死控件热修）；主线2 能力域去重（官方徽标降条目级+技术区收窄零状态+MCP 退出妻子面+词汇分职）；主线3 思考力度（goose 原生通道+能力显隐+诚实降级；glm 遮蔽态实证；9router 别名=用户侧开放问题）；主线4 报表卡双数据源（真链全通含 xlsx 产出）；主线5 从零三轮（R1 冒烟→R2 膨胀实操抓 P1+P2×3→修复→R3 终验零红）。
- **总量**：12 产品 commit（f851b49/3bdf8eb/084a495/ff6ef43/411867d/52cc184/71ecd40/a86a8f6/dc7e8ce/19909eb/fc5464a/ed52988）+efffff7+docs 若干，全推 origin；测试包 iat14/15/16 在 dist（不入发布序）。
- **终态基线：e2e-chat 62/62 + fuzz 203/203 + ui-logic 56 + ia-logic 28**。
- **收尾追加批（ed52988）**：P4-2 humanDeleteErr（批量/单删回执 err 人话化零路径反射，EBUSY/ENOENT/SQLITE_BUSY 族映射+原始错误恒落 pc.log）；P4-3 fuzz 批量类型混淆/遍历向量 4 条（199→203）；B2 converge 落 data/logs/open-when-ready.log（四口全落+ASCII 防码页+真跑实证）。
- **支线：goose v1.51.0 定向分诊（research/36，80eec76）**——红线五面源码级过门（model.rs/dispatch.rs/response_builder.rs 双 tag 逐字节一致=思考闸门/configOptions 面不变；session_manager 仅 cfg(unix) 权限加固=sid/DDL/truncate/closed 集全不动；acp/server.rs 仅 resource-link 渲染改造=新元数据形态入 playbook 注意项）；「Session not found」单源措辞 4 处原样；升级可立项无硬阻断。
- **留档**：pc process stop 后 cmd 子进程 python 孤儿（s91 家族新数据点）、apps-probe 首跑间歇红（黑匣子已装待再现；本轮再现两次复跑恒绿）、9router 别名开放问题（用户侧，research/35 §4）。
- **环境终态**：dev 栈 PFdrill2 复位 9 进程 restarts=0 healthz 200；C:\PF-TEST 空；e2e-report/8199/fake-PLM 残留清零。
