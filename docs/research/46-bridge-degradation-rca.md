# 46 · 桥态退化 RCA：连续快速建删会话后 switch/set_think 失败与救援死局

日期：2026-09-26 ｜ 取证人：s103-r3（取证研究员）｜ 环境：dev 栈（桥 :8790 healthz 200，goose acp 1.50.0（源码对照 v1.50/v1.51 双版本一致性核实），providers 唯一活跃档「自家中转」 http://111.228.54.166:20128/v1 ，池=[deepseek-v4.1-flash, glm-5.3-flash, glm-5.3]）

事实分级：**VERIFIED-RUN** = 本机活体跑通（带日期）；**VERIFIED-DOC** = 源码/文件核实；**UNVERIFIED** = 未验证。
证据文件：`tmp/s103-r3/`（lib.js 探针库 + e0/e1/e1b/e2-e4/e5 各臂脚本与控制台输出；日志判据=data/logs/events.log + llmproxy.log 行）。

---

## 结论速览

| 问题 | 一句话结论 |
|---|---|
| (a) switch_model 连续「切换失败，试试重开对话」 | **根因定案（源码级六环全链 + 6 次活体复现）**：删当日最新会话→DB 行删→goose 按「当日MAX(库内行)+1」发号→下一个 session/new **复用刚 close 的 sid**；goose 侧 `closed_session_ids` 只增不减且 `get_session_agent` 先查它→复用会话**出生即死**（born-dead）→set_config_option(model/thinking_effort) 被 resource_not_found 拒→桥 doSet 的 waiting 项只有 resolve 没有 reject，error 整帧当 result 解析→`res.configOptions` 缺失→人话失败卡。间隔（1/3/5/11s）**全灭**（出生门控与本案无关）；删**非最新**会话**不触发**（单变量隔离证明：复用是唯一触发条件）。 |
| (a+) 同族放大器：救援守卫继承 | `rescuedSids` 按 sid 字符串去重，**sid 复用让新会话继承上一世的救援记录**→prompt 直接吃「通道已失效…」终局文案、零救援尝试，直到桥重启。设计注释假设「sid 跨桥生命周期不重复」在 churn 下为假（VERIFIED-RUN：E1b 5ms 即死局）。 |
| (a++) 同族放大器：毒号累积与探针自伤 | 每个 close 过的号在 goose 进程生命周期内**永久有毒**；QA 探针「用完即删」把 DB 最大号压回毒水位以下→后续每次建会话都落在毒号上——这是两批观察「退化持续到桥重启才好」的直接原因。恢复只有两条路：库存行**存活越过**毒水位（VERIFIED-RUN P3：留行再建=99 活），或桥重启（closed 集随进程清空）。 |
| (b) churn 后 glm 整轮 0 thought 帧 | **机制与 (a) 同根，但形态属别名时代（W1 家族路线），现行 W4 原生参数路线不可复现**：现行设计 glm 走真名+桥注入 effort，健康态本就 0 thought 帧（E0：effort=max 上 wire、直连中继同 prompt 确有 reasoning_content、goose 二进制对非 gpt-5 系不产 thought 帧——上游有、goose 丢）；churn 后轮次在 LLM 请求前就死（born-dead 拒绝/救援）。**现行设计下 churn 的真实变形更严重：救援轮跑错模型**（E5：用户选 glm-5.3-flash，实跑 deepseek-v4.1-flash——死 sid 上 set_config_option(model) 静默失败+rescueSession 不补钉，UI 仍宣称用户选的模型）。 |
| 修法 | 见 §5：两处一行级修复（救援守卫随 sid 重生清除；doSet 对死 sid 的自愈重绑）建议进本批；救援补钉模型/档位与上游编号修复列 backlog。 |

---

## 1 现象与复现基线

### 1.1 现象 (a)——VERIFIED-RUN 2026-09-26，与批2 16:46 形态逐字一致

E1（churn N=5、间隔 800ms、建删后开工作会话）：

```
churn#1..#5  sid=20260925_97（五连全部同号复用）
work sid=20260925_97
switch→deepseek: {"ok":false,"err":"切换失败，试试重开对话"}
switch→glm:      {"ok":false,"err":"切换失败，试试重开对话"}
events.log: {"ev":"switch_model","from":"glm-5.3-flash","to":"deepseek-v4.1-flash","ok":false,"err":"切换失败，试试重开对话"}
```

对照健康态（E0，无 churn）：同操作 switch ok 且带 configOptions；events 行 ok:true。批2 留证 tmp/s103-e2-s5/degradation-capture.txt 的三行（16:46:18 deepseek→glm 失败、16:49:06/07 glm→glm 同值重试连败）与本复现**同错误串、同 events 形态**。

