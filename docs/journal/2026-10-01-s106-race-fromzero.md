# s106 会话记录：R5 竞态从零验证 + backlog 分档批 + 从零全观测续猎

日期：2026-10-01 ｜ 主控（章程拉起闲时会话）｜ 分支 experimental/delivery-v1

## 背景

用户双主线与 s105 同题（思考留痕 + 从零反复全观测）。s105 已根治两主线（留痕本体 0ae2bbc + newchat 竞态 6aeaeee + 三轮全观测）；本会话=最新代码首次出厂包验证 + PM 分档后的 backlog 修复 + 继续猎捕。

## 一、PM 裁决（backlog 十项分档）

docs/verdicts/2026-10-01-s106-backlog-triage.md（3bb61ec）：今日批 4（R3-F2 原子写升批——契约级 §5 零术语义务，无需等复现）/复核 3（R4-F2 confirm 宿主、R2-P6 添加复核、R4-P6 系统表透出——挂从零轮）/缓办 3（R4-F3 一键升格=s69 用户裁决域默认保守；刷新恢复/窄窗=§9 前置无信号不动）。

## 二、今日批六 commit（工程师，§8.2 十一套全绿）

| commit | 项 | 要点 |
|---|---|---|
| 5776280 | 1.1 原子写竞态 | rename 占用族 ≤3 次退避重试+写路径人话门+冷启清 providers.json.tmp-* 残件；红臂=旧桥 EPERM 原文+全路径逐字复现台账 |
| 3a7dae1 | 1.2 批删措辞 | deleted=0&&skipped>0 →「这一批都没删：N 段都是今天刚聊的…」；ui-logic 112→116，batch-sess-probe 复活 25/25 |
| 3b74653 | 1.3 permcard sub 行 | 补拒绝侧半句「允许的以后直接做，拒绝的以后直接跳过，都不再问了」；四按钮/语义零触碰 |
| 9d2b146 | 1.4 探针字面随迁 | iat23/iat20b/iat22 三探针旧黄条期望随迁（裁决前提修正：同族断言三处非一处） |
| e162a07 | followup-A 读取侧守卫 | 工程师自报副作用（1.1 重试使锁窗读取角从「报错不落盘」变「静默空表落盘」3/3）→保存链专用 readProvidersForSave：占用族重试→耗尽人话门诚实失败；非占用族维持 [] 兜底；只读消费方零变化 |
| a294f50 | followup-B EPIPE 守护 | 工程师评估=局部小 diff：spawnAcp stdin 零 error 监听，双热重启杀旧 acp 时在飞写 EPIPE 冒泡=桥崩；修=一行监听记码不崩（绿臂 5 跑结构论证，概率窗未实测触发——诚实标注） |

回归终态：e2e 62+fuzz 225+ui-logic 119+ia 38+sem 38+think-grad 27+capeditor 141+modelcaps 44+proxythink 30+xlate 10+w2-preset 15（tmp/s106-reg-*/s106-fa-reg-*）。

## 三、iat110 包与 R-A 轮（在飞→补记）

包 dist/PocketForge-20261001-v0.9.17.zip sha256 9ee08b22…（iat109 15cb98bb… 为今日批前中间态，已被覆盖；包内锚抽查：readProvidersForSave/cleanProvTmp/stdin-error/sessionId=null;currentSid=null/新措辞全在场）。
R-A 轮任务书 tmp/s106-roundA-taskbook.md：A 竞态判卷（200/500/1000ms 三发全落新会话）/B 今日批出厂+B4 无覆写 confirm 宿主+B5 添加复核/C 报表卡链+系统表透出/D 全观测。台账 tmp/s106-roundA-findings.md。

## 四、dev 树日志挖掘（pf-researcher，tmp/s106-devlog-mining.md）

