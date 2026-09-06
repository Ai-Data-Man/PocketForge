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
# healthz=HTTP 层就绪；ACP 就绪由探针侧 hello.caps.modes 就绪门保证（research/15，见 ws-delete-receipt.js）
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
# 输出先落地 tmp 文件再 grep：grep -q 提前退出关管道会让 node 偶发 EPIPE，pipefail 下中止全量
node "$ROOT/tools/e2e/ws-delete-receipt.js" > /tmp/ws-delete-receipt.log 2>&1
grep -q "PASS" /tmp/ws-delete-receipt.log; ck "ws delete_session receipt delivered before close" $?
rm -f /tmp/ws-delete-receipt.log

# ---------- 11b) delete_session 发 ACP session/close → extension 进程树回收（s75/research/17） ----------
# 自相对断言（基线→建会话增长→删→回基线），1s 有界轮询；详见 tools/e2e/ws-close-reclaim.js
node "$ROOT/tools/e2e/ws-close-reclaim.js" > /tmp/ws-close-reclaim.log 2>&1
grep -q "PASS" /tmp/ws-close-reclaim.log; ck "ws delete_session reclaims extension process tree" $?
grep -E "^PROBE-C" /tmp/ws-close-reclaim.log || true
rm -f /tmp/ws-close-reclaim.log

# ---------- 12) 报告 v2 探针（s65 转正自 s64 tmp 探针；详见 tools/e2e/report-probe.sh） ----------
# static=39 ck 秒级；sandbox=29 ck 自建沙箱真桥（端口 18790/18799，不碰 dev 栈 8790），实测增量约 31-47s < 90s 门槛 → 挂进全量
bash "$ROOT/tools/e2e/report-probe.sh" static > /tmp/report-probe-e2e.log 2>&1; ck "report v2 static probe 39 ck" $?
bash "$ROOT/tools/e2e/report-probe.sh" sandbox >> /tmp/report-probe-e2e.log 2>&1; ck "report v2 sandbox probe 29 ck (ports 18790/18799)" $?
grep -E "^report-probe" /tmp/report-probe-e2e.log
rm -f /tmp/report-probe-e2e.log

