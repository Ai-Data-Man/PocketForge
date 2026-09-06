# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-09-07 s74（用户三主线=产品设计根治：**信息架构根治四切片全落**——裁决书 2026-09-07-ia-root-cure（R1-R4 规范+归属地图+§10 主控修正）cd5a69a；IA-1 技能域归位 35a2e69（弹窗双tab+已装搜索+mkt-src 源配置随使用域搬入折叠技术区+插件页净化）+返工 afed0cd 寄宿（弹窗直开源列表空缺陷）；IA-2 侧栏归档视图化 840b0f0（视图chip恒驻头部+归档全量搜索+30/页+删旧折叠头）；IA-3 表说明机制 7ede8c2 桥侧+afed0cd UI（**主控修正：forge_table_info 改应用库内普通表**——pm 原案放 forge_bridge 写通道 agent 够不着；hints 建表义务+dbOverview 并出 desc+数据面板按应用分组+系统表折叠+搜索）；qa P3×2 修复 fde61e1（归档早退残留翻页器/技能过滤空集空白）；**agent 软约束 VERIFIED-RUN**：真实会话无提示自发写 forge_table_info（建表带说明率首数据点 1/1）；R2 carve-out 采纳（无天然分组边界单实体清单搜索+分页即合规）；**R1-R4 检查单入 AGENTS.md §7 为 qa 正式审查依据**（首实战走查产出 carve-out 即制度生效证据）；终态 e2e-chat **46/46**+fuzz **143/143**（+1 desc 断言）；**环境事故实录**：52 个孤儿 `goose mcp memory` 进程+ACP 劣化致 fuzz 矩阵摇摆红（清孤儿+pc restart chat-bridge 恢复全绿，根因取证 research 进行中）；方法论：.goosehints 是 bootstrap 启动期幂等物化产物——**改 hints 模板必须重跑 bootstrap.ps1 才在 dev 生效**（本日实锤）；同文件并行编辑会互相卷入 commit（afed0cd 卷入返工 3 行，主控裁接受）。前情：s73（用户四点批评全落+PG切片2）
- 阶段：**P31 内测护航进行中**（①本机部分 ✅（v0.9.9 候选包就绪未发布，GitHub 发布待用户拍板；**v0.9.10 内容已成形在 dev 树**：四主线+离线升级通道+config 保全，发布说明草稿就绪），真机 POC 待用户（须知 docs/real-machine-poc-briefing.md——默认模式变化预期管理）；②收窄完成 ✅；③已就位；④收窄完成 ✅）

