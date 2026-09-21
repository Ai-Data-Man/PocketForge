#!/usr/bin/env bash
# P6 打包：forge/ + 许可证 → dist/PocketForge-<date>-v<ver>.zip（交付物）
# 交付物含包根 SHA256-EXE.txt（bin 下全部 .exe 的 hash 清单，见 2b）。
# 开发机专用。产物自检：解压到临时目录跑 --version 级冒烟。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORGE="$ROOT/forge"
# 显式 TAG 参数时用精确版本（describe 在 tag 后有commit 数时输出 v0.9.8-19-g77ca5d9，不适合成品名）
VER=${RELEASE_TAG:-$(git -C "$ROOT" describe --tags --abbrev=0 --always 2>/dev/null || echo dev)}
# 记忆层（docs/DECISIONS/tools）只存在于仓库根；forge/ 下出现即路径事故产物，混入交付包 = 内部文档泄漏
for junk in docs DECISIONS tools; do
  [ -e "$FORGE/$junk" ] && { echo "forge/$junk 不应存在（路径事故产物），删除或查证后再打包"; exit 1; }
done
DATE=$(date +%Y%m%d)
DIST="$ROOT/dist"
OUT="$DIST/PocketForge-${DATE}-${VER}.zip"
mkdir -p "$DIST"

