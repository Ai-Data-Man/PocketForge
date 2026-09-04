#!/usr/bin/env bash
# 报告 v2 探针编排（s65 转正自 s64 tmp 探针：s64-probe-units+s64-qa-edge → report-probe-static.js；
#                                s64-probe-report+s64-qa-sandbox → report-probe-sandbox.js）
# 用法：report-probe.sh [static|sandbox|all]（默认 all）
#   static  = 纯静态/纯函数断言 39 ck，秒级，无桥无网络
#   sandbox = 自建 FORGE_ROOT 沙箱 + 真桥进程 29 ck（端口 18790/18799，tools/e2e/.report-sb-* 跑完自清），
#             不依赖 dev 栈、不碰 8790；实测约 31-47s（s65 实测 31s，s64 tmp 原探针 46.8s）→
#             裁决：时长 < 90s 门槛，直接挂进 e2e-chat.sh 第 12 节全量跑，无需手动独立执行
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-all}"
FAIL=0
T0=$SECONDS
if [ "$MODE" = "static" ] || [ "$MODE" = "all" ]; then
  node "$ROOT/tools/e2e/report-probe-static.js" || FAIL=1
fi
if [ "$MODE" = "sandbox" ] || [ "$MODE" = "all" ]; then
  node "$ROOT/tools/e2e/report-probe-sandbox.js" || FAIL=1
fi
echo "=============================="
echo "report-probe [$MODE]: ${SECONDS}s FAIL=$FAIL"
[ "$FAIL" = "0" ]
