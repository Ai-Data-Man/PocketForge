#!/usr/bin/env bash
# 自动发包工作流（本地真相源）：打包 → 校验 → 创建 GitHub Release → 上传资产 → 回执。
# 用法: GH_TOKEN=<pat> bash tools/release.sh [TAG]
#   TAG 缺省 = git describe。资产 = dist/PocketForge-<date>-<tag>.zip + .sha256。
# 通道：GitHub API 经代理 127.0.0.1:7890（可用 data/proxy.env 覆盖）；PAT 只从环境变量读，绝不落仓库。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO=${GH_REPO:-Ai-Data-Man/PocketForge}
PROXY=$(cat "$ROOT/forge/data/proxy.env" 2>/dev/null | tr -d '\r' | head -1 || true); [ -n "$PROXY" ] || PROXY=http://127.0.0.1:7890
[ -n "${GH_TOKEN:-}" ] || { echo "需 GH_TOKEN 环境变量（fine-grained PAT，仓库读写权限）"; exit 1; }
TAG=${1:-${RELEASE_TAG:-$(git -C "$ROOT" describe --tags --abbrev=0 --always 2>/dev/null || echo dev)}}
echo "== 发布 $REPO @ $TAG =="

# 1) 打包（复用 package.sh：“forge/ + 许可证 → dist/PocketForge-<date>-<tag>.zip”，产物自检）
# package.sh 用 RELEASE_TAG 出精确版本名（describe 在 tag 后多 commit 时输出 v0.9.8-19-g…，非成品名）
RELEASE_TAG="$TAG" bash "$ROOT/tools/package.sh" || { echo "打包失败"; exit 1; }
OUT=$(ls -t "$ROOT"/dist/PocketForge-*.zip | head -1)
SHA="$OUT.sha256"
[ -f "$SHA" ] || { sha256sum "$OUT" > "$SHA"; }
echo "产物: $(basename "$OUT") ($(du -h "$OUT" | cut -f1))"
cat "$SHA"

# 2) 检查 release 是否已存在（幂等）
EXIST=$(curl -s -x "$PROXY" -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/releases/tags/$TAG" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id') or '')" 2>/dev/null || true)
[ -z "$EXIST" ] || { echo "release $TAG 已存在 (id=$EXIST)，跳过创建；仍上传缺失资产"; }

# 3) release notes（自上版 tag 的提交摘要；无上版则用最近 20 条）
PREV=$(git -C "$ROOT" tag --sort=-version:refname | grep -v "^$TAG$" | head -1 || true)
if [ -n "$PREV" ]; then
  NOTES=$(git -C "$ROOT" log --oneline --no-merges "$PREV..$TAG" 2>/dev/null | head -80 || true)
  HEADER="## 变更（$PREV → $TAG）"
else
  NOTES=$(git -C "$ROOT" log --oneline -20 | head -20)
  HEADER="## 最近变更"
fi
BODY="$HEADER

$NOTES

## 校验
\`\`\`
$(cat "$SHA")
\`\`\`
部署：解压即用（详阅包内 使用说明.md）。"

# 4) 创建 release（API 会按 target_commitish 自动建远程 tag）
SHA_C=$(git -C "$ROOT" rev-parse "$TAG^{commit}")
if [ -z "$EXIST" ]; then
  REL=$(python - "$REPO" "$TAG" "$SHA_C" "$BODY" <<'PYEOF'
import sys, json, os, urllib.request
repo, tag, sha, body = sys.argv[1:5]
req = urllib.request.Request(
  f"https://api.github.com/repos/{repo}/releases",
  data=json.dumps({"tag_name": tag, "target_commitish": sha, "name": tag,
                   "body": body, "draft": False, "prerelease": False}).encode(),
  headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}", "Content-Type": "application/json"},
  method="POST")
try:
    with urllib.request.urlopen(req, context=None) as r:
        d = json.load(r); print(d["id"]); print(d["html_url"])
except Exception as e:
    print("ERR", e, file=sys.stderr); sys.exit(1)
PYEOF
)
  if [ -z "$REL" ]; then echo "创建 release 失败"; exit 1; fi
  REL_ID=$(echo "$REL" | head -1); echo "created: $(echo "$REL" | tail -1)"
else
  REL_ID=$EXIST; echo "复用已有 release id=$REL_ID"
fi

# 5) 上传资产（zip + sha256，跳过已存在同名资产）
upload_asset() {
  local name="$1" file="$2"
  python - "$REPO" "$REL_ID" "$name" "$file" <<'PYEOF'
import sys, os, json, urllib.request, mimetypes
repo, rel_id, name, path = sys.argv[1:5]
url = f"https://uploads.github.com/repos/{repo}/releases/{rel_id}/assets?name={name}"
req = urllib.request.Request(url, data=open(path, 'rb').read(),
  headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}", "Content-Type": "application/octet-stream"},
  method="POST")
try:
    with urllib.request.urlopen(req) as r:
        d = json.load(r); print("uploaded:", d["name"], d["size"], "bytes")
except Exception as e:
    print("ERR:", e, file=sys.stderr); sys.exit(1)
PYEOF
}
for f in "$OUT" "$SHA"; do
  upload_asset "$(basename "$f")" "$f"
done

echo "== 完成: https://github.com/$REPO/releases/tag/$TAG =="