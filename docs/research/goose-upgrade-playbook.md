# goose 升级预案（沙盒四步流程；2026-09-05 重建版，s76c 对齐）

> 背景：research/04-goose.md 曾引用本文档但文件从未落档（s64 勘误）。本版依据 tools/fetch.sh 现行机制 + s47/s53 沙盒冒烟流程 + research/04 s64 情报回归五面清单重建。升级目标与时机裁决见 research/04 s64 节（等 v1.50 或退 v1.48.0；不追 v1.49.0）。

## 前置（升级窗口开工时先核对）
1. `research/04` s64 节：确认目标版本（v1.50 若已发且含 #11383；否则 v1.48.0）与回归五面清单。
2. `STATE.md` 技术栈版本表：记录在用版本（当前 goose v1.46.0），升级后回写。
3. dev 栈健康：bridge 200、pc processes 全 Ready（升级验证要与 dev 环境隔离，见步骤 2）。

## 四步流程

### 第 1 步：下载与入库（开发机）
- `tools/components.yaml`：goose-cli 条目 version/url 改为目标版本（repo `aaif-goose/goose`，asset `goose-x86_64-pc-windows-msvc.zip`）。
- `tools/fetch.sh`：同步改 goose 下载 URL（当前 :31）；跑 `bash tools/fetch.sh` 走 127.0.0.1:7890 代理下载——**注意 fetch.sh 会整树重拉**，若只想换 goose 先与主控确认是否全量重跑（checksums.txt 会随之更新）。
- 核对 `tools/checksums.txt` 新增条目与 `forge/vendor-licenses/` 的 LICENSE 仍为 Apache-2.0。
- **不提交**——先走完沙盒验证再 commit（版本号变更属于破坏面，见仓库 §3.5 精神：栈版本 = 状态）。

### 第 2 步：沙盒隔离验证（C:\PocketForge-Test，不碰 dev 栈）
1. 用当前 HEAD 打包（`tools/package.sh`，VER 用测试标记或当前 VERSION）→ 解压到沙盒全新目录。
2. 手动替换沙盒内 `forge/bin/goose/` 为新版二进制（模拟"用户升级"最小面；正式用户升级走 ADR-0009 自动升级器，另测）。
3. 沙盒拉起（`启动数字员工.cmd`），核对 GOOSE_PATH_ROOT 收敛（`conf/goose/` 下出现 data/config，无 %APPDATA%\Block\goose 新增）+ GOOSE_DISABLE_KEYRING（secrets 落 conf/goose/secrets.yaml，无 Windows 凭据管理器写入）。

