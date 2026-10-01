# PhiLogg regression suite

Consolidated jsdom regression suite, assembled from the assertions written
across the project's implementation sessions (see "TEST PROVENANCE" at the
bottom of `philogg.regression.test.js` for the session-by-session map).

## Layout

Place this folder directly at the project root, sibling to `philogg.html`:

```
project-root/
  philogg.html
  PROJECT.md
  FEATURE_BACKLOG.md
  tests/                              <- this folder
    philogg.regression.test.js
    run.js                            <- shard runner, what `npm test` calls
    jsdom-fast-selectors.js           <- [data-*] selector fast path (see "How it works")
    package.json
    README.md
```

## Run

```
cd tests
npm install
npm test          # ~2-3 min on a 4-core machine, sharded across the available cores
```

While iterating on one group, run just that group instead of the whole
suite — this is the difference between a ~2s and a multi-minute edit/run loop:

```
GROUP=58 npm test          # one group
GROUP=58,127 npm test      # several
GROUP=58,127 SHARDS=2 npm test   # several, split across shards like a full run
SHARDS=1 npm test          # one process, no sharding (same as npm run test:single)
SHARDS=8 npm test          # more shards than cores: the load that exposes flaky groups
JSDOM_SELECTORS=verify npm test   # check the selector fast path against jsdom on every query
JSDOM_SELECTORS=1 npm test        # fast path off: jsdom's own selector engine everywhere
```

Or point at a `philogg.html` living elsewhere:

```
PHILOGG_HTML=/path/to/philogg.html node philogg.regression.test.js
```

`npm test` goes through `run.js`, which spawns one child per shard and sums
their results back into the single `N passed, M failed` line the suite has
always reported. Above it, a sharded run lists the ten slowest groups (wall
time in the shard that ran them), so a group that got seconds slower shows
up on the next run. **Always check that number** (8689 at the time of writing):
a group that silently stopped running shows up as a lower count, not as a
failure.

Both the shard children and `run.js` itself end on `process.exitCode`, never
`process.exit()`. Under the runner a child's stdout is a **pipe**, where
writes are asynchronous, and `process.exit()` discards whatever is still
buffered — which intermittently swallowed a child's own `##SHARD` result line
and made the total come out short by one whole shard, with nothing reported as
failing. Setting the code and letting the event loop drain cannot truncate.
Keep it that way when touching either file.

## How it works

Loads the *real* `philogg.html` with jsdom's `runScripts: "dangerously"` and
drives it through actual DOM events — clicks, keydown, drag sequences, form
submits — asserting on resulting state/DOM, per the project's established
"Testing approach" (see `PROJECT.md`). Layout-dependent getters
(`clientHeight`/`clientWidth`/`getBoundingClientRect`) are stubbed since
jsdom has no real layout engine — that also means it can't catch pure
CSS/paint bugs (see the note in the file's provenance section about the
`#tableWrap` flex-direction regression from 2026-08-10, which this suite
deliberately does NOT try to re-test).

Each group runs in its own fresh `JSDOM` instance (`withApp(...)`) so state
never bleeds between groups.

The page's inline `<script>` is **compiled once** into a `vm.Script` at module
level and run into each new window's VM context (`PAGE_SCRIPT.runInContext`),
rather than being left inline for jsdom to re-compile per window. It is the
same 870 KB of source every time, and re-compiling it for all ~290 windows was
~75% of the whole suite's runtime — pre-compiling it took the suite from 176s
to 78s. This is equivalent to running it inline: the app `<script>` is the
last element in `<body>` (the only other one, the FOUC script in
`<head>`, stays inline), and the app hooks neither
`DOMContentLoaded`/`load` nor `readyState`/`document.currentScript`.
`runScripts` deliberately stays `"dangerously"` so the `<script>` elements the
tests themselves inject still execute.

