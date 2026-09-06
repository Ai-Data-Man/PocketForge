# 2026-09-05~06 s69 — 用户四主线：UI 猎捕 + 市场生态开放化 + goose 防护 + qa 闭环

> 编号勘误：本会话为 s69；子智能体部分 commit 误标 s70/s71/s72（075ee4b/83d150a/5d79363/424bf39/e5a2f4a/a8d4f0e/30882c2），同会话连续工作，git 追溯不受影响。

## 主线1：UI 残次猎捕（用户点名：提供商页模型勾选与文本对齐差）
- 主控 IAB 实景钉死根因链：`#model-pool` 嵌在 `.frow` 内，`.frow input{width:100%}`(chat.tpl.html:233) 把勾选框拉宽到 **440px**（computed style 实测），文本被挤到第二行、勾选图形画在超宽框中部。
- pf-qa 静态猎捕 26 条（P1×1/P2×12/P3×13，tmp/s69-qa-ui-defects.md）：P1-1 `**加粗**` 渲染全废（split('**').join('</b>') 永不产生开标签，星号被吞+流式跳变）等。
- 两批修复 24 条：d5a7d17（P1-1 成对包裹/四处 esc/下拉冒泡复开/mpick 族两层修：`.frow>input` 拆 width、`.mpick` flex+accent-color 令牌）+ 6fdecd8（模态 ✕+Esc/粘性滚底 nearBottom 先测后加/版本时间线样式/busy 护栏/夜间对比度 --acc-contrast 等 16 条）；主控补 91a674f（/新对话 slash 走 newchat 入口）。
- 主控 IAB 实证：勾选框贴行齐整、✕ 钮 aria 关闭、Esc 关最上层、max-width 生效、面板巡检 7 页全过。
- 留账：P2-10 键盘可达、P2-11 读屏语义、P3-4 内联 px 字号令牌化、P3-13 preview.html 主题化（体量大，下波）；P3-6 endStream 错误卡滚底主控裁决维持现状（可见性优先）。

## 主线2+3：市场生态开放化（裁决书 docs/verdicts/2026-09-05-marketplace-ecosystem.md，afa8259）
- pm 归约：真问题=生态入口被硬编码（机制缺口）+安装无来源记录（缺陷级：cpSync 可静默覆盖 agent 自沉淀技能）；「源少/不分页/不入 PG」=表象。机制开放化解除挂起，内容扩张维持闸门制；PG 入裁决否决（七条否决防重谈判）。
- 切片A（075ee4b+a8d4f0e 返工）：`.agents/skills/<dir>/origin.json` {_schema:1, source: market|self|local, repo, branch, installed_at}，STATE_SCHEMAS 注册+逐目录迁移；冲突语义 market-over-self 拒（人话）/market-over-market 覆盖=更新；徽标 🌐源名/✍自己攒的/无标=本机；返工补：徽标 title esc（agent 可写 origin.json=存储型 XSS 向量）、installAtomic 三路同门（tmp→.bak→换名，失败旧版完好）、writeSkillOrigin 不假成功。
- 切片B（83d150a）：REMOTE_SKILLS 常量→data/config/skill-sources.json 文件驱动多源（首启生成默认/容错回落/manifest _schema:2 迁移带 source）；**运行时实锤顺修 migrateJsonAt const→let 崩溃**（首个真迁移步骤函数下必崩，pc 崩溃循环 38 轮实证）。
- B2（5d79363）：subdir 白名单 subdirSafe+激活第二源 **JimLiu/baoyu-skills**（research/13 选型过闸：MIT/双语/21 技能布局合规/223 份 SKILL.md 注入扫描零命中；K-Dense 许可污染整仓否）；双源合并 40 条、同名跳过留痕、真装 baoyu-translate 全链+徽标实证（主控 IAB：42 条商店列表在线）。
- 切片C（424bf39+30882c2 终修）：MCP_CATALOG 常量→data/config/mcp-catalog.json（四条准入闸门留档，真实第 4 枚不承诺）；qa 复审抓「配置化半途」：/api/extensions 三消费方仍读常量+卸载 !item 短路致孤儿 MCP 无法移除——已修（readMcpCatalog 三处+卸载只认 config.yaml 实存块+dyn 兜底）。
- 切片D（分页）挂起触发器制：任一市场清单 >50 项或实测卡顿，预案=P29 PAGE_N 复用。

