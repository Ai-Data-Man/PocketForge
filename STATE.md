# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-09-05 s65（收尾）：报告 v2 探针转正（四 tmp 探针→tools/e2e/report-probe-{static,sandbox}.js+编排，挂 e2e 第 12 节，**e2e 升至 35/35**，5922d1d）；「浏览全部上限」零 diff 裁决（P29 起有 30/页分页，前提失实，STATE 勘误引以为戒）；EPIPE 竞态修复（第 11 节输出落地再 grep，a3adb0d，3×35/35）；沙箱 rmSync 间歇 EPERM 取证+修复（双因子：goose 孙进程句柄窗 0.1-0.3s + node v24 上游 Sleep 单位 bug 废掉 maxRetries；轮询重删 200ms/8s 四调用点，6ec8c29，5×29/29+2×35/35+等价复现 10/10）；goose 上游情报落档（research/04：不追 v1.49.0 等 v1.50 或退 v1.48.0，三红线源码级未动，f203083）+ 升级预案重建（abfbe3a）；矩阵 13 全归档态 GUI 全过（API 批量归档 175→复核→全量还原）。前情：s64（报告 v2/UI 五缺陷/PG 取证 BACKUP 挂 P32）
- 阶段：**P31 内测护航进行中**（①本机部分 ✅（v0.9.8 护航候选包就绪；s64 报告 v2 在 dev 树，随下版 tag 入包），真机 POC 待用户；②收窄完成 ✅；③已就位；④收窄完成 ✅）

