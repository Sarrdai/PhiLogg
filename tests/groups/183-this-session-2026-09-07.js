// GROUP 183 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 183 — this session (2026-09-07), person-requested: unify the
   Table/Plot filters. Plot's two dedicated viewport-filter buttons are gone
   ("Visible entries" removed entirely; "Time range" folded into the
   Filtered tab's generic "Time range" row-action, now context-aware). The
   Filtered view's "Select" (Add to selection) action now also lives in
   Table's and Plot's own toolbars. Both resolve their input per view:
   marked-cell rows in Table (a partial row counts as the whole row), the
   plot's visible viewport in Plot, and the log-row selection elsewhere.
   ============================================================ */
group(183);
await withApp(async (w, d, T) => {
  section("183a. Table: Time range + Select resolve from rows with marked cells");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const timeRangeBtn = d.querySelector('[data-row-action="timeRangeFromSelection"]');
  const selectBtn = d.querySelector('#tableToolbar [data-row-action="addToSelection"]');
  assert(isVisible(timeRangeBtn, w) === true, "Time range is visible on the Table tab");
  assert(isVisible(selectBtn, w) === true, "Select is visible in the Table toolbar");

  // No cells marked: both disabled.
  assert(timeRangeBtn.disabled === true, "Time range is disabled with no marked cells");
  assert(selectBtn.disabled === true, "Select is disabled with no marked cells");

  // Mark one cell in row 2 -> Select enables, Time range still disabled (<2 rows).
  const td = (r, c) => d.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]');
  td(2, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  assert(selectBtn.disabled === false, "Select enables once one row has a marked cell");
  assert(timeRangeBtn.disabled === true, "Time range stays disabled with only one marked row");

  // Mark another cell in row 5 (ctrl+click accumulates) -> Time range enables too.
  td(5, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, ctrlKey: true }));
  assert(timeRangeBtn.disabled === false, "Time range enables once two rows have marked cells");

  // "Select" creates a selection filter from exactly those two rows.
  fireClick(selectBtn, w);
  assert(isVisible(d.querySelector("#addToSelectionMenu"), w) === true, "Select opens the add-to-selection menu");
  fireClick(d.querySelector('#addToSelectionMenu [data-selection-action="create"]'), w);
  const sel = Object.values(T.state.nodes).find(n => n.selectionFilter);
  assert(sel && sel.value.length === 2 && sel.value.includes(f.entries[2].id) && sel.value.includes(f.entries[5].id),
    "creates a selection filter containing exactly the two marked rows' entries");
  assert(sel.parentId === f.id, "the selection filter is top-level under the root file");
});

await withApp(async (w, d, T) => {
  section("183b. Table: Time range creates a timerange spanning the marked rows");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const td = (r, c) => d.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]');
  // One cell in row 1, then one cell in row 7 (ctrl+click accumulates) —
  // each partial row counts as the whole row.
  td(1, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  td(7, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, ctrlKey: true }));

  const beforeChildren = node.children.length;
  fireClick(d.querySelector('[data-row-action="timeRangeFromSelection"]'), w);
  assert(node.children.length === beforeChildren + 1, "Time range creates one new child filter");
  const rangeNode = T.state.nodes[node.children[node.children.length - 1]];
  assert(rangeNode.filterType === "timerange" && rangeNode.value.from === f.entries[1].ts && rangeNode.value.to === f.entries[7].ts,
    "the timerange spans the earliest/latest ts among the marked rows' entries");
});

await withApp(async (w, d, T) => {
  section("183c. Plot: Select creates a selection filter from the visible viewport");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");

  const selectBtn = d.querySelector('#plotToolbar [data-row-action="addToSelection"]');
  assert(isVisible(selectBtn, w) === true, "Select is visible in the Plot toolbar");
  assert(selectBtn.disabled === false, "Select is enabled once a 2D plot exists");

  fireClick(selectBtn, w);
  fireClick(d.querySelector('#addToSelectionMenu [data-selection-action="create"]'), w);
  const sel = Object.values(T.state.nodes).find(n => n.selectionFilter);
  assert(sel && sel.value.length === 10, "home view: Select creates a selection filter covering the whole extraction (all 10 visible entries)");
  assert(sel.parentId === f.id, "the selection filter is top-level under the root file");
});
