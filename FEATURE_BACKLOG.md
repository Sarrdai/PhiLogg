# PhiLogg — Feature Backlog

LAST_ID: 65

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

### Filter tree workflow

54. **"Prune" action when a filter and a file are both selected** — discards everything from memory/view that isn't part of the filter's result set, not just hides it. Especially useful for time filters (throw away everything outside the range) but not restricted to that case. Where content was pruned, insert a placeholder in its place (at least in the Context view, whose gap strips are the natural home for it) so the cut is visible rather than silently making rows disappear.

### Desktop wrapper

35. **"Restore last session on startup" setting is desktop-only in practice** — the plain `.html` build already needs to survive a page refresh regardless of this setting (existing cache behavior), so the toggle really only has meaning in the desktop build; consider hiding/disabling it outside that build.

### Settings & UI polish

38. **Fix the level-filter icon** (three bars) — currently rendered wrong/inconsistent.
40. **Fix Settings view scroll performance** — currently noticeably janky.
49. **Respect OS default window behavior** — audit that the app's own shortcuts/mechanics never shadow or override the operating system's default window behavior (e.g. window management shortcuts).

### Log formats & parsing


## Backlog

### Navigation & reading

5. **Δt between two rows** — mark a row, shift-click a second, get the gap in the status strip. The extraction table already answers this (`t(ms)`), the log view doesn't.
57. **Folder view with a timeline**, to make orienting among multiple opened files/folders easier.

### Filter tree workflow

58. **Inline editing of an AND/OR/LINK node's `bakedA`/`bakedB`** — today the only way to change what a combiner matches is Unpack (which materializes its two baked sides as visible sibling filters, leaving the combiner itself unchanged — so a real edit still means delete-and-recreate) or delete-and-recreate outright; a dedicated small dialog to re-bake `bakedA`/`bakedB` directly would be more direct for a person who just wants to swap one side.
59. **Memoize each baked condition's own result inside an AND/OR/LINK node** — `getEntriesFromBaked` re-evaluates `bakedA` and `bakedB` in full on every recompute of the combiner, where the old node-id model got two already-cached filter results for free. Since a new combiner is placed as a top-level child of its root file by default, that means two full-file scans per recompute, on every tail tick for that file and after every structural change. The self-contained model is not up for renegotiation (see `docs/filters.md`) — the fix would be a per-side result cache hanging off the node (`node._bakedCacheA`/`_bakedCacheB`), cleared in exactly the same places `node._cache` is. Not urgent: only worth doing if combiners on very large files start feeling slow, and worth measuring first — the two scans may well be cheaper than the bookkeeping.
19. **File-independent (universal) cache for the `.html` build** — today the cache appears to be keyed per filename; a shared/universal cache would keep working across renamed or re-opened files. Open question: how to handle a cached payload left over from an incompatible older/newer app version (versioning or invalidation needed).

### Value extraction & aggregation

21. **Warn/migrate when an extraction pattern edit shifts columns** — assertions and ignored-columns are index-based and silently point at the wrong column otherwise.
25. **Derived extraction columns** — an expression column over other extracted columns (`c3 - c2`, unit conversion), plottable and assertable like any captured column. Open question: expression syntax, and how a derived column indexes against the index-based assertions/ignored-columns.

### Multi-file & correlation

27. **Drop a non-log file (e.g. TIFF) → jump to matching log entry** by the file's CreationDate. Open question: TIFF files carry a trailing XML block (after the image data) with its own CreationDate, which may be more accurate than the filesystem timestamp. Needs scoping before implementation.
29. **Per-file clock offset** — a manual `± N ms` correction applied to a file's timestamps before merge or sync. Device clocks drift, and today the only fix is to not compare.
65. **Folder-watch minimap, ZIP variant** — the folder-watch minimap (implemented this session: a folder's title selects it, showing a per-file time-range timeline in the main content area — drag a window to load+merge the overlap with a matching `timerange` filter, or multi-select bars to load them individually) deliberately covers folders only. A ZIP source's entries are deflate-compressed, so there's no cheap `file.slice()` head/tail read the way `probeFileTimeRange` does for a real folder file — getting a ZIP entry's time range means fully inflating it via `entry.extract()`. Open question: inflate every entry up front (with a progress bar) when the ZIP's minimap is opened, or probe lazily/in the background and show "range unknown" bars until each entry resolves.

### Sharing & output

31. **Export the current view** — the filtered result as `.log`/`.csv`/`.tsv`. Only the extraction table can leave the app as text today; session export is JSON for PhiLogg users, not data for Excel or a ticket. Copying selected log rows as raw text via Ctrl+C (Ctrl/Shift-click multi-select + `copyLogSelectionToClipboard`) already exists — column-wise copy and whole-view file export are still open.
32. **Findings report export** — a standalone HTML/Markdown report carrying the filter chain, bookmark notes, and the matching entries, readable by someone who has neither PhiLogg nor the log file. Different audience than session export (which assumes both).

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
15. **"Why is this row here?" explain popup** — for the selected entry, show which node of the active chain matched it; for a context row in the Context view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the existing "view sometimes doesn't refresh" class of confusion (see Known issues above).

### Value extraction & aggregation

22. **Diff view between two filter results** — e.g. comparing two runs of the same log.
23. **Message-pattern grouping ("log clustering")** — normalize numbers/GUIDs/paths in the message to placeholders, group identical shapes, list the top N with counts. Probably the single fastest way into an unfamiliar log; one click on a group turns it into a text filter. Scoping question: normalization rules, and whether it's a view or a filter type.
24. **Gap / stall filter** — match entries whose distance to the previous entry exceeds X ms. Finds hangs without extracting a value first; sits next to the existing wildcard value-condition filtering (`[*:float>=10]` etc.).
26. **Group-by in the extraction table** — collapse rows by one column and show count/min/max/mean per group, extending the stats bar from "per column, whole table" to "per column, per group".

### Multi-file & correlation

28. **Time sync between two open files** — selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent.
30. **Cross-file search (read-only)** — one term, hit counts per loaded file, click to jump. Stays inside the "no cross-file filter nodes" design rule precisely by not creating nodes.

## Verworfen

39. **Breadcrumb hover should also work on nodes further back in the current chain**, not just the current/active one, so a new branch can be picked from there too. — The feature this depended on (hovering the active breadcrumb chip to reveal a child-filter flyout) was itself removed 2026-08-25, superseded by Alt+Arrow tree navigation; nothing left to extend.
