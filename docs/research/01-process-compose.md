# process-compose（F1bonacc1/process-compose）

- 结论：ADOPT（进程编排脊柱 spine）
- 一句话用途：单 Go 二进制进程编排器：YAML 声明进程，依赖排序/健康检查/重启策略/REST API/热重载/日志轮转。
- 许可证：Apache-2.0（GitHub API + LICENSE 文件双核对，2026-08-19）。
- Windows/便携性：发布资产 `process-compose_windows_amd64.zip`（含 checksums.txt）；单 exe 免管理员免安装。
- 版本与活跃度：v1.122.0（2026-08-17）；~2.7k stars，2 天前发版；单作者（bus factor 风险）→ 锁版本。
- 验证状态：VERIFIED-DOC（来源：f1bonacc1.github.io 官方文档 + 源码 schema/routes.go，见下）。

## 对本项目的关键事实
1. 配置合并：`-f` 可重复按序合并；`process-compose.override.yml` 自动加载；顶层 `extends` 继承整文件；`vars` Go template + envsubst；`.env` 默认加载。→ 注册协议可用「主配置 + apps/*.yaml 追加 -f」或运行期 API。
2. **运行期增改进程（注册协议基石）**：`POST /project`（全量 Project JSON，207 多状态）、`POST /process`（单进程）、`POST /project/configuration`（重读配置）；CLI `process-compose project update -f <new.yaml>` 热重载。待本机验证新增进程是否立即启动。
3. 生命周期：`depends_on` 5 条件（started/healthy/completed/completed_successfully/log_ready+ready_log_line）；`is_daemon`（默认 false=一次性，true=常驻）；注意 **`is_oneshot` 已从 schema 移除**（旧文档说法过时）。`availability.restart: always|on_failure|exit_on_failure|no` + backoff/max_restarts。
4. 探针：exec 与 http_get 两种（无 tcp）——NATS 健康检查用 exec `nats server check` 或 http_get /healthz（JetStream 有 /healthz? 待测）；Faucet 用 http_get。
5. HTTP API 默认 :8080（`-p`/PC_PORT_NUM），auth `PC_API_TOKEN`≥20 字符（header `X-PC-Token-Key`）。**端口与 Faucet 默认 8080 冲突 → 二者必须显式改端口**。
6. 日志：`log_location` 落盘 + `log_configuration.rotation`（lumberjack 式 max_size/max_backups/compress）。
7. Windows：默认 shell 后端 cmd → 复杂命令显式 `shell: {shell_command: pwsh|cmd, ...}`；停进程走 taskkill；`success_exit_codes` 吸收退出码；无 POSIX 信号。
8. pm2 因 AGPL 禁用；supervisord 无 Windows；NSSM/Task Scheduler 违反零污染 —— process-compose 几乎唯一合规选择，fallback: ochinchina/supervisord（MIT，Go 单 exe）。

## 待本机验证（P2）
内存占用；zip 解压即用；cmd/pwsh shell 行为；热重载增进程立即启动与否；内部日志在 Windows 的落点（%TEMP%?）；与 Faucet 端口冲突实测。

来源（2026-08-19 核对）：api.github.com/repos/F1bonacc1/process-compose（+releases/latest、LICENSE）、f1bonacc1.github.io/process-compose/{merge,configuration,client,health,logging,launcher}、raw 源码 schemas/process-compose-schema.json、src/api/routes.go、docs/release-notes.md。
