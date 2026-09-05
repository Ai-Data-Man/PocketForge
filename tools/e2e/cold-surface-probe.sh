#!/usr/bin/env bash
# s69 冷启六面探针（s69 转正自 tmp s69-cold-probe.js + s69-assert.js）：发版前对沙盒冷启跑一次的只读断言。
# 断言面：冷启态（healthz 200 + pg Ready restarts=0 + pg-init Completed）+ v0.9.10 六新面
#   ①升级两步向导标记 ②skill-sources 双源首启 ③mcp-catalog 3 条
#   ④permission user 三键 + browser_run_code_unsafe never_allow ⑤CONTEXT_FILE_NAMES + 四扩展关停
#   ⑥能力面板 enabled 与 config.yaml 一致（含注释 config 读取正确）
# 用法：目标栈冷启后  PF_ROOT='C:/PocketForge-Test' bash tools/e2e/cold-surface-probe.sh
#   PF_ROOT        目标树根（默认 C:/PocketForge-Test；传 dev 树 <repo>/forge 可复跑同款断言，但冷启态 restarts=0 只对真冷启成立）
#   PF_BRIDGE_PORT 桥端口（默认 8790）；PC 端口自动读 $PF_ROOT/data/pc.port（回落 8099）
# 前置：目标栈已启动。提权账户直启启动器 pg 必 crash-loop（PG 拒管理员运行，s66 家族）——沙盒验证须
#   runas /trustlevel:0x20000 降权包装，且重拉前必须清旧 wrapper cmd（s67 先例）。
# 探针只读（HTTP GET + 文件读 + pc process get），不注入不改目标树。
# 回归层级：每发版一次；全栈冷启太重，不进常规 e2e-chat / fuzz。
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/tools/e2e/cold-surface-probe.js"
