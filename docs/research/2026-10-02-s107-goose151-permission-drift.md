# S107 取证：goose v1.50.0→v1.51.0 permission/注解面漂移核查——read-file-mcp 免卡通路是否存活（2026-10-02）

主控问题：今日 f4（commit 6ab8056）落地 read-file-mcp，地基=「MCP `annotations.readOnlyHint=true` → goose smart_approve 确定性免卡」（v1.50 行为已由 docs/research/2026-10-02-s107-read-tool-permission.md 定案）。产品部署 goose v1.50.0；s98/research/36 开过 v1.51.0 升级窗口。本报告定向核查：升级到 v1.51 后该通路是否原样存活。

验证状态三级：UNVERIFIED / VERIFIED-DOC（官方源码两 tag 逐字节核对，文件:行）/ VERIFIED-RUN（本机实测，含日期）。**本报告全部源码事实=VERIFIED-DOC（2026-10-02 拉取）**；无 v1.51 活体实验（本机无 v1.51 二进制，任务指定源码 diff 法；活体复验归升级实施时 playbook 沙盒）。部署版基线 v1.50.0 为 VERIFIED-RUN（s107 前篇 2026-10-02）。

证据材料（可复跑）：`tmp/g151/{v150,v151}/`（两 tag 源文件下载件）、`tmp/g151/cmp-50-51.json`（GitHub compare API）、`tmp/g151/tree-v150.json`/`tree-v151.json`（两 tag 递归树 SHA）、`tmp/g151/rmcp/rmcp-3.{2,3}.0/`（crates.io 源码包解包）。

---

## 0. 结论（先行）

1. **免卡通路在 v1.51 下源码级无条件存活——是，无附加条件。** 依据：整条判定链五文件（`permission_inspector.rs` / `permission_judge.rs` / `config/permission.rs` / `permission_store.rs` / `tool_inspection.rs`）在两 tag 间 **git blob SHA 逐一相等**（树级全量比对，非抽样）；归一化触发点、inspector 接线、MCP 工具聚合/前缀化路径、内置工具注册与注解全部逐字节一致。主问题四处（readOnlyHint 归一化 / read_only 判定 / LLM judge 触发 / ask_before 自动回写）**零行为变化**。
2. **唯一的真实依赖面漂移是 rmcp 3.2.0→3.3.0**（Cargo.lock 解析版本；manifest 两版都只写 `^3.2.0`）——已下载两版 crates.io 源码包逐文件 diff：`Tool`/`ToolAnnotations` 的定义与 serde（`model/tool.rs`）**逐字节一致**，`model.rs` 仅新增 `ProtocolVersion::known_up_to` 服务端辅助函数+测试。注解解析面无丢弃/改名/新语义。
3. v1.51 新增的环路选择参数（`meta.goose.unrolledAgentLoop`）**默认值与我方现状一致**：我方桥 `session/prompt` 不带 meta → 默认 `state_machine::enabled()`=false → legacy 环路 = v1.50 默认路径的逐字节同代码。
4. 附带：v1.51 **没有出现任何 read 类内置工具**（`developer/mod.rs` 零 diff，注册集仍为 write/edit/shell/tree/read_image；platform_extensions 无新增模块文件）——research/36 结论继续有效，本次源码级复核通过。
5. 留档级建议（不改码）：升级实施时 playbook 沙盒增加一条 read_file 免卡臂（复用 s107 前篇 §4 四臂法，把 `tree` 臂换成产品 read-file-mcp 的 `read` 工具），把本报告 VERIFIED-DOC 升级为 VERIFIED-RUN。

---

## 1. 覆盖面审计：怎么保证没漏看（VERIFIED-DOC）

三层独立方法互证，任何一层都不依赖其余两层的结论：

