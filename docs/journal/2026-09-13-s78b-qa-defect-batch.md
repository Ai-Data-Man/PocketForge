# s78b QA 实锤缺陷批修复（P1-A 竞态 + P2-A 空回 + P2-B 串台 + P3-A 缓存键）

- 输入：tmp/s78-qa-report.md（QA 实锤，复现脚本 tmp/s78-qa-race.js/-gui.js）+ 主控工单；上游 bb9c6b6+22732d1，工作树干净起点。

## P1-A 双 subscribed 乱序竞态（最高优先，返工项）
- 机制（QA 实锤）：页面加载 subscribe(null) 的 session/new ~2s 往返期间用户点进既有对话（subscribe(sidA) 同步回绑）→ 迟到的 session/new 回调无条件 wsSession.set(新会话)+subscribed → 客户端与桥一致地绑到新空会话，消息静默落错处零报错。
- 修法：代际守卫 wsPendingNew（WeakMap，ws→在飞 session/new 请求 id）。subscribe(null)/rescueSession/switch_model 自动新会话三个发起点都登记；subscribe(具体 sid)/unsubscribe/新发起即接管；回调到达标记不匹配 → 丢弃绑定 + session/close fire-and-forget 回收孤儿（delete_session :3284 先例）+ 桥日志 `stale session/new discarded`。Ctrl+K 双 null 变体同门闭合（首请求必被丢弃，pendingQueue 只会在真正 subscribed 上补发）。

## P2-B 同族（同批修，独立记账）
- ① 成员籍双挂：bindWs 共享助手，重绑必摘旧会话 sessionClients 成员（4 处重绑点统一：subscribe(sid)/subscribe(null) 回调/rescue/switch_model）——修前「＋新对话」等任何重绑都双挂两会话广播集。
- ② 广播无 sid 过滤：onAcpData 带 sid 的 agent 事件只发该会话订阅者；无订阅者即丢弃（摘 else 全员广播兜底）。sid-less 帧保留全员广播（原语义）。

## P2-A 解释/✨间歇空回（真链 7/10 空）
- 根因（QA 直连实证）：deepseek 间歇无视 reasoning_effort:'none' 隐形推理，300 max_tokens 被耗尽 → finish=length、content 空；桥只认 d.content 且空回不重试。
- 修法（explain_tool+optimize_prompt 双胞胎同步）：max_tokens 800（explain 300→800）；finish=length 且空文自动重试一次（预算 1600，最多一次不退避——低频按钮）；SSE 只累计 d.content，d.reasoning_content 有意忽略（推理不算正文，防把隐形推理当解释）；空回文案升级「它没说出什么来，再点一次试试」/「模型没说出什么来，再点一次 ✨ 试试。」；人话不入缓存保持（防毒化）。

## P3-A + ✨ 禁令
- explain 缓存键补 model（`[model,t0,o0,i0,stt,ec,toolName]` \0 join，与 optimizeCache 同款）——修前换模型 200 条 LRU 内全吃旧模型解释。
- optimize sysP 硬禁令补一句：不得建议覆盖或删除用户原文件，修改类操作必须先征得用户确认（销 s77「覆盖原文件」观察项）。

## 验证矩阵
- 新 e2e 20 节 ws-subscribe-race-probe 21ck（沙盒自建，端口自选避 18791/18792）：gap 0/200/800/1600 oracle 四档（prompt 空 text 绑定守恒）+ 确定性代际守卫总账（gap0/双 null/退订 ≥3 次丢弃）+ X1 跨会话隔离 + X2 换绑摘旧籍 + X3 无订阅者丢弃（修前=全员广播）。快沙盒 session/new RTT<200ms，200ms+ 档为顺序完成非竞态——断言取「sidA 确认后零迟到 subscribed」的不变式而非帧数。
- 新 e2e 21 节 explain-retry-probe 13ck（mock SSE marker 播控）：800→1600 阶梯/双空人话/reasoning-only 不重试不算正文/人话不入缓存/键含 model/缓存正反例。
- e2e-chat 57/57 + fuzz 150/150；真链 explain 10/10 非空（基线 7/10 空）；rescue-guard-probe（提取块新增 bindWs 依赖→桩注入）+toolcard-frames-probe（缓存键锚点随迁补 model）绿。
- 物化：bootstrap 重物化 cmp 逐位一致；仅 pc restart chat-bridge（pg 未动）。

## 教训/留痕
- 裸 WS 探针 upgrade head 首帧坑再现：首版探针忘了初始化后立即 pump()，~随机卡 hello（s78 已记的坑，本轮又踩一次——pfr20/pfr21 探针已按 tmp/s78-ws-send.js 正确写法收敛）。
- 静态锚点探针（rescue-guard/toolcard-frames）随源迁移是预期维护成本，本轮两处随迁。
- QA 留档未立项项（P3-B NUL 键注入/P3-C changes 段漂移/P3-D 菜单残留/P3-E bin 陈旧 chat.tpl.html/P3-F）不在本批，见 QA 报告 §P3。
