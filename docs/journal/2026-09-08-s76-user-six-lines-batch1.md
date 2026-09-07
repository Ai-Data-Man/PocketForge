# s76 用户六主线批次1 + P1 僵尸会话回归修复

## 任务来源
用户闲时点名六条主线（更早对话提示 / see-image / 偏好记忆 / 安全护栏 / @提示 / 编辑重发）。主控取证 → pm 裁决（docs/verdicts/2026-09-07-user-six-lines-batch1.md）→ 三路工程师并行 → qa 审查（6 过 1 小返工）→ 全量回归。

## 取证（主控+researcher）
- **see-image 在交付物上是坏的**：SKILL.md 引用 `<FORGE_ROOT>/tools/vision.js`，但该文件在仓库根 tools/（开发侧不进包；package.sh 守卫禁止 forge/tools 存在）。
- **research/18 记忆链路**：偏好记忆主链路活体验证通过（agent 写入→junction 落 conf/goose/config/memory→新会话 retrieve_all 被动注入→面板查看/删除全通），裁决"有条件可靠"；同时挖出 P1 回归（见下）与 P2（remember_memory 的 is_global 必填布尔，传 false 静默丢）。
- 活跃列表"还有 X 个更早对话"提示的出口（搜索）在聊天视图不存在=死提示。

## P1 僵尸会话回归（本批最大捕获，ff0a092）
s75 的 delete_session→session/close 修复引入：删**当天最新**会话后 goose 新会话号=当日 MAX+1（session_manager.rs:1591），删行致序号回退→复用已 close 的 sid→acp closed_session_ids 守卫拒一切 prompt→桥把错误帧当成功 resolve→**同日后续所有新对话秒回空、零报错**，直到桥重启。researcher 活体复现 3 次。
修复：prompt 补 reject（error 帧人话）+ Session-not-found 单次自动救援（桥侧 session/new 换新号重放，三重防循环：闭包单次守卫+首轮门+30s 超时）。resolve-only 消费方（session/new B1、switch_model）零行为变化。e2e 第 18 节「删最新→新会话必有回文」钉子转正。
根治项（自有 sid 前缀/tombstone 防序号回退）挂起，触发器=救援路径实录失败或 goose 升级改变编号语义。

## 六主线落地
1. **更早对话**（fa07896）：活跃列表 40 条截断死提示 → 归档同款分页（30/页 pageSlice/pagerPaint 复用）+ 搜索行两视图恒驻；R2 合规，规模预期（活跃≤100）入代码注释。
2. **see-image**（ff02cb5+17c6e89）：vision.js 迁 forge/conf/templates/vision.tpl.js，bootstrap 5f 物化 bin/vision.js；`--get-model/--list-models/--set-model` 子命令，FORGE_VISION_MODEL 持久化 data/secrets.env（桥端重写只滤三键，新键存活，qa 亲核）；SKILL.md 重写（换模型引导流程+禁读 secrets 其他键）；qa P2-1 返工=set-model 拒换行/CRLF 注入（沙盒实锤可伪造 API key），vision-fuzz-probe F1-F7 转正。**新事实：旧默认 myopencode/glm-5.2 服务商侧已死（404 No active credentials），dev 栈终态 FORGE_VISION_MODEL=glm-5.2 实跑可用**。
3. **偏好记忆**：research/18 结论"有条件可靠"+P1 修复+P2 教学补课（hints：is_global 必须显式 true）。
4. **安全护栏**（a26499b）：设置面板护栏 tab 拿掉（六标签→五），四档人话（MODE_TIPS）迁工作模式切换现场（select title 三处同步+切换成功 addInfo）。护栏 tab 内可写配置永久否决（permission.yaml 三键齐写缺一 panic）；动态工具清单挂 T2。
5. **@提示**（9101f5f）：placeholder 改「输入 @ 引用文件或数据表」（@ 菜实有 DB 表段，文案此前漏报）。
6. **编辑重发**（a3b47d0+1285b46）：操作条「重发」→「取回修改」=载入输入框+聚焦+光标到末尾，**不自动提交**；错误卡闭包自动重发（s50e/s50f 韧性路径）红线未动（14b 探针 D6 断言在场）；错误卡两处「点重发」文案同步（1285b46，纯文案）。

## qa 审查（6 过 1 返工已闭环）
- 返工：vision set-model 注入（P2-1）→ 17c6e89 修复+转正探针。
- P3 留档：NF 正则对 data-对象形态漂移降级为通用错误（非静默底线保持）；救援文案在非删除成因下欠准确（P3-2）；双客户端同死 sid 各自救援产生重复会话（P3-3）；rescueSession 未查 ws.alive（P3-4）；newchat 不清 arch-q 残留过滤词（P3-6，可见可自清）。
- 实测面：桥热路径 prompt 回文（复用遗留测试会话零新建）、运行中进程=新代码（物化时间 vs 进程启动时间）、ui-logic 33/33+ia-logic 7/7+s50f 10/10+14b 10/10 复跑全绿。

## 存量债顺手清
- s50f-assert.js 自 s50e 改名 txtRaw 起即红（锚点失配崩溃，e2e 主套件不含它故长期未觉）→ 1285b46 放宽锚点 10/10 绿。
- permission.yaml 运行时共写（goose 自规范化 remember_memory 入 ask_before）追认提交。

## 回归
- e2e-chat：EXIT=0 全绿（含新 14b 取回修改 10ck + 18 sid-reuse-rescue）。
- fuzz：143/143。
- 物化：bin/chat-bridge.js、bin/vision.js、.goosehints 三产物与模板逐位一致。

## GUI 实景（主控 browser-use，dev 栈 8790）
- 活跃列表分页：第 1/2 页·共 49 条，双向翻页正常（49 个活跃会话为 e2e/qa 探针遗留测试会话）。
- placeholder 新文案在位；@ 菜单「库里的数据（点一下引用表名）」+🗄️ 表项实景在列。
- 🧠 管理面板五标签=本事/数据/记忆/定时/插件，护栏 tab 零残留；工作模式 select title=「自动干活：它不再逐项问您，重要操作做完会说明」。
- 取回修改：点开 00:48「连通性测试」会话，3 个消息操作条在；点击后输入框=「只测试连通」、状态保持「已连接」、零自动发送。

## 遗留
1. vision 验收尾巴：服务商档案保存触发 secrets 重写的实景存活测试（仅代码级核验）；重打包+解压守卫核验；%FORGE_ROOT% 在 agent shell 内展开的真机验证（SKILL.md 已带兜底句，护航观察）。
2. P3-2/3/4/6 小项与救援文案校准——留待下批夹带，不判返工。
3. myopencode 凭据死亡是否影响其他引用点（SKILL.md 坑段/文档提及处）待巡。
4. GUI 浏览器点击实测（分页/取回修改/护栏删除/MODE_TIPS）由主控 browser-use 执行（qa 无浏览器工具）。
