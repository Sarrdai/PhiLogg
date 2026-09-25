#!/usr/bin/env bash
# Tail-poll cost of the REAL desktop app (Tauri + WebKitGTK), headless — see
# docs/performance-testing.md → "Level 3b".
#
#   tools/perf/desktop-tail-bench.sh [philogg.html] [log-file]
#
# Opens the log via the launch-argument route (so it is tailed through
# philogg://local/…), lets the instrumented page time five idle polls, then
# appends 1000 lines to the file and times the poll that picks them up.
# Needs the same release build and xvfb-run as desktop-load-bench.sh.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=${PERF_WORK:-/tmp/philogg-perf}
mkdir -p "$WORK"
HTML=${1:-$ROOT/philogg.html}
LOG=${2:-$WORK/perf-650k.log}
BIN=$ROOT/desktop/src-tauri/target/release/philogg-desktop
[ -x "$BIN" ] || { echo "no release build — run: (cd desktop/src-tauri && cargo build --release)" >&2; exit 1; }
[ -f "$LOG" ] || { echo "generating $LOG ..."; node "$ROOT/tools/perf/gen-log.js" "$LOG" 650000; }
PAGE=$(dirname "$BIN")/philogg.html
node "$ROOT/tools/perf/instrument-tail-timing.js" "$HTML" "$PAGE" || exit 1
trap 'cp "$ROOT/philogg.html" "$PAGE"' EXIT
cp "$LOG" "$WORK/tail.log"
rm -rf "$WORK/cfg" "$WORK/data" "$WORK/cache"
export XDG_CONFIG_HOME=$WORK/cfg XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
SETTINGS=$WORK/cfg/PhiLogg/settings.json
timeout 240 xvfb-run -a "$BIN" "$WORK/tail.log" >"$WORK/app-tail.log" 2>&1 &
PID=$!
appended=0; result=""
for _ in $(seq 1 230); do
  sleep 1
  result=$(node -e 'try { const s = require(process.argv[1]); if (s["philogg-debug-tail"]) console.log(s["philogg-debug-tail"]); } catch {}' "$SETTINGS" 2>/dev/null || true)
  if [ -n "$result" ] && [ $appended = 0 ]; then head -c 200000 "$LOG" | tail -n 1000 >> "$WORK/tail.log"; appended=1; fi
  case "$result" in *added*) break;; esac
  kill -0 "$PID" 2>/dev/null || break
done
kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
echo "${result:-no result (see $WORK/app-tail.log)}"
