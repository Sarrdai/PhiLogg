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
    package.json
    README.md
```

## Run

```
cd tests
npm install
npm test
```

Or point at a `philogg.html` living elsewhere:

```
PHILOGG_HTML=/path/to/philogg.html node philogg.regression.test.js
```

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

Each of the 19 groups runs in its own fresh `JSDOM` instance (`withApp(...)`)
so state never bleeds between groups. State internal to the app (`state`,
`fhLayout`, `undoStack`, ...) is exposed via a small bridge script injected
into the same document — see the `withApp` helper's comment for why (jsdom
gotcha: top-level `let`/`const` in the page's inline `<script>` aren't
`window` properties, only function declarations are).

## Extending this suite

**Keep this file and extend it every session** instead of writing a
throwaway test from scratch. When a session adds a feature:

1. Add a new `GROUP N` block (copy the shape of an existing one — a
   `section(...)` header, a fresh `withApp(async (w, d, T) => { ... })`).
   Number it one higher than the current max, but feel free to physically
   append it anywhere convenient — the groups don't depend on file order,
   only on running inside their own `withApp`.
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

- Pure CSS/layout bugs (jsdom has no real layout engine or hit-testing) —
  needs manual/visual review instead.
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
