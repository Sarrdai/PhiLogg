// GROUP 24 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 24 — Extraction: live pattern preview + ignored columns
   Origin: this session (2026-08-13), from person-supplied
   REQUIREMENTS-extract-preview-and-ignore.md. Covers both halves of the
   spec: (A) the new live pattern preview in #filterPopup (a real sample
   message with matched substrings highlighted in place, not just the
   abstract template) and (B) per-column node.ignoredColumns — Option B
   from the spec's "Design directions" (chosen over a new [ignore] token;
   see PROJECT.md "Extraction workflow" -> "Ignored columns" for why) —
   incl. both toggle surfaces (the new popup preview, and the existing
   post-creation #extractPatternView chips extended to double as the same
   toggle), exclusion from the table/stats/plot/export/assertions, and
   persistence through cloneSubtree/undo-redo/save-load/session-cache
   (the same 4 touch points already established for assertions). The
   person-supplied tests/extract-preview-ignore.spec.js (BASELINE +
   CONDITIONAL groups) is kept as a standalone file too — its acceptance
   criteria call for that — but this group is the primary, consolidated
   coverage, same "fold into the one suite" convention as Groups 22/23
   (see README.md "Extending this suite").
   ============================================================ */
group(24);
await withApp(async (w, d, T) => {
  section("24. Extraction: live pattern preview + ignored columns");
  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i} name=n${i} score=${i}.5"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  /* ---------- Part A: live pattern preview in #filterPopup ---------- */
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  filterInput.value = "id=[*:int] name=[*] score=[*:float]";
  fireInput(filterInput, w);
  await new Promise(r => setTimeout(r, 200)); // evaluateLiveMatch/preview share the same 150ms debounce

  const preview = d.querySelector("#filterPatternPreview");
  assert(!preview.classList.contains("hidden"), "pattern preview becomes visible for an extraction pattern");
  const spans = [...preview.querySelectorAll(".preview-value-span")];
  assert(spans.length === 3, "one highlighted span per placeholder, got " + spans.length);
  assert(spans[0].textContent === "0" && spans[1].textContent === "n0" && spans[2].textContent === "0.5",
    "spans contain the actual matched substrings from a REAL sample message (not the abstract template), got [" + spans.map(s => s.textContent).join(",") + "]");
  assert(preview.textContent.includes("id=") && preview.textContent.includes("name=") && preview.textContent.includes("score="),
    "literal text between placeholders is preserved around the highlighted spans");

  // Click the "name" span (placeholder index 1) to mark it ignored BEFORE the filter even exists
  fireClick(spans[1], w);
  const spansAfterToggle = [...preview.querySelectorAll(".preview-value-span")];
  assert(spansAfterToggle[1].classList.contains("chip-ignored"), "clicking a preview span marks it ignored (dimmed) immediately, before submit");
  assert(!spansAfterToggle[0].classList.contains("chip-ignored") && !spansAfterToggle[2].classList.contains("chip-ignored"),
    "the other two spans stay un-ignored");

  // "Add filter" is the only submit action now (the separate "Extract"
  // button/filterType was retired — a wildcard "text" filter IS the
  // extraction, see docs/archive/ui-implementation-plan.md's follow-up note).
  fireClick(d.querySelector("#filterSubmitBtn"), w);
  const node = T.state.nodes[T.state.activeId];
  assert(node.filterType === "text" && node.ignoredColumns && node.ignoredColumns.length === 1 && node.ignoredColumns.includes(1),
    "a filter created via the popup carries ignoredColumns toggled from the live preview, got " + JSON.stringify(node.ignoredColumns));
  w.applyFhView("table");

  /* ---------- Table reflects the ignored column immediately ----------
     4, not 2: extractColumns always leads with the synthetic Index/t(ms)
     columns (see INDEX_COL/ELAPSED_COL) ahead of the 2 visible pattern
     columns ("id"/"score" — "name" stays excluded, ignored). */
  assert(T.extractColumns.length === 4, "extractColumns excludes the ignored column, got " + T.extractColumns.length);
  assert(!T.extractColumns.some(c => c.colIndex === 1), "column index 1 ('name') is not among the visible columns");
  const ths = [...d.querySelectorAll("#extractHead th[data-col]")];
  assert(ths.length === 4 && ths.every(th => +th.dataset.col !== 1), "no <th> rendered for the ignored column, got data-col=[" + ths.map(t => t.dataset.col).join(",") + "]");
  const firstRowTds = [...d.querySelectorAll("#extractBody tr:first-child td[data-col]")];
  assert(firstRowTds.length === 4 && firstRowTds.every(td => +td.dataset.col !== 1), "no <td> rendered for the ignored column either");
  assert(T.extractRowsData.every(r => r.values.length === 3), "row.values still holds all 3 raw captured values — matching itself is untouched by ignoring a column (Index/t(ms) ride along as negative-index expandos, outside this .length)");

  /* ---------- Export excludes the ignored column from both header and body ---------- */
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.copyWholeExtractTable();
  const copiedLines = copied.split("\n");
  // Leads with Index/t(ms) (t(ms)=0 on the first row — elapsed since itself),
  // then the two visible pattern columns; "name" (ignored) stays excluded.
  assert(copiedLines[0] === "Index\tt (ms)\tid\tscore", "copy-whole-table header includes only the visible columns' names, got " + JSON.stringify(copiedLines[0]));
  assert(copiedLines[1] === "0\t0\t0\t0.5", "copy-whole-table body row includes only the visible columns' values (ignored 'name' column dropped), got " + JSON.stringify(copiedLines[1]));

  /* ---------- Edit mode pre-populates the preview from node.ignoredColumns ---------- */
  w.openEditFilterPopup(node.id);
  await new Promise(r => setTimeout(r, 200));
  const editSpans = [...d.querySelectorAll("#filterPatternPreview .preview-value-span")];
  assert(editSpans.length === 3 && editSpans[1].classList.contains("chip-ignored"),
    "re-opening Edit on an already-ignored-column filter shows that column pre-dimmed in the preview");
  w.closeFilterPopup();

  /* ---------- Post-creation toggle: clicking a pattern chip above the table ---------- */
  const chips = [...d.querySelectorAll("#extractPatternView .pattern-chip")];
  assert(chips.length === 3, "pattern view still shows a chip per placeholder, ignored or not (unlike the table, which only shows visible ones)");
  assert(chips[1].classList.contains("chip-ignored"), "the ignored column's chip is visually dimmed in the post-creation pattern view too");
  fireClick(chips[1], w); // un-ignore "name" by clicking its chip directly (no popup involved)
  assert(!node.ignoredColumns, "clicking the pattern chip un-ignores the column directly on the node (empty ignoredColumns is deleted, not left as [])");
  assert(T.extractColumns.length === 5, "table immediately shows all 3 pattern columns (+2 synthetic Index/t(ms)) again after un-ignoring");
  fireClick(d.querySelectorAll("#extractPatternView .pattern-chip")[1], w); // re-ignore for the checks below
  assert(node.ignoredColumns && node.ignoredColumns.includes(1), "re-ignored via the same chip toggle, for the persistence checks below");

  /* ---------- Column statistics / assertions / plot: a SEPARATE node, ignoring the NUMERIC column this time ---------- */
  const numNode = w.createFilterNode(f.id, "text", "id=[*:int] name=[*] score=[*:float]");
  w.setColumnIgnored(numNode, 0, true); // ignore "id" (int, column index 0) — "score" (float, index 2) stays visible
  T.state.activeId = numNode.id;
  w.render();
  w.applyFhView("table");
  assert(w.computeColumnStats(0) === null, "computeColumnStats returns null for a currently-ignored column");
  const statsText = d.querySelector("#statsPanel").textContent;
  assert(statsText.includes("score:") && !statsText.includes("id:"), "stats bar shows the visible numeric column (score) but omits the ignored one (id), got " + JSON.stringify(statsText));
  // 3, not 1: the synthetic Index/t(ms) columns are always visible/plottable
  // too, alongside the one visible pattern column ("score") — "id" stays
  // excluded, ignored. Select every column and check how many of them the
  // Value assertion toolbar action would actually apply to
  // (assertableSelectedColumns) — assertion moved off a per-column header
  // button onto that action, see Group 14.
  d.querySelector("#extractCorner").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  assert(w.assertableSelectedColumns().length === 3, "only the visible numeric columns are assertable — an ignored column isn't among them");

  w.applyFhView("plot");
  const xOptions = [...d.querySelectorAll("#plotXSelect option")].map(o => +o.value);
  assert(xOptions.length === 3 && xOptions.includes(-2) && xOptions.includes(-1) && xOptions.includes(2),
    "ignored numeric column is not offered as a plot axis candidate; Index/t(ms) and the visible 'score' column are, got " + JSON.stringify(xOptions));
  w.switchExtractView("table");

  /* ---------- Persistence: cloneSubtree (copy/paste) ---------- */
  T.state.activeId = node.id;
  const clone = w.cloneSubtree(node.id, f.id);
  assert(clone.ignoredColumns && clone.ignoredColumns.includes(1) && clone.ignoredColumns !== node.ignoredColumns,
    "cloneSubtree carries ignoredColumns onto the copy as an independent array");

  /* ---------- Persistence: undo/redo (snapshotSubtree/restoreSubtree) ---------- */
  T.resetUndoRedo();
  w.deleteFilterNodeWithUndo(node.id);
  assert(!T.state.nodes[node.id], "sanity: node gone after delete");
  w.undo();
  const restored = T.state.nodes[node.id];
  assert(restored && restored.ignoredColumns && restored.ignoredColumns.includes(1),
    "undo restores ignoredColumns alongside the rest of the deleted node");

  /* ---------- Persistence: filter save/load JSON round trip ---------- */
  const branch = w.serializeFilterBranch(node.id);
  const savedRoot = branch.roots.find(r => r.attach === "target");
  assert(savedRoot && savedRoot.ignoredColumns && savedRoot.ignoredColumns.includes(1), "serializeFilterBranch writes ignoredColumns into the saved JSON");
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const anchor = w.createFilterNode(f.id, "text", "id=");
  w.render();
  const loadScript = d.createElement("script");
  loadScript.textContent = `loadFilterTargetId = ${JSON.stringify(anchor.id)};`;
  d.body.appendChild(loadScript);
  const beforeChildren = anchor.children.length;
  w.importFilterJson(json);
  assert(anchor.children.length === beforeChildren + 1, "load creates the extract node under the target anchor");
  const loaded = T.state.nodes[anchor.children[anchor.children.length - 1]];
  assert(loaded.ignoredColumns && loaded.ignoredColumns.includes(1), "ignoredColumns travels through filter save/load JSON");

  /* ---------- Persistence: session cache serialization (also covers session export/import, which reuses these same functions) ---------- */
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(f);
  const cacheNode = cacheRoots.find(r => r.value === node.value);
  assert(cacheNode && cacheNode.ignoredColumns && cacheNode.ignoredColumns.includes(1),
    "serializeFilterTreeForCache writes ignoredColumns");
  const fakeFile = { id: "test-fake-file", children: [] };
  w.materializeCachedFilters(fakeFile, cacheRoots);
  const materialized = fakeFile.children.map(id => T.state.nodes[id]).find(n => n.value === node.value);
  assert(materialized && materialized.ignoredColumns && materialized.ignoredColumns.includes(1),
    "materializeCachedFilters restores ignoredColumns (session cache restore + session export/import)");
});
