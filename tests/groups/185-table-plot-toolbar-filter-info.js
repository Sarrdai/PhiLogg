// GROUP 185 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 185 — Table/Plot toolbar filter-info span (#tableFilterInfo /
   #plotFilterInfo)
   Origin: this session, person-requested ("Paket B" of a larger plan) —
   Table and Plot had no visible indication of an active time filter
   (after/before/timerange) narrowing the extraction, nor of how many rows/
   points are actually shown vs. selected. activeTimeFilters() (near
   isTimeFilterType) walks getChain(state.activeId) for time-filter
   ancestors; updateTableFilterInfo()/updatePlotFilterInfo() (end of
   renderExtractTable/renderPlotChart) render that plus a row/selection or
   visible-point count into the two spans as plain text.
   NOTE: the Plot-view point count goes through visiblePlotPoints() — owned
   by the sibling "Paket C" (minimap sync) package, merged in ahead of this
   one; this group runs against its real implementation (a TEMP stub that
   stood in for it locally has been removed as part of the merge).
   ============================================================ */
group(185);
await withApp(async (w, d, T) => {
  section("185a. Table: filter-info text combines active time filter + row/selection counts");

  const f = await w.addFile("a.log", makeLog(0, 10, { suffix: i => "n=" + i }), () => {});
  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const infoEl = () => d.querySelector("#tableFilterInfo");
  assert(infoEl().textContent.includes("10 rows"), "no time filter active: info shows just the row count, got " + JSON.stringify(infoEl().textContent));
  assert(!infoEl().textContent.includes("selected"), "no marked cells yet: no selection count shown");

  // Add a "timerange" filter as a child of the extraction node, and re-activate it.
  const rangeNode = w.createFilterNode(node.id, "timerange", { from: f.entries[2].ts, to: f.entries[7].ts });
  T.state.activeId = rangeNode.id;
  w.render();
  w.applyFhView("table");
  const expectedRangeText = w.timeRangeFilterName({ from: f.entries[2].ts, to: f.entries[7].ts }, f.id);
  assert(infoEl().textContent.includes(expectedRangeText),
    "active timerange filter's name (timeRangeFilterName) appears in the info text, got " + JSON.stringify(infoEl().textContent));
  assert(infoEl().textContent.includes("6 rows"), "row count reflects the timerange-narrowed extraction (entries 2..7 inclusive), got " + JSON.stringify(infoEl().textContent));

  // Mark 2 cells (different rows) via state.tableSelection, re-render, expect "2 selected".
  const td = (r, c) => d.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]');
  td(0, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  td(3, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, ctrlKey: true }));
  w.updateTableFilterInfo();
  assert(infoEl().textContent.includes("2 selected"),
    "marking cells in 2 distinct rows shows \"2 selected\", got " + JSON.stringify(infoEl().textContent));
});

await withApp(async (w, d, T) => {
  section("185b. Plot: filter-info text combines active time filter + visible-point count");

  const f = await w.addFile("a.log", makeLog(0, 10, { suffix: i => "n=" + i }), () => {});
  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");

  const infoEl = () => d.querySelector("#plotFilterInfo");
  assert(infoEl().textContent.includes("10 points"), "home view (no zoom): all 10 finite points counted, got " + JSON.stringify(infoEl().textContent));
  assert(!infoEl().textContent.includes("≥") && !infoEl().textContent.includes("→"), "no time filter active: no timeRangeFilterName text shown");

  // Add a timerange filter and re-activate + re-render the plot.
  const rangeNode = w.createFilterNode(node.id, "timerange", { from: f.entries[2].ts, to: f.entries[7].ts });
  T.state.activeId = rangeNode.id;
  w.render();
  w.applyFhView("plot");
  const expectedRangeText = w.timeRangeFilterName({ from: f.entries[2].ts, to: f.entries[7].ts }, f.id);
  assert(infoEl().textContent.includes(expectedRangeText),
    "active timerange filter's name appears in the Plot info text too, got " + JSON.stringify(infoEl().textContent));
  assert(infoEl().textContent.includes("6 points"), "visible-point count reflects the timerange-narrowed extraction, got " + JSON.stringify(infoEl().textContent));
});
