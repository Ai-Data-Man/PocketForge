# P31/s18 聊天客户端链路 E2E（开发机跑；s15 审查 M7 建议落地）
# 覆盖：工作区生命周期（new/bind/delete+归档护栏）+ 文件管理（new/rename/delete）
#      + 上传/附件身份 + 版本管理（rename 自动快照→log→blob→restore）
#      + 护栏：当前会话区不可删。纯 HTTP 断言，不依赖 LLM。
# 前置：栈已在跑（chat-bridge :8790）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FORGE="$ROOT/forge"
PASS=0; FAIL=0
ck(){ if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi }
B=http://127.0.0.1:8790
curl -s --max-time 3 "$B/healthz" | grep -q ok; ck "bridge up" $?

SID="e2e-chat-$(date +%s)"
J() { python -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d,ensure_ascii=False))"; }

# ---------- 1) 工作区创建（幂等性一并验证） ----------
W1=$(curl -s "$B/api/ws/new?sid=$SID" | python -c "import sys,json;print(json.load(sys.stdin).get('ws',''))")
[ -n "$W1" ]; ck "ws/new creates workspace ($W1)" $?
W2=$(curl -s "$B/api/ws/new?sid=$SID" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('ws','')+'|'+str(d.get('existed',False)))")
[ "$W2" = "$W1|True" ]; ck "ws/new idempotent for same sid" $?

# ---------- 2) 文件管理：新建→改名（触发自动快照）→目录树 ----------
curl -s -X POST "$B/api/fs/new" -H 'content-type: application/json' -d "{\"ws\":\"$W1\",\"path\":\"report.md\",\"type\":\"file\"}" | grep -q '"ok":true'; ck "fs/new file" $?
printf '第一版内容\n' > /tmp/e2e-v1.md
curl -s -X POST "$B/api/upload?ws=$W1&name=note-v1.md" --data-binary @/tmp/e2e-v1.md | grep -q '"ok":true'; ck "upload note-v1.md" $?
curl -s -X POST "$B/api/fs/rename" -H 'content-type: application/json' -d "{\"ws\":\"$W1\",\"path\":\"note-v1.md\",\"name\":\"note-v2.md\"}" | grep -q '"ok":true'; ck "fs/rename (auto snapshot)" $?
curl -s "$B/api/ws/tree?ws=$W1" | grep -q 'note-v2.md'; ck "ws/tree shows renamed file" $?

# ---------- 3) 版本管理：log/blob/restore ----------
N=$(curl -s "$B/api/vcs/log?ws=$W1&file=note-v2.md" | python -c "import sys,json;print(len(json.load(sys.stdin).get('versions',[])))")
[ "$N" -ge 1 ]; ck "vcs/log has >=1 version (got $N)" $?
OID=$(curl -s "$B/api/vcs/log?ws=$W1&file=note-v2.md" | python -c "import sys,json;print(json.load(sys.stdin)['versions'][0]['oid'])")
BODY=$(curl -s "$B/api/vcs/blob?ws=$W1&file=note-v2.md&oid=$OID")
echo "$BODY" | grep -q "第一版内容"; ck "vcs/blob roundtrip content" $?
curl -s -X POST "$B/api/vcs/restore" -H 'content-type: application/json' -d "{\"ws\":\"$W1\",\"file\":\"note-v2.md\",\"oid\":\"$OID\"}" | grep -q '"ok":true'; ck "vcs/restore to snapshot" $?

# ---------- 4) 附件身份（.forge 与改名联动） ----------
A=$(curl -s "$B/api/ws/tree?ws=$W1" | python -c "import sys,json;print(json.load(sys.stdin).get('attachments',[]).__str__())")
echo "$A" | grep -q "note-v2.md"; ck "attachment identity follows rename" $?

# ---------- 5) 生命周期：归档后可删 / 活跃护栏 ----------
curl -s -X POST "$B/api/sessions/archive" -H 'content-type: application/json' -d "{\"sid\":\"$SID\",\"archived\":true}" | grep -q '"ok":true'; ck "archive session" $?
# 绑定归档会话的区：不带 curSid 可删（前端活跃会话才带）
curl -s -X POST "$B/api/ws/delete" -H 'content-type: application/json' -d "{\"ws\":\"$W1\"}" | grep -q '"ok":true'; ck "delete archived-bound workspace" $?
# 活跃护栏：新建区并声明它是当前会话的区 → 删除必须被拒
W3=$(curl -s "$B/api/ws/new?sid=$SID-act" | python -c "import sys,json;print(json.load(sys.stdin).get('ws',''))")
curl -s -X POST "$B/api/ws/delete" -H 'content-type: application/json' -d "{\"ws\":\"$W3\",\"sid\":\"$SID-act\"}" | grep -q '不能删'; ck "active workspace delete refused" $?
curl -s -X POST "$B/api/ws/delete" -H 'content-type: application/json' -d "{\"ws\":\"$W3\"}" | grep -q '"ok":true'; ck "cleanup: delete without curSid" $?

# ---------- 6) workspaces 视角 ----------
curl -s "$B/api/workspaces" | python -c "
import sys,json
d=json.load(sys.stdin)
assert isinstance(d,list) and len(d)>=0
for w in d: assert {'id','files','bytes','mtime','sid','title','state'} <= set(w)
print('workspaces-shape-ok')" | grep -q shape-ok; ck "workspaces list shape" $?

