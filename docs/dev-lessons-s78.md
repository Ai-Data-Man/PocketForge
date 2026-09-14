# 工作方式教训集（s78 会话沉淀，2026-09-12~13）

> 来源：s78 长会话（服务商 P1 修复→健康探测→QA 三轮→重构五批→goose v1.50 升级→fuzz 扩展）中实锤的工程教训。每条都付过学费，供后续会话直接引用。持续追加。

## 代码工程

1. **公共函数签名变更，验证必须覆盖完整调用面**（b4e02d2，全 POST 端点连接重置）：JS 位置绑定下，调用点的「中间实参」不是「多余尾部实参」——删中间参数会把后位实参灌入前位形参。自有探针全绿≠安全：探针面恰好在未覆盖的调用面外。铁律：改签名→全量回归。
2. **逐字节平移类重构的验证用脚本断言，不靠肉眼**（C5 批）：括号配平提取函数体+dedent+逐行比对，比 diff 审查可信一个量级；QA 终轮独立复算 70/127/71 行全同。
3. **行为零变化重构的「有意保留」要逐点留注释**（C1 批 19 处保留 writeHead）：否则下一个人会「顺手补齐」破坏响应序。
4. **CRLF/GBK 是本仓库三大复发性环境家族**：①autocrlf checkout 幻影→.gitattributes 已根治（e622060）；②Edit/Write 工具写文件可能带 CRLF→提交前 `git stash/pop` 归一或检查；③cmd 中文文件名/GBK wrapper（runas 必须复刻 e2e.sh:88-110 模式）。
5. **升级类工作的「唯一真实行为差异」往往不在预案清单上**（goose v1.50 stdin EOF）：十面回归设计得再全，也会撞到清单外差异——回滚位先备好，差异定位用三重实证（恒开管道/null-stdin/旧版对照）。

## 测试工程

6. **探针只测能过的形态=没测**（maskKeys JSON 形态绕过，QA 终轮）：断言设计必须从「真实主要形态」出发（MCP rawInput 是 JSON.stringify 渲染，不是 shell 行）；负对照（修前模板跑新断言必须红）是判别力的证明义务。
7. **探针对模板/服务的计数类断言在服务端有自发请求面时不稳健**（goose session/new 自拉 /models）：改存在性断言。
8. **裸 WS 探针必须处理 upgrade head 参数**（Node http 101+首帧拼段时首帧不走 data 事件，~40% 假超时）：`if(head&&head.length) socket.emit('data',head)`（tmp/s78-ws-send.js 范本）。
9. **沙盒探针必须幂等**（mcp-catalog EEXIST 打死探针=fuzz 假红）：linkSync/mkdirSync 前先清目标；「中断遗留」是常态不是异常。
10. **e2e/fuzz 不并行 + 环境三查**（pg 提权家族第三次实锤）：跑套件前确认栈是降权 runas 拉的（pg Ready restarts=0）；红的归因先查环境再查产品（本会话两次套件大红都是环境/测试工具，零产品回归漏网）。

## 产品观察方法

11. **「功能效果差先查喂料断供再骂提示词」**（s77 research/19 原则，本会话复验）：解释空回根因是模型侧隐形推理耗预算，不是提示词。
12. **GUI 级复现是 UX 缺陷的判卷标准**（服务商表单重置陷阱）：WS 级全通不等于用户路径可用；playwright+JS click 批卡循环（`.permcard:not(.settled) .pbtn-acc`）+force click 是标准工具。
13. **误导性安慰比零信号更糟**（PM 裁决 §1+SSE error 吞没双验证）：错误文案必须指向真出口；「等一等再试」只可用于真瞬时故障。

