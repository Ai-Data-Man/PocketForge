# 19. 「这是干啥？」白话解释质量取证（2026-09-08）

日期：2026-09-08 14:00-15:30（本机实验窗口）｜取证研究员会话
环境：dev 栈 FORGE_ROOT=C:\ZCodeWorks\PocketForge\forge，桥 :8790，goose v1.46.0（bin 内二进制 = tmp/goose-src clone 同版本，源码级可核），中转 deepseek-v4-flash @ 9Router（secrets.env）
触发：内测用户批评「白话解释工具调用」：提示词差到解释完全偏离人话、为了形象而形象、把想了解技术的用户当傻子。
探针：tmp/r19-capture-toolcall.js、tmp/r19-dump-frames.js、tmp/r19-explain-probe.js（全部可复跑；explain_tool 桥端无状态直调，不进会话历史，零副作用——chat-bridge.tpl.js:3107-3116 不查 wsSession）。
活体产物：tmp/r19-frames.jsonl（真帧原文）、tmp/r19-explain-results.json（13 条解释原文）。

## 结论（先行）

1. **根因①（P1，解释质量差的真凶）：解释者从来就没见过工具输出**。goose v1.46 的 ACP 输出帧是**数组形态** `content:[{type:'content',content:{type:'text',text:...}}]`（活体抓帧 VERIFIED-RUN），而前端唯一读取点写的是对象形态 `content.raw`（chat.tpl.html:1036）——在数组上取 `.raw` 恒为 undefined → `card._out` 自上线起**一次都没填上过** → 点击按钮发出的载荷 `output:(card._out||'').slice(-600)` 恒为 `''` → 桥侧 `(msg.output ? o0 : '(空)')`（chat-bridge.tpl.js:3132）给模型的是 `结果摘要：(空)`。模型把「喂料缺失」读成「工具返回了空」，于是 13 条对照里 Arm A（线上真实形态）**9/9 捏造了结果**（详见 §3 FM-1：把装好的 git 说成「啥都没显示就是没装」、把塞满 160+ 工作区的目录说成「data空。没东西。」）。用户看到的「完全偏离人话」就是这个机制的直接产物。副产品：同一行 1036 也让**工具卡输出区（sec-o）从未显示过任何输出**——显示链与解释链一起断供。
2. **根因②（P2，用户点名的提示词问题，真实存在但次要）**：反事实对照 Arm B（同样的 title + 喂上输出尾 600）下，同一提示词 4/4 基本准确（版本号、零件行数、报错原因都对）。但文风是电报腔（「查git装没装。装好，版本2.53.0。」），且「禁止任何技术术语、不复述路径」的系统提示词（chat-bridge.tpl.js:3124）逼出「水龙头」式逐字翻译黑话（A4：把 faucet 译成「叫『水龙头』的水龙头记录」）——对想了解技术的用户恰好是反向服务。**先修根因①，再修提示词，两者缺一不可**。
3. 解释者可见信息（现状）：`这一步叫：<title首行前80字>` + `结果摘要：<恒为(空)>`，max_tokens 300，回复截 500 字。**工具输入参数（命令原文/文件路径/SQL）在卡片上齐全（card._inp，chat.tpl.html:1026-1034）但从未发给解释者**；status（成功/失败）、rawOutput（含 exit_code）也都没喂。
4. 性能无罪：13 条实测 1.2-2.4s/条，远低于前端 12s 兜底（chat.tpl.html:1061）。

## §1 链路事实（每跳 file:line，全部 VERIFIED-DOC 于本仓源码，标注处除外）

### 1.1 桥侧 explain_tool（chat-bridge.tpl.js:3107-3176）