**The stylesheet goes in after the parse.** `PAGE_SHELL` also has its
`<style>` emptied, and `withApp` puts `PAGE_CSS` back into that same element
right after `new JSDOM(...)`, before the page script runs. Parsed in place,
parse5 feeds the ~280 KB of CSS through its RAWTEXT tokenizer as tens of
thousands of character tokens, each appended to the growing text node with its
own `replaceData` and mutation record: ~40% of every window's HTML parse, for
the same text every time. The page still ends up with the identical
stylesheet (1,411 rules) in the identical element, so `getComputedStyle` and
`styleSheets` behave as before; GROUP 346d pins that. Nothing in the parse
could notice the gap: the only script that runs there is the FOUC one, which
reads `localStorage` and `matchMedia`, never styles.

**`[data-*]` selectors skip jsdom's selector engine.**
`jsdom-fast-selectors.js` patches jsdom's `querySelector(All)` so that a
selector list made only of `[data-x]` / `[data-x="v"]` items is answered from
a per-document index (name → value → elements in tree order) that stays
valid until the next tree or data-* attribute change. jsdom's engine needed
~8ms for one document-wide `[data-row-action="…"]` on this page, and
`render()` runs ten of them, so this was ~45% of the suite's CPU time. Every
other selector, and every query that meets an odd-shaped data-* attribute
(uppercase, prefixed, namespaced — shapes jsdom's engine reads differently
from the spec), goes to jsdom's engine untouched, so the answers are jsdom's.
GROUP 346 holds the fast path against jsdom's engine on the real page and
through every kind of mutation; `JSDOM_SELECTORS=verify npm test` answers
every eligible query both ways and throws on any difference (run it after
touching the module or upgrading jsdom), `JSDOM_SELECTORS=1` turns it off.

**The background polls never run.** `withApp` never schedules the app's
`setInterval(tailTick, TAIL_POLL_MS)` and `setInterval(folderScanTick,
FOLDER_SCAN_MS)` (they are caught by function name; GROUP 346d fails if a
rename lets them through). Left running they fired in whichever group
outlived 1.5s, which only happened under full-suite load, and re-read files
or rescanned folders in the middle of assertions. A group that needs a tick
calls `w.tailTick()` / `w.folderScanTick()` itself at the moment it asserts on.

**Work a test leaves running doesn't end the shard.** A fire-and-forget
render the test never awaited can still be waiting on fake-indexeddb, which
lives outside the window, when `withApp` closes it; it then resumes, finds
`document` gone and rejects. Unhandled, that killed the whole shard (no
result line, every group in it lost). The suite's `unhandledRejection`
handler drops a rejection whose error comes from a window `withApp` already
closed (GROUP 346f); any other unhandled rejection still crashes the shard.

**Assertions must not depend on how fast the machine is.** Besides the
proxy-condition rule below, two patterns were flaky under load and must not
come back:
- asserting that something has *not happened yet* after a sleep, when an app
  timer can fire in between (334c used to count jobs after `sleep(10)` next
  to a 150ms dwell timer; it now checks right after each synchronous step);
- letting wall-clock cost decide what the app does, like the scroll renderer
  holding the next frame back after a render that took longer than
  `SCROLL_RENDER_BUDGET_MS` (266b now hides the render time from
  `performance.now` while it drives the scroll renderer).

**Waiting for async work: never poll a proxy condition.** The "reload" groups
used to spin `for (let i = 0; i < 40 && state.rootIds.length === 0; i++)`, but
`restoreSessionFromCache`'s *first* pass fills `rootIds` with grayed queued
placeholders — entries, `localPath`, filters, bookmarks and settings all land
later. Those loops were green only for as long as window construction stayed
slow, and started flaking the moment it got faster. Every such group now awaits
`T.bootRestore` instead — philogg.html names its boot promise
(`restoreSessionFromCache().then(... restoreWatchedFolders())`) precisely so
there is one exact "restore has settled" barrier. GROUP 127 is the deliberate
exception: it asserts on the *intermediate* restore state, so it uses
`waitFor(...)` on the structural moment it actually needs. For anything else,
use the `waitFor(pred)` helper and poll the thing you are about to assert on.
The remaining fixed `setTimeout` waits are genuine app timers that cannot be
compressed — the 150ms live-match debounce, the 450ms double-click window, the
0.5s temp-anchor fade — not sloppiness.