1. **树级全量 SHA 比对（最权威）**：GitHub git/trees API 两 tag `?recursive=1`（v1.50.0=2954 entries、v1.51.0=2975 entries，`truncated:false`——无截断），逐 path 比 blob SHA：**全仓库共 244 个文件有差异**。permission/注解/工具执行相关目录中，以下文件 **SHA 相等（=内容逐字节相等）**：
   - `crates/goose/src/permission/`（整目录：permission_inspector.rs、permission_judge.rs、permission_store.rs、mod.rs）
   - `crates/goose/src/config/permission.rs`
   - `crates/goose/src/tool_inspection.rs`、`tool_execution.rs`、`tool_confirmation_router.rs`、`tool_call_labels.rs`、`mcp_utils.rs`、`builtin_extension.rs`、`platform_tools.rs`
   - `crates/goose/src/security/`（整目录：adversary/egress inspector）
   - `crates/goose/src/agents/platform_extensions/developer/mod.rs`
2. **GitHub compare API**（`compare/v1.50.0...v1.51.0`，ahead 63/behind 1，files=244）——文件数与树级比对完全吻合，behind-commit 无隐藏影响（疑为 v1.50 版本号 bump commit，树级比对已将其效果罩住）。
3. **raw.githubusercontent 双 tag 下载逐文件 cmp**（15+15 文件，见 §2–§4 各条）——与 SHA 结论一致，并供行级引用。

244 文件中与 agents/tools/mcp/security 相关的全部差异文件已逐一人工分诊（§2、§3），无一触碰权限判定或注解语义。

## 2. Q1：smart_approve/permission 判定链 diff——四处全部零变化（VERIFIED-DOC）

### 2.1 判定链本体：SHA 相等

`permission_inspector.rs`（inspect 五步：user 段 → **read_only_hint 注解确定性放行** → manage_extensions 必问 → LLM judge → fail-closed；`cache_non_readonly_decision` 负缓存回写；`apply_tool_annotations` 只读集合收集）、`permission_judge.rs`（`detect_read_only_requests`）、`config/permission.rs`（**注解归一化 `apply_tool_annotations` :91-107——`read_only_hint==Some(false)` 批量写入 `smart_approve.ask_before` 并持久化；`bulk_update_smart_approve_permissions` :109-131 先清三列表再压 ask_before；user 段 never→always→ask 优先序**）、`permission_store.rs`、`tool_inspection.rs`——全部 blob SHA 相等（§1 方法 1）。行号引用沿用 s107 前篇 v1.50 定位（文件未变，行号不变）。

**⇒ readOnlyHint 注解归一化、read_only 判定、LLM judge 触发条件、ask_before 自动回写——四处零行为变化。**

### 2.2 归一化触发点与 inspector 接线：逐字节一致

- 触发点 `reply_parts.rs:225`（两 tag 同行号）：`if goose_mode == GooseMode::SmartApprove { self.tool_inspection_manager.apply_tool_annotations(&tools); }`——所在函数两版唯一差异是 `model_config_for_session` → `effective_model_config_for_session`（v1.51 agent.rs :1000 新函数，经 provider registry 归一模型配置，影响 provider 请求参数，与权限无关）。`tools` 的构建链（`list_tools` → `prepare_inference_tools` → 注解归一化）逐字节同构。
- inspector 接线 `agent.rs` `create_tool_inspection_manager`（v1.50 :779-806）：位于两 tag diff hunk 空档区（hunk 从 :349 直接跳 :1011），逐字节未动。`agent.rs` 全部 28 个 hunk 经关键词扫描（permission/inspect/read_only/annotat/smart_approve）**零权限面改动**；668 行差异实为：plan/recipe CLI 功能移除（-449 主体，#12061/#11942）、thinking 流式去重重构（#11837）、`use_state_machine` 参数穿透、toolshim 作用域（#11414）。
- `types.rs`：仅删一行注释。`agents/mod.rs`：仅 `MCP_PROTOCOL_VERSION` re-export 移除（常量内联进 mcp_client.rs 协商列表，见 §3）。

### 2.3 agent 环路选择：默认不变（关键新增面，已核）

v1.51 把环路判定从 `reply_impl` 内提到参数（`agent.rs` v1.51 :2035 `reply(..., use_state_machine, ...)`；:2114-2118 `if use_state_machine { reply_with_state_machine }`）。判定来源=ACP `session/prompt` 处理器（`acp/server.rs` v1.51 :2313-2319）：

