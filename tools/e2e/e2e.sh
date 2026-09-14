# P5 端到端验收脚本（开发机跑）
# 故事：妻子说「把 PLM 零件库存抓下来入库，做个查询页」→ agent 用 browser MCP 抓 fake PLM →
#       faucet 入库 → 注册 apps/e2e-report.yaml（一个极小静态报表 served by python http.server）
#       → 重启全栈 → 断言：数据仍在、app 仍被托管。
# 本脚本模拟 agent 的机械步骤（LLM 决策部分由 goose run 完成，见 runbook）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FORGE="$ROOT/forge"
PASS=0; FAIL=0
ck(){ if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi }

# ---------- 前置：栈已在跑（启动器） ----------
PC_PORT=$(cat "$FORGE/data/pc.port" 2>/dev/null || echo 8099)
FAUCET_PORT=$(cat "$FORGE/data/faucet.port" 2>/dev/null || echo 8091)
curl -s --max-time 3 "http://127.0.0.1:$FAUCET_PORT/healthz" >/dev/null; ck "stack up (faucet healthz)" $?

# ---------- 1) fake PLM 起服务（三向脱管：MSYS 下继承的 stdout/stdin 会握住调用方管道致脚本收尾挂死，s51 实证 4 代同死法） ----------
(cd "$ROOT/tools/e2e" && python -m http.server 8124 >/dev/null 2>&1 </dev/null &)
sleep 2
curl -s --max-time 3 http://127.0.0.1:8124/fake-plm.html | grep -q 零件库存查询; ck "fake PLM serving" $?

# ---------- 2) agent（goose）抓页面+入库 ----------
export GOOSE_PATH_ROOT="$(cygpath -w "$FORGE/conf/goose")"
export GOOSE_DISABLE_KEYRING=1 GOOSE_TELEMETRY_ENABLED=false GOOSE_MODE=auto
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
# s50: OPENAI_* 自包含——从 secrets.env 注入（旧法依赖调用者 shell 预先 export，后台任务跑必 401）
if [ -f "$FORGE/data/secrets.env" ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      FORGE_AGENT_HOST) export OPENAI_HOST="$v"; export GOOSE_PROVIDER=openai ;;
      FORGE_AGENT_API_KEY) [ -n "$v" ] && export OPENAI_API_KEY="$v" ;;
      GOOSE_MODEL_NAME) [ -n "$v" ] && export GOOSE_MODEL="$v" ;;
    esac
  done < <(grep -v '^#' "$FORGE/data/secrets.env")
fi
cd "$FORGE"
# s51: goose 输出走文件而非命令替换管道——goose 子进程（browser MCP 等）持有管道写端时
# $(...|tail) 等 EOF 会永久挂死（实测 8/8 PASS 后脚本仍不退出）。文件法 timeout 兜底即返回。
timeout -k 5 600 bin/goose/goose-package/goose.exe run -t "任务：1) 用 browser 工具打开 http://127.0.0.1:8124/fake-plm.html 等表格加载完成，读出全部零件行；2) 若 plm 服务无 parts_e2e 表则用 faucet_raw_sql 创建(id INTEGER PRIMARY KEY, code TEXT, name TEXT, qty INTEGER, updated TEXT)；3) 把抓到的行全部 faucet_insert 进 parts_e2e（先 DELETE 旧数据）；4) 最后 faucet_query 该表并输出行数。不要做别的。" >/tmp/e2e-goose.out 2>&1 </dev/null || true
OUT=$(tail -30 /tmp/e2e-goose.out)
echo "--- goose output tail ---"; echo "$OUT" | tail -8; echo "--- end ---"
echo "$OUT" | grep -qE "6 行|6行|行数.*6|count.*6|\"6\"|共 6"; ck "agent scraped+inserted (expects 6 rows)" $?

# ---------- 3) REST 侧断言 ----------
KEY=$(cat "$FORGE/data/faucet/.apikey" 2>/dev/null || true)
if [ -n "$KEY" ]; then
  N=$(curl -s "http://127.0.0.1:$FAUCET_PORT/api/v1/plm/_table/parts_e2e?fields=id" -H "X-API-Key: $KEY" | python -c "import sys,json;print(json.load(sys.stdin)['meta']['count'])")
  [ "$N" = "6" ]; ck "REST count=6 (got $N)" $?
else
  echo "SKIP: REST (no apikey file)"; PASS=$((PASS+1))
fi

# ---------- 4) 注册应用（模拟 agent 写 apps/*.yaml + 热加载） ----------
mkdir -p "$FORGE/apps"
# s66 实证：project update 用客户端 env 展开 ${VAR}——不带启动器同款 env 会把运行栈命令行里的
# ${PG_PORT}/${FAUCET_PORT}/${FORGE_AGENT_*} 展开为空（pg 变 `-p -c` crash loop）。故先导全 env。
export FORGE_ROOT="$(cygpath -w "$FORGE")"   # pc 展开 ${FORGE_ROOT} 需 Windows 形态（同启动器）
export PC_PORT=${PC_PORT:-$(cat "$FORGE/data/pc.port" 2>/dev/null || echo 8099)}
export FAUCET_PORT=$(cat "$FORGE/data/faucet.port" 2>/dev/null || echo 8091)
export PG_PORT=$(cat "$FORGE/data/pg.port" 2>/dev/null || echo 5432)
export GOOSE_PATH_ROOT="$(cygpath -w "$FORGE/conf/goose")" GOOSE_DISABLE_KEYRING=1 GOOSE_TELEMETRY_ENABLED=false
if [ -f "$FORGE/data/secrets.env" ]; then
  while IFS='=' read -r k v; do case "$k" in FORGE_*|GOOSE_MODEL_NAME) [ -n "$v" ] && export "$k=$v";; esac; done < <(grep -v '^#' "$FORGE/data/secrets.env")