五异常族：**C1「rename 耗尽后 hot_restart 照发」=主控复核误归因关案**（4.7s 间隔=工程师红绿探针的下一笔成功保存；新码 throw 结构上先于 evJson/hot_restart 不可达；重试全程仅 ~120ms 非 5s）。有效四条：C5a 备份诚实性（pg_dump skipped 仍报 backup ok，zip 无 DB 份 30KB 实录）→批 2 修；C5b 升级计数分裂（lastSeen/status.json 冻结 09-22 九天）→批 2 调查+修；C4 models 5s 停摆带被 "client aborted" 标签掩盖（45/53 status:0 恒 totalMs≈5000）→批 2 修标签；C2 goose panic 循环 7h 无熔断（09-05 史实，permission.yaml 已 PROTECTED）+C3 PG 57P02 ×21 跨四周（真凶 backend 不在留存日志）→backlog 带触发器。副产品：R5 竞态日志巡检锚（同 sid 分钟内 stale session/new discarded→pending closes flushed→single rescue 三连）；effort「恒空」观察过时（54 条非空，s101 W1 修复生效侧证）。

## 五、批 2 三 commit（工程师，standalone 红绿全绿；§8.2 全量待 dev 栈恢复补）

| commit | 项 | 要点 |
|---|---|---|
| 03ff025 | C5a 备份诚实性 | 终行两形态（含 DB 份=原样；跳过=「backup ok（这次没带数据库：归因，下次会带）」）；PG 本体不在场不降级；EEXIST 真凶=recursive 下 Windows 瞬态泄漏（规格纠正：mkdir 本就 recursive，全史 176 枚实证）→守卫放行目录态；「backup ok」零断言消费方 |
| a4e602c | C5b 升级计数 | lastSeen 冻结=设计内（指纹语义）+真缺陷=跨天重启陈旧终态重计（L226 自违反）→当日文件缺位从最近 usage-* 带回 6 行；ok 恒 0=语义正确不修（update-runner done 语义核）；UI 最小诚实修=终态行相对时间「（9 天前）」（不做清除/重置=PM 域） |
| f955e54 | C4 超时标签 | res close 两分：tFirst 未置位→client timeout (no upstream first byte)；已置位→保持 client aborted（真中断族零变化）；/models 双发归因纠正=goose 库存预热非 UI 轮询（去重留档不做，超 10 行门槛） |

standalone 探针：s106-g1 备份 9/0（PG 停机真跑 60s×2 臂）/g2 EEXIST 6/0/g3 lastSeen 8/0/g4 标签 6/0；ui-logic 126/126（+upd-age 7ck）。待补：§8.2 全量+preupgrade-backup-probe 活体+statsRestore 跨天活体+新标签首条真实流量实录。

## 六、R-A 从零全观测轮（iat110，台账 tmp/s106-roundA-findings.md）

**判卷核心全过**：A2 R5 newchat 竞态 **PASS 3/3**（200/500ms/1s 全落新会话，旧会话零串入，页面全渲染——主线1 出厂包定案）；B1 原子写三判据过；B2 批删文案对（但落点错→P3-1）；B3 permcard 卡面全对（但落库穿 junction→见改判）；B4 无覆写 confirm 弹显可应答→R4-F2 降缓档关案；B5 添加复核→关案自动化误伤；C1/C2 报表入口 PASS+**R4-P6 系统表未透出关案**；修复保持面全保持。

**发现**：P2×1（改判 P3，见下）/P3×4（批删回执落不可见 #save-note；删草稿+保存把假 key 误写活跃 provider 致 401；活跃会话零渲染单次未复现；渲染器僵死 R2-F2 家族第二次）/P4×7。

**主控改判：R-A-P2-1「出厂 goose.exe 烘焙构建机路径」不成立**——真机制=ADR-0005 记载的上游 quirk（goose-mcp memory 硬编码 %APPDATA%\Block\goose\config\memory 绕过 GOOSE_PATH_ROOT）+bootstrap §1c junction 重定向（真机首启即建，记忆正常落包内）；本机 junction 钉 dev 树+守卫只查「Junction 且 Target 存在」不查归属→沙盒记忆穿到 dev 树=交叉污染机制。真缺陷=P3 守卫错向（s85-P4 悬挂家族盲角）。dev 树污染 8 件取证 tmp/s106-mem-pollution/ 后已清（原有记忆保留）。

