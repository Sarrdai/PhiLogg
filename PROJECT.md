# PhiLogg — Project Documentation

**Read this file first.** It's the entry point for understanding what PhiLogg is, how it's built, and why it's built that way, before touching `philogg.html`. For a human-facing overview (what it does, screenshots, how to use it, license) see `README.md` instead — keep that file in sync with user-visible changes; this file stays the architecture/changelog reference.

## What this is

PhiLogg is a **local, single-file, offline-capable log viewer** built to replace LogViewPlus for a specific pipe-delimited log format. It's one self-contained `.html` file — no build step, no external dependencies, no CDN calls, no server. Opening the file in a browser is the entire deployment story. That constraint is deliberate and has shaped almost every architectural choice below — keep it intact unless the person explicitly asks to relax it.

- **File**: `philogg.html` (~45,250 lines: inline `<style>`, inline `<script>`, vanilla JS, no framework, no build tooling)
- **Runs from**: `file://` directly, or any static host — must keep working both ways
- **Dependencies**: none. Not React, not a charting library, not a font CDN. Custom SVG charting was built from scratch specifically to avoid a dependency.

## Release builds

Nothing is built to *run* PhiLogg — the tracked `philogg.html` is the app, and opening it works with no step in between.

**Versioning** — `philogg.html` carries two constants: `PHILOGG_VERSION` is a real, *committed* semver (e.g. `"0.1.0"`), correct even in a plain local checkout with no build step; `PHILOGG_BUILD` is the short commit hash, stamped only at release-build time (see below); a beta build's `PHILOGG_VERSION` is stamped to e.g. `0.2.0-beta.3` the same way, so the beta label is part of the shown version, and stays the literal `"dev"` otherwise. `PHILOGG_VERSION` is shown next to the product name (`.brand-version`, no `"v"` prefix); `PHILOGG_BUILD` is shown only in Settings → License, alongside the version, for bug reports that need to pin an exact commit. `PHILOGG_VERSION`'s line carries a **trailing** `// x-release-please-version` marker comment (`const PHILOGG_VERSION = "0.1.0"; // x-release-please-version`) — release-please's "generic" extra-file updater only replaces the value on the marker's *own* line, so the marker must sit on the same line as the value, not above it (learned the hard way: an above-the-line marker silently rewrites nothing).

**Gotcha — the manifest's `"0.0.0"` is a hardcoded "never released" sentinel, not a version.** `.release-please-manifest.json` intentionally sits at `"0.0.0"` (no GitHub Release/tag for this repo has ever actually stuck — an earlier `v0.2.0` and, briefly, a `v1.0.0` were both cut by mistake and cleaned up by hand). release-please checks for that *exact literal string* and, when it matches, skips its normal conventional-commit bump math entirely for the next release, defaulting straight to `1.0.0` regardless of `bump-minor-pre-major` or anything in the commit history — this bit us for real once (googleapis/release-please#2087). The fix is `release-please-config.json`'s `"initial-version": "0.1.0"` on the `.` package, which is exactly what a first release computes to instead. Never "fix" this by changing the manifest away from `"0.0.0"` to some other placeholder (e.g. `"0.0.1"`) to dodge the sentinel — `initial-version` is the supported mechanism; once a real release exists, the manifest starts reflecting the actual last-released version and this whole gotcha stops applying.

**Release trigger — explicit, two-stage** (`.github/workflows/release-please.yml`), by design not automatic on every feature-PR merge:

1. **`propose-release`** — `workflow_dispatch` only (Actions tab → "Release Please" → Run workflow). Runs `release-please-action` with `skip-github-release: true`: it looks at Conventional Commits (`feat:` → MINOR, `fix:` → PATCH; see `CLAUDE.md`'s commit-convention rule) since the last release and opens/refreshes a standing release PR for review — it never tags or publishes anything by itself, so running this is harmless. `bump-minor-pre-major: true` keeps a *breaking-change* commit's bump at MINOR instead of MAJOR while major stays `0` (an ordinary `feat:` already bumps MINOR by default, pre-1.0 or not); short of an explicit `Release-As:` footer or a `!`/`BREAKING CHANGE:` marker (`CLAUDE.md` reserves both for an explicitly-requested major bump), the only other way to `1.0.0` is the manifest's `"0.0.0"`-sentinel gotcha above — watch for it once, not routinely.
2. **`cut-release`** — triggered on push to `main`, but `skip-github-pull-request: true` means it never opens/updates a PR here — it only checks whether the just-pushed commit is the release PR's own merge, and if so tags it and publishes a GitHub Release. An ordinary feature-PR merge is a fast no-op for this job.
3. **`build` → `publish`** — gated on `cut-release`'s `release_created` output, so they only ever run on the rare push that actually cut a release. `build` is the reusable `.github/workflows/build-release-assets.yml` (HTML, Windows installer, Windows portable, as workflow artifacts); `publish` downloads them and attaches them to that same GitHub Release. macOS and Linux have no CI build.

`release-please-config.json`'s `extra-files` keeps `desktop/package.json`, `desktop/src-tauri/tauri.conf.json` and `desktop/src-tauri/Cargo.toml` in sync with `PHILOGG_VERSION` on every cut release. `"skip-changelog": true` keeps release-please from ever touching `CHANGELOG.md` (it corrupted the hand-written file with an auto-generated block the one time this wasn't set — see `CHANGELOG.md`'s own dated entry); release notes live on the GitHub Release itself instead.

**Beta releases** (`.github/workflows/beta-release.yml`) — the only way to hand testers a build between stable releases; `workflow_dispatch`, refuses any branch but `main`. `scripts/release-version.js next-beta` computes the version: the next stable version by release-please's own rule (from the manifest's version and the commits since its `v<version>` tag: `feat`/breaking → MINOR below `1.0.0`, else PATCH) plus `-beta.N`, N = highest existing `v<next>-beta.*` tag + 1 (so betas restart at `.1` for each target version and a deleted one never comes back). The same shared build runs with that version, then `publish` creates tag + GitHub **pre-release** in one step (`gh release create --prerelease --generate-notes`, only after every variant built). Nothing is committed and the manifest is untouched, so release-please ignores beta tags — in manifest mode it finds the last release by the manifest's version. `concurrency: beta-release` keeps two runs from picking the same N.

