# E2E 与手工回归手册

## 自动化

### tools/e2e/e2e.sh
全栈故事链（PLM 抓取→faucet 入库→app 注册→重启存活）。前置：栈已启动；`OPENAI_*` 已配置。

### tools/e2e/e2e-chat.sh
聊天客户端 HTTP 链路 18 断言（s18/s28）。前置：chat-bridge :8790 在跑。覆盖：
- 工作区 new/幂等/delete + 活跃区删除护栏
- fs new/rename、上传、附件身份随改名
- vcs log/blob/restore 往返
- workspaces 列表结构
- 聊天记录搜索（正常命中 + 短查询空返回）
运行后自动清理；归档区 e2e-chat-* 残留需手工删 data/session-archive.json。

### tools/e2e/report-probe.sh（s65 转正自 s64 tmp 探针）
报告 v2 长期保护网：static（39 ck，静态/纯函数，秒级）+ sandbox（29 ck，自建沙箱真桥，端口 18790/18799，不碰 dev 栈，实测约 31-47s）。已挂进 e2e-chat.sh 第 12 节全量跑；也可单跑 `report-probe.sh static|sandbox`。

### tools/e2e/ui-logic-probe.js（s69 转正自 tmp p210-211-kbd-check + p22-close-path-check）
UI JS 常备回归网，55 断言秒级（无桥无网络）：从 chat.tpl.html 原文逐字提取 handler + DOM 桩沙盒执行——键盘/IME 34 ck（model-pick 开合/Esc 还焦点、slash/at/Tab 三菜单环形高亮+Enter 选中含旧行为对照、IME 组合期不劫持含 Tab 唤起守卫、桥同款 new Function 全块语法）+ 模态关闭路径 10 ck（✕/Esc/背景点击三路复位 cfgKeyTouched+清半截 Key，含修复前对照组）+ 提示词面板/Tab 菜单 11 ck（用户五主线批2 e12：promptInsert 插入光标处不发送、promptNameOf name 兜底=首行前 20 字、📖 面板点外收起 isConnected 守卫——面板内同步重渲染点击不误关）。提取锚点=稳定标记字符串正则（非行号，模板漂移显式 NOT FOUND 报错而非误报）；断言失败输出带 [handler] 前缀定位。已挂进 e2e-chat.sh 第 14 节；也可单跑。

### tools/e2e/toolcard-frames-probe.js（e4a 批，r19 R1-R5 解释链路断供修复）
工具卡帧双形态回归钉，25 断言秒级（无桥无网络）：从 chat.tpl.html 原文逐字提取 toolCard 整函数 + DOM 桩沙盒执行——goose v1.46 数组形态 content 解析（修复前 `_out` 恒空→工具卡输出区从未显示过内容+explain 恒拿「(空)」捏造，帧形态内嵌自 tmp/r19-frames.jsonl 真帧）+ 旧对象 `.raw` 兜底 + rawOutput-only（acp-aware 成功工具）兜底 + live_output 帧不污染 + explain 载荷喂料扩容断言（rawInput/status/exitCode/toolName/trunc）+ 桥侧 explain_tool 措辞/缓存键静态钉（「(空)」歧义措辞防回潮）。已挂进 e2e-chat.sh 第 19 节；也可单跑。

### tools/e2e/cold-surface-probe.sh（s69 转正自 tmp s69-cold-probe.js + s69-assert.js）发版前对沙盒冷启跑一次的只读六新面断言（15 ck）：冷启态（healthz 200 + pg Ready restarts=0 + pg-init Completed）+ v0.9.10 六新面（升级两步向导标记 / skill-sources 双源首启 / mcp-catalog 3 条 / permission user 三键+never_allow / CONTEXT_FILE_NAMES+四扩展关停 / 能力面板 enabled 与 config.yaml 一致含注释读取）。用法：目标栈冷启后 `PF_ROOT='C:/PocketForge-Test' bash tools/e2e/cold-surface-probe.sh`；PF_ROOT / PF_BRIDGE_PORT 可参数化（PC 端口自动读目标树 data/pc.port），传 dev 树 `<repo>/forge` 可复跑同款断言。前置：目标栈已启动；提权账户直启 pg 必 crash-loop——沙盒须 runas /trustlevel:0x20000 降权包装且重拉前清旧 wrapper cmd（s67 先例）。回归层级：**每发版一次**（全栈冷启太重，不进常规 e2e-chat / fuzz）。

## 手工回归清单（GUI，改动 chat.tpl.html / chat-bridge.tpl.js 后必跑）
1. 页面加载：bridge ok，左栏列表/归档折叠正常
2. 新对话：欢迎语 + 4 个快捷任务 chips（点 chip 填入输入框）
3. 搜索：左栏搜「库存」出结果卡（中文时间非 NaN），点击跳会话；✕ 或 Escape 恢复列表；点「＋新对话」也恢复
4. 管理面板（🧠）：本事开关 3 项（切换写盘提示）/ 记住的事（空态 + 删单条）/ 定时任务（cron 转人话 + 🗑）/ 护栏说明
5. 技能弹窗（🧩）：已装技能列表 + 「先看内容」展开全文 + 可添加区安装后条目消失
6. 设置面板（⚙️）：服务商 / 外观（昼夜 × 4 皮肤）/ 关于与升级——已不含管理类区块（s43 迁出）
7. 权限确认卡（LLM 链路恢复时）：approve 模式发写文件任务 → 卡片渲染 → 「这次可以」→ 执行 → 汇报；60s 超时自动 allow_once；后台标签时标题闪「⚠️ 等你确认」
8. 真任务冒烟：gen-xlsx 生成制品 → 工具卡完成态 → 制品卡预览 → 本机打开
9. 后台提醒：任务进行中切走窗口，完成后标题闪「✅ 干完了」

## 开发会话起栈
勿手工 Stop+起 bridge（会与 pc 编排竞争，见 journal 02:55 事故）。用 `powershell -File forge/conf/dev-stack-up.ps1`；单进程操作走 `pc -p 8099 process restart chat-bridge`。

## 端点速查（chat-bridge）
GET /healthz /api/skills /api/schedules /api/extensions /api/memory /api/search?q= /api/workspaces /api/ws/tree /api/artifacts /api/vcs/log|blob /api/update/status /api/stats（s49 当日匿名使用计数，落 data/stats/usage-YYYYMMDD.json）
POST /api/extensions {id,enabled} /api/memory {op,category[,text]} /api/schedules {id} /api/fs/new|rename|delete /api/ws/new|bind|unlink|delete /api/upload?ws=&dir=&name= /api/vcs/restore /api/update/*
安全：非本源 Origin 的写请求 403（s17）；删除/变更类无二次确认头，依赖前端 confirm。
断言基线：e2e-chat 54（e4a 批起 +第 19 节 toolcard-frames 1 ck；此前基线 46 为 s69 快照，后经 15/16/17/18/18b 各节累加未同步）+ fuzz 102（s49 起 fuzz 含 /api/stats 形状断言）。
另（s47 取证沉淀）：agent shell 命令经 cmd /C 原样执行——行首引号 + 整行引号 >2 会被 cmd 剥引号报废；教法与模板见 conf/templates/goose-hints.tpl.md 的两条铁律。

## 已知外部依赖风险
- goose 出网走 Windows IE 系统代理（见 STATE #3）；手工跑 goose 必带 NO_PROXY=127.0.0.1,localhost
- glm-5.2 myopencode 线路 401/429 锁定会使探针假象性"护栏失灵"——先查 9router-server.log 再下结论
