#!/usr/bin/env bash
# s108/ef1 GREEN 阶段：iat129（本批修复）沙盒 C:\PF-TEST\ef1
# 验收五臂（裁决三）+ 负检查四项 + events 两新事件行 + 升级臂
# 用法：bash tmp/ef1-green.sh   （完测后由 ef1-clean.sh 整删）
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SB=/c/PF-TEST/ef1
SBW='C:\PF-TEST\ef1'
ZIP='C:/ZCodeWorks/PocketForge/dist/PocketForge-20261003-iat129.zip'
KEY=$(grep '^FORGE_AGENT_API_KEY=' /c/PF-TEST/s108a/data/secrets.env | cut -d= -f2)
PASS=0; FAIL=0
ck(){ if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

echo "== 解压 iat129 =="
if [ -f "$SB/data/pc.port" ]; then
  (cd "$SB" && cmd //c "停止数字员工.cmd" < /dev/null > "$SB/data/logs/ef1-prestop.log" 2>&1) || true
  sleep 3
fi
rm -rf "$SB"; mkdir -p "$SB"
python -c "import zipfile;zipfile.ZipFile(r'$ZIP').extractall(r'C:/PF-TEST/ef1')"
ls "$SB" | head -5

echo "== 前置门 + 降权冷启 + 等开窗（同 RED 序）=="
if netstat -ano | grep -E ":8790 .*LISTEN" | head -1 | grep -q .; then
  echo "ABORT: 8790 occupied"; netstat -ano | grep ":8790.*LISTEN" | head -2; exit 9
fi
python - "$SBW" <<'PYEOF'
import os, sys
sb = sys.argv[1]
os.makedirs(os.path.join(sb, 'data', 'logs'), exist_ok=True)
wrap = os.path.join(sb, 'data', 'logs', 'ef1-green-wrap.cmd')
content = ('@echo off\r\ncall "%s" > "%s" 2>&1\r\n' % (
    os.path.join(sb, '\u542f\u52a8\u6570\u5b57\u5458\u5de5.cmd'),
    os.path.join(sb, 'data', 'logs', 'ef1-green-launch.log')))
data = content.encode('gbk')
assert b'\xc6\xf4' in data
open(wrap, 'wb').write(data)
PYEOF
cmd //c runas //trustlevel:0x20000 "$SBW\\data\\logs\\ef1-green-wrap.cmd" </dev/null >/dev/null 2>&1
ok=1
for i in $(seq 1 120); do
  sleep 2
  if curl -s --max-time 2 http://127.0.0.1:8790/healthz 2>/dev/null | grep -q ok; then ok=0; break; fi
done
ck "cold start healthz (waited $((i*2))s)" $ok
[ "$ok" = "1" ] && { tail -5 "$SB/data/logs/ef1-green-launch.log" 2>/dev/null; exit 1; }
PID8790=$(netstat -ano | grep ":8790" | grep LISTEN | head -1 | awk '{print $NF}')
OWNER=$(wmic process where processid=$PID8790 get executablepath /format:list 2>/dev/null | grep -i "ExecutablePath" | cut -d= -f2)
case "$OWNER" in *"PF-TEST\\ef1"*) ck "bridge owned by sandbox" 0;; *) ck "bridge owned by sandbox ($OWNER)" 1;; esac
ok=1
for i in $(seq 1 90); do
  sleep 2
  if grep -q "converge rc=" "$SB/data/logs/open-when-ready.log" 2>/dev/null; then ok=0; break; fi
done
ck "boot converge completed" $ok
ok=1
for i in $(seq 1 60); do
  sleep 2
  if curl -s --max-time 2 http://127.0.0.1:8790/healthz 2>/dev/null | grep -q ok; then ok=0; break; fi
done
ck "bridge re-ready after boot converge" $ok

echo "== G2 漂移收敛臂：配流保存 → 保存点 converge 换桥 + events 行 + 收敛闭环 =="
node "$ROOT/tmp/ef1-ws-probe.js" converge-arm "$KEY" > "$SB/data/logs/ef1-g2.log" 2>&1
ck "G2 converge-arm (swap+event+resave-stable)" $?
tail -3 "$SB/data/logs/ef1-g2.log"

