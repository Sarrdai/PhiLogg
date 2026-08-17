# PhiLogg — Feature Backlog

Raw ideas only, not yet elaborated. Pick items up individually before implementation.

- **Drop a non-log file (e.g. TIFF) → jump to matching log entry** by the file's CreationDate. Open question: TIFF files carry a trailing XML block (after the image data) with its own CreationDate, which may be more accurate than the filesystem timestamp. Needs scoping before implementation.
- **Bugfix**: view sometimes doesn't refresh when a new filter is created. Needs repro/root cause.
- **Pluggable parser logic** — support/configure additional log formats beyond the current one.
- **Sortable columns** in the entry table.
- **Numeric greater/less-than filter** without requiring value extraction first.
- **Dedup check on "Load filter…" / session import** — prevents duplicate branches when the same filter (tree) is loaded/imported again.
- **Warn/migrate when an extraction pattern edit shifts columns** — assertions and ignored-columns are index-based and silently point at the wrong column otherwise.
- **Optional tail auto-follow for the Highlight view** — currently deliberately static while the Filter view follows tailed entries; revisit if live-tailing workflows want it too.
- **Autocomplete suggestions from recently used filter values/search terms** in the filter popup.
- **Diff view between two filter results** — e.g. comparing two runs of the same log.
