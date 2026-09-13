# s78f QA 复审修复批（2026-09-13）

上游：QA 复审报告 tmp/s78f-qa-review.md（P2×2+P3 择修），基线 e2e 57/57 + fuzz 178/178。本批=修 4 项，最小 diff 6 文件 +45/-14，一次 commit。

## 修 1（P2-1 + P3-1 同轮）掩码裸 JSON 键族 + \b 边界
- chat.tpl.html maskKeys 第五链：`(\b["']?(?:api[-_]?key|token)(?:%20)?["']?\s*[:=]\s*["']?\s*)(x_api_key 同款值组)`——裸 JSON 键 `{"api_key"/"apikey"/"token":…}`（键位引号可选）+ `api_key: ` header 裸形态 + `?api_key%20=` 编码空格键名；`\b`=键名前必须是边界（引号/`{`/`,`/行首/`?&`）。
- x_api_key 族（链三）同补 `\b`——修前 `max_api_key=5` → `max_api_key=****` 值失真（QA OVER 实证 2 形态）。
- 掩码幂等核验：被前链掩过的值（A+****+B 形态）经新链复读 one() 输出不变（M2/M3/M4/M7/M8 形状断言全绿即证）。
- 探针并入：mask-fuzz-probe +5 向量（裸 JSON 三键/%20/裸 header）+ M9 反向断言（max_api_key/context_api_key 零误掩）；**helper 收紧**——泄漏检查不再以 `****` 在场为前提（整段漏掩=零 **** 同样红；修前首轮负对照 M1 假绿即此坑）。8→9 asserts，fuzz 总数 178 不变。
- 负对照：修前模板 M1 红（5 向量裸奔点名）+ M9 红；修后 9/0。QA 探针 tmp/s78f-mask-matrix.js 复跑 GAP 漏网 0 + OVER 误掩 0 + SPEC 10/10。

## 修 2（P2-2）humanizeDecline 双保险
- chat-bridge.tpl.js：①前置门 `upd.status!==undefined && upd.status!=='failed'` 整帧不动（decline 回填实录恒 failed；grep 源码/日志审计的 success 真实输出不属拒绝回填；嵌套 toolCallUpdate 兜底形态无 status 字段=门通过，正对照保持）；②整字段赋值改句内子串 `text.replace(DECLINE_RE, 人话)`——原句前后的真实数据（「共 1 处命中」/后续 INFO 日志行）保留。回放帧同路经门（挂载点 :800 不变）。
- QA 探针 tmp/s78f-decline-overmatch.js 复跑：对照 4/4 保持 + 误吃 HIT 2→0（未吃输出可见真实数据保全）。
- ws-subscribe-race-probe 桩核查（教训 s78e：提取桩参数列同步）：该桩对 humanizeDecline 整体 stub（`() => {}` 非真提取），零同步需求，复跑 24/0 绿即证。

## 修 3（P3-5）超时兜底显式拒绝链
- chat.tpl.html 权限卡：`opts.find(reject_once) || opts[0]` → `find(reject_once) || find(reject_always)`，全无则**不挂定时器不回复**（让 goose 自身超时收口）。注释固原则：破例路径（超时自动应答）不允许落在「允许」类选项上——goose 原始序 allow_always 恒居首，旧 `||opts[0]` 兜底=替用户按「以后都允许」持久化授权；拒绝族=失败安全（停住可恢复）。宁可无动作，不可替用户点 allow。

## 修 4（P3 两条小项）
- R4 逐型锁：rescue-guard-probe R4b 从「至少一型」升「型1（Ran into this error）+型2（Network error，最常见上游断流形态）逐型锁+五型样本齐全（升版更新样本须保五型）」；R4c 型1 主哨兵保持。S26_ERR_RE 本身未动→R4b 修前亦绿（断言强度升级，非缺陷修复，无修前红——如实留痕）。
- R1 补挂点：chat-bridge sendTurn reject 路径 `hs 非 ok（down/stale）` 时也触发 healthFailDebounce（挂在 hs 读出处，:872）；null 不探（无态原链）/ok 不探（真实失败信号才探；S26 命中分支 :859 既有防抖，重复调用由 healthFailT 幂等合并）。down 缓存 30min 不再遮蔽真实归类变化。
- 新断言 S16/S16b（rescue-guard 31→33 ck）：down 态非 S26 失败恰一次复检 + ok 态零复检（判别力对照）。e2e 标签同步 31→33 ck，e2e 总数 57 不变。
- 负对照：修前模板 S16 红（healthCalls=0）、S16b 绿（对照成立）。

## 验证矩阵
| 项 | 结果 |
|---|---|
| tmp/s78f-mask-matrix.js | SPEC 10/10 + GAP 漏网 0 + OVER 误掩 0（修前 GAP 5/OVER 2，本会话首轮复跑钉基线） |
| tmp/s78f-decline-overmatch.js | 对照 4/4 + 误吃 HIT 0（修前 HIT 2） |
| mask-fuzz-probe 独跑 | 9/0（M1 34 向量含新 5；修前 M1+M9 双红实证） |
| rescue-guard-probe 独跑 | 33/0（修前 S16 红） |
| ui-logic / toolcard-frames / ws-subscribe-race | 56/0、45/0、24/0 |
| 物化 | bootstrap 重物化：仅 chat-bridge.js 变更，cmp 与模板逐位一致，其余 9 产物哈希不变 |
| 栈 | 仅 pc process restart chat-bridge（200），healthz 200 ok |
| e2e-chat 全量 | **57/57 首轮绿** |
| fuzz-chat 全量 | **178/178 首轮绿**（顺序跑，输出留痕 tmp/fuzz-last.log） |
| 纪律 | explorer 零开窗；假路由/pg 未触碰；QA 探针留 tmp/（gitignored） |

## 未做（明确跳过）
- QA P3-2（catalog 字段级合并/_schema 2）：结构性留档项，QA 建议下批，未夹带。
- QA P3-6/P3-7（_pto 家族/排队竞态）：QA 结论=无需修，未动。
- humanizeDecline 的 catch{} 吞异常范围（QA 探针自坑记录候选）：门①后误吃面已收窄，未改异常结构——跟进项留档。
- decline 探针未转正入套件（任务只要求复现转绿；mask 探针按要求并入 fuzz）。
