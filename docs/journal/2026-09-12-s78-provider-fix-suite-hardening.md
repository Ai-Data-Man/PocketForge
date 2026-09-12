# s78 服务商配置 P1 修复 + 套件加固 + 熵审计（09-12 深夜班，跨中断续作）

## 班次背景
- v0.9.11 已发布（38b06be 收口）。本班=用户报障驱动 + 章程自主找活。期间云主机/会话中断一次（~15:05→22:59），中断前工作全 commit 幸存；两个后台子智能体（goose v1.50 评估初代）随中断死亡，已重派。

## P1 用户报障：服务商配置「9router 完全配不上去」（取证→修复派发）
- **根因（GUI 实锤，tmp/s78-prov-gui-trap.js）**：chat.tpl.html `renderProviders()` 末尾无条件把表单绑回**活跃**服务商。用户新增服务商后 300ms（prov-add→loadProvidersUI→renderProviders→fillProvForm(active)），**表单 host 被静默重置回旧服务商**（实测：填 127.0.0.1:20129 → 600ms 后变回 111.228.54.166）；随后「拉取模型」打到旧 host——假 9router 收到 **0 次请求**。「完全配不上去」全链成立。
- **附带三缺陷**：①同名档案重添加：前端无条件送 key + 桥端 `Object.assign(ex,msg.add)` 无守卫 → 已存 host/key 被污染表单覆写；②secrets.env 回写过滤正则 `^(KEY)=` 对 NUL 前缀行永不命中（trim 不除 NUL）→ **损坏行永久存活不自愈**（dev 机实锤：文件头 416 字节 NUL + GOOSE_MODEL_NAME 重复行 + FORGE_VISION_MODEL 丢失，见 tmp/secrets.env.corrupt.bak；bootstrap Get-Content 同样解析不出 → Add-Content 再补种重复键）；③list_models 硬编码 `require('http')` → https 端点必炸（test_model 是正确写法参照）。
- **后端链本身健康**（tmp/s78-prov-repro.js WS 级 7/8）：添加→拉模型→勾选→启用→secrets 回写→test_model→ACP 热重启（provider: 9router, model: nine-flash 入日志）全通；唯一红=prompt 往返，系假路由 SSE 格式不合 goose 胃口（测试工具限制，非产品缺陷）。
- **修复**：六点规格派 pf-engineer，**已落地 `bb9c6b6`（2 模板 16+/9-，最小 diff）**：renderProviders 编辑上下文（curProvName）优先重绑/启用钮跟随/前后端 add 空 key 守卫/回写形状门自愈/list_models https。**验证全过**：GUI 陷阱反转（AFTER-ADD host 保持 127.0.0.1:20129+假路由 +1 请求）/WS 全链 7/8（唯一红=假路由 SSE 工具限制）/自愈探针 8/8（PC_TOKEN+非管理键保留、NUL/垃圾行丢弃，真文件备份字节还原）/e2e 55/55+fuzz 150/150+ui-logic 56ck。物化纪律照走：bootstrap 重物化（cmp 逐位一致）+仅 pc restart chat-bridge。探针教训两枚：①自愈探针首版构造了损坏文件却忘了落盘就触发回写——首红是探针 bug 不是产品 bug，补 writeFileSync 后 8/8；红时先审探针再审产品。②裸 http.request 写 WS 客户端时，桥同 tick 写 101+hello 会拼进同一 TCP 段，Node 把 101 头之后的字节放进 upgrade 事件第三个参数 head（不再走 data 事件）——忽略 head 的探针 ~40% 概率「连上但永远等不到 hello」而误报桥挂（tmp/s78-ws-send.js 已修 20/20 稳；**tmp/s78-prov-repro.js 同款潜伏 bug 未修**，复跑若见就绪门/首帧超时先怀疑它）。
- **取证资产**：tmp/s78-fake-9router.js（假 OpenAI 兼容端点 :20129，含 SSE）、tmp/s78-prov-repro.js（WS 全链）、tmp/s78-prov-gui-trap.js（GUI 陷阱）。

