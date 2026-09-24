# Performance testing

How to measure load and render performance — including the **real desktop
app** (Tauri + WebKitGTK) inside a headless Linux cloud container, which
earlier sessions considered impossible. Everything here is scripted in
`tools/perf/`; this file explains the setup, what each tool measures, and
the traps that cost time the first time round.

Three levels, cheapest first. Pick the lowest one that can answer the
question — and always finish with the real app when the claim is "the user
will see it faster": the native-parsing session measured only the Rust crate
at first, reported a big speedup, and the tester build showed none (the
bottleneck was the transport to the page, which only the real app contains).

| Level | Tool | Measures | Needs |
|---|---|---|---|
| Rust crate alone | `logparse/examples/bench.rs` | read, parse, batch encoding | cargo |
| Page in jsdom | `tools/perf/render-profile.js` | JS parse, `render()` breakdown, CPU profile | `tests/node_modules` |
| Real desktop app | `tools/perf/desktop-load-bench.sh` | wall time from open to rendered, per route | WebKitGTK, Xvfb, release build |

## Test data

```
node tools/perf/gen-log.js /tmp/philogg-perf/perf-650k.log 650000
```

Deterministic synthetic log in the builtin default format: 650,000 entries
≈ 100 MB, every 10th with a stack-trace continuation line — close to the
size the person tests with. `desktop-load-bench.sh` generates it itself if
missing. Keep big files out of the repo (`/tmp` or the session scratchpad).

## Level 1 — the native parser alone

```
cd desktop/src-tauri
cargo run --release -p philogg-logparse --example bench -- /tmp/philogg-perf/perf-650k.log
RAYON_NUM_THREADS=1 cargo run --release -p philogg-logparse --example bench -- <file>   # single core
```

A second argument takes another format spec (a `nativeFormatSpec` result,
e.g. copied from `tests/fixtures/native-parse-golden.json`) to time a
regex-mode format. Needs no webview, so it runs in any container. It says
**nothing** about what the user waits for — see the warning above.

## Level 2 — the page in jsdom

```
cd tests
NODE_PATH=$PWD/node_modules node --max-old-space-size=8000 ../tools/perf/render-profile.js /tmp/philogg-perf/perf-650k.log
```

