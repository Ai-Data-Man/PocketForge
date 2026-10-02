#!/usr/bin/env bash
# s108/ef1 RED 阶段：iat128（修前）沙盒 C:\PF-TEST\ef1
# 断言（全部应为 RED 形态=缺陷在场）：
#   R1 面板纯打开 providers 帧 → secrets.env 被改写（无门）
#   R2 配流后 converge → 桥 PID 变、pg PID 不变（漂移=只换桥，iat124 形态）
#   R3 回合在飞时桥被换 → WS 零终态帧、重连后零悬空提示（石沉大海）
# 用法：bash tmp/ef1-red.sh   （完测后由 ef1-clean.sh 整删）
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SB=/c/PF-TEST/ef1
SBW='C:\PF-TEST\ef1'
ZIP="$ROOT/dist/PocketForge-20261003-iat128.zip"
KEY=$(grep '^FORGE_AGENT_API_KEY=' /c/PF-TEST/s108a/data/secrets.env | cut -d= -f2)
PASS=0; FAIL=0
ck(){ if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

echo "== 解压 iat128 =="
# 预清：上轮沙盒栈若在跑，先用其自带停止脚本停净（防 rm 撞锁文件/占口）
if [ -f "$SB/data/pc.port" ]; then
  (cd "$SB" && cmd //c "停止数字员工.cmd" < /dev/null > "$SB/data/logs/ef1-prestop.log" 2>&1) || true
  sleep 3
fi
rm -rf "$SB"; mkdir -p "$SB"
python -c "import zipfile;zipfile.ZipFile(r'C:/ZCodeWorks/PocketForge/dist/PocketForge-20261003-iat128.zip').extractall(r'C:/PF-TEST/ef1')"
ls "$SB" | head -5

echo "== 前置门：8790 必须无人占（防打错目标——dev 栈残留即中止）=="
if netstat -ano | grep -E ":8790 .*LISTEN" | head -1 | grep -q .; then
  echo "ABORT: 8790 still occupied:"; netstat -ano | grep ":8790.*LISTEN" | head -2; exit 9
fi
ck "port 8790 free before cold start" 0

echo "== 降权冷启 =="
python - "$SBW" <<'PYEOF'
import os, sys
sb = sys.argv[1]
os.makedirs(os.path.join(sb, 'data', 'logs'), exist_ok=True)
wrap = os.path.join(sb, 'data', 'logs', 'ef1-red-wrap.cmd')
content = ('@echo off\r\ncall "%s" > "%s" 2>&1\r\n' % (
    os.path.join(sb, '\u542f\u52a8\u6570\u5b57\u5458\u5de5.cmd'),
    os.path.join(sb, 'data', 'logs', 'ef1-red-launch.log')))
data = content.encode('gbk')
assert b'\xc6\xf4' in data
open(wrap, 'wb').write(data)
PYEOF
cmd //c runas //trustlevel:0x20000 "$SBW\\data\\logs\\ef1-red-wrap.cmd" </dev/null >/dev/null 2>&1
ok=1
for i in $(seq 1 120); do
  sleep 2
  if curl -s --max-time 2 http://127.0.0.1:8790/healthz 2>/dev/null | grep -q ok; then ok=0; break; fi
done
ck "cold start healthz (waited $((i*2))s)" $ok
[ "$ok" = "1" ] && { echo "cold start failed; launch log:"; tail -5 "$SB/data/logs/ef1-red-launch.log" 2>/dev/null; exit 1; }

echo "== 归属门：8790 监听者必须是沙盒树 =="
PID8790=$(netstat -ano | grep ":8790" | grep LISTEN | head -1 | awk '{print $NF}')
OWNER=$(wmic process where processid=$PID8790 get executablepath /format:list 2>/dev/null | grep -i "ExecutablePath" | cut -d= -f2)
echo "8790 owner: $OWNER"
case "$OWNER" in *"PF-TEST\\ef1"*) ck "bridge owned by sandbox" 0;; *) ck "bridge owned by sandbox" 1;; esac

echo "== 等启动收敛烧完首更（settle 窗内配流会把漂移提前烧掉——iat124 复刻必须等开窗）=="
ok=1
for i in $(seq 1 90); do
  sleep 2
  if grep -q "converge rc=" "$SB/data/logs/open-when-ready.log" 2>/dev/null; then ok=0; break; fi
done
ck "boot converge completed ($(grep -o 'converge rc=[0-9]*' "$SB/data/logs/open-when-ready.log" 2>/dev/null | tail -1))" $ok
ok=1
for i in $(seq 1 60); do
  sleep 2
  if curl -s --max-time 2 http://127.0.0.1:8790/healthz 2>/dev/null | grep -q ok; then ok=0; break; fi
done
ck "bridge re-ready after boot converge" $ok

echo "== 配流（UI 同款 WS 保存帧）=="
node "$ROOT/tmp/ef1-ws-probe.js" configure "$KEY" > "$SB/data/logs/ef1-red-configure.log" 2>&1
ck "configure provider via WS save frame" $?
tail -2 "$SB/data/logs/ef1-red-configure.log"

echo "== R1: 面板纯打开 → secrets 被改写（RED 期望=改写）=="
sleep 1.2
M1=$(stat -c %y "$SB/data/secrets.env")
node "$ROOT/tmp/ef1-ws-probe.js" panelopen > /dev/null 2>&1
sleep 1
M2=$(stat -c %y "$SB/data/secrets.env")
[ "$M1" != "$M2" ]; ck "R1-RED panel-open rewrote secrets.env ($M1 -> $M2)" $?

echo "== R3: 回合在飞注册 → 换桥+pg 稳定+零终态（iat124 复刻，红=缺陷形态在场）=="
# 预置一个最小 app yaml，让 agent 单命令注册（E1 wrapper 路径）
mkdir -p "$SB/apps"
cat > "$SB/apps/hello.yaml" <<'YAML'
# forge-meta: {"desc":"ef1 red 测试应用"}
processes:
  ef1-hello:
    command: 'cmd /c echo hello'
    is_daemon: false
    availability:
      restart: 'no'
YAML
node "$ROOT/tmp/ef1-ws-probe.js" corearm "$KEY" swap none > "$SB/data/logs/ef1-red-corearm.log" 2>&1
RC=$?
echo "--- corearm probe output (tail) ---"; tail -3 "$SB/data/logs/ef1-red-corearm.log"
[ "$RC" = "0" ]; ck "R3-RED register swapped bridge mid-turn, zero dangling/error in window (iat124 form)" $?
grep -o '"pgStable":true' "$SB/data/logs/ef1-red-corearm.log" | head -1 | grep -q true; ck "R3-RED pg stable across swap (only bridge)" $?
EV=$(grep -cE '"ev":"(providers_converge|dangling_notify)"' "$SB/data/logs/events.log" 2>/dev/null | head -1); [ -z "$EV" ] && EV=0
[ "$EV" = "0" ]; ck "R3-RED no new event lines on pre-fix build (got $EV)" $?

echo "== RED 汇总: PASS=$PASS FAIL=$FAIL =="
echo "$PASS $FAIL" > "$SB/data/logs/ef1-red-summary.txt"
