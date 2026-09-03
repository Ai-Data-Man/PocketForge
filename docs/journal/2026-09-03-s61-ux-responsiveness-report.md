# 2026-09-03 s61 — 用户三主线：UI 响应性修复 + 一键问题上报 + 布局细测矩阵

## 用户输入（2026-09-03 三条主线）
1. 小 forge UI 不丝滑、反应慢半拍
2. 缺问题一键上报（最好直达 GitHub issue，至少生成全面问题报告文件）
3. UI 布局仍有不合理/bug，需细的场景测试观察

## 主线 1：UI 慢半拍（pf-researcher 取证 → pf-engineer 修复）

**取证**（docs/research/09-ui-responsiveness.md）：实测排除桥 API（13 端点 <20ms）、WS 推送（帧间隔 p95=1ms 无缓冲）、DOM 规模（最长会话 99 条）、上游网络（TTFB 11-15ms）四条主流嫌疑。真凶 = 感知层反馈缺失 + 写死的毫秒延迟。

**修复**（chat.tpl.html +45/-12，chat-bridge.tpl.js statsBump）：
- #1 typing 三点跳动动画 + 按钮 :active 过渡（最大感知来源）
- #2 换线重发 800ms→subscribed 直发（时序论证：桥 wsSession.set 先于 send('subscribed') 同一同步回调，s51c 竞态根因是同步重发非缺 800ms；运行时实证直发 6.3s 收 chunk 无 session not found）
- #3 新对话未就绪消息入 pendingQueue 自动补发（替代「1 秒后再发」拒绝）
- #4 删会话 session_deleted 回执驱动刷新（1.5s 兜底）
- #5 WS 断线指数退避 300ms×2 封顶 5s（原固定 2s）
- #6 @ 菜单 180ms 防抖
- #7 statsBump 防抖异步化（2s 合并 + fs.promises 原子写，WS 消息路径不再同步写盘）

## 主线 2：一键上报（pf-pm 裁决 → pf-engineer ×2 实现 → qa 审查 → 返工）

**裁决**（要点）：本地诊断报告单级方案，直发 issue 挂 P32（PAT 不落分发机 + 企业网不可达 + 妻子无法配置；丈夫复制粘贴 30 秒）报告尾部预置 issue 模板。隐私黑名单硬约束：secrets.env/memory/会话正文绝不进报告；providers key→`<已配置>`；写盘前兜底脱敏。UI=侧栏 footer 📮，explorer /select 自动弹 + 路径入剪贴板。

**实现**：桥 GET /api/report（9 段采集：版本/环境/pc.log 尾 300 行过滤 healthz/backup.log/stats 7 天/providers 脱敏/会话元数据/补充说明三问/issue 模板）+ 前端 📮 三态。

**qa 审查（P2×3）→ 返工**：
- S1 GET 副作用跨站触发（Origin 门只拦非 GET）→ 端点级双门：Origin 门 GET 不豁免 + 自定义头 X-PF-Report:1（img/no-cors 发不出、跨域 fetch 挂预检）
- B1 pendingQueue 无失败路径（session/new 失败永久搁浅+假承诺）→ 桥补 else 发 {sys:'error'}，前端 rollbackQueue 倒回输入框
- B2 flush 覆写用户输入 → submit(forced) 传参直发（含 send.onclick=()=>submit() 防 event 入参）
- 顺手：S2 脱敏黑名单扩 7 类 key 前缀、C2 删除回执 send/destroy 换序、C3 队列串门（pendingForNew 门控+切旧会话倒回）、C6 断线 submit busy 卡死（预存）、B3 reportTail 尾部 256KB、B4 providers 非数组兜底、B5 📮 防双击+剪贴板诚实文案
- qa 复审：12 项全 PASS，终裁通过

**GUI 实景**（Edge 真机）：📮 三态文案/剪贴板路径/explorer 弹出（窗口真实创建，被前台 Edge 遮挡不抢焦点——观察项）；S1 门无头 403 带头 200。

## 主线 3：布局细测（pf-qa 矩阵 + 主控 GUI 执行）

qa 产出 20 条 GUI 矩阵（尺寸×内容形态×状态组合×主题×交叠）。主控执行重点 10 项全 PASS：极窄 560px（发送/输入/chips 完整可用，无溢出；侧栏占比高属 P3 权衡——妻子真实场景 Edge --app 大窗）、断线红点→退避→恢复绿点、真消息全链路（deepseek-v4-flash 回复+标题自动命名）、主题三态循环、模型下拉窄窗自适应（qa 预判 300px 溢出未复现）、@菜单/typing 动画代码级验证。**qa 预判的两个 GUI 溢出（输入框挤死/下拉溢出）均未复现**——视觉模型幻觉风险实证，GUI 断言须 a11y 特写核实。

## 遗留
- qa 建议 1：rollbackQueue 覆盖非空草稿时原草稿不展示（对齐 addInfo 展示）
- qa 建议 2：同 tick writeFrame+destroy 小概率丢删除回执（双兜底已覆盖，秒级延迟无正确性问题）
- B2 发现（预存）：submit 内 streamEl.dataset.orig 位于 addMsg 后永不执行（user 分支恒置 null）——s50e 换线重发原文记录疑似失效，待专项
- explorer 弹出不抢前台焦点（Windows spawn 行为，任务栏闪烁提示；toast 文案+剪贴板已兜底）
- typing 动画无 prefers-reduced-motion 降级
- 回归基线首跑 fuzz 1 红（冷启动竞态，重跑两次全绿，未复现——观察）
- 矩阵未执行条目（5 超长 URL/13 全归档态/14 无 key 态/18 confirm 窄窗）留 qa 矩阵文档化后按需

## 验收
e2e-chat 32/32（+6）+ fuzz 44/44（+5）全绿；GUI 实景过。
