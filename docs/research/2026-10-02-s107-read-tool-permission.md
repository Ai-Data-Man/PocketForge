# S107 取证：goose 部署版有没有 `read` 工具 / smart_approve 下免卡读文件是否成立（2026-10-02）

主控问题：出厂 permission 种子（`forge/conf/templates/permission.tpl.yaml`）`smart_approve.ask_before` 含 shell/edit/write/read_image 等，**不含 read**；出厂包实测模型读工作区 CSV 走 shell `type` 撞权限卡（60s 超时自动拒，报表任务失败）。待裁决修法「hints 一行引导模型改用 read 工具」是否成立。

验证状态三级：UNVERIFIED / VERIFIED-DOC（官方源码 tag 核对，文件:行）/ VERIFIED-RUN（本机实测，含日期）。源码基线：本地 clone `tmp/goose-src`（tag v1.46.0，commit 98c11ce）+ raw.githubusercontent.com tag **v1.50.0 / v1.51.0** 逐文件核对；二进制基线：产品在用 `forge/bin/goose/goose-package/goose.exe --version` = **1.50.0**（VERIFIED-RUN 2026-10-02）。

---

## 0. 结论（先行）

1. **goose v1.50.0（部署版）没有名为 `read` 的内置 developer 工具。** developer 扩展工具集 = `write / edit / shell / tree / read_image`（源码单测锚定 + 生产请求转储 + 沙盒实调三证）。v1.46.0 与上游最新 v1.51.0 同样没有。⇒ **「hints 引导模型用 read 工具」在前提上就不成立**：模型照做只会得到 `Tool 'read' was not advertised for this model turn` 的即时错误（不产生权限卡，但也读不到任何东西）。
2. **smart_approve 不是「不在 ask_before 名单=自动放行」。** 它有自己的内置分级，判定链（v1.50 源码，`permission_inspector.rs`，与 v1.46 逐字节一致）：①`user:` 段（用户显式配置，权威）→ ②**工具注解 `read_only_hint=true` → 确定性放行**（developer 工具里只有 `tree`）→ ③manage_extensions 必问 → ④`smart_approve:` 缓存为 None/AlwaysAllow 时走 **LLM judge 按次判定**（判非只读或 judge 失败=必问）→ ⑤默认必问（fail-closed）。
3. **沙盒四臂单变量实验**（部署二进制，smart_approve，出厂种子逐字，唯一变量=模型发出的工具名）：
   - `read`{path:"data.csv"} → 无权限卡，直接失败「Tool 'read' was not advertised for this model turn」；
   - `tree`{path:"."} → **无卡放行**，返回 `data.csv  [3]`（只有文件名+行数，**无文件内容**）；
   - `shell`{command:"type data.csv"} → **权限卡**（选项 allow_always/allow_once/reject_once/reject_always），拒绝后回「The user has declined to run this tool. DO NOT attempt…」；
   - `load`{}（无注解、不在种子）→ **LLM judge 被真实调用**（judge 请求在 goose RequestLog 与假 provider 双侧留痕）→ 判非只读 → 权限卡 → 拒绝后 `load` 被回写进 permission.yaml 的 `smart_approve.ask_before`（judge 负缓存）。
4. **因此：「让模型读工作区文件改用 read 工具」在出厂 permission 配置下是否免权限卡 = 否（且非条件性否决——工具根本不存在，与权限配置无关）。** 当前工具面上**不存在任何免卡的文件内容级读取工具**：免卡的只有 `tree`（结构），内容读取全走卡。
5. 种子层「最小替代」判定：**改 permission 种子救不了这个场景**——①把 read 加 always_allow：无对象（工具不存在）；②把 shell 等移出 ask_before：无效，goose 启动即按工具注解自动加回（root-B 臂实证）；③`smart_approve.always_allow` 放行：对 write 注解工具会被注解归一化**清除并搬回 ask_before**（源码级），对无注解工具仅触发重新 judge，不保证放行；④`user.always_allow` 放 shell 是唯一确定性放行通道，但等于**全量 shell 免卡**（含 rm/del），属扩大授权面，不是最小修法（需裁决，本报告不建议）。**机制上成立的最小修=给产品挂一把 `read_only_hint=true` 注解的只读文件内容工具**（产品已 vendored MCP 机制可承载）：smart_approve 第②步确定性放行，零卡、零 judge 开销、只读无破坏面——修不修归 PM 裁决。

---

## 1. Q1：部署版有没有 `read` developer 工具 —— 没有

### 1.1 源码级（VERIFIED-DOC）

