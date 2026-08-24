# 2026-08-23..24 s12 — 聊天客户端完整迭代（P12–P27）

## 概述
从零构建了妻子友好的 Web 聊天客户端（ACP 桥 + 浏览器壳），经过多轮用户反馈修复，达到对标 Codex/ZCode 的功能密度。

## 架构
- `conf/templates/chat-bridge.tpl.js`：~550 行零依赖 Node.js——goose ACP（JSON-RPC over stdio）↔ 手写 WebSocket；HTTP 服务同时 serve 聊天页、制品预览、vendor 库、上传/链接/复制 API。
- `conf/templates/chat.tpl.html`：完整单文件聊天 UI——左侧会话列表+右侧工作区面板+中央消息流+底部输入框。

## 功能清单
| 类别 | 功能 |
|---|---|
| 会话 | 列表切换/新建/删除(db级)/历史回放/标题自动命名/导出txt |
| 模型 | 多服务商档案(providers.json v2)、拉取/v1/models→勾选池、顶栏搜索切换、连通测试 |
| 消息 | 流式回复、Markdown 渲染(表格/代码/加粗)、工具调用卡片(状态+原始数据)、复制/重发 |
| 制品 | 右侧文件树、预览(md/docx/xlsx/pdf/img/html)、本机打开(cmd start)、上传+拖拽、版本后缀 |
| 技能 | 面板展示(frontmatter解析含多行description)、「让它现在用」快捷入口 |
| 引用 | 输入@弹文件补全菜单、选中插入 data/artifacts/ 相对路径 |
| 斜杠 | /新对话 /技能 /文件 /设置 /体检 /导出 /停止 |
| 其他 | 工作模式下拉(auto/smart/approve/chat)、模式持久化、粘贴图片拦截提示、Ctrl+K/Ctrl+/快捷键 |

## 关键 bug 与教训（每条都花了一轮以上调试）
1. **ClipboardItem 计算键语法错** — `{'image/'+expr: b}` 无效，须 `{[...]: b}`。一个语法错杀整页 JS。
2. **goose acp 空转** — LLM 端点不可达时静默返回 end_turn + used:0 tokens（无错误）。诊断靠 usage_update.used 字段。
3. **pc envsubst 是启动快照** — secrets.env 后补键不生效于已运行子进程。修法：桥自读 secrets.env。
4. **#model-pick overflow:hidden 裁剪绝对定位下拉不可见** — 省略号移到内层 span。验证用 isVisible 不只 click-success。
5. **9router 响应尾粘 data:[DONE]** — JSON.parse 前必须剥掉。
6. **9router max_tokens 饥饿时文本进 reasoning_content** — 解析取 content||reasoning_content。
7. **python heredoc 写 JS 时 \n 变真换行** — 字符串拼接一律 String.fromCharCode(10)。此坑出现 ≥3 次。
8. **goose-mcp memory 不认 GOOSE_PATH_ROOT** — AppData junction 兜底（mklink /J）。
9. **PowerShell 5 无 BOM 中文脚本解析崩** — bootstrap.ps1 必须 UTF-8 BOM + CRLF。
10. **taskkill /IM node.exe 会连带杀 9router** — 按 PID 杀或先查 CommandLine。

## 验证方式
内置浏览器(playwright)逐项点击+截图+视觉模型(glm-5.2 via tools/vision.js)核对渲染效果。端到端发消息确认 LLM 回复正确。

## 当前状态（本轮结束时）
栈运行中（8 进程），git 干净已推送到 experimental/delivery-v1。交付包 PocketForge-20260824-*.zip 就绪。
