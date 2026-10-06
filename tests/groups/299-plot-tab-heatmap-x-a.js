// GROUP 299 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 299 — Plot tab: Heatmap (X = a column, Y = element index, color =
   value) and Profile (X = element index, Y = value for one row + the Table
   tab's selected rows as overlays) for an array column; per-index element
   columns plot as ordinary Line series. */
group(299);
await withApp(async (w, d, T) => {
  section("299a. Heatmap and Profile chart types over an array column");
  const f = await setup298(w, T);
  const node = w.createFilterNode(f.id, "text", "[*]", false, null, false, ["motor"]);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  assert(d.querySelectorAll(".plot-type-btn").length === 8, "eight chart types offered");

  fireClick(d.querySelector('.plot-type-btn[data-type="heatmap"]'), w);
  assert(T.plotConfig.type === "heatmap" && T.plotConfig.arrayCol === 0, "Heatmap picks the array column");
  assert(d.querySelector("#plotArraySelect") && d.querySelector("#plotXSelect") && d.querySelector("#plotColorMapSelect"), "array, X and colormap controls");
  assert(!d.querySelector("#plotYList") && !d.querySelector("#plotXMin"), "no Y list / range inputs");
  const cells = d.querySelectorAll("#plotSvg .plot-heat-cell");
  assert(cells.length === 11, "one cell per (row, element) with a value, got " + cells.length);
  const hot = [...cells].find(c => c.querySelector("title").textContent.startsWith("value[1] = 2.6"));
  assert(hot && hot.getAttribute("fill") === w.plotColorScale(1, T.plotConfig.colorMap), "the maximum gets the top of the colormap");
  assert(d.querySelector("#plotSvg .plot-axis-title").textContent === "t (ms)", "X defaults to t(ms)");
  fireClick(hot, w);
  assert(T.fhActiveTab === "plot" && T.state.selectedId === T.extractRowsData[+hot.getAttribute("data-row")].entry.id, "clicking a cell selects its row's entry (the tab stays Plot)");
  fireDblClick(hot, w);
  assert(T.fhActiveTab === "table", "double-clicking a cell reveals its row in the Table tab");
  w.applyFhView("plot");

  fireClick(d.querySelector('.plot-type-btn[data-type="profile"]'), w);
  const slider = d.querySelector("#plotProfileRow");
  assert(slider && slider.max === "2" && slider.value === "2", "Profile: a row slider, starting on the last row");
  let marks = d.querySelectorAll("#plotSvg .plot-mark");
  assert(marks.length === 3 && marks[0].getAttribute("data-row") === "2", "the last row's 3 elements, got " + marks.length);
  T.state.tableSelection = null; // the heatmap click above selected a table row
  slider.value = "0";
  slider.dispatchEvent(new w.Event("input", { bubbles: true }));
  marks = d.querySelectorAll("#plotSvg .plot-mark");
  assert(T.plotConfig.profileRow === 0 && marks.length === 4 && marks[0].getAttribute("data-row") === "0", "sliding shows another row");
  assert(d.querySelector("#plotProfileRowLabel").textContent === "1 of 3", "the label follows");
  // Rows selected in the Table tab are overlaid.
  T.state.tableSelection = new Set(["1,0", "2,0"]);
  w.renderPlotChart();
  marks = d.querySelectorAll("#plotSvg .plot-mark");
  assert(marks.length === 11, "main row + two selected rows as overlays, got " + marks.length);
  assert(JSON.stringify(w.sanitizePlotConfig({ type: "profile", arrayCol: 0, profileRow: 1 })).includes('"type":"profile","xCol":null') && w.sanitizePlotConfig({ type: "heatmap", arrayCol: -3 }).arrayCol === null, "sanitizing keeps the new fields valid");

  // Per index: element columns are ordinary numeric Line series.
  node.arrayViews = { 0: "index" };
  fireClick(d.querySelector('.plot-type-btn[data-type="line"]'), w);
  w.renderExtractTable(node);
  const c1 = T.extractColumns.find(c => c.name === "value[1]");
  const cb = d.querySelector('#plotYList input[data-col="' + c1.colIndex + '"]');
  assert(cb, "element columns are offered as Y series");
  fireClick(cb, w);
  cb.checked = true;
  cb.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotLastSeries.some(s => s.col === c1.colIndex && s.pts.length === 3), "value[1] plots over time");
});
