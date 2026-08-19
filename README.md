# PocketForge

为 Windows 企业零权限环境打造的「Agent 友好最小基础设施 + 门面层 + 通用数字员工」。
一次解压、一次双击，非技术用户用自然语言指挥常驻数字员工：浏览封闭系统取数 → 入库 → 自行开发数据应用 → 自管自愈。

- 新会话入口：[AGENTS.md](AGENTS.md)（工作契约）→ [STATE.md](STATE.md)（现在）
- 记忆架构说明：[docs/memory-map.md](docs/memory-map.md)
- 决策记录：[DECISIONS/](DECISIONS/README.md)　事实底稿：[docs/research/](docs/research/README.md)
- 产品运行时树：[forge/](forge/)（交付打包只取此树 + 许可证文本）

## 硬约束（架构边界，全仓适用）
1. 目标机无本地管理员权限：一切组件解压即用，禁止 installer。
2. 无 Docker / WSL2 / Hyper-V。
3. 便携文件夹交付，"一次双击启动成功"。
4. 零系统污染：不写注册表/PATH/服务/计划任务；删文件夹即卸载；过 EDR 审计。
5. 许可证白名单：MIT / Apache-2.0 / 公有领域。
6. 封闭系统（如 PLM）无 API → 只走浏览器自动化。
7. 不预设业务场景。
8. 设施细节对 Agent 透明；Agent 运行时禁止自研（选型见 DECISIONS/）。
