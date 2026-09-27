#!/usr/bin/env bash
# Regenerates every README screenshot from log-simulator data — see
# PROJECT.md -> "Sample data and screenshots". Each scenes/NN-name.js is
# appended to scenes/common.js and run in the page (screenshot.js --eval);
# the PNG lands next to this script as NN-name.png.
#   docs/screenshots/generate.sh [scene-name-filter]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DATA="$(mktemp -d)"
trap 'rm -rf "$DATA"' EXIT
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"

node "$ROOT/tools/log-sim/cli.js" -n 6000 --seed 7 -s all,-text,-gaps -o "$DATA/app.log" -q
for scene in "$HERE"/scenes/[0-9]*.js; do
  name="$(basename "$scene" .js)"
  [[ -n "${1:-}" && "$name" != *"$1"* ]] && continue
  node "$ROOT/tools/log-sim/screenshot.js" --size 1440x900 --wait 800 --out "$HERE/$name.png" \
    --eval "$(cat "$HERE/scenes/common.js" "$scene")" "$DATA/app.log"
done