# ---------- 7) 聊天记录搜索（s21） ----------
curl -s "$B/api/search?q=perm-probe" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d['ok'] and isinstance(d['hits'],list) and len(d['hits'])>=1
h=d['hits'][0]
assert {'sid','title','role','ts','frag'} <= set(h)
print('search-ok')" | grep -q search-ok; ck "chat history search finds seeded text" $?
curl -s "$B/api/search?q=x" | grep -q '"hits":\[\]'; ck "search short-query returns empty" $?

# ---------- 8) 数据库总览（s50b /api/db/overview） ----------
curl -s "$B/api/db/overview" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d['ok'] is True
svcs={s['service']:s for s in d['services']}
assert 'plm' in svcs and len(svcs['plm']['tables'])>=1
for s in d['services']:
    for t in s['tables']: assert t['rows'] is None or isinstance(t['rows'],int)
print('db-overview-ok')" | grep -q db-overview-ok; ck "db/overview 200 ok:true with plm+tables" $?
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/db/overview")
[ "$CODE" = "405" ]; ck "db/overview POST refused 405 (got $CODE)" $?
curl -s "$B/api/db/overview" | grep -qviE 'apikey|X-API-Key'; ck "db/overview no apikey leak" $?

# ---------- 9) 单表结构+样例（s51 /api/db/_schema） ----------
curl -s "$B/api/db/_schema?svc=plm&tbl=parts" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d['ok'] is True and d['columns'] and isinstance(d['samples'],list)
cols={c['name']:c for c in d['columns']}
assert 'id' in cols and cols['id']['pk'] is True
assert cols['id']['raw_type']=='INTEGER'
for c in d['columns']: assert set(c)>={'name','raw_type','pk'}
print('dbschema-ok')" | grep -q dbschema-ok; ck "db/_schema returns columns+samples with pk" $?
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/db/_schema")
[ "$CODE" = "405" ]; ck "db/_schema POST refused 405 (got $CODE)" $?
curl -s "$B/api/db/_schema?svc=plm&tbl=no_such_tbl" | grep -q '"ok":false'; ck "db/_schema unknown table ok:false" $?
curl -s --get "$B/api/db/_schema" --data-urlencode "svc=../etc" --data-urlencode "tbl=passwd" | grep -q '"ok":false'; ck "db/_schema rejects path-ish names" $?
curl -s --get "$B/api/db/_schema" --data-urlencode "svc=plm" --data-urlencode "tbl=parts" | grep -qviE 'apikey|X-API-Key'; ck "db/_schema no apikey leak" $?

# ---------- 10) 诊断报告（/api/report） ----------
# S1: 端点要求自定义头 X-PF-Report: 1（缺失→403），本节所有 curl 必须带头
R=$(curl -s --max-time 30 -H 'X-PF-Report: 1' "$B/api/report")
echo "$R" | grep -q '"ok":true'; ck "api/report ok:true" $?
RP=$(echo "$R" | python -c "import sys,json;print(json.load(sys.stdin).get('path',''))" 2>/dev/null)
RPU=${RP//\\//}
[ -n "$RPU" ] && [ -f "$RPU" ]; ck "api/report file exists on disk ($RP)" $?
grep -q 'VERSION' "$RPU"; ck "report contains version section" $?
if grep -qE '\bsk-[A-Za-z0-9][A-Za-z0-9_-]{3,}' "$RPU"; then ck "report sanitized: no sk- keys" 1; else ck "report sanitized: no sk- keys" 0; fi
# memory 内容特征：memory/ 目录绝不读取（目录有内容则 grep 其特征；空目录退化为路径特征）
MEMFEAT=$(ls "$FORGE/conf/goose/config/memory/"*.txt 2>/dev/null | head -1 | xargs -r grep -h -m1 -v -e '^\s*#' -e '^\s*$' 2>/dev/null | head -c 30 || true)
if [ -n "$MEMFEAT" ]; then
  if grep -qF "$MEMFEAT" "$RPU"; then ck "report has no memory content" 1; else ck "report has no memory content" 0; fi
else
  if grep -qi 'config.memory' "$RPU"; then ck "report has no memory content" 1; else ck "report has no memory content" 0; fi
fi
# S2 脱敏断言：喂入含 GH_TOKEN 明文的素材（未来日期 stats 文件必进报告「最近7天」窗口），生成文件里明文必须被整行替换
FAKE="$FORGE/data/stats/usage-20990101.json"
mkdir -p "$FORGE/data/stats"
printf '{\n  "note": "GH_TOKEN=ghp_e2esanitizerprobe000000"\n}\n' > "$FAKE"
R2=$(curl -s --max-time 30 -H 'X-PF-Report: 1' "$B/api/report")
RP2=$(echo "$R2" | python -c "import sys,json;print(json.load(sys.stdin).get('path',''))" 2>/dev/null)
RPU2=${RP2//\\//}
if [ -f "$RPU2" ] && ! grep -q 'ghp_e2esanitizerprobe000000' "$RPU2" && grep -q '<已脱敏>' "$RPU2"; then ck "report sanitized: GH_TOKEN plaintext dropped" 0; else ck "report sanitized: GH_TOKEN plaintext dropped" 1; fi
rm -f "$FAKE"

# ---------- 11) WS delete_session 回执（s62/P3: 请求者收到回执且连接随后被服务端关闭） ----------
node "$ROOT/tools/e2e/ws-delete-receipt.js" | grep -q "PASS"; ck "ws delete_session receipt delivered before close" $?

rm -f /tmp/e2e-v1.md
echo "=============================="
echo "chat-link E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
