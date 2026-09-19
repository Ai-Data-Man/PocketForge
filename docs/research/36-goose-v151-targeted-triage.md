# goose v1.51.0 定向分诊（升级窗口重开，2026-09-19 s98 支线）

> 背景：goose v1.51.0 于 2026-09-17 发布（当前产品钉 v1.50.0）。本底稿=对 PocketForge 红线面做**源码级定向核查**（raw.githubusercontent 双 tag 文件逐字节 diff），非全量升级评估。全量评估走 docs/research/goose-upgrade-playbook.md 十面沙盒。

## 核查方法与证据

双 tag 同路径文件下载 diff（tmp/sessmgr-*.rs / tmp/acpserver-*.rs 等，可复跑）：

| 面（红线/关键） | 文件 | v1.50→v1.51 差异 | 判定 |
|---|---|---|---|
| 思考力度闸门（主线3） | crates/goose-provider-types/src/model.rs | **逐字节一致（987 行）**——is_reasoning_model 名单/显式 reasoning 位/normalize_effort_suffix 全同 | glm 遮蔽态不变；升级不改变 s98 思考力度三态行为。VERIFIED-DOC |
| 第 10 必查：sessions.db/sid | crates/goose/src/session/session_manager.rs | 仅 #11613 Unix 目录权限加固（cfg(unix)，Windows 无关）+其测试；**DDL/schema_version=16/truncate 谓词/当日 MAX+1/closed 集语义全部无 hunks** | 救援/sid 复用/批量删除当日守卫前提不变。VERIFIED-DOC |
| ACP set_config_option | crates/goose/src/acp/server/dispatch.rs | **逐字节一致** | thinking_effort/model 配置面不变。VERIFIED-DOC |
| ACP configOptions 遮蔽 | crates/goose/src/acp/response_builder.rs | **逐字节一致** | 前端三态真相源不变。VERIFIED-DOC |
| ACP server 主面 | crates/goose/src/acp/server.rs | 96 diff 行=read_resource_link→render_resource_link（#11941：不可内联的 resource link 由丢弃改为**元数据 JSON 块呈现**）；「Session not found: {}」单源措辞 4 处原样、closed 守卫未动 | 救援触发面不变；**升级注意项：ACP content 可能出现 resource-link 元数据新形态**（桥透传帧，前端工具卡按文本渲染，预期无害，升级沙盒补一条目测）。VERIFIED-DOC |

## release notes 分诊（对本产品十面的初判）

- 相关修复：#12066 MCP preferred version+HTTP retries（vendored 三 MCP 行为面，升级沙盒复验）；#11837/#11836/#11976 thinking/effort 三条（provider 层映射 churn——闸门文件未动但 providers/*.rs 有变，**升级后须活体复验 thinking_effort 通道 wire 效果**，research/35 mock 臂可复用）；#11613 会话库权限（Unix only，无关）。
- 无关面：Desktop/网关配对/CLI planning mode 移除/recipe 命令移除（我方零依赖）；#11944 OpenCode Go 专有。
- 升级窗口判断：**红线面定向五面全过门，可以立项全量升级**（playbook 十面沙盒+CTL/B/RB/NEG 四项复跑+新增 resource-link 目测）；无硬阻断。

## 结论

- v1.51.0 对 s98 已落地的思考力度/批量删除/救援链路的协议前提**零破坏**（关键五文件三份逐字节一致+两份仅无关/注意级差异）。
- 升级动机评估归 PM/下会话（release 主打 GPT-live/EUrouter/Operator allowlist——对单机离线场景增益有限；MCP HTTP retries 与 thinking 流序修复有一定质量价值）。

状态：VERIFIED-DOC（源码级）；活体十面沙盒=升级实施时按 playbook 执行。
