# research 底稿规范

每个开源项目/方案一份底稿，命名 `NN-<slug>.md`。格式：

```markdown
# <项目名>（repo 坐标）
- 结论：ADOPT | REJECT | BACKUP（备选） | WATCH（观察）
- 一句话用途：
- 许可证：<SPDX>（来源 URL，核对日期；引用关键条文）
- Windows/便携性：发布资产名 / 依赖 / 是否需 installer
- 版本与活跃度：最新 release + 日期；commit 频率
- 验证状态：UNVERIFIED | VERIFIED-DOC(<日期>) | VERIFIED-RUN(<日期, 版本, 命令>)
- 对本项目的关键事实/风险：
```

规则：一条事实一个来源；引官方源（repo/LICENSE/releases/docs），不引营销页；本机复现结果单独标 VERIFIED-RUN 并写明命令。