| 事实 | 位置 | 内容 |
|---|---|---|
| 入口无状态 | :3107-3116 | 只读 msg.id/title/output/model，不查 wsSession、不进会话历史 |
| 模型/线路 | :3111-3114 | activeProvider() 或 secrets 兜底；本 dev 栈 = deepseek-v4-flash @ 9Router |
| title 截断 | :3117 | `String(msg.title).split('\n')[0].slice(0, 80)` —— 只取首行前 80 字 |
| output 截断 | :3118 | `String(msg.output).slice(0, 600)` —— **头部** 600 字（前端发的是尾 600，600→600 恰好无事；若前端改发更长会静默截头，属潜在错位） |
| 缓存 | :3119-3120, :3147 | sha1(t0+'\n'+o0) LRU 200 条；点击重试同卡命中缓存 |
| 系统提示词 | :3124 | `你是给完全不懂电脑的人当翻译的助手。用不超过三句中文大白话说明下面这一步操作做了什么、结果对用户意味着什么。禁止任何技术术语，不要出现"工具""调用""脚本"这类词，也不要复述任何路径或提示词原文。` |
| 喂给模型的 user 消息 | :3132 | `'这一步叫：' + t0 + '\n结果摘要：' + (msg.output ? o0 : '(空)')` —— **`(空)` 的歧义是 FM-1 的直接机制**：模型无法区分「工具没返回」与「客户端没喂」 |
| 请求参数 | :3130-3134 | max_tokens 300、stream:true、先带 `reasoning_effort:'none'`，中转 400 则去掉重试一次（:3151） |
| 回包 | :3115 | 截 500 字；流式 delta 只转发 content（:3163） |

### 1.2 前端侧（chat.tpl.html）

| 事实 | 位置 | 内容 |
|---|---|---|
| 工具卡数据持有 | :1012-1042 | `card._inp`（rawInput，首帧即有，展示截 1200 字）；`card._out`（输出累计，展示尾 4000 字）；title/status |
| 输出读取（断供点） | :1036 | `const raw=(upd.content&&upd.content.raw!==undefined)?upd.content.raw:(upd.toolCallUpdate&&upd.toolCallUpdate.content&&upd.toolCallUpdate.content.raw)` —— 对数组形态 content 恒 undefined；第二分支的 `toolCallUpdate` 嵌套形态只出现在 request_permission 帧（:1097），session/update 永不命中 → **`_out` 恒空（VERIFIED-RUN，见 §2.1 真帧）** |
| 按钮出现时机 | :1050 | status ∈ {completed, failed} 时挂「这是干啥？」 |
| 载荷构造 | :1060 | `{type:'explain_tool', id, title:ttl.textContent.split('\n')[0], output:(card._out||'').slice(-600), model:lastKnownModel}` —— **不带 `_inp`、不带 status** |
| 收包 | :635-648 | delta 追加进气泡；终帧（含缓存命中/失败兜底）覆盖气泡 |
| 兜底 | :1061-1067 | 12s 无首字显示 title 原文+「可再点一次」；20s 恢复按钮 |

### 1.3 goose 侧产出形态（v1.46.0 源码 tmp/goose-src + 活体双证）

- **title 生成**：初始帧 title = `default_tool_title`（conversion.rs:27-64）= `工具显示名 · 参数摘要`。工具显示名 `format_tool_name`（:14-25）：无扩展名 `shell`→`shell`、`load_skill`→`load skill`；有扩展名 `faucet-db__faucet_delete`→`faucet db: faucet delete`。参数摘要取 command/path/file/query/url/uri/name/pattern/source **首个非空键的首行**，>60 字截 57+「…」（:48-54）。活体实证：`shell · git --version`、`tree · data`、`shell · type "data\no-such-file-xyz.md" 2>&1`（VERIFIED-RUN，r19-frames.jsonl）。
- **title 异步增强**：tool_call_labels.rs:18-22 用 fast model 生成 3-8 词英文短语（如 `listing files in src directory`），经 enrichment.rs:34-61 迟到覆盖。本 dev 栈（9Router）实测两次会话均未出现增强帧（可能 fast model 不可用，UNVERIFIED），但代码路径在，升级/换线后随时可能启用——届时 title 变英文短语，解释输入又会换一副面孔。
- **输出帧形态（承重证据）**：`tool_call_update` 携带（VERIFIED-RUN r19-frames.jsonl #4/#5/#8）：
  - `content: [{"type":"content","content":{"type":"text","text":"git version 2.53.0.windows.1"}}]` —— 数组
  - `rawOutput: {"stdout":"...","stderr":"","exit_code":0}` —— 结构化（shell 类）；**exit_code 就在这里，前端完全没读**
  - `_meta.toolNotification.live_output`（#3/#7）流式 stdout 分片 —— 前端也没读
  - 成功且 acp-aware 的工具只发 rawOutput 不发 content（conversion.rs:300-311 `include_content` 条件：失败 || 非 acp-aware || 显式请求）
  - 失败的调用 content 必发（#8：`系统找不到指定的文件` + `Command exited with code 1`）
