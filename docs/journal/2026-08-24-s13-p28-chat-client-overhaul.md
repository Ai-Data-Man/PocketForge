# 2026-08-24 s13 — P28 聊天客户端大修：崩溃根治 + 制品工作区层 + 版本管理 + 工具解释

## 用户实测反馈驱动的定位（开工前取证）
- 用户报告 7 条问题。取证发现 **1 个致命根因**：`chat.tpl.html` 顶层脚本引用不存在的 `$('up-btn')` → TypeError → **其后的 `connect()` 永不执行**，WebSocket 全程未建立。一个 bug 同时解释"上传/@/新对话/停止/slash 无效"。
- 第二根因:`/api/link` 后端从未实现(p27 journal 虚报 "junction linking",只有前端 fetch)。已在 s12 记录更正。
- 结论:同类"一处顶层异常杀死整页 JS"已是第二次(s12 ClipboardItem)。本次加入结构性免疫。

## 实现(P28a–d)
- **防崩结构**:window.onerror 陷阱(`__pfErrors`,兼作测试断言)+ `connect()` 前置;UI 层全部裸 `ws.send` 换成守护版 `wssend`(未连接时友好提示)。
- **每会话工作区(ADR-0007,用户裁决物理分区)**:`data/artifacts/ws-<MMDD-HHmmss>/`,uploads+junction 在区内,`.git` 随区(版本史按任务隔离);`data/workspace-map.json` 持久绑定;删会话不删区(孤儿区全局可见);`/api/workspaces` 全局视角+「引入到当前对话」重绑;v3 一次性迁移(旧散落文件+根 .git → ws-imported/,历史保留)。
- **版本管理**:vendored isomorphic-git 1.41.9(MIT,8.3MB,VERIFIED-RUN);agent CLI `bin/artifact-vcs.js snapshot/log/restore`;桥 `/api/vcs/log|blob|restore`;右栏 🕘 时间线(时间+大白话说明+看+恢复);恢复前自动存当前版。
- **slash 重做**:中英别名模糊(/new、/she、拼音首词);技能动态并入菜单(🧩 前缀);Enter=执行首项(逐字键入路径验证);移除 /停止(发送旁按钮已存在,修好即用)。
- **工具卡"这是干啥？"**:完成后按钮 → 桥直调当前 provider/model 一次性 chat completion,大白话解释,不污染会话历史;兼容 ACP 双形态(tool_call 顶层 status 与 tool_call_update);解释到达自动展开折叠卡。
- 上传/拖拽成功反馈列出数量与位置;@ 菜单无命中不再弹空盒。

## 测试中发现并修复的真缺陷
1. isomorphic-git 不收短 oid → 统一 `expandOid` 展开(桥×2+CLI)。
2. CLI 文件参数带工作区前缀时路径重复拼接 → 剥前缀。
3. `#at-menu` 定位锚点丢失(#inputbar 无 position:relative)→ 菜单渲染到视口外不可见——"@ 实测不可用"的第二层原因,纯 CSS 一行修复。
4. HTTP handler 无总兜底,查询串异常会挂死连接 → 包 try/catch 回 500 JSON。
5. ACP 工具完成状态两种事件形态 → 兼容读取。
6. 孤儿工作区不显示引入按钮(条件写错)→ 修正为"非本对话即可引入"。

## 验证
- API 级(ws 版):建区/区内上传/列表/junction 外链/bind/workspaces 元信息/vcs log-blob-restore 往返/路径穿越拒绝,全绿。
- GUI(iab 浏览器):零 JS 错误;新对话自动开区;slash 中英模糊+技能并入+Enter;全局视角+未关联徽标+引入;🕘 时间线展开(迁移历史 3 条);版本预览弹窗;@插入完整路径;真实任务工具卡+💡大白话解释(10s 返回)。
- 全栈 e2e.sh 回归:见 STATE(本轮结果记录于 commit message)。

## 教训
- fill() 程序化输入事件与 IAB 键盘竞态会造成假阴性,GUI 断言优先用逐字 type() 走真实键盘路径。
- "实现了"必须以端到端用户路径为准——p27 的 junction 和 @ 菜单都死在"最后一公里"(后端缺失/视口外),单元级存在≠可用。
