# 08 自动升级方案调研（P30 / ADR-0009）

更新：2026-08-26。结论服务于 ADR-0009。

## 更新编排层：现成件全不合身

| 方案 | 许可证 | 形态 | 否决理由 |
|---|---|---|---|
| Squirrel.Windows | MIT | 安装器框架 | 建快捷方式/卸载项/系统位置，违反零污染红线（§2.4） |
| Omaha (Google) | Apache-2.0 | 更新器+安装器 | 同上，且面向已安装应用 |
| ClickOnce | 专有(Windows 内置) | 部署技术 | 要求部署服务器+安装语义，违反便携性 |
| electron-updater | MIT | npm 库 | 硬绑 Electron 运行时 |
| WinGet portable | MIT(客户端) | 包管理器 | 写 PATH shim 到用户目录=轻度污染；强制改打包格式 |
| PortableApps Platform | GPL/专有混合 | 启动平台 | GPL 触线 + 强制目录规范重排 |

根因：我们是"免安装便携文件夹 + 自管进程栈"形态,主流更新器的默认假设（有安装器/有系统权限/绑定特定运行时）全部不成立。→ 自研 detached 薄壳升级器(~300 行纯 node),吸收 VS Code 的"数据代码分离+失败保持旧版可用"范式。

## Schema 演进：成熟的是模式而非库

umzug/migrate/db-migrate 等 JSON 适配全部面向数据库；JSON 配置文件演进无事实标准包。采纳模式 = Rails/Django 迁移思想的配置文件版：**版本戳(_schema) + 注册表顺序幂等步骤 + 仅前进 + 迁移前留档 .pre-migration-* + 降级拒碰**。仓库已有先例(providers v1→v2 内联、artifacts .migrated-v3 标记),统一成 ~40 行注册表框架。

## 实测验证记录（VERIFIED-RUN 2026-08-26）

- 正向升级 v0.9.0-test → v0.9.1-new（273MB 包,17598 文件;差量 = 2 改 8 增 6 删;栈自动回来 healthz ok）
- 回滚演练 v0.9.2-broken（埋雷 throw）: apply 后版本感知健康检查判败 → 自动回滚 → VERSION 还原 → 栈恢复
- 过程中修掉的坑:
  1) 解压目录曾在 data/updates/unpack（受保护路径）→ walkMap 全跳过,0 文件应用——移到 forge 旁 .pf-update-unpack
  2) pc shutdown 偶尔遗留 8790 监听进程 → 新桥 EADDRINUSE 起不来而 healthz 探到老桥误判成功 → stopStack 按端口强杀 + healthz 校验目标 VERSION
  3) execFileSync 未引入/隐式全局 lastErr —— node --check 能抓前者抓不了后者
  4) 全量哈希 35K 文件需数分钟,加每 2000 文件心跳进度
- 教训:bash heredoc 写含 `\n` 的补丁会被转义层吃掉 → 反斜杠场景一律用 python 定位锚点切片替换

## GitHub 发布流程（用户侧）

`tools/package.sh` 产出 `PocketForge-<date>-<ver>.zip` + `.sha256`；GitHub release tag 形如 `v1.2.3`,两资产原名上传即被识别。企业网不通 GitHub 时走设置面板「离线升级」（zip 流式落 data/updates/ 再启动同一升级器）。data/update.json 可配 repo 与可选 http 代理。
