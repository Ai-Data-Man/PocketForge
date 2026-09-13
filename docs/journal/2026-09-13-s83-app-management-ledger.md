# s83：应用管理——做过的东西三源聚合（裁决实施批）

- 日期：2026-09-13 ｜ 实施：pf-engineer ｜ 规格：docs/verdicts/2026-09-13-app-management-ledger.md（S1-S4 串行单批）｜ 模型链：deepseek-v4.1-flash 真会话
- 一句话：妻子问「它给我做过哪些东西」有了单一答案页——⚙️ 新 tab「✨ 做过的东西」= 三源只读聚合（faucet 表+工作区成品文件+已装技能），时间倒序、人话名、来源会话回链；服务级回链由 agent 建账（forge_meta，hints 软约束义务）落地，存量服务诚实降级「来源不详」不考古。

## 切片实录

### S1 建账义务（hints 文案，0 产品代码）
- goose-hints.tpl.md 建库段补一句「建库留账」（句式克隆 forge_table_info 义务先例）：建新库完成时同库建 forge_meta 表写一行——description 人话/created_at 日期/source=本会话工作区目录名；含 s78 挂账② 引导（新库用 faucet REST 直连写，MCP 可能看不到新库）。
- 物化链照旧：bootstrap 重跑，.goosehints 与模板逐位一致（仅 __FORGE_ROOT__ 替换行差异）。
- 活体验证 tmp/s83-s1-ledger-probe.js **8/8**：真会话无提示自然语言建服务 s83s1 → agent 自发落账 forge_meta：description「测试库存库：装 stock 表（品名/数量），给用户做测试用」/created_at 2026-09-13/**source=ws-0913-162523（与本会话工作区逐字相等）**；forge_table_info 既有义务无回归。

### S2 桥聚合端点 GET /api/assets（+77 行）
- dbOverview 扩展：tinfo 读管线同轮加 created_at 列硬化解析（parseAssetTs，非法→null 不编造）；每库增读 forge_meta 单行（缺表/无行/坏行→null 静默降级，TINFO 同款）。
- assetsOverview()：表源（forge_* 建账表不进清单，同 🗄️数据 tab 系统表边界）+ 文件源（各 ws 顶层成品，白名单 xlsx/docx/pdf/html/svg/png/jpg/jpeg/csv，回链=ws-map sid+sessionMeta 标题）+ 技能源（/api/skills 读法平移为 scanInstalledSkills() 共用，非复制）。输出 {ok,items:[{kind,name,human,ts,srcSid,srcTitle,ref}]}，ts 倒序 null 沉底，无参数无持久化，POST 405。
- 过程修一枚：比较器 null 位写反（null 上浮）→ 活体断言抓红 → 修为沉底。

### S3 前端 ⚙️ 新 tab「✨ 做过的东西」（+81 行）
- 五→六标签（mtabs 注册 made，db 后位）；条目=人话名（表=forge_table_info 说明或「服务.表」兜底/文件=文件名/技能=说明）+类型徽章+「来自对话：〈标题〉」/「来源不详」/（技能不渲染来源行）+时间（无=「—」）；类型 chips 筛选非分组+搜索（hay 含 name=文件名天然可搜，裁决查证缺口闭合）+pageSlice 12/页。
- 动作：「打开」（表→🗄️数据 tab 过滤词=表名+首行点开展开；文件→/preview/ 既有链路；技能→open-skills 既有入口+过滤定位）+「去当时对话看看」（openSession(srcSid) 复用侧栏入口，收起管理面板）。删除/重命名零入口（裁决红线）。
- 过程修两枚：①openAsset 与懒加载双拉竞态（后完成者重绘折叠定位展开）→ mtabs.db[1] 占位防双拉；②`div[style*="cursor:pointer"]` 选择器被浏览器 cssText 归一化（带空格）打空 → getAttribute+正则。
- GUI 冒烟 tmp/s83-made-smoke.js **12/12**（六标签/首条形状/s83 条目人话名/存量 plm 降级/文件名搜索/chips/打开-表定位展开/零 JS 错）。

### S4 探针+剧本
- tools/e2e/assets-probe.js **28 ck**（A 活体 10：三源形状/排序/白名单/forge_* 排除/plm 降级/ws→sid→title 回链/405；B 桥模板 6：路由/META_TBL/白名单常量/skip/比较器提取桩测/技能源同读；C 前端模板 12：mtabs/搜索 hay/分页/chips/打开三入口/openSession 复用/来源不详+「—」/红线零删除×2）→ e2e-chat.sh **§22 新节**。
- 终验剧本（真模型，tmp/s83-acceptance.js）**13/14，唯一红=探针 oracle 错**：
  1. 真会话建 s83acc 服务+stock 表+汇总 xlsx（回合完成）；
  2. /api/assets 条目 s83acc.stock：human「仓库库存表：每行一个品名，含数量与货架位」+ts+srcSid=本会话+srcTitle「s83acc 库存报表」；xlsx 制品条目回链同会话；
  3. 换新对话（≠原会话）→ ⚙️✨ 清单页看到库存条目（人话名+徽章+来自对话+时间+两动作钮）；
  4. 打开-文件=/preview/ 弹窗 ✓、打开-技能=技能弹窗过滤定位 ✓（另两分支附带覆盖）；
  5. 点「去当时对话看看」→ openSession 落回原会话（sid 逐字相等、面板收起、原 34 条消息在屏）；
  6. 说「再出一版」→ 回答「新版出好，覆盖了同名文件…加了合计行，总数量 125。覆盖前已存旧版（版本号 88b204ee）」——自己找到库表并出新版；git 实证 88b204ee「第一版：按货架位汇总，只有明细行没有合计」在库。
  - T12 红=探针断言「xlsx 数量增加」，实际 agent 按版本管理纪律**覆盖同名文件**（旧版入库 88b204ee、新版上盘，mtime 16:41 晚于首版）——行为正确，oracle 应为「文件更新或版本+1」。
- 主指标句（裁决 §6）：开清单→点回链→说一句话，≤3 步零术语零问人 ✓。

## 验证矩阵
- S1 活体 8/8；S2 活体（三源/降级/排序沉底/白名单/405）+冒烟 12/12；S4 探针 28/28；**全量 e2e-chat 58/58（57 基线+§22 新节）**；fuzz 178/178（结果见 STATE 当日行）。
- 物化链：bootstrap 重跑，bin/chat-bridge.js==模板 cmp 逐位一致，.goosehints==模板（仅 root 替换行）；仅 pc restart chat-bridge ×3（含排序修复与终态）；faucet restart ×1（清理测试服务后）。
- 残留清理：会话 20260913_160-172+173 全删（WS delete_session 逐个收回执）、工作区 10 个 /api/ws/delete、服务 s83s1/s83acc faucet db remove+sqlite 文件删、终态 /api/assets 16 条零 s83 残留、服务面只剩 plm。

## 过程发现（非本批缺陷，留档）
- **fuzz 清尾后真会话连环 Session-not-found**（s76 僵尸家族的长尾形态）：s82 当日 fuzz 收尾删除当日最新会话（160-165）→ goose closed 集内号段被后续 session/new 回退复用 → prompt 撞 closed 守卫 → 救援再撞 → TURN_LOST；处置=pc restart chat-bridge（清 goose 内存 closed 集）即愈。e2e §18 探针按设计消费此家族，真机妻子路径理论上也可撞（低频）；观察项记 STATE。
- 探针教训入 docs/dev-lessons-s78.md #17-#19。

## 改动面
forge/conf/templates/goose-hints.tpl.md（+1 行）、chat-bridge.tpl.js（+77）、chat.tpl.html（+81）、forge/conf/goose/config/.goosehints（物化产物）、tools/e2e/assets-probe.js（新）、tools/e2e/e2e-chat.sh（§22）；docs：research/25+27 触发器关闭注记、本 journal、dev-lessons、STATE。
