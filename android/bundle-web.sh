#!/usr/bin/env bash
# Copy the web build's content-hashed assets into the APK.
#
# Only chunks/ and media/ are bundled: their filenames are content hashes, so
# the same source always produces the same names and a bundled copy is either
# byte-identical to what the server would send or absent. The buildId folder
# is deliberately left out — it is random per build, so bundling it would
# guarantee a mismatch.
#
# Anything not found in the APK falls through to the network, so a stale
# bundle degrades to "slower", never to "broken".
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d .next/static ] || { echo "run 'npm run build' first" >&2; exit 1; }

# Not "_next": Android's asset packager silently drops any directory whose
# name starts with an underscore (aapt's default ignoreAssetsPattern includes
# <dir>_*), so the files would vanish from the APK with no error at all.
DEST=android/app/src/main/assets/web/next/static
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R .next/static/chunks "$DEST/"
[ -d .next/static/media ] && cp -R .next/static/media "$DEST/"
[ -d .next/static/css ]   && cp -R .next/static/css   "$DEST/"

echo "bundled $(find "$DEST" -type f | wc -l | tr -d ' ') files, $(du -sh "$DEST" | cut -f1)"