# ---------- 13) PG 备份链两态（s66/ADR-0011 阶段二：导出先行；跑在栈上，pg 由 pc 托管） ----------
PC_PORT=$(cat "$FORGE/data/pc.port" 2>/dev/null || echo 8099)
PC="$FORGE/bin/pc/process-compose.exe"
PCRUN(){ timeout 20 env PC_DISABLE_TUI=1 "$PC" -p "$PC_PORT" "$@" </dev/null 2>/dev/null | grep -viE 'debug|duplicate'; }
wait_backup_done(){ for i in $(seq 1 40); do sleep 2; grep -q "$1" "$FORGE/data/logs/backup.log" 2>/dev/null && return 0; done; return 1; }
# 态B0（fc948e9 回归守卫）：空 pg-dumps + PG 不在场 = 冷启致命态。seed 前先走一遍，
# 守卫（pg-dumps 无 pg-*.sql 不入 SOURCES）若被撤，Compress-Archive -Update 追加空目录会 exit 0 且删 zip → statSync ENOENT 崩溃。
PCRUN process stop pg >/dev/null
rm -f "$FORGE/data/pg-dumps/"pg-*.sql
BEFORE0=$(ls -t "$FORGE/data/backups/"forge-backup-*.zip 2>/dev/null | head -1 || true)
PCRUN process start daily-backup >/dev/null
wait_backup_done 'backup ok' || true
if tail -1 "$FORGE/data/logs/backup.log" | grep -q 'backup ok'; then ck "backup state-B0: cold-start empty pg-dumps backup ok" 0; else ck "backup state-B0: cold-start empty pg-dumps backup ok" 1; fi
NEWZ0=$(ls -t "$FORGE/data/backups/"forge-backup-*.zip 2>/dev/null | head -1 || true)
# zip 完整断言锚定"本轮产出"（NEWZ0 必须是新文件）：撤守卫时 -Update 删 zip → 无新 zip → FAIL，旧 zip 不许顶包
if [ -n "$NEWZ0" ] && [ "$NEWZ0" != "$BEFORE0" ] && unzip -t "$NEWZ0" > /tmp/e2e-zipb0.txt 2>&1; then ck "backup state-B0: cold-start empty pg-dumps zip intact" 0; else ck "backup state-B0: cold-start empty pg-dumps zip intact" 1; fi
rm -f /tmp/e2e-zipb0.txt
# 复原 pg 并等探活回绿（态A 需要真实 dump 成功）
PCRUN process start pg >/dev/null
PR0=1; for i in $(seq 1 12); do sleep 5; ST0=$(PCRUN process get pg); echo "$ST0" | grep -q Ready && { PR0=0; break; }; done
ck "backup state-B0: pg Ready again before state-A" $PR0
mkdir -p "$FORGE/data/pg-dumps"
for s in 01 02 03; do printf 'e2e-seed\n' > "$FORGE/data/pg-dumps/pg-1999-01-${s}T00-00-00.sql"; done
# 态A：PG 在场——真实 dump 产出 + keep 3 生效 + zip 含 pg-dumps 条目
PCRUN process start daily-backup >/dev/null
wait_backup_done 'backup ok' || true   # 完成门：backup.log 每次 pc 重跑即重建，末行 backup ok=本轮收尾
if grep -q 'pg_dump ok' "$FORGE/data/logs/backup.log"; then ck "backup state-A: pg_dump ok into data/pg-dumps (PG present)" 0; else ck "backup state-A: pg_dump ok into data/pg-dumps (PG present)" 1; fi
NEWU=$(ls -t "$FORGE/data/pg-dumps/"pg-*.sql | head -1)
if grep -q 'PostgreSQL database dump' "$NEWU"; then ck "backup state-A: newest dump has PostgreSQL dump marker" 0; else ck "backup state-A: newest dump has PostgreSQL dump marker" 1; fi
# s73: glob 收窄为 pg-[0-9]*（PG 切片1 起 pg-dumps 目录共存三族——每日主库 pg-YYYYMMDD/桥库 pg-bridge-*/迁移留档 forge-bridge-pre-*，各族独立 keep-3，见 5e970eb）
[ "$(ls "$FORGE/data/pg-dumps/"pg-[0-9]*.sql | wc -l)" = "3" ] && [ ! -f "$FORGE/data/pg-dumps/pg-1999-01-01T00-00-00.sql" ]; A3=$?
ck "backup state-A: keep-3 pruned oldest dump" "$A3"
NEWZ=$(ls -t "$FORGE/data/backups/"forge-backup-*.zip | head -1)
unzip -l "$NEWZ" > /tmp/e2e-ziplist.txt 2>&1   # 落地再 grep：grep -q 早退会 SIGPIPE unzip，pipefail 下中止全量（s65 同族）
# zip 条目分隔符随 Compress-Archive 可能是 \ 或 /，用 . 通配
if grep -q 'pg-dumps[\\/]pg-' /tmp/e2e-ziplist.txt; then ck "backup state-A: zip contains pg-dumps entry" 0; else ck "backup state-A: zip contains pg-dumps entry" 1; fi
rm -f /tmp/e2e-ziplist.txt
# 态B：PG 不在场（pc process stop 单进程级，不碰全栈）——warn 一行 + zip 照常
PCRUN process stop pg >/dev/null
PCRUN process start daily-backup >/dev/null
wait_backup_done 'backup ok' || true
grep -q 'pg_dump skipped' "$FORGE/data/logs/backup.log"; B1=$?
if [ "$B1" = "0" ]; then ck "backup state-B: pg_dump skipped warn (PG absent)" 0; else ck "backup state-B: pg_dump skipped warn (PG absent)" 1; fi
tail -1 "$FORGE/data/logs/backup.log" | grep -q 'backup ok'; B2=$?
if [ "$B2" = "0" ]; then ck "backup state-B: zip still produced" 0; else ck "backup state-B: zip still produced" 1; fi
# 复原 pg 并等探活回绿
PCRUN process start pg >/dev/null
PR=1; for i in $(seq 1 12); do sleep 5; ST=$(PCRUN process get pg); echo "$ST" | grep -q Ready && { PR=0; break; }; done
ck "backup chain: pg restored Ready after state-B" $PR
rm -f "$FORGE/data/pg-dumps/"pg-1999-*.sql

# ---------- 14) UI 逻辑桩测（s69 转正自 tmp p210-211-kbd-check + p22-close-path-check；详见 tools/e2e/ui-logic-probe.js） ----------
# kbd 23 ck + 模态关闭路径 10 ck，秒级无桥无网络；提取锚点=稳定标记正则（模板漂移显式 NOT FOUND，不误报）
node "$ROOT/tools/e2e/ui-logic-probe.js" > /tmp/ui-logic-probe.log 2>&1; ck "ui-logic probe 33 ck (kbd 23 + close-path 10)" $?
grep -E "^ui-logic-probe" /tmp/ui-logic-probe.log
rm -f /tmp/ui-logic-probe.log

# ---------- 15) IA 逻辑桩测（s74 转正自 qa tmp/s74-qa-archprobe；详见 tools/e2e/ia-logic-probe.js） ----------
# 归档视图分页/空态清翻页器 + 技能过滤空态（IA-1/IA-2 缺陷家族回归钉子），同款模板提取桩测
node "$ROOT/tools/e2e/ia-logic-probe.js" > /tmp/ia-logic-probe.log 2>&1; ck "ia-logic probe 7 ck (arch pager clear + skills empty state)" $?
grep -E "^ia-logic-probe" /tmp/ia-logic-probe.log
rm -f /tmp/ia-logic-probe.log

rm -f /tmp/e2e-v1.md
echo "=============================="
echo "chat-link E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