**Sharding.** Every `GROUP` banner is followed by a `group(N);` marker line,
which is how `run.js` tells the shards apart: `withApp` returns without
building a window when the current group is not in this shard. Shards don't
split the groups up front: each child claims the next group it reaches by
creating a directory named after it in a shared `SHARD_CLAIMS` temp dir
(`mkdir` is atomic, so exactly one child wins), which keeps all shards busy
until the end however unevenly the groups' costs are spread. Without
`SHARD_CLAIMS` (a child started by hand) `SHARD=<index>/<total>` falls back
to a fixed split. `run.js` also caps each child's heap
(`--max-old-space-size`) from the free memory divided by the shard count:
V8 keeps the finished windows around until memory runs short, so without
the cap more shards than the machine has memory for were OOM-killed. The
unit is the group, never the individual
`withApp` — multi-window groups (GROUP 20 and every other reload group) hand
one `IDBFactory` and closure state from one window to the next. Sub-lettered
banners (30a-e, 55a-d, 73b/c, ...) all carry their shared number and so land in
the same shard for the same reason. Top-level code *between* groups still runs
in every shard: it defines the helpers and fixtures (`nativeFolderBridge`,
`dirsA`/`bridgeA`, ...) that later groups close over.

**Blobs in IndexedDB.** fake-indexeddb clones stored values with Node's own
`structuredClone`, which can't see inside a jsdom `Blob`/`File` and would
store an empty object. The session cache stores a loaded `File` as-is (see
`docs/persistence-and-sync.md` → "Session cache"), so the suite wraps the
global `structuredClone`: top-level jsdom Blob fields of a stored record
become Node Blobs first (same bytes, same `text()`). A real browser's
IndexedDB needs no such help.

**Globals jsdom lacks** (`MessageChannel`, say) can be put in place before
the page's script runs with `withApp(fn, { beforeParse: window => ... })` —
GROUP 268f does that.

State internal to the app (`state`,
`fhLayout`, `undoStack`, ...) is exposed via a small bridge script injected
into the same document — see the `withApp` helper's comment for why (jsdom
gotcha: top-level `let`/`const` in the page's inline `<script>` aren't
`window` properties, only function declarations are).

## Extending this suite

**Keep this file and extend it every session** instead of writing a
throwaway test from scratch. When a session adds a feature:

1. Add a new `GROUP N` block (copy the shape of an existing one — the
   `/* ==== GROUP N ==== */` banner, **the `group(N);` marker line directly
   under it**, a `section(...)` header, a fresh
   `withApp(async (w, d, T) => { ... })`). Without the marker the group
   inherits the previous group's shard, which still runs it but puts it in
   the wrong bucket; a group whose only content is outside `withApp` (GROUP
   146) needs its own `if (groupSelected())` gate instead, or it runs in
   every shard and inflates the total.
   Number it one higher than the current max, but feel free to physically
   append it anywhere convenient — the groups don't depend on file order,
   only on running inside their own `withApp`. A group testing something
   that isn't the page itself may skip `withApp` entirely — GROUP 146
   (`scripts/strip-comments.js`, a plain Node module) is the one such case
   today, and uses a bare gated block instead.
2. Make it independent of machine speed. Every rule here comes from a group
   that was green alone and red under full-suite load (see "How it works"):
   - Wait for async work with `waitFor(pred)` on the thing you are about to
     assert (or `T.bootRestore` after a reload), never a fixed `sleep`.
   - Assert that something did *not* happen right after the synchronous step
     that could have caused it, never after a sleep an app timer (dwell,
     debounce, poll) can outlast.
   - Never let wall-clock time decide what the app does in the test: stub or
     hide `performance.now`/`Date.now` when a code path is cost- or
     time-based (GROUP 266b).
   - Need a tail or folder tick? Call `w.tailTick()` / `w.folderScanTick()`
     yourself; the background polls never run in a test window.
3. Run `npm test` and fix until green before delivering the feature. Look at
   the "Slowest groups" list above the total too: a new group in it needs a
   reason (a big generated log, say), not just an unlucky selector or a
   sleep. GROUP 346 sits at the top on purpose: it runs every checked query
   through jsdom's own slow selector engine as well, and a nested `run.js`. Before the final push run `SHARDS=8 npm test` once: more shards
   than cores is the load that exposes the rules above being broken, and a
   failure there is a bug in the test, not a flake to re-run.
