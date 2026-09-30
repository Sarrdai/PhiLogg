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
| Page in headless Chromium | `tools/perf/chromium-scroll-bench.js` | log-view row render cost, what the viewport shows while scrolling | global Playwright (preinstalled) |
| Page in headless Chromium | `tools/perf/chromium-load-bench.js` | load wall time, main-thread stall, heap, filter create+render | global Playwright (preinstalled) |
| Real desktop app | `tools/perf/desktop-load-bench.sh` | wall time from open to rendered, per route | WebKitGTK, Xvfb, release build |

## Test data

```
node tools/perf/gen-log.js /tmp/philogg-perf/perf-650k.log 650000
```

Deterministic synthetic log in the builtin default format: 650,000 entries
≈ 100 MB, every 10th with a stack-trace continuation line — close to the
size the person tests with. `desktop-load-bench.sh` generates it itself if
missing. Keep big files out of the repo (`/tmp` or the session scratchpad).
Kept separate from the log simulator (`tools/log-sim/`, varied content in
every format — `--size 100MB` for realistic big files) so the recorded
baselines stay comparable.

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

## Level 2b — the page in headless Chromium (scrolling)

```
NODE_PATH=$(npm root -g) node tools/perf/chromium-scroll-bench.js /tmp/philogg-perf/perf-650k.log [philogg.html]
```

Opens the page from `file://` in the container's preinstalled Chromium
(Playwright; `PLAYWRIGHT_BROWSERS_PATH` is set, never `playwright install`)
and loads the file through `#fileInput`. Chromium is WebView2's engine
family, so this is the closest stand-in for the Windows desktop app that
runs here — and scrolling can't be measured in Level 3 at all (the
unmapped Xvfb window never ticks `requestAnimationFrame`). Prints:

- the scroll scale (`tableScrollHeightScale`; 1 = uncompressed) and the
  cost of a full `renderVisibleRows()` rebuild vs. a scroll render
  (`renderVisibleRows(true)`, 100px steps), style + layout included;
- per scroll scenario (real `mouse.wheel` events): rows moved, renders,
  **blank** — renders where the viewport, just before the render, had no
  rows at its top or bottom (the old rows at the new scroll offset: what
  the compositor showed for that frame) — and **jumps** — renders that
  changed which entry sits at the viewport top (0 = seamless).

Headless wheel events scroll instantly (no smooth-scroll animation), so a
"400px x40" flick is a worst case, not a typical gesture. A scrollbar-thumb
drag isn't in the script: driven from Playwright, several steps land in
one frame and the render count reads low; drive it from inside the page
(`tableBody.scrollTop += ...` in a `setTimeout` loop) if it matters.

## Level 2c — the page in headless Chromium (load and filters)

```
NODE_PATH=$(npm root -g) node tools/perf/chromium-load-bench.js /tmp/philogg-perf/perf-650k.log [philogg.html] [runs]
```

Same setup as Level 2b, a fresh browser context per run (so the session
cache starts empty), the file loaded through `#fileInput` — the browser
drop/dialog route: `readFileWithProgress`, the JS worker parse, the session
cache write. Per run:

- **load**: wall time from `setInputFiles` until the `render()` that shows
  the fully loaded file has returned (every `render()` is wrapped and
  timestamped);
- **max stall**: the longest gap between two ticks of a 10ms `setInterval`
  heartbeat during the load and 1.5s after it — how long the page was
  unresponsive at worst;
- **heap**: `Runtime.getHeapUsage` after a forced GC. JS heap only: strings
  Blink creates (a `TextDecoder` result, say) can live outside it, so a
  change of *where* strings come from can move this number without memory
  actually being freed — it misled once (a 187 MB reading that was really
  ~325 MB);
- **level filter / text filter**: `applyLevelFilterUnderRootFile(root,
  "ERROR")` (162,500 matches) and a `"customer 42"` text filter under the
  file, each created and rendered, style and layout included.

The generated test file's timestamps wrap every 86,400 entries, so it is
**not chronological** — the minimap's sorted-ts fast path
(`minimapBucketBounds`) never applies to it. For that path, generate a
sorted variant (the same script with `s = Math.floor(i / 8)`) — real logs
are sorted.

## Level 2d — the page in headless Chromium (live tracking)

```
NODE_PATH=$(npm root -g) node tools/perf/chromium-tail-bench.js /tmp/philogg-perf/perf-650k.log [philogg.html] [ticks]
```

