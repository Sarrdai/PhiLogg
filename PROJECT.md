# PhiLogg — Project Documentation

**Read this file first.** It's the entry point for understanding what PhiLogg is, how it's built, and why it's built that way, before touching `philogg.html`. For a human-facing overview (what it does, screenshots, how to use it, license) see `README.md` instead — keep that file in sync with user-visible changes; this file stays the architecture/changelog reference.

## What this is

PhiLogg is a **local, single-file, offline-capable log viewer** built to replace LogViewPlus for a specific pipe-delimited log format. It's one self-contained `.html` file — no build step, no external dependencies, no CDN calls, no server. Opening the file in a browser is the entire deployment story. That constraint is deliberate and has shaped almost every architectural choice below — keep it intact unless the person explicitly asks to relax it.

- **File**: `philogg.html` (~17,941 lines: inline `<style>`, inline `<script>`, vanilla JS, no framework, no build tooling)
- **Runs from**: `file://` directly, or any static host — must keep working both ways
- **Dependencies**: none. Not React, not a charting library, not a font CDN. Custom SVG charting was built from scratch specifically to avoid a dependency.

## The log formats it parses

Every file is parsed under one `LogFormat` — every format still produces the
same fixed entry schema (`ts, level, thread, location, method, message`),
only how a line is split into those fields is configurable. See "Log format
definitions" (`philogg.html`, right after "Log parsing") for the full
mechanism: pattern-mode vs. regex-mode compilation, filename→format glob
rules (Settings → Format Manager), and how a file's resolved format is
pinned to it for the rest of its session-cache lifetime.

A format also carries its own **ordered level list** (`LogFormat.levels`).
It may pick from the five names that own a theme color (`ALL_LEVELS` =
`ERROR/WARN/INFO/DEBUG/TRACE`) *and* add arbitrary **custom names** of its
own (`NOTICE`, `FATAL`, `VERBOSE`, …), which take a color from the rotating
`--level-custom-1..6` palette; `OTHER` stays the implicit catch-all and is
never listed. It decides which level buttons the level bar offers, and in
which order, for files using that format; a format without the field (every
builtin, and anything created before this existed) falls back to `LEVELS` =
`ERROR, WARN, INFO, DEBUG`. Every entry is stamped with the `formatId` it
was parsed under (`parseLogTextAsync` and `appendTailText`), which is what
lets `levelBucket(level, formatId)` resolve a raw level string against its
*own* format's list before falling through the fixed prefix cascade. See `docs/ui-and-views.md` → "Level bar" for how several
open formats combine (`activeLevelOrder`/`canonicalLevelOrder`).

The builtin default (`fmt-default`, non-deletable, always sorts first in the
Format Manager) is the original hardcoded log4net-style conversion pattern:
`%d\t%p\t"%t"\t%c\t[%M]\t"%m"%n` (tab-separated: `timestamp \t level \t
"thread" \t file \t line N \t [method] \t "message"`). As long as it hasn't
been edited via the UI, it's a thin pass-through to the original, untouched
`parseHeaderLine`/`HEADER_RE`/`parseLogTextAsync` — zero behavior change
from before this feature existed. Editing it (or adding any other format)
routes it through the generic pattern/regex compiler instead. The parser is
tolerant: it detects a new entry via a format-specific line-start check
(`isHeaderLine`, `HEADER_RE` for the builtin default), and any line that
doesn't match is treated as a continuation of the previous entry's message
(handles multi-line stack traces). Parsing runs in async chunks
(`PARSE_CHUNK_LINES = 4000`) with `setTimeout(...,0)` yields between chunks
so the UI stays responsive on large files, and reports progress that drives
a mini progress bar rendered directly on that file's tree row (file read =
55% of the bar via `FileReader.onprogress`, parsing = 45%, see
`READ_WEIGHT`/`PARSE_WEIGHT`, and "File loading rows" below — there is no
blocking pop-up, the rest of the UI stays usable throughout).

## Core data model

Everything lives in one global `state` object (search `const state = {`). The two things to understand first:

### 1. The node tree

`state.nodes` is a flat `{id -> node}` map; `state.rootIds` lists the file (root) node ids in load order. Every node is either:

