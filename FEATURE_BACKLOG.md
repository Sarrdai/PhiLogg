# PhiLogg — Feature Backlog

LAST_ID: 118

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
| 15 | "Why is this row here?" explain popup | For the selected entry, show which node of the active chain matched it; for a context row in the Context view, show which node rejects it. A debugging aid for deep trees, and the natural answer to the "view sometimes doesn't refresh" class of confusion. | mittel | 2 |
| 19 | File-independent (universal) cache for the `.html` build | Today the cache appears keyed per filename; a shared/universal cache would keep working across renamed or re-opened files. Open question: how to handle a cached payload left over from an incompatible older/newer app version (versioning or invalidation needed). | mittel | 2 |
| 58 | Inline editing of an AND/OR node's `baked` conditions | Link nodes have their own edit dialog ("Edit link…"); AND/OR still don't — changing what a combiner matches means Unpack (materializes its baked conditions as sibling filters, leaving the combiner unchanged) or delete-and-recreate. A small dialog listing the baked conditions as editable pattern fields (like the link dialog's sides) would let one condition be swapped directly. | mittel | 2 |
| 73 | Custom plots — a script window as a Plot variant | A small script/expression window that produces a user-defined chart from the extracted data, alongside the built-in Plot tab. Open question: scripting surface (which data it gets, sandboxing) given the dependency-free/offline constraint. | groß | 2 |
| 75 | Strict Content-Security-Policy as defense-in-depth | A browser-enforced `<meta http-equiv="Content-Security-Policy">` allowlist to cap the blast radius of any future DOM-XSS. Biggest concrete win here is `connect-src 'none'`: the app makes zero network calls, so this blocks all exfiltration of `localStorage` (sessions/filters/themes) even if injected script somehow runs. Add `object-src`/`base-uri`/`form-action 'none'` to close side channels. **Caveat**: the single-file inline `<script>`/`<style>` architecture forces `script-src`/`style-src 'unsafe-inline'` (a nonce/hash would need build tooling, against the no-build-step rule), so CSP here limits *impact*, not inline-script execution. Must keep `img-src data: blob:` and `worker-src blob:` (image viewer data-URLs, log-parse worker, SVG export) or the app breaks — introduce with regression coverage. `frame-ancestors` (clickjacking) needs an HTTP header, unavailable from `file://`/meta. Align with the desktop build's own CSP in `desktop/src-tauri` config. Complementary to the sandbox-iframe note in `docs/persistence-and-sync.md` → "Any other entry". | mittel | 2 |
| 82 | logfmt format mode | A format mode that reads each line as `key=value` pairs (logfmt: Heroku, Go `slog`/logrus text handlers), keys becoming custom columns automatically, time/level mapped from configurable keys — the JSON Lines half of this entry is implemented (`mode: "json"`, see PROJECT.md → "JSON Lines formats"); logfmt could reuse its dialog kind and key detection with a different line parser. | klein–mittel | 2 |
| 95 | Folder watch lists every file type PhiLogg can open | A watched folder lists only `.log`/`.log.gz` (`FOLDER_WATCH_EXTENSIONS`) plus inline-viewable txt/xml/json/images; a log with another extension — `.jsonl`, or anything a format's filename rule matches — doesn't appear at all, so the auto rules (which already apply to every listed type) can't reach it. Would widen `isCompatibleFolderFile` to format filename rules and pass a matching (or empty) extension list to the desktop wrapper's native `list_folder`. | mittel | 2 |
| 105 | Log formats as files next to the app ("provided formats") | Ship formats as `*.logformat.json` beside `philogg.html` / the desktop exe, loaded read-only at every start (Duplicate to edit), so the homepage can serve the welcome format and an installer or software-distribution package can roll out company formats without an import step; the three baked-in demo formats would move out of the HTML (they also re-seed after being deleted today). Concept with locations per runtime (desktop folders injected by the wrapper, `formats/index.json` when hosted, a generated `philogg-formats.js` for `file://`), semantics and phasing: `docs/concept-format-files.md`. Open there: runtimes for phase 1, read-only layer vs. one-time import, removing the demo seeds. | mittel–groß | 2 |
| 110 | Folder watch: start filters for non-log files (txt, XML, JSON) | A folder-watch pattern's "Start filters" (#71, `applyFolderStartFilter`) apply only to log nodes; an auto-opened inline viewer (`.txt`/`.xml`/`.json`) gets nothing. Make a start action available for those too, so an auto-opened non-log file jumps straight into the wanted view (e.g. a search/highlight or a specific viewer mode). Open question: what a "filter" means for each viewer kind. | mittel | 2 |
| 88 | Very large files (multi-GB) in the desktop build | Keep raw data and a line/time index on the Rust side and hand JS only the window it currently needs, instead of holding every entry in memory. Today the whole file lives in RAM — fine up to a few hundred MB, a hard limit beyond that; Prune (docs/persistence-and-sync.md) only mitigates it. | groß | 3 |
| 7 | Collapse consecutive duplicate messages into one row with an ×N badge | Noise control for spam loops. Open question: what counts as "duplicate" (raw line, message column, or message-with-numbers-normalized — the Patterns tab's `normalizeMessagePattern` already does the latter). | mittel |  |
| 12 | Dedup check on filter-file / session import | Prevents duplicate branches when the same filter (tree) is loaded/imported again. | klein |  |
| 22 | Diff view between two filter results | E.g. comparing two runs of the same log. | groß |  |
| 28 | Time sync between two open files | Selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent. | groß |  |
| 59 | Memoize each baked condition's own result inside an AND/OR/LINK node | `getEntriesFromBaked` re-evaluates `bakedA` and `bakedB` in full on every recompute; a new combiner sits as a top-level child of its root file, so that's two full-file scans per recompute, on every tail tick for that file and after every structural change. Fix: a per-side result cache (`node._bakedCacheA`/`_bakedCacheB`), cleared in the same places `node._cache` is. Not urgent — only worth doing if combiners on very large files feel slow, and worth measuring first (the two scans may be cheaper than the bookkeeping). | klein | |
| 74 | Drag & drop role chips onto the plot | Drag a chip from the pattern bar onto drop zones over the chart (X / Y / Color) as an extra path next to the role-chip click menu (implemented, see `docs/extraction-and-plotting.md` → "Role chips"). Worth doing only if the menu turns out to be too slow in practice; mockup: the concept artifact from 2026-09-29. | klein–mittel | |
| 89 | Remote log sources (desktop build) | Open/tail logs over SSH, from Docker containers, journald or Windows Event Log (`.evtx`) via the Rust side. Not possible in the single-file browser build; would only make sense as a desktop-only extra. | groß |  |
| 90 | Text query language for power users | A typed query (e.g. `level:ERROR thread:Worker* msg~"timeout"`) that compiles into regular filter nodes, as an alternative input path to the dialogs. The filter tree covers GUI users; power users would get a faster, keyboard-only way to build chains. Open question: syntax scope, and keeping it a front-end for nodes rather than a second evaluation engine. | mittel–groß |  |
| 103 | Auto-detect the log format when the filename-resolved format matches no line | Try the stored formats on the file's first ~50 lines and pick the best match, instead of only offering the "No line matches the log format" empty state (2026-10-05) with its manual "Set up log format…" / "Open as plain text" buttons. Decided not to build now: a wrong silent guess is worse than the visible prompt. | mittel |  |
