# tools/ — 开发侧工具（不入交付包）

职责：
- `fetch`：按 manifest 下载 pinned 版本组件到 `forge/bin/`（走代理可选），记录 sha256。
- `package`：把 `forge/` + 许可证文本打成便携 zip（交付物）。
- `e2e`：端到端测试（fake PLM 起服务 → 启动 forge → agent 任务断言）。
- 环境探针：目标机/开发机能力清点（Edge、WebView2、VC runtime、端口占用）。

原则：目标机上不运行任何 tools/ 脚本；交付物自足。
