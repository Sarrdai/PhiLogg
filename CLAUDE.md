# CLAUDE.md

Project-specific instructions for Claude Code sessions on PhiLogg. This file
loads automatically every session — kept short on purpose. For architecture,
design decisions, and the full changelog see `PROJECT.md`. For planned work
see `FEATURE_BACKLOG.md`.

## What this is

PhiLogg: a single self-contained `philogg.html` (~15,000 lines, inline CSS,
vanilla JS — no framework, no build tooling). Personal tool for browser-based
log analysis. Companion: `tests/philogg.regression.test.js` (jsdom
regression suite, see `tests/README.md` for conventions). Optional
`desktop/` Electron wrapper adds file associations and a frameless window
around the unmodified `philogg.html` — see `desktop/README.md`.

## Non-negotiables

- **Diagnose before implementing.** For bug reports or ambiguous behavior,
  find the root cause first, then fix — not a speculative patch.
- **Every feature/fix ships with regression tests.** Extend
  `tests/philogg.regression.test.js` per `tests/README.md`'s conventions
  (new `GROUP N`, one line in TEST PROVENANCE, update/remove superseded
  groups instead of leaving a green check on dead code).
- **Run the full suite before calling anything done:**
  `cd tests && npm test`. Report the pass count.
- **Update `PROJECT.md` every session**: changelog entry (newest-first),
  touched architecture sections, line count if it moved meaningfully.
- **Keep `README.md` up to date.** It's the human-facing entry point
  (overview, features, screenshots, usage, license) — `PROJECT.md` stays
  the entry point and full reference for Claude sessions. When a session
  adds/removes/changes a user-visible feature, update README's feature
  list/screenshots references accordingly instead of leaving it stale;
  keep implementation detail out of it and link to `PROJECT.md` for that.
- **Simplest solution that solves the actual problem** — no speculative
  complexity (size caps, expiry, etc.) until it's a real, current problem.
- Code and comments in English.

## Known gotchas — check PROJECT.md before touching related code

`stopPropagation` on any click handler that opens a popup; DOM identity
across clicks (`renderVisibleRows()` rebuilds nodes, breaking native
`dblclick`; `renderTree()` does too, breaking native `click` on another row
during a hot loop — see "load ticks never rebuild `#tree`" in PROJECT.md);
no `crypto.subtle` (sync FNV-1a fingerprint is intentional).
Any new filter-node field must be threaded through all persistence carriers:
`cloneSubtree`, `snapshotSubtree`/`restoreSubtree`,
`serializeFilterBranch`/`importFilterJson`,
`serializeFilterTreeForCache`/`materializeCachedFilters`.
