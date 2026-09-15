# 2026-09-14/15 s88 团队会话：应用运行面板 + §8 安装矩阵 + v0.9.13 终包

用户两主线：①应用管理功能理解错误（真用途=展示小forge自建数据应用的地址/运行状态）②严格压缩包安装/升级安装测试，全部功能复测不留异常。窗口 2026-09-14 21:56 → 09-15 05:50。主控调度 9 个子智能体批次（PM×1/engineer×4/QA×2/researcher×1 + 微型批），全部 commit+push origin。

## 批次流水

| 批 | 内容 | 产出 |
|---|---|---|
| 1a pm | 主线1 归约→裁决 | docs/verdicts/2026-09-14-app-runtime-panel.md（34f3709）：⚙️ 第 7 tab「🚀 小应用」= apps/*.yaml × pc 状态只读观察面；建账=agent 义务（forge-meta 注释行）；启停/日志/编辑全裁；PROTECTED += apps/ 同批强制；s83 勘误（「应用」折叠为产出物、漏 ADR-0003 运行模型=用户说「理解错误」的根源） |
| 1b eng | s85 审计 P1-P7 落地 | chcp 65001 成套 + 模板 %~dp0 纯 ASCII + P3 预检（base64 中文提示）+ P4 junction 守卫 + P6 模型名四处 + P7 文档串 + package.sh SKIP(tmp/dev-stack-up/apps) + PROTECTED apps/（f0c0e40..3166fd0）；自愈两事故：cmd if 块中文 echo 切烂、heredoc 吃转义层（教训 #28） |
| 2 eng | 应用运行面板 S1-S5 | hints 协议第 5 条建账+模板占位（5f7f0f3）；桥 GET /api/apps +171 行自研 YAML 行级解析器零新依赖（7f7b95d）；前端第 7 tab 唯一动作「打开看看」；apps-probe 44ck 入 e2e §23（0feb6e8）；真会话活体 agent 无提示自发落账（51a8960）；教训 #29（pc project update 缺 env=crash-loop） |
| 3 qa | 两批复审 | tmp/s88-qa-review.md（62403df）：两批通过；P2-1 probeUrl scheme 白名单不对称→微型批一行修（48d36e6）；补 apps-fuzz 21 asserts（fuzz 187→189）；三基线 59/59+189/189+13/13；假9router 勘误（STATE 已同步） |
| 4a 主控 | 打包 v0.9.13 | 一建包抓到 SKIP 文件级匹配缺陷（目录级漏 conf/dev-stack-up.ps1，工程干跑自证 oracle）→ 文件级比对补门（4f651c5）重建；审计：17 文本变/零 exe/零泄漏 |
| 4b qa | §8 安装矩阵 | runbook docs/runbooks/2026-09-15-s88-install-matrix.md（31a0d40）：冷装 A1-A7 + 升级装 B1-B5；**四红实测**——R1 聚合器粘行让协议形态 app 下次启动整栈 FTL、R2 模板教双引号 ${FORGE_ROOT} 转义错、R3 栈内升级 runner 随停栈死（status 永卡）、R4 v0.9.12 存量升级删 apps/（旧 runner 无保护）；A5 真模型轮=上游 502 黑洞环境红 |
| 4c eng | 四红修复 | R1 双聚合器另起行+e2e 钉子（9ee63ea）；R2 单引号化（6a6f496）；Y1 PW 种子（365b37c）；R3 四臂取证定案 pc down 按 PPID 收杀→Start-Process 中介 spawn+完整升级循环演练 done=True（33f0209）；R4 备份集补 apps/（缓解）；journal s89（161d569） |
| 4d 主控 | 终包+发布门 | 重建终版包 799dfd44…（323,567,788B/25,298 文件）；发布门=终版包冷装冒烟：协议形态 app（forge-meta 首行+单引号）装配→面板 run+url+listenPorts→落真实页→**重启持久**全绿（A6 红格全链转绿）；期间主控自踩 #29 同坑一次（project update 缺 env），launcher 全 env 重启自愈——教训复证 |
| 支线 | 产品方向调研 | docs/research/2026-09-14-product-direction-scan.md（28af056）：goose 上游零动作/Manus 正交/OpenClaw WATCH 维持；U1/U2 首推项与主线修复重合（方向互证）；产出 U4/T3 六计数/卡点关键词规格改写已 backlog 化（370c21b） |

## 环境事件（主控处置）

- PFdrill2 wrapper（drill-devrel-wrap.cmd）内容损坏（`\f` 被转义吃成 `PocketForgeorge`+`\u542f` 字面量）→ 按工作样板字节级等长替换修复（GBK+CRLF）——与 #28 heredoc 家族同根。
- dev 栈停/起四次（矩阵让位/恢复/终验让位/恢复），PFdrill2 僵尸态两次均按 s80 补丁（/End→/Run）恢复；新启动器（chcp+P3 预检）经计划任务真实路径首证。

## 终态

- **v0.9.13 终包就绪**（发布时机归用户）：dist/PocketForge-20260915-v0.9.13.zip sha256 799dfd44…；发布草稿 docs/v0.9.13-release-notes-draft.md（含 R4 存量升级手动备份步骤+s89 修复段）。
- 基线：fuzz 189/189 + appcap 13/13 恒定；e2e-chat 58/59（唯一红=sid-reuse-rescue 依赖 LLM 连通，本窗上游黑洞，上游恢复后复验——代码面无涉，§4-5 协议形态重放 3/3 绿补位）。
- dev 栈 8 进程健康（PFdrill2 承载）；沙盒零残留；工作树净。

## 遗留

1. 上游模型恢复后：e2e-chat 全量复验 59/59 + e2e.sh 整跑（s89 已抽段重放绿）。
2. A5 真模型 GUI 等价链路沙盒复验（本窗上游黑洞降级；dev 侧活体 7/9 已证建账，2 红均为探针环境）。
3. v0.9.13 发布（tag/release 归用户拍板；发版时按惯例重建+发布门复跑）。
4. QA 留档建议级：appsOverview 单飞合并（a7890ad 先例）/BOM·深缩进 yaml 降级精度——不立项。

## 会话后补：deepseek 官方故障换线 mimo-v2.5 + 基线全绿（2026-09-15 晨，用户确认官方站也无法聊天）

- 事件：上游 completions 黑洞根因=deepseek 官方故障（用户确认官网同样无法聊天；/v1/models 109 模型照常=列表与推理分离）。s88 A5/s89 58/59 的"环境红"归因就此定案。
- 换线（dev）：forge-router.json 池置顶 mimo-v2.5（deepseek-v4.1-flash 留池备回切）+ secrets GOOSE_MODEL_NAME=mimo-v2.5 + pc restart chat-bridge；直连探测 200 正常出话。
- 补考：e2e-chat 首跑仍 58/59（§18 红，原始日志被 rm -f 吞证）；**修 §18 红时留证**（s81 §11b 同款漏洞补齐）后整卷重跑 **59/59 EXIT=0**（§18 救援路径 TEXT="收到" 实录；首跑红=换线后桥冷态瞬态）。终态基线 **e2e-chat 59/59 + fuzz 189/189 + appcap 13/13** 全绿。
- 出厂默认模型决策点（归用户）：v0.9.13 包出厂默认=deepseek-v4.1-flash（P6）。官方故障是临时事件且新用户撞死模型有健康告警+换线引导兜底（§8 矩阵 B2 实测该路径可用）——主控建议 v0.9.13 不改、维持现包；若要出厂默认改 mimo-v2.5 需重打包+重过发布门。

## 会话后补 2：用户试玩包（2026-09-15 晨，用户点名「出个包我自己点一点」）

- 出厂默认模型换 **mimo-v2.5**（bootstrap 种子×2/config/tpl 四处，池留 v4.1-flash 备官方恢复后切回；commit 45735c2）；重打包 **dist/PocketForge-20260915-v0.9.13.zip sha256 68ec9823…**（前指纹 799dfd44 作废——发版时以重建为准）。
- 出厂验证副本（C:\PF-VERIFY，已清）：冷启 healthz 200、config.yaml 物化 GOOSE_MODEL=mimo-v2.5、/api/apps 出厂空态、真会话出厂默认直通回复「收到」。
- 环境实录：桥固定 8790+单实例去重（s27）——dev 栈在跑时第二实例桥按设计退出；nats 8222 监控口无动态化（pc down 后 TIME_WAIT 窗内重启撞 FTL，观察项）；pc「Terminating 70s」卡态 stop→restart 恢复。用户试玩前 dev 栈已全停。
- **用户试玩树就绪：C:\PocketForge**（v0.9.13/mimo 出厂/key 预配免引导条/纯 ASCII 路径），等用户双击「启动数字员工.cmd」实测。

## 会话后补 3：用户实测反馈两修（2026-09-15 上午，用户双击试玩实录）

用户反馈：①黑窗口 `数据库存储：没连上数据库…已用本地文件保存` ②faucet healthz 日志被动刷屏很快。

**①根因（VERIFIED-RUN）**：用户机器上双击=**高完整性令牌**启动（内置 Administrator 账户：实测本会话 shell 的 whoami /groups 就是 High——该账户 UAC 过滤不生效），PostgreSQL 拒绝以管理员权限运行（pg.log 原句 `Execution of PostgreSQL by a user with administrative permissions is not permitted`）→ pg crash-loop → 桥按设计降级 file 态（文案即此）。与路径/包无关，是"管理员双击"场景的产品缺陷。**修复=启动器 s90 段**：whoami /groups 查 S-1-16-12288 完整性 SID（PowerShell .Groups **不**暴露完整性 SID——两上下文对照实测，两版检测法皆空集合）→ HIGH 时打印人话（base64 EncodedCommand 通道，沿用 P3 先例）并 `runas /trustlevel:0x20000 "%~f0 relaunched"` 自动降权重启；标记参数必须在引号对内（`"path" arg` 形态参数被静默吞——单变量实测）。**端到端实证**：本 shell（HIGH）经 wrapper 启动用户树 → 提示正确 → 子窗降权 → 30-45s 后 bridge 200/faucet 200/postgres 进程在 → `/api/db/overview` 200。
**②根因（VERIFIED-RUN）**：faucet readiness 用 `http_get /healthz`，pc 每 5s 探一次，faucet 每次记一行 access 日志 → 黑窗口刷屏。**修复**：探针换 TCP（复用 pg-probe.js，传 faucet.port）——裸 TCP 连接实测零 access 日志（27→27 行），pg 同款先例 s66 已在用。实证：修复后实例 pc 日志 30s 增量 0 字节、healthz 行数 0。
**遗留观察**：桥侧 `/api/db/overview` 的 PG 态在降权实例上正常；`fsutil`/`icacls` 未涉。
