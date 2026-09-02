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
    package.json
    README.md
```

## Run

```
cd tests
npm install
npm test          # ~30s, sharded across the available cores
```

While iterating on one group, run just that group instead of the whole
suite — this is the difference between a ~2s and a ~30s edit/run loop:

```
GROUP=58 npm test          # one group
GROUP=58,127 npm test      # several
SHARDS=1 npm test          # one process, no sharding (same as npm run test:single)
```

Or point at a `philogg.html` living elsewhere:

```
PHILOGG_HTML=/path/to/philogg.html node philogg.regression.test.js
```

`npm test` goes through `run.js`, which spawns one child per shard and sums
their results back into the single `N passed, M failed` line the suite has
always reported. **Always check that number** (2971 at the time of writing):
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
to 78s. This is equivalent to running it inline: `philogg.html` has exactly one
`<script>`, it is the last element in `<body>`, and the app hooks neither
`DOMContentLoaded`/`load` nor `readyState`/`document.currentScript`.
`runScripts` deliberately stays `"dangerously"` so the `<script>` elements the
tests themselves inject still execute.

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
building a window when the current group is not in this shard
(`SHARD=<index>/<total>`). The unit is the group, never the individual
`withApp` — multi-window groups (GROUP 20 and every other reload group) hand
one `IDBFactory` and closure state from one window to the next. Sub-lettered
banners (30a-e, 55a-d, 73b/c, ...) all carry their shared number and so land in
the same shard for the same reason. Top-level code *between* groups still runs
in every shard: it defines the helpers and fixtures (`nativeFolderBridge`,
`dirsA`/`bridgeA`, ...) that later groups close over.

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
2. Run `npm test` and fix until green before delivering the feature.
3. Add one line to the "TEST PROVENANCE" comment block at the end of the
   file, noting the originating session/date and a one-line summary.
4. If a session **removes or replaces** behavior an existing group tests
   (e.g. superseding a UI element, changing a function's semantics), update
   or delete that group's assertions in the same session — don't leave a
   green check that's silently testing dead code. Move a short note to the
   "Deliberately DROPPED" list in TEST PROVENANCE explaining why, the same
   way the existing entries do (checkbox multi-select, the old two-tab
   Filter/Highlight switcher, the old destructive double-click jump, etc.).

## Known gaps (things this suite does NOT cover)

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
- The `location.protocol === "file:"` guard in `loadFromUrlParam` (Group 66)
  isn't exercised: jsdom treats every `file:` URL as an opaque origin and
  throws on ANY `localStorage` access — which the app's own boot sequence
  hits before `loadFromUrlParam` even runs — and `window.location` can't be
  shadowed afterwards either (jsdom rejects redefining it or its `protocol`
  property). Covered by code review instead.