Every release build — stable or beta — applies the same release-only transformations to a throwaway copy, never committed back:

- **Version stamp** — `scripts/release-version.js stamp <version> <short-sha>` writes the release version into `philogg.html`'s `PHILOGG_VERSION` and the three desktop version fields (for a stable release a no-op, release-please already committed it; for a beta it is the only place `-beta.N` appears) and the commit's short SHA into `PHILOGG_BUILD` (`"dev"` in the repo). Asset names carry the version: `philogg-<version>.html`, `PhiLogg-<version>.exe`, `PhiLogg-<version>_portable.zip`.
- **Comment strip** — `scripts/strip-comments.js` removes every HTML, CSS and JS comment. The repo copy keeps all of them (they're most of what makes a 20k-line single file navigable); a published build carries none, which is roughly 40% of the file. It is a comment stripper, not a minifier: whitespace, names and line structure are untouched, so a stack trace from a release build still lands on a recognizable line. Dependency-free and hand-written rather than a regex, because the file is full of strings containing `//` (the `philogg://` scheme, URLs) and of regex literals containing quotes and slashes — see the file's own header comment. Its correctness check is the regression suite: `PHILOGG_HTML=<stripped copy> npm test` from `tests/` must produce the same pass count as an ordinary run, and GROUP 146 pins the scanner's own edge cases.

A local `npm run build` in `desktop/` does neither transformation.

**License files in every build** — the page carries its own terms (Settings → License shows `LICENSE.md` verbatim — a regression test keeps the two identical), and every build ships `LICENSE.md` beside it: the HTML artifact/release asset, the portable zip, and the Tauri bundles (`bundle.resources`, plus `bundle.licenseFile` as the Windows installer's license page). Desktop builds also carry `desktop/THIRD_PARTY_NOTICES.md` (every bundled Rust crate's license, generated by cargo-about and regenerated by the release build before bundling — see `desktop/README.md` → "License and third-party notices").

## The log formats it parses

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
it for the rest of its session-cache lifetime. Formats are defined in one
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
`formatLevelDefs(formatId)`). It may pick from the five names that own a
theme color (`ALL_LEVELS` = `ERROR/WARN/INFO/DEBUG/TRACE`) *and* add
arbitrary **custom names** of its own (`NOTICE`, `FATAL`, `VERBOSE`, …);
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
order, for files using that format; a format without the field (every
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
(`entryTimeText`, `formatTsFor`, `allRootsPlainText`). It is reached from
the text viewer's "Filter lines" button (see `docs/ui-and-views.md` →
"Inline text/image viewer"), never from filename resolution; no native
parse (`nativeFormatSpec` → null), no merging. Its rows keep indentation and
the viewer's JSON/XML highlighting, and it nests under its viewer entry in
the tree (`node.viewerSource`) — see the same doc section.

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
"The log formats it parses" above) already applies per-target the same as
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

## Core data model

Everything lives in one global `state` object (search `const state = {`). The two things to understand first:

### 1. The node tree

`state.nodes` is a flat `{id -> node}` map; `state.rootIds` lists the file (root) node ids in load order. Every node is either:

- **`type: "file"`** — holds the actual parsed `entries` array. Root-level only (`parentId: null`). Has a `merged: true` flag if it was created by the file-merge feature (see below); in that case its `entries` is the chronologically-sorted union of its source files' entry *objects* (reused by reference, not cloned). `mergeFiles` skips the chunked copy + sort when the sources' time ranges are pairwise disjoint (`fileEntryTimeRange`) — a plain `concat()` in chronological source order is already sorted in that case; any overlap, including an exact shared boundary timestamp, still uses the full copy+sort path. `probeFileTimeRange(file, formatId)` reads only a small head chunk and a growing tail chunk to learn a file's first/last timestamp without loading it in full (respects custom formats via `getCompiledFormat`) — now wired into the folder-watch minimap (`docs/persistence-and-sync.md` → "Folder-watch minimap for picking which files to load/merge"), which shows per-file time coverage across a watched folder before any file is opened, folder-only (a ZIP source's entries can't be cheaply probed the same way).
- **`type: "filter"`** — has a `parentId` (its place in the tree), a `children` array, a `name` (display label), and a `filterType` that determines what `getEntries(node)` computes. See the filter type table below.

Filters chain: a filter's result is always computed from its parent's result (`getEntries(node.parentId)`), then narrowed/transformed. This is why the tree visually nests — each indent level is another transformation of the level above.