14. **资源管理器窗口用完必须关闭**（用户环境硬规则，2026-09-13 立例）：云主机上 explorer 文件夹窗口累积不关会打崩 explorer.exe → 用户远程访问黑屏。任何探针/测试/人工操作打开了 explorer（CabinetWClass）都要当轮关闭；值守/巡检顺手数一遍（PowerShell EnumWindows 计数，>0 即逐个 WM_CLOSE）。本轮排查：0 残留。
15. **fire-and-forget 清理动作与异步装配完成之间没有「响应即完成」的等式，但「响应时刻」是桥侧唯一可靠锚点**（s80g 秒删泄漏→s81 修复）：goose session/new 的 resolve 时刻=扩展树装配完成（v1.46/v1.50 源码 join_all await 后回包）——QA 的「close 先于装配发出」假说不成立于 delete 路径；真实形态是「装配刚完成的冷/载窗内 teardown 丢失」。修法不在「等装配」（已等）而在「错峰」：出生门控延迟 close（born+10s），sid 复用场景在 session/new 发起点冲刷 pending close（stdin FIFO 保序=严格不劣于旧语义）。教训拆三段：①转交报告里的机制假说要源码级复核再定修法，修「假想竞态」会修错方向；②不可复现（冷窗独立 0/2）不等于不存在（QA pid-birth 10min 铁证）——此时修法必须带「严格不劣于现状」性质（延迟只影响时间不改变语义、复用路径保序冲刷）+行为级断言钉住新语义；③探针相位污染（A 相位漏删会话→C 相位基线含活树）会让断言永远红——pid-SET 断言的基线必须与被测生命周期隔离。
16. **探针/套件的 rm -f 清理要按结果分叉**（s81 附带落地）：绿清红留——失败证据被无条件清理等于丢案发现场（冷窗快败形态首红至今未捕获即此因）。
17. **fuzz 套件跑完后真会话可能连环「Session not found」**（s83 实锤）：fuzz 收尾删除当日最新会话 → goose 内存 closed 集里躺着这些号 → 后续 session/new 按当日 MAX+1 回退复用 closed 号 → prompt 撞 closed 守卫 → 救援新会话又拿到下一个 closed 号 → TURN_LOST 连环。这是 s76 僵尸家族的长尾形态（单次删除 vs 批量清尾的差异只在烧穿号段所需次数）。处置=pc restart chat-bridge（清 goose closed 集）；判别特征=桥日志连续「session/prompt rejected … Session not found: <新号>」且 sessions.db 行存在。**叠删当日顶号 ≥2 必烧穿单次救援（goose closed 集留号），清理后必须烧号**（s83b 对照实验证实；探针 ws-fuzz-s50h 已内置：删 N 个即弃会话烧 N 个号，把当日 MAX 顶回删除前水平）。
18. **Playwright 跨 evaluate 传元素引用不可靠**（s83 GUI 探针）：page.evaluate 返回的元素数组经序列化往返，紧接的下一句 evaluate(el=>el.textContent, handle) 可能拿到 undefined——文本断言一律在单次 evaluate 里 map 成字符串返回。
19. **浏览器会把 cssText 归一化（补空格），属性子串选择器必踩空**（s83 openAsset）：模板里写 `cursor:pointer`，DOM 里是 `cursor: pointer`——`div[style*="cursor:pointer"]` 永远选不中。要用 getAttribute('style')+正则（/cursor:\s*pointer/）。同款坑第二处：管理面板 tab 懒加载（showMtab 自动触发 load）与显式 loadXxxUI 并发=双拉竞态，后完成者的重绘会折叠掉先完成者的展开态——跨面板联动先占掉懒加载位（mtabs.x[1]=true）保单次。

