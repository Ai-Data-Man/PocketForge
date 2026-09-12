# s78d-fix QA 留档 P3-D：Tab 菜单切会话残留（2026-09-13）

上游报告 tmp/s78-qa-report.md P3-D。s78 QA 家族最后一条已知未修项落地，最小 diff 1 文件 +2 行。

## 修法
- chat.tpl.html 既有 `tabMenuClose()`（代际作废+清 #tab-q 过滤词）挂到会话切换两个收敛口：
  - `openSession()`（busy 护栏后）：侧栏点击 / 搜索窗选会话 / 撤回失败恢复重载全走此口；
  - `$('newchat').onclick`（busy 护栏后）：＋新对话钮 / Ctrl+K / slash 命令 /新对话 全走此口。
- 会话视觉切换在点击时同步发生（subscribe(null) :818 清区+欢迎语、openSession :902 清区），subscribed 迟到帧不重绘聊天区——不构成第三个挂钩点。slash/@ 菜单为内容协议驱动（切会话不清草稿），菜单随内容保持=一致行为，不在本缺陷族内，未动。

## 验证
- GUI 探针 tmp/s78d-p3d-tabmenu-switch.js（playwright 真前端路径，不入库）27/27：五入口矩阵（侧栏点击/搜索窗选会话/＋新对话钮/Ctrl+K/slash 命令）×每入口四断言（菜单必关 display=none + 过滤词必清 + 再按 Tab 可重开即「已开不重置」守卫不再卡死 + Esc 关回归）+ 全程无页面 JS 错误。探针自建空会话（种子 A/B+newchat 路径 3 个）逐一 delete_session 清理（含 ACP close 回收），另收回调试泄漏的 20260912_145，共 6 删 0 败。
- ui-logic-probe 56/56：grab 锚点均不触及 openSession/newchat 区域（本次改动零锚点同步需求），全块语法过。
- 全量顺序：e2e-chat **57/57** → fuzz **178/178**。
- 物化：chat.tpl.html 无物化对象（bootstrap 只物化 chat-bridge.tpl.js→bin；桥每请求直读 conf/templates/chat.tpl.html :2172），改源即生效；仍照纪律 pc process restart chat-bridge（healthz ok，pid 13876）；假路由 :20129 / pg 未触碰。

## 留档观察（不立项）
- 会话删除回执路径（:2408 currentSid 置空+清区）未挂菜单关——删除非切换入口，QA 未flag，同族边缘；后续若动该区顺手同款。
