// GROUP 5 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 5 — Extraction workflow: sort, cell selection, regression
   Origin: 765d68a9 (per-column sort buttons, live match, token chips) —
   the sort-button stopPropagation regression (must not also trigger the
   header's column cell-selection drag) is explicitly re-checked here.
   ============================================================ */
group(5);
await withApp(async (w, d, T) => {
  section("5. Extraction table: sort buttons + cell selection regression");
  const f = await w.addFile("a.log", makeLog(0, 10, { suffix: i => "n=" + (10 - i) }), () => {});
  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  assert(T.extractRowsData.length === 10, "extraction table populated, one row per matching entry");
  assert(T.extractColumns.find(c => c.colIndex === 0).type === "int", "extracted column typed as int");

  // Targeted by data-sort-col, not the first ".extract-sort-btn" in the DOM
  // — the synthetic Index/t(ms) columns (see INDEX_COL/ELAPSED_COL) are
  // always prepended and sortable too, ahead of the real extracted column's button.
  const sortBtn = d.querySelector('.extract-sort-btn[data-sort-col="0"]');
  fireClick(sortBtn, w);
  const firstVal = +T.extractRowsData[0].values[0];
  const lastVal = +T.extractRowsData[T.extractRowsData.length - 1].values[0];
  assert(firstVal <= lastVal, "column sort button reorders extractRowsData numerically, got first=" + firstVal + " last=" + lastVal);

  // Regression: header body click/drag still does cell selection independent
  // of the sort button (the two share a <th> but have separate handlers).
  const th = d.querySelector("#extractHead th[data-col]");
  th.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  th.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  // Duck-typed, not `instanceof Set` — T.state comes from the jsdom window's
  // realm, whose Set constructor differs from Node's global Set.
  assert(T.state.tableSelection && typeof T.state.tableSelection.has === "function" && T.state.tableSelection.size === 10,
    "header click still drives cell-selection (regression from 765d68a9)");
});
