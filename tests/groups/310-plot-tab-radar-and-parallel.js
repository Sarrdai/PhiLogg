// GROUP 310 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 310 — Plot tab: Radar and Parallel coordinates over an ordered
   column group (plotConfig.multiCols, picked/reordered in #plotColList),
   the parallel-coordinates axis brush (dim, count, "Select in table",
   click-to-clear) and color-by; Heatmap/Profile reading that column group
   instead of an array column (plotConfig.arraySource). Data: the log
   simulator's sensors scenario. */
group(310);
async function setup310(w, T, d) {
  const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: "sensors", entries: 40, seed: 3 });
  const f = await w.addFile(file.name, file.text, () => {});
  const node = w.createFilterNode(f.id, "text", "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  return node;
}
await withApp(async (w, d, T) => {
  section("310a. Radar: one polygon per row over the column group, own scale per spoke");
  await setup310(w, T, d);
  assert(T.extractRowsData.length === 40, "sanity: 40 sensor rows, got " + T.extractRowsData.length);
  assert(d.querySelectorAll(".plot-type-btn").length === 8, "eight chart types offered");
  fireClick(d.querySelector('.plot-type-btn[data-type="radar"]'), w);
  assert(JSON.stringify(T.plotConfig.multiCols) === "[1,2,3]", "the pattern's numeric columns form the default group, got " + JSON.stringify(T.plotConfig.multiCols));
  assert(d.querySelectorAll('#plotColList input[type="checkbox"]:checked').length === 3 && d.querySelector("#plotProfileRow"), "column list + row slider");
  let marks = d.querySelectorAll("#plotSvg .plot-mark");
  assert(marks.length === 3 && marks[0].getAttribute("data-row") === "39", "the last row's three vertices, got " + marks.length);
  const temps = T.extractRowsData.map(r => parseFloat(r.values[1]));
  const hottest = temps.indexOf(Math.max(...temps));
  const coldest = temps.indexOf(Math.min(...temps));
  T.state.tableSelection = new Set([hottest + ",0", coldest + ",0"]);
  w.renderPlotChart();
  marks = d.querySelectorAll("#plotSvg .plot-mark");
  assert(marks.length === 9, "main row + two selected rows as overlays, got " + marks.length);
  // Own scale per spoke: the hottest row's temperature vertex sits on the outer ring (top spoke), the coldest on the inner one.
  const topY = row => [...marks].filter(m => m.getAttribute("data-row") === String(row) && m.querySelector("title").textContent.startsWith(T.extractColumns.find(c => c.colIndex === 1).name))[0].getAttribute("cy");
  assert(+topY(hottest) < +topY(coldest), "the hottest row reaches further out on the temperature spoke");
  T.state.tableSelection = null;

  const cb = d.querySelector('#plotColList input[data-col="3"]');
  cb.checked = false;
  cb.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(JSON.stringify(T.plotConfig.multiCols) === "[1,2]" && d.querySelector("#plotSvg .plot-empty-label").textContent.includes("at least 3"), "radar needs three columns");
  const cb3 = d.querySelector('#plotColList input[data-col="3"]');
  cb3.checked = true;
  cb3.dispatchEvent(new w.Event("change", { bubbles: true }));
  fireClick(d.querySelector('#plotColList .plot-col-move button[data-col="1"][data-dir="1"]'), w);
  assert(JSON.stringify(T.plotConfig.multiCols) === "[2,1,3]", "▼ moves a column one axis later, got " + JSON.stringify(T.plotConfig.multiCols));
  assert(d.querySelector('#plotColList .plot-col-move button[data-col="2"][data-dir="-1"]').disabled, "the first column can't move up");
});