- **v1.50.0**（https://raw.githubusercontent.com/aaif-goose/goose/v1.50.0/crates/goose/src/agents/platform_extensions/developer/mod.rs，2026-10-02 拉取，15151B）：
  - `get_tools()` 注册且仅注册 5 把：`write`/`edit`/`shell`/`tree`/`read_image`（该文件 :109-185 区域）；
  - 单测锚定（:279）：`assert_eq!(names, vec!["write", "edit", "shell", "tree", "read_image"]);`
  - 与 v1.46.0（本地 `tmp/goose-src/crates/goose/src/agents/platform_extensions/developer/mod.rs`，15146B）CR 不敏感 diff 仅 1 处 = shell 描述加 cmd.exe 单行注意事项（#11537），工具集与注解零变化；
  - **v1.51.0 同文件同断言**（同 URL ref=v1.51.0，:279 同句）——升到上游最新也不会出现 read。
- 工具注解（`ToolAnnotations::from_raw(title, read_only_hint, destructive_hint, idempotent_hint, open_world_hint)` 位置参数，v1.50 同文件）：

| 工具 | 参数形态（沙盒 RequestLog 实测 schema） | read_only_hint | 其余 |
|---|---|---|---|
| write | `{path, content}`（均必填） | **false** | destructive=true |
| edit | `{path, before, after}`（均必填） | **false** | destructive=true |
| shell | `{command}`（必填），`{timeout_secs}`（可选） | **false** | destructive=true, open_world=true |
| tree | `{path}`（必填），`{depth}`（可选） | **true** | idempotent=true |
| read_image | `{source}`（必填），`{crop}`（可选） | **false**（支持 http(s) URL，故非只读） | open_world=true |

- 全树唯一把 "read" 当能力名的地方：`agent.rs:97-105` `categorize_tool()` 把工具名 `read/view/cat/read_file` 归 `ToolCategory::Read`——**仅用于 hooks 事件**（`BeforeReadFile`，agent.rs:578-613 `emit_pre_tool_extended_hooks`），不是工具注册，与 permission 判定无关（VERIFIED-DOC，v1.46 本地树；v1.50 未逐行重核此次要面，UNVERIFIED 但不影响结论）。

### 1.2 生产请求转储（VERIFIED-RUN，2026-10-02，只读解析）

`forge/conf/goose/state/logs/llm_request.0.jsonl` 最新一条（dev 栈在用 v1.50.0 + 产品配置）：46 把工具，developer 无前缀平名 = `edit, read_image, shell, tree, write`。无 `read`。（只提取工具名结构，未引用对话内容。）

### 1.3 沙盒实调（VERIFIED-RUN，2026-10-02，部署二进制）

隔离 root + 假 provider（详见 §4 复跑路径），模型 tool_call `read{path:"data.csv"}` → goose 即时回失败：`Tool 'read' was not advertised for this model turn`（tool_call_update status=failed），全程无 `session/request_permission`。⇒ 部署二进制上 read 既不在广播工具表也无执行分支。

---

## 2. Q2：smart_approve 的档位判定 —— 有内置分级，非名单制

### 2.1 源码判定链（VERIFIED-DOC）

`crates/goose/src/permission/permission_inspector.rs`（v1.50.0 与 v1.46.0 **逐字节一致**：`tmp/g150/v150/permission_inspector.rs` diff 为空，research/23 §2.2 已档 + 本次复核）。`inspect()` :159-196，Approve/SmartApprove 模式五步：

1. `get_user_permission(tool)`（permission.yaml **`user:` 段**）命中：AlwaysAllow→放行 / NeverAllow→拒 / AskBefore→必问（:163-171）。
2. 仅 SmartApprove：`is_readonly_annotated_tool()`——工具**注解** `read_only_hint==Some(true)`（:52-64 从 `apply_tool_annotations` 收集）→ **确定性 Allow（:172-176），任何名单都不再查**。
3. `manage_extensions` 恒必问（:177-181）。
4. 仅 SmartApprove：`smart_approve:` 段缓存 ∈ {None, Some(AlwaysAllow)} → 交 **LLM judge**（:182-190 + `permission_judge.rs` `detect_read_only_requests`）：judge 判只读→本次放行（**不缓存**，下次重判）；判非只读或 judge 调用失败/模型配置缺失→必问，且**把该工具名回写 `smart_approve.ask_before`**（`cache_non_readonly_decision` :22-34）。⇒ 名单命中 AskBefore = 跳过 judge 直接必问。
5. 默认 RequireApproval（:191-194，fail-closed）。

单测锚：`smart_approve_ignores_legacy_cached_allow` / `smart_approve_cached_ask` / `smart_approve_only_caches_negative_name_wide_decisions`（:319-394）。

**LLM judge 机制**（`permission_judge.rs`，v1.50 与 v1.46 逐字节一致）：用**会话同一 provider/模型**发起独立请求，system = "You are a permission-safety classifier. …untrusted data…"，tool = `platform__tool_by_tool_permission`，要求返回 `read_only_request_ids`；任何失败返回空集（=全必问，fail-closed）。沙盒实测 judge 请求形态与源码完全一致（双侧留痕，§2.2）。

