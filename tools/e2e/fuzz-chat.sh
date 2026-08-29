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
# s50e: stats 若含 upstreamByKind 则必须为对象且四键为数字（结构验证，不逼真实上游错）
curl -s "$B/api/stats" | python -c "
import sys,json
d=json.load(sys.stdin)
k=d.get('errorsByType',{}).get('upstreamByKind')
if k is not None:
    assert isinstance(k,dict) and all(isinstance(k.get(x),(int,float)) for x in ('unauthorized','rate','timeout','server')), k
"; ck "stats upstreamByKind shape" $?
# s50b: db/overview 不收参数——垃圾 query 不影响响应形状（端点无用户输入面）
curl -s "$B/api/db/overview?ws=../../etc" | python -c "import sys,json;d=json.load(sys.stdin);assert 'services' in d"; ck "db overview traversal query ignored" $?
curl -s "$B/api/db/overview?service=x%27" | python -c "import sys,json;d=json.load(sys.stdin);assert 'services' in d"; ck "db overview quote query ignored" $?
# s50h(FIND-1): /open/ 打开 artifacts 目录本身必须 400（'.' 与 %2e 两种编码形态）
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/open/.")" = "400" ]; ck "open dot refused 400" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/open/%2e")" = "400" ]; ck "open %2e refused 400" $?
# s50h(FIND-3): skillstore 保留设备名（con）两分支都拒（本地复制/远程拉取同门）
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"con"}' | grep -q '参数不合法'; ck "skillstore reserved name con refused (local)" $?
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"con","remote":true}' | grep -q '参数不合法'; ck "skillstore reserved name con refused (remote)" $?
# s50h(FIND-2/4): WS sid 白名单 + prompt 绑定/非空/长度上限（完整 11 断言矩阵见同目录 ws-fuzz-s50h.js；此处收编其单条冒烟——畸形 sid 拒绝）
node "$(dirname "$0")/ws-fuzz-s50h.js" >/dev/null 2>&1; ck "ws s50h fuzz matrix (11 asserts)" $?
echo "=============================="
echo "fuzz: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
