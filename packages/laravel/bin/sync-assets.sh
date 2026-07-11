#!/usr/bin/env bash
# Rebuild the JS packages from the current working tree and vendor the browser
# bundles into this Laravel package. Run whenever the SDK or dashboard changes.
#
#   packages/laravel/bin/sync-assets.sh
#
set -euo pipefail

# Repo root = two levels up from this script (packages/laravel/bin → repo).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEST="$ROOT/packages/laravel/resources/dist"

echo "→ Building shared → sdk → dashboard…"
npm --prefix "$ROOT" run build --workspace @loupekit/shared
npm --prefix "$ROOT" run build --workspace @loupekit/sdk
npm --prefix "$ROOT" run build --workspace @loupekit/dashboard

echo "→ Vendoring bundles into $DEST…"
mkdir -p "$DEST/sdk" "$DEST/dashboard"
cp "$ROOT/packages/sdk/dist/index.global.js" "$DEST/sdk/loupe.js"
cp "$ROOT/packages/dashboard/dist/app.js" "$DEST/dashboard/app.js"

echo "✓ Loupe Laravel assets synced."