Loads the file through `addFile` (the JS parser; jsdom has no `Worker`, so
it's the main-thread fallback loop), then times two warm `render()`s broken
down into `renderTree`/`renderLevelBar`/`renderMainView`/
`renderTimelineMinimap`, and prints a V8 CPU profile (self and inclusive
time) of two more renders.

How it works, for extending it: global function declarations of the page
are `window` properties and the page's own calls resolve through them, so
wrapping `w.render` etc. times the real calls. The profile comes from
Node's `inspector` module (`Profiler.start/stop`), no flags needed.

Reading it:
- **Line numbers are relative to the inline `<script>`** — add the line of
  the `<script>` tag in `philogg.html` (`grep -n "<script>" philogg.html |
  tail -1`) to get the file line.
- **jsdom is slow at DOM queries**: `querySelectorAll`/`matchSelector`
  (e.g. under `updateRowActionButtons`) cost far more here than in a
  browser. Discount them; look for per-entry work instead — that is what
  scales with file size in every engine. (That is how the per-entry
  `levelBucket` calls in the timeline minimap and the level counts were
  found.)
- Absolute times are V8 in Node, not WebKit/WebView2 — compare before/after,
  don't quote them as app numbers.

## Level 3 — the real desktop app, headless

### One-time setup per container (~5 min)

```
sudo apt-get update                      # without it the install 404s on stale package URLs
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev xvfb
cd desktop/src-tauri
cargo build --release                    # ~4 min cold, ~1.5 min after a change
```

`cargo build --release` is enough — no `npm run build`/Tauri CLI, no
installer. The binary is `desktop/src-tauri/target/release/philogg-desktop`.
Rebuild after any Rust or `inject.js` change; a `philogg.html`-only change
needs no rebuild (see the first trap below).

### Run

```
tools/perf/desktop-load-bench.sh [log-file] [runs]    # default: generated 100 MB file, 3 runs
PERF_WORK=/some/dir tools/perf/desktop-load-bench.sh  # work dir, default /tmp/philogg-perf
```

Output, per run and route:

```
native run 1: {"ms":4542,"renders":2,"entries":650000}
nonative run 1: {"ms":7983,"renders":3,"entries":650000}
```

`ms` is wall time from `loadUrlIntoTree`'s start until its final
`render()` has run — "the file is shown as fully loaded", the moment the
person times by eye. `renders` counts `render()` calls in between (one is
the empty row appearing). `native` is the Rust path; `nonative` forces the
JS parser in the same build.

### How it works — and the traps it avoids

- **The app runs, the window doesn't.** Under Xvfb the splash never
  dismisses and the main window never shows (see `desktop/README.md` →
  "Status": `requestAnimationFrame` doesn't tick for an unmapped window), but
  the page inside it runs normally — which is all a timing run needs.
- **Only the launch-argument route can be driven.** `philogg-desktop
  <file>` opens the file through `loadUrlIntoTree` (the file-association
  route). Drag & drop and the file dialog can't be driven headless; they
  share the same parse/transport/render path (`loadOneFileIntoTree`), so the
  numbers carry over, but the person's own Windows test is by drag & drop.
- **Getting numbers out of a headless webview.** No devtools, and the page's
  console doesn't reach stdout. The trick: the wrapper mirrors every
  `philogg-*` `localStorage` key into `settings.json` once a second
  (`inject.js`, "settings mirror"). `tools/perf/instrument-load-timing.js`
  writes a copy of `philogg.html` whose `loadUrlIntoTree` stores its timing
  under `philogg-debug-timing`, and the script polls
  `$XDG_CONFIG_HOME/PhiLogg/settings.json` for it, then kills the app. No
  Rust rebuild needed for new measurement points — extend the instrument
  script (it fails loudly if its anchors in `loadUrlIntoTree` moved). For
  Rust-side timings, a temporary `eprintln!` shows up in the app's stderr
  (`$PERF_WORK/app-*.log`) — don't commit it.
- **The release binary does not read the repo's `philogg.html`.**
  `tauri-build` copies it next to the binary
  (`target/release/philogg.html`, the "resource dir") at build time, and the
  binary serves that copy. Editing `philogg.html` and re-running without
  copying measures the OLD page (cost an hour once: new instrumentation
  "didn't fire"). The script writes its instrumented copy there and restores
  the plain one on exit.
- **A fresh profile per run.** `XDG_CONFIG_HOME` (settings.json — the result
  channel), `XDG_DATA_HOME` (IndexedDB session cache — a restored session
  would load the file twice) and `XDG_CACHE_HOME` (WebKit's HTTP cache,
  which otherwise serves a stale page) all point into the work dir and are
  wiped before each run.
- **Forcing the JS path** in the same build: the instrumented copy skips
  the native parser when the URL contains `nonative`, so the script opens
  the same bytes as `native.log` and `nonative.log`.

### Reading the numbers

- **Noisy.** The cloud container shares CPU; the same run has varied
  between 3.3 s and 6.6 s. Run ≥ 3 times per route and compare medians;
  treat the first run as cold (page cache).
- **Relative, not absolute.** WebKitGTK (JavaScriptCore) under Xvfb is not
  WebView2 (V8) on Windows — the person's Windows timings have been ~1.5–2×
  faster for the JS path. Use this to compare two builds or two routes;
  confirm user-facing claims with a Windows tester build
  (`build-tester-files.yml`).
- **Finding where the time goes** takes intermediate timestamps. The
  native-parsing investigation added, temporarily, timestamps at: native
  call resolved, `flushLoadRender` done, first/last batch arrival, and
  summed decode/adopt time inside `parseLocalFileNatively`'s callback — that
  breakdown (Rust done at 1.0 s, page done at 8.2 s) is what showed the
  JSON transport was the bottleneck. Add such points to the instrument
  script as needed rather than to `philogg.html`.

## Recorded results

Kept here so later sessions have a baseline (100 MB / 650k entries,
default format, 4-core cloud container, launch-argument route, until
rendered):

| Date | State | native | JS path |
|---|---|---|---|
| 2026-09-24 | first native version (JSON transport) | 8.6 s | 9.0 s |
| 2026-09-24 | binary transport | 4.3 s | 8.4 s |
| 2026-09-24 | + one render per load, memoized level work | 3.3–4.5 s | 8.0–8.1 s |

Rust crate alone, same file: read ~0.3 s, parse ~0.6 s (4 threads) /
~1.7 s (1 thread), batch encoding ~0.4 s.