Loads the file like Level 2c, puts a level filter (ERROR), a text filter
("customer 42") and a text filter under the level node on it, activates the
text filter, and turns the file into a tailed one whose handle serves the
loaded `File` plus lines appended between ticks (20 per tick, the handle's
`getFile` non-enumerable so the cache record clones like a real handle's).
Prints the median/max wall time of one `tailTick()` (poll, parse,
invalidation, the active view's render, layout), the longest heartbeat gap
during the ticks and during the 6 s after them (the debounced session-cache
write), and a `mergeFiles` of two sorted, overlapping 300k-entry files. Run
the old page for comparison with `git show <rev>:philogg.html > /tmp/old.html`.
The first filter-history write after creating the filters (one fingerprint
of the whole text, ~280 ms) lands inside the tick window — once, not per
tick.

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

- **The page runs headless.** The main window is created visible (there is
  no splash any more, see `desktop/README.md`), and even where a bare Xvfb
  doesn't map it the page inside runs normally — which is all a timing run
  needs.
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

### Tail polls (Level 3b)

```
tools/perf/desktop-tail-bench.sh [philogg.html] [log-file]
```

Same setup and result channel as the load bench. The instrumented page
(`tools/perf/instrument-tail-timing.js`) waits for the launch-argument file
to render, times five `tailTick()`s with the file unchanged, then the script
appends 1000 lines and the page times the poll that picks them up; prints
`{"idle":[ms…],"growth":ms,"added":entries}`. Rebuild the binary after a
`protocol.rs` change — the Range handling is on the Rust side.

### Reading the numbers

- **Noisy.** The cloud container shares CPU; the same run has varied
  between 3.3 s and 6.6 s. Run ≥ 3 times per route and compare medians;
  treat the first run as cold (page cache).
- **Relative, not absolute.** WebKitGTK (JavaScriptCore) under Xvfb is not
  WebView2 (V8) on Windows — the person's Windows timings have been ~1.5–2×
  faster for the JS path. Use this to compare two builds or two routes;
  confirm user-facing claims with a Windows beta build
  (`beta-release.yml`).
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
| 2026-09-24 | baseline for the load/filter session (same container, later) | 2.8–3.2 s | 6.9–7.3 s |
| 2026-09-24 | + parallel JS parse (binary worker transport) | — | 3.6–3.9 s |
| 2026-09-24 | + aggregates, lazy Context view, message-task drain (final) | 2.7–3.1 s | 3.8–3.9 s |

This route (`loadUrlIntoTree`) writes no session-cache record, so the
session-cache change (below) doesn't show here; the native column also
parses in Rust, so only the render work changed for it. An intermediate
state drained parsed batches with `setTimeout(0)` yields: the JS path went
to 9.2 s, because an unmapped Xvfb window counts as hidden and its timers
are throttled — which is why the drain yields through `queueTask` (a
`MessageChannel` message) now; a real minimized or tray-hidden window is
the same case.

Browser route (Level 2c, headless Chromium 141, same file, `#fileInput`,
median of 4 runs; filters created under the file with the Filtered tab
showing):

| Date | State | load | max stall | JS heap | level filter | text filter |
|---|---|---|---|---|---|---|
| 2026-09-24 | before | 2.87 s | 460 ms | 357 MB | 530 ms | 220 ms |
| 2026-09-24 | session cache stores the File (no rebuilt text on the load path) | 2.55 s | 460 ms | 357 MB | — | — |
| 2026-09-24 | + parallel worker parse, binary transport | 2.13 s | 410 ms | 325 MB | — | — |
| 2026-09-24 | + per-file aggregates, chunked drain | 2.21 s | 205 ms | 325 MB | — | — |
| 2026-09-24 | + Context view only while visible (final) | 2.10 s | 225 ms | 326 MB | 100 ms | 188 ms |

Final run on a chronological variant of the file (minimap fast path active):
load 2.04–2.46 s, first render after the load 43 ms (230 ms before the
aggregates, 118 ms with them on the unsorted file). With the Context tab
showing: a re-render of the level filter 222 → 98 ms; switching to the
Context tab 28 → 124 ms (the one build every render used to pay). Numbers are
±30% between runs; the text filter didn't change (its cost is
`textFilterMatches` lower-casing every `raw`, untouched here). Where the
load's time goes now: ~0.2 s `FileReader`, ~1.4 s the four workers (parse
plus batch encoding, ~25 MB each), the main thread adopting ~650k entries
(`entryIndex`/`uid` ~0.4 s, spread over the load) and GC.

Rust crate alone, same file: read ~0.3 s, parse ~0.6 s (4 threads) /
~1.7 s (1 thread), batch encoding ~0.4 s.

Live tracking (2026-09-25, same file; Level 2d in headless Chromium 141 with
three filters, Level 3b in the desktop app with none):

| State | tick (Chromium) | stall after ticks (cache write) | idle poll (desktop) | growth poll, 1000 lines (desktop) |
|---|---|---|---|---|
| before | 330–365 ms | 380–435 ms | 2,315–2,375 ms | 2,348 ms |
| per-entry filters extended, history record not re-fingerprinted, Blob snapshot, Range reads | 48–58 ms | 32–41 ms | 1–3 ms | 131–138 ms |

Before, a tailed 100 MB desktop file's poll took longer than the 1.5 s
poll interval (the whole file re-read and copied each time), and in the
browser each tick paid the tick (~340 ms) plus a whole-text fingerprint for
the filter-history record (~280 ms). A linear k-way merge of sorted sources
was tried for `fillMergedEntries` and dropped: V8's TimSort already merges
two sorted runs in linear time (2 x 300k overlapping: 243–365 ms either
way, 660 ms for the chunked JS merge).

Scrolling (Level 2b, headless Chromium 141, same 650k-entry file, 572px
viewport; "blank"/"jumps" per scroll render, see Level 2b):

| Date | State | scale | full rebuild | scroll render | wheel down x40 | wheel up x40 | 400px flick x40 |
|---|---|---|---|---|---|---|---|
| 2026-09-24 | before (950,000px cap bug, 100ms throttle) | 0.052 | 5.7 ms | 13.8 ms | 14 jumps (max 195 rows) | 15/15 blank | 13/15 blank |
| 2026-09-24 | cap fix, per-frame renders, row reuse | 1 | 5.5 ms | 0.8 ms | 0 | 0/40 blank | 0/40 blank |

Before the fix one wheel notch moved 68 rows; after, 4.