## 模型链事故二（与 s77 代理事故同族）
- 中转站静默下架 `deepseek-v4-flash`（/v1/models 109 个新名带 ccp/ ocg/ 前缀族）→ 配置零改动但全部 chat 404 model_not_found → e2e 第 18 节（需真 LLM）红。处置=secrets.env 改 `deepseek-v4.1-flash`（4 候选实测 200）。**s77 挂账的「provider 健康探测告警」backlog 触发条件已满（4 天两事故）**→ 派 pf-pm 裁决升级（tmp/s78-pm-verdict-provider-health.md）。

## 套件加固（set -e 静默中止族，c4b8ce6 漏网）
- `81cdf55`：e2e-chat.sh PCRUN 尾部 `grep -viE` 空输出退 1 → pipefail+set -e 杀全量。**实锤链**：提权直启栈 → pg crash-loop（s66 家族）→ 第 13 节 `pc process stop pg` 无输出 → 套件静默中止 → **pg 被留在停止态**（危险副作用）→ 桥 PG 存储全程文件回落。修=`|| true` 收口+调用方断言计红。e2e.sh:108 同款 grep -q 雷 rc 捕获。
- `c39b548`：第 11 节 ws-delete-receipt 流程超时 20s→45s——断言契约是「回执先于 close」顺序非速度；套件负载下 subscribe→session/new 偶发 >20s 三度误红（单跑恒绿），放宽语义不变。
- **环境教训再确认**：dev 栈必须走 runas //trustlevel:0x20000 降权 wrapper（e2e.sh:88-110 GBK 模式）；旧 wrapper 残留卡 pause 时新实例静默不执行（本日再实锤一次：先 Stop-Process 清旧 wrapper 再 dispatch）。

## 熵审计归档（`docs/research/24-bridge-entropy-audit.md`，81cdf55）
- 前提修正：前端不在桥模板内——chat.tpl.html 独立 2927 行，桥直读。真焦点=两文件 6521 行。
- 零死代码（142/142 函数有引用）；病灶=活代码重复：POST body 样板 17 处、writeHead 58 处、explain/optimize SSE 双胞胎（注释自认克隆）、faucet REST 三胞胎、secrets 回写双源。
- 重构候选 C1（POST/JSON 样板收敛）→C2（faucet 三胞胎）→C5（三大端点顶层化）→C3（SSE 双胞胎）→C4（secrets 去重）；C7 多文件拆分**不做**（6 个模板提取探针+物化链成本>收益）。「不要动」清单 12 项（WS 帧协议/rollback 七步/PG 模式机/救援管线/upload 豁免段等）。物化链安全边界全图（bootstrap 字节复制/升级器差量自动处理 added/deleted/探针锚点清单）。

## goose 上游
- **v1.50.0 已于 09-08 发布**（s76b 09-08 检查时未出，窗口判断过时）。按 research/04 裁决 v1.50=等待目标；评估已重派 pf-researcher（预案 playbook 逐项+第 10 必查：sessions.db messages 表手术面）。

## 进行中（本 journal 落笔时）
- ~~pf-engineer 服务商修复验证中~~（**已收口 bb9c6b6，见上**）；pf-pm 健康探测裁决中；pf-researcher goose v1.50 评估中。
- 排队：小 forge 应用开发与管理能力全链测试（tmp/s78-appcap-test.js 就绪，真模型实景六断言：建库建表/汇总 xlsx/取数问答/@菜单/人话化/清理）；QA 细测 s77 五新功能（tmp/s78-qa-charter.md）；重构批次 C1+C2。

## 主线：小 forge 应用开发与管理能力全链测试（真模型实景，tmp/s78-appcap-run.log）
- **判卷修正后产品层 13/13 全过**（探针 4 处工具 bug 导致初判 10/13，逐条翻案）：
  - S1 建服务+建表+R4 说明 ✓（agent 路径曲折但自洽：手建空 db→学 faucet CLI→注册→python 建 stock+forge_table_info「仓库库存表：记录每样货物的品名、数量和存放的货架位」）；三条插入的权限卡 60s 超时自动拒（我的批卡循环没点中，测试工具 bug）→ **agent 被拒后表现满分**：停下解释、给两个选项、不硬闯
  - S2 汇总 xlsx ✓（5440 字节真实产出；A1=95/B2=30/合计 125 全对；断言红=tree API 形状误读——返回 {root,attachments} 树非 files 平面）
  - S3 取数问答 ✓（数据在 S2 轮被 agent 补种后答案精确）
  - S5 人话化 ✓（TYPE_ZH 前端映射 chat.tpl.html:1666，API 层无字段是设计如此）
  - S6 清理 ✓（服务删除干净）
