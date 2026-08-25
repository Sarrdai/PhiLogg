# PhiLogg — Feature Backlog

LAST_ID: 52

Raw ideas only, not yet elaborated. Pick items up individually before
implementation. Numbers are unique, permanent IDs, not a sort order —
grouped by theme; when adding a new item, read `LAST_ID` above, add 1, use
that value as the new entry's ID, then update `LAST_ID` to the same value.
Removing/moving an entry never changes its ID (removing an item, e.g.
because it was implemented, does not change `LAST_ID` either — its ID is
simply retired, never reused).

Split into four lists (2026-08-24, person-requested):

- **Road to 1.0** — features wanted for a first official release.
- **Backlog** — still wanted, not yet planned for 1.0.
- **Wiedervorlage** — parked, not implementing now, not permanently
  rejected either; revisit later.
- **Verworfen** — rejected, kept here for documentation with the reason.
  Adding an entry here requires a stated reason.

Within each list, entries stay grouped/organized by theme as before.

Renumbered once, uniquely and permanently (2026-08-24, person-requested):
switched from "resequence 1..N on every reorg" to stable, append-only IDs
via `LAST_ID`. Every remaining item below was given a fresh, permanent ID
in top-to-bottom order as part of this one-time migration; from this point
on IDs are never reassigned.

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

## Road to 1.0

### Navigation & reading

8. **Full view: hide the minimap's "covered timespan" visualization** (toggle in Settings) — it's meaningless there since the Full view always covers the entire log. Show the currently-visible row range instead, the same way the minimap already highlights the visible/rendered subset in the Filtered/Stacked view — just applied to the Full log's own rows instead of the filtered rows.
11. **Create a filter from the currently visible plot area** — either as a time-range filter, or targeted specifically at the log entries currently "visible" in the plot/minimap. Open question: which of the two (or both) the interaction should produce.

### Filter tree workflow

16. **Regex filter type** — a real `RegExp` alongside the wildcard-token text filter, with the same live match count, case-sensitivity, and target-column options. Complements (doesn't replace) the token language, which stays the friendlier default.
20. **Extend match-text highlighting to Highlights, not just Filters** — text filters already support marking the matched substring itself in color (not just the left-edge color bar), scoped to either the active filter or the whole filter path (configurable). Apply the same match-text coloring to Highlights, using the highlight's own color. Open question: whether this needs a separate button, a global setting, or a toggle in the color-picker menu (would then be per-filter configurable, default on).

### Desktop wrapper (Electron)

33. **Settings exportable as JSON.** The Electron variant should by default store/load settings in the OS "well-known" config directory (XDG on Linux, e.g. `~/.config/PhiLogg`).
35. **"Restore last session on startup" setting is Electron-only in practice** — the plain `.html` build already needs to survive a page refresh regardless of this setting (existing cache behavior), so the toggle really only has meaning in the Electron build; consider hiding/disabling it outside Electron.

### Settings & UI polish

37. **Fix filter-chain layout when "Level bar creates filter tree nodes" is set to "explicit" (manual)** — the extra "Add to tree" button that mode shows breaks/shifts the layout.
38. **Fix the level-filter icon** (three bars) — currently rendered wrong/inconsistent.
40. **Fix Settings view scroll performance** — currently noticeably janky.
42+44. **Font size and overall UI scale, independently configurable** — "Change Font Size" currently appears to scale the whole UI; split into two separate settings, one for log/text font size, one for overall UI scale.
46. **Setting to change the UI font family** — must not break the "no dependencies" rule (system-installed fonts only, no web-font fetches).
48. **Shortcut Manager in Settings** — replaces the current Help button/shortcut guide with a proper manager (view and, if feasible, rebind app shortcuts) inside Settings.
49. **Respect OS default window behavior** — audit that the app's own shortcuts/mechanics never shadow or override the operating system's default window behavior (e.g. window management shortcuts).

### Log formats & parsing

47. **Format-specific log levels** — configurable while setting up a parser (Format Manager), with a definable order, shown in the log-level column instead of forcing the fixed ERROR/WARN/INFO/DEBUG set.

### Bookmarks & notes

50. **Bookmarks rework** — remove the current Bookmark Manager entirely. Instead, bookmarks become a per-file filter node: a single "Bookmarks" filter, unique per file, that lives directly under the file's root node. It is auto-created the moment at least one bookmark is set on that file, and auto-removed again once no bookmark remains. Like any other filter node it loses its dedicated icon and can be colored/styled the same way. The existing PIN-bookmark feature is unaffected and stays as-is. Alongside this, introduce a general-purpose note feature for *any* log line (bookmarked or not): via the log entry's context menu or `Alt+N`, attach a free-text note. The note is not part of the log data itself, but is rendered as an extra line (or multiple lines, when MultiColumn is active) directly below its entry — visually distinct (its own color), without a level marker on the left edge, and indented slightly to the right. Notes stay visible at every filter stage. `Alt+N` on a selected entry without a note creates one; on an entry that already has a note, the same shortcut opens it for editing instead (no separate `F2` binding for this). Double-click on an existing note also opens it for editing. When an entry with a note is selected, the note's content is also shown in the Entry Detail panel, so a multi-line note stays readable even with MultiColumn/multi-line rendering turned off. Add a dedicated Show/Hide Notes toggle button. Needs scoping: how the per-file Bookmarks filter interacts with the existing filter-tree persistence carriers (see `CLAUDE.md`'s gotcha list), and where notes are stored/persisted per entry.