4. Add one line to the "TEST PROVENANCE" comment block at the end of the
   file, noting the originating session/date and a one-line summary.
5. If a session **removes or replaces** behavior an existing group tests
   (e.g. superseding a UI element, changing a function's semantics), update
   or delete that group's assertions in the same session — don't leave a
   green check that's silently testing dead code. Move a short note to the
   "Deliberately DROPPED" list in TEST PROVENANCE explaining why, the same
   way the existing entries do (checkbox multi-select, the old two-tab
   Filter/Highlight switcher, the old destructive double-click jump, etc.).

## Known gaps (things this suite does NOT cover)

- The desktop wrapper's native parser (`desktop/src-tauri/logparse`, Rust)
  is never run by this suite. Group 264 pins the JS parser to
  `fixtures/native-parse-golden.json` and exercises the page's side with a
  stubbed `window.philogg.parseLogFile`; the same golden file is what the
  crate's own `cargo test` checks the Rust side against. Regenerate it after
  a deliberate JS parsing change with
  `UPDATE_NATIVE_GOLDEN=1 TZ=UTC GROUP=264 npm test`.

- Pure CSS/layout bugs — geometry, paint order, hit-testing — need
  manual/visual review instead (jsdom has no real layout engine). This does
  **not** extend to show/hide correctness, though: jsdom's
  `getComputedStyle(el).display` DOES correctly resolve the actual CSS
  cascade, so it reliably catches "a `.hidden`-class-toggle with no matching
  CSS rule" bugs — the app has no global `.hidden{display:none}`, every
  toggled element needs its own scoped rule (`#id.hidden{display:none}`),
  and `classList.contains("hidden")` alone can't tell a genuinely-hidden
  element from one that's still fully visible on screen (this bit the
  Settings inline panels once — see PROJECT.md's 2026-08-21 entry). Prefer
  the `isVisible(el, w)` test helper over raw `classList.contains("hidden")`
  whenever a test's whole point is "is this actually shown or hidden."
- The File System Access API itself (`showOpenFilePicker`, `showDirectoryPicker`
  etc.) is faked at the handle level for the tailing tests (Group 12) and the
  folder-watch tests (Group 37); the picker UI/permission flow itself is not
  exercised — `addWatchedFolder`/`loadFolderFile`/`folderScanTick` are called
  directly with fake `FileSystemDirectoryHandle`/`FileSystemFileHandle`
  objects rather than via `#btnOpenFolder`'s click handler.
- Plot tab rendering (SVG chart output) has dedicated coverage now — Group 53
  (marks/click-to-entry/axis-equal) and Group 54 (zoom/pan/drag-zoom/hover
  tooltip) — beyond the underlying data functions (`parseValueForPlot`, etc.)
  a few other groups also touch via assertion checks. Still not covered:
  pure visual/paint correctness (jsdom has no real layout or rendering
  engine, same blind spot as everywhere else in this suite).
- IDE Integration (Group 230) covers only the pure path-remap functions
  (`parseIdeLocation`, `resolveIdeSourcePath`, `buildRiderUri`). The Visual
  Studio side is Windows-desktop-only (COM automation via the Running Object
  Table, shelled out from `desktop/src-tauri/src/vs_integration.rs`) — the
  instance enumeration, the Settings dialog's Connect/instance-picker flow,
  actually opening a file in a running Visual Studio, and the context-menu
  items' live `window.philogg.isWindows`-gated visibility all need manual
  verification on a real Windows machine. Covered by code review instead.
- The `location.protocol === "file:"` guard in `loadFromUrlParam` (Group 66)
  isn't exercised: jsdom treats every `file:` URL as an opaque origin and
  throws on ANY `localStorage` access — which the app's own boot sequence
  hits before `loadFromUrlParam` even runs — and `window.location` can't be
  shadowed afterwards either (jsdom rejects redefining it or its `protocol`
  property). Covered by code review instead.