**`and`/`or`/`link` are NOT a special case any more.** Each carries baked data — `node.baked` (an array of 2+ conditions) for `and`/`or`, `node.bakedA`/`node.bakedB` for `link` — a **flat, self-contained copy of each side's own single condition** (`filterType`, `value`, and whichever type-specific fields apply — see `bakeNodeCondition`), baked once at creation (or Unpack, below) and never looked up against `state.nodes[...]` again. Its INPUT entries come from the exact same place as any other filter type — `getEntries(node.parentId)` — and `bakedA`/`bakedB` are then evaluated as predicates over that pool (`getEntriesFromBaked`, a standalone evaluator mirroring `getEntriesUncached`'s own per-type branches so behavior stays byte-identical to a real standalone filter of that type). `and` = all N predicates true, `or` = any true (`combineBakedEntries`); a `link` node is **not** accepted as an `and`/`or` side (see `canBeCombined`) — its result is synthetic pair entries whose ids never appear in a plain entry pool, so the intersection would always be empty and the union type-mixed. Chaining onto a link still goes through `createLinkNode`, whose evaluator understands pair entries. `link` builds its reference-side/target-side entry sets the same way and runs the existing nearest-occurrence pairing machinery over them. On creation (the toolbar's multi-mode AND/OR/Link… actions, or the multi-hop link dialog), the new node is still always inserted as a fresh top-level child of the two inputs' shared root file (same placement `syncBookmarksFilterNode`/`createSelectionFilterNode` already use) — from there it can be moved anywhere by the user like any other node, which just re-chains its input pool via a new `parentId`, same as any other filter; `bakedA`/`bakedB` are never touched by a move. **Consequence**: cache invalidation is uniform across every filter type now — a plain parentId-chain walk (`invalidateCachesForRoots`) or the global sweep (`invalidateAllCaches`) for structural changes, no special "these two types have hidden dependencies" case. **Consequence 2**: `and`/`or`/`link` nodes are Ctrl+C/Ctrl+X/drag-and-drop-able exactly like any other filter, with **no cycle guard needed for an ordinary move/reparent** (nothing new there) — and no cycle guard needed against `bakedA`/`bakedB` either, since they're plain data, not node-id references; the only recursion is into a nested baked `link` condition (a chained/multi-hop tuple — see `docs/filters.md`), bounded by ordinary data-structure depth. `cloneSubtree()`/`snapshotSubtree()`/`restoreSubtree()` deep-copy `bakedA`/`bakedB` like any other field — no special cross-file handling needed, since there's no id inside to keep valid. **Critical property, explicitly tested**: baking captures ONLY the clicked node's own single condition, never its ancestors — combining a filter A that happens to sit nested under some unrelated filter C must not implicitly inherit C's restriction.

**Unpack** (context-menu action on any `and`/`or`/`link` node): **purely additive**. Materializes the baked conditions (one node per condition) into real, visible, brand-new sibling filter nodes next to the node's own position, and stops there — no fresh combiner is created and nothing is deleted. The original node keeps its id, its `bakedA`/`bakedB` and its result: its condition already works, so there is nothing to replace. Unpack exists purely to make the two building blocks visible and editable again, since there's no dedicated inline-editing UI for a combiner's two sides (see FEATURE_BACKLOG.md #58). Offered only for a node that actually carries both baked sides.

**`context` looks similar to `link` (a second, non-parent source of entries) but deliberately isn't built the same way.** Its "other side" is always the node's own root file (`getRootFileId(node.parentId)`), never another arbitrary node, so it needs no baked condition, no cycle guard, and nothing special in the invalidation reasoning above — it's a plain single-parent filter as far as move/copy/cache invalidation are concerned. See "Time context filter" below.

### 2. Filter types

| `filterType` | Needs | What `getEntries` does |
|---|---|---|
| `text` | `value: string`, optional `caseSensitive: boolean`, optional `columns: string[]`, optional `isRegex: boolean`, optional `wholeWord: boolean` | substring match against `entry.raw` (or, if `columns` is non-empty, against just those columns' text — see "Text filter: case-sensitive + target column"); case-insensitive unless `caseSensitive` is set. With `wholeWord` set, an occurrence only counts when it isn't glued to a word character on either side (see `docs/filters.md` → "Text filter: match whole word") — literal matches only, which is why the popup greys that toggle out for regex/wildcard input. With `isRegex` set, `value` is compiled as a real `RegExp` instead (see `docs/filters.md` → "Regex filter type") — case-sensitivity/columns still apply, an invalid pattern matches nothing |
| `after` / `before` | `value: number (ts)` | `entry.ts >= / <= value` |
| `timerange` | `value: { from, to }` (either bound possibly `null`) | unified time-range filter — `(from == null \|\| ts >= from) && (to == null \|\| ts <= to)` |
| `extract` | `value: pattern string` | compiles the pattern (see below) and keeps entries whose `message` matches; **also** drives the extraction table view when this node is active |
| `idset` | `value: string[]` (entry ids) | `Set` membership match — an explicit, pre-computed entry set rather than a rule (see `docs/filters.md` → "Entry-set filter") |
| `and` / `or` | `baked: [cond, cond, …]` (2+ flat baked condition snapshots — see "Core data model" above) | set intersection / union (by `entry.id`) of `getEntriesFromBaked(c, ...)` for every `c` in `baked`, all evaluated over `getEntries(node.parentId)`; `or` re-sorts by `ts` after merging |
| `link` | `bakedA` (reference's baked condition), `bakedB` (target's baked condition), `linkDirection: "before"\|"after"`, `linkN: number`, `linkOrderEnforced: boolean`, `linkExclusive: boolean`, optional `linkDt: {op, ms}` (tuple-span condition), optional `linkKey: {column}\|{pattern}` (correlation key) | nearest-neighbor pairing (see below) over the two baked conditions' matches within `getEntries(node.parentId)`; result is an array of synthetic **pair entries**, not normal log entries |
| `gap` | `value: { ms, per }` (`per`: column key or `null`) | keeps entries whose distance to the previous entry of the parent's result (or, with `per`, of the same column value) is `>= ms` — see `docs/filters.md` → "Gap filter" |
| `context` | `contextBefore: number (ms)`, `contextAfter: number (ms)` | windowing around reference entries (see below); result is real entries from the root file, not synthetic ones |

`createFilterNode(parentId, filterType, value, inverted = false, ignoredColumns = null, caseSensitive = false, columns = null, isRegex = false, wholeWord = false)` builds `text`/`after`/`before`/`extract` nodes (the last four args are `text`-only, `ignoredColumns` is `extract`-only). `createAndOrNode` and `createLinkNode` build the two-reference types, `createContextNode` builds `context` nodes.

### 2a. Inversion (NOT)

Any filter node can carry an `inverted: boolean` flag, orthogonal to `filterType` — it's a post-processing step in `getEntries()`, not a separate type. Once the node's normal `result` is computed, an inverted node replaces it with `parentEntries` minus `result` (set difference by `entry.id`), so "NOT" always reads as "everything my parent had that I would otherwise have kept."

This is deliberately **generic** rather than reimplemented per type — it works unchanged for `text`, `after`, `before`, `and`, `or` — but it's **withheld for three types** where the generic definition breaks down:
- **`link`**: results are synthetic pair entries (`buildPairEntry`) whose ids never match `parentEntries`' ids, so the set difference would just be all of `parentEntries` — not "unmatched refs," just wrong.
- **`extract`**: an inverted extraction filter would keep only rows that *don't* match the pattern — i.e. exactly the rows with nothing to extract — so the extraction table would always render empty.
- **`context`**: every reference entry's own window always contains itself, so `result` is always a superset of `parentEntries` — a parent-relative difference would always be empty.

Both restrictions are enforced in the same place they'd otherwise be violated: the tree context menu omits "Invert (NOT)" for `link`/`extract`/`context` nodes, and the filter popup disables/unchecks its NOT checkbox the moment the input is detected as an extraction pattern (`updateInvertAvailability()`, on the same `input` listener as the live-match preview). `getEntries()` also guards `filterType !== "link" && filterType !== "context"` directly, so the invariant holds even if `inverted` were ever set some other way.

Two entry points toggle it: the **NOT checkbox** in the Ctrl+F filter popup (sets it at creation time, `text` filters only — `after`/`before` created via right-click-a-row don't offer it at creation) and **right-click → "Invert (NOT)" / "Remove NOT"** on any existing eligible filter node (toggles it after the fact, for any type including `after`/`before`/`and`/`or`). Both paths converge on the same flag and the same `getEntries()` logic.

Toggling `inverted` is a **structural-equivalent change** for caching purposes even though it touches neither `parentId` nor `children`: it changes the node's own result, which every descendant's cached result transitively depends on. It goes through `invalidateAllCaches()` — the same global sweep already used for move/delete — rather than a targeted single-node cache clear, for the same reason `and`/`or`/`link` need the global sweep (§1): a narrow invalidation would have to also chase the affected node's entire subtree, which the sweep already does for free. `cloneSubtree()` carries `inverted` onto the clone like every other field, so copy/cut/paste and drag-and-drop preserve it.

In the tree, an inverted node's label gets a `"¬ "` prefix and its type tag turns red (`.tree-row.inverted .tree-type-tag`) — visible without opening the node.

**Mute interaction** (`muted: true`, see `docs/filters.md` → "Muting a filter node"): `getEntries` returns the parent's result for a muted node before any inversion/caching, so NOT is ignored (but kept) while muted.

### 3. Memoization

Every filter node caches its computed result on `node._cache`, since a filter's own type/value never change after creation — only *structural* changes (move, delete) can invalidate a result, so `getEntries()` is a cheap cache hit on every render except right after such a change. This is what makes the tree, level-quick-filter counts, and breadcrumb cheap to recompute on every render without visibly recursing the whole chain each time.

Two companions ride along with `_cache` (cleared in the exact same places, nowhere else):

- **`node._levelCounts`** (`getLevelCounts()`): per-level entry counts for the node's own result, used by `renderLevelBar()` on every `render()`. Previously an O(n) `levelBucket` pass over the active view ran on every render — including when merely flipping back and forth between two already-computed filters.
- **`file._agg`** (`updateFileAggregate`/`fileAggregate`): per-file aggregates — level counts per raw level + format (bucketed when read, so a format's level edit needs no recount), the entry indices per level, whether the ts are sorted, the ts range, and the first longest message / message line. The load paths catch it up after every adopted batch, so the first render reads it instead of making full passes: `getLevelCounts` for a file node, the minimap (bucket boundaries by binary search over sorted ts in `minimapBucketBounds`, the whole-file overlay from the per-level index lists), `updateMinimapFullRange` and `computeMaxMessageWidth` (via `aggregateForEntries`, for a view that IS a file's whole entry array). Every reader catches up too, so tail appends fold in incrementally. Self-validating for a replaced or shrunk array (rotation, a rolled-back parse); `invalidateFileAggregate` covers the rest — `invalidateOrderIndexMap` (in-place reorders: merges, meta-format streams) and shifted ts (clock offset). GROUP 269.
- **`file._orderIndexMap`** (`buildOrderIndexMap()`): a file's `entry.id -> log order index` Map, used by the link filter's same-timestamp tie-break, by `countContext`, and by `getVisibleEntries()` whenever "pin bookmarks into the Filtered view" is on — which made it an O(file size) Map build on *every* render. Unlike `_cache`/`_levelCounts` it is **self-validating** rather than invalidated from call sites: it re-derives whenever `file.entries` is a different array object (rotation) or a different length (tail append, merge copy). The one mutation that key can't see — `mergeFiles`' final in-place sort, same array and same length — drops it explicitly via `invalidateOrderIndexMap()`.

- **Scoped invalidation for tail ticks** (`invalidateCachesForRoots(changedRootIds)`): `onTailChange` used to call the global `invalidateAllCaches()` every 1.5s poll, after which the next render recomputed *every* filter chain in the tree (`renderTree` reads every node's count) — including filters under files that hadn't changed at all. The scoped variant recursively marks a node dirty iff its root file changed, or it transitively depends on a dirty node via its `parentId` chain — uniformly for every filter type now, `and`/`or`/`link` included (their `bakedA`/`bakedB` are flat data, not a second dependency to walk — see "Core data model" above); a pending-guard treats hypothetical cycles conservatively as dirty. Structural user actions (move/invert/edit) still use the global sweep — rare, and trivially correct. For a pure append (`appendedFrom`), a per-entry filter whose whole chain is per-entry keeps its old result as `node._tailBase` and is extended over only the new entries on its next `getEntries()` (`extendCachedEntries` — see `docs/persistence-and-sync.md` → "Tailing").
- **`onTailChange` only calls `render()` for the root behind the active view.** A background-tailed root (one that keeps growing but isn't currently displayed) used to still trigger a full `render()` on every append — via `renderTree()`'s innerHTML wipe-and-rebuild, that reset any unrelated in-progress tree UI state (a row rename, a click) on every ~1.5s poll for as long as any tailed file kept growing anywhere in the sidebar, even off-screen. It now cache-invalidates and persists as before, but for a root that isn't `getRootFileId(state.activeId)` it just calls `updateLoadRowProgress(rootId)` (the same cheap per-row count refresh load ticks already used) instead of `render()`.
- **`deleteNode()` invalidates nothing at all**, not even scoped: a surviving node's cached result depends only on its own `parentId` chain (same premise the scoped tail-tick variant above relies on), and deleting a node/subtree never changes any *surviving* node's `parentId` — the removed nodes are just dropped from `state.nodes`, nothing is reparented. The global sweep here used to force every remaining node's count badge to recompute from scratch on the very next render, which was the visible ~1s stall on delete that switching the active filter never had (switching touches no cache at all). `move`/`invert`/edit are unaffected by this and still use the global sweep.


## Sample data and screenshots

**The one way** to produce example logs and screenshots — for tests, the
README's `docs/screenshots/`, a product homepage, guides or bug
reproductions — is the log simulator in `tools/log-sim/`:

1. **Data**: `node tools/log-sim/cli.js -f <format> -s <scenarios> -n <entries> -o <dir>/`
   (`--list` names every format and scenario with the feature it feeds).
   Deterministic per `--seed`, so a screenshot can be regenerated later with
   identical content. Non-builtin formats get their `*.logformat.json`
   written alongside.
2. **Screenshot**: `NODE_PATH="$(npm root -g)" node tools/log-sim/screenshot.js
   --out <png> [--theme dark] [--size 1440x900] [--eval "<js>"] <dir>/*` —
   headless Chromium with the real `philogg.html`, the files and their
   formats loaded; `--eval` builds the scene through the app's own
   functions and buttons (filters, tabs, plot settings — recipes in
   `tools/log-sim/README.md`).
3. **Record the command** (seed, options, `--eval`) next to where the
   screenshot is used or in the session's changelog entry, so the next
   update reproduces it instead of reinventing it. The README's own
   screenshots are the reference example: `docs/screenshots/generate.sh`
   (one data set, `scenes/common.js` builds the filter tree, one
   `scenes/NN-name.js` per picture) regenerates all of them —
   `docs/screenshots/generate.sh plot` just the matching ones. A new README
   picture is a new scene file there.

**Missing content is a simulator gap, not a reason to hand-write data.**
If a case can't be produced — a new feature's log shape, a new format, a
message pattern — extend `tools/log-sim/core.js` first (a scenario, or a
format with its `exportFormat`) and cover it in GROUP 300, then generate.
Log lines written by hand, by a one-off script or pasted from chat output
are not the way. Likewise, a screenshot setup the helper can't express gets
a new `screenshot.js` option rather than a private Playwright script.
`tools/perf/gen-log.js` stays the one exception, fixed for the recorded
performance baselines.

## Where everything else lives

The sections below used to live directly in this file. They've moved to `docs/*.md` (grouped by topic, current-state description only — no session dates, no "pass 1 then pass 2" narrative) and to `CHANGELOG.md` (the full chronological history, newest-first). This section is the index: enough orientation per topic to know where to look, not the material itself.

### `docs/filters.md`
Filter types, the value-extraction pattern language (placeholders, value conditions like `[*:float>=10]`), the filter popup (scope hint, Text/Regex switch, column chips, live result summary), text-filter case/column restriction and match highlighting (both kinds: the active filter path's, and each highlight rule's own colour underlining what it matched), the link filter (nearest-neighbor pairing, chained/multi-hop tuples, same-timestamp tie-break), the self-contained `and`/`or`/`link` input model and Unpack, time filters (`"timerange"`, minimap drag-select), the timeline minimap, time/count context filters, and Table/Plot's upward-lookup inheritance rule (`findExtractionAncestor`/`nodeIsExtractionView` — a narrowing/context descendant of an extraction-pattern node now also shows Table/Plot, stopping at a `link` filter). Start here for anything about `getEntries()`'s per-`filterType` branches or `#filterPopup`.

### `docs/ui-and-views.md`
Header/toolbar layout (`#viewBar`, tree connector lines, Shortcut Manager, License section), the three "active node" views (Log/Extraction/Link), the Context view (Context/Filtered split, `renderHighlightView` — internally still "Highlight"), level-bar filter-tree mode, the general scroll-anchoring mechanism (`captureViewAnchor`/`restoreViewAnchor`), the find bar (`Ctrl+G`/`F3`, incremental non-destructive search in the current view, "Add as filter"), the Patterns tab (message-pattern clustering) and the Facet panel (value distribution per column) — both one-click feeders of the filter tree over the active node's result, the multiline-message toggle, column visibility/width, row multi-select+copy, tree interactions (rename, edit, drag-drop, Alt+Arrow navigation, the temporary anchor), theming, and the app's visual language. Start here for anything about `renderMainView()`, `renderNode()`, or CSS/theme vars.

### `docs/ui-sketches.md`
Labeled box-diagram sketches (SVG) of the UI regions and their established
names: MainView layout, the Context/Filtered/Stacked split, the filter tree
row anatomy and context menus, and the Extraction view's Table/Plot tabs.
Reference for naming a UI element in conversation — points back to
`docs/ui-and-views.md` for the prose explanation of how they behave.

### `docs/ui-concept-unified-extraction.md`
Unimplemented proposal (v3): fold the separate `extract`-node Table/Plot
views into `#viewBar`'s Context/Filtered/Stacked tabs (as `Table`/`Plot`
tabs on the same node, gated on wildcard patterns) via a fixed 4-row
toolbar skeleton — minimap/statusStrip/viewBar (tabs+level+breadcrumb
only)/view-specific slot — so switching views never relocates an element.
v2 moved the six log-row toggles (Pin/Notes/Multiline/Columns/
TextMatch/HighlightMatch) out of the universal `#viewBar` into the slot
row, since they're meaningless in Table/Plot. v3 additionally unifies the
slot row's *shape* (one fixed 30px height, chip-style content for
Table's pattern preview/stats) instead of just its position — matching
`#contextToolbar`'s/`#plotToolbar`'s single-row build rather than
`#extractToolbar`'s current multi-row block. Superseded on the shape
point by `docs/ui-implementation-plan.md` (see below).

### `docs/ui-concept-mockup-brief.md`
Handoff brief for Claude Design: build a realistic, mostly-static mockup
of `docs/ui-concept-unified-extraction.md`'s unified toolbar (real dark
theme tokens, sample data, scope of what must vs. needn't be interactive
— only the Context/Filtered/Table/Plot/Stacked tab switch needs to work).

### `docs/llm-assistant-plan.md`
Implementation plan (German; phases 1–6 implemented, phase 7 — the acceptance test with LM Studio — open; current state in `docs/llm-assistant.md`): a desktop-only chat in which a local LLM (LM
Studio, loopback-only HTTP on the Rust side) operates PhiLogg through a
small tool registry (message types with per-placeholder value
distributions, filter/link creation with previews, views/plots,
bookmarks/notes) instead of reading the raw log. Covers the architecture
(agent loop and sessions owned by the main window, chat window as a thin
pull-snapshot view — avoiding the popout's sync bugs), the chat window
(owned/always-on-top, hide into the app, dock, multiple sessions), one
undo step per LLM turn, and a phased rollout. Refines backlog #70.

### `docs/llm-assistant.md`
The LLM assistant as built (desktop only): the tool registry the model
operates PhiLogg through (`LLM_TOOLS`/`runLlmTool`, result budget, value
distributions per placeholder), the Rust
bridge (`desktop/src-tauri/llm`, loopback-only HTTP/SSE), the agent loop
and sessions (one undo step per round, references that survive a restart),
the chat view `desktop/chat.html` (own window or docked) and Settings →
Assistant.

### `docs/ui-implementation-plan.md`
Step-by-step implementation plan for `docs/ui-concept-unified-extraction.md`,
refined with four precisions from discussion: match-navigator only in the
Context slot, `#extractPatternView`/`#extractStatsBar` keep their current
look (only relocate — retracts v3's compact chip-row idea), Table/Plot
tabs always visible but disabled when inapplicable, and Stacked moves
from a tab into a Settings → Behavior option (mapped onto the existing
`fhLayout` state) so the tab set becomes either
`Context|Filtered|Table|Plot` or `Stacked|Table|Plot`. Affected code
areas, step order, and open questions — **this is the plan currently
being implemented on `claude/unified-toolbar-implementation`.**

### `docs/extraction-and-plotting.md`
The extraction table's synthetic Index/t(ms) columns, virtualized rendering (extraction table + Link pair view), the Plot tab (zoom/pan/hover tooltip), value assertions, the Statistics panel (Table-only, Entry-Detail-style pin/hover), and the live pattern preview + ignored-columns mechanism. Start here for anything under `renderExtractTable()`/`renderPlotChart()`.

### `docs/persistence-and-sync.md`
Undo/redo, bookmarks (the auto-managed "Bookmarks" filter node), notes, pin-bookmarks-into-filtered-view, tailing (live file updates), file loading (progress-on-the-real-row, multi-file load, merge), deep-link loading (`?url=`), folder watch + lazy loading, filter save/load JSON, the central import (Open → "Import…"/drop, dispatching every app-internal JSON export by its `format` marker), the reusable filter library, the session cache (IndexedDB, survives a reload), per-file filter history, and session export/import. Also where gzip-compressed logs (`.gz`) are handled: detected by magic bytes, inflated via `DecompressionStream("gzip")` on the JS route of `loadOneFileIntoTree`/`loadUrlIntoTree`/`reopenLocalPathForRestore` (the desktop native parser rejects gzip, so it takes that fallback), with `.gz` looked through for format rules and folder-watch patterns, and never tailed. Start here for anything about `state.bookmarks`/`state.notes`, `node.tail`, or the `philogg-session-cache` IndexedDB database.

### `docs/export.md`
Export / Share (FEATURE_BACKLOG.md #31 + #32, one ticket-oriented concept): the "Copy for ticket" clipboard snippet (bounded, Markdown / Jira wiki / plain flavors) and the full-view attachments (`.log`/`.csv`/`.tsv`/standalone `.html` report) behind `#btnExport`/`#exportDialog`/`Ctrl+Shift+E` — what "the current view" means for export, the size caps, the shared save path (`showSaveFilePicker` or download), and the parts of the concept deliberately left out. Start here for anything about `collectExportContext`/`buildTicketSnippet`/`buildExportFileParts`.

### `docs/desktop.md`
The desktop wrapper's internal mechanism (`desktop/`, Tauri v2 + the OS webview): custom `philogg://` scheme, the injected script and the `window.philogg` bridge, native file/folder opening, frameless window and drag region, settings mirroring, tray/close-to-tray, picture-in-picture (PiP), IDE Integration (Windows-only jump from a log entry into Visual Studio/Rider), and the release workflow. `desktop/README.md` has the build/run steps, prerequisites, current run status, and the known limitations.

### `docs/performance-testing.md`
How to measure load/render performance at three levels — the Rust parser alone, the page in jsdom with a CPU profile, and the **real desktop app headless** in a cloud container (Xvfb + WebKitGTK, timings read back through the `settings.json` mirror) — with the scripts in `tools/perf/`, the traps (the release binary serves its own copy of `philogg.html`; fresh XDG dirs per run), and recorded baseline numbers.

### `docs/testing-and-limitations.md`
The jsdom-based testing approach (and its known blind spots — no real layout/paint engine), the log simulator (`tools/log-sim/`: deterministic sample logs in every format for tests, demos and screenshots), plus the running list of known limitations and intentionally-deferred items (assertions/ignored-columns keyed by index not name, no cross-file filter combination, no AND/OR over a `link` node, etc.).

### `CHANGELOG.md`
The full chronological changelog, newest-first — what shipped, in what order, and why, including the session narratives (dated, person-requested framing) that used to live inline in this file's feature sections.

## Known gotchas — check before touching related code

- **No native context menu anywhere**: a document-level `contextmenu` listener (next to the window drop listeners) calls `preventDefault()` for every target except editable fields (`input`/`textarea`/`select`/`contenteditable`). A new right-click menu still calls `preventDefault()` itself; a spot without one simply shows nothing. **No HTML5 drag-and-drop for in-app drags** either — Tauri's native drop handler swallows `dragover`/`drop` on Windows; use mouse events like the tree's `treeDrag` (see `docs/ui-and-views.md` → "Drag-and-drop").
- `stopPropagation` on any click handler that opens a popup — a click that re-renders its own clicked ancestor (or opens a popup) while still bubbling can trigger the global "click outside a popup closes it" handler against a detached/moved target. Hit at least three times (a pattern-preview span, a pattern-chip toggle, a tree-context-menu "Edit filter…"). See `docs/extraction-and-plotting.md` → "Live pattern preview" for the fullest writeup.
- **DOM identity across clicks**: `renderVisibleRows()` rebuilds nodes on every render, breaking native `dblclick` if a plain click already re-renders; `renderTree()` does too, breaking native `click` on another row during a hot loop (e.g. while a file loads) — see `docs/persistence-and-sync.md` → "File loading" ("A load tick never rebuilds `#tree` or the level bar") and `docs/testing-and-limitations.md` → "Testing approach" for the canonical bug writeup. A 2026-09-19 session added a narrow exception here (`updateLiveGrowingTotal`, calling `renderVisibleRows()` on every load tick for the active loading node's table view) to fix a stale scrollbar total on a large actively-growing merge; removed again 2026-09-21, person-requested, once it turned out to be one of two ways partial content could leak into view before a load finished (the other being a meta-format split's per-stream focus flicker, fixed the same session — see "File merge follows the same load-progress pattern" in `docs/persistence-and-sync.md`) — no exception remains, `renderVisibleRows()`/`renderTree()` are both untouched by a load tick again.
- **Browsers have a hard practical ceiling on a single element's CSS height.** Confirmed empirically (person-reported bug on an 822,697-entry merge, this session, 2026-09-19): Chromium clamps a too-tall element to exactly `33,554,428px`; Firefox instead discards the whole oversized declaration and falls back to `height:auto`, which can silently resolve to `0px` for an element (like `#tableSpacer`) whose only content is absolutely positioned and so doesn't count toward auto-sizing — `#tableSpacer` then stops contributing to `#tableBody`'s scrollable region at all (no `overflow:hidden` between them), leaving `#tableRows`' own drifting `top` offset as the only thing driving `scrollHeight`, which produces an erratic, wrong-proportioned native scrollbar. `philogg.html`'s log table fixes this with `detectMaxTableScrollPx` (a lazy, cached, per-session feature-detection of the *actual running engine's own* ceiling — not a fixed constant, since the app's primary target, Tauri on Windows/WebView2, has ~2x Firefox's headroom and a hardcoded Firefox-safe cap would needlessly halve its scroll resolution). **The probe reads the computed height with `parseFloat` and a relative tolerance, never `parseInt` + exact equality** (2026-09-24): Chromium — so WebView2 too — serializes a computed length of 1e6px or more in exponent form with 6 significant digits (`2e+07px`); `parseInt` read that as 2, every probe failed, and the cap silently fell back to 950,000px, compressing every Chromium view above ~34k rows (a 650k-row file ~19x: one wheel notch moved ~68 rows and every scroll render snapped the content — the person's "flicker") plus `computeTableSpacerContentHeight`/`tableScrollHeightScale`, converted through at every `#tableBody` scroll-position boundary (`logicalToPhysicalScrollPx`/`physicalToLogicalScrollPx`). **The scale itself must be range-based, not content-ratio-based** (2026-09-20 follow-up, person-reported: `End` needed several presses to reach the true last row, which never settled) — `tableScrollHeightScale` maps `#tableBody`'s native scrollable *range* (`scrollHeight - clientHeight`) on each side, i.e. `(cap - clientHeight) / (contentPx - clientHeight)`, not the raw content heights (`cap / contentPx`); the latter looks equivalent since `clientHeight` is tiny relative to the multi-million-px heights on each side, but it leaves the logical position computed at the true native `scrollTop` maximum short of the true logical bottom by `clientHeight * (contentPx/cap - 1)` px — several row-heights under real compression. **`#tableRows`' own true (uncompressed) rendered box can still overhang `#tableSpacer`'s capped height at the tail even with a correct scale** (2026-09-20, second follow-up, person-reported: `End` landed short of the true last row with blank space below it, `Home` afterward needed several presses to reach the top) — `#tableRows` only has its `top` offset compressed, never its own real row heights, and its `BUFFER_ROWS` lookback (`start` offset back by 10 rows, so a small scroll doesn't need a full re-render) leaves the rendered block taller than the viewport right at the tail; a plain top-anchored `top` can then push `top + true rendered height` past `#tableSpacer`'s own capped declared height, and since `#tableSpacer`/`#tableRows` are deliberately `overflow:visible` (so a long message's horizontal overflow bleeds up to `#tableBody`'s own horizontal scrollbar — `overflow:hidden` isn't an option here, CSS forces the other axis to `auto` too and breaks that), nothing stops the overhang from inflating the browser's own real `scrollHeight` past what the JS assumed — the same "no clipping ancestor" mechanism as the original bug above, just resurfacing at render-geometry granularity. `renderVisibleRows()` now bottom-anchors `top` (`Math.min(naiveTop, cap - trueRenderedLogicalHeight)`) whenever the render reaches the true last entry under compression, plus a defensive upper clamp on `start`/`centerIdx` (previously only `end` was ever clamped against `total`) so an out-of-range `scrollTop` degrades to a sane last page instead of an empty one. **The scale's physical range also has to account for `#tableRows`' own padding, not just `cap`** (2026-09-21, third follow-up — the first round where the person captured real Firefox telemetry via a pasted console script instead of another blind guess): `tableSpacer.style.height` is always set to `computeTableSpacerContentHeight(...) + TABLE_SPACER_PAD` (22px), never the bare `cap`, but the scale's `physicalRange` was computed as `cap - clientHeight` — 22px short of the real native range `scrollHeight - clientHeight`. Fixed by using `(cap + TABLE_SPACER_PAD) - clientHeight`. The captured telemetry confirmed the tail-overhang fix above genuinely holds (`scrollHeight` stayed perfectly constant across a real End/Home/End sequence), but also showed a striking, still-unexplained symptom this 22px fix does *not* fully account for by its own arithmetic: the rendered row count collapsing from ~30 rows to a single row right at the native max, followed by a large backward `scrollTop` jump — worked by hand against the telemetry's implied real entry count, the old math already predicted a healthy row count there, not a collapse to one. Left open for that round rather than claimed fixed; resolved the same day (below) via targeted instrumentation rather than more guessing. Any future virtualized list in this codebase (the extraction table, the link-pair view — both currently use the same unmitigated `count * rowHeight` approach) needs the same treatment before it can be trusted at very large counts — see `docs/persistence-and-sync.md` → "File merge follows the same load-progress pattern".
- **Scroll renders: once per frame, cheap, and never held back by a fixed interval.** Rebuilding the visible rows on every frame of a scroll can compete with the browser's own native scroll animation (2026-09-21, real Firefox telemetry: holding End on an 822,697-entry compressed merge stalled the native `scrollTop` 150,000-190,000 physical px short of the max, non-deterministically). The first fix throttled scroll renders to one per 100ms; that let the viewport scroll up to six frames past the rendered rows, which is where the blank rows on every faster scroll came from (measured in headless Chromium, 2026-09-24 — see `docs/performance-testing.md`). Current state: `makeScrollRenderer` (next to the `#tableBody`/`#highlightBody` scroll listeners) renders once per animation frame, reading the live scroll position, and only backs off after an expensive render (over `SCROLL_RENDER_BUDGET_MS`, 12ms: the next one waits `SCROLL_RENDER_BACKOFF` = 3x that render's cost, so rendering keeps at most ~1/4 of the main thread). The table's scroll render is also cheap: `renderVisibleRows(true)` — only the `#tableBody` scroll listener passes it — keeps the previous render's rows that are still in its window (`tableRowsWindow`), removes the ones that scrolled out and builds only the new ones, with a one-screen overscan on each side; a jump with no overlap (scrollbar thumb, End) falls back to the small `BUFFER_ROWS` full rebuild. Every other caller still rebuilds every row, since it's reacting to state that can change any row — so reused rows always come from a render that already reflected the current state, and the targeted in-place updates (`updateSelectedRowClass`, `applyFpVerifiedClass`, ...) act on the live DOM and stay correct on them. Measured on 650k rows in Chromium: a full rebuild ~5.5ms (4.5ms of it style/layout forced by `syncTableHeaderWidth`), a scroll render ~0.8ms. `renderHighlightVisibleRows` (the Context view) renders per frame too but still rebuilds its rows; the same reuse would apply there if it's ever needed. See `CHANGELOG.md`'s 2026-09-21 and 2026-09-24 entries.
- **Render scope rule**: `render()` (134+ call sites), `renderTree()` and `renderVisibleRows()`/`renderHighlightVisibleRows()` are unconditional full-subtree rebuilds — no diffing, no partial-update mode (the one exception is the scroll listener's `renderVisibleRows(true)` row reuse, see the scroll-render gotcha above; don't pass it from anywhere else). Before adding a new call to any of them, check whether a targeted update already covers the case: `updateSelectedRowClass()` (row selection), `updateLoadRowProgress()` (one tree row's own count/progress, used by load ticks AND by `onTailChange` for a tailed root that isn't behind the active view), `updateMinimapRenderedRange()`/`updateMinimapSelectionMarkers()` (minimap sub-parts). A full rebuild is only justified when tree/row *structure* actually changed, not just one node's/row's own data. This isn't a mandate to build a general diffing layer (out of scope for a single-file, no-build-tooling app) — it's a per-call-site check: does this actually need `render()`, or can it write directly to the one row/node that changed?
- No `crypto.subtle` — the sync FNV-1a fingerprint (`fingerprintText()`) used for session export/import and file-filter-history matching is intentional, not a placeholder; see `docs/persistence-and-sync.md`.
- **Any new filter-node field must be threaded through all persistence carriers**: `cloneSubtree`, `snapshotSubtree`/`restoreSubtree` (undo/redo), `serializeFilterBranch`/`importFilterJson` (save/load JSON), `serializeFilterTreeForCache`/`materializeCachedFilters` (session cache). This applies to **file**-node fields too, not just filter fields — `node.formatId` was dropped by the undo snapshot for exactly this reason; a file-node field also needs `persistFileNode`/`restoreSessionFromCache` (session cache, separate from the filter-tree carriers above) alongside `snapshotSubtree`/`restoreSubtree`. `node.merged`, `node.folderId` and `node.partial` (the folder-watch minimap's windowed/partial load, `docs/persistence-and-sync.md`) are the current examples of file-node fields threaded through both.
- **`node.value` is immutable by convention.** `cloneSubtree`, `snapshotSubtree` and `captureNodeFields` all copy `value` **by reference** — harmless for the primitive shapes (`text`, `after`, `before`), aliasing for the object/array ones (`timerange`, `idset`, `level`). Every write must replace `node.value` wholesale (`node.value = node.value.concat(added)`), never mutate the existing object/array in place; otherwise a copy/pasted duplicate of the node grows with it and the undo stack's "before" capture is rewritten after the fact.
- **`restoreSubtree` rebuilds nodes as new objects** under the original ids. Anything holding a node *object* across an undo (tests especially) is left with a detached husk — re-read from `state.nodes[id]`. See "Core data model" above for the node-tree shape these all serialize, and `docs/filters.md`/`docs/persistence-and-sync.md` for examples of features that had to thread a new field through all four.
