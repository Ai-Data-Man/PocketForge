# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-08-20 会话 s01 收官
- 阶段：P0 ✅ P1 ✅ P2 ✅ P3 ✅ P4 ✅ P5 ✅ P6 ✅（首版闭环完成）

## 阶段总览
| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 信息架构/记忆拓扑 | ✅ ADR-0001 |
| P1 | 四路开源深查 | ✅ research/01-05 |
| P2 | 本机验证（含浏览器栈反转→playwright-mcp） | ✅ runbooks/p2-verification-log.md |
| P3 | 设计 | ✅ ADR-0002/0003 + architecture/overview.md |
| P4 | forge/ 产品树 + 启动器 | ✅ journal s01d |
| P5 | fake PLM 端到端 | ✅ ADR-0004（协议修订） |
| P6 | 便携打包 | ✅ dist/PocketForge-20260820-6628496.zip (174MB, sha256 3a27fedf…) |

## 当前正在进行
- 无（首版闭环完成，等真实目标机验证轮）。

## 已确立决策
- ADR-0001 记忆拓扑；ADR-0002 技术栈五件套；ADR-0003 交付树+注册协议；ADR-0004 E2E 修订（raw_sql 置位 + apps 聚合）。
- 技术栈（全 VERIFIED-RUN）：process-compose v1.122.0 / nats-server v2.14.5 + cli v0.4.0 / faucet v0.1.12 / goose v1.46.0（GOOSE_PATH_ROOT）/ @playwright/mcp + 便携 node v22.21.1 + 系统 Edge / 弃用：browser-use（Edge 死锁，WATCH）、便携 python（随包剔除，仅开发机留存）。

## 开放问题 / 风险（下一会话优先）
1. **目标机验证未做**（最关键）：妻子电脑上 EDR 对未签名 exe、Edge 版本、真实 PLM 是否 IE-mode/ActiveX（若是→浏览器自动化不可用，需人工兜底方案）。
2. LLM 端点：交付包 data/secrets.env 需填真实 key（当前指向开发机 9router）。goose 模型名必须 `provider/model` 形式。
3. goose Desktop 未验证（若妻子要图形界面，验证其 GOOSE_PATH_ROOT 收敛 + electron-updater 禁用）。
4. faucet 0.x 早熟：锁 v0.1.12；停更>6月或 CVE → 按 ADR-0002 换 PocketBase。
5. 8 条硬约束审计：注册表/PATH/服务/计划任务零写入已由设计保证并本机验证（AppData 唯一残留是 goose 首启空日志文件，已复测可消失）；EDR 场景只能现场验。
6. `.goosehints` 尚未实测被 goose 读取（建议下轮在交互 session 里确认 agent 知道注册协议）。
7. 备份策略未做（data/ 手工拷贝即可用；自动化留 P7）。

## 环境事实（开发机）
- Windows Server 2022，代理 127.0.0.1:7890（github 可达），9router http://127.0.0.1:20128/v1（模型 myopencode/glm-5.2，goose 可用）。
- 组件 sha256：tools/checksums.txt；下载 manifest：tools/components.yaml。

## 交付物验收线核对（P6）
1. 解压即用 ✅（E2E 中模拟全新启动路径）；双击启动 ✅；零系统污染 ✅（设计+本机核验，目标机待验）。
2. 妻子自然语言完成抓取→入库→建应用→重启回来 ✅（E2E 用 goose headless 等价验证；真人交互待目标机）。
3. 许可证白名单 ✅（7 份文本随包：Apache-2.0×4 / MIT×3）。