- **`type: "file"`** — holds the actual parsed `entries` array. Root-level only (`parentId: null`). Has a `merged: true` flag if it was created by the file-merge feature (see below); in that case its `entries` is the chronologically-sorted union of its source files' entry *objects* (reused by reference, not cloned).
- **`type: "filter"`** — has a `parentId` (its place in the tree), a `children` array, a `name` (display label), and a `filterType` that determines what `getEntries(node)` computes. See the filter type table below.

Filters chain: a filter's result is always computed from its parent's result (`getEntries(node.parentId)`), then narrowed/transformed. This is why the tree visually nests — each indent level is another transformation of the level above.

**Two filter types don't fit the pure-tree model** (`and`, `or`, `link`): they need a *second* input that isn't their tree parent. That second reference is stored as `linkedId` on the node. `parentId` is still used for tree placement (which of the two source filters the new node is nested under), `linkedId` points to the other one. **Consequence**: because a node's true dependencies aren't fully captured by parent→child alone, cache invalidation on move/delete is a **global sweep** (`invalidateAllCaches()`) rather than a subtree walk — cheap enough since moves/deletes are infrequent user actions, and it's the only way to guarantee correctness once cross-references exist. **Consequence 2**: `and`/`or`/`link` nodes *are* Ctrl+C/Ctrl+X/drag-and-drop-able, same as any other filter — `moveNode()` only ever touches `parentId`, so `linkedId` survives a move completely untouched, and `cloneSubtree()` now carries `linkedId` (plus `linkDirection`/`linkN` for `link` nodes) onto the clone rather than dropping it. These were originally excluded on the assumption that "can't safely carry the second reference along" applied to both operations; on closer inspection it only ever applied to *cloning* dropping the field, which is now fixed. The one genuine risk — moving/pasting a node so that its own `linkedId` target becomes its ancestor, which would make `getEntries()` recurse into itself forever — is guarded narrowly by `wouldCreateLinkedCycle()` (checked in `moveNode()`) and `subtreeHasLinkedCycle()` (checked before a clone in `pasteClipboard()`), not by a blanket type restriction. A blocked cut/paste keeps the clipboard active (instead of silently clearing it) and shows a toast, so the person can just try a different target.

**`context` looks similar to `link` (a second, non-parent source of entries) but deliberately isn't built the same way.** Its "other side" is always the node's own root file (`getRootFileId(node.parentId)`), never another arbitrary node, so it needs no `linkedId`, no cycle guard, and no entry in the global-sweep reasoning above — it's a plain single-parent filter as far as move/copy/cache invalidation are concerned. See "Time context filter" below.

### 2. Filter types

