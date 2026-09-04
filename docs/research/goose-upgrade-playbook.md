# goose 升级预案（沙盒四步流程；2026-09-05 重建版）

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
3. **审批卡**：smart_approve 模式跑一个 browser 工具任务，验证 permission.yaml 前缀名命中（#10285 后行为可能变化，s19 遗留 UNVERIFIED 项顺路关闭）+ 拒绝路径 fail-closed（#11477）。
4. **MCP 商店**：装一个商店项→重启→挂载→goose 调用成功→卸载（s54/s57 链路）。
5. **真实任务**：GOOSE_PATH_ROOT 下跑一个真实任务（读文件+生成 xlsx），确认 agent 适应 #11537 单行 cmd 约束（多行命令被拒不再静默截断）。

### 第 4 步：收尾
- 全部 PASS → commit components.yaml/fetch.sh/checksums.txt（message 引用 research/04 与本预案）；STATE 版本表回写；dev 栈换新二进制重跑 e2e 33/33 + fuzz 44/44。
- 任一面 FAIL → 回滚沙盒二进制，commit 停在下载层或整体回滚；失败面取证（pf-researcher）后重评目标版本。
- 沙盒清理：`停止数字员工.cmd` 后删沙盒目录（零污染自证顺带完成）。

## 变更成本护栏
- 不在升级窗口顺带做任何其他改动（单变量隔离）。
- 每面回归的证据（截图/命令输出）贴 journal，不凭记忆写 PASS。
