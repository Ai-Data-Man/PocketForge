# s76b P3 留档小批 + qa 聚焦审查 + 测试钟表 bug 修复

## P3 批（接 s76 六主线批次1；qa 首轮审查留档项 + myopencode 死引用清理）
七项全交付，逐项独立 commit：
- df80876（qa P3-2）：TURN_LOST_TEXT 成因中立化（「删除对话后的后遗症」→ 会话异常/线路不稳通用文案；非删除成因下不再误导）。
- 1ddff47（qa P3-3）：rescuedSids 去重——同死 sid 双客户端只救援一次，第二个收 SID_RESCUED_TEXT 专属人话（死 sid 上「请重试」是死循环）；取舍=无 TTL，桥重启即清且重启同时杀 acp。
- d539ebb（qa P3-4）：rescueSession 回挂前补 ws.alive 门（:640 直通路径同款），断连客户端不再被重挂。
- cdaf476（qa P3-6）：newchat 清 arch-q 残留过滤词+两页键复位（否则新会话被残留词滤掉不显示）。
- 04d9ad6：种子与回落死模型清理——goose-config.tpl.yaml GOOSE_MODEL、桥 ：606 末级回落 myopencode/glm-5.2→deepseek-v4-flash（主控拍板种子=可选池首模型）；运行时 config.yaml 走手术路径（模板有占位符+mcp-fetch 块漂移，禁盲拷，单行替换实证仅 :3 变化）。
- 17093a7：vision-fuzz-probe 收编进 fuzz-chat.sh（单行 for 循环 7 案计数，143→150）。
- ccaaf48：bootstrap.ps1 两处 secrets 种子+forge-router.json models 死模型→deepseek-v4-flash（**新装首启验收线**：旧种子对新装必 404；forge-router 在 PROTECTED 清单，存量安装升级不覆盖）。dev secrets.env 未动（data/ 纪律，运行链 act.models[0] 遮蔽）。
- 1b79619（研究员）：research/18 补记救援触发面边界——**工程师转述机制被对照实验证伪**（goose 对 closed/不存在 sid 措辞逐字相同，v1.46.0 无 closed 类文案；「不救援」真因=首轮门+产品上 close 必删行），按实测口径落档；新增升级必查项（goose 引入差异化 closed 文案则该类场景掉出救援面，建议并入 research/04 清单）。

## qa 聚焦审查（9 commit）：9/9 通过不返工，带出
- **P2-A（必修，已修）**：桥 :715 `String(e.message || e)` 缺 null 守卫（:706 有守卫，不对称）——畸形上游帧 `"error": null` 可在 reject 回调（onAcpData 无 try 栈）TypeError 打死桥进程、全部客户端掉线。修复=同款 `e && e.message` 守卫；qa 提取桩扩为 20 ck（null/字符串/空对象载荷+去重+alive 门）转正 tools/e2e/rescue-guard-probe.js 入 e2e 第 18b 节。
- P3-A（已修）：hotRestartProvider 清 waiting/sessionClients 但漏 rescuedSids——热重启同样杀 acp，补 `rescuedSids.clear()`。
- P3-B（已修）：tmp/s76-dedup-rescue.js 头部勘误措辞更新（对齐 research/18 C1 实验）。
- P3-C（留档 STATE）：permission.yaml 被追踪但 goose 运行时常弄脏工作树——建议 PROTECTED 化或停追踪运行时副本（与 config.yaml 同题，另行裁决）。
- 文案家族（💭）：非 NF 错误 `'turn failed: '+原始 message` 把英文内部错误透给用户，与零术语有张力——预存语义，文案待办。

## 测试钟表 bug（本波 e2e 红的真相）
- 现象：e2e 两轮 EXIT=1，死点同在 `report-probe.sh sandbox`（set -e 下首红即中止，无 FAIL 计数摘要）。
- 归因：sandbox 布景写死 usage-20260901..20260907 七个种子；**沙盒桥自己会写当日 usage 文件**——09-07 当天桥写 0907 与种子重名（恒 7 文件，断言过）；09-08 起桥多写 0908 → 8 文件 → slice(-7) 窗口前移 → 种子 0905 被挤出保留集 → 红。纯测试钟表耦合，产品逻辑（sort+slice，1601/:1686）日期无关。
- 修复（report-probe-sandbox.js）：种子改相对「今天」动态生成（今天-7..今天-1，今天的留给桥写）；断言标签动态化。29/29 绿。同族教训入 STATE 观察项（与 autostart 72h/cron 日期坑同族：**测试夹具禁止写死日历日期**）。
- 套件观察（留档不修）：e2e-chat.sh `set -euo pipefail` + `node probe; ck $?` 惯用法 = 任何探针非零退出即中止全套件（ck 永远收不到非零），摘要行只在全绿时出现。fail-fast 可接受但「回归红了修到全绿」的可见性差；改法（`rc=0; cmd || rc=$?`）涉及 ~40 处，另行小批。

## goose 上游窗口复查（主控，2026-09-08 凌晨）
latest 仍 v1.49.0（09-03），v1.50 未发，窗口未开（research/04 预计 ~09-09±3；今日 09-08，若明日仍未发则按既定裁决取 v1.48.0 评估）。

## 回归终态
- e2e-chat：EXIT=0，PASS=53 FAIL=0（含新 18b rescue-guard 20ck；53=53 计数含 report/ui-logic 等节 ck）。
- fuzz：EXIT=0，PASS=150 FAIL=0（含 vision-fuzz 7 案）。
- 物化：bin/chat-bridge.js 与模板 cmp 逐位一致；桥重启后 healthz 200。
