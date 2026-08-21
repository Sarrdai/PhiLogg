# PhiLogg — Feature Backlog

Raw ideas only, not yet elaborated. Pick items up individually before implementation.

- **Drop a non-log file (e.g. TIFF) → jump to matching log entry** by the file's CreationDate. Open question: TIFF files carry a trailing XML block (after the image data) with its own CreationDate, which may be more accurate than the filesystem timestamp. Needs scoping before implementation.
- **Bugfix**: view sometimes doesn't refresh when a new filter is created. Needs repro/root cause.
- ~~**Pluggable parser logic**~~ — done (2026-08-21): Settings → Format Manager, configurable log formats (conversion-pattern or regex, both compiling to the same fixed entry schema) mapped to files via filename glob rules. See `PROJECT.md`'s "The log formats it parses" and "Status / changelog".
- **Sortable columns** in the entry table.
- **Numeric greater/less-than filter** without requiring value extraction first.
- **Dedup check on "Load filter…" / session import** — prevents duplicate branches when the same filter (tree) is loaded/imported again.
- **Warn/migrate when an extraction pattern edit shifts columns** — assertions and ignored-columns are index-based and silently point at the wrong column otherwise.
- **Optional tail auto-follow for the Highlight view** — currently deliberately static while the Filter view follows tailed entries; revisit if live-tailing workflows want it too.
- **Autocomplete suggestions from recently used filter values/search terms** in the filter popup.
- **Diff view between two filter results** — e.g. comparing two runs of the same log.

---

## Suggestions (added 2026-08-18, unvetted — pick, sharpen, or drop)

Proposals only; none of these are person-requested yet. Each line names the
gap it closes and the first thing that needs deciding.

### Navigation & reading

- **Incremental find inside the current view** (`Ctrl+G`/`F3` for next/prev, highlight-as-you-type) — today `Ctrl+F` always *creates a filter node*, so "just look for this string once" costs a tree node you then delete. Non-destructive search would be its own, lighter interaction on top of the existing views.
- **Jump to next/previous problem row** (`n`/`N`) — hop to the next ERROR/WARN entry in whichever view has focus, using the level bar's current selection as the target set. Cheap on top of the existing `jumpToEntry`.
- **Δt between two rows** — mark a row, shift-click a second, get the gap in the status strip. The extraction table already answers this (`t(ms)`), the log view doesn't.
- **Relative-time display toggle** — show timestamps as offsets from a chosen zero row (selected or bookmarked) instead of absolute time, same reasoning that made extraction's `t(ms)` cumulative-from-first.
- **Collapse consecutive duplicate messages** into one row with an ×N badge — noise control for spam loops. Open question: what counts as "duplicate" (raw line, message column, or message-with-numbers-normalized — see message-pattern grouping below).
- ~~**Column visibility / width persistence in the log view**~~ — done (2026-08-18): `#btnColumns` popup (Δt/Thread/Location/Method toggles) + per-column drag-resize handles in `#tableHeader`, applied via the `--row-grid` CSS custom property, persisted in the same settings tier as `multilineMessages`.

### Filter tree workflow

- **Mute (disable) a filter node instead of deleting it** — a muted node is skipped in the chain (its children evaluate against its parent) but stays in the tree with its colour, assertions, and children intact. Faster than delete+undo for "does this step matter?". Needs the flag threaded through every persistence carrier (see CLAUDE.md's gotcha list).
- **Rename / label filter nodes** — a human-readable step name ("Step 3: calibration errors") shown instead of the raw value, mainly so an exported/shared analysis reads as a narrative rather than a stack of patterns.
- **"Why is this row here?" explain popup** — for the selected entry, show which node of the active chain matched it; for an entry visible only in the Full view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the existing "view sometimes doesn't refresh" class of confusion.
- **Regex filter type** — a real `RegExp` alongside the wildcard-token text filter, with the same live match count, case-sensitivity, and target-column options. Complements (doesn't replace) the token language, which stays the friendlier default.
- ~~**Reusable filter library**~~ — done (2026-08-18): "Save to library…"/"Apply from library…" context menu actions, IndexedDB-backed (`filterLibrary` store), file-agnostic, applying reuses `importFilterJson()` so a preset re-evaluates against whatever file it lands on.

### Aggregation & analysis

- **Message-pattern grouping ("log clustering")** — normalize numbers/GUIDs/paths in the message to placeholders, group identical shapes, list the top N with counts. Probably the single fastest way into an unfamiliar log; one click on a group turns it into a text filter. Scoping question: normalization rules, and whether it's a view or a filter type.
- **Gap / stall filter** — match entries whose distance to the previous entry exceeds X ms. Finds hangs without extracting a value first; sits next to the existing "numeric greater/less-than filter" item.
- **Derived extraction columns** — an expression column over other extracted columns (`c3 - c2`, unit conversion), plottable and assertable like any captured column. Open question: expression syntax, and how a derived column indexes against the index-based assertions/ignored-columns.
- **Group-by in the extraction table** — collapse rows by one column and show count/min/max/mean per group, extending the stats bar from "per column, whole table" to "per column, per group".
- ~~**Plot point → log entry**~~ — done (2026-08-18): click a point/bar to jump to the underlying entry (`jumpToFullLog`, same as the extraction table's own row double-click — the Plot tab still has no Highlight-view companion to reveal into instead).

### Multi-file & correlation

- **Time sync between two open files** — selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent.
- **Per-file clock offset** — a manual `± N ms` correction applied to a file's timestamps before merge or sync. Device clocks drift, and today the only fix is to not compare.
- **Cross-file search (read-only)** — one term, hit counts per loaded file, click to jump. Stays inside the "no cross-file filter nodes" design rule precisely by not creating nodes.

### Sharing & output

- **Export the current view** — the filtered result as `.log`/`.csv`/`.tsv`. Only the extraction table can leave the app as text today; session export is JSON for PhiLogg users, not data for Excel or a ticket. (Partially done, 2026-08-18: copying selected log rows as raw text via Ctrl+C — Ctrl/Shift-click multi-select + `copyLogSelectionToClipboard` — now exists; column-wise copy and whole-view file export are still open.)
- **Findings report export** — a standalone HTML/Markdown report carrying the filter chain, bookmark notes, and the matching entries, readable by someone who has neither PhiLogg nor the log file. Different audience than session export (which assumes both).

### Housekeeping

- **"Sortable columns in the entry table" (above) looks already shipped** — `Time`/`Level`/`Thread`/`Location` headers sort via `state.sortColumn`/`sortDir`. Confirm and strike, or name what's still missing (e.g. multi-column sort, sorting the Highlight view).