- **编码坑（旁证）**：cmd 中文报错在真帧上是 mojibake（#8 原文 `ϵͳ找不到指定的文件。`——GBK stdout 被当 UTF-8 收进 JSON）。解释者将来若直接吃 rawOutput.stdout，报错解释会拿到乱码；需按需转码或取 content 文本块（同为乱码来源，但至少结构干净）。

### 1.4 数据可用性总账（解释者视角）

| 数据 | 卡片上有没有 | 喂给解释者了吗 | 备注 |
|---|---|---|---|
| title（工具名·参数摘要） | 有 | **有**（首行 80 字） | 唯一真实输入 |
| rawInput 完整参数（命令原文等） | 有（`_inp`，:1026-1034） | **没有** | §4 需求 R1 |
| 输出文本（content 数组） | **没有**（1036 读法失效） | **没有**（恒 `(空)`） | 根因① |
| rawOutput（stdout/stderr/exit_code） | 没有 | 没有 | exit_code=成败的权威信号 |
| status（completed/failed） | 有（角标） | 没有 | |
| live_output 流式分片 | 没有 | 没有 | |

## §2 活体证据（原文完整保留）

### 2.1 真帧抓取（tmp/r19-frames.jsonl，一次性会话 20260908_5，已删）

提示词：「做三件事…1) shell 执行 git --version；2) read data/no-such-file-xyz.md；3) tree data（深度1）」。8 帧全文见文件，关键三帧原文：

```
#1 {"sessionUpdate":"tool_call","toolCallId":"call_00_...","title":"shell · git --version","rawInput":{"command":"git --version"},"_meta":{...}}
#4 {"sessionUpdate":"tool_call_update","toolCallId":"call_00_...","status":"completed",
    "content":[{"type":"content","content":{"type":"text","text":"git version 2.53.0.windows.1"}}],
    "rawOutput":{"stdout":"git version 2.53.0.windows.1","stderr":"","exit_code":0}}
#8 {"sessionUpdate":"tool_call_update","toolCallId":"call_00_...","status":"failed",
    "content":[{"type":"content","content":{"type":"text","text":"ϵͳ找不到指定的文件。\r\n\nCommand exited with code 1"}}],
    "rawOutput":{"stdout":"ϵͳ找不到指定的文件。\r","stderr":"","exit_code":1}}
```

注意：#4/#8 的 content 是**数组**——前端 :1036 在其上取 `.raw` 得 undefined。此即 `_out` 恒空的物证。

### 2.2 explain_tool 直调对照实验（tmp/r19-explain-results.json，2026-09-08 14:42）

设计：单变量=是否喂输出。Arm A 完全复刻线上真实载荷（title 按真帧格式，output 留空——因为线上 `_out` 恒空）；Arm B 反事实喂上输出尾 600。全部走桥 :8790 → 9Router deepseek-v4-flash，`reasoning_effort:'none'`，13/13 收到终帧，1.2-2.4s/条。

**Arm A（= 用户实际看到的解释）原文：**

| # | 载荷 title | 模型输出原文 |
|---|---|---|
| A1 | `shell · git --version` | `检查电脑装没装git。啥都没显示就是没装。下一步装git。` |
| A2 | `tree · data` | `data空。没东西。` |
| A3 | `shell · type "data\no-such-file-xyz.md" 2>&1` | `打文件"data\no-such-file-xyz.md"没找到。命令报错信息被藏起来。文件确实不存在，没出错提示。` |
| A4 | `faucet db: faucet delete` | `删掉一个叫“水龙头”的水龙头记录。没了。` |
| A5 | `browser: browser navigate · http://127.0.0.1:8099/process/info/faucet` | `打开这个页面，显示空，没东西。` |
| A6 | `load skill · forge-selfcheck` | `做了检查，没问题。可以继续。` |
| A7 | `memory: retrieve memories` | `查记忆，没查到。空结果。` |
| A8 | `shell · "C:\...\process-compose.exe" -p 8099 process list` | `命令启动程序。无信息返回。运行正常。` |
| A9 | `listing files in data directory`（增强标题形态） | `目录空。没看到任何文件。` |

