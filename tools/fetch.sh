#!/usr/bin/env bash
# 开发机专用：按 components.yaml 下载 pinned 资产到 downloads/，解压到 forge/bin/，
# 生成 tools/checksums.txt 与 vendor-licenses/。目标机不运行本脚本。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DL="$ROOT/downloads"
BIN="$ROOT/forge/bin"
LIC="$ROOT/forge/vendor-licenses"
PROXY="http://127.0.0.1:7890"
mkdir -p "$DL" "$BIN" "$LIC"

dl() { # url out
  curl -sL -x "$PROXY" --retry 3 -o "$2" "$1"
  echo "downloaded $(basename "$2") $(stat -c%s "$2") bytes"
}

# process-compose
dl https://github.com/F1bonacc1/process-compose/releases/download/v1.122.0/process-compose_windows_amd64.zip "$DL/pc.zip"
dl https://github.com/F1bonacc1/process-compose/releases/download/v1.122.0/process-compose_checksums.txt "$DL/pc-checksums.txt"
unzip -oq "$DL/pc.zip" -d "$BIN/pc"
# nats-server
dl https://github.com/nats-io/nats-server/releases/download/v2.14.5/nats-server-v2.14.5-windows-amd64.zip "$DL/nats-server.zip"
mkdir -p "$BIN/nats-server"; unzip -oq "$DL/nats-server.zip" -d "$BIN/nats-server"
# nats-cli
dl https://github.com/nats-io/natscli/releases/download/v0.4.0/nats-0.4.0-windows-amd64.zip "$DL/nats-cli.zip"
mkdir -p "$BIN/nats-cli"; unzip -oq "$DL/nats-cli.zip" -d "$BIN/nats-cli"
# faucet
dl https://github.com/faucetdb/faucet/releases/download/v0.1.12/faucet_0.1.12_windows_amd64.zip "$DL/faucet.zip"
mkdir -p "$BIN/faucet"; unzip -oq "$DL/faucet.zip" -d "$BIN/faucet"
# goose
dl https://github.com/aaif-goose/goose/releases/download/v1.46.0/goose-x86_64-pc-windows-msvc.zip "$DL/goose.zip"
mkdir -p "$BIN/goose"; unzip -oq "$DL/goose.zip" -d "$BIN/goose"

# license texts (raw)
for r in "F1bonacc1/process-compose/APACHE-2.0.txt" "nats-io/nats-server/LICENSE" "nats-io/natscli/LICENSE" "aaif-goose/goose/LICENSE"; do
  n="$(echo "$r" | tr '/' '_')"
  curl -sL -x "$PROXY" --retry 3 -o "$LIC/$n" "https://raw.githubusercontent.com/${r%%/*}/${r#*/}/main/${r##*/}" || true
done
curl -sL -x "$PROXY" --retry 3 -o "$LIC/faucetdb_faucet_LICENSE" "https://raw.githubusercontent.com/faucetdb/faucet/main/LICENSE" || true
curl -sL -x "$PROXY" --retry 3 -o "$LIC/faucetdb_faucet_LICENSE-MIT" "https://raw.githubusercontent.com/faucetdb/faucet/main/LICENSE-MIT" || true

# checksums
( cd "$BIN" && find . -type f \( -name '*.exe' \) -exec sha256sum {} \; ) > "$ROOT/tools/checksums.txt"
cat "$ROOT/tools/checksums.txt"