### 1.2 现象 (b) 批1 形态与现行配置的关系

批1（S1/S2 时代）观察「churn 后 glm 出站整轮 0 thought 帧、桥重启即愈」。本轮取证发现该形态依赖**别名/家族路线**（goose 以为在跟 gpt-5-forge-* 说话才放开推理流解析）；s101/W4 裁决（2026-09-23 §2.4）已把家族降为「官方无档位才兜底」，glm-5.3-flash 官方表有 levels=[low,high,max]→现行恒走真名参数路线。现行路线下：

- **健康态本就 0 thought 帧**（E0，VERIFIED-RUN 2026-09-26）：`llmproxy 行 model=glm-5.3-flash effort=max status=200`，直连同参数同 prompt 打中继**确有 reasoning_content**（本机 curl 两次：effort=max→50 字符；无参数→112 字符——中继对 glm-5.3-flash **默认也回推理**），但 goose→客户端 0 帧。推理内容在 goose 二进制内被丢（非 gpt-5 系不解析；VERIFIED-DOC 间接证据：桥内注释两处「goose 对 glm 系不发/不解析 reasoning（非 is_reasoning_model）」+ 别名机制存在的理由本身；goose 源码未含该层，标注：解析门在 goose.exe 二进制内，未逐行核实）。
- 因此「帧从有到无」的 churn 形态在现行配置**结构性不可达**；批1 的确切探针文件已随 tmp 清理不可复审（UNVERIFIED：批1 配置时代快照缺失）。但其机制与 (a) 完全同根（见 §3.4），且现行配置下 churn 暴露出**更重**的变形（§1.3）。

### 1.3 现行配置下 churn 的实际变形全谱（E1/E1b/E5，VERIFIED-RUN 2026-09-26）

| 变形 | 表现 | 臂 |
|---|---|---|
| D1 switch_model 失败 | set_config_option(model) 拒，人话「切换失败，试试重开对话」 | E1/E1b/E2/E4a/E5 六臂 |
| D2 set_think 失败 | 同族 set_config_option(thinking_effort) 拒，人话「切换没做成，稍后再试」（think-grad 探针同败的根） | VERIFIED-DOC 源码同路由；未单测 |
| D3 prompt 撞死 sid→首轮救援 | 若 sid 无救援记录：rescueSession 新会话+重放，回合完成、ws 重绑活 sid，**事后 switch 恢复 ok（无需桥重启）** | E5 |
| D4 救援守卫继承→死局 | 若 sid 字符串在本桥进程内被救援过：**零救援**，直接终局文案「这个对话的通道已失效，自动恢复也已经尝试过了…」，仅桥重启可解 | E1b（E1 曾救援过 97，E1b 复用 97 → 5ms 死局） |
| D5 救援轮模型漂移 | 用户建会话选 glm-5.3-flash；死 sid 上 set_config_option(model) **静默失败**（fire-and-forget 无回执检查），rescueSession 不补钉→救援轮跑 **spawn env 模型 deepseek-v4.1-flash**，llmproxy 行为证（model=deepseek-v4.1-flash effort=max），UI 仍显示用户所选模型 | E5 |
| D6 退化不随时间自愈 | +0/30/60/120s 重试 switch 全败（closed 集进程生命周期） | E4a |

---

## 2 单变量矩阵结果（判据=switch ok 与否；全部 VERIFIED-RUN 2026-09-26）

| 臂 | 操作 | 结果 |
|---|---|---|
| E0 对照 | 无 churn：create→switch×2→prompt | switch ok（带 co）；回合 stop；llmproxy model=glm-5.3-flash effort=max；thought=0（§1.2） |
| E1 基线 | churn N=5 gap800ms→工作会话→switch | **败**（复用 97 五连+工作会话仍 97） |
| E2 间隔 | 删后等 1s/3s/5s/11s 再建（SETTLE=10s 窗内外） | **1/3/5/11s 四臂全败，无差异**——出生门控只延迟 close 落笔，与「号段回退复用」正交；s80g 冲刷反而**保证** close 先于 session/new 同流落笔（复用碰撞确定性化） |
| E3 删除对象 | 两建 A(97)B(98)：删**非最新** A→工作会话=**99** switch **ok**；删**最新** B→工作会话=**98**（复用）switch **败** | **复用是唯一触发条件**（churn 速率无关） |
| E4a 持久性 | 退化后 +0/30/60/120s 重试 | 全败（无自愈）；「留行新开」恢复路在本臂也败——98 号在 E3 已被毒（毒号跨臂累积的直接展示） |
| E4b 桥重启 | restart chat-bridge 后同操作 | switch **ok**（hasCo=true）。注：本臂工作会话得 98 而非复用 97，因删后有一行 97 复活（§4 开放项）推高了发号；closed 集随新进程清空是恢复的结构性原因（VERIFIED-DOC：集为内存态） |
| P1/P2/P3 号段探针 | P1 建（落毒号 98）败；P2 删后重建仍 98 仍败；P3 留行再建=**99 ok** | 号段=当日MAX(库内行)+1；毒号进程内永久；行存活越毒水位即恢复 |
| E5 救援闭环 | 重启后 churn×2→工作会话 97（死）→switch 败→prompt | **救援触发**（rescued=20260925_98）→回合完成 stop（7.5s）→事后 switch **ok**；但轮跑在 deepseek-v4.1-flash（D5） |