```rust
let use_state_machine = args.meta.as_ref()
    .and_then(|meta| meta.get("goose"))
    .and_then(|goose| goose.get("unrolledAgentLoop"))
    .and_then(|value| value.as_bool())
    .unwrap_or_else(crate::agents::state_machine::enabled);
```

- `state_machine::enabled()`（`state_machine/mod.rs` :73-77）= env `GOOSE_STATE_MACHINE` ∈ {1,true,TRUE,yes}，默认 **false**——该函数两 tag 逐字节一致（mod.rs 全文件仅删一行 re-export）。
- 产品桥 `forge/bin/chat-bridge.js:1744` 发送 `session/prompt` params 仅 `{ sessionId, prompt }`，**无 meta 键** → v1.51 下 `use_state_machine=false` → legacy 环路——与 v1.50 默认路径（`enabled()||bang_shell` 均假）执行的是**同一段未改动代码**。
- 注：goose 桌面端会经 #11247 发该 meta 走 state machine 环路；我方不受影响。且 state_machine 模块本身两 tag 仅测试文件变化（mod.rs -1 行 re-export，ops 未动），两个环路共用同一 `tool_inspection_manager`，即便未来切环路，判定链仍同源。
- bang-shell 短路（`!command` 直达 state machine）在 v1.51 ACP reply 路径移除（`bang_shell_command` re-export 删除，agent.rs 无 bang 引用）——CLI 便利功能，离我方 ACP 面，无影响。

## 3. Q2：MCP annotations 解析/传播面——无丢弃/改名/新语义（VERIFIED-DOC）

### 3.1 goose 侧传播链：逐字节一致

MCP 工具注解的完整传播路径，两 tag 逐字节比对：

1. **rmcp 反序列化**：goose 直接使用 `rmcp::model::Tool`/`ToolAnnotations` 协议类型（`developer/mod.rs` :12-17 import 锚定；inspector :10 `use rmcp::model::Tool`）。`ToolAnnotations` serde 契约（rmcp 3.3.0 `src/model/tool.rs` :46-90）：`#[serde(rename_all = "camelCase")]`，`read_only_hint/destructive_hint/idempotent_hint/open_world_hint` 均为 `Option<bool>` + `skip_serializing_if = Option::is_none`。
2. **聚合**：`agent.rs` `list_tools`（v1.50 :1453 / v1.51 :1456，逐字节相同）→ `extension_manager.get_prefixed_tools`（两版同构）→ `get_all_tools_cached`。
3. **前缀化**（extension_manager.rs，v1.51 :2000-2035 区域，位于 hunk 空档区 1337-2206，逐字节未动）：循环内只改 `tool.name`（`{ext}__{name}`）和 `tool.meta`（插入 owner 键）——**`tool.annotations` 字段原样穿过**。两版 extension_manager.rs 中均无 "annotations" 字样（grep 零命中）。
4. **消费**：`reply_parts.rs:225` 归一化 + inspector `readonly_tools` 集合（§2）。

### 3.2 rmcp 3.2.0 → 3.3.0（真漂移候选，已证无害）

- manifest：两 tag 根 `Cargo.toml` :23 均为 `rmcp = { version = "3.2.0" }`（^3.2.0 语义）。
- lock：v1.50.0 `Cargo.lock` :10298-10300 解析 **rmcp 3.2.0**；v1.51.0 :10370-10372 解析 **rmcp 3.3.0**（v1.51 重新生成 lock 时新鲜解析取了新版——minor 漂移藏在 lock 层，manifest 层不可见）。
- 源码 diff（crates.io `.crate` 包解包，`tmp/g151/rmcp/`）：
  - `src/model/tool.rs`（**Tool + ToolAnnotations 全部定义与 serde**）：`cmp` **逐字节一致**。
  - `src/model.rs`：3 个 hunk = 一行 doc 措辞、`ProtocolVersion::known_up_to()` 新辅助函数（供服务端声明支持版本区间）+ 纯测试。无序列化语义变化。
  - 其余差异文件（`handler/server.rs`、`service/server.rs`、`transport/auth*`、`client_side_sse.rs`、`streamable_http_*`）：服务端/传输层，不触碰客户端 tools/list 的注解解析。

