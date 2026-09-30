# CLAUDE.md

Project-specific instructions for Claude Code sessions on PhiLogg. This file
loads automatically every session — kept short on purpose. `PROJECT.md` is
the entry point into the architecture: overview, data model, gotchas, and
links into `docs/*.md` for per-feature detail. `CHANGELOG.md` holds the
chronological, dated history — read it for "why/when did X change", not for
"how does X work today" (that's `docs/`). For planned work see
`FEATURE_BACKLOG.md`.

## What this is

PhiLogg: a single self-contained `philogg.html` (~45,600 lines, inline CSS,
vanilla JS — no framework, no build tooling; the only tooling is
`scripts/strip-comments.js`, which release builds run over a throwaway copy
— see `PROJECT.md` → "Release builds"). Personal tool for browser-based
log analysis. Companion: `tests/philogg.regression.test.js` (jsdom
regression suite, see `tests/README.md` for conventions). Optional
`desktop/` wrapper (Tauri v2 + the OS webview) adds file associations
and a frameless window around the unmodified `philogg.html` — see
`desktop/README.md`.

## Session workflow

Feature/fix sessions follow the `orchestrate` skill
(`.claude/skills/orchestrate/`): the main session scopes the task with
the user, builds a concept mockup first for UI changes and waits for the
decision, delegates implementation to `implementer` subagents (Sonnet,
`.claude/agents/implementer.md`) via a brief or a written plan, verifies
each round itself (full tests + real-app screenshots), and presents the
result with screenshots. Pure questions and doc-only sessions don't need it.

## Non-negotiables

- **Diagnose before implementing.** For bug reports or ambiguous behavior,
  find the root cause first, then fix — not a speculative patch.
- **Every feature/fix ships with regression tests.** Extend
  `tests/philogg.regression.test.js` per `tests/README.md`'s conventions
  (new `GROUP N` **plus its `group(N);` marker line** — the shard runner
  needs it, see `tests/README.md` — one line in TEST PROVENANCE,
  update/remove superseded groups instead of leaving a green check on dead
  code).
- **Run the full suite (`cd tests && npm test`, ~2-3 min on 4 cores) only
  when code changed** — i.e. `philogg.html`, `tests/*.js`, `scripts/`, or a
  change to the `window.philogg` / `nativeDirHandle` contract that
  `philogg.html` consumes. Report the pass count when you do.
  While iterating, `GROUP=58 npm test` re-runs a single group in ~2s; the
  full suite is what settles the session.
  Two things the suite does **not** cover, so don't run it for them: a change
  confined to the Rust side or the Tauri config (`desktop/src-tauri/**`,
  `desktop/frontend/`) — nothing there is loaded, parsed or executed by the
  suite, it needs `cd desktop && npm run build` instead (plus
  `cargo test -p philogg-logparse` in `desktop/src-tauri/` when the native
  parser changed — and when JS parsing changes, regenerate its golden
  fixture, see `docs/desktop.md` → "Native parsing") — and a session that
  only touched Markdown (`PROJECT.md`, `docs/*.md`, `CHANGELOG.md`,
  `README.md`, `FEATURE_BACKLOG.md`, `CLAUDE.md`). Don't run it out of habit.
- **Performance claims get measured in the real app**, not only in a
  component benchmark — `docs/performance-testing.md` has the headless
  desktop-app setup (`tools/perf/desktop-load-bench.sh`) that works in the
  cloud container.
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
- **Sample data and screenshots come from the log simulator — always.**
  Tests, demos, README/homepage screenshots and guides: generate logs with
  `node tools/log-sim/cli.js` (`--list` shows formats/scenarios) and
  capture the app with `tools/log-sim/screenshot.js` (`--eval` sets up
  filters/tabs). If the simulator can't produce a case, **extend it first**
  (scenario/format in `tools/log-sim/core.js` + GROUP 300), never write
  example lines by hand, in a one-off script or in chat output. See
  `PROJECT.md` → "Sample data and screenshots".
- **Simplest solution that solves the actual problem** — no speculative
  complexity (size caps, expiry, etc.) until it's a real, current problem.
- Code and comments in English.
- **`FEATURE_BACKLOG.md` entries get unique, permanent IDs via `LAST_ID`**
  in the file's header. Adding an entry: read `LAST_ID`, add 1, use that
  value as the new entry's ID, then update `LAST_ID` to the same value.
  Editing or moving an entry never changes its ID. Implementing a feature:
  remove its entry from the backlog; its ID stays retired and is never
  reused, and `LAST_ID` does not change.
- **Conventional Commits drive the version.** Prefix a commit `feat: ...`
  (new capability → MINOR) or `fix: ...` (bug fix → PATCH) when it should
  count toward the next release; anything else (`docs:`, `chore:`,
  `refactor:`, `test:`, unprefixed) is fine as-is and simply doesn't move
  the version. Cutting a release is an **explicit, manual** action, never
  automatic on a feature-PR merge — see `PROJECT.md` → "Release builds" for
  the two-stage `release-please.yml` trigger (`propose-release` via
  `workflow_dispatch`, then merging that PR tags + builds via
  `cut-release`). **Never write a `!` suffix, a `BREAKING CHANGE:`
  footer, or a `Release-As:` footer unless the user explicitly asks for a
  major-version bump** — this project stays under `1.0.0` by design.
- **No Claude attribution in commits or PRs.** Never add a
  `Co-Authored-By:` line with a Claude/Anthropic mail address, a
  `Claude-Session:` line or any claude.ai session link to commit messages,
  PR titles or PR descriptions (person-requested; overrides the harness's
  default attribution lines).
- **No backward-compatibility/migration work required below `1.0.0`.**
  While the major version stays `0`, a session may change a persistence
  format, storage key, or in-app data shape (session cache, filter-library
  JSON, `localStorage` keys, the `window.philogg`/`nativeDirHandle`
  contract, ...) without writing a migration path for data saved under the
  old shape — semver 0.x is the explicit signal that nothing is stable
  yet. Revisit this once the project reaches `1.0.0`.

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
