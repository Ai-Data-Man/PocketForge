# goose（aaif-goose/goose，原 block/goose 已捐赠至 Linux 基金会 AAIF）

- 结论：ADOPT（Agent 运行时主选）
- 一句话用途：开源 agent 运行时：CLI + Desktop（Electron）双形态，MCP 客户端一等公民，内置会话/调度/子代理/技能。
- 许可证：Apache-2.0（api.github.com 核对，2026-08-19）。
- Windows/便携性：release 提供 `goose-x86_64-pc-windows-msvc.zip`（CLI，免 installer）与 `Goose-win32-x64.zip`（Desktop，官方指引即"解压→运行"）；Desktop 为 Electron（自带 Chromium，不依赖 WebView2）。
- 版本与活跃度：v1.46.0（2026-08-12）；~53k stars，调查当日仍有 push；治理：AAIF（GOVERNANCE.md/MAINTAINERS.md）。
- 验证状态：VERIFIED-DOC（2026-08-19；来源：repo/releases/paths.rs/config-files.md/environment-variables.md 等，见 journal s01 R3）。

## 便携化关键机制（本项目集成面）
1. `GOOSE_PATH_ROOT=<绝对路径>` → config/data/state/.agents 全部收进该根（源码 config/paths.rs）—— 便携硬要求的官方机制，P2 必测 Desktop 是否同样继承。
2. `GOOSE_DISABLE_KEYRING=1` → secrets 落 `<config>/secrets.yaml` 而非 Windows Credential Manager（零污染必需）。
3. `GOOSE_MODE` = auto/approve/chat/smart_approve；permission.yaml + tool_permissions.json 细化。
4. 任意 OpenAI 兼容端点：`OPENAI_API_KEY` + `OPENAI_HOST` + `OPENAI_BASE_PATH`，或 `<config>/custom_providers/*.json`（base_url + api_key_env）；新版键 `active_provider`/`providers:`。
5. MCP 扩展：config.yaml `extensions:` 下 `type: stdio`（cmd/args/envs）与 `type: streamable_http`（uri）；`goose mcp <name>`、`--with-extension`。内置 developer（shell/文件）、computer controller、memory、skills、todo、summarize 等。
6. 系统提示注入：`goose run --system <TEXT>` / `-i <FILE>` / `GOOSE_MOIM_MESSAGE_TEXT|_FILE` / `.goosehints` / `<config>/prompts/`（含 subagent_system.md）。
7. 会话：SQLite `<data>/sessions/sessions.db`；`goose session list/resume/fork`。无头：`goose run -t "任务"`（--no-session）。
8. 调度：`goose schedule add|list|remove|run-now`（6 段 cron）；后台 scheduler 需 `goose acp --enable-scheduler` 常驻（Windows 常驻方式 P2 验证）。
9. 数据外泄面控制：默认 %APPDATA%\Block\goose（用 GOOSE_PATH_ROOT 收敛）；telemetry 默认 false；Desktop 的 electron-updater 自动更新需禁用/验证；安装脚本会写 ~/.local/bin —— 我们只用 zip 二进制绕开。

## 替代对比结论（详表见 journal s01 R3）
- Letta：需 PostgreSQL/Docker，Windows 原生差。拒。
- OpenAI Agents SDK / Pydantic AI：仅库，loop/UI/会话全自建，违反"Agent 不自研"。拒。
- LangGraph：库 MIT 可用但 Server 商业许可 + Docker。拒。
- OpenHands：GUI 依赖 Docker/WSL。拒。
- Codex CLI：Apache-2.0 Windows 原生可作兜底，但编码向 + ChatGPT 账号中心。WATCH。
- Cline/Roo：VSCode 绑定，非技术用户不可用。拒。
- OpenClaw：MIT，常驻"数字员工"形态贴近，但 Node 22+ / Execution Containers 免管理员存疑。WATCH（备用）。

## 待本机验证（P2 清单）
GOOSE_PATH_ROOT 在 CLI+Desktop 双形态的收敛性；Desktop 免管理员运行 + 禁自动更新；`goose acp --enable-scheduler` Windows 常驻；custom provider 指向 9router 冒烟；MCP stdio 拉起 Windows 路径细节。