## 主线4：goose 透明度与破坏性防护（research/12 + 裁决书 docs/verdicts/2026-09-05-goose-guardrails.md，c3f1bd0）
- researcher 源码级三实锤（v1.46.0 clone 走代理+生产 RequestLog 转储+双臂对照探针）：①桥 spawn 钉 `GOOSE_MODE:'auto'`（env>config）压过 config smart_approve——**permission.yaml 25 项 ask_before 自 P12 起从未生效**；②auto 下五道 inspector 全不设防（Security 默认关/Egress 恒 LOG/Repetition 无上限/Permission 恒 Allow/shell 无沙盒），定时任务被上游硬编码 Auto+max_turns None 更松；③dev 机整份开发 AGENTS.md 正被吸进生产 goose system prompt（cwd=FORGE_ROOT 上溯 git 根），**此前所有冒烟/e2e 跑在被污染上下文里**，结论对目标机不可比。工具清单实测 58 把 44KB。
- 四切片落地：S-B（e427402）extensions 四平台扩展 enabled:false（双臂探针 VERIFIED-RUN，58→47 把）+CONTEXT_FILE_NAMES:['.goosehints']（T1，转储复验 Project Hints 空）；S-C（f7ffac6）手册三节+定时配方 max_turns:10+「新配方必带 max_turns/登录类任务不得定时」铁律；S-D（1188729）升级 playbook 补转储巡检法+G6/G7；**S-A（e5a2f4a）审批链激活**：删 GOOSE_MODE 钉死（含 pc yaml 第二注入点+spawn 剥离父 env 兜底）、60s 超时 allow→reject_once（文案承诺一致性）、never_allow=browser__browser_run_code_unsafe 进 user: 段（源码改判：smart_approve 段 never_allow 仍出卡，仅 user: 段直通 Deny）+raw_sql 进 ask_before（never_allow 误伤 scrape-table-to-db 实锤否决）；探针补 request_permission 自动应答+PERM_ROUNDTRIP 断言。验收：默认 smart_approve/出卡→批准→完成/denial 零卡/一键 auto 逃生口全实证；T3 挂起（tom.rs 进程级 env，强迁=跨会话污染）。
- mcpEnabled 显示链恒真（S-B 前置顶格键使 s57 头扫描失效，2cb168f 收敛 readExtState 门禁，双臂实证）。

## qa 闭环与回归
- 三轮审查：切片A+UI批一（Ready=No→2P2 修复）、最后四批（Ready=No→P2-1 目录配置化半途+P2-2 cfg-key dirty 跨档案 Key 覆盖，30882c2 修复带 9/9+10/10 自证+钉子 3 断言）。
- 终态回归：**e2e-chat 45/45 + fuzz 83/83 全绿**（fuzz 基线 44→83，+39 断言全走真实分支）。

## 环境事故与新账（STATE s69 遗留行）
- 孤儿 postgres checkpointer 进程致 pg crash-loop+pc stop 恒退 1（手清恢复，pc Windows 进程树回收观察项）。
- 升级路径 config.yaml 被删重建（s17 开关/s46 商店块升级即丢）——既有缺陷，随 v0.9.10 升级批修（与离线 sha 通道同车）。
- scheduler 注册副本漂移：改源配方不传导已注册任务；daily-mem 当前 paused 零风险，重启用前必须 remove+add。
- goose 启动自写 permission.yaml 规范化——追认入库（4b1e999），三键齐写纪律入 research/12。

## 方法论沉淀
- IAB evaluate 字符串按表达式语义执行（函数字面量不调用→假成功），IIFE 是可靠形态；产品模态层覆盖底栏按钮时先等效关闭再点。
- 双工程师并行按文件划片（tpl.html/tpl.js 分开），同文件任务严格串行。
- 「配置化」切片必须穷尽常量的全部消费方（本日 P2-1 半途教训——fuzz 断言只打一个协议面恰好绕开其余三个）。
- goose 上游检查点（09-06）：latest 仍 v1.49.0，v1.50 窗口未开。

## 追加（同日续，凌晨~清晨波次）

