# CLAUDE.md

Project-specific instructions for Claude Code sessions on PhiLogg. This file
loads automatically every session — kept short on purpose. `PROJECT.md` is
the entry point into the architecture: overview, data model, gotchas, and
links into `docs/*.md` for per-feature detail. `CHANGELOG.md` holds the
chronological, dated history — read it for "why/when did X change", not for
"how does X work today" (that's `docs/`). For planned work see
`FEATURE_BACKLOG.md`.

## What this is

PhiLogg: a single self-contained `philogg.html` (~20,800 lines, inline CSS,
vanilla JS — no framework, no build tooling; the only tooling is
`scripts/strip-comments.js`, which release builds run over a throwaway copy
— see `PROJECT.md` → "Release builds"). Personal tool for browser-based
log analysis. Companion: `tests/philogg.regression.test.js` (jsdom
regression suite, see `tests/README.md` for conventions). Optional
`desktop/` wrapper (Tauri v2 + the OS webview) adds file associations
and a frameless window around the unmodified `philogg.html` — see
`desktop/README.md`.

## Non-negotiables

- **Diagnose before implementing.** For bug reports or ambiguous behavior,
  find the root cause first, then fix — not a speculative patch.
- **Every feature/fix ships with regression tests.** Extend
  `tests/philogg.regression.test.js` per `tests/README.md`'s conventions
  (new `GROUP N`, one line in TEST PROVENANCE, update/remove superseded
  groups instead of leaving a green check on dead code).
- **Run the full suite (`cd tests && npm test`) only when code changed** —
  i.e. `philogg.html`, `tests/philogg.regression.test.js`, `scripts/`, or
  anything under `desktop/`. Report the pass count when you do. A session that only touched
  Markdown (`PROJECT.md`, `docs/*.md`, `CHANGELOG.md`, `README.md`,
  `FEATURE_BACKLOG.md`, `CLAUDE.md`) does not need a test run "to be safe" —
  don't run it out of habit.
- **Update the docs every session that changes behavior**: a dated,
  newest-first entry in `CHANGELOG.md`; the relevant `docs/*.md` file (or
  `PROJECT.md` itself for core architecture) updated to describe the
  *current* state — don't append a second narrative on top of the old one,
  edit the section to reflect how it works now; line count in `PROJECT.md`
  if it moved meaningfully. A pure doc/planning session doesn't need a
  changelog entry.
- **Keep `README.md` up to date.** It's the human-facing entry point
  (overview, features, screenshots, usage, license) — `PROJECT.md` stays
  the entry point and full reference for Claude sessions. When a session
  adds/removes/changes a user-visible feature, update README's feature
  list/screenshots references accordingly instead of leaving it stale;
  keep implementation detail out of it and link to `PROJECT.md` for that.
- **Simplest solution that solves the actual problem** — no speculative
  complexity (size caps, expiry, etc.) until it's a real, current problem.
- Code and comments in English.
- **`FEATURE_BACKLOG.md` entries get unique, permanent IDs via `LAST_ID`**
  in the file's header. Adding an entry: read `LAST_ID`, add 1, use that
  value as the new entry's ID, then update `LAST_ID` to the same value.
  Editing or moving an entry never changes its ID. Implementing a feature:
  remove its entry from the backlog; its ID stays retired and is never
  reused, and `LAST_ID` does not change.

## Known gotchas — check PROJECT.md / docs/ before touching related code

`stopPropagation` on any click handler that opens a popup; DOM identity
across clicks (`renderVisibleRows()` rebuilds nodes, breaking native
`dblclick`; `renderTree()` does too, breaking native `click` on another row
during a hot loop — see "load ticks never rebuild `#tree`" in PROJECT.md);
no `crypto.subtle` (sync FNV-1a fingerprint is intentional).
`node.value` is immutable by convention (clone/snapshot/capture copy it by
reference — replace it wholesale, never mutate the object/array in place);
`restoreSubtree` rebuilds nodes as new objects under the original ids.
Any new filter-node field must be threaded through all persistence carriers:
`cloneSubtree`, `snapshotSubtree`/`restoreSubtree`,
`serializeFilterBranch`/`importFilterJson`,
`serializeFilterTreeForCache`/`materializeCachedFilters`.
