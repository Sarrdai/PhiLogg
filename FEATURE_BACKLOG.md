# PhiLogg — Feature Backlog

LAST_ID: 92

Raw ideas only, not yet elaborated. Pick items up individually before
implementation.

**IDs (`Nr`) are unique and permanent, not a sort order.** When adding a new
item, read `LAST_ID` above, add 1, use that value as the new entry's `Nr`,
then update `LAST_ID` to the same value — regardless of the priority you give
it. Removing or moving an entry never changes its `Nr`; removing an item
(e.g. because it was implemented) does not change `LAST_ID` either — its ID
is simply retired, never reused.

**Priority (`Prio`) — the rightmost column:**

- **1** — done soon / quick to implement.
- **2** — mid-term.
- **3** — long-term.
- **(empty)** — not planned, but not permanently rejected either; revisit later.
- **verworfen** — rejected, kept for documentation with the reason stated in
  `Begründung`. Adding a rejected entry requires a stated reason.

**Sorting:** by `Prio` (1, 2, 3, empty, then verworfen), then by `Nr` within
each priority. Re-sort after changing any priority.

Switched from four themed lists to this single priority-sorted table
(2026-09-13, person-requested): the old `Road to 1.0` / `Backlog` /
`Wiedervorlage` / `Verworfen` split and the per-theme subheadings were
replaced by the `Prio` column above (Road to 1.0 → 1, Backlog → 2,
Wiedervorlage → empty, Verworfen → verworfen).

**`Aufwand`** is a rough effort estimate (klein / mittel / groß), added
2026-09-25 together with the renamed `Vorschlag`/`Begründung` columns.