| `filterType` | Needs | What `getEntries` does |
|---|---|---|
| `text` | `value: string`, optional `caseSensitive: boolean`, optional `columns: string[]` | substring match against `entry.raw` (or, if `columns` is non-empty, against just those columns' text — see "Text filter: case-sensitive + target column"); case-insensitive unless `caseSensitive` is set |
| `after` / `before` | `value: number (ts)` | `entry.ts >= / <= value` |
| `extract` | `value: pattern string` | compiles the pattern (see below) and keeps entries whose `message` matches; **also** drives the extraction table view when this node is active |
| `and` / `or` | `linkedId` | set intersection / union (by `entry.id`) of this node's parent-chain result and `getEntries(linkedId)`; `or` re-sorts by `ts` after merging |
| `link` | `linkedId`, `linkDirection: "before"\|"after"`, `linkN: number`, `linkOrderEnforced: boolean`, `linkExclusive: boolean` | nearest-neighbor pairing (see below); result is an array of synthetic **pair entries**, not normal log entries |
| `context` | `contextBefore: number (ms)`, `contextAfter: number (ms)` | windowing around reference entries (see below); result is real entries from the root file, not synthetic ones |

`createFilterNode(parentId, filterType, value, inverted = false, ignoredColumns = null, caseSensitive = false, columns = null)` builds `text`/`after`/`before`/`extract` nodes (the last two args are `text`-only, `ignoredColumns` is `extract`-only). `createAndOrNode` and `createLinkNode` build the two-reference types, `createContextNode` builds `context` nodes.

### 2a. Inversion (NOT)

Any filter node can carry an `inverted: boolean` flag, orthogonal to `filterType` — it's a post-processing step in `getEntries()`, not a separate type. Once the node's normal `result` is computed, an inverted node replaces it with `parentEntries` minus `result` (set difference by `entry.id`), so "NOT" always reads as "everything my parent had that I would otherwise have kept."

This is deliberately **generic** rather than reimplemented per type — it works unchanged for `text`, `after`, `before`, `and`, `or` — but it's **withheld for three types** where the generic definition breaks down:
- **`link`**: results are synthetic pair entries (`buildPairEntry`) whose ids never match `parentEntries`' ids, so the set difference would just be all of `parentEntries` — not "unmatched refs," just wrong.
- **`extract`**: an inverted extraction filter would keep only rows that *don't* match the pattern — i.e. exactly the rows with nothing to extract — so the extraction table would always render empty.
- **`context`**: every reference entry's own window always contains itself, so `result` is always a superset of `parentEntries` — a parent-relative difference would always be empty.

Both restrictions are enforced in the same place they'd otherwise be violated: the tree context menu omits "Invert (NOT)" for `link`/`extract`/`context` nodes, and the filter popup disables/unchecks its NOT checkbox the moment the input is detected as an extraction pattern (`updateInvertAvailability()`, on the same `input` listener as the live-match preview). `getEntries()` also guards `filterType !== "link" && filterType !== "context"` directly, so the invariant holds even if `inverted` were ever set some other way.

Two entry points toggle it: the **NOT checkbox** in the Ctrl+F filter popup (sets it at creation time, `text` filters only — `after`/`before` created via right-click-a-row don't offer it at creation) and **right-click → "Invert (NOT)" / "Remove NOT"** on any existing eligible filter node (toggles it after the fact, for any type including `after`/`before`/`and`/`or`). Both paths converge on the same flag and the same `getEntries()` logic.

Toggling `inverted` is a **structural-equivalent change** for caching purposes even though it touches neither `parentId` nor `children`: it changes the node's own result, which every descendant's cached result transitively depends on. It goes through `invalidateAllCaches()` — the same global sweep already used for move/delete — rather than a targeted single-node cache clear, for the same reason `and`/`or`/`link` need the global sweep (§1): a narrow invalidation would have to also chase the affected node's entire subtree, which the sweep already does for free. `cloneSubtree()` carries `inverted` onto the clone like every other field, so copy/cut/paste and drag-and-drop preserve it.

In the tree, an inverted node's label gets a `"¬ "` prefix and its type tag turns red (`.tree-row.inverted .tree-type-tag`) — visible without opening the node.

### 3. Memoization

Every filter node caches its computed result on `node._cache`, since a filter's own type/value never change after creation — only *structural* changes (move, delete) can invalidate a result, so `getEntries()` is a cheap cache hit on every render except right after such a change. This is what makes the tree, level-quick-filter counts, and breadcrumb cheap to recompute on every render without visibly recursing the whole chain each time.

Two companions ride along with `_cache` (cleared in the exact same places, nowhere else):

- **`node._levelCounts`** (`getLevelCounts()`): per-level entry counts for the node's own result, used by `renderLevelBar()` on every `render()`. Previously an O(n) `levelBucket` pass over the active view ran on every render — including when merely flipping back and forth between two already-computed filters.
- **Scoped invalidation for tail ticks** (`invalidateCachesForRoots(changedRootIds)`): `onTailChange` used to call the global `invalidateAllCaches()` every 1.5s poll, after which the next render recomputed *every* filter chain in the tree (`renderTree` reads every node's count) — including filters under files that hadn't changed at all. The scoped variant recursively marks a node dirty iff its root file changed or it transitively depends on a dirty node via its `parentId` chain or its `linkedId` target. Cross-file `linkedId` references are unsupported by design (bulk combine only pairs same-file filters), but drag-and-drop reparenting can't structurally rule them out, so `linkedId` is followed explicitly rather than assumed same-file; a pending-guard treats hypothetical cycles conservatively as dirty (the `linkedId` graph is acyclic by construction — targets always pre-exist and are never reassigned). Structural user actions (move/delete/invert/edit) still use the global sweep — rare, and trivially correct.


## Where everything else lives

The sections below used to live directly in this file. They've moved to `docs/*.md` (grouped by topic, current-state description only — no session dates, no "pass 1 then pass 2" narrative) and to `CHANGELOG.md` (the full chronological history, newest-first). This section is the index: enough orientation per topic to know where to look, not the material itself.

### `docs/filters.md`
Filter types, the value-extraction pattern language (placeholders, value conditions like `[value:float>=10]`), the filter popup (Extract vs. Add-filter buttons, target chain, column chips), text-filter case/column restriction and match highlighting, the link filter (nearest-neighbor pairing, chained/multi-hop tuples, same-timestamp tie-break), time filters (`"timerange"`, minimap drag-select), the timeline minimap, and time/count context filters. Start here for anything about `getEntries()`'s per-`filterType` branches or `#filterPopup`.

### `docs/ui-and-views.md`
Header/toolbar layout (`#viewBar`, breadcrumb, Shortcut Manager, License section), the three "active node" views (Log/Extraction/Link), the Highlight view (Filter/Highlight split, `renderHighlightView`), level-bar filter-tree mode, the general scroll-anchoring mechanism (`captureViewAnchor`/`restoreViewAnchor`), the multiline-message toggle, column visibility/width, row multi-select+copy, tree interactions (rename, edit, drag-drop, Alt+Arrow navigation, the temporary anchor), theming, and the app's visual language. Start here for anything about `renderMainView()`, `renderNode()`, or CSS/theme vars.

### `docs/extraction-and-plotting.md`
The extraction table's synthetic Index/t(ms) columns, virtualized rendering (extraction table + Link pair view), the Plot tab (zoom/pan/hover tooltip), value assertions, column statistics, and the live pattern preview + ignored-columns mechanism. Start here for anything under `renderExtractTable()`/`renderPlotChart()`.

### `docs/persistence-and-sync.md`
Undo/redo, bookmarks (the auto-managed "Bookmarks" filter node), notes, pin-bookmarks-into-filtered-view, tailing (live file updates), file loading (progress-on-the-real-row, multi-file load, merge), deep-link loading (`?url=`), folder watch + lazy loading, filter save/load JSON, the reusable filter library, the session cache (IndexedDB, survives a reload), per-file filter history, and session export/import. Start here for anything about `state.bookmarks`/`state.notes`, `node.tail`, or the `philogg-session-cache` IndexedDB database.

### `docs/desktop.md`
The Electron wrapper's internal mechanism (frameless window, custom `philogg://` scheme, settings/cache mirroring, tray). `desktop/README.md` has the build/run steps and current run status — this file cross-references it rather than duplicating it.

### `docs/testing-and-limitations.md`
The jsdom-based testing approach (and its known blind spots — no real layout/paint engine), plus the running list of known limitations and intentionally-deferred items (assertions/ignored-columns keyed by index not name, no cross-file filter combination, 3D scatter not built, etc.).

### `CHANGELOG.md`
The full chronological changelog, newest-first — what shipped, in what order, and why, including the session narratives (dated, person-requested framing) that used to live inline in this file's feature sections.

## Known gotchas — check before touching related code

- `stopPropagation` on any click handler that opens a popup — a click that re-renders its own clicked ancestor (or opens a popup) while still bubbling can trigger the global "click outside a popup closes it" handler against a detached/moved target. Hit at least three times (a pattern-preview span, a pattern-chip toggle, a tree-context-menu "Edit filter…"). See `docs/extraction-and-plotting.md` → "Live pattern preview" for the fullest writeup.
- **DOM identity across clicks**: `renderVisibleRows()` rebuilds nodes on every render, breaking native `dblclick` if a plain click already re-renders; `renderTree()` does too, breaking native `click` on another row during a hot loop (e.g. while a file loads) — see `docs/persistence-and-sync.md` → "File loading" ("A load tick never rebuilds `#tree` or the level bar") and `docs/testing-and-limitations.md` → "Testing approach" for the canonical bug writeup.
- No `crypto.subtle` — the sync FNV-1a fingerprint (`fingerprintText()`) used for session export/import and file-filter-history matching is intentional, not a placeholder; see `docs/persistence-and-sync.md`.
- **Any new filter-node field must be threaded through all persistence carriers**: `cloneSubtree`, `snapshotSubtree`/`restoreSubtree` (undo/redo), `serializeFilterBranch`/`importFilterJson` (save/load JSON), `serializeFilterTreeForCache`/`materializeCachedFilters` (session cache). See "Core data model" above for the node-tree shape these all serialize, and `docs/filters.md`/`docs/persistence-and-sync.md` for examples of features that had to thread a new field through all four.