- 阶段：**P31 内测护航进行中**（①本机部分 ✅（v0.9.9 候选包就绪未发布，GitHub 发布待用户拍板；**v0.9.10 内容已成形在 dev 树**：四主线+离线升级通道+config 保全，发布说明草稿就绪），真机 POC 待用户（须知 docs/real-machine-poc-briefing.md——默认模式变化预期管理）；②收窄完成 ✅；③已就位；④收窄完成 ✅）

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
| s45/s46 | 外部技能市场（anthropics/skills 递归拉取安装+🌐UI）+ MCP 市场最小形态（精选目录/后台 npm vendor/写 extensions/bootstrap 保留 mcp-* 块）+ IA 重构 🧠 管理面板一级入口（s43）+ 项目须知.md（s44）〔2026-09-05 s67 勘误：该文件从未入库（git 全历史无痕迹，当时疑未提交即丢失），见 backlog 待建〕 | s43-s46 |
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
| s69 | **用户四主线落地**（2026-09-05~06）：①UI 猎捕 qa 26 条→两批修 24 条（d5a7d17/6fdecd8/91a674f，mpick 440px 渗漏根因+P1 加粗全废等，主控 IAB 实证）；②市场生态（afa8259 裁决→075ee4b 切片A 来源记录+冲突保护→a8d4f0e 返工(徽标XSS+原子安装)→83d150a 切片B 源配置化→5d79363 B2 subdir+baoyu 第二源激活→424bf39 切片C MCP 目录配置化→30882c2 终修(目录三消费方+孤儿卸载+cfg-key dirty)）；③goose 防护（c3f1bd0 research/12+裁决→e427402 S-B 扩展收窄 58→47 工具+T1→f7ffac6 S-C 手册配方→1188729 S-D→e5a2f4a S-A 审批链激活(smart_approve 默认+超时拒绝+never_allow)→2cb168f mcpEnabled 显示链）；④qa 三轮审查闭环+回归 e2e 45/45+fuzz 83/83；misc: 第二源选型 research/13(ad313d8)、goose 上游检查 v1.50 未发 | s69 |
| s73 | 用户四点批评当日全落（市场分页 09d5e59+源配置入口 1c9aad7+PG 切片1 forge 后端化 ddc4e92/5e970eb+解释提速 3f81354）；深夜续：离线升级 sha 通道 1c4a1e0+UI 两步向导 c8a1103+config 保全 64feedb+qa 返工 f6ec76a；v0.9.10 打包预演 ffd287f→重打包 d3f0df26（package.sh 排 .playwright-mcp 残留）；fuzz 冷启首红根因 research/15+88f01d6 就绪门；测试资产转正 18719b4（e2e 46）；**PG 切片 2 收口** 890c2df（归档索引+workspace-map 双表迁 PG，文件先行双写+P3-4 实修，fuzz 142）；终版包 36917748 首启探针 15/15；升级路径复演实证存量重置缺陷→发布说明诚实改写+手动备份步骤 | s69 journal 追加 |
| s74 | **信息架构根治**（用户三主线：视觉拥挤/归属错位/表无解释）：裁决 2026-09-07-ia-root-cure（R1-R4 规范+四切片+§10 主控修正 forge_table_info 改应用库内）cd5a69a；IA-1 35a2e69+返工（afed0cd 寄宿）；IA-2 840b0f0；IA-3 7ede8c2+afed0cd；qa P3×2 fde61e1；R1-R4 入 AGENTS.md §7（2dd38da）；agent 软约束 VERIFIED-RUN；环境事故=52 孤儿 goose mcp memory 进程（取证中）；e2e 46/46+fuzz 143/143 | s74 |
| s66 | **PG 阶段一+二落地**：ADR-0011(21068fa)→阶段一 d252478(pg-init/pg 两进程/动态端口/零依赖,qa 通过)→死词家族清账(停止脚本/update-runner,3da0502)→阶段二立轨+导出先行 4a2d54d+fc948e9+3409fc1(pg_dump 进树/每日备份链/探活 TCP/态B0 断言,e2e 升至 **45/45**)→沙盒打包验证轮(冷启真缺陷实锤修复,包体+289KB 压缩)→UI 令牌审计(--g 实锤,2e532c6)；postgres.js 取证/research 勘误全落档 | s66 |
- **v0.9.10 预览包（2026-09-06 s69 打包，未 tag 未发布，版本决策与 v0.9.9 处置归用户）**：dist/PocketForge-20260906-v0.9.10.zip（325,775,530B / 28,980 文件，sha256 437775aa4030239491d17a6eff31c75ec87d92fe1c6e57c2df53b21e477d0026）= dev 树 df9d814 全量；沙盒全新冷启冒烟全过：healthz 200 + pg Ready restarts=0 + pg-init Completed；fc948e9 路径直证（冷启 daily-backup exit 0、空 pg-dumps 被挡 zip 完整 8 条目；二轮启动 pg_dump ok 入 zip kept=2）；s69 六新面（①升级两步向导标记②skill-sources 双源③mcp-catalog 3 条④permission user 三键+browser_run_code_unsafe never_allow⑤CONTEXT_FILE_NAMES+四扩展 enabled:false⑥能力面板 enabled 与 config 一致含注释 config 读取正确）；停止脚本真停无 postgres 残留 + 二次启动幂等（PG_VERSION mtime 逐位不变）；dev 栈已恢复 node 实证（healthz/pg probe Ready）。本机测试注意：提权账户直启启动器 pg 必 crash-loop（PG 拒管理员运行，s66 已知家族）——沙盒验证须 runas /trustlevel:0x20000 降权包装，且重拉前必须清旧 wrapper cmd（s67 先例，本次再次实锤静默不执行）
- **v0.9.9 发布候选（2026-09-05 就绪，未发布）**：dist/PocketForge-20260905-v0.9.9.zip（**终版** 325,753,986B，sha256 aa22f7d6…490dbb4ed，含 dfe46b0+欢迎页📮终版）= v0.9.8 后 66 提交全量（停止脚本真修复/报告 v2/UI 五修复/PG 阶段一+二/每日备份链）；**验证三重**：沙盒全新冷启冒烟全过（fc948e9 守卫真实事故路径直证/重启幂等/报告零 PG 字节/停止无残留）+ v0.9.8→v0.9.9 升级路径演练（用户数据三态完好逐位校验；实锤升级期缺陷两枚见遗留）+ 终版聚焦复验（51MB 上传直证 dfe46b0/s50c 不回归）；发布说明草稿 docs/v0.9.9-release-notes-draft.md（含 v0.9.8 存量用户升级必读）；**GitHub 发布待用户拍板**（需 push+GH_TOKEN），直接拷 dist zip 侧载亦可
- ## 技术栈版本（全部 VERIFIED-RUN）
postgresql 17.11.0 (zonky 便携,bin/pg 四 exe 含 pg_dump,+36.1MB 压缩;pg_dump 来自 EDB zip 同源子集) / process-compose v1.122.0 / nats-server v2.14.5 / nats-cli v0.4.0 / faucet v0.1.12 / goose v1.46.0 (AAIF) / node v22.21.1 / python 3.12 embeddable (Pillow 12.3.0；openpyxl 不在包内——s47 实测，旧记录失实已修正) / isomorphic-git 1.41.9 (vendored MIT, ADR-0007) / DOMPurify 3.2.4 (vendored Apache-2.0, s15)