LLM 预算执行情况：活体回合 5/6（E0 一轮、E1 救援轮、E5 救援轮、直连中继对照 2 发）；E2/E3/E4/P 各臂判据全部零 LLM 成本（switch/set_config_option 不出站）。

---

## 3 根因链（六环，全部 VERIFIED-DOC 源码核实 + 活体印证）

前提状态：当日库内最大会话号 N（本日 96），桥进程带一只活 goose（acp 子进程）。

1. **删行**：`hardDeleteSession`（chat-bridge.tpl.js:4831-4836）裸 SQL 删 sessions/messages 行——当日最新会话的行消失，库内最大号回退到 N-1。
2. **close 入死集**：删除的 close 经出生门控延迟（<10s）或冲刷后落笔；goose `on_close_session`（acpserver-v1.51.0.rs:2629-2640，v1.50 同）把 sid 插入 `closed_session_ids`——**全集只有 insert，无任何 remove**（两版本 grep 全量核实：仅 :2614/:2633 一处插入）。
3. **发号复用**：下一个 `session/new` 按「当日MAX(库内行)+1」发号（s76/s81 实测先例；本轮 E1 五连同号、P2 删后重建同号再证）→ 复得刚删的号 N。s80g 的 `flushPendingCloses`（:1561-1566）保证 close 先于 session/new 同流落笔（stdin FIFO）——**错峰修复把「close 与复用竞速」变成了「close 必然先行」**，碰撞从概率事件变成确定事件。
4. **出生即死**：`register_acp_session`（:2521-2531）只把新会话放进 sessions map，**不清 closed 集**；而 `get_session_agent`（:1876-1885）**先查 closed 集再看 sessions map**——复用号的新会话对一切走 get_session_agent 的方法表现为不存在。
5. **双处理器同拒**：`on_set_model`（:2438-2444，即 set_config_option(model)，switch_model 消费）与 `on_set_thinking_effort`（:2541-2547，即 set_config_option(thinking_effort)，set_think/think-grad/习惯记账消费）第一行都是 `get_session_agent(session_id).await?` → resource_not_found「Session not found: <sid>」error 帧。prompt 走 `start_active_run`（:1961）同查同拒（→D3/D4 的入口）。
6. **桥把 error 当 result**：`doSet` 的 waiting 项只有 resolve（:5328）；onAcpData（:1469-1475）对无 reject 项把整条 error 帧 resolve 进去 → `res.configOptions` 为 undefined → :5338 `noteSwitch(false,…,'切换失败，试试重开对话')`。set_think 处理器同构（:5403-5412）。**这是错误帧形态问题，不是回包缺键**——goose 侧回的是 JSON-RPC error，不是无键 result。

放大器（同根衍生）：

- **救援守卫继承（D4）**：`rescuedSids`（:1588，Set<sid 字符串>）设计注释明言「无 TTL/清理——桥重启即清…跨重启去重无意义」，默认 sid 不重复；号段复用直接推翻该前提——新会话被上一世的救援记录锁死（E1b）。
- **静默 set（D5）**：subscribe 带 model 的 set_config_option(model)（:4900-4904）与 prompt 前模型/档位对账帧均为 fire-and-forget——死 sid 上静默失败，`sidModelApplied` 乐观记账（:4904「乐观：写失败=acp 已死」注释只考虑了 acp 整死，没考虑单会话死），UI 与实跑模型背离（s94 F-3 家族的新触发路径）。
- **毒号累积+探针自伤**：恢复条件是「库内行越毒水位」（P3）或桥重启；探针的 delete-all 清理模式把水位压回毒区，制造「重启才好」的表象。

### 3.4 与 (b) 的关系

