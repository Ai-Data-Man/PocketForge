# ADR-0009: 自动升级系统与状态 Schema 演进

- 状态：Accepted
- 日期：2026-08-26
- 关联：ADR-0007/0008；docs/research/08-auto-update.md；journal s16；仓库契约 §2 硬约束

## 背景 / 约束
交付形态 = 便携文件夹。升级的本质：替换代码部分、毫发不伤用户状态部分（data/ 全部内容）。硬约束：零安装/零污染/无管理员 → 排除 Squirrel/Omaha/ClickOnce/electron-updater/winget shim 等"安装器家族"；借用 VS Code 的"数据与代码物理分离 + 失败保持旧版可用"范式。

## 决定
1. **版本真相源** = `forge/VERSION`，package.sh 打包时写入 `git describe`；运行时读入内存，前端弃用硬编码版本号。
2. **编排** = 自研 detached 升级器 `bin/update-runner.js`（无合身现成件，见 research/08）。流程：定位包（GitHub release 或 data/updates/ 离线暂存）→ 官方 .sha256 校验 → 解压到受保护路径之外（`.pf-update-unpack`，曾因解压进 data/ 被 walkMap 跳过而全文件 0 应用）→ 停栈（pc shutdown 后按端口 8790 强杀残余桥——实测 pc 偶尔遗留监听进程）→ 逐文件 sha256 差量应用（备份被替换/删除文件至 data/updates/backup-<ts> 并写 manifest）→ 重启 → **版本感知健康检查**（/api/update/status 必须返回目标 VERSION，仅 200 不算数——回滚演练中老桥 200 差点误判成功）→ 失败自动回滚代码+清除新增文件。
3. **状态 Schema 演进**（用户裁决补强）：自有状态文件内嵌 `_schema: N`；桥启动时在服务任何请求前跑迁移管线（注册表=文件名→latest+steps，顺序幂等，迁移前留档 `.pre-migration-<ts>`）；遇 `_schema` 比代码新=降级场景，拒碰原文件并向 UI 报 warning。
4. 开发纪律（契约级）：**改任何状态 schema = 同一提交内 +1 版本号、+迁移步骤函数、+自测**；无迁移的变更视为破坏性提交。
5. 边界：sessions.db / schedule.json / faucet 数据归 goose/faucet 自管自迁移，永不手改。providers v1→v2 与 artifacts v3 两个历史迁移保留原位，新演进一律走注册表。

## 后果
依赖面零新增（python zipfile 随包）；升级应用阶段全量哈希约 35K 文件需数分钟（已加心跳进度）；厂商许可证文本入库 forge/vendor-licenses/（离线打包可用）。exit 成本低：升级器是单文件纯 node。

## 复核条件
- 企业 EDR 对"下载+自我替换+外联 GitHub"报警 → 关闭在线通道只留离线（已内置）
- 需要对抗更强供应链威胁 → 引 TUF/Uptane 元数据框架（需建仓库侧设施）
- 包体涨到下载痛苦 → 做差量包/按组件分包
