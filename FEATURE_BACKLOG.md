# PhiLogg — Feature Backlog

LAST_ID: 140

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
| 73 | Custom plots — a script window as a Plot variant | A small script/expression window that produces a user-defined chart from the extracted data, alongside the built-in Plot tab. Open question: scripting surface (which data it gets, sandboxing) given the dependency-free/offline constraint. | groß | 2 |
| 124 | One value statistic over several message types in Table/Plot | MCP usability test 2026-10-09 (task 19): the demo log has two GET formats (`Request GET … completed in Nms status=N` and `GET https://… -> N (N ms)`). For agents this is solved since round H (`get_value_stats` `sources`); the Table/Plot still work on one extraction only. Idea: an OR group of extraction filters whose columns map onto shared names. Needs a mockup and new persistence. | mittel–groß | 2 |
| 127 | Split plot series by a word column | Desktop usability test 2026-10-09 (task 13): Extract on a `Sensor T1 …` row yields `Sensor [*:word] …`, so the Plot joins T1, T2 and T3 into one saw-tooth line; the `Sensor` column chip only offers "Ignore column". Idea: a "Split series by" choice under the Y axis that draws one line per value of a word column (own color, legend entry, click to hide); the column chip gets "Split by". Needs persistence (plot settings, sessions) and a decision for the Table view. Mockup variant A: https://claude.ai/artifact/BKWsrguFZ4UR17cRMPav9s (package I5). The column chip's smaller "Keep only <value>" already shipped (round I, 2026-10-09); only the split itself is open. | mittel | 2 |
| 140 | Code review: centralize shared logic in classes | A friendly review pass over philogg.html to find logic that is repeated per element (styling rules, small UI helpers, setup code) and fold it into shared CSS classes / helpers, the way #135 did for button icons. Output: a list of candidates with effort, then small follow-up entries — no big-bang refactor. | mittel | 2 |
| 88 | Very large files (multi-GB) in the desktop build | Keep raw data and a line/time index on the Rust side and hand JS only the window it currently needs, instead of holding every entry in memory. Today the whole file lives in RAM — fine up to a few hundred MB, a hard limit beyond that; Prune (docs/persistence-and-sync.md) only mitigates it. | groß | 3 |
| 137 | MCP: concept for how data to create a format can be provided | First attempt: the model wanted to analyse the file itself and started searching the disk for it. Needs a concept for how the data required to create a log format is handed to the model via MCP. | mittel | 3 |
| 138 | Rework the homepage | No details yet. | mittel | 3 |
| 139 | Challenges as "better" UI tests | Create challenges in which features must/can be used in combination — as a richer form of UI test. | mittel–groß | 3 |
| 12 | Dedup check on filter-file / session import | Prevents duplicate branches when the same filter (tree) is loaded/imported again. | klein |  |
| 22 | Diff view between two filter results | E.g. comparing two runs of the same log. | groß |  |
| 28 | Time sync between two open files | Selecting an entry in one file scrolls a second, side-by-side file to the nearest timestamp (device log vs. application log), without the destructive `mergeFiles` step. Would need a second file pane; the Filter/Highlight split is the closest existing precedent. | groß |  |
| 59 | Memoize each baked condition's own result inside an AND/OR/LINK node | `getEntriesFromBaked` re-evaluates `bakedA` and `bakedB` in full on every recompute; a new combiner sits as a top-level child of its root file, so that's two full-file scans per recompute, on every tail tick for that file and after every structural change. Fix: a per-side result cache (`node._bakedCacheA`/`_bakedCacheB`), cleared in the same places `node._cache` is. Not urgent — only worth doing if combiners on very large files feel slow, and worth measuring first (the two scans may be cheaper than the bookkeeping). | klein | |
| 74 | Drag & drop role chips onto the plot | Drag a chip from the pattern bar onto drop zones over the chart (X / Y / Color) as an extra path next to the role-chip click menu (implemented, see `docs/extraction-and-plotting.md` → "Role chips"). Worth doing only if the menu turns out to be too slow in practice; mockup: the concept artifact from 2026-09-29. | klein–mittel | |
| 89 | Remote log sources (desktop build) | Open/tail logs over SSH, from Docker containers, journald or Windows Event Log (`.evtx`) via the Rust side. Not possible in the single-file browser build; would only make sense as a desktop-only extra. | groß |  |
| 90 | Text query language for power users | A typed query (e.g. `level:ERROR thread:Worker* msg~"timeout"`) that compiles into regular filter nodes, as an alternative input path to the dialogs. The filter tree covers GUI users; power users would get a faster, keyboard-only way to build chains. Open question: syntax scope, and keeping it a front-end for nodes rather than a second evaluation engine. | mittel–groß |  |
| 103 | Auto-detect the log format when the filename-resolved format matches no line | Try the stored formats on the file's first ~50 lines and pick the best match, instead of only offering the "No line matches the log format" empty state (2026-10-05) with its manual "Set up log format…" / "Open as plain text" buttons. Decided not to build now: a wrong silent guess is worse than the visible prompt. | mittel |  |
| 121 | Benchmark for the LLM analysis tools: shell agent vs. tools-only vs. local model | Came from #119 (concept phase 0, dropped in the 2026-10-08 decision): measure whether the analysis tools beat a general shell agent on the same logs, and how a small local model fares with tools only. Ground truth from the log simulator (`--truth`), so answers are checkable. Not built: the tools shipped without it. | mittel |  |
| 122 | Analysis entry points on the phone | The #120 analyses are desktop/tablet-only today: the phone has no Neighbors tab and no Patterns Compare, the burst flags open the plain pointer menu (no `What came before` / `Compare with rest`) and the minimap `Bursts` chip is hidden (the Settings switch works). Needs a phone design (mockup first): e.g. Neighbors and Compare as bottom-sheet tabs, burst actions as sheet content. Came from #120. | mittel |  |
