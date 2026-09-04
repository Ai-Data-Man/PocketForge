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
断言基线：e2e-chat 18 + fuzz 13（s49 起 fuzz 含 /api/stats 形状断言）。
另（s47 取证沉淀）：agent shell 命令经 cmd /C 原样执行——行首引号 + 整行引号 >2 会被 cmd 剥引号报废；教法与模板见 conf/templates/goose-hints.tpl.md 的两条铁律。

## 已知外部依赖风险
- goose 出网走 Windows IE 系统代理（见 STATE #3）；手工跑 goose 必带 NO_PROXY=127.0.0.1,localhost
- glm-5.2 myopencode 线路 401/429 锁定会使探针假象性"护栏失灵"——先查 9router-server.log 再下结论
