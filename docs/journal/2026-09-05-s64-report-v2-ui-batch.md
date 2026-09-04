# 2026-09-04 s64 — 报告v2可观测增强 + UI呈现五缺陷清零 + PG便携化取证

## 输入
用户四条主线建议：①可观测+一键上报增强（有用但克制）②UI布局细测③美观与性能④正经后端+PG。回归基线 e2e 33/33 + fuzz 44/44（热跑；首跑 1 红——冷启动竞态第 3 次复现，断言名未留痕，见遗留）。

## 主线A：一键上报诊断报告 v2（077e8d9）
- pf-pm 裁决书（tmp/s64-report-v2-verdict.md）：真问题="丈夫3分钟形成首个假设"，初诊=规则查表（确定性/离线/只说不做），LLM 诊断裁掉（agent 挂掉恰是主场景）；隐私逐条裁定（定时任务只出两计数、技能只出数量、MCP 只出 name+enabled 结构级排除）；体积硬顶 256KB。
- pf-engineer 实现：采集 A1 系统代理（reg 只读）/A2 磁盘剩余（statfsSync）/A3 膨胀点（白名单合计+junction 防环+2s 预算）/A4 定时任务两计数/A5 MCP 清单（readExtState 提升模块级与 /api/extensions 共用）/A6 技能数/A7 错误人话汇总；R1-R5 纯函数+文案常量表（R3/R5 去重）；REPORT_MAX_BYTES 单一常量，按节截断（pc.log→backup.log→统计），诊断节绝不截。
- 主控实景：真机报告 48.5KB，诊断节 R5 命中（代理 127.0.0.1:7890 开+7 天连接错），MCP 显示中文名（深度思考/网页抓取）。
- 探针：tmp/s64-probe-units.js 30/30 + tmp/s64-probe-report.js 沙箱 19/19（转正待 qa 后下轮）。

## 主线C：UI 呈现五缺陷（c14ed19，全部 GUI/实景实锤后修）
1. 版本显示「v2」——UI 读 hello.version（WS 协议版本）非 app 字段 → 修为 m.app 优先。
2. 侧栏会话列表不排序（依赖 goose 返回序，日期乱跳实测）→ renderSessions 按 updatedAt 降序（tsLocal 失败沉底，稳定排序）。反差证据：浏览全部有排序、侧栏没有。
3. 列表 40/30 静默截断（库 249 会话实测）→ 弱色提示「还有 N 个更早对话…」。
4. 发送按钮窄列竖排（右栏挤压）→ #send nowrap+flex-shrink:0。
5. 浏览全部徽章与标题重复（wsStateLabel active 分支返回 sessionTitle）→ 固定「活跃对话」。
- 主控 IAB 真实浏览器逐一实证：版本 dev/列表严格降序/提示行出现/computed style 全对/徽章四卡全「活跃对话」。消息墙回放 17 节点正常。

## 主线B：PG 便携化取证（research/10，1ddbcc8，结论 BACKUP 挂 P32）
- 许可证是硬门槛：PostgreSQL License 白名单字面外需扩列（连带 npm pg 树的 ISC）；唯一字面合规客户端 postgres.js（Unlicense）。
- 形态可行：zonky 渠道 +104MB（287→391MB），无注册表/无服务/删目录即卸载；Windows 三坑在案（管理员令牌拒启/中文须 -E UTF8 --locale=C/多进程运维面）。
- 同类零先例（goose=SQLite 本机实证、OpenHands=JSON、Manus=云 VM）；FTS5 中文硬边界实证（unicode61 整串、trigram 两字词不命中）——backlog FTS5 条目需重新设计。
- **待用户拍板**：白名单是否扩列（OSI 宽松等价类：PostgreSQL License、ISC）。扩列前不引入。

## qa 审查（双批通过）
- 批1 报告 v2（077e8d9）：通过。qa 独立复跑工程师探针 30/30+19/19，另写证伪层 tmp/s64-qa-edge.js 11/11 + tmp/s64-qa-sandbox.js 10/10；三级同时超预算压穿截断级联（落盘≤256KB、三处「已截断」、诊断节完整、R4 所在节被截仍正确触发）；readExtState 对抗 fixture 证明结构级排除成立（cmd/env 值 0 泄漏）；定时任务两计数对 10000 条巨型/乱码输入稳定。R1-R5 文案与裁决书 §五 逐字一致。
- 批2 UI 五修复（c14ed19）：通过，零问题。主动证伪：截断提示两态位置/恰好 40/30 边界、.fnote 对比度浅色 4.84:1 夜间 6.49:1（≥WCAG AA，四皮肤不触及 --mut/--panel 故两组计算覆盖全组合）、#send 溢出链路（#main min-width:0+input 自动最小尺寸 0，压力由输入框吸收）。
- P3×3 处置：P3-1 硬顶不可达角落（head 段超限时超帽，产品路径不可达）→ 注释标注例外；P3-2 readExtState 与 mcpEnabled 注释语法分叉 → 一行对齐 `/^[^\s#]/`；P3-3 裁决书 §八验收6 与 §五文案矛盾 → 主控裁定按准入门槛4（更强安全意图）给 R1-R3 补出口短语「还不行，就把这份报告发给帮你的人。」，§八措辞以本裁定为准。
- 附加建议留档：reportDirSize 预算仅目录间检查（12000 文件实测 470ms 无实证风险）；A7 Number 强转怪癖仅手改 stats 可触发。

## 验收
e2e 33/33 + fuzz 44/44 全绿（桥重启加载 67b871d 后主控独立跑）；实景报告 report-20260905-0029.md 生成正常（诊断节/快速判断在位，系统健康无 R1-R3 触发，探针已验文案）；fuzz 留痕 tmp/fuzz-last.log 正常落盘。

## 遗留
- fuzz 冷启动竞态第 3 次复现且失败断言名又未留痕——下轮小批：fuzz-chat.sh 全量输出恒写 tmp 文件 + s61 遗留（typing prefers-reduced-motion / explorer /select 不抢前台焦点）一并。
- 报告探针转正（ws-delete-receipt 先例路径）。
- PG：待用户确认白名单扩列 → 落 ADR + 真机 POC（initdb 耗时/EDR）。
