# LogTrail regression suite

Consolidated jsdom regression suite, assembled from the assertions written
across the project's implementation sessions (see "TEST PROVENANCE" at the
bottom of `logtrail.regression.test.js` for the session-by-session map).

## Layout

Place this folder directly at the project root, sibling to `logtrail.html`:

```
project-root/
  logtrail.html
  PROJECT.md
  FEATURE_BACKLOG.md
  tests/                              <- this folder
    logtrail.regression.test.js
    package.json
    README.md
```

## Run

```
cd tests
npm install
npm test
```

Or point at a `logtrail.html` living elsewhere:

```
LOGTRAIL_HTML=/path/to/logtrail.html node logtrail.regression.test.js
```

## How it works

Loads the *real* `logtrail.html` with jsdom's `runScripts: "dangerously"` and
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
- The File System Access API itself (`showOpenFilePicker` etc.) is faked at
  the handle level for the tailing tests (Group 12); the picker UI/permission
  flow is not exercised.
- Plot tab rendering (SVG chart output) is not covered — only the underlying
  data functions used across a few groups (`parseValueForPlot` via assertion
  checks). A dedicated group would be a reasonable future addition if the
  Plot tab sees more active development.