### 第 3 步：回归五面（s64 清单，逐面留痕）
1. **调度闭环**（s55-58）：建定时任务→⏸暂停→查 schedule.json paused 落盘→▶恢复→pc restart goose-scheduler 守护重载→UI 复原；再删任务确认守护盲区补丁（s58）生效。
2. **会话回放与错误流**：打开一个长会话验证 session/load 回放完整（s15 endStream 补发面，#11159 触碰过）；造一次 401（错 key）验证人话指引与「换备用线路再试」（s50e 链路，#11202 触碰错误文案流）。
3. **审批卡**：smart_approve 模式跑一个 browser 工具任务，验证 permission.yaml 前缀名命中 + 拒绝路径 fail-closed。G6 两条（v1.48 起的上游行为变化）**必须复验**，任一失配 = 升级回滚面：①#11477「denial 优先」——never_allow（含 `browser__browser_run_code_unsafe`）仍被机制拒绝，且不被任何 allow 项覆盖；②#10285 工具名规范化——permission.yaml 前缀名（`browser__*`/`faucet-db__*`）逐项核对命中，G1/G5 审批清单升级后静默失配是真实回归面（s19 遗留 UNVERIFIED 项顺路关闭）。
4. **MCP 商店**：装一个商店项→重启→挂载→goose 调用成功→卸载（s54/s57 链路）。
5. **真实任务**：GOOSE_PATH_ROOT 下跑一个真实任务（读文件+生成 xlsx），确认 agent 适应 #11537 单行 cmd 约束（多行命令被拒不再静默截断）。
6. **生产转储巡检**（T2；方法 = research/12 §2.1）：升级后跑一次最小会话（prompt 只求「回复ok」控 token），读 `conf/goose/state/logs/llm_request.*.jsonl`（恒开轮换 10 份；取 mtime 最新的带 tools 请求，0 号可能是标题生成请求）核对模型实际看到什么：system prompt 的 Extensions 段（apps/summon/extensionmanager/analyze 应缺席——G3 否定块仍生效）、工具清单数量与名字（S-B 后基线 47）、Global Hints（手册）在而 Project Hints 段为空（CONTEXT_FILE_NAMES 仍生效）。装新 MCP 后当场再巡检一次。
7. **G7 上游观察项**（升级窗口重评，不阻塞 PASS/FAIL 判定）：RepetitionInspector 注册 `new(None)` 无重复上限、SecurityScanner `SECURITY_PROMPT_ENABLED` 默认关——产品侧均无配置键，当前没有熔断/扫描在役；v1.50 核对上游是否新增配置化开关，顺带评估开启后内网浏览器场景误报率。核实点行号出自 v1.46.0（agent.rs:748、security/mod.rs:65-73），新版须重对。
8. **会话号语义与救援面**（s76 新增，research/18 补记）：新版 session_manager 的「当日 MAX+1」编号语义若变（前缀/tombstone），桥端救援路径的触发面前提要重对；**goose 对 closed/不存在 sid 的 prompt 错误措辞若引入差异化 closed 文案**（v1.46.0 仅 resource_not_found+"Session not found" 单源），该类场景将从救援面掉出——仍非静默（人话错误），但 e2e 第 18 节断言的救援路径要复验。
9. **permission.yaml 升级语义**（s76c 新增）：运行时副本已 PROTECTED（update-runner 精确条目），升级应零触碰——升级实录里核对升级前后 permission.yaml 逐字节不变（含 goose 学习性 ask_before 条目存活）；新装面=bootstrap 1b-7 种子（copy-if-missing+空文件守卫）。若上游改 permission.yaml 结构（三键 panic 家族），种子模板 conf/templates/permission.tpl.yaml 与 1b-7 守卫同步修。
10. **messages 表与会话手术面**（s77 新增，撤回重写补篇 docs/verdicts/2026-09-08-message-rewrite-addendum.md §6）：升级后必须复核 messages 表 DDL（列名/秒级 created_timestamp/自增 id 语义）、get_conversation 排序谓词与 content_json 严格解析、load 对 closed/空会话语义——桥 rollback_rewrite 的 B 型谓词 `(created_timestamp,id)>=边界` 与七步手术协议锚定这些行为（全锚 v1.46.0）。**过门方法=research/21 实验矩阵 CTL/B/RB/NEG 四项在目标版本沙盒复跑全绿**（基建 tmp/pfr21 可复跑，fake provider 离线确定性）。**形态级风险（唯一）**：若上游把 session/fork 的 conversationBefore meta 放行（v1.46 被 schema 校验层剥离）→ 官方截断通道出现但形态=分叉新会话（sid 换号）≠ 原地回滚 → 撤回重写交互形态重开归约（补篇 §6-3），其余安全设计仍适用。

### 第 4 步：收尾
- 全部 PASS → commit components.yaml/fetch.sh/checksums.txt（message 引用 research/04 与本预案）；STATE 版本表回写；dev 栈换新二进制重跑全量回归（当前基线 e2e-chat 53/53 + fuzz 150/150，以 STATE 终态行为准）。
- 任一面 FAIL → 回滚沙盒二进制，commit 停在下载层或整体回滚；失败面取证（pf-researcher）后重评目标版本。
- 沙盒清理：`停止数字员工.cmd` 后删沙盒目录（零污染自证顺带完成）。

## 变更成本护栏
- 不在升级窗口顺带做任何其他改动（单变量隔离）。
- 每面回归的证据（截图/命令输出）贴 journal，不凭记忆写 PASS。
