# fuzz 扩展批三 P3 修复（2026-09-13）

上游 c4a6aeb（178/178 夜批）+ 主控/PM 裁决（2026-09-12-s78-provider-fix-suite-hardening 末节：①断链尾段裸奔 ②URL query 扩族 ③SSE error 帧「误导她重复撞墙」家族，全修）。工程师实施：产品 2 文件 + 探针 3 文件，最小 diff。

## 修1 P3-1 maskKeys 断链尾段裸奔
- token 组追加贪吃段 `(?:[^"'\s}\\]|\\[^"'])*`：ASCII 头段锚定后吃到结构分隔符（引号/空白/行尾/`}`）为止全掩——中文/\0/字面反斜杠不再断链（断链点后尾段全裸 → 全串按前6后4呈现）。
- 反斜杠仅在后面不是引号时才入段：JSON.stringify 的 `\"` 是结构位尾引号转义，须停在其前（工具卡 stringify 主形态）。初版 `[^"'\s}]*` 吃掉结构反斜杠，被 toolcard-frames §7 两断言抓红（39/39 回归守住），形态级修正。
- mask-fuzz M7/M8 升级为全串形态断言（修前红实证：`****中文def1234567890` 尾段裸奔）。

## 修2 P3-2（主控裁：扩族）URL query 密钥形态
- 同函数第三族 `[?&](apikey|api_key|token)=` 值段掩码（吃到 & / 引号 / 行尾），i 旗含大写变体；纯显示层同族，_inp 喂料/回放/桥侧数据不动。
- hyphen 形态 `?API-KEY=` 不在裁决枚举内，维持规格外（探针向量改钉 `?API_KEY=` 大写变体）。
- M6 升级断言：值段已掩 + 共存不阻断规格内两族（修前红：`?apikey=sk-notinspec0000` 原样裸奔）。

## 修3 P3-3 SSE 内嵌 error 帧透传
- llmStreamOnce 解析循环识别 `j.error && !j.choices` 形态帧 → over 先置位（同流后续 delta 丢弃）+ `die('upstream', message)` 终局——不再被静默忽略吞成空回「它没说出什么来」（PM 裁决 2026-09-12-provider-health-probe §1「误导她重复撞墙」家族）。die 直走不经 finish → 不触发 length 1600 阶梯重试（error≠length 空回）。
- explain/optimize 孪生 catch 补 kind 映射：upstream 且 `classifyUpstream(message)==='unauthorized'`（401/api key）→ TURN_KEY_TEXT 口径 key 族人话；其余 → 上游错误族「解释失败: 消息」原样（非 SSE JSON 错误体同门受益，L10/L14 措辞不变）。
- sse-ladder 34→36ck：L13b 升级（终局措辞+迟到 delta 丢弃+调用恰 1 次不重试）+ 新 L9KEY key 族向量。修前红双实证：error 帧被吞后迟到垃圾 delta 累计成「解释」正文 + key 错误落空回人话。

## 回归与物化
- 探针独跑：mask 8/8 + toolcard-frames 39/39 + sse-ladder 36/36；修前红实证（mask M1/M6/M7/M8 红 4、sse L13b/L13c 红 2——判别力留痕于本会话输出）。
- 全量顺序：e2e-chat **57/57** → fuzz **178/178**（fuzz-chat.sh sse 描述 34→36 asserts 同步）。
- 物化 cp tpl→bin + cmp 逐位一致；仅 pc process restart chat-bridge（healthz ok）；假路由 :20129 / pg 未触碰；探针沙盒 tmp/pfr24-fuzz-* 零残留。