别名时代（goose 侧会话钉 `gpt-5-forge-glm-5.3-flash`）thought 帧依赖会话的 goose 侧身份保持在别名上；同一六环链下，死 sid 上的静默 set 失败/DB 回放（s94 F-3：evicted-restore 按 DB 回放旧模型）都会把身份打回真名→goose 推理解析门关→整轮 0 帧；桥重启=env 重新钉别名→帧回。**机制同根、自洽**（VERIFIED-DOC 推理链 + 批1 活体观察），但批1 配置快照已失，确切形态标 UNVERIFIED；且 W4 后该路线不再对 glm 生效（§1.2）。现行配置下同根变形=D5 模型漂移（比 0 帧更重：用户以为在 glm 上，实际在 deepseek 上）。

---

## 4 开放项（不阻塞定案）

1. **删后行复活**（E4b）：删 97 回执 ok 后，库内出现 created_at 晚于回执的 97 空行（无消息、带 working_dir）。候选写入方：goose close 时序化 flush / goose-scheduler 独立进程建空行。间歇性（P2 删后重建未复现复活，仍复用 98）。影响：推高发号、**缓解**复用；与根因无冲突。未定案。
2. **goose 推理解析门**：thought 帧只在 goose 认为模型属 gpt-5 系时产出（E0 间接实证+桥注释），解析层在 goose.exe 二进制内未逐行核实（源码包未含该 crate）。
3. **每轮双 llmproxy 行**：E0 一轮对话产生两条 glm 行（其一疑为会话命名请求）；S4 行格式未带请求路径字段，无法从行内区分用途。属观测性小缺口，非本案问题。

---

## 5 修法建议

### 建议进本批（小而明确，行级指位）

1. **救援守卫随 sid 重生清除**（一行）：`noteSessionBorn(sid)`（chat-bridge.tpl.js:1567-1571）内加 `rescuedSids.delete(sid)`——号段复用的新会话不再继承上一世死局。直接消灭 D4（用户唯一无自愈出路的形态）。
2. **doSet 对死 sid 自愈**（switch_model :5325-5340）：resolve 收到无 configOptions（含 error 整帧形态）且 etxt 命中 `SESSION_NF_RE` 时，不再直接报「切换失败」——丢弃死绑定，按既有「无活动会话」分支（:5343-5363）代开新会话重做 set_config_option 并重绑（模式同 rescue/spawnFamNew，零新协议）。消灭 D1 的用户可见形态；set_think（:5403）同款处理或至少同样走人话+events 行已具备。

### 建议 backlog（裁决立项）

3. **救援补钉模型/档位**（D5）：rescueSession（:1655-1680）新会话按 `effectiveModel`/`lastThinkOverride` 补 set_config_option（活 sid 上必成），消除「选 A 跑 B」漂移；subscribe 带 model 的乐观记账（:4904）改为回执确认或事后对账已有（prompt 前对账 :4957 因 sidModelApplied 已被乐观写入而**跳过**——记账顺序 bug，一并修）。
4. **上游/结构层**：goose `closed_session_ids` 毒化复用号（insert-only）+发号不看死集是本案结构根源；桥侧 1+2 已足够止血，上游修复（session/new 清死集或发号避开）可整类消除。`delete_sessions` 批量已拒当日号段（qa s98 P3-1），单删当日最新是仅存入口，也可评估「单删当日最新同样走拒批/延后」的交互方案（权衡：单删是真实用户操作，拒批有 UX 成本）。
5. **观测性**（顺带）：events.log 已能承载 switch ok/fail 判据（本轮全程用它）；llmproxy 行建议补请求路径字段（§4-3）。

---

## 6 复现与清理记录（审计）

- 探针与输出：`tmp/s103-r3/{lib.js, e0-control.js, e1-churn.js, e1b-post-churn-turn.js, e2-e4-matrix.js, e5-rescue-round.js}`；判据行留存于 `forge/data/logs/events.log`（19:03-19:20Z 窗口）与 `forge/data/logs/llmproxy.log`。
- 桥重启共 3 次（E4b 前、E5 前、收尾各 1），均 `pc process restart chat-bridge`（forge/ 下、port 8099）。
- 会话库存：实验全程自建自删；终态 `sessions.db` 778 行、最大号 20260925_96、≥97 残留 0 行——与实验前完全一致。收尾桥重启一次（清空当前 goose 毒号集 {97,98} 与救援守卫），healthz 200。`model-caps.json`/`providers.json` 全程未改（mtime 早于本轮开工）。
- LLM 预算：5/6 轮（E0×1、E1 救援轮×1、E5 救援轮×1、直连中继×2），未跑深档。