echo "== G1 负检查①：面板纯打开 → secrets 零写入 =="
sleep 1.2
M1=$(stat -c %y "$SB/data/secrets.env")
node "$ROOT/tmp/ef1-ws-probe.js" panelopen > /dev/null 2>&1
sleep 1
M2=$(stat -c %y "$SB/data/secrets.env")
[ "$M1" = "$M2" ]; ck "G1 panel-open leaves secrets.env untouched" $?

echo "== G3+E1 核心臂：配流后立即对话让 agent 注册——修复形态=注册零换桥+回合完整回复 =="
mkdir -p "$SB/apps"
cat > "$SB/apps/hello.yaml" <<'YAML'
# forge-meta: {"desc":"ef1 green 测试应用"}
processes:
  ef1-hello:
    command: 'cmd /c echo hello'
    is_daemon: false
    availability:
      restart: 'no'
YAML
node "$ROOT/tmp/ef1-ws-probe.js" corearm "$KEY" noswap none > "$SB/data/logs/ef1-g3.log" 2>&1
ck "G3 core arm: register with zero bridge swap, turn completes with reply" $?
tail -2 "$SB/data/logs/ef1-g3.log"
grep -o '"pgStable":true' "$SB/data/logs/ef1-g3.log" | head -1 | grep -q true; ck "G3 pg stable" $?
# permcard 计数与 RED 同任务基线一致（RED=2；注册单命令）
PCNT=$(grep -oE '"permCards":[0-9]+' "$SB/data/logs/ef1-g3.log" | head -1 | grep -oE '[0-9]+')
[ "$PCNT" = "2" ]; ck "G3 permcard count == red baseline (got $PCNT)" $?

echo "== G4 悬空补帧：回合在飞硬杀桥 → 通知 ≤10s + 再问一次可用 =="
node "$ROOT/tmp/ef1-ws-probe.js" killturn dangling midturn > "$SB/data/logs/ef1-g4.log" 2>&1
ck "G4 dangling note <=10s + wording + marker cleared + no second note + resend completes" $?
tail -2 "$SB/data/logs/ef1-g4.log"

echo "== G5 负检查②③：正常完成回合后断线重连 → 零悬空提示 =="
node "$ROOT/tmp/ef1-ws-probe.js" killturn none done > "$SB/data/logs/ef1-g5.log" 2>&1
ck "G5 completed-turn reconnect: zero dangling note (S9 intact)" $?
tail -1 "$SB/data/logs/ef1-g5.log"

echo "== G7 负检查④：同定义改档 → 零换桥 =="
node "$ROOT/tmp/ef1-ws-probe.js" samesave > "$SB/data/logs/ef1-g7.log" 2>&1
ck "G7 same-def profile save: zero bridge swap, zero converge event" $?
tail -2 "$SB/data/logs/ef1-g7.log"

echo "== G8 events 两新事件行 =="
grep -q '"ev":"providers_converge"' "$SB/data/logs/events.log"; ck "G8 providers_converge event line" $?
grep -q '"ev":"dangling_notify"' "$SB/data/logs/events.log"; ck "G8 dangling_notify event line" $?
EV_C=$(grep -c '"ev":"providers_converge"' "$SB/data/logs/events.log")
EV_D=$(grep -c '"ev":"dangling_notify"' "$SB/data/logs/events.log")
echo "providers_converge=$EV_C dangling_notify=$EV_D"

echo "== G6 wrapper fail-loud 活体（沙盒自带 wrapper）=="
cp "$SB/data/secrets.env" "$SB/data/secrets.env.ef1bak"
grep -v '^GOOSE_MODEL_NAME=' "$SB/data/secrets.env.ef1bak" > "$SB/data/secrets.env"
B0=$("$SB/bin/pc/process-compose.exe" -p "$(cat "$SB/data/pc.port")" process list -o json 2>/dev/null | python -c "import sys,json;d=sys.stdin.read();i=d.find('[');a=json.loads(d[i:]);print([x for x in a if x['name']=='chat-bridge'][0]['pid'])")
cmd //c "$SBW\\bin\\pc\\forge-register.cmd converge" > "$SB/data/logs/ef1-g6-out.txt" 2>&1
RC=$?
[ "$RC" = "4" ]; ck "G6 wrapper fail-loud rc=4 on missing key line (got $RC)" $?
grep -q "missing key lines" "$SB/data/logs/ef1-g6-out.txt"; ck "G6 human line to caller" $?
grep -q "secrets.env unreadable" "$SB/data/logs/register.log"; ck "G6 raw reason in register.log" $?
sleep 2
B1=$("$SB/bin/pc/process-compose.exe" -p "$(cat "$SB/data/pc.port")" process list -o json 2>/dev/null | python -c "import sys,json;d=sys.stdin.read();i=d.find('[');a=json.loads(d[i:]);print([x for x in a if x['name']=='chat-bridge'][0]['pid'])")
[ "$B0" = "$B1" ]; ck "G6 update NOT sent (bridge PID $B0 stable)" $?
cp "$SB/data/secrets.env.ef1bak" "$SB/data/secrets.env"

