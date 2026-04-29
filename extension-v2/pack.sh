#!/usr/bin/env bash
# Build the production zip for Chrome Web Store submission.
# Output: spw-wallet-v<version>.zip in the extension-v2 directory.

set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -p "require('./manifest.json').version")
OUT="spw-wallet-v${VERSION}.zip"

# Always rebuild the vendor bundle from package.json so the zip matches source.
if [ ! -d node_modules ]; then
  echo "→ npm install"
  npm install --no-audit --no-fund --silent
fi
echo "→ esbuild bundle"
npm run bundle --silent

# Files included in the production zip. Anything not in this list is excluded.
FILES=(
  manifest.json
  popup.html
  popup.js
  styles/main.css
  icons/icon-16.png
  icons/icon-32.png
  icons/icon-48.png
  icons/icon-128.png
  icons/sparrow.png
  vendor/spw-vendor.bundle.mjs
  lib/chainCache.js
  lib/crypto.js
  lib/rpc.js
  lib/spw.js
  lib/txClassify.js
  lib/ui.js
  lib/vault.js
  screens/activity.js
  screens/home.js
  screens/onboarding.js
  screens/receive.js
  screens/send.js
  screens/settings.js
  screens/unlock.js
)

rm -f "$OUT"
zip -q -X "$OUT" "${FILES[@]}"
echo "→ wrote $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Verify the contents:"
unzip -l "$OUT"
