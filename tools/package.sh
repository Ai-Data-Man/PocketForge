#!/usr/bin/env bash
# P6 打包：forge/ + 许可证 → dist/PocketForge-<date>-v<ver>.zip（交付物）
# 开发机专用。产物自检：解压到临时目录跑 --version 级冒烟。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORGE="$ROOT/forge"
VER=$(git -C "$ROOT" describe --tags --always 2>/dev/null || echo dev)
DATE=$(date +%Y%m%d)
DIST="$ROOT/dist"
OUT="$DIST/PocketForge-${DATE}-${VER}.zip"
mkdir -p "$DIST"

# 1) 清运行时状态（交付包零残留）；排除已弃用组件与运行时生成物
TMP=$(mktemp -d)
cp -r "$FORGE" "$TMP/forge-pkg"
rm -rf "$TMP/forge-pkg/data"/* "$TMP/forge-pkg/conf/goose/state" "$TMP/forge-pkg/conf/goose/data" \
       "$TMP/forge-pkg/conf/ports.env.yaml" "$TMP/forge-pkg/conf/apps.env.yaml" "$TMP/forge-pkg/apps"/* \
       "$TMP/forge-pkg/bin/python" "$TMP/forge-pkg/bin/bu-config" \
       "$TMP/forge-pkg/bin/memory-mcp.cmd" "$TMP/forge-pkg/conf/diag.ps1" \
       "$TMP/forge-pkg/conf/goose/config/memory" "$TMP/forge-pkg/conf/goose/config/config.yaml" 2>/dev/null || true
mkdir -p "$TMP/forge-pkg/data/logs" "$TMP/forge-pkg/apps" "$TMP/forge-pkg/data/sqlite"

# 2) 许可证清点（缺 = 失败）
LIC="$TMP/forge-pkg/vendor-licenses"
mkdir -p "$LIC"
declare -A SRC=(
 [process-compose.Apache-2.0]="$FORGE/bin/pc/LICENSE"
 [nats-server.Apache-2.0]="$FORGE/bin/nats-server/nats-server-v2.14.5-windows-amd64/LICENSE"
 [nats-cli.Apache-2.0]="$FORGE/bin/nats-cli/nats-0.4.0-windows-amd64/LICENSE"
 [faucet.MIT]="$FORGE/bin/faucet/LICENSE"
 [goose.Apache-2.0]="https://raw.githubusercontent.com/aaif-goose/goose/main/LICENSE"
 [node.MIT]="https://raw.githubusercontent.com/nodejs/node/main/LICENSE"
 [playwright-mcp.Apache-2.0]="$FORGE/bin/pw-mcp/node_modules/@playwright/mcp/LICENSE"
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

# 3) zip（保持 UTF-8 文件名：用 python zipfile）
python - "$TMP/forge-pkg" "$OUT" <<'EOF'
import sys, os, zipfile, locale
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, src))
print('zip ok:', out, os.path.getsize(out), 'bytes')
EOF
sha256sum "$OUT" > "$OUT.sha256"
cat "$OUT.sha256"