20. **faucet db remove ≠ db 文件可删**（s83 QA 实锤）：faucet-rawsql 进程也持有各 sqlite 库的句柄——服务移除+重启 faucet 后 db 文件仍 busy，须再重启 faucet-rawsql 才能删文件。所有"建测试服务"类工作的清尾清单要验到文件级（`ls data/sqlite/` 与建前快照比对），否则留死文件+下次同名建库的陈旧dsn陷阱。
21. **GUI 页面加载型探针每次 goto 都是一次真 subscribe(null)=新会话**（s83 QA 实锤，#17 的 GUI 面）：playwright 打开聊天页即在 goose 落一个真会话号+空工作区（ws-<date>-<seq>）；探针崩在半路就漏删。自清清单=①探针前后 sessions.db 号段 diff；②delete_session 走桥正道；③**delete_session 不删制品目录**——空孤儿 ws 目录要手动清，否则 artifacts 计数漂移成为下一个人的基线噪声。
23. **faucet db remove 后删库文件有两个句柄源**（s83 复审+#返工实锤；原误编 15，撞 s81 批同号，2026-09-13 夜改 23）：faucet-rawsql 服务进程之外，goose agent 的 `faucet mcp` 子进程也缓存已移除库的 sqlite 句柄（s78「新库 MCP stale」同族）——清理须连杀 mcp 子进程（serve 服务进程不动）再删文件。
22. **迸发型 SQLITE_BUSY 的「同波固定退避重试」治标不治本，单飞合并才是根治**（FINDING-1，s83 fuzz 追批 bea6ee7 实锤）：faucet CLI 的 config store（faucet.db，无 busy_timeout）在桥迸发下 SQLITE_BUSY(5) 快败（100 进程迸发 ~90% 进程级复现；桥响应级表源静默缺席 22-48%）；给每个失败调用加固定 +200ms 重试=50 个失败者组成第二波同步重撞，丢源率纹丝不动（修法实证走过的弯路）。根治=桥侧调用收口处同参并发读**单飞合并**（in-flight Map 去重，50 并发请求只起 1 个 CLI 进程，消灭迸发本身）+失败 150-300ms **抖动**退避重试（防残余同波再撞），丢源 0/50×3。次教训：静默降级通道必须与可见通道同标记——dbOverview 的 list 失败置 tblMiss 而 schema 失败裸 catch 吞掉，用户对 ~20% 表源缺席完全无感；降级路径每个分支都要有可观察出口，否则丢源=丢证据。
24. **自建自清探针的「基线快照」必须在幂等预清之后取**（s83d 复审 bea6ee7 实锤）：assets-fuzz-probe svc 相位先快照 data/sqlite 再预清残留——上一轮崩溃留下的 fuzzassets.db 被预清正确清掉，但收尾比对用的快照仍含它 → 干净重跑假红（实测：植残留跑探针 13 绿+1 假红，escalation=0、终态实净）。#9 讲的是「先清后建」，本条补全为「**一切基线类断言（快照/计数/diff）的取样时刻也要在预清之后**」——顺序错了，幂等做得再好也是红。方向保守（假红非假绿）无漏检风险，但烧分诊时间。
25. **套件脚本的副本必须重锚 ROOT，且首跑前要验证一个 $ROOT 引用探针能起**（s83e 取证驱动实锤）：e2e-chat.sh 的 `ROOT="$(cd $(dirname $0)/../.. && pwd)"` 按脚本所在层级推导——复制到 tmp/ 层级会把 ROOT 解析成仓库的父目录（C:\ZCodeWorks），§1-9 纯 HTTP 节全绿（硬编码 :8790）掩盖了 ROOT 已错，从 §10 起全部 $ROOT 引用探针 MODULE_NOT_FOUND/静默失败=27 红级联，形似「系统性环境崩坏」实为工具自身。判别特征：红面恰从「首个 $ROOT 引用节」整齐起步、静态桩测（无桥依赖）也红。
26. **固定文件名证据 + 绿路径清理 = 后跑覆盖先红**（s83e 实锤，#16 的时序补全）：取证驱动把 §18c 输出落到固定名 /tmp/ws-rollback.log——红轮（D1）的证据被下一绿轮（D2）的同名 `>` 覆写再被绿路径 rm 清除。红时归档必须**立即**复制到带时间戳/轮次号的目标（cp 在红分支内联完成，不留给下一轮），固定名文件只当中转不留档。

## #27 防火墙端口级收敛不足以封堵爆破（2026-09-14）

**现象**：把 RDP/WinRM 的端口专用放行规则来源收敛到白名单 IP 后，4625 爆破仍以 ≈14 次/分持续。
**根因**：Windows 上存在大量系统级 `Port=Any + RemoteAddress=Any` 的启用放行规则（Windows Search、你的帐户、工作或学校帐户、开始、桌面应用 Web 查看器、Windows 安全中心、sing-tun/TaishanNetCore 等）。`LocalPort=Any` 意味着这些规则**也放行 3389/5985**，端口级收敛被完全绕过。
**修法**：不改系统规则（盲删有副作用），改用**显式阻断**——Block 优先于 Allow，追加 `-Action Block -RemoteAddress <全网段减白名单>` 的高优先级规则即可覆盖所有 Any 放行。
**要点**：
- 阻断集要「全网段 − 白名单空间」，且私网（10/8、172.16/12、192.168/16）**故意保留不封**，以免切断云 VPC 内管理通道。
- 放行规则收敛时**按端口匹配**而非显示名（本地化显示名在 GBK/UTF-8 环境下易踩编码坑，`Get-NetFirewallPortFilter.LocalPort -contains '3389'` 更稳）。
- PowerShell 5.1 读 UTF-8 无 BOM 的中文脚本会按 GBK 解析导致语法错误 → 运维脚本一律写纯 ASCII。
- 防火墙不过滤 loopback，本机 127.0.0.1 业务不受影响（回归确认 8790/8099/8092/5432/4222 全通）。

