# 2026-08-29 s47 — P31-① 本机部分：v0.9.3/0.9.4 新包 + 沙盒全流程 + 首任务冒烟

## 背景与开工
- 闲时拉起。读 idle-protocol → STATE → AGENTS → journal（s18–s46 追加在 s17 文件内，无缺口）。基线：e2e-chat 18/18 + fuzz 12/12 全绿，无 `[idle-ready]`。
- 找活结论：STATE 路线决策已拍板 P31 内测护航，取 ①（真机 POC 打包与护航）的本机可做部分——真机环节待用户。

## 交付
1. **打包卫生**：删除路径事故产物空目录 forge/docs、forge/DECISIONS、forge/tools（会随 robocopy /E 进包）；package.sh 加守卫——三者存在即拒绝打包（防记忆层泄漏进交付物）。仓库根 `forgeconfgoose/`（8-25 路径事故残留，135K 含误建 sessions.db）确认无引用后**保留未删**，待用户裁决。
2. **定版**：仓库此前无任何 git tag，`git describe` 回落 commit hash / "dev"。打本地 tag **v0.9.3**（清理后）→ 打包 → 冒烟发现 2 bug 修复后 **v0.9.4**。dist 新增 PocketForge-20260829-v0.9.3/.4.zip（288MB / 28543 文件，许可证核验全过，sha256 落档）。
3. **沙盒重部署**：C:\PocketForge-Test 清旧（P10 期老包 + ` ocketForge-Test` 垃圾目录）→ 解压 v0.9.4 → secrets FORGE_AGENT_HOST 指向公网端点（s04 先例）→ `启动数字员工.cmd`（cmd 入口，真实双击等价）。
4. **全流程核验（VERIFIED-RUN，真实 Edge --app 窗口）**：
   - 栈：bridge v0.9.x healthz 200 / faucet ok / nats JetStream OK / schedules API / 6 进程就绪；首启 welcome 页弹出 ✓
   - **任务 1「做个体检」（approve 模式）**：权限确认卡渲染+四按钮；60s 超时自动放行（s24 路径）；手动「这次可以」；「以后都允许」；s31 多步确认提示卡；skill forge-selfcheck 加载；最终 6 进程表格 + 大白话结论 ✓
   - **任务 2 生成库存报表 xlsx（自动模式）**：cmd 引号被吃→自写脚本→cd+相对路径，自愈成功；`库存报表-2026-08-29.xlsx` 落盘 6KB；MD 表格渲染；会话自动命名；临时文件自清理 ✓
   - 文件树 ⟳ 显示制品（🕘✎↗🗑 全在）；点击打开 /preview 页（表格渲染 + ⬇下载原文件）✓
5. **冒烟抓出并修复 2 个真 bug**（a53cd78，v0.9.4）：
   - **时区**：左栏会话时间/搜索结果时间显示原始 UTC（差 8h）。根因：goose ACP updatedAt 带 `+00:00`、sessions.db ts 是无时区 UTC 裸串，前端直切原串。修：tsLocal() 统一转本地 + fmtMDHM()，双调用点，失败回落原串。真实 Edge 验证：8月29日 00:51 ✓
   - **残留 ✕**：closeSearch 后清除按钮仍显示（可见性只在 oninput 更新）。修：closeSearch 补一行隐藏。真实 Edge 验证 ✓
   - 方法论注：IAB（内嵌浏览器）自动化层对本页点击/按键有伪影（chip/✕/fill 偶发无效），换真实 Edge + a11y 语义动作（set_value 触发 oninput、AXPress）后全部定性——**产品无恙，自动化误报**。定性的关键=单变量换通道。

## 观察项（未修，候选 backlog）
- **node 绝对路径调用反复失败**：沙盒任务 2 中 agent 以绝对路径跑包内 node 连败 ~6 次（工具卡 失败），最终 cd 进工作区用相对路径成功。真因未取证（goose shell cwd？引号？），派 pf-researcher 单变量隔离；若可修可省 agent 大量试错（P31-④ 韧性相关）。
- **文件树不随任务完成自动刷新**：任务后需手动 ⟳ 才见制品。低频小白场景可接受，backlog。
- 空壳会话：每次页面加载/重载自动建 New Chat 空壳（对话 0829-xxx），s30 修剪 1 天后清，量可控。

## 遗留
- 真机（妻子公司机）POC 与首任务护航：待用户。
- dev 栈停起：`pc down -p <port>` 可用；update-runner 的 `shutdown` 子命令在此 pc 版本不存在（被 catch{} 吞掉，靠端口清理兜底）——下次动 runner 顺手修正。

## 收尾
- 沙盒栈停（pc down，端口全清）、测试窗口关闭；dev 栈 dev-stack-up.ps1 重启，回归 e2e-chat 18/18 + fuzz 12/12 全绿。
- 沙盒 = v0.9.4 payload 精确一致（模板从 zip 内逐字节同步，VERSION=v0.9.4）。
