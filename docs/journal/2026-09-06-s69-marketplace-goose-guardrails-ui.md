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
