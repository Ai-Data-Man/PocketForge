# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-08-20 会话 s02（P7-P9 完成）
- 阶段：首版闭环 ✅ + P7 记忆 ✅ + P8 可靠性 ✅ + P9 二开评估 ✅（结论：零 fork）

## 阶段总览（第二周期）
| 阶段 | 内容 | 状态 |
|---|---|---|
| P7 | 记忆四层架构（goosehints/memory+junction/chatrecall/session） | ✅ ADR-0005 |
| P8 | schedule 常驻验证、卸载干净度（卸载清理.cmd） | ✅ journal s03 |
| P9 | 二开评估：全缺陷过筛 → 零 fork，运行时对冲 | ✅ ADR-0006 |

## 当前正在进行
- 无。等待真实目标机轮次。

## 已确立决策（累计）
- ADR-0001 记忆拓扑 / 0002 技术栈 / 0003 交付树+注册协议 / 0004 E2E 修订 / 0005 记忆架构 / 0006 fork 策略。

## 开放问题 / 风险
1. 目标机验证未做（EDR、Edge 版本、真实 PLM IE-mode、9router 不可达时的 LLM key）——下一优先级。
2. chatrecall 中文召回质量：LIKE 关键词级，待真实使用反馈（ADR-0005 复核条件）。
3. goose Desktop 仍未验证（图形界面需求出现时再测）。
4. 备份自动化未做（手工拷 data/ 即可；自动化留观察）。
5. goose memory 便携缺陷宜提上游 issue（低成本互动，待做）。

## 环境事实（开发机）
- 同前；当前栈端口可能漂移（pc.port/faucet.port 动态探测，读 data/*.port）。

## 交付物验收线
- 首版六条全部 ✅（见 ADR-0004 与 journal s01e）；新增：记忆便携 ✅、调度 ✅、卸载干净度 ✅（唯一系统足迹 = AppData junction，卸载清理.cmd 可删）。
