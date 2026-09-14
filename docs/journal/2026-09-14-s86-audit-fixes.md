# s86 冷启审计 P1-P7 + 主控追加 A/B 落地（2026-09-14）

上游：docs/runbooks/2026-09-14-cold-start-codec-audit.md §8（修法已真机验证）；主控裁决追加 A/B。
本批 = 按规格落地 + 验证取证；规格外的两处实现层发现随批修复并留证（见「意外发现」）。

## 做了什么（commit 逐项）

- **P1+P2 成套**（f0c0e40）：启动器 `chcp 65001 >nul`；两模板（memory-mcp/pg-init）改 `%~dp0..` 自推导纯 ASCII（不再注入 __FORGE_ROOT__），CRLF；bootstrap 写出保留 CRLF 规范化。
- **P3**（b8116b6 + 48391f9 加固）：启动器 bootstrap 前非 ASCII 路径预检（PowerShell 探针读 `$env:FORGE_ROOT`，无引号风险），命中→中文人话提示+退出。
- **P4**（a4068a9）：bootstrap 1c 守卫改「Junction 且 Target 存在」双条件，失效删旧重建。
- **P6**（1755478）：deepseek-v4-flash → deepseek-v4.1-flash 四处（bootstrap 种子+幂等补键 / dev 树 config.yaml / forge-router.json / goose-config.tpl.yaml）。
- **P5+追加A**（4fb0c77）：package.sh SKIP += `tmp`、`conf/dev-stack-up.ps1`、`apps`；dev 树 apps/ 两残留删除（test-app.yaml git rm【曾被追踪，.gitignore 早已声明 apps/*.yaml】；e2e-report.yaml rm【未追踪】）。零引用确认：e2e.sh 运行时自写 e2e-report.yaml，test-app 仅 docs/verdicts 历史记载引用。
- **P7**（21c41c7）：使用说明.md「[PocketForge] 启动中」→「[PocketForge] starting...」（核对启动器实际 echo）。
- **追加B**（50cb103）：update-runner PROTECTED += `'apps/'`（模板+bin 双文件同步）。前缀语义实测 6/6（apps / apps/x.yaml / 嵌套 / appstuff 不匹配 / bin/apps 不匹配 / conf/apps.env.yaml 保留）。

## 意外发现（随批修复）

1. **P3 中文 echo 不可靠（实测）**：cmd 对 UTF-8 批处理内容做 DBCS 字节配对，if 块内第二行中文 echo 被切烂成伪命令（'…的路径下（例如' is not recognized）——审计 §2 尾字节吃行首同族。修法（48391f9）：启动器执行语法全 ASCII，中文消息由 PowerShell 从 base64 解码输出（chcp 65001 语境下 PS 中文输出=审计 §1 已验证模式）。
2. **shell heredoc 传输层吃转义（a4ad083）**：本会话 bash heredoc 传输把 python 源里的 `\\b` 折半成 `\b`→写成 0x08 退格字节，模板首版 `\bin` 变 `\x08in`（pg-init 早先"通过"是 PG_VERSION 守卫在坏行之前退出的假绿）。修法：改用直写文件通道重写两模板，全批 touched 文件做字节级扫描（backspace=0、`\bin` 在场、CRLF、纯 ASCII）ALL CLEAN。教训：反斜杠敏感内容禁止走 heredoc；验证断言的 needle 也要防同类污染（用 chr(92) 构造）。

## 验证证据

- **bootstrap 重物化**：dev 树重跑后 20 个产物哈希对比，drift=2 且全部 INTENDED（memory-mcp.cmd/pg-init.cmd 新形态），.goosehints/config.yaml/permission.yaml/skills 桩/chat-bridge.js 等**零漂移**；两生成 .cmd 与模板 cmp 逐位一致。
- **真实 junction 修复**：dev 机 %APPDATA% memory junction 本就悬挂（Target=C:\PocketForge-Test 已删，P4 病灶活体）→ 重跑 bootstrap 后重建指向 dev 树，Target 存在。
- **P4 隔离矩阵**（临时目录）：悬挂 junction 旧守卫 Test-Path=True（bug 复现）→ 新守卫删旧重建、穿透读 OK → 健康态二次运行 no-op（CreationTime 不变）。
- **P3 双场景**：中文目录副本（最小文件集）→ 完整两行中文提示（含 base64 断言防传输丢字）+ exit 1 + 零副作用（无 data\logs、未进 bootstrap）；ASCII 目录 → 探针静默放行（继续走到 bootstrap 缺失报错=守卫透明）。验后临时目录删净。
- **生成 .cmd 实跑**：pg-init exit 0（PG_VERSION 守卫、日志 mtime 未动）；memory-mcp 启动 goose.exe 成功（stdio EOF 干净退出，零解析错误签名）。
- **模型名零残留**：git grep 追踪面 forge/ = 0；文件系统级命中全部在 conf/goose/state/（goose 运行日志）与 data/（用户数据）——两者均不入包且按约束不动。bin/ 物化树 0。
- **SKIP 干跑**：复制 zip 阶段 SKIP 语义对活树跑，tmp/(6 条目)、conf/dev-stack-up.ps1、apps/ 全排除。
- **基线**（顺序执行，先 e2e 后 fuzz）：**e2e-chat 58/58 + fuzz 187/187，双首轮绿，EXIT=0**；桥 :8790 healthz 200（node 直连）。

## 遗留 / 注记

- 启动器 line 23 有一行**既有** UTF-8 中文注释（本批之前就在；chcp 65001 后按 UTF-8 解析正确，非 ASCII 执行语法不受影响）。按最小 diff 未动；若日后做启动器全 ASCII 化清理可一并处理。
- P3 提示词措辞如需调整：改 base64 一处即可（生成时必须带 roundtrip 断言，防传输丢字）。
- 打包窗口未到（不推 tag/release）；下个打包演练时 SKIP 新条目随包验证自然覆盖。
- 并发会话提交（28af056 docs）在本批中途入库，无文件交叠，栈式无冲突。

## commits

f0c0e40 / b8116b6 / a4068a9 / 1755478 / 4fb0c77 / 21c41c7 / 50cb103 / 48391f9 / a4ad083
