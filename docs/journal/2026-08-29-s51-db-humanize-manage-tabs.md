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
- samples 只展示第 1 行；BLOB 列渲染为空串而非 [object Object]（cutVal 已 String() 兜底）；展开无并发节流（单用户本地可接受，QA 记录在案）。
- 业务别名表（parts→零件）等真机 POC 出现固定业务库后再议（PM：人工维护，不做 AI 猜测）。
- v0.9.7 护航候选包不含本改动；随下版打包。
