# PocketForge 状态（永远反映"现在"；每次工作会话结束必须更新）

- 更新：2026-08-24（s13：P28 聊天客户端大修——崩溃修复/工作区层/版本管理/工具解释）
- 阶段：**P0–P28 全部完成**，产品可交付状态

## 已完成周期
| 周期 | 内容 | journal |
|---|---|---|
| P0–P6 (s01) | 信息架构→四路调查→本机验证→设计→实现→E2E→打包 | s01 |
| P7–P9 (s02/s03) | 记忆四层架构 / schedule / 卸载脚本 / fork策略(零fork) | s02,s03 |
| P10 (s04) | 目标机场景模拟 E2E（全新解压+公网LLM+妻子任务链） | s04 |
| P11 (s05) | skill自进化(agentskills.io规范)+启动备份+沟通规范+welcome | s05 |
| P12 (s06) | ACP桥聊天客户端v1（Web壳+Edge--app窗口） | s06 |
| P13–P15 (s06/s07) | 对标Codex/ZCode补齐+体验修复轮 | s06,s07 |
| P16–P17 (s08) | 多provider/model体系重构+fork策略确认(零fork) | s08 |
| P18–P20 (s09/s10) | 内置浏览器自测+下拉裁剪修复+断电恢复+场景E2E回归 | s09,s10 |
| P21 (s09) | 视觉辅助体系(glm-5.2+tools/vision.js+see-image技能) | s09 |
| P22/P23 (s11) | 真删除会话+制品体系(preview/open-local/vendor库)+斜杠命令+MD气泡渲染 | s11 |
| P24 (s11) | agent端到端制品闭环(agent自主写零依赖xlsx生成器→工具化) | s11 |
| P25 (s12) | 侧栏文件树+上传+@引用+复制剪贴板+子目录支持 | s12 |
| P26/P27 (s12) | 聊天客户端全量迭代（MD渲染/真删除/右栏工作区/@自动补全；注：外链junction当时只做了前端，后端P28b补齐） | s12 |
| P28 (s13) | 致命崩溃修复(up-btn null杀掉connect)+防崩结构；每会话制品工作区(ws-*+workspace-map+引入机制+v3迁移)；isomorphic-git版本管理(CLI+/api/vcs/*+🕘时间线+一键恢复)；slash中英模糊匹配+技能并入+Enter执行；工具卡"这是干啥"当前模型大白话解释；停止=发送旁按钮(/停止移除)；@菜单定位锚点修复 | s13 |

## 技术栈版本（全部 VERIFIED-RUN）
process-compose v1.122.0 / nats-server v2.14.5 / nats-cli v0.4.0 / faucet v0.1.12 / goose v1.46.0 (AAIF) / node v22.21.1 / python 3.12 embeddable (openpyxl/Pillow) / isomorphic-git 1.41.9 (vendored MIT, ADR-0007)

## 关键决策索引
ADR-0001 记忆拓扑 / ADR-0002 五件套技术栈 / ADR-0003 交付树+注册协议 / ADR-0004 E2E修订(rawsql oneshot+apps聚合) / ADR-0005 记忆四层架构 / ADR-0006 fork策略(默认不二开) / ADR-0007 制品工作区(每会话一区+isomorphic-git)

## 开放问题 / 风险
1. 真实公司机差异（EDR、真实 PLM IE-mode）——待真机
2. chat-bridge :8790 无冲突探测
3. 权限请求 UI 为简化版（自动批第一项）
4. 新对话模型回落服务商默认（goose 会话语义）
5. welcome 页在无默认浏览器关联的极端机器上不弹
6. 工作区目录名 = ws-时间戳，与对话标题无联动（后续可加 meta 标题）

## 交付物验收线（全 ✅）
解压即用 / 双击启动 / 零系统污染 / 自然语言取数入库做应用 / 重启回来 / 干净卸载 / 记忆便携 / 调度 / 视觉辅助 / 制品预览+本机打开 / 斜杠命令 / 文件树+上传+@引用 / 每会话工作区+版本管理+一键恢复 / 工具调用大白话解释
