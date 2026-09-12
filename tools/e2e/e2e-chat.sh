# P31/s18 聊天客户端链路 E2E（开发机跑；s15 审查 M7 建议落地）
# 覆盖：工作区生命周期（new/bind/delete+归档护栏）+ 文件管理（new/rename/delete）
#      + 上传/附件身份 + 版本管理（rename 自动快照→log→blob→restore）
#      + 护栏：当前会话区不可删。纯 HTTP 断言，不依赖 LLM。
# 前置：栈已在跑（chat-bridge :8790）
set -euo pipefail
# s76 遗留⑧: set -e 下探针/grep -q 断言非零退出会中止全套件（首红杀全量，摘要只在全绿出现）——探针调用、grep -q 断言、[ ] 测试式断言与命令替换赋值行（VAR=$(...)）一律 rc 捕获（rc=0; cmd || rc=$?），失败计数不中止
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FORGE="$ROOT/forge"
PASS=0; FAIL=0
ck(){ if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi }
B=http://127.0.0.1:8790
# healthz=HTTP 层就绪；ACP 就绪由探针侧 hello.caps.modes 就绪门保证（research/15，见 ws-delete-receipt.js）
rc=0; curl -s --max-time 3 "$B/healthz" | grep -q ok || rc=$?; ck "bridge up" $rc

SID="e2e-chat-$(date +%s)"
J() { python -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d,ensure_ascii=False))"; }

# ---------- 1) 工作区创建（幂等性一并验证） ----------
rc=0; W1=$(curl -s "$B/api/ws/new?sid=$SID" | python -c "import sys,json;print(json.load(sys.stdin).get('ws',''))") || rc=$?
[ -n "$W1" ] || rc=$?; ck "ws/new creates workspace ($W1)" $rc
rc=0; W2=$(curl -s "$B/api/ws/new?sid=$SID" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('ws','')+'|'+str(d.get('existed',False)))") || rc=$?
[ "$W2" = "$W1|True" ] || rc=$?; ck "ws/new idempotent for same sid" $rc

# ---------- 2) 文件管理：新建→改名（触发自动快照）→目录树 ----------
rc=0; curl -s -X POST "$B/api/fs/new" -H 'content-type: application/json' -d "{\"ws\":\"$W1\",\"path\":\"report.md\",\"type\":\"file\"}" | grep -q '"ok":true' || rc=$?; ck "fs/new file" $rc
printf '第一版内容\n' > /tmp/e2e-v1.md
rc=0; curl -s -X POST "$B/api/upload?ws=$W1&name=note-v1.md" --data-binary @/tmp/e2e-v1.md | grep -q '"ok":true' || rc=$?; ck "upload note-v1.md" $rc
rc=0; curl -s -X POST "$B/api/fs/rename" -H 'content-type: application/json' -d "{\"ws\":\"$W1\",\"path\":\"note-v1.md\",\"name\":\"note-v2.md\"}" | grep -q '"ok":true' || rc=$?; ck "fs/rename (auto snapshot)" $rc
rc=0; curl -s "$B/api/ws/tree?ws=$W1" | grep -q 'note-v2.md' || rc=$?; ck "ws/tree shows renamed file" $rc

# ---------- 3) 版本管理：log/blob/restore ----------
rc=0; N=$(curl -s "$B/api/vcs/log?ws=$W1&file=note-v2.md" | python -c "import sys,json;print(len(json.load(sys.stdin).get('versions',[])))") || rc=$?
[ "$N" -ge 1 ] || rc=$?; ck "vcs/log has >=1 version (got $N)" $rc
rc=0; OID=$(curl -s "$B/api/vcs/log?ws=$W1&file=note-v2.md" | python -c "import sys,json;print(json.load(sys.stdin)['versions'][0]['oid'])") || rc=$?
rc=0; BODY=$(curl -s "$B/api/vcs/blob?ws=$W1&file=note-v2.md&oid=$OID") || rc=$?
rc=0; echo "$BODY" | grep -q "第一版内容" || rc=$?; ck "vcs/blob roundtrip content" $rc
rc=0; curl -s -X POST "$B/api/vcs/restore" -H 'content-type: application/json' -d "{\"ws\":\"$W1\",\"file\":\"note-v2.md\",\"oid\":\"$OID\"}" | grep -q '"ok":true' || rc=$?; ck "vcs/restore to snapshot" $rc