## 七、批 3 五 commit（工程师，§8.2 十一套全量新基线）

| commit | 项 | 要点 |
|---|---|---|
| c9c5ae1 | F1 P3-1 批删回执落点 | sessions_deleted 回执 note→addInfo（消息流可见通道）；活体帧到页绿/红双臂（绿=#chat 542×47 可见，红=旧模板 rect 0×0 复刻 QA 实录） |
| ed87290 | F2 P3-2 表单解绑 | ✕ 删在编档先解绑（curProvName=null+cfgKeyTouched=false+清 cfg-key）；红臂=旧 del.onclick 同序列 update.key=sk-anything-01；PB7 边界=s104 R2-F3 自动建档守卫不回归 |
| cdb60e0 | F3 P3 junction 守卫 | Target 归一等值校验+失配删旧重建+删除改 cmd rmdir（只摘链接）；红绿 7/0（从他树重建/大小写/悬挂/用户数据完好）；cold-surface +S8 断言 19/19 |
| 99c1f79 | F4 P4-2 文案对齐 | 「已新建并保存「X」…」——添加即落盘语义诚实化，行为不动 |
| 9929d49 | F5 P4-4 allow 日志 | permcard action:allow 补齐（timeout/denied/allow 枚举面齐）；活体 allow 行留 R-B 轮判卷 |

批 2 补验全齐：§8.2 十一套（ui-logic **139** 新台阶=126+13）/preupgrade-backup-probe 31/0 活体/statsRestore 跨天带回活体（fail=0 零幻影）/C4 新标签真桥首录。未尽：F2 同族 s69 P3-14 dirty-key 跨档张力→backlog 带触发器；R-A-P3-3/P3-4 未触碰（后者 R2-F2 家族二次复发，触发器=再现抓 chrome://tracing）。

附：R-A-P4-5 effort 恒空关案（tmp/s106-effort-rca.md：非空⟺显式带档/override；53 条非空全落 V1 前播种时代；建议补 effortSrc 标记挂 backlog）。

## 八、iat111 与 R-B 轮（在飞→补记）

包 sha256 553eebf5…（bootstrap GetFullPath/新文案锚在场）。R-B=升级路径轮（官方 v0.9.17 基座→iat111）：junction 归属活体判卷（本机 junction 现指 dev 树，沙盒冷装须重定向）+升级双判据+残件清扫+批 2/3 八项出厂判卷+P3-3 机会复现。任务书 tmp/s106-roundB-taskbook.md，台账 tmp/s106-roundB-findings.md。

## 九、R-B 升级验证轮全 PASS（iat111，台账 tmp/s106-roundB-findings.md）

判卷矩阵零 FAIL：双包 sha/基座净装/残件升级首启清/robocopy 双判据（8 锚+providers+会话+思考块逐字节保持）/备份双形态（PG 停→「这次没带数据库」人话）/EEXIST 包锚/升级窗格「（9 天前）」/**F3 junction 归属活体（dev→s106b 重定向，两轮记忆落沙盒+dev 零新增）**/F1 回执消息流可见/F2 假 key 零上桌/F4 新句/F5 allow×2 活体/超时标签活体「客户端超时（无上游首字节）」/P3-3 未复现。新账 P4×2（无在开会话批删回执被断连重连清墙销毁并播种垃圾会话【双运行对照】；种子会话垃圾）→backlog。环境：dev 栈恢复 200；junction 归还 dev 树；PF-TEST 清零；LLM 4/6 轮。

## 十、会话总结

- 主线1：竞态修复从零定案（3/3）；思考留痕出厂链全绿。
- 主线2：三轮（挖掘+R-A+R-B）→14 修复 commit+3 关案+1 改判+backlog 10 项带触发器。
- 方法论沉淀：QA 重发现轻归因时主控必须复核机制层（P2 改判 junction 案例查 ADR-0005 即破）；工程师自报副作用（1.1 读取侧）=流程健康信号；「红臂用 git HEAD 旁挂旧桥」技法成熟。