echo "== G9 升级臂：标记文件随 data/ PROTECTED 不丢 + 无假悬空 =="
# 种一个悬空标记（模拟升级前崩溃遗留）——用一个真实存在的 sid
SID=$(node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('C:/PF-TEST/ef1/conf/goose/data/sessions/sessions.db',{readOnly:true});const r=db.prepare(\"SELECT id FROM sessions WHERE session_type='acp' ORDER BY created_at DESC LIMIT 1\").get();console.log(r?r.id:'');db.close()" 2>/dev/null | tail -1)
echo "seed marker sid=$SID"
python -c "
import json,sys
j=json.load(open(r'C:/PF-TEST/ef1/data/turns-inflight.json')) if __import__('os').path.exists(r'C:/PF-TEST/ef1/data/turns-inflight.json') else {'_schema':1,'sids':{}}
j['_schema']=1; j.setdefault('sids',{})[sys.argv[1]]={'at':__import__('time').time()*1000}
open(r'C:/PF-TEST/ef1/data/turns-inflight.json','w').write(json.dumps(j))
" "$SID"
(cd "$SB" && cmd //c "停止数字员工.cmd" < /dev/null >> "$SB/data/logs/ef1-green-launch.log" 2>&1); sleep 3
# 差量覆盖（升级面=除 data/ 外整树；data/ PROTECTED）
python -c "import zipfile;zipfile.ZipFile(r'$ZIP').extractall(r'C:/PF-TEST/ef1-upg')"
MSYS_NO_PATHCONV=1 robocopy "C:\\PF-TEST\\ef1-upg" "C:\\PF-TEST\\ef1" /E /XD "C:\\PF-TEST\\ef1-upg\\data" /NFL /NDL /NJH /NJS /NP >/dev/null 2>&1 || true
rm -rf /c/PF-TEST/ef1-upg
python -c "
import json,sys
try:
    j=json.load(open(r'C:/PF-TEST/ef1/data/turns-inflight.json'))
    sys.exit(0 if sys.argv[1] in j.get('sids',{}) else 1)
except Exception: sys.exit(2)" "$SID"
ck "G9 marker survived package overlay (data/ protected)" $?
cmd //c runas //trustlevel:0x20000 "$SBW\\data\\logs\\ef1-green-wrap.cmd" </dev/null >/dev/null 2>&1
ok=1
for i in $(seq 1 120); do
  sleep 2
  if curl -s --max-time 2 http://127.0.0.1:8790/healthz 2>/dev/null | grep -q ok; then ok=0; break; fi
done
ck "G9 cold start after overlay" $ok
ok=1
for i in $(seq 1 90); do
  sleep 2
  if grep -q "converge rc=" "$SB/data/logs/open-when-ready.log" 2>/dev/null; then N=$(grep -c "converge rc=" "$SB/data/logs/open-when-ready.log"); if [ "$N" -ge 2 ]; then ok=0; break; fi; fi
done
ck "G9 post-upgrade boot converge done (2nd)" $ok
ok=1
for i in $(seq 1 60); do
  sleep 2
  if curl -s --max-time 2 http://127.0.0.1:8790/healthz 2>/dev/null | grep -q ok; then ok=0; break; fi
done
ck "G9 bridge re-ready" $ok
# 重开标记会话 → 悬空通知恰一次（补帧），无标记会话 → 零提示
node "$ROOT/tmp/ef1-ws-probe.js" danglingone "$SID" > "$SB/data/logs/ef1-g9.log" 2>&1
ck "G9 seeded marker -> one dangling note on reopen; clean sid -> none" $?
tail -2 "$SB/data/logs/ef1-g9.log"

echo "== GREEN 汇总: PASS=$PASS FAIL=$FAIL =="