fi
APP_YAML_WIN=$(cygpath -w "$FORGE/apps/e2e-report.yaml")
python - "$APP_YAML_WIN" "$(cygpath -w "$ROOT/tools/e2e")" <<'PYEOF'
import sys, io
app_yaml, e2e_dir = sys.argv[1], sys.argv[2].replace('\\', '/')
# s89: fixture 用协议形态（forge-meta 首行注释 + 全单引号）——R1/R2 回归钉子：下次启动聚合器
# 必须让这种形态照常过（s88 A6 红的正是它）；朴素形态由 apps-probe fixture 族另行覆盖
content = (
 "# forge-meta: {\"description\":\"e2e 库存报表查询页\",\"url\":\"http://127.0.0.1:8199/fake-plm.html\",\"created_at\":\"2026-09-15\",\"source\":\"e2e\"}\n"
 "processes:\n"
 "  e2e-report:\n"
 "    command: 'cmd /c cd /d " + e2e_dir + " && python -m http.server 8199'\n"
 "    is_daemon: true\n"
 "    availability:\n"
 "      restart: on_failure\n"
)
io.open(app_yaml, 'w', newline='\n').write(content)
PYEOF
timeout 20 env PC_DISABLE_TUI=1 "$FORGE/bin/pc/process-compose.exe" -p $PC_PORT project update -f "$(cygpath -w "$FORGE/conf/process-compose.yaml")" -f "$(cygpath -w "$FORGE/conf/ports.env.yaml")" -f "$(cygpath -w "$FORGE/apps/e2e-report.yaml")" </dev/null >/dev/null 2>&1
ck "hot-reload registered app" $?
sleep 3
curl -s --max-time 3 http://127.0.0.1:8199/fake-plm.html >/dev/null; ck "app serving on 8199" $?

# ---------- 5) 重启持久 ----------
timeout 20 env PC_DISABLE_TUI=1 "$FORGE/bin/pc/process-compose.exe" -p $PC_PORT down </dev/null >/dev/null 2>&1 || taskkill //IM process-compose.exe //F >/dev/null 2>&1 || true
sleep 3
# s67(STATE遗留3): 本机内建 Administrator 提权环境下 postgres 拒提权运行(restarts 耗尽面板红)。
# relaunch 走 runas /trustlevel:0x20000 降权令牌包装(目标机标准用户等价无感)。wrapper 须 GBK:
# cmd 按 ANSI codepage 解析中文启动器名; 输出重定向移入 wrapper(runas 不向子进程传句柄)。
# 先清旧 wrapper: 上轮 wrapper 停栈后挂在 pause, 不清则新实例静默不执行(s67 实证观察项)。
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { \$_.CommandLine -match 'relaunch-wrap' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" 2>/dev/null || true
python - "$(cygpath -w "$FORGE")" <<'PYEOF'
import os, sys
forge = sys.argv[1]
wrap = os.path.join(forge, 'data', 'logs', 'e2e-relaunch-wrap.cmd')
content = ('@echo off\r\ncall "%s" > "%s" 2>&1\r\n' % (
    os.path.join(forge, '\u542f\u52a8\u6570\u5b57\u5458\u5de5.cmd'),
    os.path.join(forge, 'data', 'logs', 'e2e-relaunch.log')))
data = content.encode('gbk')
assert b'\xc6\xf4' in data, 'GBK bytes missing in wrapper'
open(wrap, 'wb').write(data)
PYEOF
if ! cmd //c runas //trustlevel:0x20000 "$(cygpath -w "$FORGE/data/logs/e2e-relaunch-wrap.cmd")" </dev/null >/dev/null 2>&1; then
  echo "WARN: restricted-token relaunch failed (runas); stack may be down"
fi
sleep 40   # s67: 降权 runas 链(bootstrap→pc listen)实测机器慢时 >25s, 25s 断言会打早(exit 7)
NEW_PORT=$(cat "$FORGE/data/pc.port")
# s78: rc 捕获（同 e2e-chat.sh PCRUN 坑）——grep -q 非零在 set -e 下会中止全量，红必须被计数
rc=0; timeout 15 env PC_DISABLE_TUI=1 "$FORGE/bin/pc/process-compose.exe" -p $NEW_PORT process get e2e-report </dev/null 2>/dev/null | grep -viE "debug|duplicate" | grep -qE "Running|Launching|Launched" || rc=$?
ck "app auto-registered after restart" $rc
KEY2=$(cat "$FORGE/data/faucet/.apikey" 2>/dev/null || true)
if [ -n "$KEY2" ]; then
  N2=$(curl -s "http://127.0.0.1:$(cat "$FORGE/data/faucet.port")/api/v1/plm/_table/parts_e2e?fields=id" -H "X-API-Key: $KEY2" | python -c "import sys,json;print(json.load(sys.stdin)['meta']['count'])")
  [ "$N2" = "6" ]; ck "data persisted after restart (count=$N2)" $?
fi

echo "=============================="
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