- **真缺陷一枚（agent 自己发现并报告）**：faucet MCP query/list 服务注册表不一致——`faucet query` 报「Service "s78exam" not found. Available: [plm]」而同进程 `faucet list services` 明明显示 s78exam（transcript 铁证）。根因=faucet.exe（上游 faucetdb/faucet v0.1.12 vendored）MCP 内 query 路径用缓存注册表，CLI 注册的新服务对 query 不可见直到 MCP 重启。**零二开纪律不本地修**；agent 侧 workaround 已自然发生（python 直连/HTTP）。升级 v0.1.13 不含此修复。
- **安全挂账（需用户拍板）**：faucet v0.1.13（2026-09-03）= HIGH 安全修复——≤0.1.12「任何有效 API key 可读写所有服务所有表，角色规则从未生效（含 MCP）」。我方暴露面有限（127.0.0.1+单 key+密钥不外发），但 v0.1.13 改 fail-closed（无角色规则的 key=全拒）→ 升级需先建角色规则，属破坏性迁移。已记 STATE 开放问题。
- 模型链：中转站下架 v4-flash 后已切 deepseek-v4.1-flash（secrets+档案池双更新，全链往返验证「Ready. What you need?」）。
- 测试脚本 4 bug 待修（tree root 遍历/批卡 force-click/@菜单选择器/S5 改 UI 断言）——影响可重复性，不影响本次结论。

## QA 细测回报（tmp/s78-qa-report.md，五新功能矩阵）
- **P1-A 双 subscribed 乱序竞态=真缺陷（需返工）**：s77「人类时间不触发」判词证伪——session/new 往返 ~2s，「开应用 2 秒内点进既有对话」即触发（裸 WS gap 0-1600ms 全复现+GUI 真实路径双证实：页面显示旧会话、currentSid 被迟到 subscribed 翻绑新空会话、消息静默落错处零报错）。同族：sessionClients 双挂+onAgentEvent 无 sid 过滤=跨会话串台，必须同批修。修法建议已入报告（wsPendingNew 代际守卫+旧成员籍摘除）。最小复现=tmp/s78-qa-race.js。
- **P2-A 解释/✨间歇空回**：真链 7/10「它没说出什么来」；直连定根因=deepseek 间歇无视 reasoning_effort:'none'，隐形推理耗尽 300 max_tokens→finish=length 空 content；桥不重试。修法=提预算+空回自动重试一次。
- P3-A explain 缓存键缺 model（ghost 模型 2ms 命中旧解释）；P3 留档：NUL 注入缓存碰撞（explain+optimize 双 1ms 命中）/<changes> 间歇缺失/Tab 菜单切会话残留。
- **正面**：✨「覆盖原文件」5 次真链未复现（模型反加保守闸；sysP 补一句禁令可销 s77 观察项）；U9 \0 键回归过；提示词库 API 17/17+GUI 38/38 全绿；tombstone 恢复活体过。IME「缺陷」实为探针断言笔误（产品正确）。
- 卫生：bin/chat.tpl.html 陈旧残留（9/9 调试拷贝，无引用未入 git，robocopy 会入包）已删。

## provider 健康探测落地（22732d1，裁决 f8d7987 实施）
- 桥 probeProviderHealth()：GET /models 8s 超时四态（down/down+key/stale-model/ok）+ProxyEnable 注册表只读附注；host/model 与 spawnAcp env 链逐位同源（healthTargets）；TTL 30min+换档失效重探+在飞忙期 pending 收尾补探（桩测实锤后补的 3 行）；全异步零同步 IO；s50e 边界=探测零计数零自动动作（桩测断言恒 0）。
- 三触发=WS hello 缓存门/turn 失败 60s 防抖/启动 90s 一次性；无常驻 setInterval（静态断言钉死）。
- 前端 healthSync 克隆 key-guide：三态文案逐字、ok 零视觉、恢复即消、与 key-guide 互斥；GUI 实景 stale-model→修复→条消失零重启 4/4（截图 tmp/s79-gui-*.png）。
- **:610 死名清理**：`|| 'deepseek-v4-flash'` → `|| ''`（全文件零模型名硬编码——两次事故的共同放大器拆除；空则 goose 默认+告警条兜底）。
- 验证：桩测 13/13+静态 12/12+e2e 55/55+fuzz 150/150；护航清单附录三=断链剧本（37507af）。
- 跟进留档：providers 处理器对 secrets.env 缺失 ENOENT（预存在，仅手工树触发）；openclaw gateway 外部进程占 18791/18792（探针选端口避开）。