**`user:` 段权威性**（`config/permission.rs` v1.50，`tmp/g150/v150/config-permission.rs`）：`get_permission()` :134-157 段内 never→always→ask（#11477 收紧）；inspector 第①步先查 user 段，judge 缓存与注解归一化都不触碰 user 段 ⇒ `user.always_allow` 是唯一确定性、抗回写的放行位。

### 2.2 注解归一化（出厂种子 ask_before 的真实语义边界，VERIFIED-DOC + VERIFIED-RUN）

- **源码**：`config/permission.rs` v1.50 :91-107 `apply_tool_annotations()`——每个 `read_only_hint==Some(false)`（write 注解）的工具，在首个回复上下文构建时被批量写入 `smart_approve.ask_before` 并**持久化到 permission.yaml**（:109-131 `bulk_update_smart_approve_permissions`：先从 always_allow/ask_before/never_allow 三列表移除，再压入 ask_before——即 **write 注解工具的 `smart_approve.always_allow` 条目会被主动清除**）。
- **沙盒 root-B 臂**（VERIFIED-RUN 2026-10-02）：出厂种子删掉 edit/write/shell/read_image 四项后——session/new 后文件未变（归一化不在会话创建时触发）；首个 prompt（shell 调用）仍出权限卡；prompt 结束后四项**全部被自动加回** permission.yaml。⇒ 种子层"移出 ask_before"对 write 注解工具无效；goose 每会话强制注解归一。
- 顺带实证：出厂种子里 developer 四项（edit/write/shell/read_image）本就与注解归一化结果一致——**种子这几行是冗余的**（留着无害）；沙盒裸根上 `extensionmanager__manage_extensions` 也被自动加回（write 注解，尽管扩展在出厂配置被 G3 关停——归一化按"广播过的工具"生效）。

### 2.3 四臂单变量实验（VERIFIED-RUN，2026-10-02，部署二进制 v1.50.0）

设计：隔离 `GOOSE_PATH_ROOT`，config.yaml `GOOSE_MODE: smart_approve`（session/new 回报 `currentModeId=smart_approve`），permission.yaml = 出厂模板逐字拷贝，假 OpenAI 兼容 provider（127.0.0.1:18307，脚本化 tool_calls；judge 请求回 `read_only_request_ids:[]`），唯一变量 = 模型 tool_call 的工具名。结果（frames.jsonl 原始帧）：

| 臂 | 工具调用 | 权限卡 | 结果 |
|---|---|---|---|
| read | `read{path:"data.csv"}` | 0 | 失败：`Tool 'read' was not advertised for this model turn` |
| tree | `tree{path:"."}` | **0** | 完成：`data.csv  [3]`（仅名+行数，无内容）——read_only 注解确定性放行，judge 未被调用 |
| shell | `shell{command:"type data.csv"}` | **1**（title "shell · type data.csv"） | 客户端回 reject_once →「The user has declined to run this tool. DO NOT attempt to call this tool again…」 |
| judge | `load{}`（无注解、不在种子） | **1** | **judge 请求双向留痕**（provider 收到 tools=[platform__tool_by_tool_permission]、system="…permission-safety classifier…"；goose RequestLog `llm_request.2.jsonl` 同形态）→ 判非只读 → 卡 → 拒绝后 `load` 出现在回写的 `smart_approve.ask_before` 尾部 |

shell 臂出卡 = 出厂种子 ask_before 生效的直接复现（与主控给定实测一致，未重测出厂链 60s 行为）。

### 2.4 附带：shell 在 smart_approve 的行为（证据已足，未重测出厂链）

- 沙盒 shell 臂（§2.3）= ask_before 命中 → 卡（机制层）。
- 出厂链 60s 超时自动**拒**（非放行）：`forge/conf/templates/chat.tpl.html:1549-1550`（s71 G2 落地，超时兜底=reject_once）+ `chat-bridge.tpl.js:151`（桥按回包距 shown ≥60s 判超时）；拒后 agent 依提示词自主换路（chat.tpl.html:1608 活体实录注）。出厂报表任务失败链 = shell 卡 → 60s 无人 → 自动拒 →「DO NOT attempt to call this tool again」→ 模型无免卡替代读取通道 → 任务失败。与本次机制取证自洽。

---

## 3. 修法判定（主控问题直接回答）

**「让模型读工作区文件改用 read 工具」在出厂 permission 配置下是否免权限卡：否——不是权限问题，是工具不存在。**（部署版/上游 v1.46→v1.51 均无 read；hint 引导只会产生 unknown-tool 错误。）

