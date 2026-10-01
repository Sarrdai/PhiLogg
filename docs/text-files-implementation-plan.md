# Plan: text files as one node, editor as Context view

Implements `docs/ui-concept-text-files.md` (decided 2026-10-01; mockup
https://claude.ai/artifact/DxE8868LJws1pQkKRyhRwd). Delete this file once
every step has landed and the docs describe the result.

## Goal and decisions

A `.txt`/`.json`/`.xml` file loads through every entry point as ONE file
node pinned to the Plain text format (`PLAINTEXT_FORMAT_ID`). No inline
text viewer, no "Filter lines", no `viewerSource` nesting. For such a file
the Context tab shows an editor (folding, JSON/XML highlighting, free text
selection), Filtered shows a text-mode table with identical line geometry.
All rules are in the concept's "Regeln" table; they are the spec.

Decided defaults: Pretty is the default layout for valid JSON (invalid
JSON silently loads raw); Patterns/Table/Plot stay visible; the minimap
stays in Context; Ctrl+G works in the editor; no virtualization of the
editor; no migration of saved text viewers / "(pretty)" text versions.

Non-goals: images (inline image viewer stays as is), XML pretty print,
folder auto-open rules for text files (stay log-only), merging plain-text
files (stays refused).

## Current state

- Entry points that open a text file as a viewer today:
  `loadFileDescriptorsImpl` (loose files, desktop local files — the
  `viewableDescs` branch), `loadFolderFile` (`viewKind` branch),
  `openZipEntry` → `openZipEntryExternally` (`isLogZipEntry` is false for
  them). All call `openInlineViewer(name, bytes, kind, owner)`.
- `openInlineViewerAsTextLog` builds today's nested copy via
  `addFile(name, text, undefined, PLAINTEXT_FORMAT_ID, node)` with
  `node.textSyntax`/`node.viewerSource`; nesting helpers:
  `viewerTextLogIds`, `isNestedUnderViewer`, `closeInlineViewerEntry`,
  `buildInlineViewerEntryRow`, `renderTree`/`flattenTreeIds` skips.
- Plain-text format behaviour (line number as ts, no level badge, Line
  column, `plainTextSyntaxOf`, `msgColClass`, `allRootsPlainText`):
  `PROJECT.md` → "Plain text: fmt-plaintext", `docs/ui-and-views.md` →
  "Filter lines".
- Editor pieces to reuse: `renderInlineTextViewer`, `highlightJsonText`/
  `highlightXmlText`, `jsonTokenRanges`/`xmlTokenRanges`,
  `findJsonFoldRanges`/`findXmlFoldRanges`, `buildFoldTree`,
  `renderFoldNode`, `prettyPrintedJsonOrNull`, CSS `.itv-line`/`.itv-fold*`
  and the `::before` line-number counter, `state.wrapTextView`.
- Context view: `renderHighlightView`, `#highlightWrap`, `showFhTab`,
  `applyFhView`, `applyActivationView`, `revealInHighlightView`,
  `captureViewAnchor`/`restoreViewAnchor`, nav history waypoints.
- Row geometry: `ROW_HEIGHT` (28, scaled by `logTextScale`), precedent for
  per-view heights: `EXTRACT_ROW_HEIGHT`, `LINK_PAIR_ROW_HEIGHT`.
- Gotchas: CLAUDE.md "Known gotchas" (DOM identity / dblclick, node.value
  immutability, persistence carriers for new node fields).

## Steps

### Step 0 — Simulator: JSON and XML documents
- Change: `tools/log-sim/core.js` gets a document-style output for `.json`
  (one JSON document, written minified so Pretty/Raw differ) and `.xml`,
  built from the existing scenarios' data (e.g. the `embedded` payloads);
  `--list` and README updated; GROUP 300 extended.
- Done when: `node tools/log-sim/cli.js -f <json-doc> -o x.json` writes a
  valid single JSON document; same for XML.

### Step 1 — Load text files as plain-text file nodes
- Change: the three entry points above load `kind === "text"` files via
  the normal file-node path with the format pinned to
  `PLAINTEXT_FORMAT_ID` and `node.textSyntax` set from the extension.
  New file-node field `node.textLayout` (`"pretty"`/`"raw"`, JSON only;
  default pretty when `prettyPrintedJsonOrNull` succeeds) decides the
  parsed text; thread it through every persistence carrier that already
  carries `textSyntax` (snapshot/restore, `persistFileNode` record, session
  restore). A function to switch the layout re-parses the node in place
  (same id, filter children kept and re-evaluated). Folder tail/append on a
  pretty JSON file reloads the whole file instead of appending lines.
  Remove `openInlineViewerAsTextLog`, `#itvFilterLinesBtn`, the Ctrl+F
  viewer branch, `viewerSource` nesting and the text half of the inline
  viewer (keep the image viewer and the editor helper functions listed
  above — step 3 reuses them). Saved text-viewer records are ignored on
  restore. Silent cursor preload / keyboard load may now treat text files
  like logs.
- Tests: new GROUP for each entry point (loose, folder, ZIP) producing one
  plain-text node, JSON pretty default, invalid JSON raw, layout switch
  re-parses and keeps filters, layout survives snapshot/restore and session
  cache; remove/update the superseded "Filter lines"/viewer-text groups.
- Done when: opening a .json from the simulator shows one tree node with
  the pretty lines in Filtered; no viewer row appears anywhere.

### Step 2 — Filtered text mode and shared header bar
- Change: when the active node's root is plain text, the table renders in
  text mode: no level stripe, no row separators, own row height equal to
  the editor line height (scaled by `logTextScale`), gutter = line number
  (right-aligned) + empty fold column, message at the editor's x position,
  same mono font. The table header is replaced by the shared header bar
  "LINE" + file name (+ " · pretty"/" · raw" for JSON). Toolbar row height
  identical to Context's.
- Tests: GROUP asserting the text-mode class/row height/header content for
  a plain-text root and unchanged log rendering for a log root.
- Done when: screenshot of a filter node on a simulator .txt matches the
  mockup's Filtered tab.

### Step 3 — Editor as Context view
- Change: for a plain-text root, `renderHighlightView` renders the editor
  (whole file, folding, syntax colors, free selection) under the same
  header bar; for a filter/combined/link node its result lines get a
  hit class and the filter's text matches are marked. Pretty/Raw toggle
  (JSON) and the shared Wrap toggle live in the Context toolbar.
  `applyActivationView`: a plain-text file node with no remembered view
  lands on Context; filter nodes keep Filtered. Double-click/Enter in
  Filtered → `revealInHighlightView` scrolls the editor to the line,
  centers and flashes it, unfolding only the folds that hide it. Tab
  switch keeps the top visible line (anchor by line number; on a filter
  node fall back to the selected line, else the next hit line). Stacked
  layout works; nav history anchors by line number; a minimap click
  scrolls the editor. Markup is rebuilt only when the file, its layout or
  its entries change; hit classes update in place.
- Tests: GROUP for start tab, reveal + unfold, tab-switch anchor,
  hit-line marking, Pretty/Raw toggle from Context.
- Done when: real-app screenshots match the mockup's Context tab for the
  .txt and .json cases, including after a jump.

### Step 4 — Find bar in the editor
- Change: Ctrl+G/F3 in Context on a plain-text root searches the editor
  text, highlights and steps through matches (unfolding as needed); "Add
  as filter" works as in the log views.
- Tests: GROUP for search/step/unfold.

## Docs to update at the end
CHANGELOG.md entry; `docs/ui-and-views.md` ("Inline text/image viewer",
"Filter lines", "Context view"), `PROJECT.md` ("Plain text: fmt-plaintext",
line count), `docs/persistence-and-sync.md` (text viewer records),
README feature list/screenshots; mark `docs/ui-concept-text-files.md` as
implemented; delete this plan.

## Risks
- Persistence: `textLayout` must reach every carrier (CLAUDE.md gotcha).
- DOM identity: the editor must not be rebuilt on unrelated renders
  (selection, folds, dblclick); reuse the `_shownViewer` guard idea.
- Large files: editor builds the whole file once; measure a ~20 MB text
  file in the real app before claiming it's fine.
- Mixed sessions (logs + text files): text mode/row height must follow the
  active node's root, not `allRootsPlainText`.