### 离线升级通道收口（v0.9.10 升级批）
- sha256 通道（1c4a1e0）：/api/update/upload 双形态（zip/.sha256）+ sha256File 流式哈希自算自验 + 魔数/字节/哈希三重校验 + .part 原子落位（成功才 rename）；实施中抓 Node≥16 'close' 早于写流 finish 的竞态真缺陷（Windows 未释放 fd 致 .part 残留）——只拦"没读完就断"+清理挂 close 后。fuzz +17。
- config 保全（64feedb，s69 遗留①修复）：update-runner PROTECTED 增 config.yaml/custom_providers/conf/goose/config/memory——升级包不含它们、此前被差量按 deleted 删盘→bootstrap 纯模板重建丢 s17 开关与 mcp-* 块（沙盒 8/8：真实 bootstrap.ps1 跑通合并路径，对照组复刻旧缺陷）。permission.yaml 不保全=有意（护栏默认靠升级送达）；data/config/* 天然幸存。
- UI 两步向导（c8a1103）：两行独立 accept（.zip/.sha256）把选错文件拦在对话框层，六态人话文案；主控 IAB 实景确认。
- qa 第二轮返工（f6ec76a）：IME 组合期 ↑↓ 被菜单劫持（中文用户真回归，isComposing 早退守卫+桩测 23/23）；**第二源进交付默认**（dft() 双源+_schema:1→2 迁移追加，边界=用户手工删过会被补回一次）；上传错误人话化不泄漏绝对路径；64KB 超限断言；.part wx 独占创建。
- **裁决书正文缺失事故**：s67 af4e007 只写 verdicts/README 索引行、正文从未落盘（s44 项目须知同族事故第二例）——s69 补档重建（b54cf15），教训：**「已归档」必须 ls 验证文件在库，不许只看 commit message**。

### v0.9.10 打包预演（ffd287f，未 tag 未发布）
- dist/PocketForge-20260906-v0.9.10.zip：325,775,530 B，sha256 437775aa…026，28,980 文件，基线 df9d814。
- 沙盒全新冷启全绿：healthz/pg Ready restarts=0/pg-init Completed；fc948e9 守卫两路径直证（冷启 skip/二轮 dump kept=2）；**s69 六新面入包全证**（两步升级向导/双源首启/mcp-catalog 3 条/permission user: 段+never_allow/CONTEXT_FILE_NAMES+四扩展关停/mcpEnabled 修复）；停止真停无残留；二次启动 PG_VERSION mtime 逐位不变。零阻断缺陷。
- 观察项：首启 skill-sources.json 写 _schema:1、次启迁移补盖 _schema:2（功能无损）。
- 发布决策材料：发布说明草稿已转正（占位段清零+制品指纹），v0.9.9 未发布件处置+是否 tag/发布归用户；发布前仍需复演 v0.9.9→v0.9.10 升级路径（s67 先例）。

### P32 Plan Mode 设计输入（research/14，3f2de74）
- 三要素推荐：①随时可入=「先出计划」入口+规划提示词模板（蓝图=ws/计划.md，s50 通道桥零改动）先做；②蓝图可编辑=文件树/预览/版本管理全套既有；③确认后执行=确认条本质是重发确认消息，不引新协议；执行态维持 smart_approve 权限卡，确认计划不免卡。
- **裁决勘误**：goose-guardrails「todo 是 ACP plan 事件语义来源」失实（v1.46 全树零 SessionUpdate::Plan 发射点）——保留 todo 裁决不变（moim 持久清单独立成立），P32 不得依赖 plan 事件（勘误已注裁决书）。
- goose 原生 /plan 工作流不可照抄（确认执行=清历史+全局切 Auto，与 ADR-0001/s69 安全默认冲突）。

### 收官态
- 回归：e2e-chat 45/45 + fuzz 102/102；树净；dev 栈 node 实证健康。
- 待用户拍板：v0.9.9 未发布件处置、v0.9.10 是否 tag/发布（升级路径复演+发布说明终稿随发 publishing 前）。

### 追加（同日晨）：fuzz 冷启首红根因结案（research/15 + 88f01d6）
- 根因 VERIFIED-RUN：桥 server.listen 早于 goose ACP initialize（:445 异步无 await），/healthz 无条件 200——healthz 通过≠能受理 session/new；fuzz 唯一 ACP 依赖面 ws-fuzz-s50h 矩阵在就绪窗口超 10s 即红，矩阵恒折 1 行=「恰好 1 红」，复跑 goose 已热（2.2s）故全绿。pc.log 实录 listen→ACP-initialized 10.1s/12.8s/150.8s 括号夹逼。
- 修复分档：tools 侧就绪门已落（88f01d6：ws-fuzz-s50h+ws-delete-receipt 连 WS 读 hello 帧 caps.modes 门，退避重连 deadline 45s；真实重启窗口实证门等待后 11/0 绿）；桥侧 /healthz 就绪前回 503 入 v0.9.10 后批次（readiness_probe 语义诚实化）。backlog 观察项销账。
- 测试资产转正（18719b4）：ui-logic-probe（kbd/IME 23+模态关闭 10=33ck，入 e2e-chat 第 14 节）+ cold-surface-probe（发版前沙盒六新面 15ck，参数化 PF_ROOT）；e2e 基线升 **46/46**。
- v0.9.10 打包预演（ffd287f）：dist/PocketForge-20260906-v0.9.10.zip sha256 437775aa…026，沙盒冷启零阻断，六新面入包全证；发布说明草稿转正+真机护航须知入库；v0.9.9 未发布件处置与 tag/发布归用户。

### 追加（同日上午）：v0.9.9→v0.9.10 升级路径复演（发布前最后一块验证）
- 全链走通：v0.9.9 沙盒部署→造用户态三样（能力开关标记/mcp-fetch 安装/测试记忆）→**325MB 真包走新离线升级通道**（zip 上传 200 1.2s；.sha256 旧桥拒=预期，手工放置）→升级完成 7.5min→断言。
- **阻断级实证（推翻发布说明表述）**：「设置类用户态在存量升级路径被重置」——能力开关回模板默认、mcp-fetch 注册丢失（vendor 目录侥幸孤儿在盘）、测试记忆被删；铁证=旧 runner backup manifest deleted 含 config.yaml/memory。根因链：升级执行者是 v0.9.9 旧 runner（运行中不换代码），64feedb 的 PROTECTED 只保护由新 runner 执行的升级（v0.9.10→未来）。**主控裁决**：发布说明诚实改写+「升级前手动备份 conf/goose/config/」步骤（内测期护航者执行）；桥端升级前自备份设计入 v0.9.11。
- 好消息：data/ 用户数据完好；s67 缺陷2「升级后假成功」窗口在本通道不复现（runner healthz 按版本匹配判定）；护栏四新面经模板重建全部送达（never_allow/CONTEXT_FILE_NAMES/smart_approve/两步向导）。
- 新账入 v0.9.11 台账：升级器静默挂死 1 次（stop 后 17min 进程消失，未复现，P1——落盘日志+心跳+总超时回滚为修复候选）；main() 未 await stopStack()（清杀与重启并发竞态，P2）；MCP 商店安装裸 npm.cmd 依赖 PATH（打包栈受限令牌必失败，真机 PATH 注入覆盖与否待验证，P2）；package.sh 排除 .playwright-mcp 残留（0bb9852，重打包 28,955 文件，新 sha d3f0df26…6c98）。
- 发布就绪结论：v0.9.10 预览包（重打包版）+ 发布说明诚实版 + 护航须知齐备；**是否发布/打 tag 归用户拍板**。

### 追加（同日下午）：用户四点批评全部落地（s73 波次）
用户批评：①擅自停工（20:00 底线）②分页不理会③源配置无入口④PG 未作 forge 后端且无回应。全部接受并当日落地：
- **分页**（09d5e59，用户点名推翻切片 D 挂起）：技能/插件市场三列表分页（SKILL_N=12，42 条=4 页）+搜索框置顶+「没有找到」空态；附带修掉空已装清单看不到商店的旧 bug。
- **源/目录配置入口**（1c9aad7，推翻否决项 4）：/api/config/market GET/POST（六 op，同门校验+原子写+守卫）+管理面板插件页「数据源与目录管理」两栏区块（闸门责任声明）；过程自纠两自产缺陷（mcp-remove 丢 splice 假成功/skill-add 容 .. 穿越）。
- **PG 作 forge 后端**（ddc4e92 裁决推翻 marketplace-S5 + 5e970eb 切片 1）：桥存储层单模块（lazy ≤2s/30s 重探/四态失败面闭合）+forge_bridge 库（schema_migrations+迁移前 pg_dump）+usage 统计首迁（双写文件先行、读路径零 PG、回迁幂等）+psql/postgres.js vendored+forge-backup 扩 pg-bridge-* dump+管理面板「数据存储」三态人话块（edf1192）。八条验收全过（含恢复演练/双态冷启/连接超时 2006ms 实测）。切片 2-4 路线在裁决书。
- **「这是干啥」提速**（3f81354，用户点名慢）：根因=复用主对话推理模型（实测思考 3358 字符/23.5s）+非流式+无缓存；9Router 源码确认 deepseek-v4-flash thinkingCanDisable:false（reasoning_effort:none 钳 minimal 实测有效）；修复=reasoning_effort:'none'+LRU 缓存 200+SSE 流式增量+思考秒数反馈+12s 兜底。实测首字 11.7s（模型上限）→重复点击 1ms。
- qa 第三轮返工（c47e357）：流式监听器泄漏（一泡一监听器）/skillSyncDirty 补跑（源变更撞在途 sync 不再丢）/坏源降级跳过+stateWarnings 人话告警（假源→告警→自愈全链实景）+四 P3。
- 死端点清理（664181b）：/api/ws/bind（s14 遗留，前端实际用 /api/ws/link）——挖掘自查产物。
- e2e 断言修正（ab5ba53）：PG 切片 1 三族 dump 共存使旧 keep-3 glob 误红，收窄 pg-[0-9]*。
- 终态回归：**e2e-chat 46/46 + fuzz 138/138**。
- 挖掘模式内化：user-excavation-mode 记忆（五条自查清单）+端点孤儿自查。