**Arm B（反事实：喂上输出）原文：**

| # | 载荷 title + output(尾600) | 模型输出原文 |
|---|---|---|
| B1 | `shell · git --version` + `git version 2.53.0.windows.1` | `查git装没装。装好，版本2.53.0。` |
| B2 | `shell · type "data\no-such-file-xyz.md" 2>&1` + `系统找不到指定的文件。\nCommand exited with code 1` | `电脑找你要的那个文件，没找到。  \n说明这地址不存在，或名字写错了。  \n换正确地址再试。` |
| B3 | `faucet db: faucet query` + 3 行零件 JSON | `查备件数量。显示3样东西：缸体12个、曲轴5个、连杆30个，各带编号和最后变动日。看到库存多少。` |
| B4 | `browser: browser evaluate` + 表格二维数组 | `零件清单出来了。表格两行，两种零件。` |

复跑命令：`cd C:\ZCodeWorks\PocketForge && NO_PROXY=127.0.0.1,localhost forge/bin/node-v22/node-v22.21.1-win-x64/node.exe tmp/r19-explain-probe.js`
（注意：桥有 sha1(title+output) LRU 缓存，同载荷重跑会秒回同文——要新证据需微调 title。）

## §3 失效模式分类学

- **FM-1 喂料缺失→捏造结果（Arm A 9/9，主失效）**：`(空)` 歧义使模型把「没喂」当「工具返回空」，进而编造与事实相反的结论。实例：A1 把**装好的 git 2.53**（真帧 #4）说成「啥都没显示就是没装。下一步装git」——**事实反转**；A2 把含 160+ 工作区目录说成「data空。没东西」；A5/A7/A8 同型。判定方法：每条 Arm A 输出与 §2.1 真帧比对。
- **FM-2 谎报成败**：A8「运行正常。」——无 exit_code 佐证下的编造；A3 同一句里「报错信息被藏起来」与「没出错提示」自相矛盾（把客户端截断投射成系统行为）。失败调用（A3 载荷本身就是 exit_code=1 的命令）没有被识别为失败的任何信号。
- **FM-3 逐字翻译黑话**：A4「叫『水龙头』的水龙头记录」——禁术语提示词 + 英文工具名 → 音译比术语更难懂。这正是用户批评的「为了形象而形象…变成一种黑话」。
- **FM-4 电报腔**：全样本 8-60 字、句号密度极高（「data空。没东西。」）。成因：≤三句约束 × 输入贫瘠 × max_tokens 300 内的趋短偏好。Arm B 也带此风（B1「查git装没装。装好，版本2.53.0。」）——修好喂料后仍需提示词层面解决。
- **FM-5 关键信息丢失**：所有输出都不能回答「命令是什么、结果是什么、成了没」三问中的至少两问。A6 连动作都错了（load skill 被解释成「做了检查，没问题」——按名字 forge-selfcheck 编了个检查结论）。
- **FM-6（潜在）增强标题切换输入分布**：A9 显示英文短语 title 下模型照样编「目录空」；且增强标题会**丢掉参数摘要**（`listing files in data directory` 不含目录名以外的参数），喂料改革需兼容两种 title 形态。
- 对照结论：**喂上输出后 FM-1/FM-2/FM-5 消失（B1-B4 全部与事实相符），FM-3/FM-4 仍在**——两类根因独立成立，修法叠加。

## §4 重写需求清单（提示词 + 喂料）