## 已完成周期
| 周期 | 内容 | journal |
|---|---|---|
| P0–P6 (s01) | 信息架构→四路调查→本机验证→设计→实现→E2E→打包 | s01 |
| P7–P9 (s02/s03) | 记忆四层架构 / schedule / 卸载脚本 / fork策略(零fork) | s02,s03 |
| P10 (s04) | 目标机场景模拟 E2E（全新解压+公网LLM+妻子任务链） | s04 |
| P11 (s05) | skill自进化(agentskills.io规范)+启动备份+沟通规范+welcome | s05 |
| P12 (s06) | ACP桥聊天客户端v1（Web壳+Edge--app窗口） | s06 |
| P13–P15 (s06/s07) | 对标Codex/ZCode补齐+体验修复轮 | s06,s07 |
| P16–P17 (s08) | 多provider/model体系重构+fork策略确认(零fork) | s08 |
| P18–P20 (s09/s10) | 内置浏览器自测+下拉裁剪修复+断电恢复+场景E2E回归 | s09,s10 |
| P21 (s09) | 视觉辅助体系(glm-5.2+tools/vision.js+see-image技能) | s09 |
| P22/P23 (s11) | 真删除会话+制品体系(preview/open-local/vendor库)+斜杠命令+MD气泡渲染 | s11 |
| P24 (s11) | agent端到端制品闭环(agent自主写零依赖xlsx生成器→工具化) | s11 |
| P25 (s12) | 侧栏文件树+上传+@引用+复制剪贴板+子目录支持 | s12 |
| P26/P27 (s12) | 聊天客户端全量迭代（注：外链junction当时只做了前端，后端P28b补齐） | s12 |
| P28 (s13) | 致命崩溃修复(up-btn null杀掉connect)+防崩结构；每会话工作区(ws-*+workspace-map+v3迁移)；isomorphic-git版本管理(CLI+/api/vcs/*+🕘时间线)；slash中英模糊+技能并入；工具卡大白话解释；提示词自动注入工作区路径(P28e) | s13 |
| P29 (s14) | 右栏双Tab信息架构(本对话真目录树跟随会话/浏览全部搜索排序分页状态片)；会话生命周期(归档⇄活跃,仅归档内可删,首删内存级提醒,调度会话过滤+启动修剪护栏)；.forge元数据解耦附件身份；轻量文件管理(新建/改名/删除)+↗外部办公软件打开；引入=junction防环+取消只摘链。事故处置:daily-mem cron误配*/2三天刷1765条挤掉真实对话→清库+cron复位+修剪护栏 | s14 |
| s15 | bug实证修复(解释弹层被overflow:hidden裁剪→fixed定位挂body;ACP回放无stop事件→session/load完成补endStream)；三轮requesting-code-review loop:R1抓出CSWSH key外带/preview XSS等2C+8I+10M,R2验证12项+抓出/artifact同源绕过等5项,R3 Ready=Yes。落地:WS Origin校验/preview DOMPurify+iframe sandbox/artifact html-svg强制下载/atomicWrite六处/rpc按id结算/删会话解绑工作区/外链防环/遍历预算/目录删前快照/已删文件可恢复/shell注入封堵/innerHTML转义收敛 | s15 |
| P30 (s16) | 自动升级(ADR-0009):VERSION真相源/detached升级器(下载校验差量备份回滚)/桥4端点+设置面板/schema迁移框架;正向v0.9.0→v0.9.1与回滚演练v0.9.2双验证 | s16 |
| P30b/c (s16) | UI 视觉系统整体重写:三层设计令牌(色板→语义昼/夜→组件)/4皮肤(绿蓝紫石墨)/字号密度可调/顶栏◐+设置外观区块;修复:第一版CSS自引用坏变量/内联白底穿透夜间/浏览器缓存no-cache/panes flex丢失/空会话空工作区降级未关联+标题命名+活跃可删 | s16 |
| s45/s46 | 外部技能市场（anthropics/skills 递归拉取安装+🌐UI）+ MCP 市场最小形态（精选目录/后台 npm vendor/写 extensions/bootstrap 保留 mcp-* 块）+ IA 重构 🧠 管理面板一级入口（s43）+ 项目须知.md（s44） | s43-s46 |
| s17 (ADR-0010) | 能力中心+记忆可视化:设置面板新增「它会什么」扩展开关(数据库/浏览器/长期记忆)、「小forge记住的事」查看+删除(直读memory/*.txt,与MCP语义一致)、「安全护栏」大白话说明;/api/extensions+/api/memory;bootstrap保留用户开关值;审查轮:HTTP层Origin校验补齐(s15只修WS,恶意网页可跨站POST删记忆/触发升级)+空记忆分类过滤;GUI昼夜双主题断言通过 | s17 |
| s47 | P31-①本机部分:package.sh记忆层守卫+清路径事故空目录;tag v0.9.3→打包→沙盒(C:\\PocketForge-Test)重部署→真实Edge全流程冒烟(体检任务:权限卡/超时放行/手动批准/大白话结论;报表任务:自愈生成xlsx→文件树→预览页→下载)→抓出修复时区显示+搜索✕残留2bug→tag v0.9.4 重打包,沙盒同步;沙盒栈停/dev栈起/回归全绿 | s47 |
| s50 | 数据引用统一+DB可见性/可引用性(P31附加,用户主线):报表卡@形态(2a8625d)+/api/db/overview+@菜单DB分组+管理面板清单+hints三条(17657e9/a1098af,pm裁决书收窄版);桥五bug修复(70159b1/8296798:事件循环冻结//open/注入/POST上限/剪贴板detached)+重发人话(f21a006)+welcome 404(6c545a8);**v0.9.6打包+沙盒全新冒烟通过**(报表全链路,s48 GUI挂起项闭环) | s50 |
| s51 | 小白可用性三主线(用户主线):管理面板六区块→六标签页(懒加载+重开重拉)/记忆清单搜索+50条上限+显示更多/数据表人话化(/api/db/_schema+点表名展开:人话类型+样例值+pk唯一,表名列名保原文);pf-qa 4修复(懒加载缓存面板不刷新回归/memAll=null/fuzz白名单钉子/err截断);e2e 26/26+fuzz 23/23;业务AI翻译永久裁掉 | s51 |
| s51b-d | s51b:e2e.sh收尾挂死修复(goose输出走文件+python脱管,EXIT=0双跑);s51c:qa二轮换线自动重发竞态P1(重发挂subscribed后800ms)+P3×3(注释吞addInfo/tab aria/mcp轮询泄漏);s51d:P31-②配Key引导条落地(无key→引导条→现有⚙️面板,配好即消+chips重现,GUI双态A1-A4实景全过,桥零改动);独立向导页/任务选择层裁掉冻结挂P32 | s51 |
| s52-53 | s52:gen-xlsx位置参数标题修复(JSON内title优先,7d35690)+文件树任务完成自动刷新(ACP stop分支挂renderCurPane,0cc98c0);s53:**tag v0.9.8打包+沙盒全新部署首任务冒烟A1/A2/A3/A5/A7全实景通过——s50部署缺口(无key首任务401)正式关闭**;真401/双档案换线实景留护航 | s53 |
| s54 | MCP商店补「网页抓取」fetch-mcp@0.0.5(MIT,官方server-fetch无npm包,选型实测后入目录);复用s46机制零新代码;GUI实景:安装→重启挂载→goose调fetch_url正确回答;许可证以标注来源声明落档(包无LICENSE文件);e2e 26/26+fuzz 23/23 | s54 |
| s55-56 | **用户两类断根问题裁决+落地**(pf-pm裁决书:外部资源接入域管道+实体生命周期底线算子集,全盘盘点14项6实锤):S1定时任务暂停/恢复(goose源码取证否证直改schedule.json——守护读内存副本+persist回滚;短命acp --enable-scheduler发ACP custom request落盘+pc restart goose-scheduler守护重载闭环,失败降级warn;UI ⏸/▶,GUI实景resume→IDLE→pause复原,7b3aa24);S2技能市场缓存+搜索+中文(data/cache/skills manifest<24h秒回+后台惰性重拉,desc_zh批量翻译10条/批截150防超时,搜索框过滤,?preview读缓存原文,21条秒开+搜「画画」命中中文描述,24cf23b);s55/s56联审5修复+fuzz实跑抓String([v])类型混淆(typeof收string) | s55-56 |
| s57 | S3实体生命周期补全:MCP/技能停用+卸载(/api/extensions动态并入已装mcp-*修能力开关面板盲区;mcpstore/skillstore op=uninstall,安装中拒卸,白名单与安装同门);qa审查3修复(mcpEnabled跨块吞enabled改块界扫描/installing拒卸/卸载后刷商店);fetch-mcp真卸载+重装闭环(npm 65s);fuzz 39/39(+8)+e2e 26/26;GUI实证卸载按钮+已启用渲染(4ba7c4d) | s55-56 |
| s58-59 | s58:删除同款守护盲区补齐(删除成功后pc restart goose-scheduler,失败降级warn)+顺修op缺省解析回归(typeof b.op全string拒掉了UI删除请求,缺省容许undefined;教训:收紧类型必须枚举全部调用方请求形态)(97d04ea);s59:**定时预热(用户回线确认方向)**——桥启动15s后sync一次+每24h重拉,基础设施预取预翻译用户零等待,触发在桥执行是管道调用非agent;实证fetched_at自动刷新19/19中文remote GET 6ms(06b7ece) | s55-56 |
| s61 | **用户三主线**:①UI慢半拍断根(取证→修复#1-#7,底稿research/09);②一键上报(裁决→/api/report+📮→qa两轮P2×3返工12项全过);③布局细测(qa 20条矩阵+GUI 10项PASS);e2e 32/32+fuzz 44/44 | s61 |
| s62 | s50e换线重发完全失效取证修复(P1,v0.9.8带病;双重缺陷+探针桩词法作用域教训)+qa建议级两项+矩阵补跑;e2e 32/32+fuzz 44/44 | s62 |
| s63 | qa P3 留档批量清零:destroy 5s兜底/msgText()元素级剥离(导出·复制·重发)/草稿200字截断/WS delete断言转正;e2e 33/33+fuzz 44/44 | s63 |
| s64 | **用户四主线**:报告v2可观测增强(规则式初诊R1-R5+采集A1-A7+256KB硬顶,077e8d9)+UI呈现五缺陷(版本v2/列表乱序/静默截断/发送竖排/徽章重复,c14ed19)+PG便携化取证(research/10,1ddbcc8,BACKUP挂P32待用户扩白名单)+收尾小批(qa P3处置/fuzz留痕/reduced-motion,67b871d);qa双批通过;e2e 33/33+fuzz 44/44 | s64 |
| s65 | 报告探针转正(e2e升至**35/35**,5922d1d)+EPIPE修复(a3adb0d)+沙箱rmSync EPERM取证修复(goose句柄窗+node Sleep单位bug,轮询重删,6ec8c29)+goose上游情报与升级预案(research/04+playbook,f203083/abfbe3a)+矩阵13全归档态GUI全过(数据全还原);浏览全部上限零diff裁决(P29有分页,勘误) | s65 |
## 技术栈版本（全部 VERIFIED-RUN）
process-compose v1.122.0 / nats-server v2.14.5 / nats-cli v0.4.0 / faucet v0.1.12 / goose v1.46.0 (AAIF) / node v22.21.1 / python 3.12 embeddable (Pillow 12.3.0；openpyxl 不在包内——s47 实测，旧记录失实已修正) / isomorphic-git 1.41.9 (vendored MIT, ADR-0007) / DOMPurify 3.2.4 (vendored Apache-2.0, s15)

## 关键决策索引
ADR-0001 记忆拓扑 / ADR-0002 五件套技术栈 / ADR-0003 交付树+注册协议 / ADR-0004 E2E修订(rawsql oneshot+apps聚合) / ADR-0005 记忆四层架构 / ADR-0006 fork策略(默认不二开) / ADR-0007 制品工作区(每会话一区+isomorphic-git) / ADR-0008 工作区信息架构(双栏分层+生命周期+.forge)

## 开放问题 / 风险
1. 真实公司机差异（EDR、真实 PLM IE-mode）——待真机
2. ~~chat-bridge :8790 无冲突探测~~ → s27 已修：EADDRINUSE 时探测占用者——自家实例（200 /api/update/status）提示"已在运行"退出 0；其他程序提示"端口被占/重启电脑"。实测双分支
3. ~~权限请求 UI 简化版~~ → s19/s22 已完成：对话流内确认卡端到端 VERIFIED-RUN（approve 模式真会话验证）；permission.yaml 工具名前缀与 goose 内部名核查一致。遗留认知：goose 出网受 Windows IE 系统代理影响（目标机若装代理软件需 NO_PROXY=127.0.0.1,localhost——pc 注入链已覆盖）
4. ~~新对话模型回落服务商默认~~ → s26 已修：前端 subscribe 携带当前模型，桥在新会话 resolve 后 set_config_option；GUI 验证通过
5. welcome 页在无默认浏览器关联的极端机器上不弹
6. junction 以绝对路径存储：forge 整体搬家后链接失效（ADR-0008 复核条件）
7. ~~e2e.sh 未覆盖聊天客户端链路~~ s18 已落地 tools/e2e/e2e-chat.sh（18 断言，含搜索）；WS 消息链路（prompt 往返/工具卡）s22 真会话已人工验证

## 交付物验收线（全 ✅）
解压即用 / 双击启动 / 零系统污染 / 自然语言取数入库做应用 / 重启回来 / 干净卸载 / 记忆便携 / 调度 / 视觉辅助 / 制品预览+本机打开 / 斜杠命令 / 文件树+上传+@引用 / 每会话工作区+版本管理+一键恢复 / 工具调用大白话解释 / 会话归档删除生命周期 / 浏览全部检索 / 目录树轻量文件管理 / 三轮代码审查 8 维度通过

## 路线决策（团队拍板，2026-08-28；内测期阶段 = 验证优先于扩张）
- **P31 内测护航（当前周期）**：①真机 POC 打包与护航（新包 → C:\PocketForge-Test 全流程启动 → 首任务冒烟）——**本机部分 s47 ✅ + s50 ✅ + s53 ✅（v0.9.8 护航候选包，沙盒全新部署+首任务实景冒烟通过）**，真机环节待用户；②首个任务向导——**s51d 裁决收窄并落地：任务类型选择层已被 s33 chips+s48 报表卡实现（冻结，新增类型挂 P32）；本轮=配 Key 引导条（无 key 检测→引导条→现有 ⚙️ 面板，配好即消），GUI 双态实景 A1-A4 全过；s53 沙盒复测 A5(401兜底)/A7(重启后首任务) ✅ 全闭环**；③匿名本地使用统计（每天一次记录活跃会话数/报错计数/卡点关键词 → 驱动 P32+ 决策）——**s49 v1 已就位，s50e 增 upstreamByKind 细分**；④多线路韧性——**s50e 裁决收窄：401 自动切换永久裁掉（配置问题非线路问题），全自动 failover 裁掉；落地=错误细分计数+401 人话指引+「换备用线路再试」一键（零自动）；半自动准入：护航≥2周且 upstream 错误≥10次 且换线成功率≥50%**
- **s47 冒烟新增候选**：~~node 绝对路径调用反复失败~~ → s47b 已修（hints 重教+gen-xlsx 加固，v0.9.5）；桥注入 PATH/FORGE_ROOT（P31-④ 相关，需目标机 `where node` 验证）；~~文件树任务后自动刷新（UX）~~ → s52b 已修（ACP stop 分支挂 renderCurPane，0cc98c0）；~~gen-xlsx 位置参数「标题」无效~~ → s52 已修（接收为 spec.title，JSON 内 title 优先，双断言验证 7d35690）
- **P32 数据驱动**：据使用统计决定（候选：真机 PLM 适配、工作流模板、日程提醒）
- **裁减原则**：商店/插件类扩张挂起至真机验证后；内测用户反馈是第一输入源，路线裁决权在团队
## Backlog（对标研究提炼，ADR-0010 复核条件）
- **观察项**：栈冷启后首跑 fuzz 偶发 1 红、热跑稳定全绿（s61/s63/s64 三次复现）——s64 已加固留痕（fuzz-chat.sh 全量输出恒写 tmp/fuzz-last.log），下次复现先查日志归因，再立专项
- **观察项（s65）**：侧栏「已归档 N」的 N=goose session/list 返回窗口大小（实测 50）而非库内归档总数——会话少时无感，规模化后属信息精度问题（主线 4 族）；~~e2e 第 12 节沙箱探针 rmSync 间歇 EPERM~~ → s65 已修复（轮询重删 6ec8c29，取证结论 tmp/forensic-rm-perm 可复跑）
- **s64 报告 v2 遗留**：报告探针转正（tmp/s64-probe-report.js+qa-edge/qa-sandbox → tools/e2e/，注意沙箱探针自拉桥进程占 18790/18799 端口，转正需与 e2e 时长权衡）；体积硬顶 head 段超限角落已注释标注（P3-1，产品路径不可达）
- **PG（P32 候选，双前置）**：research/10 结论 BACKUP——①用户确认许可证白名单扩列（OSI 宽松等价类：PostgreSQL License、ISC）；②真机 POC（initdb 耗时/EDR 对用户目录 postgres.exe 态度）。FTS5 中文硬边界已实证，backlog「/api/search 升级 FTS5」条目若推进需重新设计
- ~~s64 后 UI 候选：浏览全部卡片列表无上限~~ → **s65 勘误撤销**：renderAllPane 自 P29 起即有 PAGE_N=30 分页+翻页器（s65 工程师零 diff 裁决，主控复核代码确认——此前条目是主控未核实就归约的错误断言，引以为戒）；真实缺口（若有）待 pm 重新归约
- **s65 遗留**：e2e 第 11 节 ws-delete-receipt.js 在 pipefail 下偶发 EPIPE 竞态（grep -q 早退→node 管道断裂→set -e 中止全量，s62 转正即有，复跑即过）——下轮小批夹带修复（grep 缓冲或去 -q）
- **goose 升级窗口（research/04 s64 情报）**：不追 v1.49.0；护航窗口距 v1.50 预计发版（~09-09±3）≥3 天则等 v1.50，否则取 v1.48.0；升级前重建缺失的 goose-upgrade 预案文档（research/04 已勘误挂缺失），回归五面清单已落 research/04；三条红线（scheduler persist/schedules ACP/GOOSE_PATH_ROOT）v1.46→v1.49 源码级未动
- **s61 遗留**：~~typing 动画无 prefers-reduced-motion~~ → s64 已修（67b871d）；~~explorer /select 不抢前台焦点~~ → s64 裁掉（SHOpenFolderAndSelectItems 无"不激活"旗标，explorer 无后台参数，workaround 40+ 行入桥模板复杂度不成比例且弹窗是 pm 原裁决行为；官方文档证据在 67b871d 交付记录）；qa 布局矩阵跳过 3 条（全归档/无 key 态/confirm 窄窗）按需补跑
- ~~s55-57 断根裁决遗留：定时任务删除按钮守护盲区~~ → s58 已补；~~vendor 目录名漂移（mcp-memory/mcp-seqthink 孤儿目录）~~ → s59b 已清（全仓无引用+卸载路径自愈），本条历史遗留关闭
- 工作区级「项目指令」（对照 Manus Projects master instruction）：.forge 元数据扩展 + prompt 注入，首月低频故 backlog
- 多会话并行任务（Manus Wide Research 式）：妻子场景低频，backlog
- /api/search 升级 FTS5：消息量 >1 万条时
- ~~MCP 商店最小形态~~ → **完成**：s46 落地商店机制（sequential-thinking/memory-graph），s54 补 fetch（fetch-mcp@0.0.5 MIT，官方 server-fetch 无 npm 包，选型实测后入目录；GUI 实景：安装→重启挂载→goose 调 fetch_url 抓页正确回答）。Backlog「入口数据源扩 components.yaml」未做——现目录硬编码于桥内（3 项），项数稳定无需求，按需再议。
- skill 商店远程化：skills-repo 与 GitHub repo 同构，sync 即得远程技能源（s42 已预留）
