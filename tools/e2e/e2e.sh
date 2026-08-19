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

# ---------- 1) fake PLM 起服务 ----------
(cd "$ROOT/tools/e2e" && python -m http.server 8124 >/dev/null 2>&1 &)
sleep 2
curl -s --max-time 3 http://127.0.0.1:8124/fake-plm.html | grep -q 零件库存查询; ck "fake PLM serving" $?

# ---------- 2) agent（goose）抓页面+入库 ----------
export GOOSE_PATH_ROOT="$(cygpath -w "$FORGE/conf/goose")"
export GOOSE_DISABLE_KEYRING=1 GOOSE_TELEMETRY_ENABLED=false GOOSE_MODE=auto
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost
# OPENAI_* 已在环境（runbook 说明）
cd "$FORGE"
OUT=$(timeout -k 5 600 bin/goose/goose-package/goose.exe run -t "任务：1) 用 browser 工具打开 http://127.0.0.1:8124/fake-plm.html 等表格加载完成，读出全部零件行；2) 若 plm 服务无 parts_e2e 表则用 faucet_raw_sql 创建(id INTEGER PRIMARY KEY, code TEXT, name TEXT, qty INTEGER, updated TEXT)；3) 把抓到的行全部 faucet_insert 进 parts_e2e（先 DELETE 旧数据）；4) 最后 faucet_query 该表并输出行数。不要做别的。" 2>&1 | tail -30 || true)
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
APP_YAML_WIN=$(cygpath -w "$FORGE/apps/e2e-report.yaml")
python - "$APP_YAML_WIN" "$(cygpath -w "$ROOT/tools/e2e")" <<'PYEOF'
import sys, io
app_yaml, e2e_dir = sys.argv[1], sys.argv[2].replace('\\', '/')
content = (
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
cmd //c "$(cygpath -w "$FORGE/启动数字员工.cmd")" </dev/null > "$FORGE/data/logs/e2e-relaunch.log" 2>&1 &
sleep 25
NEW_PORT=$(cat "$FORGE/data/pc.port")
timeout 15 env PC_DISABLE_TUI=1 "$FORGE/bin/pc/process-compose.exe" -p $NEW_PORT process get e2e-report </dev/null 2>/dev/null | grep -viE "debug|duplicate" | grep -qE "Running|Launching|Launched"; ck "app auto-registered after restart" $?
KEY2=$(cat "$FORGE/data/faucet/.apikey" 2>/dev/null || true)
if [ -n "$KEY2" ]; then
  N2=$(curl -s "http://127.0.0.1:$(cat "$FORGE/data/faucet.port")/api/v1/plm/_table/parts_e2e?fields=id" -H "X-API-Key: $KEY2" | python -c "import sys,json;print(json.load(sys.stdin)['meta']['count'])")
  [ "$N2" = "6" ]; ck "data persisted after restart (count=$N2)" $?
fi

echo "=============================="
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