## 关键决策索引
ADR-0001 记忆拓扑 / ADR-0002 五件套技术栈 / ADR-0003 交付树+注册协议 / ADR-0004 E2E修订(rawsql oneshot+apps聚合) / ADR-0005 记忆四层架构 / ADR-0006 fork策略(默认不二开) / ADR-0007 制品工作区(每会话一区+isomorphic-git) / ADR-0008 工作区信息架构(双栏分层+生命周期+.forge)

## 开放问题 / 风险
1. 真实公司机差异（EDR、真实 PLM IE-mode）——待真机
- **s74 遗留（2026-09-07）**：①**52 孤儿 `goose mcp memory` 进程泄漏**（dev 实锤，清孤儿+桥重启恢复；谁 spawn/为何不收根因取证 research 进行中——若交付配置同样 enabled 则为产品缺陷，长期开机累进程；枚举/清理脚本 tmp/s74-goose-procs.ps1、tmp/s74-kill-orphan-mcp.ps1 可复跑）；②~~模式切换对进行中会话疑似不生效~~ → **s74 当日销账（VERIFIED-RUN）**：WS 钩子实证 set_mode 真实出站；回合间切换立即生效（auto 下建文件任务零权限卡直通完成）；早前观察=「回合中切换不影响当回合已排队审批流」——goose 按回合生效，合理设计非缺陷（产品提示文案「切自动干活」在回合中略有误导，P4 级 UX 备注，不立项）；③**.goosehints 物化纪律**：模板改动只在 bootstrap 启动期/打包期物化，dev 改模板必须重跑 conf/bootstrap.ps1 否则 agent 侧不生效（本日实锤）；④qa 备注 6 条留档 tmp/s74-qa-ia-review.md（slice(0,200) UTF-16 孤立代理项/dbRowel 竞态守卫无效[存量搬移]/db-q placeholder 措辞/:1295 注释陈旧等，均不判返工）；⑤deepseek-v4-flash 把「建个测试数据库」误读为连通测试（模型行为观察，护航留意妻子同款措辞风险；强语义措辞「在 faucet 里新增一个服务叫 X」无歧义通过）。
2. ~~chat-bridge :8790 无冲突探测~~ → s27 已修：EADDRINUSE 时探测占用者——自家实例（200 /api/update/status）提示"已在运行"退出 0；其他程序提示"端口被占/重启电脑"。实测双分支
3. ~~权限请求 UI 简化版~~ → s19/s22 已完成：对话流内确认卡端到端 VERIFIED-RUN（approve 模式真会话验证）；permission.yaml 工具名前缀与 goose 内部名核查一致。遗留认知：goose 出网受 Windows IE 系统代理影响（目标机若装代理软件需 NO_PROXY=127.0.0.1,localhost——pc 注入链已覆盖）
4. ~~新对话模型回落服务商默认~~ → s26 已修：前端 subscribe 携带当前模型，桥在新会话 resolve 后 set_config_option；GUI 验证通过
5. welcome 页在无默认浏览器关联的极端机器上不弹
6. junction 以绝对路径存储：forge 整体搬家后链接失效（ADR-0008 复核条件）
7. ~~e2e.sh 未覆盖聊天客户端链路~~ s18 已落地 tools/e2e/e2e-chat.sh（18 断言，含搜索）；WS 消息链路（prompt 往返/工具卡）s22 真会话已人工验证

