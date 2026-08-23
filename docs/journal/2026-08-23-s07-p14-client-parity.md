# 2026-08-23 s07 — P14 对标 Codex/ZCode 的客户端补全

## 用户反馈四问题 → 修复
1. **daily-mem 会话刷屏**：源头是 P8 验证时建的每 2 分钟测试 cron（schedule remove 已删）+ UI 会话列表过滤 sessionType=scheduled。
2. **切换会话无变化**：两个 bug 叠加——v2 的 openSession 先 load 后 subscribe（回放通知没有订阅者）；`session/load` 的 cwd 参数必须绝对路径（null 报 invalid type，'.' 报 not absolute）。修法：桥向页面注入 `window.__root`（serve 时替换 `__FORGE_ROOT__`），UI 先 subscribe 再 load。历史回放（user/agent/tool 卡片）验证通过。
3. **模型配置难用**：设置面板重做——⟳ 拉取 /v1/models（datalist 下拉，实测 66 个）、🔌 测试连通（真实 chat/completions 调用，显示模型回复）。
4. **不支持多 provider**：`data/providers.json` 多档案（名称/host/model/key），侧栏列表一键启用（写穿 secrets.env）、删除、点选回填。验证：添加"公司中转"档案成功。

## 9router 兼容坑（新）
- 响应尾部粘 `data: [DONE]`（SSE 残留）→ JSON.parse 失败。桥统一剥尾再解析。
- max_tokens 太小时 content 为空、全进 reasoning_content → 测试请求放宽到 512，解析取 content||reasoning_content。

## 对标补齐（本壳新增）
- 🧩 技能面板：`/api/skills` 扫 .agents/skills/*/SKILL.md（frontmatter 解析），列表+说明+看内容+「让它现在用」（一键填入 prompt）。小白文案。
- 消息操作条：悬停气泡出现 复制/重发。
- 📤 导出对话（txt：我/小 forge 对话全文+用到的工具清单）。
- 快捷键：Ctrl+K 新对话、Ctrl+/ 技能面板、Enter 发送。
- 粘贴图片拦截提示（ACP 图片通道后续可接）。

## 验证矩阵（playwright+Edge 全绿）
会话列表过滤 ✅｜历史回放 user1+agent1+tool卡1 ✅｜技能 3 个 ✅｜models 66 ✅｜测试连通"ok" ✅｜provider 档案增/列 ✅｜e2e 问答"6" ✅｜零页面错误 ✅

## UI 注入踩坑记录
模板注入 `__FORGE_ROOT__` 时禁止写 `typeof __FORGE_ROOT__ !== 'undefined' ? '__FORGE_ROOT__' : ...`——替换后变成 `typeof C:/...` 语法错。直接 `'__FORGE_ROOT__'` 字符串字面量替换。
python heredoc 写 JS 的 `\\n` 会变真换行——字符串拼接一律 String.fromCharCode(10)。