# ---------- 4) 附件身份（.forge 与改名联动） ----------
rc=0; A=$(curl -s "$B/api/ws/tree?ws=$W1" | python -c "import sys,json;print(json.load(sys.stdin).get('attachments',[]).__str__())") || rc=$?
rc=0; echo "$A" | grep -q "note-v2.md" || rc=$?; ck "attachment identity follows rename" $rc

# ---------- 5) 生命周期：归档后可删 / 活跃护栏 ----------
rc=0; curl -s -X POST "$B/api/sessions/archive" -H 'content-type: application/json' -d "{\"sid\":\"$SID\",\"archived\":true}" | grep -q '"ok":true' || rc=$?; ck "archive session" $rc
# 绑定归档会话的区：不带 curSid 可删（前端活跃会话才带）
rc=0; curl -s -X POST "$B/api/ws/delete" -H 'content-type: application/json' -d "{\"ws\":\"$W1\"}" | grep -q '"ok":true' || rc=$?; ck "delete archived-bound workspace" $rc
# 活跃护栏：新建区并声明它是当前会话的区 → 删除必须被拒
rc=0; W3=$(curl -s "$B/api/ws/new?sid=$SID-act" | python -c "import sys,json;print(json.load(sys.stdin).get('ws',''))") || rc=$?
rc=0; curl -s -X POST "$B/api/ws/delete" -H 'content-type: application/json' -d "{\"ws\":\"$W3\",\"sid\":\"$SID-act\"}" | grep -q '不能删' || rc=$?; ck "active workspace delete refused" $rc
rc=0; curl -s -X POST "$B/api/ws/delete" -H 'content-type: application/json' -d "{\"ws\":\"$W3\"}" | grep -q '"ok":true' || rc=$?; ck "cleanup: delete without curSid" $rc

# ---------- 6) workspaces 视角 ----------
rc=0
curl -s "$B/api/workspaces" | python -c "
import sys,json
d=json.load(sys.stdin)
assert isinstance(d,list) and len(d)>=0
for w in d: assert {'id','files','bytes','mtime','sid','title','state'} <= set(w)
print('workspaces-shape-ok')" | grep -q shape-ok || rc=$?
ck "workspaces list shape" $rc

# ---------- 7) 聊天记录搜索（s21） ----------
rc=0
curl -s "$B/api/search?q=perm-probe" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d['ok'] and isinstance(d['hits'],list) and len(d['hits'])>=1
h=d['hits'][0]
assert {'sid','title','role','ts','frag'} <= set(h)
print('search-ok')" | grep -q search-ok || rc=$?
ck "chat history search finds seeded text" $rc
rc=0; curl -s "$B/api/search?q=x" | grep -q '"hits":\[\]' || rc=$?; ck "search short-query returns empty" $rc

# ---------- 8) 数据库总览（s50b /api/db/overview） ----------
rc=0
curl -s "$B/api/db/overview" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d['ok'] is True
svcs={s['service']:s for s in d['services']}
assert 'plm' in svcs and len(svcs['plm']['tables'])>=1
for s in d['services']:
    for t in s['tables']: assert t['rows'] is None or isinstance(t['rows'],int)
print('db-overview-ok')" | grep -q db-overview-ok || rc=$?
ck "db/overview 200 ok:true with plm+tables" $rc
rc=0; CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/db/overview") || rc=$?
[ "$CODE" = "405" ] || rc=$?; ck "db/overview POST refused 405 (got $CODE)" $rc
rc=0; curl -s "$B/api/db/overview" | grep -qviE 'apikey|X-API-Key' || rc=$?; ck "db/overview no apikey leak" $rc

