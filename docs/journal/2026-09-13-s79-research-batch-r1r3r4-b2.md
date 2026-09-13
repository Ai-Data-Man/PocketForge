# s79 调研落地批：research/26 R1/R3/R4 + research/27 B2 核验（2026-09-13）

实现工程师批。上游 e05c2e0（26/27 调研入库后）。一个 commit。基线 e2e-chat 57/57 + fuzz 178/178。

## 改动（5 文件）

1. **R1 错误卡读健康态（裁决 S3「文案互指去重」错误卡侧落地）**——双错误卡生成位点先读健康态再落文案：
   - 桥 `chat-bridge.tpl.js` sendTurn 拒绝分支（原 :851）：`healthCache` 三档前置——stale-model → 新 `TURN_STALE_TEXT`「你正在用的模型已被服务商下架，等也不会好。点 ⚙️ 换一个模型：⟳ 拉取→勾选→保存。」（对齐告警条口径）；down+key → `TURN_KEY_TEXT`；down → `TURN_DOWN_TEXT`（含 R3 半句）；无态/ok → 原按错误文本归类链不动。
   - 前端 `chat.tpl.html` endStream 错误卡（真 stale-model 用户路径：goose 以 agent_message_chunk 流内返回「Ran into this error:…」，turn 正常 resolve，卡由前端生成——只修桥不修前端=症状不闭合）：读 `lastHealthFrame`（healthSync 维护，ok 也更新）同三档；401 正则分支保留（down+key 帧或 401 文本任一命中 → Key 口径）；stale 态不给「换备用线路」钮（出路=换模型非换线）。
   - 互指结构：同因同回合条（常驻锚）与卡（出路）并存不重复。
2. **R3 down 文案时间预期**：`TURN_DOWN_TEXT` 与前端 down 卡补「一般几分钟内恢复；顶部提醒条消失就是好了。」；前端侧仅健康态=down 时出现（条必在，指称成立），桥常量级（R3 任务原文=改 TURN_DOWN_TEXT）。
3. **R4 goose 错误帧穿透断言**：`rescue-guard-probe.js` 增 R4a-c——从桥模板原文提取 S26_ERR_RE，打 goose v1.50 五型错误文案（agent.rs:2947-3080，research/26 §1.4）断言至少一型命中（R4b）+ 通用包装型「Ran into this error」前缀主哨兵（R4c，provider_err 段刻意不含其余 S26 令牌=命中只能来自前缀，正是防措辞漂移的判别点）。升级 playbook 第 3 步之 8 增检查项：升版按新版五型更新 `V150_ERR_SAMPLES` 复跑 e2e 18b。
4. **B2 权限卡四选项核验（关项，结论=是无需修）**：见下节。

## 断言与判别力

- rescue-guard-probe 22→31ck：S12 stale-model/S13 down+key/S14 down(R3)/S15 同桩无健康态对照；makeEnv 增 healthCache 注入桩（提取块新引用，不注入即 ReferenceError）。
- toolcard-frames-probe 39→45ck：新增 §9 提取前端 endStream 原文跑 DOM 桩——R1a stale 出路（不含「等一两分钟」安慰）/R1b down+key/R3a 时间预期/R1c 无帧原链/R1d ok 不劫持/R1e 401 文本既有分支保持。
- **双负对照实证（lesson 6）**：新探针打修前模板（git show HEAD 临时落盘跑后还原）——rescue-guard S12/S13/S14 红、toolcard-frames R1a/R1b/R3a 红，其余全绿=判别力证明。
- B2 探针 `tmp/b2-perm/b2-perm-card-probe.js` 10/10（方法：隔离真 goose v1.50+假 provider 18401+**产品 permission.yaml 拷贝**+GOOSE_MODE=smart_approve 复刻产品生效模式——首次跑隔离 root 无 permission.yaml 时 load_skill 直通零权限帧，教训：卡的求值依赖产品 permission 配置，隔离必须带配置）。帧留档 tmp/b2-perm/perm-frame.json。

## B2 结论（research/27 §遗留 UNVERIFIED-2 → VERIFIED-RUN）

goose v1.50 真帧=恰四选项 allow_always/allow_once/reject_once/reject_always（optionId=kind；源码 server.rs:1271-1278 同证）；前端四按钮全人话（✅ 这次可以/✅ 以后都允许/🚫 这次不行/🚫 以后都别问）零英文回退，逐个可点各回发 acp_reply 携对应 optionId+callId，60s 超时自动「这次不行」。**B2 关项，无需修改**。

## 验证

- 探针单跑：rescue-guard 31/31、toolcard-frames 45/45、ui-logic 56/56（锚点零同步需求）。
- 物化：bootstrap 重物化 bin/chat-bridge.js 与模板 cmp 逐位一致（chat.tpl.html 无物化对象，桥每请求直读）；仅 pc restart chat-bridge，healthz 200。
- 全量：e2e-chat 57/57 + fuzz 178/178 顺序绿（tmp/e2e-r1r4-run2.log / tmp/fuzz-r1r4-run.log）。**首轮 e2e 56/57**：§11b ws-close-reclaim「扩展进程 10s 未现（count 停 9）」——时序=桥刚 pc restart 1 分钟后起套件、冷 acp 首态（基线 9）；本批 diff 零因果面（纯文案/拒绝分支/显示层）。单跑探针 PASS（基线 27 暖态）+整套复跑 57/57 同节绿=环境瞬态，并入 STATE 既有「冷启/竞态红」观察项家族作新数据点（触发条件含「桥重启后即刻跑套件」）。
- 环境：假路由 :20129/pg 未触碰；B2 探针 goose 子进程 close+kill 自清（进程表核验零残留，在册 goose 全为 dev 栈既有）；explorer 零开窗。

## 没做的事

- research/26 R2（面板 stale-model 排序辅助）：不在本批指令内，未动。
- 错误卡换备用线路钮在 stale 态的去除=新分支自然结果（stale 态整个走新分支），down/无态路径按钮逻辑零改动。
- B2 未做 GUI 真卡实景（任务允许 ui-logic-probe 桩路线；真帧+真前端处理器组合已达核验目的）。
