# PhiLogg — Feature Backlog

Raw ideas only, not yet elaborated. Pick items up individually before
implementation. Grouped by theme; numbers are stable IDs for referencing
entries — when adding a new item, append it to the end of its group (or add
a new group) rather than renumbering; when removing/striking an item, leave
its number retired rather than reusing it.

Reorganized and renumbered from scratch (2026-08-23, person-requested):
previously two separate lists (an original ungrouped one plus an "unvetted
suggestions" batch added 2026-08-18) with items in implementation order.
Completed items were dropped entirely rather than kept struck-through — each
one is already fully documented in `PROJECT.md`'s own changelog, so keeping
a second copy here was pure redundancy. What's left is only open, unpicked
ideas, grouped by theme instead of by when/how they were added.

Renumbered top-to-bottom, sequentially (2026-08-23, person-requested):
the ID gaps left by the reorg above (retired numbers from dropped completed
items) made the list read as if some numbers were reused/inconsistent —
resequenced every remaining item 1..N in its current top-to-bottom order.
The "leave retired numbers" policy above still applies going forward from
this point.

## Known issues

1. **Bugfix**: view sometimes doesn't refresh when a new filter is created. Needs repro/root cause.

## Navigation & reading

2. **Minimap: line-based instead of time-based** — show position/density by line count rather than by timestamp span.
3. **Incremental find inside the current view** (`Ctrl+G`/`F3` for next/prev, highlight-as-you-type) — today `Ctrl+F` always *creates a filter node*, so "just look for this string once" costs a tree node you then delete. Non-destructive search would be its own, lighter interaction on top of the existing views.
4. **Jump to next/previous problem row** (`n`/`N`) — hop to the next ERROR/WARN entry in whichever view has focus, using the level bar's current selection as the target set. Cheap on top of the existing `jumpToEntry`.
5. **Δt between two rows** — mark a row, shift-click a second, get the gap in the status strip. The extraction table already answers this (`t(ms)`), the log view doesn't.
6. **Relative-time display toggle** — show timestamps as offsets from a chosen zero row (selected or bookmarked) instead of absolute time, same reasoning that made extraction's `t(ms)` cumulative-from-first.
7. **Collapse consecutive duplicate messages** into one row with an ×N badge — noise control for spam loops. Open question: what counts as "duplicate" (raw line, message column, or message-with-numbers-normalized — see message-pattern grouping below).
8. **Full view: hide the minimap's "covered timespan" visualization** (toggle in Settings) — it's meaningless there since the Full view always covers the entire log. Show the currently-visible row range instead, the same way the minimap already highlights the visible/rendered subset in the Filtered/Stacked view — just applied to the Full log's own rows instead of the filtered rows.
9. **"Newest" button should only show for trailing files** — hide it for static (non-trailing) files, where jumping to "newest" has no meaning.
10. **Minimap time-filter drag line: draw at the bottom edge instead of the top** — the line shown while dragging out a time filter on the minimap currently sits at the top; the bottom would read better.
43. **Create a filter from the currently visible plot area** — either as a time-range filter, or targeted specifically at the log entries currently "visible" in the plot/minimap. Open question: which of the two (or both) the interaction should produce.

## Filter tree workflow

11. **Dedup check on "Load filter…" / session import** — prevents duplicate branches when the same filter (tree) is loaded/imported again.
12. **Autocomplete suggestions from recently used filter values/search terms** in the filter popup.
13. **Mute (disable) a filter node instead of deleting it** — a muted node is skipped in the chain (its children evaluate against its parent) but stays in the tree with its colour, assertions, and children intact. Faster than delete+undo for "does this step matter?". Needs the flag threaded through every persistence carrier (see `CLAUDE.md`'s gotcha list).
14. **"Why is this row here?" explain popup** — for the selected entry, show which node of the active chain matched it; for an entry visible only in the Full view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the existing "view sometimes doesn't refresh" class of confusion (see Known issues above).
15. **Regex filter type** — a real `RegExp` alongside the wildcard-token text filter, with the same live match count, case-sensitivity, and target-column options. Complements (doesn't replace) the token language, which stays the friendlier default.
16. **Middle-click a filter node to delete it** — from both the "Files & Filters" tree panel and the breadcrumbs.
17. **Full Log → Filtered View jump** — double-click or Enter on a row in the Full Log view (mirroring the existing Filtered→Full jump) should offer a picker of every filter node whose chain matches that entry; picking one jumps into that node's Filtered view. Visualization similar to the existing breadcrumb hover.
18. **File-independent (universal) cache for the `.html` build** — today the cache appears to be keyed per filename; a shared/universal cache would keep working across renamed or re-opened files. Open question: how to handle a cached payload left over from an incompatible older/newer app version (versioning or invalidation needed).
44. **Extend match-text highlighting to Highlights, not just Filters** — text filters already support marking the matched substring itself in color (not just the left-edge color bar), scoped to either the active filter or the whole filter path (configurable). Apply the same match-text coloring to Highlights, using the highlight's own color. Open question: whether this needs a separate button, a global setting, or a toggle in the color-picker menu (would then be per-filter configurable, default on).

## Value extraction & aggregation

19. **Warn/migrate when an extraction pattern edit shifts columns** — assertions and ignored-columns are index-based and silently point at the wrong column otherwise.
20. **Diff view between two filter results** — e.g. comparing two runs of the same log.
21. **Message-pattern grouping ("log clustering")** — normalize numbers/GUIDs/paths in the message to placeholders, group identical shapes, list the top N with counts. Probably the single fastest way into an unfamiliar log; one click on a group turns it into a text filter. Scoping question: normalization rules, and whether it's a view or a filter type.
22. **Gap / stall filter** — match entries whose distance to the previous entry exceeds X ms. Finds hangs without extracting a value first; sits next to the existing wildcard value-condition filtering (`[value:float>=10]` etc.).
23. **Derived extraction columns** — an expression column over other extracted columns (`c3 - c2`, unit conversion), plottable and assertable like any captured column. Open question: expression syntax, and how a derived column indexes against the index-based assertions/ignored-columns.
24. **Group-by in the extraction table** — collapse rows by one column and show count/min/max/mean per group, extending the stats bar from "per column, whole table" to "per column, per group".

## Multi-file & correlation

25. **Drop a non-log file (e.g. TIFF) → jump to matching log entry** by the file's CreationDate. Open question: TIFF files carry a trailing XML block (after the image data) with its own CreationDate, which may be more accurate than the filesystem timestamp. Needs scoping before implementation.
26. **Time sync between two open files** — selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent.
27. **Per-file clock offset** — a manual `± N ms` correction applied to a file's timestamps before merge or sync. Device clocks drift, and today the only fix is to not compare.
28. **Cross-file search (read-only)** — one term, hit counts per loaded file, click to jump. Stays inside the "no cross-file filter nodes" design rule precisely by not creating nodes.

## Sharing & output

29. **Export the current view** — the filtered result as `.log`/`.csv`/`.tsv`. Only the extraction table can leave the app as text today; session export is JSON for PhiLogg users, not data for Excel or a ticket. Copying selected log rows as raw text via Ctrl+C (Ctrl/Shift-click multi-select + `copyLogSelectionToClipboard`) already exists — column-wise copy and whole-view file export are still open.
30. **Findings report export** — a standalone HTML/Markdown report carrying the filter chain, bookmark notes, and the matching entries, readable by someone who has neither PhiLogg nor the log file. Different audience than session export (which assumes both).

## Desktop wrapper (Electron)

32. **Settings exportable as JSON.** The Electron variant should by default store/load settings in the OS "well-known" config directory (XDG on Linux, e.g. `~/.config/PhiLogg`).
33. **Electron scrollbar corner artifact** — Electron renders scrollbars differently from the browser build (preferred look), but where a horizontal and vertical scrollbar meet there's a white square that doesn't fit the theme. Needs screenshots to nail down the exact styling target.
35. **"Restore last session on startup" setting is Electron-only in practice** — the plain `.html` build already needs to survive a page refresh regardless of this setting (existing cache behavior), so the toggle really only has meaning in the Electron build; consider hiding/disabling it outside Electron.
45. **Show the minimize/close window controls in `F11` fullscreen too** — reuse the same visualization already used for a maximized window; don't hide the controls just because fullscreen is active.

## Settings & UI polish

36. **Fix filter-chain layout when "Level bar creates filter tree nodes" is set to "explicit" (manual)** — the extra "Add to tree" button that mode shows breaks/shifts the layout.
37. **Fix the level-filter icon** (three bars) — currently rendered wrong/inconsistent.
38. **Breadcrumb hover should also work on nodes further back in the current chain**, not just the current/active one, so a new branch can be picked from there too.
39. **Fix Settings view scroll performance** — currently noticeably janky.
40. **Code highlighting in the Entry Details view, behind a toggle.**
41. **"Change Font Size" should scale only the font size, not the whole UI** — currently it appears to scale all UI elements; it should only affect text/log font size.
46. **`Ctrl+0` should expand the Files & Filters panel if it's collapsed** — including under "manual expand" (hover-to-expand disabled): in that mode `Ctrl+0` should still expand the panel exactly like hover would, and keep it expanded until focus moves to another view (e.g. via `Ctrl+1` or a click into another view).
47. **Font size and overall UI size independently configurable** — companion to #41 above (font size currently scales the whole UI): split into two separate settings, one for log/text font size, one for overall UI scale.
48. **Theme should be able to follow the OS/system light-dark state** — auto light/dark switching based on system preference, as an alternative to the existing manual toggle.
49. **Setting to change the UI font family** — must not break the "no dependencies" rule (system-installed fonts only, no web-font fetches).

## Log formats & parsing

42. **Format-specific log levels** — configurable while setting up a parser (Format Manager), with a definable order, shown in the log-level column instead of forcing the fixed ERROR/WARN/INFO/DEBUG set.