### Desktop wrapper (Electron)

51. **Improve Electron startup time perception** — startup currently takes several seconds with no feedback. Add a splash screen that appears immediately and indicates loading is in progress until the main window is ready. Additionally, add a "Close to system tray" setting (default: on). With it enabled, closing the app via the window's X button — or, if configured, closing the last open file — does not quit the app but minimizes it to the system tray (not the taskbar); a right-click on the tray icon offers a real Quit. While running in the tray, opening a file or clicking the app icon should jump straight back into the running session, so the app feels instantly available rather than restarting.
52. **"Open File Location" in the file context menu** — jumps directly to the OS folder containing the selected file.

## Backlog

### Navigation & reading

5. **Δt between two rows** — mark a row, shift-click a second, get the gap in the status strip. The extraction table already answers this (`t(ms)`), the log view doesn't.

### Filter tree workflow

19. **File-independent (universal) cache for the `.html` build** — today the cache appears to be keyed per filename; a shared/universal cache would keep working across renamed or re-opened files. Open question: how to handle a cached payload left over from an incompatible older/newer app version (versioning or invalidation needed).

### Value extraction & aggregation

21. **Warn/migrate when an extraction pattern edit shifts columns** — assertions and ignored-columns are index-based and silently point at the wrong column otherwise.
25. **Derived extraction columns** — an expression column over other extracted columns (`c3 - c2`, unit conversion), plottable and assertable like any captured column. Open question: expression syntax, and how a derived column indexes against the index-based assertions/ignored-columns.

### Multi-file & correlation

27. **Drop a non-log file (e.g. TIFF) → jump to matching log entry** by the file's CreationDate. Open question: TIFF files carry a trailing XML block (after the image data) with its own CreationDate, which may be more accurate than the filesystem timestamp. Needs scoping before implementation.
29. **Per-file clock offset** — a manual `± N ms` correction applied to a file's timestamps before merge or sync. Device clocks drift, and today the only fix is to not compare.

### Sharing & output

31. **Export the current view** — the filtered result as `.log`/`.csv`/`.tsv`. Only the extraction table can leave the app as text today; session export is JSON for PhiLogg users, not data for Excel or a ticket. Copying selected log rows as raw text via Ctrl+C (Ctrl/Shift-click multi-select + `copyLogSelectionToClipboard`) already exists — column-wise copy and whole-view file export are still open.
32. **Findings report export** — a standalone HTML/Markdown report carrying the filter chain, bookmark notes, and the matching entries, readable by someone who has neither PhiLogg nor the log file. Different audience than session export (which assumes both).

### Desktop wrapper (Electron)

