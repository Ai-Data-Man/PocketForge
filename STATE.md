# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-08-27 深夜（s17 能力中心+ADR-0010+CSRF修复；s18 e2e-chat 16断言；s19 权限确认卡落地+护栏链路取证。待续）
- 阶段：**P0–P30 全部完成**；产品可交付且具备自升级能力

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
| s17 (ADR-0010) | 能力中心+记忆可视化:设置面板新增「它会什么」扩展开关(数据库/浏览器/长期记忆)、「小forge记住的事」查看+删除(直读memory/*.txt,与MCP语义一致)、「安全护栏」大白话说明;/api/extensions+/api/memory;bootstrap保留用户开关值;审查轮:HTTP层Origin校验补齐(s15只修WS,恶意网页可跨站POST删记忆/触发升级)+空记忆分类过滤;GUI昼夜双主题断言通过 | s17 |

## 技术栈版本（全部 VERIFIED-RUN）
process-compose v1.122.0 / nats-server v2.14.5 / nats-cli v0.4.0 / faucet v0.1.12 / goose v1.46.0 (AAIF) / node v22.21.1 / python 3.12 embeddable (openpyxl/Pillow) / isomorphic-git 1.41.9 (vendored MIT, ADR-0007) / DOMPurify 3.2.4 (vendored Apache-2.0, s15)

## 关键决策索引
ADR-0001 记忆拓扑 / ADR-0002 五件套技术栈 / ADR-0003 交付树+注册协议 / ADR-0004 E2E修订(rawsql oneshot+apps聚合) / ADR-0005 记忆四层架构 / ADR-0006 fork策略(默认不二开) / ADR-0007 制品工作区(每会话一区+isomorphic-git) / ADR-0008 工作区信息架构(双栏分层+生命周期+.forge)

## 开放问题 / 风险
1. 真实公司机差异（EDR、真实 PLM IE-mode）——待真机
2. chat-bridge :8790 无冲突探测（Origin 校验已加，端口冲突仍无）
3. ~~权限请求 UI 简化版~~ → s19/s22 已完成：对话流内确认卡端到端 VERIFIED-RUN（approve 模式真会话验证）；permission.yaml 工具名前缀与 goose 内部名核查一致。遗留认知：goose 出网受 Windows IE 系统代理影响（目标机若装代理软件需 NO_PROXY=127.0.0.1,localhost——pc 注入链已覆盖）
4. 新对话模型回落服务商默认（goose 会话语义）
5. welcome 页在无默认浏览器关联的极端机器上不弹
6. junction 以绝对路径存储：forge 整体搬家后链接失效（ADR-0008 复核条件）
7. ~~e2e.sh 未覆盖聊天客户端链路~~ s18 已落地 tools/e2e/e2e-chat.sh（16 断言，1311c83）；WS 消息链路（prompt 往返/工具卡）仍靠人工

## 交付物验收线（全 ✅）
解压即用 / 双击启动 / 零系统污染 / 自然语言取数入库做应用 / 重启回来 / 干净卸载 / 记忆便携 / 调度 / 视觉辅助 / 制品预览+本机打开 / 斜杠命令 / 文件树+上传+@引用 / 每会话工作区+版本管理+一键恢复 / 工具调用大白话解释 / 会话归档删除生命周期 / 浏览全部检索 / 目录树轻量文件管理 / 三轮代码审查 8 维度通过
