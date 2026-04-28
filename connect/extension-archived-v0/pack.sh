#!/usr/bin/env bash
# Build a Chrome Web Store-ready ZIP from this extension folder.
#
# What gets shipped:  manifest.json, content.js, inject.js, popup.html, popup.js, icons/
# What gets excluded: README.md, PRIVACY.md, STORE_LISTING.md, SMOKE_TEST.md,
#                     screenshots/, test-fallback.html, pack.sh itself, .git*, .DS_Store
#
# Output:  spw-wallet-connect-v<version>.zip  in the current directory.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

# Extract version from manifest.json (Python because grep/awk on JSON is fragile).
version="$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")"
name="spw-wallet-connect-v${version}.zip"

# Build from a clean staging copy so ad-hoc editor files don't leak in.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

# Explicit include-list. Keeps the ZIP minimal and reviewable.
files=(
  manifest.json
  content.js
  inject.js
  popup.html
  popup.js
  icons
)

for f in "${files[@]}"; do
  [[ -e "$f" ]] || { echo "FATAL: required file missing: $f" >&2; exit 1; }
  cp -r "$f" "$stage/"
done

# Strip macOS metadata from the staging copy (if any).
find "$stage" -name '.DS_Store' -delete
find "$stage" -name '._*' -delete

# Rebuild ZIP from scratch. Use python3 -m zipfile so we don't depend on `zip` CLI
# (not installed on many minimal Linux containers), and we get deterministic order.
rm -f "$name"
python3 - "$stage" "$here/$name" <<'PY'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(stage):
        dirs.sort(); files.sort()
        for f in files:
            abs_path = os.path.join(root, f)
            rel = os.path.relpath(abs_path, stage)
            z.write(abs_path, rel)
PY

# Verify: manifest.json must be at the ZIP root, nothing else surprising inside.
echo "---- ZIP contents ----"
python3 -c "import zipfile,sys; [print(n) for n in sorted(zipfile.ZipFile(sys.argv[1]).namelist())]" "$name"
echo "----------------------"

if ! python3 -c "import zipfile,sys; sys.exit(0 if 'manifest.json' in zipfile.ZipFile(sys.argv[1]).namelist() else 1)" "$name"; then
  echo "FATAL: manifest.json is not at the root of $name" >&2
  exit 2
fi

size_kb="$(du -k "$name" | cut -f1)"
echo "✓ Built $name (${size_kb} KB) — ready to upload to chrome.google.com/webstore/devconsole"
