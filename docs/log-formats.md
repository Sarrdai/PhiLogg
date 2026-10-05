# Log formats

How PhiLogg parses a file: the `LogFormat` model, pattern vs. regex mode, the format dialog, JSON Lines, plain text, worker and native parsing, multi-pattern (`meta`) formats, and file merging. Moved out of `PROJECT.md` (2026-10-01) to keep the entry point short; `PROJECT.md` → "The log formats it parses" keeps the summary.

Every file is parsed under one `LogFormat`. Every format produces the same
entry **shape** — `{ts, level, thread, location, method, message, fields}`
— but not the same fixed set of populated/displayed columns any more
(**Custom Columns**, FEATURE_BACKLOG.md-adjacent, this session): **Time and
Level are the only two mandatory columns**; Thread/Location/Method/Message
are each individually optional per format, and a format may additionally
define its own **custom columns**, populated by a named capture beyond the
six reserved field names (`ts`/`level`/`thread`/`location`/`method`/
`message`) — landing on the entry's `fields` bag, keyed by capture name
(`applyFormatMatch`, `RESERVED_FIELD_KEYS`). See "Log format definitions"
(`philogg.html`, right after "Log parsing") for the full parsing mechanism:
pattern-mode vs. regex-mode compilation, filename→format glob rules
(Settings → Format Manager), and how a file's resolved format is pinned to
it for the rest of its session-cache lifetime. A file that finishes loading with **0 entries from non-empty text** (no line matches its format — e.g. `tour/welcome.log` opened alone under the default format) is not left as a blank table: `parseLogTextAsync` ends in `noteFormatMismatch`, which keeps the text on the node as `node.noFormatMatch` (`{text, lines}`, session-only; `rebuildFileText` returns it so a cache restore re-detects the case) and `renderFormatMismatchPanels` overlays the Filtered and Context rows with a panel: "No line of <file> matches the log format “<name>”", "<N> lines were read…", **Set up log format…** (opens the format dialog prefilled with the file's first lines, hidden on phone; after Save the file is re-parsed with the new format) and **Open as plain text**. Both go through `reparseFileWithFormat` — re-parse in place (same node id, filter children stay), format pinned like any other pinned format, panel gone once entries exist. Not undoable (re-parsing never is). Auto-detecting the format instead is backlog #103.

Formats are defined in one
**format dialog** (Settings → Log Formats → Add/Edit): example lines
(paste/drop/open) get an automatic suggestion right away, the person
corrects it by marking column values in the lines or by editing the regex
directly, levels are auto-filled from the examples, and a table preview
shows the result. The dialog always saves **Regex mode** (a stored
Pattern-mode format still parses, and is converted to its compiled regex
when saved there), stores the examples on the record as `sampleSetup`, and
can add a filename rule on the way (see `docs/ui-and-views.md` → "Format
dialog"). A third `LogFormat` mode,
`"meta"` (below), is the one exception to "one format, one file" — it never
parses a line itself, it fans a file out into several ordinary,
single-format files first.

**Custom columns**, concretely: Pattern mode gets a new `%X{name}` token
(log4j MDC-style — captures free text into a user-chosen field name);
Regex mode already supports this natively via any `(?<name>...)` group
beyond the six reserved ones, no parsing change needed there. A format's
`columnDefs: [{key, kind: "default"|"custom", label}]` is its **ordered,
reorderable middle-column list** — Thread/Location/Method (each individually
removable/re-addable) plus any custom columns — edited in the format
dialog's column list (`fwz.columns`, see `docs/ui-and-views.md` → "Format
dialog"; only the columns the saved regex actually captures are stored). Time and Level are NOT part of this
list: they're always first, never hideable. Message is likewise not part of
it: always last (the row grid's flexible `1fr` remainder when shown), with
its own `messageVisible: boolean` flag instead of an order position.
`formatColumnDefs(formatId)`/`formatMessageVisible(formatId)` read one
format's own list (falling back to the legacy fixed three / always-visible
for a record predating this feature); `activeColumnDefs()`/
`activeMessageVisible()` union every currently-loaded root file's own list
— same idiom as `activeLevelOrder()` below — and drive the row/header
renderers, the columns-visibility panel, the context menu's generalized
"Filter for this ___" (`activeTextFilterColumns()`, replacing the old fixed
6-entry `TEXT_FILTER_COLUMNS` table), and the filter popup's column-
restriction chips. `entryColumnValue(e, key)` is the one place that reads
either a reserved field or a custom `fields[key]` value for a given column
key — the generalized replacement for the old fixed-switch
`textColumnValue`. **Time/Level being mandatory is enforced only at
save time** in the Format Manager (`saveFormatEdit`) — `compileFormatPattern`/
`validateFormatRegex` themselves have no hard field requirement any more
(every field already has a graceful runtime default: `ts`→`NaN`, `level`→
`"INFO"`, everything else→`""`/the whole raw line for `message`), so a
format saved before this rule existed, or compiled at runtime for a file
already on disk, keeps parsing exactly as it always has.

A format also carries its own **ordered level list** (`LogFormat.levels`,
`formatLevelDefs(formatId)`). It may pick from the six names that own a
theme color (`ALL_LEVELS` = `FATAL/ERROR/WARN/INFO/DEBUG/TRACE`) *and* add
arbitrary **custom names** of its own (`NOTICE`, `VERBOSE`, …);
`OTHER` stays the implicit catch-all and is never listed. Each level
definition is `{value, name, color}`: `name` is the canonical bucket name
shown/colored everywhere; `color` is an explicit, user-picked CSS color
(format setup's level color-mapping — `explicitLevelColor`/
`levelColorVar`), or `null` for the legacy fixed-name/rotating
`--level-custom-1..6`-palette behavior; `value` is what a captured level
token is matched against, either as case-insensitive **text** (the name
itself, default) or as a **numeric code** when the format's
`levelValueType` is `"int"` (e.g. RFC 5424 syslog severity 0–7 — a format
setup UI toggle, `formatEditLevelValueType`, no fixed severity table
needed since each code maps explicitly to a name+color). A legacy record's
plain-string `levels` array (every format saved before this feature)
upcasts on read to `{value: name, name, color: null}` — no migration
needed. It decides which level buttons the level bar offers, and in which
order, for files using that format (the bar also adds a chip for every
bucket that occurs in an open file but is not listed: FATAL, TRACE, Other); a format without the field (every
builtin, and anything created before this existed) falls back to `LEVELS` =
`ERROR, WARN, INFO, DEBUG`. Every entry is stamped with the `formatId` it
was parsed under (`parseLogTextAsync` and `appendTailText`), which is what
lets `levelBucket(level, formatId)` resolve a raw level string (or, in int
mode, a numeric code) against its *own* format's list before falling
through the fixed prefix cascade (text mode only — a numeric code has no
natural cascade). See `docs/ui-and-views.md` → "Level bar" for how several
open formats combine (`activeLevelOrder`/`canonicalLevelOrder`).

The builtin default (`fmt-default`, non-deletable, always sorts first in the
Format Manager) is the original hardcoded log4net-style conversion pattern:
`%d\t%p\t"%t"\t%c\t[%M]\t"%m"%n` (tab-separated: `timestamp \t level \t
"thread" \t file \t line N \t [method] \t "message"`). As long as it hasn't
been edited via the UI, it's a thin pass-through to the original, untouched
`parseHeaderLine`/`HEADER_RE`/`parseLogTextAsync` — zero behavior change
from before this feature existed. Editing it (or adding any other format)
routes it through the generic pattern/regex compiler instead. The parser is
tolerant: it detects a new entry via a format-specific line-start check
(`isHeaderLine`, `HEADER_RE` for the builtin default), and any line that
doesn't match is treated as a continuation of the previous entry's message
(handles multi-line stack traces). Parsing runs in async chunks
(`PARSE_CHUNK_LINES = 4000`) with `setTimeout(...,0)` yields between chunks
so the UI stays responsive on large files, and reports progress that drives
a mini progress bar rendered directly on that file's tree row (file read =
55% of the bar via `FileReader.onprogress`, parsing = 45%, see
`READ_WEIGHT`/`PARSE_WEIGHT`, and "File loading rows" below — there is no
blocking pop-up, the rest of the UI stays usable throughout).

**Off-main-thread parsing (`parseLogTextInWorker`).** The chunked loop above
only ever *yields* between chunks — it never runs two files' parses at the
same time, since it's still one function on one thread. `parseLogTextAsync`
tries a Web Worker first whenever `Worker` exists in the environment, falling
back to the plain loop above on any failure (including simply not having
`Worker` — e.g. the jsdom test environment, which is why the regression
suite's own file-loading groups exercise the fallback path already). The
worker script is not a hand-copied mirror: `buildLogParseWorkerSrc()`
serializes the actual parsing functions via `Function.prototype.toString()`
into a `Blob`, so the worker runs the exact same source, just off the main
thread — one source of truth, nothing that can silently drift. **One file
parses on every core**: `splitTextAtHeaderLines` cuts the text into one
piece per core (`parallelParseWorkerCount`: `navigator.hardwareConcurrency`,
pieces of at least 1 MB), each cut moved forward to the next header line so
a stack trace never leaves its entry and each piece parses to exactly the
whole text's entries in that range. **Byte-range mode**: when the source
is a Blob/File (`readParseFileNode`, gated by `canParseBlobInWorker`: UTF-8,
not the plain-text format), the main thread neither reads nor copies the
text — `parseLogTextInWorker` posts the Blob plus a byte range [a, b) per
worker and each worker reads its own bytes (`parseBlobRangeEntries`,
`findHeaderLineStartInBlob`): a piece starts at the first header-line start
>= a and ends at the first one >= b, so neighbours agree and no entry is
split or duplicated; progress is in bytes. Text sources (`addFile`, session
restore, meta-format, `?url=` text) and a failed worker keep the text route.
Each worker sends its entries back as
**binary batches** (`encodeEntryBatch`) in the native parser's layout
(`desktop/src-tauri/logparse/src/batch.rs`), read by the same
`decodeNativeBatch` — except that the string section stays a JS string
posted next to the ArrayBuffer instead of UTF-8 bytes on its end (a string
posts as a copy; TextEncoder + TextDecoder cost ~6 ms per MB, and a string
keeps a lone surrogate intact). Worker `ts` are already local (parsed in
this engine); only native batches go through `makeNaiveTsLocalizer`. The
main thread adopts the pieces in file order — a later piece's batches wait
for every earlier piece — at most `PARALLEL_PARSE_DRAIN_BATCHES` per task,
yielding through `queueTask` (a `MessageChannel` message, since a hidden
window's `setTimeout` is throttled), and reassigns ids there (`uid("e")`,
`entryIndex`) in file order, since `uidCounter` and `entryIndex` are both
main-thread-only state a worker can't share. A failed worker rolls back
what was adopted, and the main-thread loop parses the file instead. GROUP
268 pins all of it to the main-thread parse and the golden fixture.
`loadFileDescriptors` runs its whole batch **concurrently** (`Promise.all`)
rather than one file at a time, so 2-4 files loaded together each get their
own worker and actually parse on separate cores at once — the scenario this
was built for (large files, several loaded together). See `tests/…` GROUP
165 for the coverage (sandboxed worker-source execution + concurrent-load
correctness) and GROUP 68's addendum for the queued-placeholder UX change.

**JSON Lines formats (`mode: "json"`, FEATURE_BACKLOG.md #82).** Every line
starting with `{` is one entry, parsed with `JSON.parse` (`compileJsonFormat`,
a branch of `compileOneFormat`, so the main-thread loop, the parse workers —
its helpers are in `buildLogParseWorkerSrc`'s list — tailing and the format
dialog's preview share it). Time, level and message come from configurable
keys (`tsKey`/`levelKey`/`messageKey`; a missing level is `INFO`, a
missing message key leaves the whole line as the message); time is a number
(epoch s/ms/µs/ns by magnitude), else `tsFormat` or `Date.parse` (ISO 8601).
Custom columns are `columnDefs` entries with a **`path`**: `ctx.req.id`,
`tags[0]` (negative index from the end), `["http.status"]` for a key
containing a dot — and an unquoted dotted run prefers a *literal* key first,
longest match wins, so OpenTelemetry-style flat keys resolve unescaped
(`parseJsonPath`/`resolveJsonPath`). The column `key` is a sanitized
identifier (`jsonColumnKey`) — a path never reaches an attribute or selector.
Values land on `entry.fields` as text; objects and arrays as their JSON text
(which the extraction table's array views parse back, see
`docs/extraction-and-plotting.md` → "Array columns"). A `{` line that doesn't
parse keeps the whole line as its message; any other line continues the
previous entry. No native parse (`nativeFormatSpec` → null, the JS path
takes over). Defined in the format dialog's JSON Lines kind
(`docs/ui-and-views.md`); exported/imported like any format (`tsKey`/
`levelKey`/`messageKey` are export fields).

**Plain text: `fmt-plaintext`.** A code-level builtin (`PLAINTEXT_LOG_FORMAT`,
`mode: "plaintext"`) that isn't stored in `state.logFormats` and so isn't
editable — `findLogFormat(id)` resolves it next to the stored ones. Every
line is its own entry (blank lines included, message verbatim, no level),
and since such a file has no time, **its entries' `ts`/`tsRaw` are the
1-based line number** (`numberPlainTextEntry`, assigned when an entry is
appended to its file: main-thread loop, worker adoption, `appendTailText`).
That single choice keeps every order- and ts-based mechanism working
unchanged (sorting, OR re-sort, link, context windows, minimap, time-range
filters — all in lines); only the display side needs to know
(`entryTimeText`, `formatTsFor`, `allRootsPlainText`). It is reached **by extension**: `formatIdForLoad`
pins `.txt`/`.json`/`.xml` (`TEXT_FILE_EXTENSIONS`) to it and records
`node.textSyntax` (`"json"` | `"xml"` | `null`); never from the content-based
format resolution, no native parse (`nativeFormatSpec` -> null), no merging.
A JSON file loads pretty-printed by default (`node.textLayout` `"pretty"` |
`"raw"`, the file's own text on `node.textRaw`; the Context toolbar's
Pretty/Raw toggle re-parses in place). The file is **one node** with two
views: Context is a virtualized editor (folding, free selection, find),
Filtered a line-numbered text-mode table — see `docs/ui-and-views.md` →
"Text files". Its rows keep indentation and JSON/XML highlighting.

**Native parsing under the desktop wrapper (`parseLocalFileNatively`).**
When `window.philogg.parseLogFile` exists, a file opened from disk (dialog,
drop, folder watch, file association) skips both of the above: the Rust
backend reads it and parses it on every core (`desktop/src-tauri/logparse`),
streaming entries back in batches. The page still owns the parsing rules —
`nativeFormatSpec` hands Rust the regex source/date regex this page itself
compiled (shared `compileFormatRegex`), timestamps come back "naive" and are
localized by this engine (`makeNaiveTsLocalizer`), and anything the native
engine can't run with identical semantics (lookaround, backreferences, a
meta-format) falls back to the JS path above. A golden fixture shared by the
jsdom suite (GROUP 264) and the crate's `cargo test` pins both parsers to the
same output. See `docs/desktop.md` → "Native parsing".

**Multi-pattern parsing: the `"meta"` format mode** (FEATURE_BACKLOG.md #81,
implemented this session). Some files interleave two or more independent
grammars line-by-line (the motivating case: a log4net-style app log mixed
with RFC 5424 syslog blocks, no single header regex covers both). A
`mode: "meta"` `LogFormat` carries no pattern/regex/tsFormat/levels of its
own — only an ordered `targetFormatIds` list (≥2) naming other, ordinary
formats. `splitTextByMetaFormat(text, metaFmt)` classifies each non-blank
line against every target's own already-compiled `isHeaderLine`, first
match (in declared order) wins; a non-matching, non-blank line joins
whichever target's stream most recently matched — the same continuation
rule `parseLogTextAsync` already applies to a single format, just resolved
per-stream before parsing starts. Blank lines are dropped during the split
entirely, never emitted into any stream, which is provably equivalent to
today's single-format behavior (a blank line is already a no-op in
`parseLogTextAsync`'s own loop). `loadMetaFormatText(name, text, metaFmt)`
creates the merge result FIRST (`createMergeShell`, see "Sources grouping"
below), then loads each classified stream into its own real, independent
file node nested under the merge's "Sources" (reusing `addFile`/
`parseLogTextAsync` unmodified), sorting each stream's own `entries` by
`ts` first (a virtual stream isn't guaranteed chronological on disk — a
syslog block in particular — and `mergeFiles`' disjoint-time-range fast
path trusts each source's own order, so this pre-sort is what keeps that
fast path correct), and finally fills the merge's own entries
(`fillMergedEntries`) once every stream is loaded. The per-grammar file
nodes are never deleted — they stay real, independently clickable/
filterable nodes for as long as the merge exists, reachable only nested
under "Sources" (tagged `mergeOwnerId`/`mergeSourceHidden`, see below).
Wired into `loadOneFileIntoTree` and `addFile`'s live-resolution branch, so
drag-drop, the file picker, and folder-watch's on-demand open all pick this
up automatically with no separate code path. **Not supported in this first
version**: folder-watch
minimap probing (`probeFolderFileRange` returns its ordinary "no range
found" sentinel for a meta-format file rather than probing one grammar
wrong), windowed/partial loading, and live-tailing — a meta-format file is
always a static, fully-read snapshot. A meta-format's own targets are
ordinary formats, so int-mode level derivation from a numeric code (see
"Every file is parsed under one `LogFormat`" at the top of this file) already applies per-target the same as
for any single-format file; a target missing a `level` group just falls
through the existing generic missing-level default.

**"Sources" grouping/coloring on any merged file — a real tree-level
sibling of Bookmarks/Notes/Selection N, not an extra nesting level.**
`createMergeShell` (the merge-node constructor `mergeFiles` and every
create-first loader below share) creates one locked, real
`{type:"filter", filterType:"sources"}` child node per merge, positioned
via `insertSpecialChild` (a shared rank-based ordering helper —
`specialChildRank`: Sources=0, Bookmarks=1, Notes=2, Selection N=3+its own
creation ordinal — replacing what used to be four independent ad hoc
`unshift`/splice calls) so a file's auto-managed rows always read
**Sources, Bookmarks, Notes, Selection 1, Selection 2, ...** regardless of
creation order. The Sources node's own `children` stays empty; nesting
comes from the owning file's additive `sources: [{id, name, color, count}]`
array (plus a matching `entry.sourceId` on every copied entry) and each
source's real file node, rendered a second time via the ordinary
`renderNode(src.id, depth+1, {mergeSourceColor: src})` — the exact
"real root node, rendered nested, skipped from the plain top-level walk"
pattern ZIP/folder-watch containers already use (`mergeOwnerId`/
`mergeSourceHidden` tags, mirroring `zipId`/`folderId`). The one caller
that does NOT hide its sources is the pre-existing manual "Merge N files"
bulk action — its sources stay visible at their original top-level spot
too (`mergeOwnerId` without `mergeSourceHidden`), rendered a second time
nested under Sources. A nested source row has no ✕/middle-click delete of
its own (`renderNode`'s delete-button/`auxclick` handlers gate on
`opts.mergeSourceColor`) — only deletable together with its merge; the
same source's own top-level row (the bulk-merge case) is unaffected. Each
source gets its own color swatch (the existing highlight color-picker
popup, generalized with an optional `onPick` callback so a pick can land
on `node.sources[i].color` instead of a filter node's `highlightColor`);
`computeHighlightMap` surfaces a colored source's entries into the same
gutter-marker lane filter highlights already use. A **"Show Sources"
setting** (default on, `philogg-show-sources`) is a pure display toggle —
`renderNode` skips rendering the node when it's off; the underlying data
is untouched. `fillMergedEntries` collapses the Sources node the moment a
merge completes (both merge paths) — expanded only while still loading.

Deleting a merge cascades correctly: `deleteNode` deletes its
`mergeSourceHidden` sources right along with it (they have no independent
existence), while un-orphaning (clearing `mergeOwnerId`) a bulk-merge-
visible survivor instead of leaving it tagged toward a dead id. Undoing
that delete restores the whole thing, hidden sources included —
`snapshotSubtree`/`restoreSubtree` gained `hiddenSourceSnapshots`/
`hiddenSourceIds` (root-level siblings aren't reachable via the normal
`children` recursion) and now also carry a file node's own `mergeOwnerId`/
`mergeSourceHidden` tags, which neither function had ever needed before.

Session-only by design (no IndexedDB persistence — a session-cache
restore of a merged file already reparses from scratch and loses this
kind of state, same as the pre-existing "Merged-file gotcha" below) but
threaded through `snapshotSubtree`/`restoreSubtree`'s file branch, so an
in-session delete+undo doesn't silently drop it. Known, accepted
limitation: entries are shared by reference across merges, so re-merging
an already-merged file's entries overwrites `sourceId` on the same
objects, making the earlier merge's own Sources coloring stale.

**Create-first loading: the merge exists before any source is even read.**
Every "load files straight into a merge" path (`loadMetaFormatText`'s
per-grammar streams, `loadFileDescriptors`' drag-drop-then-"Merge" confirm,
and the folder-watch minimap's "Merge (full)"/"Merge (window)" actions)
calls `createMergeShell` first, then loads each source into a
`mergeOwnerId`/`mergeSourceHidden`-tagged node (pre-tagged before its own
read starts, reusing `addFile`/`loadOneFileIntoTree`'s existing
`existingNode` parameter, where a placeholder exists to pre-tag through —
folder-watch has none, so it tags right after that source's own load
finishes instead, a brief accepted visibility gap). Only once every source
has finished does `fillMergedEntries` run. A loading create-first merge's
own row shows a single continuous progress bar (`node.loadSources`
`{id,weight}` pairs + `updateMergeLoadFraction`, reusing the exact plain
`.tree-load-fill` markup an ordinary file's own bar already uses),
weighted by each source's real size (byte count where known, an equal
fallback otherwise) rather than a plain per-source average, with a small
fixed reservation (`MERGE_STEP_BAR_FRACTION`) for the merge-copy step —
**regardless of "Show Sources"** — each nested source's own row still
carries its own ordinary bar too when Sources is shown, alongside it, not
instead of it. A `metaFormatSplitInProgress` guard keeps a meta-format
split's own per-stream loop from letting one stream briefly steal
`state.activeId` (and a real, full render) from the merge row while it
loads — mirroring the pre-existing `sessionRestoreInProgress` guard on the
same two functions. See `docs/persistence-and-sync.md` → "File merge
follows the same load-progress pattern" for the full mechanism, and →
"File loading & progress" for `detectMaxTableScrollPx` (a real browser
height-limit fix, still applied at every real render — see the "Known
gotchas" entry for it) — the log view's scrollbar itself goes back to
staying stale during a load, same as the rest of the view, now that the
narrowly-scoped live-tracking exception that used to sit here
(`updateLiveGrowingTotal`) has been removed again.
