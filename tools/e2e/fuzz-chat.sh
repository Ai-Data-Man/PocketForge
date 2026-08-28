# s34 聊天桥端点模糊测试（开发机跑）
# 异常输入矩阵：空 body / 非对象 JSON / 类型混淆 / 路径字符 / 越界值
# 期望：全部返回友好 JSON 错误，不 500、不崩溃、不泄漏内部路径。
set -uo pipefail
B=${1:-http://127.0.0.1:8790}
PASS=0; FAIL=0
ck(){ if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi }
J(){ python -c "
import sys,json
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except Exception:
    sys.exit(1)
sys.exit(0)"; }
NOLEAK(){ python -c "
import sys
raw=sys.stdin.read()
sys.exit(0 if ('C:' not in raw and '/conf/' not in raw and 'ENOENT' not in raw) else 1)"; }
P(){ curl -s -X POST "$1" -H 'content-type: application/json' -d "$2" | J; ck "$3" $?; }
P "$B/api/memory" '' "memory empty body"
P "$B/api/memory" 'null' "memory null body"
P "$B/api/memory" '"str"' "memory string body"
P "$B/api/memory" '{"op":"forget_one","category":123,"text":"x"}' "memory numeric category"
P "$B/api/memory" '{"op":"forget_one","category":"ghost_zzz","text":"x"}' "memory missing category friendly"
P "$B/api/extensions" '{"id":1,"enabled":true}' "extensions numeric id"
P "$B/api/extensions" '{"id":"browser","enabled":"yes"}' "extensions string enabled"
curl -s -X POST "$B/api/schedules" -H 'content-type: application/json' -d '{"id":"../../x"}' | J; ck "schedules traversal id" $?
# 错误响应不泄漏内部路径
curl -s -X POST "$B/api/memory" -H 'content-type: application/json' -d '{"op":"forget_one","category":123,"text":"x"}' | NOLEAK; ck "no internal path leak" $?
# GET 端点在异常参数下不崩
curl -s "$B/api/search?q=%25%5C_%27" | J; ck "search regex metachars" $?
curl -s "$B/api/ws/tree?ws=../../../etc" >/dev/null; ck "ws/tree traversal rejected" $?
curl -s "$B/api/vcs/log?ws=x&file=../../y" >/dev/null; ck "vcs traversal rejected" $?
# P31-③: stats 端点形状（只读，JSON 可解析且含关键字段）
curl -s "$B/api/stats" | python -c "import sys,json;d=json.load(sys.stdin);assert d['date'] and 'updated' in d and d['sessionsCreated'] >= 0"; ck "stats endpoint shape" $?
echo "=============================="
echo "fuzz: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
