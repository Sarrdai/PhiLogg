# PhiLogg — Feature Backlog

LAST_ID: 75

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
  `Details`. Adding a rejected entry requires a stated reason.

**Sorting:** by `Prio` (1, 2, 3, empty, then verworfen), then by `Nr` within
each priority. Re-sort after changing any priority.

Switched from four themed lists to this single priority-sorted table
(2026-09-13, person-requested): the old `Road to 1.0` / `Backlog` /
`Wiedervorlage` / `Verworfen` split and the per-theme subheadings were
replaced by the `Prio` column above (Road to 1.0 → 1, Backlog → 2,
Wiedervorlage → empty, Verworfen → verworfen).

| Nr | Kurzbeschreibung | Details | Prio |
|---|---|---|---|
| 35 | "Restore last session on startup" is desktop-only in practice | The plain `.html` build already survives a page refresh regardless of this setting (existing cache behavior), so the toggle only has meaning in the desktop build; consider hiding/disabling it outside that build. | 1 |
| 38 | Replace the level-filter icon (three bars) | Not a bug; the current icon just isn't expressive enough. Wants a clearer/more meaningful glyph for the level filter. | 1 |
| 49 | Check for collisions with OS default shortcuts | Audit that the app's own keyboard shortcuts never shadow or override the operating system's default shortcuts (e.g. window-management / browser shortcuts). | 1 |
| 54 | "Prune" action when a filter and a file are both selected | Discards everything from memory/view that isn't part of the filter's result set, not just hides it. Especially useful for time filters (throw away everything outside the range) but not restricted to that case. Where content was pruned, insert a placeholder (at least in the Context view, whose gap strips are the natural home for it) so the cut is visible rather than silently making rows disappear. | 1 |
| 5 | Δt between two rows | Mark a row, shift-click a second, get the gap in the status strip. The extraction table already answers this (`t(ms)`), the log view doesn't. | 2 |
| 19 | File-independent (universal) cache for the `.html` build | Today the cache appears keyed per filename; a shared/universal cache would keep working across renamed or re-opened files. Open question: how to handle a cached payload left over from an incompatible older/newer app version (versioning or invalidation needed). | 2 |
| 21 | Warn/migrate when an extraction pattern edit shifts columns | Assertions and ignored-columns are index-based and silently point at the wrong column otherwise. | 2 |
| 31 | Export the current view | The filtered result as `.log`/`.csv`/`.tsv`. Only the extraction table can leave the app as text today; session export is JSON for PhiLogg users, not data for Excel or a ticket. Copying selected log rows as raw text via Ctrl+C (multi-select + `copyLogSelectionToClipboard`) already exists — column-wise copy and whole-view file export are still open. | 2 |
| 32 | Findings report export | A standalone HTML/Markdown report carrying the filter chain, bookmark notes, and the matching entries, readable by someone who has neither PhiLogg nor the log file. Different audience than session export (which assumes both). | 2 |
| 45 | Theme should be able to follow the OS/system light-dark state | A live "follow system" mode as an alternative to the manual toggle. Today `prefers-color-scheme` is only read once as the default on first start (no stored theme), not tracked afterwards. | 2 |
| 58 | Inline editing of an AND/OR/LINK node's `bakedA`/`bakedB` | Today the only way to change what a combiner matches is Unpack (materializes its two baked sides as visible sibling filters, leaving the combiner itself unchanged — so a real edit still means delete-and-recreate) or delete-and-recreate outright; a dedicated small dialog to re-bake `bakedA`/`bakedB` directly would be more direct for swapping one side. | 2 |
| 59 | Memoize each baked condition's own result inside an AND/OR/LINK node | `getEntriesFromBaked` re-evaluates `bakedA` and `bakedB` in full on every recompute; a new combiner sits as a top-level child of its root file, so that's two full-file scans per recompute, on every tail tick for that file and after every structural change. Fix: a per-side result cache (`node._bakedCacheA`/`_bakedCacheB`), cleared in the same places `node._cache` is. Not urgent — only worth doing if combiners on very large files feel slow, and worth measuring first (the two scans may be cheaper than the bookkeeping). | 2 |
| 68 | Word wrap in the views (log view and text view) | A toggle to soft-wrap long lines instead of horizontal scrolling, in both the log rows and the inline text viewer. Distinct from the existing multiline-message toggle, which is about multi-line entries, not wrapping a single long line. | 2 |
| 69 | Audit all dialogs for a consistent UI | Sweep every popup/dialog (filter popup, Settings, Format Manager, link dialog, ...) for a uniform look-and-feel: spacing, header style, button placement and labelling. | 2 |
| 70 | LLM integration with a chat window | Connect an LLM to ask questions about the loaded log(s) via an in-app chat panel. Open questions: which provider/endpoint (local vs. remote API), how much log context to send, and how to reconcile this with the local-first/offline, dependency-free design constraint (a remote call breaks "no server, no external calls"). | 2 |
| 71 | Extend folder auto-open with configurable start filters | When a watched/auto-opened folder loads on startup, apply a preconfigured set of filters automatically. Builds on the existing folder auto-open. | 2 |
| 72 | New versioning scheme with real version numbers | Replace the current commit-short-SHA stamp (`PHILOGG_VERSION` → `.brand-version`) with proper, human-readable release version numbers. | 2 |
| 73 | Custom plots — a script window as a Plot variant | A small script/expression window that produces a user-defined chart from the extracted data, alongside the built-in Plot tab. Open question: scripting surface (which data it gets, sandboxing) given the dependency-free/offline constraint. | 2 |
| 74 | Configure a plot by drag & drop from the overview | Build/adjust a plot by dragging extracted columns/values from the extraction table onto the plot's axes, instead of only the current toolbar controls. | 2 |
| 75 | Strict Content-Security-Policy as defense-in-depth | A browser-enforced `<meta http-equiv="Content-Security-Policy">` allowlist to cap the blast radius of any future DOM-XSS. Biggest concrete win here is `connect-src 'none'`: the app makes zero network calls, so this blocks all exfiltration of `localStorage` (sessions/filters/themes) even if injected script somehow runs. Add `object-src`/`base-uri`/`form-action 'none'` to close side channels. **Caveat**: the single-file inline `<script>`/`<style>` architecture forces `script-src`/`style-src 'unsafe-inline'` (a nonce/hash would need build tooling, against the no-build-step rule), so CSP here limits *impact*, not inline-script execution. Must keep `img-src data: blob:` and `worker-src blob:` (image viewer data-URLs, log-parse worker, SVG export) or the app breaks — introduce with regression coverage. `frame-ancestors` (clickjacking) needs an HTTP header, unavailable from `file://`/meta. Align with the desktop build's own CSP in `desktop/src-tauri` config. Complementary to the sandbox-iframe note in `docs/persistence-and-sync.md` → "Any other entry". | 2 |
| 2 | Minimap: line-based instead of time-based | Show position/density by line count rather than by timestamp span. First draft wasn't liked — reconsider approach before retrying. | |
| 3 | Incremental find inside the current view (`Ctrl+G`/`F3`) | Next/prev, highlight-as-you-type. Today `Ctrl+F` always creates a filter node, so "just look for this string once" costs a tree node you then delete. Non-destructive search would be its own, lighter interaction on top of the existing views. | |
| 6 | Relative-time display toggle | Show timestamps as offsets from a chosen zero row (selected or bookmarked) instead of absolute time, same reasoning that made extraction's `t(ms)` cumulative-from-first. | |
| 7 | Collapse consecutive duplicate messages into one row with an ×N badge | Noise control for spam loops. Open question: what counts as "duplicate" (raw line, message column, or message-with-numbers-normalized — see #23). | |
| 12 | Dedup check on "Load filter…" / session import | Prevents duplicate branches when the same filter (tree) is loaded/imported again. | |
| 13 | Autocomplete suggestions from recently used filter values/search terms | In the filter popup. | |
| 14 | Mute (disable) a filter node instead of deleting it | A muted node is skipped in the chain (its children evaluate against its parent) but stays in the tree with its colour, assertions, and children intact. Faster than delete+undo for "does this step matter?". Needs the flag threaded through every persistence carrier (see `CLAUDE.md`'s gotcha list). | |
| 15 | "Why is this row here?" explain popup | For the selected entry, show which node of the active chain matched it; for a context row in the Context view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the "view sometimes doesn't refresh" class of confusion. | |
| 22 | Diff view between two filter results | E.g. comparing two runs of the same log. | |
| 23 | Message-pattern grouping ("log clustering") | Normalize numbers/GUIDs/paths in the message to placeholders, group identical shapes, list the top N with counts. Probably the single fastest way into an unfamiliar log; one click on a group turns it into a text filter. Scoping question: normalization rules, and whether it's a view or a filter type. | |
| 24 | Gap / stall filter | Match entries whose distance to the previous entry exceeds X ms. Finds hangs without extracting a value first; sits next to the existing wildcard value-condition filtering (`[*:float>=10]` etc.). | |
| 28 | Time sync between two open files | Selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent. | |
| 30 | Cross-file search (read-only) | One term, hit counts per loaded file, click to jump. Stays inside the "no cross-file filter nodes" design rule precisely by not creating nodes. | |
