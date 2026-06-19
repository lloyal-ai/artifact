#!/usr/bin/env bash
# Publish a built dmg to R2 (apps.lloyal.ai/download). Run AFTER `npm run dist`
# has produced release/Artifact-<ver>-arm64.dmg (signed + notarized + stapled).
# Uploads both the versioned object and a stable `latest` alias.
#
# Requires: wrangler authed for the Cloudflare account that owns apps-lloyal-ai.
set -euo pipefail

cd "$(dirname "$0")"

VER=$(node -p "require('./package.json').version")
ARCH=arm64
DMG="release/Artifact-${VER}-${ARCH}.dmg"
BUCKET=apps-lloyal-ai
CT="application/x-apple-diskimage"

[ -f "$DMG" ] || { echo "✗ $DMG not found — run 'npm run dist' first." >&2; exit 1; }

# Refuse to publish an un-stapled dmg (would fail Gatekeeper on download).
xcrun stapler validate "$DMG" >/dev/null 2>&1 || {
  echo "✗ $DMG is not notarized+stapled — publish aborted." >&2; exit 1; }

echo "→ publishing $DMG (v$VER)"
for key in "Artifact-${VER}-${ARCH}.dmg" "Artifact-latest-${ARCH}.dmg"; do
  npx wrangler r2 object put "${BUCKET}/download/${key}" \
    --file="$DMG" --content-type="$CT" --remote
done

echo "✓ live:"
echo "    https://apps.lloyal.ai/download/Artifact-${VER}-${ARCH}.dmg"
echo "    https://apps.lloyal.ai/download/Artifact-latest-${ARCH}.dmg"
