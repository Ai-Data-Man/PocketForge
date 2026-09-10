# s77 用户五主线批次2：提示词库/Tab唤起/✨优化/白话解释三层重写/撤回重写手术（跨 09-08 夜至 09-10）

## 主线4 白话解释（五线之首，缺陷定性）
- **P1 真凶（research/19 对照实验）**：前端读帧对象形态 `content.raw` vs goose v1.46 数组形态 → `card._out` 自 s13 上线恒空 → 解释者从未见过工具输出 → 9/9 捏造（装好的 git 被说成「没装」）。用户骂的「黑话」只是次因；**「功能效果差先查喂料断供再骂提示词」**。
- 修复两批（83098f1+6f02c64）：三态输出解析（数组/.raw/rawOutput 兜底+exit_code 捕获，**工具卡输出区显示自 s13 起首次真实恢复**）+ 载荷扩容（rawInput/status/exitCode/toolName/trunc）+ sysP 重写（受众=想懂技术的好奇者，删三禁令，必答三问+术语内嵌解释+禁编造+失败四段式）。17 载荷判卷全过（FM1-6 零回归）、TTFT 单变量对照无劣化。qa 重审通过附挂账→F1 尾截/P3-2 缓存键 \0 分隔/P3-3 _inp 空串守卫随主线3 批销账（042ea0d）。
- GUI 实景：git --version 卡显示真实 stdout + 解释三问齐零黑话（tmp/s77-gui-explain.js）。

## 主线1+2 提示词库+Tab（f7890d2/6a33f29）
- 手工收藏制（历史留存 1709 条裁掉）：data/prompts.json（STATE_SCHEMAS）+/api/prompts op 风格+📖 输入框近旁面板（搜索/30 页分页/存当前输入框/行内编辑/删除二次确认/插入不发送）。Tab 唤起菜单（迷你过滤框+slashHits 复用+12 上限溢出提示+三菜单互斥，含 '/x@' 双开洞顺带修）。前任工程师中断留半成品，续作批只修两实锤（点外收起 isConnected 守卫/重开清残留搜索词）。

## 主线3 ✨优化按钮（042ea0d）
- 预览-接受-放弃（Cursor 直接替换失败模式裁掉）；桥端 optimize_prompt 克隆 explain 骨架+sysP 五变换+硬禁令「不得新增用户未提出的假设」+双段式 optimized/changes。活体 3 话术判卷合规（1 边界项=「覆盖原文件」替用户挑动作，留档观察）。

## 主线5 撤回重写（B 型历史手术）
- research/21 勘误：**goose 会话=SQLite（sessions.db/messages 表）非 JSONL**；load=全量重放；手术 DB 可行（B 型谓词=goose truncate 同款）；官方 fork 截断参数被 schema 剥离=死路。§6 前置验证：重放帧带双冗余 messageId（透传方案 A 成立），直播轮零 user 帧 → 缺省边界=该 sid 最后一行 user（research/21 §6，958f5f2）。
- 实现（主线5 提交）：桥 busySids 三路收口+rollback_rewrite 七步协议（busy 门→session/close→BEGIN IMMEDIATE→边界 SELECT 零命中不猜→tombstone 先写 fail-closed+每 sid keep-3→DELETE changes() 对账→COMMIT+广播）；前端 user 三钮（复制/取回修改/撤回重写三语义共存，红线零触碰）+两步确认+回执预填不发送+广播重绘+回放帧 gmid 捕获。tools/rollback-restore.js=恢复修复路径（非产品功能）。
- 验证：18c 沙盒探针 31/31（DB 断言/load 无原句/改写回显/失败注入 DB 逐位原样/busy 门/恢复演练+keep-3/双端广播/空会话不砖）挂 e2e 第 18c 节；GUI 12/12（真撤回：历史重绘 M1 留 M2 消失+预填聚焦不发送+再对话不砖）。
- 探针坑三枚：S19 判据方向写反（零删除=preBusy⊆当前，非逐位冻结）；rescue-guard 桩缺 busySids 绑定；GUI 的 Ctrl+K 与页面加载自动 subscribe 竞态分裂会话（**预存良性竞态**，人类时间不触发——双 subscribed 乱序回绑，另录观察项）。

## 环境（重要，非产品）
- **云主机三次中断**：后台代理全灭但已 commit 全幸存；工作树半成品可续作。恢复序=栈拉起（**runas //trustlevel:0x20000 降权 wrapper 必须复刻 e2e.sh:88-110 GBK 模式，直接 runas 旧 wrapper 静默不执行（s67 坑三证）；提权直启 pg 必 crash-loop**）→ diff 盘点 → 续作。
- **代理断模型实锤（STATE 风险#3 同族恶化）**：今晨重启后代理客户端对国内中转（111.228.54.166）路由断（经代理 10s 超时 vs 直连 1.5s），goose 走 IE 系统代理 → 模型回合全挂（prompt 落库无回复/待发队列不冲刷）。处置=临时 ProxyEnable=0（可逆）。**护航注记**：目标机任何代理软件开 IE 代理都可能同样杀模型链路——产品侧加固候选（桥对 provider 直连健康探测+人话告警）挂 backlog。
- smart_approve 60s 超时自动拒绝会杀 GUI 探针工具轮——playwright 探针需带 `.permcard:not(.settled) .pbtn-acc` 自动批准循环。

## 终态
e2e-chat **55/55**（+18c 节 ws-rollback 31ck）+ fuzz **150/150**。五主线批次2 全落+裁决两份+research 19-22 四件+支线修复（preUpgradeBackup 警告残留 fc42e81）。遗留：发版轨道（v0.9.11 打包+沙盒发布门+GitHub）当班进行中；主线3 边界项观察；双 subscribed 乱序竞态观察项。
