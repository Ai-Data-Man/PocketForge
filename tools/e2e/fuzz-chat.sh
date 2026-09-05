# s34 聊天桥端点模糊测试（开发机跑）
# 异常输入矩阵：空 body / 非对象 JSON / 类型混淆 / 路径字符 / 越界值
# 期望：全部返回友好 JSON 错误，不 500、不崩溃、不泄漏内部路径。
set -uo pipefail
B=${1:-http://127.0.0.1:8790}
# s64 收尾：全量输出恒留痕到项目 tmp/fuzz-last.log（此前"冷启首跑偶发 1 红热跑全绿"3 次复现均无断言名可查）
LOG="$(cd "$(dirname "$0")/../.." && pwd)/tmp/fuzz-last.log"
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
main(){
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
# s51(FIND-3): _schema 白名单钉子——非法名必须命中 DB_NAME_RE 拒绝分支（区别于「表不存在」的 ok:false）
curl -s --get "$B/api/db/_schema" --data-urlencode "svc=../etc" --data-urlencode "tbl=passwd" | grep -q '表名不对'; ck "db/_schema whitelist branch (bad name msg)" $?
curl -s "$B/api/db/_schema?svc=x%27%20OR%201%3D1&tbl=t--" | grep -q '表名不对'; ck "db/_schema whitelist branch (injection-ish)" $?
# s50h(FIND-1): /open/ 打开 artifacts 目录本身必须 400（'.' 与 %2e 两种编码形态）
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/open/.")" = "400" ]; ck "open dot refused 400" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/open/%2e")" = "400" ]; ck "open %2e refused 400" $?
# s50h(FIND-3): skillstore 保留设备名（con）两分支都拒（本地复制/远程拉取同门）
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"con"}' | grep -q '参数不合法'; ck "skillstore reserved name con refused (local)" $?
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"con","remote":true}' | grep -q '参数不合法'; ck "skillstore reserved name con refused (remote)" $?
# s50h(FIND-2/4): WS sid 白名单 + prompt 绑定/非空/长度上限（完整 11 断言矩阵见同目录 ws-fuzz-s50h.js；此处收编其单条冒烟——畸形 sid 拒绝）
node "$(dirname "$0")/ws-fuzz-s50h.js" >/dev/null 2>&1; ck "ws s50h fuzz matrix (11 asserts)" $?
# s55: schedules op 白名单矩阵（pause/resume 合法但不实景执行——daily-mem 保持 paused:true 原状）
# 合法 op + 非法 id 必须拒绝（校验先于 spawn）；非法 op 拒绝；缺 id 拒绝
curl -s -X POST "$B/api/schedules" -H 'content-type: application/json' -d '{"id":"../x","op":"pause"}' | grep -q '参数不合法'; ck "schedules traversal id with op rejected" $?
curl -s -X POST "$B/api/schedules" -H 'content-type: application/json' -d '{"id":"daily-mem","op":"fly"}' | grep -q '参数不合法'; ck "schedules bad op rejected" $?
curl -s -X POST "$B/api/schedules" -H 'content-type: application/json' -d '{"op":"pause"}' | grep -q '参数不合法'; ck "schedules missing id rejected" $?
curl -s -X POST "$B/api/schedules" -H 'content-type: application/json' -d '{"id":["daily-mem"],"op":"pause"}' | grep -q '参数不合法'; ck "schedules array id rejected" $?
# s56: preview 白名单矩阵（读缓存原文端点）
curl -s "$B/api/skillstore?preview=../secrets" | grep -q '参数不合法'; ck "skillstore preview traversal rejected" $?
curl -s "$B/api/skillstore?preview=con" | grep -q '参数不合法'; ck "skillstore preview reserved name rejected" $?
curl -s --get "$B/api/skillstore" --data-urlencode "preview=$(printf 'x%.0s' {1..70})" | grep -q '参数不合法'; ck "skillstore preview overlong rejected" $?
# s56: remote=1 新响应形状（缓存优先：ok+skills 数组，fetched_at 存在）
curl -s "$B/api/skillstore?remote=1" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('ok') is True and isinstance(d.get('skills'),list) and d.get('fetched_at'), d.keys()
"; ck "skillstore remote response shape (s56)" $?
# s57: 卸载输入白名单——路径穿越/保留名/类型混淆在删除分支之前必须拒（安装同门）
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"../x","op":"uninstall"}' | grep -q '参数不合法'; ck "skillstore uninstall traversal rejected" $?
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"con","op":"uninstall"}' | grep -q '参数不合法'; ck "skillstore uninstall reserved name rejected" $?
curl -s -X POST "$B/api/mcpstore" -H 'content-type: application/json' -d '{"id":"../../x","op":"uninstall"}' | grep -q '没有安装这个 MCP'; ck "mcpstore uninstall foreign id rejected" $?
curl -s -X POST "$B/api/mcpstore" -H 'content-type: application/json' -d '{"id":["fetch"],"op":"uninstall"}' | grep -q '目录里没有这个 MCP'; ck "mcpstore uninstall array id rejected" $?
curl -s -X POST "$B/api/mcpstore" -H 'content-type: application/json' -d '{"id":"ghost-mcp","op":"uninstall"}' | grep -q '没有安装这个 MCP'; ck "mcpstore uninstall unknown id friendly" $?
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"ghost-skill-zzz","op":"uninstall"}' | grep -q '没有安装这个技能'; ck "skillstore uninstall unknown name friendly" $?
# s57: extensions 动态并入——GET 含已装 mcp-*（visible:true, builtin:false；fetch 已装回）
curl -s "$B/api/extensions" | python -c "
import sys,json
d=json.load(sys.stdin)
mcp=[x for x in d if x['id'].startswith('mcp-')]
assert mcp and all(x['builtin'] is False and x['visible'] is True for x in mcp), mcp
assert any(x['id']=='mcp-fetch' for x in mcp), mcp
"; ck "extensions dynamic mcp merged (s57)" $?
curl -s -X POST "$B/api/extensions" -H 'content-type: application/json' -d '{"id":"mcp-ghost-zzz","enabled":false}' | grep -q '参数不合法'; ck "extensions dynamic id whitelist enforced" $?
# s70 切片A: 技能来源标记与同名冲突保护——临时技能目录即建即删（trap 兜底；全部断言走冲突拒绝分支，零安装副作用）
FR="${FORGE_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)/forge}"
command -v cygpath >/dev/null 2>&1 && FR="$(cygpath -u "$FR" 2>/dev/null || echo "$FR")"
STMP="$FR/.agents/skills/fuzz-conflict-tmp"
trap 'rm -rf "$STMP"' EXIT
mkdir -p "$STMP" && printf -- '---\nname: fuzz-conflict-tmp\ndescription: fuzz temp\n---\nbody\n' > "$STMP/SKILL.md"
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"fuzz-conflict-tmp","remote":true}' | grep -q '小 forge 自己在用'; ck "skillstore conflict no-origin rejected (s70)" $?
printf '{bad json' > "$STMP/origin.json"
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"fuzz-conflict-tmp","remote":true}' | grep -q '小 forge 自己在用'; ck "skillstore origin bad json tolerated as builtin (s70)" $?
printf '{"_schema":1,"repo":"x","installed_at":"t"}' > "$STMP/origin.json"
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"fuzz-conflict-tmp","remote":true}' | grep -q '小 forge 自己在用'; ck "skillstore origin missing source tolerated as builtin (s70)" $?
printf '{"_schema":1,"source":"self","installed_at":"t"}' > "$STMP/origin.json"
curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d '{"name":"fuzz-conflict-tmp","remote":true}' | grep -q '小 forge 自己在用'; ck "skillstore conflict self-origin rejected (s70)" $?
printf '{bad json' > "$STMP/origin.json"
curl -s "$B/api/skills" | python -c "
import sys,json
d=json.load(sys.stdin)
assert isinstance(d,list)
t=[x for x in d if x['name']=='fuzz-conflict-tmp']
assert t and t[0].get('origin') is None, t
"; ck "api/skills exposes origin field, broken origin.json tolerated (s70)" $?
rm -rf "$STMP"; trap - EXIT
[ ! -d "$STMP" ]; ck "s70 fuzz temp skill cleaned up" $?
# s70 切片B: 技能市场源配置化——沙盒自拉桥探针（明细随本日志留痕）
node "$(dirname "$0")/skill-sources-probe.js" a; ck "s70 slice-B manifest source migration probe (3 asserts)" $?
node "$(dirname "$0")/skill-sources-probe.js" b; ck "s70 slice-B skill-sources config probe (6 asserts)" $?
# s70 切片B: dev 桥在线断言——远程清单条目均带 source（缓存秒回，零副作用）
curl -s "$B/api/skillstore?remote=1" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('ok') is True and d.get('skills'), d.keys()
assert all(isinstance(s.get('source'),dict) and s['source'].get('repo') and s['source'].get('branch') for s in d['skills']), d['skills'][:2]
"; ck "skillstore remote entries carry source (s70-B)" $?
# S1: /api/report 门禁矩阵——POST/HEAD 405；GET 走端点级 Origin 门（不豁免 GET）+ 自定义头 X-PF-Report: 1（img/no-cors 发不出）
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/report")" = "405" ]; ck "report POST refused 405" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' -I "$B/api/report")" = "405" ]; ck "report HEAD refused 405" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-PF-Report: 1' -H 'Origin: http://evil.example' "$B/api/report")" = "403" ]; ck "report evil origin + header refused 403" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/report")" = "403" ]; ck "report missing X-PF-Report refused 403" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-PF-Report: 0' "$B/api/report")" = "403" ]; ck "report wrong X-PF-Report value refused 403" $?
echo "=============================="
echo "fuzz: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
}
# tee 双写（终端+留痕文件）；PIPESTATUS 保住 main 的退出码，不用 $(...|tail) 类管道写法（项目挂死先例）
main "$@" 2>&1 | tee "$LOG"
exit "${PIPESTATUS[0]}"
