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

## s47 续作（同日）— node 调用连败根因取证与修复

**取证（pf-researcher，单变量隔离，T1–T7c 全部本机复现）**：
- 主因：goose shell 工具把命令原文交 `cmd /C`；**行首双引号 + 整行引号 >2 → cmd 剥首尾引号 → 整条报废**（`文件名、目录名或卷标语法不正确` / `'...' 不是内部或外部命令`）。行首裸词不触发。6 次失败全部命中；`"node.exe" --version`（恰好 2 引号）成功证明非"首引号必败"。
- 次因（产品根源）：`.goosehints` 教的 gen-xlsx 调用形态恰是「行首引号绝对路径 + 多引号 + 单引号 JSON」——且单引号 JSON 到 node 是字面量，JSON.parse 必炸（gen-xlsx.js:252 实证），教法两层都跑不通。
- 排除：LLM 笔误（失败命令无笔误，`\"` 转义是唯一正确写法）、连字符/&&/2>&1/斜杠方向/cwd/超时/文件缺失（均出现在成功命令里）。
- 开发树历史上不密集失败 = 开发机 PATH 恰有系统 node（裸 `node` 不踩坑）+ agent 恰好裸词起手；与产品能力无关。
- 证据细节：失败命令原文与 stderr 骨架从 sessions.db（实际路径 conf/goose/data/sessions/sessions.db，sid=20260828_5）提取；中文错误经 GBK 解码复现确认为 cmd 标准消息。

**修复（pf-engineer 实现，主控补一处）**：
- goose-hints.tpl.md：gen-xlsx 段重写——两条铁律（行首裸词/引号≤1 对；JSON 双引号 + `\"` 转义、禁单引号）+ 照抄模板（cd 工作区 && node …）+ `--json-file` 逃生通道；删矛盾句。
- gen-xlsx.tpl.js：argv 兼容单引号包裹 JSON（剥壳再 parse）；新增 `--json-file <路径>`（UTF-8 剥 BOM）；位置参数行为不变。机制注：cmd/argv 层会吃裸双引号（T4），任何 argv 容错救不了单引号+裸引号组合，故 hints 规则②必须禁单引号——T4b 证明 `\"`+剥壳容错可用。
- 主控补正：hints 第 75 行「包内自带 openpyxl」失实（包内 python 实测只有 Pillow 12.3.0）→ 改为如实声明；STATE 技术栈行同步修正。

**验证**：bootstrap 渲染零残留占位符；cmd 端到端 T1(失败形态复现)/T2(教学形态出真 xlsx)/T3(--json-file)/T4b(单引号容错) 全过，xlsx PK 头+条目数+内容断言；e2e-chat 18/18 + fuzz 12/12 全绿。tag **v0.9.5** 重打包（v0.9.4 包内 hints 仍在教坏形态，不可交付），包内核验：新铁律 ✓ / --json-file ✓ / 单引号教法已除 ✓；沙盒已同步 v0.9.5 变更文件（bin/gen-xlsx.js 包内为旧版，首次启动 bootstrap 幂等拷贝自愈——s40 机制，包不启动验证，风险低）。

**遗留候选（backlog，未实现）**：
1. 桥 spawn goose 时向 PATH 前置包内 node 目录并注入 FORGE_ROOT 环境变量——agent 可裸调 node/用 %FORGE_ROOT%，与 dev 树行为对齐；风险：改变命令解析优先级，需零权限目标机 `where node` 验证顺序（P31-④ 韧性相关）。
2. gen-xlsx 末尾位置参数「标题」历来被忽略（只认 JSON title 字段）——教学模板里保留但实际无效，下次动 gen-xlsx 时决定生效或删教。
3. 文件树任务后自动刷新（UX，见上文）。

## 收尾
- 沙盒栈停（pc down，端口全清）、测试窗口关闭；dev 栈 dev-stack-up.ps1 重启，回归 e2e-chat 18/18 + fuzz 12/12 全绿（s47 与 s47b 两次确认）。
- 沙盒 = v0.9.5 变更文件同步完毕（模板/hints/.goosehints 模板版/VERSION；bin/gen-xlsx.js 由首次启动 bootstrap 自愈）。
- dist 最终产物：PocketForge-20260829-v0.9.5.zip（sha256 a2b2bb82…）= 建议交付妻子的内测包；v0.9.3/v0.9.4 留 dist 作演练记录。