种子层各候选评估（全部基于上文已验证机制）：

| 候选 | 判定 | 依据 |
|---|---|---|
| 种子 `smart_approve.always_allow` 加 read | 无对象（工具不存在），无意义 | §1 |
| 种子移出 shell 等 | 无效，注解归一化自动加回 | §2.2 root-B 臂 |
| `smart_approve.always_allow` 放行其他工具 | 对 write 注解工具被清除搬回 ask_before；对无注解工具仅=每次重判，不保证放行 | config/permission.rs v1.50 :91-131 |
| `user.always_allow: [shell]` | 唯一确定性放行位，但=全量 shell 免卡（含删除类命令），扩大授权面，**非最小修**，需裁决 | inspector :163-167 + user 段抗回写 |
| hints 引导用 `tree` | 免卡但只有结构（名+行数），读不了 CSV 内容 | §2.3 tree 臂 |
| **挂 read_only 注解的只读内容工具（MCP 扩展）** | **机制上成立的最小修**：第②步确定性放行、零卡、零 judge 开销、只读无破坏面；产品已有 MCP vendored 通道可承载。是否做归 PM | inspector :172-176 |

安全性附注：若未来真有 read 工具且注解 read_only=true，则**无需任何种子条目**即免卡（第②步先于一切名单）；若其无注解，则走 judge 按次判定（读文件参数大概率被判只读放行，但付 judge 开销且依赖模型判对）。⇒「把 read 加 always_allow 是否安全」这个问题本身不会出现——注解对即自动免卡，注解错才需要 user 段，而那已属裁决级。

---

## 4. 方法与边界（可审计）

- 静态：v1.46 本地树全量可查；v1.50/v1.51 关键文件 raw 双向核对（developer/mod.rs、permission_inspector.rs、permission_judge.rs、config/permission.rs；inspector/judge 与 v1.46 CR 不敏感 diff 为空，d-permission_inspector.diff 空文件复核）。
- 动态（全部在 `C:\PF-TEST\s107`，**已删净**，端口 18307 已释放，无遗留 goose 进程——按 CommandLine 含 PF-TEST 过滤核过，dev 栈进程零接触）：假 provider（node http，SSE+JSON 双形态，judge 分支）+ ACP stdio 驱动（initialize→session/new→session/prompt，应答 request_permission=reject_once），frames/provider-log/RequestLog 三侧留痕互证。复跑要点：env `GOOSE_PATH_ROOT=隔离根, GOOSE_PROVIDER=openai, GOOSE_MODEL=fake-model, OPENAI_HOST=http://127.0.0.1:<空闲口>, OPENAI_BASE_PATH=chat/completions, NO_PROXY=localhost,127.0.0.1`；config.yaml 仅 `GOOSE_MODE: smart_approve`；permission.yaml=出厂模板拷贝。
- 排除项：未动 dev 栈任何进程/端口/数据（生产转储只读解析一条请求的工具名）；未改任何产品代码/模板；沙盒 provider 无外网访问。
- 过程中两次自我纠错（防后续复踩）：①假 provider 的 marker 触发需限定 `tools.length>0`——goose 每轮会先发一个 tools=[] 的**标题命名请求**，其 user 文本复述了本轮消息，会吞掉一次性 marker；②provider 进程内 `issued` 集合是一次性的，**每次 probe 前必须重启 provider**；③grep 判定字段用 `isJudge`（大小写敏感），别用 `judge=true`。
- UNVERIFIED 残留：v1.50 的 `agent.rs` hooks 分类器（categorize_tool）未逐行重核（次要面，不影响结论）；出厂包端到端 60s 自动拒未重跑（主控给定 + 模板源码锚定，已足够）；faucet-db / playwright-mcp 侧 MCP 工具的注解情况未查（不在本题范围，但其行为可由 §2.1 链路推出：无注解=judge 按次，read_only 注解=免卡）。

## 5. 给 PM 的机制事实速览

1. 想免卡：要么工具**注解 read_only=true**（确定性、零开销），要么 `user.always_allow`（权威、抗回写、但无差别放行该工具全部调用），要么指望 judge 每次判对（有 LLM 开销、判错即卡且**负判定永久回写 ask_before**）。
2. 出厂种子 smart_approve 段 = judge 缓存语义（research/04 s19 已档），goose 会持续回写：write 注解工具自动进 ask_before、judge 负判定自动进 ask_before。种子不是策略表达层，**策略要么写 user 段、要么改工具注解**。
3. 无注解工具（如 summon 的 load/delegate、多数 MCP 工具）在 smart_approve 下每次调用都触发一次 judge LLM 请求（同模型）；被拒/判非只读一次后即入 ask_before 不再 judge——对无人值守任务=永久卡。
