# PhiLogg — Feature Backlog

Raw ideas only, not yet elaborated. Pick items up individually before implementation.
Numbers are stable IDs for referencing entries — when adding new items, append
to the end of a section rather than renumbering; when removing/striking an
item, leave its number retired rather than reusing it.

1. **Drop a non-log file (e.g. TIFF) → jump to matching log entry** by the file's CreationDate. Open question: TIFF files carry a trailing XML block (after the image data) with its own CreationDate, which may be more accurate than the filesystem timestamp. Needs scoping before implementation.
2. **Bugfix**: view sometimes doesn't refresh when a new filter is created. Needs repro/root cause.
3. ~~**Pluggable parser logic**~~ — done (2026-08-21): Settings → Format Manager, configurable log formats (conversion-pattern or regex, both compiling to the same fixed entry schema) mapped to files via filename glob rules. See `PROJECT.md`'s "The log formats it parses" and "Status / changelog".
4. **Sortable columns** in the entry table.
5. ~~**Numeric greater/less-than filter** without requiring value extraction first.~~ — done differently than scoped (2026-08-22): rather than a separate filter type, `[value:float]`/`[value:int]` wildcard tokens now accept an inline condition, e.g. `[value:float>=10]` or `[value:int<20,>10]` (`,`-separated conditions AND-ed together), and work through the existing filter/extract wildcard paths. A same-day follow-up added absolute-value conditions — a `|` prefix on the operator, e.g. `[value:float|>=10]`, compares `|value|` instead of `value`. See `PROJECT.md`'s "Value-extraction pattern language" → "Value conditions".
6. **Dedup check on "Load filter…" / session import** — prevents duplicate branches when the same filter (tree) is loaded/imported again.
7. **Warn/migrate when an extraction pattern edit shifts columns** — assertions and ignored-columns are index-based and silently point at the wrong column otherwise.
8. **Optional tail auto-follow for the Highlight view** — currently deliberately static while the Filter view follows tailed entries; revisit if live-tailing workflows want it too.
9. **Autocomplete suggestions from recently used filter values/search terms** in the filter popup.
10. **Diff view between two filter results** — e.g. comparing two runs of the same log.
11. ~~**Bugfix**: opening the app directly with a file passed as a launch/command-line argument opens the file but doesn't recognize it should be tailed. Consider also periodically re-checking static (non-tailed) files for changes.~~ — done (2026-08-22): `loadUrlIntoTree` now recognizes the desktop wrapper's `philogg://local/<id>/…` scheme and wires up `node.tail` with a handle that re-fetches the same URL, reusing the existing `tailTick` poll loop unchanged — covers both the launch-argument case and the "periodically re-check" follow-up for free (a non-growing file still gets polled every `TAIL_POLL_MS`). An ordinary `http(s)` `?url=` report link stays untouched. See `PROJECT.md`'s "Tailing (live file updates)" and "Status / changelog".
12. **Minimap: line-based instead of time-based** — show position/density by line count rather than by timestamp span.
13. ~~**Pin/dock the Tree view and Detail view**~~ — already implemented (confirmed 2026-08-22, shipped 2026-08-21/22 as "Collapsible sidebar / detail panel"): `#sidebar`/`#detailPanel` both collapse to a 40px/34px minimized strip (`Ctrl+B`/`Ctrl+J`, or the header chevron/resizer double-click) instead of taking full space, with hover-peek + a pin-open toggle to bring the full panel back. See `PROJECT.md`'s "Collapsible sidebar / detail panel" (Status / changelog) and `tests/philogg.regression.test.js` Group 80.
14. ~~**Configurable font size**~~ — done (2026-08-21): a whole-UI zoom, adjustable via a Settings row (+/-/Reset) and `Ctrl+Plus`/`Ctrl+Minus`. See `PROJECT.md`'s "Status / changelog".
15. ~~**Shortcuts to switch between Tree and Filter view**~~ — done (2026-08-21): `Ctrl+1`/`Ctrl+0` to jump back and forth; `Enter` on a filter also returns to the Filtered view. See `PROJECT.md`'s "Status / changelog".
16. (maybe) **LogLevel filters also created as OR-linked nodes in the filter tree** when a level is toggled on/off.
17. ~~**Horizontal scrollbar in the Filter view**~~ — done (2026-08-21): long messages can now be read in full. See `PROJECT.md`'s "Status / changelog".
18. ~~**Double-click on a filter opens its edit dialog.**~~ — done (2026-08-21). See `PROJECT.md`'s "Status / changelog".
19. **Electron-only: `F11` toggles fullscreen** (no window decorations).
20. ~~**`Ctrl+W` closes the currently open file.**~~ — done (2026-08-21). See `PROJECT.md`'s "Status / changelog".
21. ~~**Settings option: "Closing the last log file quits the app"**~~ — done (2026-08-21), default off. See `PROJECT.md`'s "Status / changelog".
22. **Settings exportable as JSON.** The Electron variant should by default store/load settings in the OS "well-known" config directory (XDG on Linux, e.g. `~/.config/PhiLogg`).

---

## Suggestions (added 2026-08-18, unvetted — pick, sharpen, or drop)

