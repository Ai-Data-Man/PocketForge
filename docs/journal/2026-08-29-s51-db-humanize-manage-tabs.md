# 2026-08-29 s51 — 小白可用性三主线（管理面板标签页 / 数据表人话 / 记忆检索）

## 背景（用户三条主线，pf-pm 裁决书归约）
用户代妻子（纯小白）提出：①数据表可见性过于技术化；②管理面板六区块挤一屏无隔离；③数据多了只能手动下拉找。pf-pm 裁决：②→①→③ 串行（同文件避免冲突，②是①③落点）；业务含义 AI 翻译永久裁掉（错的翻译比不翻译危害大），解释力主力交给「人话类型 + 真实样例值」。

## 实现（一个可验证单元一次 commit）
- **②容器**：manage-modal 六区块 → 六 tab（本事/数据/记忆/定时/插件/护栏），复用 .rtab 样式；懒加载（首切才拉，mtabs 缓存标记）。
- **③记忆检索**：mem-q 搜索框（category/text/tags 前端过滤）+ 50 条渲染上限 +「显示更多」；memRow 抽取。
- **①schema 人话**：桥新增 GET /api/db/_schema?svc=&tbl=（DB_NAME_RE 白名单→faucet CLI schema→REST max_results=3 样例）；UI 点表名就地展开列清单（列名原文 + TYPE_ZH 人话类型 + 样例值截断 40 字符 + pk 标「唯一」）。

## pf-qa 审查（默认返工裁决 → 4 项修复）
- FIND-1（P1 回归）：懒加载缓存使重开面板永不刷新（旧空清单打脸「小白可用性」）→ open-manage 重置 mtabs 标记。
- FIND-2（P1）：loadMemUI 失败分支 memAll=null → 搜索框 TypeError → catch 分支 memAll=[]。
- FIND-3（P2）：fuzz 未收编 _schema 向量 + e2e 只验 ok:false 分不清白名单拒绝 → fuzz 加两条「表名不对」白名单钉子。
- FIND-4（P3）：_schema 错误消息回显 tbl 无上限 → slice(0,64)。
- P0 无。注入面（execFile 无 shell + 白名单）、XSS（新拼接点全过 esc）、Origin（实弹 403）均过。

## 验证（全绿）
- e2e-chat 26/26（新增 5 断言：columns+samples+pk / POST 405 / unknown table / path-ish 拒 / 无泄漏）
- fuzz 23/23（+2 白名单钉子）
- GUI 真机目检（Edge + a11y）：面板六 tab 默认仅本事可见 → 切数据 tab 懒加载出两张表 → 点 plm.parts 展开出列清单（id 唯一/整数/1，code/文字/P-001，name/文字/轴承，qty/整数/42），表名/列名保留原文（@ 引用链路不断）。夜间主题下渲染正常（全复用既有令牌变量，无硬编码色）。
- 行为注记：浏览器缓存旧模板导致首验误判——F5 后新页面生效（交付树有 no-cache 头，仅已开页面需刷新）。

## 遗留 / 记录
- samples 只展示第 1 行（符合 PM 裁决「每列列名+人话类型+样例值」单样例形态）；BLOB 列 cutVal String() 兜底为空串；展开无并发节流（单用户本地可接受，QA 记录在案）。
- 业务别名表（parts→零件）等真机 POC 出现固定业务库后再议（PM：人工维护，不做 AI 猜测）。
- v0.9.7 护航候选包不含本改动；随下版打包。
- **流程坑（本轮险情）**：chat-bridge.js 真相源是 conf/templates/chat-bridge.tpl.js，bin/ 产物是 cp 同步且被 gitignore——直接改 bin 会静默脱同步（本轮 commit 前 diff 抓回，已移植 tpl+重同步+复验）。后续改桥必须先改 tpl。

## s51b：e2e.sh 收尾挂死修复（EXIT=0 验证）
- 症状：全量 e2e.sh 逻辑 8/8 PASS 但 bash 永不退出，连续 4 代僵尸树各挂一只 python http.server 8124；后台任务模式输出 log 0 字节（tail 缓冲不刷）。
- 归因（单变量隔离）：stdout 走管道（`| tail`）时，goose run 拉起的残留子进程握住管道写端 → `$(... | tail -30)` 等 EOF 永久挂死；`>文件` 重定向无此问题。EXIT=0 前台复跑两次确认修复。
- 修复（双防御）：①goose 输出改写 /tmp/e2e-goose.out 再 tail；②fake-plm python 加 `</dev/null` 三向脱管。
- 连带事故：e2e 第 5 步 down/重启后孤儿 nats(3856)/faucet(13632) 抢端口（父已死），pc 的 nats Restarting 循环——按既有坑记录 taskkill 清理+pc restart chat-bridge 后恢复。终态：e2e.sh 8/8 + e2e-chat 26/26 + fuzz 23/23 全绿。
- UNVERIFIED（环境层，不阻断）：MSYS bash 偶发无子进程仍挂死（幻影 ps 条目）——dev 环境特性，目标机交付树不含 e2e 脚本，不再深挖。

## s51c：pf-qa 二轮 → 换线自动重发竞态修复（P1）+ P3×3
- 二审结论：s51b 挂死修复机制成立；s50e 401 人话文案静态复测成立（裸 401 须上下文词，10 组样本无误报）；_schema 注入/XSS/二次解码/duplicate 参数（get 取首个，方向安全）/8KB URL 全过。
- **FIND-1（P1）**：provider_switched 里 `subscribe(null); f()` 同步执行——sessionId 要等 subscribed 回包才更新，自动重发打到旧死会话（桥 hotRestart 不清 wsSession WeakMap → session not found）。修复：对齐同文件 pendingSwitch 范式——switched 时仅 subscribe(null)，重发挂 subscribed 分支 setTimeout 800ms。桥侧零改动。
- P3-1 换线确认提示 addInfo 被行尾注释吞掉 → 救回独立成行；P3-2 六 tab 补 role=tablist/tab + aria-selected 同步；P3-5 关管理弹窗 clearTimeout(mcpPollTimer)。
- 备忘（未修，低频）：裸 401 无闸词时静默（P3-3）；错误文本含用户自己说过的「api key」回声会误路由 401 分支（P3-4）；e2e.sh 结束不回收 8124 fake-plm（P3-6，残留进程家族另一成员）。
- 回归：e2e 26/26 + fuzz 23/23。真 401/双档案实景留护航（dev 中转不校验 key 制造不出来）。
