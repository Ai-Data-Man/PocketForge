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
# qa返工(P3-3): 回归钉——disable 已装 MCP → GET 显 false → 按原值还原（动态白名单+GET 合并读路径；端态还原零残留）
EN0=$(curl -s "$B/api/extensions" | python -c "
import sys,json
d=json.load(sys.stdin)
r=[x for x in d if x['id']=='mcp-fetch']
assert r, d
print('true' if r[0]['enabled'] else 'false')
")
curl -s -X POST "$B/api/extensions" -H 'content-type: application/json' -d '{"id":"mcp-fetch","enabled":false}' | grep -q '"ok":true'; ck "extensions disable installed mcp ok (P3-3 nail)" $?
curl -s "$B/api/extensions" | python -c "
import sys,json
d=json.load(sys.stdin)
r=[x for x in d if x['id']=='mcp-fetch']
assert r and r[0]['enabled'] is False, d
"; ck "extensions GET shows false after disable (P3-3 nail)" $?
curl -s -X POST "$B/api/extensions" -H 'content-type: application/json' -d "{\"id\":\"mcp-fetch\",\"enabled\":$EN0}" | grep -q '"ok":true'; ck "extensions mcp enabled-state restored (P3-3 nail)" $?
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
# qa返工(P2-2/P3-1/P3-4, 审查 075ee4b+d5a7d17): 原子安装实景——本地安装门 / origin 暴露与随删 / 覆盖失败保旧版 / XSS 向量
# fuzz-* 名号即用即清（下方 trap 兜底）；安装断言走 .agents/skills 真目录，卸载断言顺带回归删除链
REPO="$FR/skills-repo"; CACHE="$FR/data/cache/skills"; INST="$FR/.agents/skills"
trap 'rm -rf "$REPO/fuzz-gate-tmp" "$INST/fuzz-gate-tmp" "$INST/fuzz-swap-tmp" "$INST/fuzz-swap-tmp.tmp" "$INST/fuzz-swap-tmp.bak" "$INST/fuzz-walk-tmp" "$INST/fuzz-xss-tmp" "$CACHE/fuzz-swap-tmp"' EXIT
post(){ curl -s -X POST "$B/api/skillstore" -H 'content-type: application/json' -d "$1"; }
SKMD='---\nname: %s\ndescription: %s\n---\nbody\n'
# P3-4a: 本地安装门冲突分支——self 目录 + skills-repo 同名 → local POST（不带 remote）拒绝人话
mkdir -p "$REPO/fuzz-gate-tmp" "$INST/fuzz-gate-tmp"
printf -- "$SKMD" fuzz-gate-tmp fuzz > "$REPO/fuzz-gate-tmp/SKILL.md"
printf -- "$SKMD" fuzz-gate-tmp fuzz > "$INST/fuzz-gate-tmp/SKILL.md"
printf '{"_schema":1,"source":"self","installed_at":"t"}' > "$INST/fuzz-gate-tmp/origin.json"
post '{"name":"fuzz-gate-tmp"}' | grep -q '小 forge 自己在用'; ck "skillstore local POST self-conflict rejected (P3-4)" $?
# P3-4b: skills-repo 安装 → origin 暴露 /api/skills → 卸载随删
rm -rf "$INST/fuzz-gate-tmp"
post '{"name":"fuzz-gate-tmp"}' | grep -q '"ok":true'; ck "skillstore local install ok (P3-4)" $?
curl -s "$B/api/skills" | python -c "
import sys,json
d=json.load(sys.stdin)
t=[x for x in d if x['name']=='fuzz-gate-tmp']
assert t and t[0].get('origin')=={'source':'local','repo':'skills-repo'}, t
"; ck "api/skills exposes local origin after install (P3-4)" $?
post '{"name":"fuzz-gate-tmp","op":"uninstall"}' | grep -q '"ok":true'; ck "skillstore uninstall ok (P3-4)" $?
[ ! -d "$INST/fuzz-gate-tmp" ]; ck "uninstall removed skill dir (P3-4)" $?
rm -rf "$REPO/fuzz-gate-tmp"
# P2-2 实景①: market-over-market 原子更新——v1 装 → 缓存升 v2 → 再装=换名更新，dst 全新目录无合并残留
mkdir -p "$CACHE/fuzz-swap-tmp"
printf -- "$SKMD" fuzz-swap-tmp v1 > "$CACHE/fuzz-swap-tmp/SKILL.md"
post '{"name":"fuzz-swap-tmp","remote":true}' | grep -q '"ok":true'; ck "market install v1 ok (P2-2)" $?
grep -q 'description: v1' "$INST/fuzz-swap-tmp/SKILL.md"; ck "market install v1 lands in dst (P2-2)" $?
printf -- "$SKMD" fuzz-swap-tmp v2 > "$CACHE/fuzz-swap-tmp/SKILL.md"
post '{"name":"fuzz-swap-tmp","remote":true}' | grep -q '"ok":true'; ck "market-over-market update v2 ok (P2-2)" $?
grep -q 'description: v2' "$INST/fuzz-swap-tmp/SKILL.md" && ! grep -q 'description: v1' "$INST/fuzz-swap-tmp/SKILL.md" && [ ! -e "$INST/fuzz-swap-tmp.bak" ]; ck "v2 replaced v1 via rename-swap, no .bak leftover (P2-2)" $?
# P2-2 实景②+P3-1: 覆盖失败保旧版——缓存 origin.json 变目录卡死 writeSkillOrigin → 安装失败不假成功，旧版 v2 完好无 .tmp/.bak
mkdir -p "$CACHE/fuzz-swap-tmp/origin.json"
post '{"name":"fuzz-swap-tmp","remote":true}' | grep -q '安装失败'; ck "poisoned origin write fails install loudly (P3-1)" $?
grep -q 'description: v2' "$INST/fuzz-swap-tmp/SKILL.md" && grep -q '"source": "market"' "$INST/fuzz-swap-tmp/origin.json" && [ ! -e "$INST/fuzz-swap-tmp.tmp" ] && [ ! -e "$INST/fuzz-swap-tmp.bak" ]; ck "failed overwrite keeps old v2 intact, no tmp/bak debris (P2-2)" $?
rm -rf "$CACHE/fuzz-swap-tmp"
post '{"name":"fuzz-swap-tmp","op":"uninstall"}' >/dev/null; [ ! -d "$INST/fuzz-swap-tmp" ]; ck "cleanup: uninstalled after failed overwrite (P2-2)" $?
# P2-2 实景③: 缓存缺失走 walkApi 直拉——幽灵目录必败 → 安装失败，预置旧版完好（qa 复现路径的失败分支实证）
mkdir -p "$INST/fuzz-walk-tmp"
printf -- "$SKMD" fuzz-walk-tmp old > "$INST/fuzz-walk-tmp/SKILL.md"
printf '{"_schema":1,"source":"market","repo":"ghost/x","installed_at":"t"}' > "$INST/fuzz-walk-tmp/origin.json"
post '{"name":"fuzz-walk-tmp","remote":true}' | grep -q '安装失败'; ck "walkApi ghost fetch fails install friendly (P2-2)" $?
grep -q 'description: old' "$INST/fuzz-walk-tmp/SKILL.md" && [ ! -e "$INST/fuzz-walk-tmp.tmp" ] && [ ! -e "$INST/fuzz-walk-tmp.bak" ]; ck "walkApi failure keeps old version intact (P2-2)" $?
rm -rf "$INST/fuzz-walk-tmp"
# P2-1 XSS 向量端到端: evil repo（引号+img 标签）→ /api/skills 原样回传（JSON 层），渲染层 esc 断言在 badge-esc-probe
# 注：origin.json 里引号须 JSON 转义（\"），否则文件非法、originOf 容错成 null，向量根本到不了前端面
EVILJSON='a/b\"><img src=x onerror=alert(1)>'
mkdir -p "$INST/fuzz-xss-tmp"
printf -- "$SKMD" fuzz-xss-tmp x > "$INST/fuzz-xss-tmp/SKILL.md"
printf '{"_schema":1,"source":"market","repo":"%s","installed_at":"t"}' "$EVILJSON" > "$INST/fuzz-xss-tmp/origin.json"
curl -s "$B/api/skills" | python -c "
import sys,json
d=json.load(sys.stdin)
t=[x for x in d if x['name']=='fuzz-xss-tmp']
assert t and t[0]['origin'] and '<img' in t[0]['origin']['repo'] and '\"' in t[0]['origin']['repo'], t
"; ck "evil repo survives /api/skills raw (json layer, P2-1)" $?
rm -rf "$INST/fuzz-xss-tmp"
node "$(dirname "$0")/badge-esc-probe.js"; ck "badge esc neutralizes quote+img vector + obadge truncation css (P2-1)" $?
rm -rf "$REPO/fuzz-gate-tmp" "$INST/fuzz-gate-tmp" "$INST/fuzz-swap-tmp" "$INST/fuzz-swap-tmp.tmp" "$INST/fuzz-swap-tmp.bak" "$INST/fuzz-walk-tmp" "$INST/fuzz-xss-tmp" "$CACHE/fuzz-swap-tmp"; trap - EXIT
[ ! -d "$INST/fuzz-swap-tmp" ] && [ ! -d "$CACHE/fuzz-swap-tmp" ]; ck "P2-2/P3-4 fuzz temp skills cleaned up" $?
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
# s70 B2: subdir 白名单/origin·manifest source.subdir 记录——沙盒自拉桥探针（10 断言，明细随本日志留痕）
node "$(dirname "$0")/skill-sources-probe.js" c; ck "s70 B2 subdir whitelist + source.subdir install probe (10 asserts)" $?
# s70 B2: dev 桥在线断言——双源清单条目 source 均带 subdir（加键形态；缺键照常解析见探针 C8）
curl -s "$B/api/skillstore?remote=1" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('ok') is True and d.get('skills'), d.keys()
assert all(isinstance(s.get('source'),dict) and s['source'].get('subdir') for s in d['skills']), d['skills'][:2]
"; ck "skillstore remote source carries subdir (s70-B2)" $?
# s70 切片C: MCP 目录配置化——沙盒探针（首启生成/坏配置回落矩阵/回环/白名单随配置，明细随本日志留痕）
node "$(dirname "$0")/mcp-catalog-probe.js"; ck "s70 slice-C mcp-catalog config probe (7 asserts)" $?
# s70 切片C: dev 桥零回归——GET 3 条默认形状（installed/enabled/install 键在）
curl -s "$B/api/mcpstore" | python -c "
import sys,json
d=json.load(sys.stdin)
assert [x['id'] for x in d]==['sequential-thinking','memory-graph','fetch'], d
assert all('installed' in x and 'enabled' in x and 'install' in x for x in d), d[0]
"; ck "mcpstore GET default catalog shape (s70-C)" $?
# s70 切片C: dev 配置回环——增假条目→列表出现→删掉（零代码零重启；假条目不安装不出网）；坏 JSON 容错→还原
MC="$FR/data/config/mcp-catalog.json"
MCPBK="$(mktemp)"
curl -s "$B/api/mcpstore" >/dev/null; [ -f "$MC" ] || curl -s "$B/api/mcpstore" >/dev/null  # 首启生成
cp "$MC" "$MCPBK"
python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
d['catalog'].append({'id':'fuzz-mcp-zzz','name':'假条目','desc':'fuzz','pkg':'fuzz-pkg-zzz','entry':'node_modules/fuzz/fuzz.js','license':'MIT'})
json.dump(d,open(sys.argv[1],'w',encoding='utf-8'),indent=2,ensure_ascii=False)
" "$MC"
curl -s "$B/api/mcpstore" | grep -q 'fuzz-mcp-zzz'; ck "mcpstore config roundtrip add (s70-C)" $?
cp "$MCPBK" "$MC"
curl -s "$B/api/mcpstore" | python -c "
import sys,json
ids=[x['id'] for x in json.load(sys.stdin)]
assert 'fuzz-mcp-zzz' not in ids and len(ids)==3, ids
"; ck "mcpstore config roundtrip remove (s70-C)" $?
printf '{bad json' > "$MC"
curl -s "$B/api/mcpstore" | python -c "
import sys,json
assert [x['id'] for x in json.load(sys.stdin)]==['sequential-thinking','memory-graph','fetch']
"; ck "mcpstore bad-json fallback to builtin defaults (s70-C)" $?
curl -s "$B/api/update/status" | grep -q 'mcp-catalog.json'; ck "mcpstore bad-json warn surfaced (s70-C)" $?
[ "$(cat "$MC")" = "{bad json" ]; ck "mcpstore bad-json user file untouched (s70-C)" $?
cp "$MCPBK" "$MC"; rm -f "$MCPBK"
curl -s -X POST "$B/api/mcpstore" -H 'content-type: application/json' -d '{"id":"ghost-mcp-zzz"}' | grep -q '目录里没有这个 MCP'; ck "mcpstore install foreign id rejected, whitelist follows config (s70-C)" $?
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