## goose v1.50 评估收口（05e6be4+00b42a9）
- research/23 双 tag 源码 diff：**可以升 v1.46→v1.50**。三条红线零触碰；**第 10 必查（撤回手术面）全锚点逐字不变**（messages DDL/schema_version 16/B 型 truncate 谓词/当日 MAX+1/load 复活）；三键 panic 族保留（新增 permission.yaml.lock 邻居文件=巡检预期）；G6 双收紧；closed 措辞未差异化。唯一 UNVERIFIED=fork meta 可达性→升级沙盒补跑 FORK-D 判别。实施=下一版本窗口走 playbook（基线 55/150）。

## 主线测试第二轮（修复批 6d94f3a 后，tmp/s78-appcap-run3.log）：13/13 全真通过
- S1 三行数据入表（批卡 force-click 修复生效）+R4 说明；S2 xlsx 制品断言真通过（tree 递归遍历）；S3 数据精确；**S4 @菜单真实弹出含人话分组**：「库里的数据（点一下引用表名）🗄️s78exam.forge_table_info 1条 🗄️s78exam.stock 3条」；S5 双端断言过。
- **S6「红」=加分行为**：agent 对不可逆删除主动列爆炸半径求确认（服务登记+db 文件+数据，报表成品默认保留）——断言没答确认话，产品判通过；脚本已补确认续轮。
- P4 观察两条：S3 轮 agent 用 curl 带 X-API-Key 直查 faucet（key 明文显示在工具卡参数里——本地无洞，妻子可见长密钥略糙）；cmd dir 中文文件名 GBK 乱码（已知家族，纯外观）。
- 值得记录：本轮 agent 查数据走 curl+HTTP 而非 MCP query（faucet stale 缺陷的自然绕行再次发生，佐证挂账②）。

## 重构批 C1+C2（8f0e6e2，research/24 §7 实施）
- chat-bridge.tpl.js 3706→3597 行**净删 109**（+104/-212）：顶层 readJsonBody/json200 两助手；17 处 POST 累积样板全替换（含 upload 二进制站；update/upload 豁免段零触碰）；writeHead 58 处中 39 处成对收敛、**有意保留 19 处**（多落点/先写头再分支/schedToggle 可变状态/无 charset 头——行为零变化优先于行数指标，JSON.parse 留端点 try 内保报错文案逐字不变）；faucet 三胞胎消亡→faucetGet 一个。
- 验证：e2e 57/57+fuzz 150/150+6 静态探针全绿锚点零同步+ia3 行为门+行为抽检同形。TDZ 撞名一处（node --check 抓不到的运行时坑，已全量排查）。
- **测试残留事件**：fuzz 基线一度 149/150=主线测试 run3 的 S6 确认后删除未彻底（服务登记未除+db 文件被 MCP 句柄占用——stale 家族再佐证）；主控收尾清理=faucet db remove（--data-dir 必须）+桥重启释放句柄+删库文件，overview 回净 [plm]。**appcap 脚本 S6 断言时点也有份**（确认续轮后的 overview 检查在桥外看 MCP 缓存）——留观。

## 支线研究（4d48e7c research/25）
- 对标景观→P32 输入：应用资产化（缺「它做过的东西」统一清单，触发器=真机「找不回」≥2 次）/agent-native 对等叙事零开发可用/生成式 UI+自主巡检明确不跟进/研究类任务前 3 源止损线入工作方式。