| Nr | Vorschlag | Begründung | Aufwand | Prio |
|---|---|---|---|---|
| 35 | "Restore last session on startup" is desktop-only in practice | The plain `.html` build already survives a page refresh regardless of this setting (existing cache behavior), so the toggle only has meaning in the desktop build; consider hiding/disabling it outside that build. | klein | 1 |
| 38 | Replace the level-filter icon (three bars) | Not a bug; the current icon just isn't expressive enough. Wants a clearer/more meaningful glyph for the level filter. | klein | 1 |
| 49 | Check for collisions with OS default shortcuts | Audit that the app's own keyboard shortcuts never shadow or override the operating system's default shortcuts (e.g. window-management / browser shortcuts). | klein | 1 |
| 54 | "Prune" action when a filter and a file are both selected | Discards everything from memory/view that isn't part of the filter's result set, not just hides it. Especially useful for time filters (throw away everything outside the range) but not restricted to that case. Where content was pruned, insert a placeholder (at least in the Context view, whose gap strips are the natural home for it) so the cut is visible rather than silently making rows disappear. Also eases (but doesn't remove) the in-memory size limit for very large files, see #88. | mittel | 1 |
| 5 | Δt between two rows | Mark a row, shift-click a second, get the gap in the status strip. The extraction table already answers this (`t(ms)`), the log view doesn't. Together with #6 and #24 it finds hangs/timeouts without the extraction detour — especially relevant for device/machine logs. | klein | 2 |
| 19 | File-independent (universal) cache for the `.html` build | Today the cache appears keyed per filename; a shared/universal cache would keep working across renamed or re-opened files. Open question: how to handle a cached payload left over from an incompatible older/newer app version (versioning or invalidation needed). | mittel | 2 |
| 21 | Warn/migrate when an extraction pattern edit shifts columns | Assertions and ignored-columns are index-based and silently point at the wrong column otherwise. | klein–mittel | 2 |
| 45 | Theme should be able to follow the OS/system light-dark state | A live "follow system" mode as an alternative to the manual toggle. Today `prefers-color-scheme` is only read once as the default on first start (no stored theme), not tracked afterwards. | klein | 2 |
| 58 | Inline editing of an AND/OR/LINK node's `bakedA`/`bakedB` | Today the only way to change what a combiner matches is Unpack (materializes its two baked sides as visible sibling filters, leaving the combiner itself unchanged — so a real edit still means delete-and-recreate) or delete-and-recreate outright; a dedicated small dialog to re-bake `bakedA`/`bakedB` directly would be more direct for swapping one side. | mittel | 2 |
| 59 | Memoize each baked condition's own result inside an AND/OR/LINK node | `getEntriesFromBaked` re-evaluates `bakedA` and `bakedB` in full on every recompute; a new combiner sits as a top-level child of its root file, so that's two full-file scans per recompute, on every tail tick for that file and after every structural change. Fix: a per-side result cache (`node._bakedCacheA`/`_bakedCacheB`), cleared in the same places `node._cache` is. Not urgent — only worth doing if combiners on very large files feel slow, and worth measuring first (the two scans may be cheaper than the bookkeeping). | klein | 2 |
| 73 | Custom plots — a script window as a Plot variant | A small script/expression window that produces a user-defined chart from the extracted data, alongside the built-in Plot tab. Open question: scripting surface (which data it gets, sandboxing) given the dependency-free/offline constraint. | groß | 2 |
| 74 | Configure a plot by drag & drop from the overview | Build/adjust a plot by dragging extracted columns/values from the extraction table onto the plot's axes, instead of only the current toolbar controls. | mittel | 2 |
| 75 | Strict Content-Security-Policy as defense-in-depth | A browser-enforced `<meta http-equiv="Content-Security-Policy">` allowlist to cap the blast radius of any future DOM-XSS. Biggest concrete win here is `connect-src 'none'`: the app makes zero network calls, so this blocks all exfiltration of `localStorage` (sessions/filters/themes) even if injected script somehow runs. Add `object-src`/`base-uri`/`form-action 'none'` to close side channels. **Caveat**: the single-file inline `<script>`/`<style>` architecture forces `script-src`/`style-src 'unsafe-inline'` (a nonce/hash would need build tooling, against the no-build-step rule), so CSP here limits *impact*, not inline-script execution. Must keep `img-src data: blob:` and `worker-src blob:` (image viewer data-URLs, log-parse worker, SVG export) or the app breaks — introduce with regression coverage. `frame-ancestors` (clickjacking) needs an HTTP header, unavailable from `file://`/meta. Align with the desktop build's own CSP in `desktop/src-tauri` config. Complementary to the sandbox-iframe note in `docs/persistence-and-sync.md` → "Any other entry". | mittel | 2 |
| 82 | logfmt format mode | A format mode that reads each line as `key=value` pairs (logfmt: Heroku, Go `slog`/logrus text handlers), keys becoming custom columns automatically, time/level mapped from configurable keys — the JSON Lines half of this entry is implemented (`mode: "json"`, see PROJECT.md → "JSON Lines formats"); logfmt could reuse its dialog kind and key detection with a different line parser. | klein–mittel | 2 |
| 85 | Encoding selection for the browser build | Auto-detect by BOM, otherwise a per-format/per-file dropdown (at least Windows-1252/Latin-1, UTF-16). The browser build decodes UTF-8 only, so logs from older .NET/Windows tools show broken umlauts; the native desktop parser already handles UTF-16. | klein | 2 |
| 86 | Time zone per format | Let a format declare the zone of its timestamps (or parse an offset/`Z` suffix) and normalize on load. Timestamps are treated as zone-less local time today, so merging logs from different zones only works via the manual per-file clock offset. | klein | 2 |
| 87 | Pattern alert while tailing | Mark a filter as "alert": when a live-tail tick adds new matches, show a toast (desktop build: an OS notification). Turns PhiLogg into a monitoring tool during test runs or commissioning, without watching the view constantly. | klein–mittel | 2 |
| 88 | Very large files (multi-GB) in the desktop build | Keep raw data and a line/time index on the Rust side and hand JS only the window it currently needs, instead of holding every entry in memory. Today the whole file lives in RAM — fine up to a few hundred MB, a hard limit beyond that; #54 (Prune) only mitigates it. | groß | 3 |
| 6 | Relative-time display toggle | Show timestamps as offsets from a chosen zero row (selected or bookmarked) instead of absolute time, same reasoning that made extraction's `t(ms)` cumulative-from-first. | klein |  |
| 7 | Collapse consecutive duplicate messages into one row with an ×N badge | Noise control for spam loops. Open question: what counts as "duplicate" (raw line, message column, or message-with-numbers-normalized — the Patterns tab's `normalizeMessagePattern` already does the latter). | mittel |  |
| 12 | Dedup check on filter-file / session import | Prevents duplicate branches when the same filter (tree) is loaded/imported again. | klein |  |
| 13 | Autocomplete suggestions from recently used filter values/search terms | In the filter popup. | klein–mittel |  |
| 14 | Mute (disable) a filter node instead of deleting it | A muted node is skipped in the chain (its children evaluate against its parent) but stays in the tree with its colour, assertions, and children intact. Faster than delete+undo for "does this step matter?". Needs the flag threaded through every persistence carrier (see `CLAUDE.md`'s gotcha list). | mittel |  |
| 15 | "Why is this row here?" explain popup | For the selected entry, show which node of the active chain matched it; for a context row in the Context view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the "view sometimes doesn't refresh" class of confusion. | mittel |  |
| 22 | Diff view between two filter results | E.g. comparing two runs of the same log. | groß |  |
| 28 | Time sync between two open files | Selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent. | groß |  |
| 30 | Cross-file search (read-only) | One term, hit counts per loaded file, click to jump. Stays inside the "no cross-file filter nodes" design rule precisely by not creating nodes. | klein–mittel |  |
| 89 | Remote log sources (desktop build) | Open/tail logs over SSH, from Docker containers, journald or Windows Event Log (`.evtx`) via the Rust side. Not possible in the single-file browser build; would only make sense as a desktop-only extra. | groß |  |
| 90 | Text query language for power users | A typed query (e.g. `level:ERROR thread:Worker* msg~"timeout"`) that compiles into regular filter nodes, as an alternative input path to the dialogs. The filter tree covers GUI users; power users would get a faster, keyboard-only way to build chains. Open question: syntax scope, and keeping it a front-end for nodes rather than a second evaluation engine. | mittel–groß |  |
| 91 | More excerpt options for "Copy for ticket" | The Export / Share snippet (docs/export.md) carries the first N matching lines. Consider ±N context lines around each excerpt entry and other picks (bookmarked entries first, last N, around the selected row) — left out of the first version to keep the dialog small. | klein |  |
| 92 | Rich-text clipboard copy for the ticket snippet | Put an HTML flavour on the clipboard next to the Markdown/wiki text, for editors that don't convert pasted Markdown (Confluence Cloud, Outlook). Left out of the first Export / Share version. | klein |  |
