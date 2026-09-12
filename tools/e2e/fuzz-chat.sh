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
# s73 切片1（裁决 2026-09-06-pg-forge-backend）: 桥状态存储层——pg 字段形状 + 真写入 + 假端口回落路径
curl -s "$B/api/stats" | python -c "import sys,json;d=json.load(sys.stdin);assert d['pg'] in ('off','connecting','pg','file'), d['pg']"; ck "stats pg mode field enum (s73)" $?
node "$(dirname "$0")/pgstore-poll.js" "$B"; ck "pg mode establish + forge_bridge row via vendored client (s73)" $?
node "$(dirname "$0")/pgstore-probe.js"; ck "pgstore fake-port fallback probe (s73)" $?
# s73 切片2（裁决 2026-09-06-pg-forge-backend §7-切片2）: 无界增长族迁 PG——双表形状/幂等导入 + 归档/映射行生命周期 + P3-4 方向
node "$(dirname "$0")/pgstore-poll2.js" "$B"; ck "pg slice2: archive/wsmap table shape + idempotent import (s73b)" $?
node "$(dirname "$0")/pgstore-arch-roundtrip.js" "$B"; ck "pg slice2: archive index row lifecycle write+delete (s73b)" $?
node "$(dirname "$0")/pgstore-ws-roundtrip.js" "$B"; ck "pg slice2: workspace map row lifecycle write+delete (s73b)" $?
node "$(dirname "$0")/pgstore-p34-probe.js"; ck "pg slice2: P3-4 newer-PG-row not clobbered on reconcile (s73b)" $?
# s50b: db/overview 不收参数——垃圾 query 不影响响应形状（端点无用户输入面）
curl -s "$B/api/db/overview?ws=../../etc" | python -c "import sys,json;d=json.load(sys.stdin);assert 'services' in d"; ck "db overview traversal query ignored" $?
curl -s "$B/api/db/overview?service=x%27" | python -c "import sys,json;d=json.load(sys.stdin);assert 'services' in d"; ck "db overview quote query ignored" $?
# IA-3（裁决 docs/verdicts/2026-09-07-ia-root-cure.md §6-d 主控修正版）: 表说明读链——plm 库造 forge_table_info（含坏值行）
# → desc 带出+超长截断+坏值跳过 → 删表降级 desc=null 不炸（探针自建自清 plm.db，失败也兜底清理）
# 探针用 node:sqlite 造数：钉包内 node（dev PATH node 24 有 node:sqlite 退出期 libuv 断言崩溃，22.21.1 无）
FRX="$(cd "$(dirname "$0")/../.." && pwd)/forge"
command -v cygpath >/dev/null 2>&1 && FRX="$(cygpath -u "$FRX" 2>/dev/null || echo "$FRX")"
"$FRX/bin/node-v22/node-v22.21.1-win-x64/node.exe" "$(dirname "$0")/ia3-tinfo-probe.js" "$B"; ck "db overview desc carry + bad-value skip + drop degrade (IA-3)" $?
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
# qa 2026-09-06 三轮返工桩测：exppop 监听器恒1（30 delta 帧+关后再开）/ sync dirty 补跑不活锁 / 坏源降级+人话警告自愈 / P3-6 P3-5 源码钉子
node "$(dirname "$0")/qa3-round3-probe.js"; ck "qa3 round3: exppop single-listener + sync dirty-replay + bad-source degrade/warn + nails (21 asserts)" $?
rm -rf "$REPO/fuzz-gate-tmp" "$INST/fuzz-gate-tmp" "$INST/fuzz-swap-tmp" "$INST/fuzz-swap-tmp.tmp" "$INST/fuzz-swap-tmp.bak" "$INST/fuzz-walk-tmp" "$INST/fuzz-xss-tmp" "$CACHE/fuzz-swap-tmp"; trap - EXIT
[ ! -d "$INST/fuzz-swap-tmp" ] && [ ! -d "$CACHE/fuzz-swap-tmp" ]; ck "P2-2/P3-4 fuzz temp skills cleaned up" $?
# s70 切片B: 技能市场源配置化——沙盒自拉桥探针（明细随本日志留痕）
node "$(dirname "$0")/skill-sources-probe.js" a; ck "s70 slice-B manifest source migration probe (3 asserts)" $?
node "$(dirname "$0")/skill-sources-probe.js" b; ck "s70 slice-B skill-sources config probe (8 asserts)" $?
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
# s72: 市场源与目录管理端点 /api/config/market（用户 2026-09-06 点名推翻裁决否决项4「源管理无 UI」）
# 鉴权同门：跨站 Origin POST 403（handleHttp 顶部全局门）
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/config/market" -H 'Origin: http://evil.example' -H 'content-type: application/json' -d '{"op":"skill-add","repo":"a/b","branch":"main"}')" = "403" ]; ck "market evil origin 403 (s72)" $?
# 白名单/形态拒：repo/branch 穿越（RE 容 .. 但写侧禁）、subdir 非法、mcp 条目非法、未知 op、空 body
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"skill-add","repo":"../etc","branch":"main"}' | grep -q '仓库名需形如'; ck "market skill-add traversal repo rejected (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"skill-add","repo":"a/b","branch":"../x"}' | grep -q '分支名'; ck "market skill-add traversal branch rejected (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"skill-add","repo":"a/b","branch":"main","subdir":"../x"}' | grep -q '子目录不合法'; ck "market skill-add subdir traversal rejected (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"skill-add","repo":"a/b","branch":"main","subdir":"C:/x"}' | grep -q '子目录不合法'; ck "market skill-add subdir drive rejected (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"mcp-add","id":"-x","name":"n","desc":"d","pkg":"p","entry":"e","license":"MIT"}' | grep -q '条目不合法'; ck "market mcp-add leading-dash id rejected (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"mcp-add","id":"x","name":"n","desc":"d","pkg":"p;q","entry":"e","license":"MIT"}' | grep -q '条目不合法'; ck "market mcp-add bad pkg rejected (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"fly"}' | grep -q '未知操作'; ck "market unknown op rejected (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d 'null' | grep -q '未知操作'; ck "market null body rejected (s72)" $?
# GET 形状：ok + 双数组 + 源条目字段齐 + 目录条目带 installed/enabled 计算字段（同 mcpstore GET 门）
curl -s "$B/api/config/market" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('ok') is True and isinstance(d.get('skillSources'),list) and isinstance(d.get('mcpCatalog'),list), d.keys()
assert all(all(k in s for k in ('repo','branch','subdir','enabled')) for s in d['skillSources']), d['skillSources']
assert all(all(k in m for k in ('id','name','pkg','entry','license','installed','enabled')) for m in d['mcpCatalog']), d['mcpCatalog'][:1]
"; ck "market GET shape (s72)" $?
# 孤儿规则：已装项（fetch）拒删目录；未知条目人话拒
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"mcp-remove","id":"fetch"}' | grep -q '已安装，先在上方卸载'; ck "market mcp-remove installed refused (s72)" $?
curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d '{"op":"mcp-remove","id":"ghost-mcp-zzz"}' | grep -q '目录里没有这个条目'; ck "market mcp-remove unknown friendly (s72)" $?
# 合法回环（即用即恢复）：加假源→文件落地 latest _schema→GET 可见→重复拒→停用→最后一个启用拒→删到剩一→最后一个拒删
SS="$FR/data/config/skill-sources.json"; SSBK="$(mktemp)"
cp "$SS" "$SSBK"
trap 'cp "$SSBK" "$SS" 2>/dev/null; rm -f "$SSBK"' EXIT
mp(){ curl -s -X POST "$B/api/config/market" -H 'content-type: application/json' -d "$1"; }
mp '{"op":"skill-add","repo":"fuzz-org/fuzz-repo","branch":"main","subdir":"skills"}' | grep -q '"ok":true'; ck "market skill-add ok (s72)" $?
grep -q 'fuzz-org/fuzz-repo' "$SS" && python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
assert d['_schema']==2, d['_schema']
" "$SS"; ck "market skill-add persisted at latest schema (s72)" $?
mp '{"op":"skill-add","repo":"fuzz-org/fuzz-repo","branch":"main"}' | grep -q '已经在列表里'; ck "market skill-add duplicate rejected (s72)" $?
# qa 三轮返工 P3-3：branch 长度 {1,64} 写侧收紧——64 收（落盘+随删恢复）、65/200 拒（读取器容错不动，存量长配置仍可读）
BR64=$(python -c "print('b'*64)")
mp "{\"op\":\"skill-add\",\"repo\":\"fuzz-org/branch-cap\",\"branch\":\"$BR64\"}" | grep -q '"ok":true'; ck "market skill-add 64-char branch boundary accepted (qa3 P3-3)" $?
grep -q "\"branch\": \"$BR64\"" "$SS"; ck "market 64-char branch persisted to config (qa3 P3-3)" $?
mp "{\"op\":\"skill-remove\",\"repo\":\"fuzz-org/branch-cap\",\"branch\":\"$BR64\"}" | grep -q '"ok":true'; ck "market branch-cap source removed (qa3 P3-3 cleanup)" $?
mp "{\"op\":\"skill-add\",\"repo\":\"fuzz-org/fuzz-repo2\",\"branch\":\"$(python -c "print('b'*65)")\"}" | grep -q '分支名太长'; ck "market skill-add 65-char branch rejected (qa3 P3-3)" $?
mp "{\"op\":\"skill-add\",\"repo\":\"fuzz-org/fuzz-repo2\",\"branch\":\"$(python -c "print('b'*200)")\"}" | grep -q '分支名太长'; ck "market skill-add 200-char branch rejected (qa3 P3-3)" $?
mp '{"op":"skill-toggle","repo":"anthropics/skills","branch":"main","enabled":false}' | grep -q '"ok":true'; ck "market skill-toggle disable ok (s72)" $?
curl -s "$B/api/config/market" | python -c "
import sys,json
d=json.load(sys.stdin)
s=[x for x in d['skillSources'] if x['repo']=='anthropics/skills'][0]
assert s['enabled'] is False, s
"; ck "market GET reflects toggle (s72)" $?
mp '{"op":"skill-toggle","repo":"JimLiu/baoyu-skills","branch":"main","enabled":false}' >/dev/null
mp '{"op":"skill-toggle","repo":"fuzz-org/fuzz-repo","branch":"main","enabled":false}' | grep -q '至少要保留一个启用中的技能源'; ck "market disable-last-enabled refused (s72)" $?
mp '{"op":"skill-remove","repo":"JimLiu/baoyu-skills","branch":"main"}' >/dev/null
mp '{"op":"skill-remove","repo":"fuzz-org/fuzz-repo","branch":"main"}' | grep -q '至少要保留一个'; ck "market remove-last-source refused (s72)" $?
cp "$SSBK" "$SS"
# mcp 目录回环：加假条目→GET 可见→删→消失（零代码零重启；假条目不安装不出网）
MC2="$FR/data/config/mcp-catalog.json"; MCPBK2="$(mktemp)"
cp "$MC2" "$MCPBK2"
mp '{"op":"mcp-add","id":"fuzz-mcp-zzz","name":"假条目","desc":"fuzz","pkg":"fuzz-pkg-zzz","entry":"node_modules/fuzz/fuzz.js","license":"MIT"}' | grep -q '"ok":true'; ck "market mcp-add ok (s72)" $?
curl -s "$B/api/config/market" | grep -q 'fuzz-mcp-zzz'; ck "market mcp-add visible in GET (s72)" $?
mp '{"op":"mcp-remove","id":"fuzz-mcp-zzz"}' | grep -q '"ok":true'; ck "market mcp-remove ok (s72)" $?
curl -s "$B/api/config/market" | python -c "
import sys,json
d=json.load(sys.stdin)
assert 'fuzz-mcp-zzz' not in [x['id'] for x in d['mcpCatalog']], d['mcpCatalog']
"; ck "market mcp-remove gone from GET (s72)" $?
cp "$MCPBK2" "$MC2"
# 坏 JSON 容错不被写侧绕过：源文件坏→GET 仍回落默认 ok:true 且读路径不改用户文件；UI 写入顺带修复（有效视图落地）
printf '{bad json' > "$SS"
curl -s "$B/api/config/market" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('ok') is True and len(d['skillSources'])>=1, d
"; ck "market GET bad-json fallback (s72)" $?
[ "$(cat "$SS")" = "{bad json" ]; ck "market GET leaves user file untouched (s72)" $?
mp '{"op":"skill-add","repo":"fuzz-org/fuzz-repo","branch":"main"}' | grep -q '"ok":true'; ck "market skill-add repairs broken config (s72)" $?
python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
assert any(s['repo']=='fuzz-org/fuzz-repo' for s in d['sources']), d
" "$SS"; ck "market repaired file valid with new source (s72)" $?
cp "$SSBK" "$SS"; rm -f "$SSBK" "$MCPBK2"; trap - EXIT
# S1: /api/report 门禁矩阵——POST/HEAD 405；GET 走端点级 Origin 门（不豁免 GET）+ 自定义头 X-PF-Report: 1（img/no-cors 发不出）
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/report")" = "405" ]; ck "report POST refused 405" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' -I "$B/api/report")" = "405" ]; ck "report HEAD refused 405" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-PF-Report: 1' -H 'Origin: http://evil.example' "$B/api/report")" = "403" ]; ck "report evil origin + header refused 403" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/report")" = "403" ]; ck "report missing X-PF-Report refused 403" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-PF-Report: 0' "$B/api/report")" = "403" ]; ck "report wrong X-PF-Report value refused 403" $?
# v0.9.10 离线升级 sha256 通道（裁决 docs/verdicts/2026-09-05-offline-upgrade-sha.md c 方案，s69 遗留⑨）
# 小文件构造场景：UPD=dev 树 data/updates，fuzz-* 即用即清（trap 兜底）；zip 魔数/字节数/哈希自算自验+失败清理
UPD="$FR/data/updates"; UZ="PocketForge-fuzz-upl.zip"; US="PocketForge-fuzz-upl.zip.sha256"; UZT="$(mktemp -u).zip"; UZD="PocketForge-fuzz-dstdir.zip"
mkdir -p "$UPD"
trap 'rm -rf "$UPD/$UZ" "$UPD/$UZ".*.part "$UPD/$US" "$UZT" "$UPD/$UZD"' EXIT
curl -s -X POST "$B/api/update/upload?name=evil.exe" --data-binary 'x' | grep -q '文件名需形如'; ck "update upload bad zip name rejected (v0.9.10)" $?
curl -s -X POST "$B/api/update/upload?name=PocketForge-fuzz-bad.sha256" --data-binary 'zz' | grep -q '校验文件名需形如'; ck "update upload bad sha name rejected (v0.9.10)" $?
printf '%064d  %s\n' 0 "$UZ" | curl -s -X POST "$B/api/update/upload?name=$US" --data-binary @- | grep -q '请先上传安装包'; ck "update upload sha-before-zip friendly (v0.9.10)" $?
[ ! -e "$UPD/$US" ]; ck "update upload sha-before-zip writes nothing (v0.9.10)" $?
# qa返工(P3-2): 校验文件 64KB 超限分支——>65536 字节必须拒
python -c "import sys; sys.stdout.buffer.write(b'0'*65537)" | curl -s -X POST "$B/api/update/upload?name=$US" --data-binary @- | grep -q '校验文件过大'; ck "update upload sha256 over-64KB rejected (qa P3-2)" $?
# qa返工(P3-1): 落位失败分支（目标名被目录占用→rename 必败）错误人话化——响应为人话且不泄漏内部路径
mkdir -p "$UPD/$UZD"
printf 'PK\x03\x04poison' | curl -s -X POST "$B/api/update/upload?name=$UZD" --data-binary @- | python -c "
import sys,json
raw=sys.stdin.read()
assert 'C:' not in raw and '/conf/' not in raw and 'ENOENT' not in raw, raw
d=json.loads(raw)
assert d.get('ok') is False and '落位失败' in d.get('err',''), d
"; ck "update upload rename failure humanized, no path leak (qa P3-1)" $?
rm -rf "$UPD/$UZD"
curl -s -X POST "$B/api/update/upload?name=$UZ" --data-binary 'not a zip at all' | grep -q '不是有效的安装包'; ck "update upload magic rejected (v0.9.10)" $?
[ ! -e "$UPD/$UZ" ] && [ -z "$(ls "$UPD/$UZ".*.part 2>/dev/null)" ]; ck "update upload magic leaves no residue (v0.9.10)" $?
# 字节数不符（声明 1000 实发 10+半关）：Node HTTP 层协议级 400 拒（业务层对账仍兜底），零残留
python - "$B" "$UZ" <<'PYEOF'
import socket,sys
host, port = sys.argv[1].replace('http://','').split(':')
s = socket.create_connection((host, int(port)), timeout=5)
s.sendall(('POST /api/update/upload?name=%s HTTP/1.1\r\nHost: %s\r\nContent-Type: application/octet-stream\r\nContent-Length: 1000\r\n\r\nshort-body' % (sys.argv[2], sys.argv[1])).encode())
s.shutdown(socket.SHUT_WR)
data = s.recv(4096).decode('utf8','replace')
sys.exit(0 if (' 400 ' in data or 'ok":false' in data) and ' 200 ' not in data else 1)
PYEOF
ck "update upload short body rejected (v0.9.10)" $?
[ ! -e "$UPD/$UZ" ] && [ -z "$(ls "$UPD/$UZ".*.part 2>/dev/null)" ]; ck "update upload short body leaves no residue (v0.9.10)" $?
python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('m.txt','pf-fuzz-payload'); z.close()" "$UZT"
curl -s -X POST "$B/api/update/upload?name=$UZ" --data-binary @"$UZT" | grep -q '"ok":true'; ck "update upload valid zip staged (v0.9.10)" $?
printf '%064d  %s\n' 0 "$UZ" | curl -s -X POST "$B/api/update/upload?name=$US" --data-binary @- | grep -q '校验不一致'; ck "update upload hash mismatch rejected (v0.9.10)" $?
[ ! -e "$UPD/$US" ] && [ -e "$UPD/$UZ" ]; ck "update upload mismatch keeps zip, writes no sha (v0.9.10)" $?
H="$(sha256sum "$UZT" | cut -d' ' -f1)"
printf '%s  %s\n' "$H" "$UZ" | curl -s -X POST "$B/api/update/upload?name=$US" --data-binary @- | grep -q '"verified":true'; ck "update upload matched pair verified (v0.9.10)" $?
grep -qE '^[0-9a-f]{64}' "$UPD/$US"; ck "update upload sha256 landed, runner-parseable (v0.9.10)" $?
curl -s "$B/api/update/status" | grep -q "$UZ"; ck "update status lists staged zip (v0.9.10)" $?
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/update/upload?name=$UZ" -H 'Origin: http://evil.example' --data-binary 'x')" = "403" ]; ck "update upload evil origin 403 (v0.9.10)" $?
python - "$B" <<'PYEOF'
import socket,sys
host, port = sys.argv[1].replace('http://','').split(':')
s = socket.create_connection((host, int(port)), timeout=5)
s.sendall(('POST /api/memory HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: 52428801\r\n\r\n{"a"' % sys.argv[1]).encode())
data = s.recv(4096).decode('utf8','replace')
sys.exit(0 if (' 413 ' in data or ' 413' in data or data == '') else 1)
PYEOF
ck "s50c oversized non-upload POST still rejected, upload exemption not leaked (v0.9.10)" $?
rm -rf "$UPD/$UZ" "$UPD/$UZ".*.part "$UPD/$US" "$UZT" "$UPD/$UZD"; trap - EXIT
[ ! -e "$UPD/$UZ" ] && [ ! -e "$UPD/$US" ] && [ -z "$(ls "$UPD/$UZ".*.part 2>/dev/null)" ]; ck "v0.9.10 upload fuzz cleaned up" $?
# s76: vision --set-model 注入矩阵收编（qa P2-1 转正探针，F1-F7 七断言逐案计数；探针自含沙盒零副作用）
for vf in F1 F2 F3 F4 F5 F6 F7; do node "$(dirname "$0")/vision-fuzz-probe.js" "$vf" >/dev/null 2>&1; ck "vision-fuzz $vf set-model injection (s76)" $?; done
# ===== fuzz-v2 五面新增（夜批 22732d1/6d94f3a/3f80ca9/8f0e6e2/b4e02d2/367b57a/166607a/e9f04ee）=====
# 面4 readJsonBody/json200（8f0e6e2 样板收敛 + b4e02d2 签名回滚）：随机 POST 体 × 5 端点抽样——
# 坏 JSON/BOM 头/超深嵌套/1MB 超长值：友好 JSON 错误、不 500 不崩不泄漏（累积断开防线由下方预算边界钉）
JL(){ python -c "
import sys,json
raw=sys.stdin.read()
try:
    json.loads(raw)
except Exception:
    sys.exit(1)
sys.exit(0 if ('C:' not in raw and '/conf/' not in raw and 'ENOENT' not in raw) else 1)"; }
for EP in /api/memory /api/schedules /api/config/market /api/extensions /api/prompts; do
  curl -s -m 10 -X POST "$B$EP" -H 'content-type: application/json' -d '{"op":' | JL; ck "readJsonBody $EP truncated JSON friendly (fuzz-v2)" $?
  printf '\xEF\xBB\xBF{"op":"list"}' | curl -s -m 10 -X POST "$B$EP" -H 'content-type: application/json' --data-binary @- | JL; ck "readJsonBody $EP BOM-prefixed JSON friendly (fuzz-v2)" $?
  python -c "import sys; sys.stdout.write('['*100000)" | curl -s -m 15 -X POST "$B$EP" -H 'content-type: application/json' --data-binary @- | JL; ck "readJsonBody $EP 100k deep nesting friendly (fuzz-v2)" $?
  python -c "import sys; sys.stdout.write('{\"op\":\"x\",\"t\":\"' + 'x'*1000000 + '\"}')" | curl -s -m 15 -X POST "$B$EP" -H 'content-type: application/json' --data-binary @- | JL; ck "readJsonBody $EP 1MB long value friendly (fuzz-v2)" $?
done
# 预算边界 ±1：恰 50MB 不触发累积断开（> 严格比较），50MB+1 头部门 413
BFT="$(mktemp)"
python -c "
import sys
head = '{\"op\":\"x\",\"t\":\"'; tail = '\"}'; pad = 52428800 - len(head) - len(tail)
sys.stdout.write(head + 'y'*pad + tail)" > "$BFT"
curl -s -m 60 -X POST "$B/api/memory" -H 'content-type: application/json' --data-binary @"$BFT" | JL; ck "readJsonBody exact-50MB passes cumulative guard, friendly err (fuzz-v2)" $?
python -c "import sys; sys.stdout.write('[' * 52428801)" > "$BFT"
[ "$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X POST "$B/api/memory" -H 'content-type: application/json' --data-binary @"$BFT")" = "413" ]; ck "readJsonBody 50MB+1 rejected 413 at header gate (fuzz-v2)" $?
rm -f "$BFT"
# chunked 畸形（垃圾 chunk-size 行）与 CL 谎报（声明 10 实发更多+流水线垃圾）：协议级 400/断开，桥存活
python - "$B" <<'PYEOF'
import socket, sys
host, port = sys.argv[1].replace('http://','').split(':')
s = socket.create_connection((host, int(port)), timeout=8)
s.sendall(b'POST /api/memory HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\nzzzz\r\nnot-a-chunk-size\r\n')
s.settimeout(3)
try:
    data = s.recv(4096).decode('utf8','replace')
except Exception:
    data = '(closed)'
s.close()
sys.exit(0 if (' 400 ' in data or data == '(closed)' or data == '') and ' 200 ' not in data else 1)
PYEOF
ck "readJsonBody chunked garbage chunk-size rejected protocol-level (fuzz-v2)" $?
python - "$B" <<'PYEOF'
import socket, sys, urllib.request
host, port = sys.argv[1].replace('http://','').split(':')
s = socket.create_connection((host, int(port)), timeout=8)
s.sendall(b'POST /api/memory HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 10\r\n\r\n{"op":1}GARBAGE-PIPELINE-NOT-A-REQUEST\r\n\r\n')
s.settimeout(3)
try:
    data = s.recv(8192).decode('utf8','replace')
except Exception:
    data = '(closed)'
s.close()
ok_resp = (' 400 ' in data or 'ok":false' in data or data == '(closed)' or data == '')
ok_alive = urllib.request.urlopen('http://%s:%s/healthz' % (host, port), timeout=5).read().decode() == 'ok'
sys.exit(0 if ok_resp and ok_alive else 1)
PYEOF
ck "readJsonBody CL-lie pipeline garbage rejected, bridge alive (fuzz-v2)" $?
# 面1 健康探测（22732d1/e9f04ee/166607a）：/models 畸形响应四态判定 + 入站畸形帧（探针自建沙盒）
node "$(dirname "$0")/health-probe-fuzz.js" >/dev/null 2>&1; ck "health-probe /models malformed 4-state fuzz, 24 asserts (fuzz-v2)" $?
# 面2 代际守卫（6d94f3a P1-A/P2-B）：20 客户端乱序轰炸 + 毁线窗（探针自建沙盒，种子化可复现）
node "$(dirname "$0")/ws-genesis-fuzz.js" >/dev/null 2>&1; ck "ws genesis-guard 20-client bombardment fuzz, 9 asserts (fuzz-v2)" $?
# 面5 SSE 重试阶梯（6d94f3a P2-A/367b57a C3）：mock 畸形流——重试不失控不双发（探针自建沙盒）
node "$(dirname "$0")/sse-ladder-fuzz.js" >/dev/null 2>&1; ck "SSE retry-ladder malformed stream fuzz, 36 asserts (fuzz-v2)" $?
# 面3 maskKeys（3f80ca9/166607a P3-2）：显示层掩码随机 key 形态（静态纯函数探针）
node "$(dirname "$0")/mask-fuzz-probe.js" >/dev/null 2>&1; ck "maskKeys display-layer random key-form fuzz, 8 asserts (fuzz-v2)" $?
echo "=============================="
echo "fuzz: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
}
# tee 双写（终端+留痕文件）；PIPESTATUS 保住 main 的退出码，不用 $(...|tail) 类管道写法（项目挂死先例）
main "$@" 2>&1 | tee "$LOG"
exit "${PIPESTATUS[0]}"