## QA 独立复审三批（tmp/s78b-qa-review.md）
- **批1 22732d1 需返工**：P1-1 hello 竞态——探测只在态变化时广播+hello 过期路径 fire-and-forget→TTL 过期+态不变=触发方零帧（沙盒实锤 tmp/s78b-health-race.js：重探发生但 B 零帧）；隔夜首开+链路持续坏=裁决主指标失效；修法 3 行（probeProviderHealth(reply) 收尾必发）。P3：switch_model 同档不失效缓存+models[0] 漂移可误报≤30min/:659 死分支/gui 探针自身 flaky。
- **批2 6d94f3a 通过**：代际守卫真闭合（3 发起点 grep 全量核+e2e§20 复跑）；P2-1 sid 过滤误丢 session/request_permission（ACP 规范带必填 sessionId）——刷新窗口权限卡永久丢失→turn 挂死+busySids 泄漏；修法 1 行豁免。
- **批3 8f0e6e2 通过**：行为零变化 A/B 实证（双沙盒 17 恶意 POST+8 GET 逐字节 SAME；update/upload 87 行零 diff；TDZ 注释属实）；P3 卫生三条；净删除实 108。
- 排程：P1-1+P2-1 合小修批（已派），合入后主控跑全量。
- 手册：使用说明.md 补 s77 五功能+健康提醒条妻子话术（a15f1bb）——章程优先级 6 缺口销账。

## s78c 小修批+签名灾难热修（e9f04ee→b4e02d2）
- 小修批 e9f04ee：P1-1 健康探测 reply 必答（probeProviderHealth(reply) 收尾对触发方必发，态变化才全员广播保持；负对照验证）+P2-1 permission 帧豁免 sid 过滤（session/request_permission 带 ACP 必填 sessionId，刷新窗口丢卡=turn 挂死）；顺手 :2507 json200+readJsonBody 删参。探针 24/24（新增刷新窗口 permission 必达断言）+health-race 5/5 转正。
- **签名灾难**：e9f04ee 的 readJsonBody 删参 (req,res,cb)→(req,cb)——工程师判「多余实参无害」实为位置绑定灾难（res 灌入 cb 位，end 时 res(buffer) TypeError），**全部 POST 端点连接重置**（主控全量 e2e 43/57+fuzz 77/150 红实锤；其探针全 WS/GET 面零 POST 覆盖）。热修 b4e02d2 回滚三参签名。**教训入册：改公共函数签名，验证必须覆盖调用面（全量回归），自有探针绿≠安全**。
- fuzz 残余单红=mcp-catalog 探针不幂等（中断遗留沙盒 EEXIST），77eb8c9 先清后建+双跑验证。
- **终态：e2e-chat 57/57 + fuzz 150/150（e9f04ee 两必修有效+签名回滚后）**。

## 重构批 C5+C3（367b57a）+ autocrlf 根治（e622060）
- C5：handleUpdateUpload/handleSchedules/handleSkillstore 三段顶层化（脚本断言式核对平移体与原文逐字节一致仅差缩进；schedToggle writableEnded 门/upload 豁免段零触碰；sched-drift 探针签名正则本不锚缩进，零改动过）；handleHttp 最大函数瘦身 71+128+72 行。
- C3：explain/optimize SSE 双胞胎（53+52 行）合并 llmStreamOnce 62 行（400 降级/over 抢答防护/length 空回阶梯 800→1600/reasoning 忽略/settled 门）；缓存键与四族人话措辞逐字保留——探针零改动全过（设计保锚点字面量在 helper 内）。
- 验证：sched-drift 15/15+toolcard 25/25+explain-retry 13/13+全量 e2e 57/57+fuzz 150/150。净 -17 行（注释保留义务吃掉预算，审计预算按薄助手估算偏乐观——记入审计勘误）。
- **autocrlf 幻影根治**：工程师 checkout 模板被 smudge 成 CRLF 打死探针 \n 锚点（过程事故）——.gitattributes 钉 *.tpl.js/*.tpl.html/chat.tpl.html/tools/e2e/* 为 eol=lf（e622060；首版注释 printf 转义事故当场修正）。
- 重构三批合计（C1+C2 净-109 + C5+C3 净-17）：桥 3743→3580 行，样板/双胞胎/三胞胎/巨型函数四病灶全部收敛，探针锚点零破损。