### 3.3 v1.51 的 MCP 连接面变化（均不触碰注解）

- `mcp_client.rs` 唯一 diff（v1.51 :717-721）：协商 `preferred_versions` 从 `[V_2026_07_28]` 变 `[V_2026_07_28, V_2025_11_25]`（`legacy_version` 仍为 V_2025_11_25）。`ToolAnnotations` 的 wire 形态在这两个协议版本间同一（rmcp 单一 serde 实现，§3.2 已证未变）；对只会说旧版本的服务器从"legacy 兜底"变"preferred 命中"，能力集等价。
- `extension_manager.rs` 262 行 diff 全部 hunk 分诊：①streamable HTTP/Unix socket 空 discover 响应时降级 V_2025_11_25 重连（#12066，**仅 HTTP 类传输**；read-file-mcp 走 stdio 不经过）；②ACP app 工具调用的扩展归属校验（`dispatch_app_tool_call`/`is_tool_owned_by_extension`，#11416——模型驱动的 `dispatch_tool_call` 调 `dispatch_tool_call_inner(..., None, false, ...)` 行为不变）；③测试。
- `acp/server/tools.rs`：app 侧 `tools/call` 按扩展过滤+可见性校验（#11416 同族），非模型权限路径。

## 4. Q3+Q4：存活结论与附带核查

### 4.1 存活判定：是（源码级，VERIFIED-DOC）

「read-file-mcp（`forge/bin/read-file-mcp.js:35` 发 `annotations:{readOnlyHint:true,...}`）→ goose smart_approve 第②步确定性放行」在 v1.51.0 下**原样存活**：

- 判定链五文件 SHA 相等（§2.1）；
- 注解从 wire 到 inspector 的传播链逐字节一致（§3.1）；
- rmcp 3.3.0 注解模型逐字节一致（§3.2）；
- 默认执行环路与我方现状同路径（§2.3）。

无「条件」项。**最小应对=无需应对**；唯一留档动作=升级实施时 playbook 沙盒加一条 read_file 免卡臂（§0.5），把结论从 VERIFIED-DOC 升到 VERIFIED-RUN。

### 4.2 Q4：无新 read 类内置工具（VERIFIED-DOC）

- `developer/mod.rs` 两 tag 逐字节一致：注册集仍为 `write/edit/shell/tree/read_image`，单测锚（:279 `assert_eq!(names, vec!["write","edit","shell","tree","read_image"])`）原样。
- 树级比对：`platform_extensions/` 下**无新增文件**（apps/code_execution/orchestrator/developer-image 均为修改，且经查零注解面改动——image.rs 是 #11411 响应体限界修复）。
- research/36 的工具集结论继续有效，本次源码级复核通过，不重查其余面。

## 5. 方法与边界（可审计）

- 拉取与比对全部发生在 2026-10-02；raw/api.github 两通道互证（网络瞬时失败均以重试+字节数校验闭环）。
- 排除项：未跑 v1.51 活体（无本地 v1.51 二进制；任务指定源码 diff 法）；未动 dev 栈任何进程/端口/数据；未改任何产品代码/模板（本报告为纯新增文档）；未进入 C:\PF-TEST（无 goose 实验，无需沙盒）。
- 覆盖边界声明：本报告证明的是**两 tag 源码树之间**该通路零漂移；「tag 源码 ↔ 官方发布二进制」的供应链一致性未验（同风险存在于 v1.50 基线，非本次升级增量风险），升级沙盒天然覆盖。
- UNVERIFIED 残留：无（所有写入本报告的事实均带 §1 三层方法之一的源证据；唯一推断性表述——behind-commit 疑为版本 bump——已被树级全量比对这个不依赖该推断的更强国罩住）。