# ---------- 9) 单表结构+样例（s51 /api/db/_schema） ----------
rc=0
curl -s "$B/api/db/_schema?svc=plm&tbl=parts" | python -c "
import sys,json
d=json.load(sys.stdin)
assert d['ok'] is True and d['columns'] and isinstance(d['samples'],list)
cols={c['name']:c for c in d['columns']}
assert 'id' in cols and cols['id']['pk'] is True
assert cols['id']['raw_type']=='INTEGER'
for c in d['columns']: assert set(c)>={'name','raw_type','pk'}
print('dbschema-ok')" | grep -q dbschema-ok || rc=$?
ck "db/_schema returns columns+samples with pk" $rc
rc=0; CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/db/_schema") || rc=$?
[ "$CODE" = "405" ] || rc=$?; ck "db/_schema POST refused 405 (got $CODE)" $rc
rc=0; curl -s "$B/api/db/_schema?svc=plm&tbl=no_such_tbl" | grep -q '"ok":false' || rc=$?; ck "db/_schema unknown table ok:false" $rc
rc=0; curl -s --get "$B/api/db/_schema" --data-urlencode "svc=../etc" --data-urlencode "tbl=passwd" | grep -q '"ok":false' || rc=$?; ck "db/_schema rejects path-ish names" $rc
rc=0; curl -s --get "$B/api/db/_schema" --data-urlencode "svc=plm" --data-urlencode "tbl=parts" | grep -qviE 'apikey|X-API-Key' || rc=$?; ck "db/_schema no apikey leak" $rc