# 1) 清运行时状态（交付包零残留）；排除已弃用组件与运行时生成物
TMP=$(mktemp -d)
# 复制时跳过锁定/运行时目录（robocopy /XD；聊天窗口开着也能打包）
TMP_WIN=$(cygpath -w "$TMP")
MSYS_NO_PATHCONV=1 robocopy "$(cygpath -w "$FORGE")" "$TMP_WIN\forge-pkg" /E /XD "$(cygpath -w "$FORGE")\data\chat-window-profile" "$(cygpath -w "$FORGE")\data\pw-chat-check" "$(cygpath -w "$FORGE")\data\pw-chat-v2check" "$(cygpath -w "$FORGE")\data\backups" /NFL /NDL /NJH /NJS /NP >/dev/null 2>&1 || true
mkdir -p "$TMP/forge-pkg/data/logs"
rm -rf "$TMP/forge-pkg/data"/* "$TMP/forge-pkg/conf/goose/state" "$TMP/forge-pkg/conf/goose/data" \
       "$TMP/forge-pkg/conf/ports.env.yaml" "$TMP/forge-pkg/conf/apps.env.yaml" "$TMP/forge-pkg/conf/apps.guard.log" "$TMP/forge-pkg/apps"/* \
       "$TMP/forge-pkg/nul。" \
       "$TMP/forge-pkg/bin/bu-config" \
       "$TMP/forge-pkg/bin/memory-mcp.cmd" "$TMP/forge-pkg/conf/diag.ps1" \
       "$TMP/forge-pkg/conf/goose/config/memory" "$TMP/forge-pkg/conf/goose/config/config.yaml" "$TMP/forge-pkg/conf/goose/config/permission.yaml" "$TMP/forge-pkg/conf/goose/config/permission.yaml.lock"        "$TMP/forge-pkg/data/chat-window-profile" "$TMP/forge-pkg/data/pw-chat-check" "$TMP/forge-pkg/data/pw-chat-v2check"        "$TMP/forge-pkg/data/backups" "$TMP/forge-pkg/.playwright-mcp" \
       "$TMP/forge-pkg/conf/goose/config/custom_providers" 2>/dev/null || true
# s99/S3（裁决 2026-09-21 §3.6）：custom_providers 目录级剔除——开发占位 forge-router.json 已删源，
# 此行防再犯（未来误放回/路径事故产物不随包发行；用户自配 custom_providers 属用户树，出厂包本就不含）
mkdir -p "$TMP/forge-pkg/data/logs" "$TMP/forge-pkg/apps" "$TMP/forge-pkg/data/sqlite"
printf "%s" "$VER" > "$TMP/forge-pkg/VERSION"   # ADR-0009: 版本唯一真相源,升级器据此对比
# s20: .goosehints 用模板原文（占位符版）——运行版已被 bootstrap 替换为本机绝对路径，不能进包
if [ -f "$FORGE/conf/templates/goose-hints.tpl.md" ]; then
  cp "$FORGE/conf/templates/goose-hints.tpl.md" "$TMP/forge-pkg/conf/goose/config/.goosehints"
fi

# 2) 许可证清点（缺 = 失败）
LIC="$TMP/forge-pkg/vendor-licenses"
mkdir -p "$LIC"
declare -A SRC=(
 [process-compose.Apache-2.0]="$FORGE/bin/pc/LICENSE"
 [nats-server.Apache-2.0]="$FORGE/bin/nats-server/nats-server-v2.14.5-windows-amd64/LICENSE"
 [nats-cli.Apache-2.0]="$FORGE/bin/nats-cli/nats-0.4.0-windows-amd64/LICENSE"
 [faucet.MIT]="$FORGE/bin/faucet/LICENSE"
 # s93: 一律从包内来源取（node/goose 曾从 GitHub raw 拉——上游 main 分支 LICENSE 是活文档，
 # 会随依赖增长 → 同一 commit 两次打包字节不同（实测 +59 行），"验证物≠发布物"。
 # 包内各发行版自带 LICENSE 即该版本真实许可文本，且保证构建确定性（同输入同字节）。
 [goose.Apache-2.0]="$FORGE/vendor-licenses/goose.Apache-2.0"
 [node.MIT]="$FORGE/bin/node-v22/node-v22.21.1-win-x64/LICENSE"
 [playwright-mcp.Apache-2.0]="$FORGE/bin/pw-mcp/node_modules/@playwright/mcp/LICENSE"
 [isomorphic-git.MIT]="$FORGE/bin/vendor/artifact-vcs/node_modules/isomorphic-git/LICENSE.md"
 [DOMPurify.Apache-2.0]="$FORGE/vendor-licenses/DOMPurify.Apache-2.0"
 [postgresql.PostgreSQL]="$FORGE/vendor-licenses/postgresql.PostgreSQL"
 [postgres.Unlicense]="$FORGE/vendor-licenses/postgres.Unlicense"
)
MISS=0
for name in "${!SRC[@]}"; do
  s="${SRC[$name]}"
  if [[ "$s" == http* ]]; then
    curl -sL -x http://127.0.0.1:7890 --retry 2 -o "$LIC/$name" "$s" || true
  else
    cp "$s" "$LIC/$name" 2>/dev/null || true
  fi
  [ -s "$LIC/$name" ] || { echo "MISSING LICENSE: $name"; MISS=1; }
done
[ "$MISS" = 0 ] || { echo "license incomplete"; exit 1; }

# 2b) exe 级 SHA256 清单（research/28 §S6：无签名产品 EDR 申诉/IT 白名单登记的刚性材料，
#     zip 整体 .sha256 粒度不够）。包根 SHA256-EXE.txt：包内 bin 下全部 .exe 相对路径+hash
#     一行一件（sha256sum -c 可校验）；按路径排序枚举 → 幂等（重打包 hash 稳定，只随 exe 字节变）
python - "$TMP/forge-pkg" <<'PYEOF'
import hashlib, os, sys
root = sys.argv[1]
exes = []
for dirpath, dirs, files in os.walk(os.path.join(root, 'bin')):
    for f in files:
        if f.lower().endswith('.exe'):
            exes.append(os.path.join(dirpath, f))
exes.sort(key=lambda p: os.path.relpath(p, root).replace(os.sep, '/'))
lines = []
for p in exes:
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    lines.append(h.hexdigest() + '  ' + os.path.relpath(p, root).replace(os.sep, '/'))
with open(os.path.join(root, 'SHA256-EXE.txt'), 'w', newline='\n') as f:
    f.write('\n'.join(lines) + '\n')
print('SHA256-EXE.txt:', len(lines), 'exes')
PYEOF

# 3) zip（保持 UTF-8 文件名：用 python zipfile）
python - "$TMP/forge-pkg" "$OUT" <<'PYEOF'
import sys, os, zipfile
src, out = sys.argv[1], sys.argv[2]
SKIP = ('data/chat-window-profile', 'data/pw-chat-check', 'data/pw-chat-v2check', 'data/backups', 'conf/goose/state', 'conf/goose/data', '.playwright-mcp', 'tmp', 'conf/dev-stack-up.ps1', 'apps')
n = 0
# s93: 可复现构建——条目时间戳归一为固定值（原样写入导致同内容两次构建 zip 字节不同，
# "验证过的包 ≠ 发布的包"无法自证；实测 25300 文件内容全同、仅时间戳致 sha256 相异）
FIXED_TS = (2026, 1, 1, 0, 0, 0)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src).replace(os.sep, '/')
        if any(rel == sk or rel.startswith(sk + '/') for sk in SKIP):
            dirs[:] = []
            continue
        for f in files:
            frel = os.path.relpath(os.path.join(root, f), src).replace(os.sep, '/')
            if any(frel == sk for sk in SKIP):  # s88: SKIP 目录级匹配漏文件型条目（dev-stack-up.ps1 实锤进包）——文件级精确比对补门
                continue
            zi = zipfile.ZipInfo(frel, date_time=FIXED_TS)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16  # 内容/权限位固定（位掩码差异同样会改字节）
            with open(os.path.join(root, f), 'rb') as fh:
                z.writestr(zi, fh.read())
            n += 1
print('zip ok:', out, os.path.getsize(out), 'bytes,', n, 'files')
PYEOF
sha256sum "$OUT" > "$OUT.sha256"
cat "$OUT.sha256"
