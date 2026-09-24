#!/usr/bin/env bash
# End-to-end load timing of the REAL desktop app (Tauri + WebKitGTK) in a
# headless Linux container — see docs/performance-testing.md.
#
#   tools/perf/desktop-load-bench.sh [log-file] [runs]
#
# Needs a release build (cd desktop/src-tauri && cargo build --release) and
# xvfb-run. Opens the file via the launch-argument route, once natively and
# once forced through the JS parser, `runs` times each, and prints
# {ms, renders, entries} per run. Timings are wall time until the loaded
# file has been rendered.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=${PERF_WORK:-/tmp/philogg-perf}
mkdir -p "$WORK"
LOG=${1:-$WORK/perf-650k.log}
RUNS=${2:-3}
BIN=$ROOT/desktop/src-tauri/target/release/philogg-desktop
[ -x "$BIN" ] || { echo "no release build — run: (cd desktop/src-tauri && cargo build --release)" >&2; exit 1; }
command -v xvfb-run >/dev/null || { echo "xvfb-run missing (apt-get install -y xvfb)" >&2; exit 1; }
[ -f "$LOG" ] || { echo "generating $LOG ..."; node "$ROOT/tools/perf/gen-log.js" "$LOG" 650000; }

# The release binary serves the philogg.html NEXT TO IT (tauri-build copies
# it there at build time), not the repo's — so the instrumented copy goes
# there, and the plain one is put back afterwards.
PAGE=$(dirname "$BIN")/philogg.html
node "$ROOT/tools/perf/instrument-load-timing.js" "$ROOT/philogg.html" "$PAGE"
trap 'cp "$ROOT/philogg.html" "$PAGE"' EXIT

cp "$LOG" "$WORK/native.log"
cp "$LOG" "$WORK/nonative.log"
for route in native nonative; do
  for i in $(seq 1 "$RUNS"); do
    # Fresh profile every run: settings.json (the result channel), the
    # session cache (a restored session would load the file twice) and
    # WebKit's HTTP cache (it would serve a stale philogg.html).
    rm -rf "$WORK/cfg" "$WORK/data" "$WORK/cache"
    export XDG_CONFIG_HOME=$WORK/cfg XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
    SETTINGS=$WORK/cfg/PhiLogg/settings.json
    timeout 180 xvfb-run -a "$BIN" "$WORK/$route.log" >"$WORK/app-$route-$i.log" 2>&1 &
    PID=$!
    result=""
    for _ in $(seq 1 180); do
      sleep 1
      result=$(node -e 'try { const s = require(process.argv[1]); if (s["philogg-debug-timing"]) console.log(s["philogg-debug-timing"]); } catch {}' "$SETTINGS" 2>/dev/null || true)
      [ -n "$result" ] && break
      kill -0 "$PID" 2>/dev/null || break
    done
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
    echo "$route run $i: ${result:-no result (see $WORK/app-$route-$i.log)}"
  done
done