**喂料（前置，不修则提示词无解）**
- R1（P1 修复）：前端 :1036 改读数组形态——`upd.content` 为数组时取各 `{content:{text}}` 的 text 拼接（顺带修复工具卡输出区显示）；同点兼容 rawOutput（shell 类取 `{stdout,stderr,exit_code}`）。修复后 explain 载荷自然带上 `card._out`。
- R2：载荷带上 `rawInput`（card._inp 已持有，完整命令原文/路径/参数 JSON）——解释者必须能看到「做了什么动作、对什么对象」。注意 `_inp` 现展示截 1200，喂解释者建议同样上限。
- R3：载荷带上 `status`（completed/failed）或 exit_code，消除 FM-2；失败调用的解释模板应先说「这一步失败了」。
- R4：`(空)` 必须换成无歧义措辞：有输出但被截断→「（前600字）」；真无输出→「（该步骤没有返回文字）」；客户端没拿到→干脆不发这条解释或明说「输出未能获取」。禁止让模型猜空箱子里有什么。
- R5：title 双形态兼容（`shell · <arg>` 与增强英文短语）：喂料里显式给 `toolName`（_meta.goose.toolCall 有现成的 toolName/extensionName，真帧 #1 可证），别让模型从 title 反推。
- R6：编码：Windows cmd 中文报错是 mojibake（§1.3）；喂料侧或桥侧按需 GBK→UTF-8 转换，至少在提示词里告知「输出可能含乱码，按上下文推断」。

**提示词（修完喂料后）**
- P1 受众重定位：默认读者=「会用电脑但不懂 AI 内部机制的人」（即点开这个按钮的人——想懂技术的好奇者），不是「完全不懂电脑的人」。删掉「禁止任何技术术语」——改为**准确名词 + 内嵌一句话解释**（例：「执行了一条命令（command，让电脑做具体事的指令）」）。术语是用户想学的，禁术语等于抹杀点击动机。
- P2 必答三问结构化：①做了什么动作、对什么对象（点名工具真实名与关键参数：命令前若干字/文件名/URL/表名）②结果是什么（成功/失败 + 关键返回值：版本号、行数、报错原因）③这对用户的任务意味着什么（可选，一句话）。禁止在输出未知时编造结果——明确指令「如果某项信息没有提供，就说没提供，不要猜」。
- P3 长度与语感：目标 2-4 句、60-150 字、正常陈述句（禁电报腔）；max_tokens 300 可保持。
- P4 失败调用专用分支：先说失败了 + 报错原文的意思 + 最可能原因/下一步（B2 是现成的好样本，可作 few-shot）。
- P5 保留 sha1 缓存与流式（与质量无关，勿动）；回复截断 500 字可保持。
- 验收基线（建议）：用 §2.2 的 13 条载荷回归——Arm B 系列须逐条答对三问且无 FM-3/FM-4；新增「输出未知」载荷须显式说「输出未提供」而非编造。

## §5 环境变更与清理记录（复核用）

- 一次性会话 20260908_5（帧抓取用）：stop 后经产品路径 delete_session 硬删，库中无 messages。
- sessions.db 今日行现为 `_1/_2/_3/_5`：`_5` 是我插入的**占位空行**（克隆 _3 字段）——用途：跳过 goose 当日发号复用死号 `20260908_4`（research/18 断点①；本会话两次撞雷实录：删最新会话后新会话复用已 close 的 sid，且桥 rescuedSids 去重让救援也失效）。保留 `_5` 使下个新会话拿干净的 `_6`；**勿删**（删了下一个开发者立即踩同一雷）。
- 未能删除的 goose 内存态：进程内 closed_session_ids 含 `_4`/`_5`，rescuedSids 含 `_4`——桥重启即清，无需处理。
- 未改动 forge/ 下任何产品代码；未 git 操作。新增文件：本档 + tmp/r19-{capture-toolcall,dump-frames,explain-probe,del-leftover}.js + tmp/r19-frames.jsonl + tmp/r19-explain-results.json。

## 验证状态汇总

- VERIFIED-RUN（2026-09-08，本机 dev 栈）：真帧 8 条（§2.1）；explain 直调 13 条（§2.2）；`_out` 恒空由真帧形态 + :1036 代码路径联立判定；sid 复用雷两次复现。
- VERIFIED-DOC：§1 全部 file:line 引注（本仓模板 + tmp/goose-src v1.46.0 + tmp/acp-schema）。
- UNVERIFIED：9Router 上 title 增强是否可能启用（两次活体均未出现增强帧；代码路径存在）；goose 1.46 之前版本的 content 线形态（无从离线核对——不影响「当前恒空」结论，因 goose 全程 v1.46.0，STATE/journal 2026-08-20 起可证）。