Proposals only; none of these are person-requested yet. Each line names the
gap it closes and the first thing that needs deciding.

### Navigation & reading

23. **Incremental find inside the current view** (`Ctrl+G`/`F3` for next/prev, highlight-as-you-type) — today `Ctrl+F` always *creates a filter node*, so "just look for this string once" costs a tree node you then delete. Non-destructive search would be its own, lighter interaction on top of the existing views.
24. **Jump to next/previous problem row** (`n`/`N`) — hop to the next ERROR/WARN entry in whichever view has focus, using the level bar's current selection as the target set. Cheap on top of the existing `jumpToEntry`.
25. **Δt between two rows** — mark a row, shift-click a second, get the gap in the status strip. The extraction table already answers this (`t(ms)`), the log view doesn't.
26. **Relative-time display toggle** — show timestamps as offsets from a chosen zero row (selected or bookmarked) instead of absolute time, same reasoning that made extraction's `t(ms)` cumulative-from-first.
27. **Collapse consecutive duplicate messages** into one row with an ×N badge — noise control for spam loops. Open question: what counts as "duplicate" (raw line, message column, or message-with-numbers-normalized — see message-pattern grouping below).
28. ~~**Column visibility / width persistence in the log view**~~ — done (2026-08-18): `#btnColumns` popup (Δt/Thread/Location/Method toggles) + per-column drag-resize handles in `#tableHeader`, applied via the `--row-grid` CSS custom property, persisted in the same settings tier as `multilineMessages`.

### Filter tree workflow

29. **Mute (disable) a filter node instead of deleting it** — a muted node is skipped in the chain (its children evaluate against its parent) but stays in the tree with its colour, assertions, and children intact. Faster than delete+undo for "does this step matter?". Needs the flag threaded through every persistence carrier (see CLAUDE.md's gotcha list).
30. **Rename / label filter nodes** — a human-readable step name ("Step 3: calibration errors") shown instead of the raw value, mainly so an exported/shared analysis reads as a narrative rather than a stack of patterns.
31. **"Why is this row here?" explain popup** — for the selected entry, show which node of the active chain matched it; for an entry visible only in the Full view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the existing "view sometimes doesn't refresh" class of confusion.
32. **Regex filter type** — a real `RegExp` alongside the wildcard-token text filter, with the same live match count, case-sensitivity, and target-column options. Complements (doesn't replace) the token language, which stays the friendlier default.
33. ~~**Reusable filter library**~~ — done (2026-08-18): "Save to library…"/"Apply from library…" context menu actions, IndexedDB-backed (`filterLibrary` store), file-agnostic, applying reuses `importFilterJson()` so a preset re-evaluates against whatever file it lands on.

### Aggregation & analysis

34. **Message-pattern grouping ("log clustering")** — normalize numbers/GUIDs/paths in the message to placeholders, group identical shapes, list the top N with counts. Probably the single fastest way into an unfamiliar log; one click on a group turns it into a text filter. Scoping question: normalization rules, and whether it's a view or a filter type.
35. **Gap / stall filter** — match entries whose distance to the previous entry exceeds X ms. Finds hangs without extracting a value first; sits next to the existing "numeric greater/less-than filter" item.
36. **Derived extraction columns** — an expression column over other extracted columns (`c3 - c2`, unit conversion), plottable and assertable like any captured column. Open question: expression syntax, and how a derived column indexes against the index-based assertions/ignored-columns.
37. **Group-by in the extraction table** — collapse rows by one column and show count/min/max/mean per group, extending the stats bar from "per column, whole table" to "per column, per group".
38. ~~**Plot point → log entry**~~ — done (2026-08-18): click a point/bar to jump to the underlying entry (`jumpToFullLog`, same as the extraction table's own row double-click — the Plot tab still has no Highlight-view companion to reveal into instead).

### Multi-file & correlation

39. **Time sync between two open files** — selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent.
40. **Per-file clock offset** — a manual `± N ms` correction applied to a file's timestamps before merge or sync. Device clocks drift, and today the only fix is to not compare.
41. **Cross-file search (read-only)** — one term, hit counts per loaded file, click to jump. Stays inside the "no cross-file filter nodes" design rule precisely by not creating nodes.

### Sharing & output

42. **Export the current view** — the filtered result as `.log`/`.csv`/`.tsv`. Only the extraction table can leave the app as text today; session export is JSON for PhiLogg users, not data for Excel or a ticket. (Partially done, 2026-08-18: copying selected log rows as raw text via Ctrl+C — Ctrl/Shift-click multi-select + `copyLogSelectionToClipboard` — now exists; column-wise copy and whole-view file export are still open.)
43. **Findings report export** — a standalone HTML/Markdown report carrying the filter chain, bookmark notes, and the matching entries, readable by someone who has neither PhiLogg nor the log file. Different audience than session export (which assumes both).

### Housekeeping

44. **"Sortable columns in the entry table" (above) looks already shipped** — `Time`/`Level`/`Thread`/`Location` headers sort via `state.sortColumn`/`sortDir`. Confirm and strike, or name what's still missing (e.g. multi-column sort, sorting the Highlight view).
</content>