## #28 从日志反推用户"常用位置 IP"（2026-09-14）

**场景**：用户只给"公司/家/出租屋各一个 IP"的模糊描述，需要从日志定位。
**方法**：`Microsoft-Windows-TerminalServices-LocalSessionManager/Operational`（TS-LSM）保留的 RDP 成功会话日志比 4624 历史更长（本例 05-20 起 1845 条 vs 4624 仅 33 小时）；其事件 21/24/25 的 Message 内含源网络地址，用正则 `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` 提取。再做**行为画像**（小时直方图 + 星期分布 + 连续使用段）与 **geo 多源交叉核验**（vore.top / mir6 / zxinc），即可把"工作日白天固定单 IP / 晚间 5G 动态池 / 周末固定段"三类模式与用户口述地点对齐。
**判据**：不同 geo 源对同一 IP 结论需一致；用户归属以**行为节律**为主证据（IP 归属地只作辅证，因为 5G CGNAT 池和 IDC 会给出误导性结果）。

## #29 pc project update 按 CLI 客户端 env 插值——手跑必须全 env + 全 -f 文件（2026-09-14 s87）

**现象**：s87 活体探针清理段执行 `pc project update -f <仅 conf/process-compose.yaml>`（execFile 环境来自 git-bash node，无 FORGE_ROOT/FAUCET_PORT）→ `${FORGE_ROOT}` 插值留成字面量 → chat-bridge/faucet/nats 全栈 crash-loop（pc.log 里反复同一条 GBK 乱码错误，实为「系统找不到指定的路径」），桥 ECONNREFUSED。
**根因**：pc 的 `${VAR}` 配置插值发生在 **CLI 客户端上下文**（project update 把客户端解析后的定义送给守护）——守护自身 env 里的变量救不了客户端缺失的；且 update 是**整组替换**语义：少传一个 -f（ports.env.yaml/apps.env.yaml）= 该组定义整体消失。
**修法**：恢复 = 重聚合 apps/ + 按 dev-stack-up 全套（3 个 -f + FORGE_ROOT/PC_PORT/FAUCET_PORT/PG_PORT/NO_PROXY 全 env）project update → 8 进程 restarts=0 全健康。
**要点**：
- 手动/探针侧驱动 `pc project update` 的唯一安全形态=**完整复刻拉起脚本的 -f 列表与环境**；只想「撤掉一个 app」也必须带上全部基础文件（或改走 pc process stop/start 单进程级操作）。
- 产品路径不受影响：agent 的 env 链（桥→pc 守护→goose）自带 FORGE_ROOT，hints 步骤 2 的命令形态经实测安全。
- crash-loop 的日志签名=进程 stdout 反复同一条 GBK 乱码错误；看 pc.log 定位，不要猜。

## #30 bash heredoc/echo 传输层吃转义——反斜杠内容禁走 shell 拼接通道（2026-09-14/15 s86-s88）

**现象**：一夜三起同根事故——①s86 模板首版 `\bin` 被写成 `\x08in`（python 源 `\b` 经 heredoc 折半成 `\b`→退格字节，pg-init 早先"通过"是守卫在坏行前退出的假绿）；②PFdrill2 启动 wrapper 内容损坏（`forge` 的 `\f` 被吃成 form-feed→路径变 `PocketForgeorge`，中文被写成 `\u542f` 字面量→任务 exit 1 静默栈不起）；③s88 终验 fixture 的 `\"` 经 heredoc 落盘成字面 `\"`→进程起不来。
**根因**：本环境 bash 的 heredoc/echo 传输对内容做一层转义解释（`\b→\b`、`\f`、`\"` 等反斜杠序列不保真）；凡内容含反斜杠/非 ASCII，经 shell 拼接通道写盘即损坏。
**修法/纪律**：
- 写含反斜杠或中文的文件：一律 Write 工具直写，或 python 内 `chr(92)`/base64 构造敏感字符，**禁止 heredoc/echo 管道**。
- 写完必做字节级自查（backspace=0x00 计数、目标子串在场、编码断言）——s88 主控修 wrapper 用的"按工作样板字节级等长替换"是同族稳妥形态。
- 事故签名：`.cmd`/yaml 里出现 `PocketForgeorge` 类缺字路径、`\u542f` 字面量、0x08 字节、`\"` 残留；计划任务 exit 1 零输出。
