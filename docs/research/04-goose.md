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
- OpenHands：~~GUI 依赖 Docker/WSL~~〔2026-09-05 勘误：SDK 本地模式已免 Docker；拒因更新为"Windows 官方路线仍 WSL + pip 交付形态违反解压即用"，见 research/11〕。拒。
- Codex CLI：Apache-2.0 Windows 原生可作兜底，但编码向 + ChatGPT 账号中心。WATCH。
- Cline/Roo：VSCode 绑定，非技术用户不可用。拒。
- OpenClaw：MIT，常驻"数字员工"形态贴近，但 Node 22+ / Execution Containers 免管理员存疑。WATCH（备用）。

## 待本机验证（P2 清单）
GOOSE_PATH_ROOT 在 CLI+Desktop 双形态的收敛性；Desktop 免管理员运行 + 禁自动更新；`goose acp --enable-scheduler` Windows 常驻；custom provider 指向 9router 冒烟；MCP stdio 拉起 Windows 路径细节。

## s19 补充取证（2026-08-27 深夜，VERIFIED-RUN 除标注外）
1. **`goose mcp <SERVER>` 可独立启动的内置服务只有 `memory` 和 `tutorial`**；todo/summarize/chatrecall 等为 platform 型，内嵌 acp 进程内，不经过该子命令。
2. **permission.yaml 真实语义**（源码 v1.46.0 crates/goose/src/config/permission.rs + permission_inspector.rs）：文件 = `HashMap<category, PermissionConfig>`，category 仅 `user`（用户显式配置）与 `smart_approve`（LLM judge 的缓存）两种。inspect 决策链（Approve/SmartApprove 模式）：①查 user → ②SmartApprove 查只读注解 → ③manage_extensions 必问 → ④SmartApprove 查 judge 缓存（None/AlwaysAllow 才走 LLM judge，AskBefore 缓存=必问）→ ⑤default RequireApproval（fail-closed）。**本仓库 permission.yaml 把 ask_before 清单写在 `smart_approve:` 键下 = 当作 judge 缓存被读取**：命中即必问，语义有效但机制是"缓存"而非"用户配置"；`browser__browser_click` 等带前缀名是否与 goose 内部工具名（tool_call.name）一致 UNVERIFIED（被 502 阻塞，见下）。
3. **权限请求 ACP 形态**（VERIFIED-RUN 2026-08-27 之前 + 源码 acp/server.rs:1249）：`session/request_permission`，options = allow_always/allow_once/reject_once/reject_always 四项，toolCall 携带 title/rawInput；客户端回 `{outcome:{outcome:"selected",optionId}}`。
4. **9router 大工具集缺陷**（外部依赖风险，非 goose bug）：curl 直连 router 同形状验证——单工具 + stream 正常；**40+ 工具 schema（goose 实际形态）→ 上游丢失 tool_calls（返回纯文本）或 502**。后果：agent 收不到工具调用机会 → 护栏/能力全部旁路。glm-5.2 与 deepseek-v4-flash 均复现。复现命令见 journal s19。待 9router 侧换上游/调参。
5. **provider 解析优先级**（providers.rs:65）：GOOSE_PROVIDER env > config `active_provider` > config `GOOSE_PROVIDER`；openai provider 的 host 解析（openai_def.rs）OPENAI_HOST env 最高——但 acp 会话若被持久 active_provider（如 forge-router declarative）覆盖则 env 全部失效。诊断探针时注意 env.pop('GOOSE_PROVIDER') 后 yaml 兜底仍生效。

## s50 上游情报（2026-08-29，VERIFIED-DOC：GitHub API releases/tags 核对，未本机跑新版）
- latest = **v1.48.0**（2026-08-27）；在用 v1.46.0；2.0 RC 在途（v2.0.0-rc-04-27-0，内测期不碰）。
- 与本项目相关的上游变化：
  1. ACP `Title new sessions from _meta.sessionTitle`（#10712）——桥侧自实现的会话自动命名有了原生通道，BACKLOG 挂「下次动 ACP 层时顺路」。
  2. ACP `Derive and forward thinking effort`（#10949）——深度思考可会话级控制，观察（等护航反馈再启用）。
  3. Security 三连：`Permission denies take precedence`（#11477）/`Fail closed on malformed tool visibility`（#11474）/`Recognize Windows package runners`（#11466）——升级时重点回归权限卡链路 + .goosehints cmd 铁律。
  4. CLI `/new` 免重启新会话（#10767）——s50d 体验问题的参考解，已由人话文案覆盖。
  5. Z.ai GLM-5.2→GLM-5.3（#11226）——不动，内测期 pinned 栈。
- 升级预案与不升级依据见 docs/research/goose-upstream-v1.48.md（同日，含四步沙盒升级流程）。**〔2026-09-05 s64 勘误：该预案文件实际不存在（ls+find 双查），引用失效；升级窗口前需重建预案或从 journal s50 恢复流程。〕**

## s64 上游情报（2026-09-05，VERIFIED-SOURCE/DOC：GitHub API + 双 tag source diff，未本机跑新版）
- latest = **v1.49.0（2026-09-03）**；在用 v1.46.0；v2.0.0-rc 已停滞 4 个月（平台化整合期，非大版本前夜，~6.7 commits/天）。方法论警示：release note 正文是累积式（同一 PR 编号跨版本重复出现），**版本归属一律以 PR 合并日期 + compare API 为准**。
- **三条红线 v1.46→v1.49 源码级全部未动**：① scheduler persist 语义（scheduler_trait.rs 零 diff，scheduler.rs 仅 cache_ttl 钳制与删 racy 断言）② 桥依赖的 `_goose/unstable/schedules/pause|unpause`（#11650 删的是 dictation/extensions-available/preferences，未触 schedules；#11696 删的 providers/list 字段桥零调用）③ GOOSE_PATH_ROOT（paths.rs:41）/ GOOSE_DISABLE_KEYRING（base.rs 双通道）在位。
- 最想要的增量不在 v1.49：#11383 permission.yaml 跨进程写锁（multi-goose-process 形态正需要）**将随 v1.50**。
- **升级裁决（researcher 建议 2026-09-05）：不追 v1.49.0。护航窗口距 v1.50 预计发版（~09-09±3，6-9 天节奏）≥3 天则等 v1.50 一次到位，否则取 v1.48.0（已野外浸泡 8 天+，安全批 #11466/#11474/#11477/#11537 齐全）。回归五面：s55-58 调度闭环全跑；session/load 回放（#11159 触碰 s15 endStream hack 面）+ 401 文案流（#11202）；smart_approve 审批卡（#10285 规范化工具名后 browser__ 前缀命中可能变化）+ 拒绝路径；MCP 商店安装→挂载→卸载；GOOSE_PATH_ROOT/KEYRING + 真实任务（#11537 后 agent 须产出单行 cmd）。新版二进制行为 UNVERIFIED，须走沙盒 s47 流程。**
