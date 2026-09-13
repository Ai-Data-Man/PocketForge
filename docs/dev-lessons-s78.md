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
15. **faucet db remove 后删库文件有两个句柄源**（s83 复审+#返工实锤）：faucet-rawsql 服务进程之外，goose agent 的 `faucet mcp` 子进程也缓存已移除库的 sqlite 句柄（s78「新库 MCP stale」同族）——清理须连杀 mcp 子进程（serve 服务进程不动）再删文件。
