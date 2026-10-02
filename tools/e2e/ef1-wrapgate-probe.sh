#!/usr/bin/env bash
# s108/ef1 wrapper fail-loud gate unit probe (D2-7 裁决)
# 结构最小沙盒：只有 wrapper + data/secrets.env 变体；pc.exe 故意缺席——
# 门拒(缺键/缺文件)=rc4 且不碰 pc；门放行(键在,值可空)=走到 pc 调用(9009→rc1≠4)。
# 判据：rc4=门拒；rc1=门放行后 pc 失败（证明过了门）；rc2=用法错。
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d)
mkdir -p "$T/bin/pc" "$T/data/logs"
cp "$ROOT/forge/bin/pc/forge-register.cmd" "$T/bin/pc/forge-register.cmd"
PASS=0; FAIL=0
ck(){ if [ "$2" = "0" ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi; }

# C1 文件整缺 → rc4 + register.log 人话行
rm -f "$T/data/secrets.env" "$T/data/logs/register.log"
cmd //c "$(cygpath -w "$T")\\bin\\pc\\forge-register.cmd converge" >/dev/null 2>&1
rc=$?
[ "$rc" = "4" ]; ck "C1 secrets.env missing -> rc=4 (got $rc)" $?
grep -q "secrets.env unreadable" "$T/data/logs/register.log" 2>/dev/null; ck "C1 register.log has human line" $?

# C2 三键行缺一（只有 PC_TOKEN） → rc4，点名缺失键
printf 'PC_TOKEN=x\n' > "$T/data/secrets.env"
rm -f "$T/data/logs/register.log"
cmd //c "$(cygpath -w "$T")\\bin\\pc\\forge-register.cmd converge" >/dev/null 2>&1
rc=$?
[ "$rc" = "4" ]; ck "C2 key lines missing -> rc=4 (got $rc)" $?
grep -q "missing: GOOSE_MODEL_NAME" "$T/data/logs/register.log" 2>/dev/null; ck "C2 register.log names first missing key" $?

# C3 键在值空（出厂未配形态）→ 门放行：走到 pc 调用（本环境 pc 缺席，观测点=stdout 收敛失败行=过了门）。
# 注：pc 调用失败路的 exit /b 1 在本机被吞（HEAD 同形实测 rc=0，预存 quirk 非本批引入）——判据用 stdout 行不用 rc。
printf 'GOOSE_MODEL_NAME=\nFORGE_AGENT_HOST=\nFORGE_AGENT_API_KEY=\n' > "$T/data/secrets.env"
OUT=$(cmd //c "$(cygpath -w "$T")\\bin\\pc\\forge-register.cmd converge" 2>&1)
echo "$OUT" | grep -q "converge update failed"; ck "C3 empty-value keys pass gate -> reaches pc call" $?
echo "$OUT" | grep -q "missing key lines"; [ "$?" = "1" ]; ck "C3 no gate refusal on empty values" $?

# C4 键在值真 → 门放行 → 同 C3 判据
printf 'GOOSE_MODEL_NAME=glm-5.3-flash\nFORGE_AGENT_HOST=http://127.0.0.1:20128/v1\nFORGE_AGENT_API_KEY=sk-test123\n' > "$T/data/secrets.env"
OUT=$(cmd //c "$(cygpath -w "$T")\\bin\\pc\\forge-register.cmd converge" 2>&1)
echo "$OUT" | grep -q "converge update failed"; ck "C4 real keys pass gate -> reaches pc call" $?

rm -rf "$T"
echo "wrapgate: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