34. **Electron scrollbar corner artifact** — Electron renders scrollbars differently from the browser build (preferred look), but where a horizontal and vertical scrollbar meet there's a white square that doesn't fit the theme. Needs screenshots to nail down the exact styling target.

### Settings & UI polish

41. **Syntax highlighting for structured messages, behind a toggle** — when an entry's message body is itself structured (JSON, XML, ...), colorize it instead of showing it as flat text. Open question: where this renders (Entry Detail only, or also inline in the log rows), and how detection works (sniff the message content vs. a per-format setting).
45. **Theme should be able to follow the OS/system light-dark state** — auto light/dark switching based on system preference, as an alternative to the existing manual toggle.

## Wiedervorlage

### Known issues

1. **Bugfix**: view sometimes doesn't refresh when a new filter is created. Needs repro/root cause. (Long unobserved — may already be fixed; re-check before picking up.)

### Navigation & reading

2. **Minimap: line-based instead of time-based** — show position/density by line count rather than by timestamp span. (First draft wasn't liked — reconsider approach before retrying.)
3. **Incremental find inside the current view** (`Ctrl+G`/`F3` for next/prev, highlight-as-you-type) — today `Ctrl+F` always *creates a filter node*, so "just look for this string once" costs a tree node you then delete. Non-destructive search would be its own, lighter interaction on top of the existing views.
4. **Jump to next/previous problem row** (`n`/`N`) — hop to the next ERROR/WARN entry in whichever view has focus, using the level bar's current selection as the target set. Cheap on top of the existing `jumpToEntry`.
6. **Relative-time display toggle** — show timestamps as offsets from a chosen zero row (selected or bookmarked) instead of absolute time, same reasoning that made extraction's `t(ms)` cumulative-from-first.
7. **Collapse consecutive duplicate messages** into one row with an ×N badge — noise control for spam loops. Open question: what counts as "duplicate" (raw line, message column, or message-with-numbers-normalized — see message-pattern grouping below).

### Filter tree workflow

12. **Dedup check on "Load filter…" / session import** — prevents duplicate branches when the same filter (tree) is loaded/imported again.
13. **Autocomplete suggestions from recently used filter values/search terms** in the filter popup.
14. **Mute (disable) a filter node instead of deleting it** — a muted node is skipped in the chain (its children evaluate against its parent) but stays in the tree with its colour, assertions, and children intact. Faster than delete+undo for "does this step matter?". Needs the flag threaded through every persistence carrier (see `CLAUDE.md`'s gotcha list).
15. **"Why is this row here?" explain popup** — for the selected entry, show which node of the active chain matched it; for an entry visible only in the Full view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the existing "view sometimes doesn't refresh" class of confusion (see Known issues above).

### Value extraction & aggregation

22. **Diff view between two filter results** — e.g. comparing two runs of the same log.
23. **Message-pattern grouping ("log clustering")** — normalize numbers/GUIDs/paths in the message to placeholders, group identical shapes, list the top N with counts. Probably the single fastest way into an unfamiliar log; one click on a group turns it into a text filter. Scoping question: normalization rules, and whether it's a view or a filter type.
24. **Gap / stall filter** — match entries whose distance to the previous entry exceeds X ms. Finds hangs without extracting a value first; sits next to the existing wildcard value-condition filtering (`[value:float>=10]` etc.).
26. **Group-by in the extraction table** — collapse rows by one column and show count/min/max/mean per group, extending the stats bar from "per column, whole table" to "per column, per group".

### Multi-file & correlation

28. **Time sync between two open files** — selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent.
30. **Cross-file search (read-only)** — one term, hit counts per loaded file, click to jump. Stays inside the "no cross-file filter nodes" design rule precisely by not creating nodes.

## Verworfen

39. **Breadcrumb hover should also work on nodes further back in the current chain**, not just the current/active one, so a new branch can be picked from there too. — The feature this depended on (hovering the active breadcrumb chip to reveal a child-filter flyout) was itself removed 2026-08-25, superseded by Alt+Arrow tree navigation; nothing left to extend.