## 交付物验收线（全 ✅）
解压即用 / 双击启动 / 零系统污染 / 自然语言取数入库做应用 / 重启回来 / 干净卸载 / 记忆便携 / 调度 / 视觉辅助 / 制品预览+本机打开 / 斜杠命令 / 文件树+上传+@引用 / 每会话工作区+版本管理+一键恢复 / 工具调用大白话解释 / 会话归档删除生命周期 / 浏览全部检索 / 目录树轻量文件管理 / 三轮代码审查 8 维度通过

## 路线决策（团队拍板，2026-08-28；内测期阶段 = 验证优先于扩张）
- **P31 内测护航（当前周期）**：①真机 POC 打包与护航（新包 → C:\PocketForge-Test 全流程启动 → 首任务冒烟）——**本机部分 s47 ✅ + s50 ✅ + s53 ✅（v0.9.8 护航候选包，沙盒全新部署+首任务实景冒烟通过）**，真机环节：用户 2026-09-05 确认"妻子可以打开运行"（启动 ✅），任务链/EDR 细节待护航反馈；②首个任务向导——**s51d 裁决收窄并落地：任务类型选择层已被 s33 chips+s48 报表卡实现（冻结，新增类型挂 P32）；本轮=配 Key 引导条（无 key 检测→引导条→现有 ⚙️ 面板，配好即消），GUI 双态实景 A1-A4 全过；s53 沙盒复测 A5(401兜底)/A7(重启后首任务) ✅ 全闭环**；③匿名本地使用统计（每天一次记录活跃会话数/报错计数/卡点关键词 → 驱动 P32+ 决策）——**s49 v1 已就位，s50e 增 upstreamByKind 细分**；④多线路韧性——**s50e 裁决收窄：401 自动切换永久裁掉（配置问题非线路问题），全自动 failover 裁掉；落地=错误细分计数+401 人话指引+「换备用线路再试」一键（零自动）；半自动准入：护航≥2周且 upstream 错误≥10次 且换线成功率≥50%**
- **s47 冒烟新增候选**：~~node 绝对路径调用反复失败~~ → s47b 已修（hints 重教+gen-xlsx 加固，v0.9.5）；桥注入 PATH/FORGE_ROOT（P31-④ 相关，需目标机 `where node` 验证）；~~文件树任务后自动刷新（UX）~~ → s52b 已修（ACP stop 分支挂 renderCurPane，0cc98c0）；~~gen-xlsx 位置参数「标题」无效~~ → s52 已修（接收为 spec.title，JSON 内 title 优先，双断言验证 7d35690）
- **s69 遗留（2026-09-06 收口）**：①**升级路径 config.yaml 丢失**——64feedb PROTECTED 修复仅保护「由 v0.9.10 新 runner 执行的后续升级」；**v0.9.9→v0.9.10 存量路径复演实证仍丢**（升级执行者=旧 runner，运行中不换代码；能力开关/mcp-* 注册/记忆库实测被重置，backup manifest 铁证）。主控裁决：发布说明诚实改写+「升级前手动备份 conf/goose/config/」步骤（内测期护航者执行，放回后 bootstrap 合并保留已实证）；**桥端升级前自备份设计入 v0.9.11**。同批新账：升级器静默挂死 1 次（P1，stop 后 17min 进程消失未复现，修复候选=runner 落盘日志+阶段心跳+总超时回滚）、main() 未 await stopStack() 清杀/重启并发竞态（P2，v0.9.9 runner:241 与 dev 树同在）、MCP 商店安装裸 npm.cmd 依赖 PATH（P2，真机 PATH 注入覆盖与否待验证=STATE s47 遗留④同题）；②scheduler 注册副本漂移：改源配方不传导已注册任务（触发时读 conf/goose/data/scheduled_recipes 副本），G4 的 max_turns 对已注册 daily-mem 未生效——该任务当前 paused 零风险；**重新启用前必须 schedule remove+add 重注册**（会使 PAUSED→ACTIVE，已写进手册铁律）；③孤儿 postgres checkpointer 进程（e2e 期 21:51 遗留占共享内存致 pg crash-loop、pc process stop 恒退 1，手清恢复）——pc Windows 进程树回收观察项；④/api/extensions POST 写侧行扫描把顶格注释当块尾、与 readExtState 读侧分叉（历史遗留，qa P3-7；写路径敏感暂不动）；⑤denied 计数口径漂移（超时 reject_once 计入 denied、timeout 恒 0，护航统计时留意）；⑥会话号勘误：本日会话实为 s69，子智能体部分 commit 误标 s70/s71/s72（075ee4b/83d150a/5d79363/424bf39/e5a2f4a/a8d4f0e/30882c2），同会话连续工作，编号漂移不影响 git 追溯；⑦goose 启动会自写 permission.yaml 规范化（user 块前移+load_skill 入 ask_before）——运行时共写已追认（4b1e999），模板=首启种子，手改 permission.yaml 必须三键齐写（缺即 panic，research/12 §3.3）。
- **PG 阶段一/二遗留（s66-s67）**：①update-runner 死词已修（3da0502）；②readiness 改 TCP 探活（4a2d54d）；③本机降权包装已操作化（e2e.sh runas，8054c40；目标机标准用户无此问题）；④checksums 口径已统一（regen 幂等，8054c40）；⑤FORGE_ROOT 含空格 pc yaml 未加引号（既有家族，真机护航观察）；⑥pc restarts 计数会话累计不重置（随首消费者翻转复核）；⑦dev/沙盒 pc.port 同值跨杀（既有家族；停止脚本已加确已停校验 8054c40）；⑧pg.log 探针噪音已修（b0d78bd 优雅半关归零）；⑨离线升级 sha256 通道缺口已裁决收口（docs/verdicts/2026-09-05-offline-upgrade-sha.md：c 方案=桥端上传自算自验 .sha256+zip 魔数预检+字节数对账+失败清理，runner 零改动小白单文件，随 v0.9.10 实施，8 条验收清单在裁决书；一并关闭 upload 不校验内容留垃圾暂存问题）
- **P32 候选（对标输入，research/11）**：①数据主权用户话术（Manus 2026-08 数据删除事件=本地便携形态的实证论据；载体注意：项目须知.md 从未落库【s44 声称已建，勘误见周期表】，届时需先建该文件或改挂使用说明）；②Plan Mode 三要素（随时/蓝图可编辑/确认执行）作任务选择层解冻的设计输入——**s69 已出设计输入 research/14 + 解冻裁决 docs/verdicts/2026-09-06-plan-mode-thaw.md（切片①暂不解冻；触发器 T1 意图错配≥2 次/T2 单任务卡≥8 张且误触/T3 护航≥2 周成功率<50% 或同类重复≥3 次/T4 用户点名；重开时设计起点=research/14 §6 不重新归约）**
- **backlog（对标输入）**：MCP 商店选型加"检查包 MCP SDK 大版本"护栏（2026-07-28 stateless 规范与 goose 旧 spec 协议错位风险，风险入口=第三方包升级）；~~Letta"文件即记忆"基准~~ → s69 已独立验证（research/16：方向收敛可作 ADR-0005 方向性佐证[VERIFIED-DOC]，74.0% 厂商数字不可引用；MemFS 已有 skills 层[原假设修正]，缺制品工作区与项目级共享拓扑）；OpenClaw WATCH 降为仅跟踪安全态势（CVE 集群）
- **P32 数据驱动**：据使用统计决定（候选：真机 PLM 适配、工作流模板、日程提醒）
- **裁减原则**：~~商店/插件类扩张挂起至真机验证后~~ → **s69 裁决细化（docs/verdicts/2026-09-05-marketplace-ecosystem.md §3）**：「机制开放化」解除挂起并已落地（源/目录配置化、来源记录、subdir 多源）；「内容扩张」维持闸门制逐个进（第二源 baoyu-skills 已过闸首例；新 MCP 需真实需求+四条准入闸门）；内测用户反馈是第一输入源，路线裁决权在团队
## Backlog（对标研究提炼，ADR-0010 复核条件）
- **观察项**：栈冷启后首跑 fuzz 偶发 1 红、热跑稳定全绿（s61/s63/s64 三次复现；s65 主动冷启复现未中，第 4 数据点）——s64 已加固留痕（fuzz-chat.sh 全量输出恒写 tmp/fuzz-last.log），下次复现先查日志归因，再立专项
- **观察项（s66·验证陷阱，重要）**：Bash 工具环境对 127.0.0.1 目标存在**沙盒代理假响应**——服务宕机时 curl 仍得恒定 2.0s 的 200（代理连接超时回退）；s66 收尾因此漏判 dev 栈已宕（runas 重拉静默失败+curl 假 200 双重叠加），node 直连/netstat/IAB 三方才见真相，已恢复。**纪律：验服务生死用 node 直连/浏览器/netstat，禁止采信 Bash curl 对本机端点的 200**；自动化探针同理（node 一行为准）
- **观察项（s66）**：pg.log 探针噪音~~约 4.3MB/天~~ → s67 已修（b0d78bd：探针优雅半关消源，实测增速归零；pg 每次重启 pg.log 自动清零属 pc O_TRUNC 语义，per-process 轮换能力已核实备用）；data/sqlite 空目录理论竞态（观察）；~~runas wrapper 静默不执行~~ → s67 已操作化（重拉前清旧 wrapper，8054c40/e2e.sh）；~~checksums 口径分叉~~ → s67 已统一（机器单一真相源 regen 幂等，8054c40）
- **观察项（s65）**：侧栏「已归档 N」的 N=goose session/list 返回窗口大小（实测 50）而非库内归档总数——会话少时无感，规模化后属信息精度问题（主线 4 族）；~~e2e 第 12 节沙箱探针 rmSync 间歇 EPERM~~ → s65 已修复（轮询重删 6ec8c29，取证结论 tmp/forensic-rm-perm 可复跑）
- **s64 报告 v2 遗留**：~~报告探针转正~~ → s65 已转正（tools/e2e/report-probe-*.js，e2e-chat 第 12 节，s69 复核销账）；体积硬顶 head 段超限角落已注释标注（P3-1，产品路径不可达）
- **PG 阶段二 doctrine（s66 裁决生效，实施中）**：①新存储默认 PG，每应用一库 forge_<app>，禁跨应用共享写；②首行业务数据三件套同提交（客户端 vendored+schema_migrations 注册表+恢复工具入树）；③导出先行恒在（pg_dump 每日随 forge-backup，plain SQL 落 data/pg-dumps keep 3）；④消费方失败面闭合集（回落文件/降级禁用/论证否则否决；lazy 连接、connect ≤2s、桥零 depends_on 指向 pg）。客户端 pin postgres.js 3.4.9（Unlicense；pg 8.23.0 MIT 后备）。回退阶梯 L0=删 data/pg+bin/pg+备份三行；L1=pg_dump 导出后重建。**范围勘误（对 ADR-0011）**：阶段二"迁移对象按价值排序"前提被 scale-inventory 掏空——迁移清单=空全部转触发制；"消息检索=用户痛点"未证实（用户点名的是 PG/正经后端）
- **阶段三门槛（定死，防重新谈判）**：①同步=ACP stop 事件增量+启动对账+桥硬删同步删索引（正确性+隐私双红线）；②检索=PG 可达走全文/不可达回落既有 LIKE；③隐私=会话正文进 PG 需删除传播设计+welcome 存储描述更新。触发器：真机消息量逼近 1 万 或 妻子搜索负反馈；都不满足无限期挂起
- **PG（已立项，ADR-0011，2026-09-05 用户批准）**：白名单扩列（PostgreSQL License/ISC）已裁决通过；三阶段路线=①zonky 便携 PG 进树+process-compose 托管（initdb 非提权/UTF8/C locale）→②自建应用首选库（消息检索>索引>统计；不动 goose/faucet 内部 SQLite——零二开纪律）→③/api/search 迁 PG 全文检索（FTS5 条目作废）。阶段一沙盒实测：initdb 耗时/EDR 对 postgres.exe/pg 客户端 vendored
- ~~s64 后 UI 候选：浏览全部卡片列表无上限~~ → **s65 勘误撤销**：renderAllPane 自 P29 起即有 PAGE_N=30 分页+翻页器（s65 工程师零 diff 裁决，主控复核代码确认——此前条目是主控未核实就归约的错误断言，引以为戒）；真实缺口（若有）待 pm 重新归约
- ~~s65 遗留：e2e 第 11 节 ws-delete-receipt.js EPIPE 竞态~~ → **s69 复核销账**：a3adb0d（s65 当日）已改 tmp 文件落地后 grep，管道已不存在（下轮小批夹带字样系 STATE 未同步，非未修）
- **goose 升级窗口（research/04 s64 情报）**：不追 v1.49.0；护航窗口距 v1.50 预计发版（~09-09±3）≥3 天则等 v1.50，否则取 v1.48.0；**09-06 检查点：latest 仍 v1.49.0（09-03），窗口未开**；升级前重建缺失的 goose-upgrade 预案文档（research/04 已勘误挂缺失），回归五面清单已落 research/04（s69 S-D 又补面6 转储巡检+面7 G7）；三条红线（scheduler persist/schedules ACP/GOOSE_PATH_ROOT）v1.46→v1.49 源码级未动；**新增升级必查（s69）：permission.yaml 三键齐写（缺即 panic）+#11477/#10285 对 ask_before/never_allow 前缀命中的影响（G1/G5 清单失配=审批链静默失效）**
- **s61 遗留**：~~typing 动画无 prefers-reduced-motion~~ → s64 已修（67b871d）；~~explorer /select 不抢前台焦点~~ → s64 裁掉（SHOpenFolderAndSelectItems 无"不激活"旗标，explorer 无后台参数，workaround 40+ 行入桥模板复杂度不成比例且弹窗是 pm 原裁决行为；官方文档证据在 67b871d 交付记录）；qa 布局矩阵跳过 3 条（全归档/无 key 态/confirm 窄窗）按需补跑
- ~~s55-57 断根裁决遗留：定时任务删除按钮守护盲区~~ → s58 已补；~~vendor 目录名漂移（mcp-memory/mcp-seqthink 孤儿目录）~~ → s59b 已清（全仓无引用+卸载路径自愈），本条历史遗留关闭
- 工作区级「项目指令」（对照 Manus Projects master instruction）：.forge 元数据扩展 + prompt 注入，首月低频故 backlog
- 多会话并行任务（Manus Wide Research 式）：妻子场景低频，backlog
- /api/search 升级 FTS5：消息量 >1 万条时
- ~~MCP 商店最小形态~~ → **完成**：s46 落地商店机制（sequential-thinking/memory-graph），s54 补 fetch（fetch-mcp@0.0.5 MIT，官方 server-fetch 无 npm 包，选型实测后入目录；GUI 实景：安装→重启挂载→goose 调 fetch_url 抓页正确回答）。Backlog「入口数据源扩 components.yaml」未做——现目录硬编码于桥内（3 项），项数稳定无需求，按需再议。
- skill 商店远程化：skills-repo 与 GitHub repo 同构，sync 即得远程技能源（s42 已预留）