# ---------- 10) 诊断报告（/api/report） ----------
# S1: 端点要求自定义头 X-PF-Report: 1（缺失→403），本节所有 curl 必须带头
rc=0; R=$(curl -s --max-time 30 -H 'X-PF-Report: 1' "$B/api/report") || rc=$?
rc=0; echo "$R" | grep -q '"ok":true' || rc=$?; ck "api/report ok:true" $rc
rc=0; RP=$(echo "$R" | python -c "import sys,json;print(json.load(sys.stdin).get('path',''))" 2>/dev/null) || rc=$?
RPU=${RP//\\//}
[ -n "$RPU" ] && [ -f "$RPU" ] || rc=$?; ck "api/report file exists on disk ($RP)" $rc
rc=0; grep -q 'VERSION' "$RPU" || rc=$?; ck "report contains version section" $rc
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
rc=0; R2=$(curl -s --max-time 30 -H 'X-PF-Report: 1' "$B/api/report") || rc=$?
rc=0; RP2=$(echo "$R2" | python -c "import sys,json;print(json.load(sys.stdin).get('path',''))" 2>/dev/null) || rc=$?
RPU2=${RP2//\\//}
if [ -f "$RPU2" ] && ! grep -q 'ghp_e2esanitizerprobe000000' "$RPU2" && grep -q '<已脱敏>' "$RPU2"; then ck "report sanitized: GH_TOKEN plaintext dropped" 0; else ck "report sanitized: GH_TOKEN plaintext dropped" 1; fi
rm -f "$FAKE"

# ---------- 11) WS delete_session 回执（s62/P3: 请求者收到回执且连接随后被服务端关闭） ----------
# 输出先落地 tmp 文件再 grep：grep -q 提前退出关管道会让 node 偶发 EPIPE，pipefail 下中止全量
rc=0; node "$ROOT/tools/e2e/ws-delete-receipt.js" > /tmp/ws-delete-receipt.log 2>&1 || rc=$?
grep -q "PASS" /tmp/ws-delete-receipt.log || rc=$?
ck "ws delete_session receipt delivered before close" $rc
rm -f /tmp/ws-delete-receipt.log

# ---------- 11b) delete_session 发 ACP session/close → extension 进程树回收（s75/research/17） ----------
# 自相对断言（基线→建会话增长→删→回基线），1s 有界轮询；详见 tools/e2e/ws-close-reclaim.js
rc=0; node "$ROOT/tools/e2e/ws-close-reclaim.js" > /tmp/ws-close-reclaim.log 2>&1 || rc=$?
grep -q "PASS" /tmp/ws-close-reclaim.log || rc=$?
ck "ws delete_session reclaims extension process tree" $rc
grep -E "^PROBE-C" /tmp/ws-close-reclaim.log || true
rm -f /tmp/ws-close-reclaim.log

# ---------- 12) 报告 v2 探针（s65 转正自 s64 tmp 探针；详见 tools/e2e/report-probe.sh） ----------
# static=39 ck 秒级；sandbox=29 ck 自建沙箱真桥（端口 18790/18799，不碰 dev 栈 8790），实测增量约 31-47s < 90s 门槛 → 挂进全量
rc=0; bash "$ROOT/tools/e2e/report-probe.sh" static > /tmp/report-probe-e2e.log 2>&1 || rc=$?; ck "report v2 static probe 39 ck" $rc
rc=0; bash "$ROOT/tools/e2e/report-probe.sh" sandbox >> /tmp/report-probe-e2e.log 2>&1 || rc=$?; ck "report v2 sandbox probe 29 ck (ports 18790/18799)" $rc
grep -E "^report-probe" /tmp/report-probe-e2e.log || true
rm -f /tmp/report-probe-e2e.log

# ---------- 13) PG 备份链两态（s66/ADR-0011 阶段二：导出先行；跑在栈上，pg 由 pc 托管） ----------
PC_PORT=$(cat "$FORGE/data/pc.port" 2>/dev/null || echo 8099)
PC="$FORGE/bin/pc/process-compose.exe"
# s78: grep -v 在输出全被过滤/为空时退 1，pipefail+set -e 下直接杀套件（本日实锤：pg 停后无输出 → 第 13 节静默中止、pg 被留在停止态）。
# || true 收口：pc 真失败由调用方的 grep 断言计红，套件永远走完（c4b8ce6 加固目标的漏网点）。
PCRUN(){ timeout 20 env PC_DISABLE_TUI=1 "$PC" -p "$PC_PORT" "$@" </dev/null 2>/dev/null | grep -viE 'debug|duplicate' || true; }
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
rc=0; NEWU=$(ls -t "$FORGE/data/pg-dumps/"pg-*.sql | head -1) || rc=$?
if grep -q 'PostgreSQL database dump' "$NEWU"; then ck "backup state-A: newest dump has PostgreSQL dump marker" 0; else ck "backup state-A: newest dump has PostgreSQL dump marker" 1; fi
# s73: glob 收窄为 pg-[0-9]*（PG 切片1 起 pg-dumps 目录共存三族——每日主库 pg-YYYYMMDD/桥库 pg-bridge-*/迁移留档 forge-bridge-pre-*，各族独立 keep-3，见 5e970eb）
A3=0; [ "$(ls "$FORGE/data/pg-dumps/"pg-[0-9]*.sql | wc -l)" = "3" ] && [ ! -f "$FORGE/data/pg-dumps/pg-1999-01-01T00-00-00.sql" ] || A3=$?
ck "backup state-A: keep-3 pruned oldest dump" "$A3"
rc=0; NEWZ=$(ls -t "$FORGE/data/backups/"forge-backup-*.zip | head -1) || rc=$?
unzip -l "$NEWZ" > /tmp/e2e-ziplist.txt 2>&1 || true   # 落地再 grep：grep -q 早退会 SIGPIPE unzip，pipefail 下中止全量（s65 同族）；|| true 同款守卫，红由下断言计
# zip 条目分隔符随 Compress-Archive 可能是 \ 或 /，用 . 通配
if grep -q 'pg-dumps[\\/]pg-' /tmp/e2e-ziplist.txt; then ck "backup state-A: zip contains pg-dumps entry" 0; else ck "backup state-A: zip contains pg-dumps entry" 1; fi
rm -f /tmp/e2e-ziplist.txt
# 态B：PG 不在场（pc process stop 单进程级，不碰全栈）——warn 一行 + zip 照常
PCRUN process stop pg >/dev/null
PCRUN process start daily-backup >/dev/null
wait_backup_done 'backup ok' || true
B1=0; grep -q 'pg_dump skipped' "$FORGE/data/logs/backup.log" || B1=$?
if [ "$B1" = "0" ]; then ck "backup state-B: pg_dump skipped warn (PG absent)" 0; else ck "backup state-B: pg_dump skipped warn (PG absent)" 1; fi
B2=0; tail -1 "$FORGE/data/logs/backup.log" | grep -q 'backup ok' || B2=$?
if [ "$B2" = "0" ]; then ck "backup state-B: zip still produced" 0; else ck "backup state-B: zip still produced" 1; fi
# 复原 pg 并等探活回绿
PCRUN process start pg >/dev/null
PR=1; for i in $(seq 1 12); do sleep 5; ST=$(PCRUN process get pg); echo "$ST" | grep -q Ready && { PR=0; break; }; done
ck "backup chain: pg restored Ready after state-B" $PR
rm -f "$FORGE/data/pg-dumps/"pg-1999-*.sql

# ---------- 14) UI 逻辑桩测（s69 转正自 tmp p210-211-kbd-check + p22-close-path-check；详见 tools/e2e/ui-logic-probe.js） ----------
# kbd 34 ck + 模态关闭路径 10 ck + 提示词面板/Tab 菜单 11 ck（用户五主线批2 e12：插入不发送/name 兜底/点外收起 isConnected 守卫/Tab 唤起与 IME 守卫），秒级无桥无网络；提取锚点=稳定标记正则（模板漂移显式 NOT FOUND，不误报）
rc=0; node "$ROOT/tools/e2e/ui-logic-probe.js" > /tmp/ui-logic-probe.log 2>&1 || rc=$?; ck "ui-logic probe 56 ck (kbd 35 + close-path 10 + prompts 11)" $rc
grep -E "^ui-logic-probe" /tmp/ui-logic-probe.log || true
rm -f /tmp/ui-logic-probe.log

# ---------- 14b) 操作条「取回修改」桩测（pm裁决 2026-09-07-user-six-lines-batch1 C） ----------
# 断言：取回后输入框有剥操作条原文且未自动发送（submit 哨兵=0）；聚焦+光标到末尾；连点幂等；
# 标签同步「取回修改」；红线=错误卡闭包自动重发路径（s50e/s50f）原样在场。手法同 ia-logic-probe（模板提取+DOM 桩）。
cat > /tmp/pf-retry-probe.js <<'PROBE'
'use strict';
const fs = require('fs');
const html = fs.readFileSync(process.env.PF_ROOT + '/forge/conf/templates/chat.tpl.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, ok) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + n); ok ? pass++ : fail++; };
const m = html.match(/if\(btn\.dataset\.act==='retry'\)\{[^\n]*\}/);
if (!m) { console.error('NOT FOUND: retry branch（模板结构漂移，先改探针）'); process.exit(1); }
const branch = m[0];
ck('D1: retry 分支载入 msgText 剥操作条原文', /\$\('txt'\)\.value=msgText\(msg\)/.test(branch));
ck('D2: retry 分支不自动发送（无 submit()）', !/\bsubmit\(\)/.test(branch));
ck('D3: retry 分支聚焦+光标到末尾', /\$\('txt'\)\.focus\(\)/.test(branch) && /setSelectionRange\(L,L\)/.test(branch));
ck('D4: 按钮标签=「取回修改」（标签跟行为走）', /\['retry','取回修改'\]/.test(html));
ck('D5: 旧自动提交形态（msgText(msg); submit()）零残留', !/msgText\(msg\); submit\(\)/.test(html));
ck('D6: 红线——错误卡闭包自动重发原样在场（txt.value=orig; submit()）', /pendingRetry=\(\)=>\{[^\n]*txt\.value=orig; submit\(\);/.test(html));
// DOM 桩执行：行为级验证（载入原文/不发送/聚焦/光标末尾/幂等）
function runOnce(calls) {
  const txtStub = { value: '', focus: () => calls.focus++, setSelectionRange: (a, b) => { calls.sel = [a, b]; } };
  new Function('$', 'msgText', 'msg', 'btn', 'submit', branch)(
    id => id === 'txt' ? txtStub : null,
    () => '剥操作条后的原文',
    {},
    { dataset: { act: 'retry' } },
    () => calls.submit++);
  return txtStub;
}
const c1 = { focus: 0, sel: null, submit: 0 };
const t1 = runOnce(c1);
ck('D7: 桩执行——输入框有原文', t1.value === '剥操作条后的原文');
ck('D8: 桩执行——未触发发送（submit 哨兵=0，无 ws send/busy 变化）', c1.submit === 0);
ck('D9: 桩执行——聚焦且光标在末尾', c1.focus === 1 && !!c1.sel && c1.sel[0] === t1.value.length && c1.sel[1] === t1.value.length);
const c2 = { focus: 0, sel: null, submit: 0 };
const t2 = runOnce(c2); runOnce(c2);
ck('D10: 连点两次幂等——值不变、仍零发送', t2.value === '剥操作条后的原文' && c2.submit === 0);
console.log('retry-probe: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
PROBE
rc=0; PF_ROOT="$ROOT" node /tmp/pf-retry-probe.js > /tmp/pf-retry-probe.log 2>&1 || rc=$?; ck "retry probe 10 ck (取回修改: load-no-send + red line intact)" $rc
grep -E "^(PASS|FAIL|retry-probe)" /tmp/pf-retry-probe.log || true
rm -f /tmp/pf-retry-probe.log /tmp/pf-retry-probe.js

# ---------- 15) IA 逻辑桩测（s74 转正自 qa tmp/s74-qa-archprobe；详见 tools/e2e/ia-logic-probe.js） ----------
# 归档视图分页/空态清翻页器 + 技能过滤空态（IA-1/IA-2 缺陷家族回归钉子），同款模板提取桩测
rc=0; node "$ROOT/tools/e2e/ia-logic-probe.js" > /tmp/ia-logic-probe.log 2>&1 || rc=$?; ck "ia-logic probe 7 ck (arch pager clear + skills empty state)" $rc
grep -E "^ia-logic-probe" /tmp/ia-logic-probe.log || true
rm -f /tmp/ia-logic-probe.log

# ---------- 16) scheduler 漂移守卫桩测（s75 cf5f250 转交项；详见 tools/e2e/sched-drift-probe.js） ----------
# GET /api/schedules drift 字段两态回归钉子：源配方↔注册副本对账（basename 命中两态/title 兜底/静默 false 家族），
# 临时目录夹具秒级无桥无网络；提取锚点=稳定标记正则（模板漂移显式 NOT FOUND，不误报）
rc=0; node "$ROOT/tools/e2e/sched-drift-probe.js" > /tmp/sched-drift-probe.log 2>&1 || rc=$?; ck "sched-drift probe 15 ck (driftOf two-state + title fallback + silent-false family)" $rc
grep -E "^sched-drift-probe" /tmp/sched-drift-probe.log || true
rm -f /tmp/sched-drift-probe.log

# ---------- 17) 升级前自备份探针（s75c 转正自 tmp/preupgrade-backup-test；详见 tools/e2e/preupgrade-backup-probe.js） ----------
# 43eff60 的 28 断言 + s77 D4 失败族警告清除 3 断言：整树对账/幂等/keep3 轮转/失败注入 warn/警告不残留（真桥端点驱动，自带清理）
rc=0; node "$ROOT/tools/e2e/preupgrade-backup-probe.js" > /tmp/preupgrade-backup.log 2>&1 || rc=$?; ck "preupgrade-backup probe 31 ck" $rc
grep -E "^RESULT" /tmp/preupgrade-backup.log || true
rm -f /tmp/preupgrade-backup.log

# ---------- 18) 断点①回归钉子（research/18 Z1，s76b 修复）：删当天最新会话→新建（号段回退复用已 close 的 sid）→prompt 必须有回文 ----------
# 修复前=error 帧被桥当成功 resolve→「发消息秒回空、零报错」僵尸；修复后=救援成功/人话错误/直连回答三者其一，静默空 stop=红。
# 依赖 LLM 连通（真实回答路径）；详见 tools/e2e/sid-reuse-rescue-probe.js。探针留下含测试文本的会话行（故意不删，防重造号段陷阱）
rc=0; node "$ROOT/tools/e2e/sid-reuse-rescue-probe.js" > /tmp/sid-reuse-rescue.log 2>&1 || rc=$?
grep -q "PASS" /tmp/sid-reuse-rescue.log || rc=$?
ck "delete-latest sid-reuse prompt non-silent (rescue/human-error)" $rc
grep -E "^SID_A|^RESCUE|^SYS-ERROR" /tmp/sid-reuse-rescue.log || true
rm -f /tmp/sid-reuse-rescue.log

# ---------- 18b) 救援判据守卫桩测（qa s76 P2-A）：畸形 reject 载荷不崩桥/去重/alive 门 + 非 NF 失败三档人话（s76 遗留⑦），模板提取零网络 ----------
rc=0; node "$ROOT/tools/e2e/rescue-guard-probe.js" > /tmp/rescue-guard.log 2>&1 || rc=$?
grep -q "FAIL=0" /tmp/rescue-guard.log || rc=$?
ck "rescue guard probe 22 ck (null/string/{} payload + dedup + alive gate + non-NF humanized x3)" $rc
grep -E "^rescue-guard-probe" /tmp/rescue-guard.log || true
rm -f /tmp/rescue-guard.log

# ---------- 18c) 撤回重写全链（主线5，补篇裁决 2026-09-08 §5 验收 1-4/7+§1.1-2；详见 tools/e2e/ws-rollback-probe.js） ----------
# 沙盒自建（FORGE_ROOT=tmp/pfr18c-e2e-<pid>，桥/假 provider 端口自选），绝不碰 dev 活体会话。
# 覆盖：B 型截断 DB 断言（U2 轮消失/U1 原样/usage 逐位不变）/load 重放无原句/改写后上下文回显/失败分支（tombstone 注入+边界缺
# 失→DB 逐位原样）/busy 门（流式拒绝+收尾成功）/tombstone 恢复演练+keep-3/双客户端广播/未订阅拒绝/空会话撤回不砖
rc=0; node "$ROOT/tools/e2e/ws-rollback-probe.js" > /tmp/ws-rollback.log 2>&1 || rc=$?
grep -q "FAIL=0" /tmp/ws-rollback.log || rc=$?
ck "ws-rollback probe 31 ck (B-type surgery + fail-closed + busy gate + tombstone/keep-3 + broadcast + empty-session)" $rc
grep -E "^ws-rollback-probe" /tmp/ws-rollback.log || true
rm -f /tmp/ws-rollback.log

# ---------- 19) 工具卡帧双形态桩测（e4a 批 r19 R1-R5；详见 tools/e2e/toolcard-frames-probe.js） ----------
# 钉住解释链路断供修复：goose v1.46 数组形态 content 解析（修复前 _out 恒空→工具卡输出区从未显示+explain 恒「(空)」捏造）、
# 旧对象 .raw 兜底、rawOutput-only 形态、live_output 不污染、explain 载荷喂料扩容（rawInput/status/exitCode/toolName/trunc）、桥侧措辞静态钉
rc=0; node "$ROOT/tools/e2e/toolcard-frames-probe.js" > /tmp/toolcard-frames.log 2>&1 || rc=$?
grep -q "FAIL=0" /tmp/toolcard-frames.log || rc=$?
ck "toolcard frames probe 25 ck (dual-form content + rawOutput fallback + explain payload feeding)" $rc
grep -E "^toolcard-frames-probe" /tmp/toolcard-frames.log || true
rm -f /tmp/toolcard-frames.log

rm -f /tmp/e2e-v1.md
echo "=============================="
echo "chat-link E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