await withApp(async (w, d, T) => {
  section("310b. Parallel coordinates: one line per row, axis brush, select in table, color by");
  await setup310(w, T, d);
  fireClick(d.querySelector('.plot-type-btn[data-type="parallel"]'), w);
  const lines = () => d.querySelectorAll("#plotSvg .plot-pc-line");
  const lit = () => d.querySelectorAll("#plotSvg .plot-pc-line:not(.plot-pc-dim)");
  assert(lines().length === 40 && lit().length === 40, "40 lines, none dimmed, got " + lines().length);
  assert(d.querySelectorAll("#plotSvg .plot-pc-axis-hit").length === 3, "one brush strip per axis");
  assert(d.querySelector("#plotBrushInfo").textContent === "40 rows" && d.querySelector("#plotBrushSelect").disabled, "no range yet");

  // Drag along the temperature axis from its top down to 85.
  const L = T.plotParallelLayout;
  d.querySelector("#plotSvg").getBoundingClientRect = () => ({ left: 0, top: 0, width: L.W, height: L.H, right: L.W, bottom: L.H });
  const ax = L.axes.find(a => a.colIndex === 1);
  const yOf = v => L.top + L.plotH - (v - ax.min) / (ax.max - ax.min) * L.plotH;
  const hit = () => d.querySelector('#plotSvg .plot-pc-axis-hit[data-col="1"]');
  hit().dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, button: 0, clientX: ax.x, clientY: L.top }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: ax.x, clientY: yOf(85) }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 0, clientX: ax.x, clientY: yOf(85) }));
  const hot = T.extractRowsData.map((r, i) => [i, parseFloat(r.values[1])]).filter(([, v]) => v >= 85).map(([i]) => i);
  const brush = T.plotParallelBrushes.get(1);
  assert(brush && Math.abs(brush[0] - 85) < 1e-6 && brush[1] === ax.max, "the drag sets the range [85, axis max], got " + JSON.stringify(brush));
  assert(hot.length > 0 && hot.length < 40, "sanity: the simulator produced some spikes, got " + hot.length);
  assert(lit().length === hot.length && JSON.stringify([...lit()].map(p => +p.dataset.row).sort((a, b) => a - b)) === JSON.stringify(hot), "only the spikes stay lit");
  assert(d.querySelector("#plotSvg .plot-pc-brush"), "the range is drawn on the axis");
  assert(d.querySelector("#plotBrushInfo").textContent === hot.length + " of 40 rows in range", "count, got " + d.querySelector("#plotBrushInfo").textContent);

  fireClick(d.querySelector("#plotBrushSelect"), w);
  assert(T.fhActiveTab === "table", "Select in table switches to the Table tab");
  const selRows = [...new Set([...T.state.tableSelection].map(k => +k.split(",")[0]))].sort((a, b) => a - b);
  assert(JSON.stringify(selRows) === JSON.stringify(hot), "the rows in range are selected, got " + JSON.stringify(selRows));
  w.applyFhView("plot");
  assert(T.plotParallelBrushes.has(1), "the range survives a tab switch");

  // A plain click on the strip clears that axis' range.
  hit().dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, button: 0, clientX: ax.x, clientY: L.top + 10 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 0, clientX: ax.x, clientY: L.top + 10 }));
  assert(!T.plotParallelBrushes.has(1) && lit().length === 40, "clicking the axis clears its range");

  const colorSel = d.querySelector("#plotColorSelect");
  colorSel.value = "1";
  colorSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const temps = T.extractRowsData.map(r => parseFloat(r.values[1]));
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const first = lit()[0];
  const v = temps[+first.dataset.row];
  assert(d.querySelector("#plotColorMapSelect") && first.getAttribute("stroke") === w.plotColorScale((v - lo) / (hi - lo), T.plotConfig.colorMap), "color by temperature through the colormap");
  fireClick(first, w);
  assert(T.fhActiveTab === "plot" && T.state.selectedId === T.extractRowsData[+first.dataset.row].entry.id, "clicking a line selects its row's entry (the tab stays Plot)");
  const ringPath = d.querySelector("#plotSelRing path.plot-sel-ring-line");
  assert(ringPath && ringPath.getAttribute("d") === first.getAttribute("d"), "a thicker copy of the selected line marks it");
  fireDblClick(first, w);
  assert(T.fhActiveTab === "table", "double-clicking a line reveals its row");
});

await withApp(async (w, d, T) => {
  section("310c. Heatmap and Profile over a column group; array/column source switch; sanitizing");
  await setup310(w, T, d);
  fireClick(d.querySelector('.plot-type-btn[data-type="heatmap"]'), w);
  const opts = [...d.querySelectorAll("#plotArraySelect option")].map(o => o.value);
  assert(JSON.stringify(opts) === '["columns"]' && d.querySelector("#plotColList"), "no array column: the column group is the only source");
  assert(d.querySelectorAll("#plotSvg .plot-heat-cell").length === 120, "one cell per (row, column), got " + d.querySelectorAll("#plotSvg .plot-heat-cell").length);
  const tickTexts = [...d.querySelectorAll("#plotSvg .plot-tick-label")].map(t => t.textContent);
  const name1 = T.extractColumns.find(c => c.colIndex === 1).name;
  assert(tickTexts.some(t => name1.startsWith(t.replace("…", ""))), "rows are labelled with column names");
  fireClick(d.querySelector('.plot-type-btn[data-type="profile"]'), w);
  const marks = d.querySelectorAll("#plotSvg .plot-mark");
  assert(marks.length === 3 && marks[0].querySelector("title").textContent.startsWith(name1 + " = "), "Profile: one point per column of the last row");
});

await withApp(async (w, d, T) => {
  section("310d. Array column present: Values select offers the array and the column group");
  const f = await setup298(w, T);
  const node = w.createFilterNode(f.id, "text", "[*]", false, null, false, ["motor"]);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="heatmap"]'), w);
  const sel = d.querySelector("#plotArraySelect");
  assert(sel.value === "0" && [...sel.options].some(o => o.value === "columns") && !d.querySelector("#plotColList"), "the array column is the default source");
  sel.value = "columns";
  sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.arraySource === "columns" && d.querySelector("#plotColList"), "switching to the column group shows the column list");
  const cfg = w.sanitizePlotConfig({ type: "parallel", arraySource: "bogus", multiCols: [3, 1, 3, "x", 1.5], multiColsInit: true });
  assert(cfg.type === "parallel" && cfg.arraySource === "array" && JSON.stringify(cfg.multiCols) === "[3,1]" && cfg.multiColsInit === true, "sanitizing keeps the new fields valid, got " + JSON.stringify(cfg));
  assert(w.sanitizePlotConfig({ type: "radar", arraySource: "columns" }).arraySource === "columns", "a valid source survives");
});
