// GROUP 187 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 187 — this session (2026-09-08), person-requested follow-up:
   "Filter after"/"Filter before" (and, for consistency, "Message"/
   "Extract") were only ever usable in Context/Filtered — they hid entirely
   on Table/Plot (see the now-superseded Group 178 text). Now:
     a) After/Before resolve per view like Time range/Select
        (afterBeforeActionEntries): a single marked row in Table, the
        visible viewport in Plot, a single/multi log-row selection in
        Context/Filtered. With 2+ entries the bound is INCLUSIVE — After
        uses the earliest ts, Before the latest — rather than requiring an
        exact single reference point.
     b) Message/Extract still need EXACTLY ONE reference entry
        (singleMessageActionEntry) — Table only enables them with exactly
        one marked row (0 or 2+ disables); Plot has no single-point
        reference and never enables them.
   ============================================================ */
group(187);
await withApp(async (w, d, T) => {
  section("187a. Table: After/Before resolve from marked rows, inclusively across 2+");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {}); // 10 entries, 1s apart
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const afterBtn = d.querySelector('[data-row-action="filterAfter"]');
  const beforeBtn = d.querySelector('[data-row-action="filterBefore"]');
  assert(afterBtn.disabled === true && beforeBtn.disabled === true, "no marked rows: After/Before start disabled on Table");

  // Mark a single row (row 3) — single-entry behavior, same as the old Context/Filtered path.
  const td = (r, c) => d.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]');
  td(3, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  w.updateRowActionButtons();
  assert(afterBtn.disabled === false && beforeBtn.disabled === false, "one marked row: After/Before enable on Table");

  fireClick(afterBtn, w);
  let created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "timerange" && created.value.from === T.extractRowsData[3].entry.ts && created.value.to === null,
    "single marked row: After uses that row's own ts as the 'from' bound, got " + JSON.stringify(created.value));

  // Mark rows 2, 5, 7 — inclusive multi-row behavior: After = earliest (row 2), Before = latest (row 7).
  T.state.activeId = node.id;
  T.state.tableSelection = null;
  w.render();
  w.applyFhView("table");
  [2, 5, 7].forEach(r => td(r, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, ctrlKey: r !== 2 })));
  w.updateRowActionButtons();
  assert(d.querySelector('[data-row-action="filterAfter"]').disabled === false, "2+ marked rows: After stays enabled (inclusive)");

  fireClick(d.querySelector('[data-row-action="filterBefore"]'), w);
  created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "timerange" && created.value.to === T.extractRowsData[7].entry.ts && created.value.from === null,
    "3 marked rows (2,5,7): Before uses the LATEST ts among them (row 7), got " + JSON.stringify(created.value));
});

await withApp(async (w, d, T) => {
  section("187b. Plot: After/Before resolve from the visible viewport, inclusively");

  const rows = Array.from({ length: 11 }, (_, i) => i * 10); // 0,10,...,100
  const log = rows.map((v, i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${v} y=${v}"`
  ).join("\n") + "\n";
  const f = await w.addFile("zoom.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));

  const afterBtn = () => d.querySelector('[data-row-action="filterAfter"]');
  assert(afterBtn().disabled === false, "unzoomed (home) view: After is enabled once a 2D plot exists");

  // Zoom to x in [40, 60] — rows 4..6 (x=40,50,60).
  T.plotZoom = { x0: 40, x1: 60, y0: 0, y1: 100 };
  w.renderPlotChart();
  fireClick(afterBtn(), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "timerange" && created.value.from === T.extractRowsData[4].entry.ts && created.value.to === null,
    "zoomed to rows 4-6: After uses the EARLIEST ts among the visible viewport (row 4), got " + JSON.stringify(created.value));
});

await withApp(async (w, d, T) => {
  section("187c. Table: Message/Extract stay hidden regardless of marked rows (person-requested — doesn't read as sensible there)");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const messageBtn = d.querySelector('[data-row-action="filterForMessage"]');
  const extractBtn = d.querySelector('[data-row-action="extractMessage"]');
  assert(isVisible(messageBtn, w) === false && isVisible(extractBtn, w) === false, "no marked rows: Message/Extract hidden on Table");

  const td = (r, c) => d.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]');
  td(3, 0).dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
  w.updateRowActionButtons();
  assert(isVisible(messageBtn, w) === false && isVisible(extractBtn, w) === false,
    "even with exactly one marked row: Message/Extract stay hidden on Table (person-requested, 2026-09-08)");
  assert(d.querySelector('[data-row-action="filterAfter"]').disabled === false, "sanity: After stays visible/enabled with one marked row (contrast case)");
});

await withApp(async (w, d, T) => {
  section("187d. Plot: Message/Extract stay hidden/disabled always (no single-point reference)");

  const f = await w.addFile("a.log", makeLog(0, 10, { suffix: i => "n=" + i }), () => {});
  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));

  assert(isVisible(d.querySelector('[data-row-action="filterForMessage"]'), w) === false, "Message stays hidden on Plot even with a 2D plot active");
  assert(isVisible(d.querySelector('[data-row-action="extractMessage"]'), w) === false, "Extract stays hidden on Plot even with a 2D plot active");
  assert(isVisible(d.querySelector('[data-row-action="filterAfter"]'), w) === true, "sanity: After stays visible/enabled on Plot (contrast case)");
});
