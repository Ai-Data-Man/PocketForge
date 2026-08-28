# PocketForge 仓库工作契约（任何新会话首先遵守）

本项目 = 为 Windows 企业零权限环境构建「Agent 友好最小基础设施 + 门面层 + 通用数字员工」。
工作区可读文件拓扑 = 当下记忆；git log = 过去记忆的可追溯路径。

## 0. 新会话冷启动序列（必须按序执行）
1. 读 `STATE.md` → 知道"现在"：阶段、进行中、开放问题。
2. 需要过去的"为什么" → 查 `DECISIONS/`（ADR 索引在 `DECISIONS/README.md`）。
3. 需要外部事实 → 查 `docs/research/`（每条事实带来源与验证状态）。
4. 需要叙事/时间线 → `docs/journal/`（低权威：与 STATE 冲突时以 STATE 为准）。
5. 之后再看本文件余下约束。

## 1. 留痕纪律（每次工作会话结束前，缺一不可）
- 更新 `STATE.md`（"现在"永远正确）。
- 产生新决策 → 新建 `DECISIONS/00NN-*.md`（禁止改旧 ADR 正文，只能 supersede）。
- 关键外部事实首次确立/变更 → 更新 `docs/research/` 对应底稿。
- 追加 `docs/journal/YYYY-MM-DD-sNN-*.md` 会话记录（要点式，短）。
- `git commit`，message 引用 ADR/STATE 变化；小步多次提交。

## 2. 硬约束（违反任意一条 = 立即停止并回到设计）
1. 目标机：企业 Windows 10/11，无本地管理员权限 → 一切组件解压即用，禁止 installer/MSI。
2. 无 Docker / WSL2 / Hyper-V → 排除一切容器化部署方案。
3. 便携文件夹交付，终端用户零技术背景 → "一次双击启动成功"是验收线。
4. 零系统污染：不写注册表、不写 PATH、不注册服务、不建计划任务；删文件夹 = 完全卸载；通过企业 EDR 审计。
5. 许可证白名单：MIT / Apache-2.0 / 公有领域（SQLite）。BSL/GPL/SSPL/未明确 = 禁止。引入即记录于 research 底稿。
6. 封闭系统（PLM 等）无 API → 数据获取只走浏览器自动化。
7. 不预设业务场景：一切机制对任意业务通用。
8. 设施细节对 Agent 透明（Agent 只见稳定契约）；Agent 运行时禁止自研（采用开源，见 ADR）。

## 3. 事实纪律
- 关键断言必须带来源（URL / 本机复现命令）。
- 验证状态三级：`UNVERIFIED`（仅文档）→ `VERIFIED-DOC`（官方源核对）→ `VERIFIED-RUN`（本机跑通，含日期与版本）。
- 未验证的关键事实必须出现在 `STATE.md` 开放问题区。

## 3.5 状态 Schema 纪律（ADR-0009）
- 改任何自有状态文件（workspace-map/session-archive/providers/.forge 等）的格式 = 同一提交内必须：_schema 版本号 +1、注册表迁移步骤、迁移自测；无迁移的变更视为破坏性提交。
- sessions.db / schedule.json / faucet 数据归组件自迁移，永不手改。

## 4. 仓库分区
- `forge/` = 产品本体（交付物运行时树；打包只取它 + 许可证文本）。
- `tools/` = 开发侧工具（下载 manifest、校验、打包、e2e 测试）。
- `bin/`、`data/`、`dist/` 等大文件与运行时数据不入库（.gitignore），由 `tools/` 脚本 + manifest 可复现。
- `docs/`、`DECISIONS/`、`STATE.md` = 记忆层，永远入库。

## 5. 协作与语言
- 文档与注释：中文为主，技术名词保留英文。
- 面向妻子的最终文档（forge/ 内）：零术语。

## 6. 团队结构与协作（2026-08-28 起；v2 定稿）
本项目由产品团队自治推进。团队定义在**用户域** `~/.zcode/agents/`（服务 C:\ZCodeWorks 全部项目，不绑定单一仓库），角色文件为 ZCode 子智能体格式（name/description frontmatter + 人格化正文）：

| 角色 | 文件 | 职责 |
|---|---|---|
| 主控（会话主代理） | 本文件 | 协调、拍板、落 ADR/STATE、调度子智能体 |
| pf-pm | ~/.zcode/agents/pf-pm.md | 需求归约/路线裁决/backlog（outcome 思考，三次为什么） |
| pf-researcher | ~/.zcode/agents/pf-researcher.md | 外部取证/对照实验/研究底稿（502 三次归因教训内化） |
| pf-engineer | ~/.zcode/agents/pf-engineer.md | 实现（最小 diff/模板真相源/硬约束/schema 纪律/Windows 陷阱） |
| pf-qa | ~/.zcode/agents/pf-qa.md | 断言回归/审查轮/系统性找 bug（默认 NEEDS WORK） |

- 每个角色文件 = agency-agents 深度标准（身份记忆/核心使命/关键规则/交付物/成功指标/沟通风格）+ 共同心智模型段（认知管线/五本能/输出法则），与 §0-§5 契约逐字同源。
- 用户 = 内测期硬核技术型用户（非甲方）：反馈/bug/真机环境/技术判断；产品路线与优先级由团队裁决落档。
- 内测期路线（STATE 路线决策章节）：验证优先于扩张——真机护航/首任务向导/使用统计/线路韧性。
- 调度：单一职责任务派对应子智能体（prompt 自包含）；跨角色任务主控拆解；产出必须回写文档再 commit。
