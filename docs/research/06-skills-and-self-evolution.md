# Skill 体系与自进化（R6 调研，2026-08-21）

- 结论：ADOPT 官方 agentskills.io 规范（= anthropics/skills 的 spec）+ skill-sediment 元技能
- 验证状态：VERIFIED-DOC（规范，源：agentskills.io/specification、anthropics/skills、aaif-goose 文档）+ VERIFIED-RUN（发现/沉淀/按 skill 执行，2026-08-21）

## 规范要点（写 skill 必须遵守）
- frontmatter：`name`（≤64 字符、小写-数字-连字符、**必须等于目录名**）+ `description`（≤1024 字符，写清"做什么+何时触发"，模型易欠触发所以描述要主动）；可选 license/compatibility/metadata/allowed-tools。
- 正文 <500 行：编号步骤 + footguns（坑）+ **验证步骤**；细节下沉 references/（写明何时读）、命令下沉 scripts/（幂等、无交互）。
- 渐进披露三层：metadata 常驻 → body 激活时载 → 资源按需载。
- 反模式：凭空生成的空话 skill（必须由真实执行证据喂养）；过宽描述误触发；过度全面有害。

## goose 侧事实
- 发现路径：项目级 `.agents/skills/`（**天然便携**，随文件夹走）+ 全局 `~/.agents/skills/` + 插件目录；兼容 `.goose/skills/`、`.claude/skills/`。
- 官方 best practices 三条：one skill per workflow / 编号步骤 / include verification steps。
- 内置 skills 仅 2 个（web_search、goose_doc_guide）。

## 自进化先例（官方背书）
- Anthropic engineering 博客 "equipping agents for the real world with agent skills"：任务后让 agent 把成功做法+错误捕获进 skill。
- agentskills.io best practices "Extract from a hands-on task"：提取四要素——步骤序列/用户纠正/IO 格式/项目特有约束；execute-then-revise 至少一轮。
- description 优化：trigger eval（正反例 query 自测，阈值 0.5）——PocketForge 简化为写入协议（命中后对比修订）。

## PocketForge 落地（全部 VERIFIED-RUN 2026-08-21）
- 元技能 `.agents/skills/skill-sediment/SKILL.md`：三触发信号（用户纠正/二次排查成功/多步序列跑通）+ 四要素提取 + 三段式 description + 修订优先于新建 + 验证闭环。
- agent 自主产出 `scrape-table-to-db` skill（质量合格：登录边界/清旧数据/核对步骤全有）。
- 按 skill 执行闭环：任务指令引用 skill → agent 读取执行 → 6 行入库核对一致。

来源：agentskills.io/specification · agentskills.io/skill-creation/best-practices · agentskills.io/skill-creation/optimizing-descriptions · github.com/anthropics/skills（pdf/docx/skill-creator 样例）· anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills · aaif-goose/goose documentation/docs/guides/context-engineering/using-skills.md
