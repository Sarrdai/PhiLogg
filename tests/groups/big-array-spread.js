// GROUP big-array-spread — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP big-array-spread — a data-sized array is never spread into a call.
   Origin: 2026-10-02 (code review): `Math.min(...arr)`, `Math.max(...arr)` and
   `cells.push(...bigArray)` pass every element as a call argument, and engines
   cap that (V8/WebView2 throws "RangeError: Maximum call stack size exceeded"
   above ~120k, JavaScriptCore — the Tauri WebView on macOS/Linux — above ~65k).
   The plots (2D scatter/line/bar, 3D scatter), the time-range actions on a
   selection and the extraction table's column selection used to die on a big
   data set; the plot silently stayed empty. They now go through arrayMin /
   arrayMax and plain loops. Everything here runs on 200,000 rows, above V8's
   cap in this Node as well (checked by the first section).
   ============================================================ */
group("big-array-spread");
await withApp(async (w, d, T) => {
  const N = 200000;

  /* ---------- arrayMin / arrayMax: same results as Math.min/max(...arr) ---------- */
  section("big-array-spread a. arrayMin/arrayMax behave exactly like Math.min/Math.max(...arr), without the argument cap");
  let spreadErr = null;
  try { Math.min(...new Array(N).fill(1)); } catch (e) { spreadErr = e; }
  assert(spreadErr instanceof RangeError,
    "sanity: spreading " + N + " elements into Math.min really throws in this engine (so the 200k-row sections below can fail on a regression), got " + spreadErr);

  assert(w.arrayMin([3, 1, 2]) === 1 && w.arrayMax([3, 1, 2]) === 3, "plain numbers");
  assert(w.arrayMin([-5, -1]) === -5 && w.arrayMax([-5, -1]) === -1, "negative numbers");
  assert(w.arrayMin([7]) === 7 && w.arrayMax([7]) === 7, "a single element");
  assert(w.arrayMin([]) === Infinity && w.arrayMax([]) === -Infinity, "an empty array gives Infinity / -Infinity, like Math.min() / Math.max()");
  assert(Number.isNaN(w.arrayMin([1, NaN, 2])) && Number.isNaN(w.arrayMax([1, NaN, 2])), "NaN in the middle makes the result NaN, like Math.min/max");
  assert(Number.isNaN(w.arrayMin([NaN, 1])) && Number.isNaN(w.arrayMax([NaN, 1])), "NaN first makes the result NaN");
  assert(Number.isNaN(w.arrayMin([1, NaN])) && Number.isNaN(w.arrayMax([1, NaN])), "NaN last makes the result NaN");
  assert(Object.is(w.arrayMin([0, -0]), -0) && Object.is(w.arrayMax([-0, 0]), 0), "-0 is ordered below +0, like Math.min/max");
  assert(w.arrayMin([Infinity, 5]) === 5 && w.arrayMax([-Infinity, 5]) === 5 && w.arrayMax([1, Infinity]) === Infinity, "infinities");
  assert(w.arrayMin([null, 4]) === 0 && Number.isNaN(w.arrayMax([undefined, 4])),
    "elements are coerced like Math.min/max does (null -> 0, undefined -> NaN)");

  // Same answers as the spread on a pile of small random arrays.
  let rnd = 12345;
  const next = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
  let mismatches = 0;
  for (let k = 0; k < 200; k++) {
    const arr = Array.from({ length: 1 + Math.floor(next() * 40) }, () => Math.round((next() - 0.5) * 1000) / 10);
    if (!Object.is(w.arrayMin(arr), Math.min(...arr)) || !Object.is(w.arrayMax(arr), Math.max(...arr))) mismatches++;
  }
  assert(mismatches === 0, "200 random small arrays: arrayMin/arrayMax agree with the spread form, mismatches " + mismatches);

  const big = Array.from({ length: 300000 }, (_, i) => ((i * 7919) % 300007) - 150000);
  big[123456] = -999999; big[234567] = 999999;
  assert(w.arrayMin(big) === -999999 && w.arrayMax(big) === 999999, "300k elements: the right minimum and maximum, no RangeError");

  /* ---------- one 200k-row extraction for everything below ---------- */
  section("big-array-spread b. 200,000 extraction rows: 2D scatter / line / bar render");
  const [sim] = LOGSIM.generateToStrings({ format: "default", entries: N, seed: 7, scenarios: "position" });
  const f = await w.addFile("big-position.log", sim.text, () => {});
  w.render();
  T.state.activeId = f.id;
  assert(f.entries.length === N, "sanity: the simulator log loads as " + N + " entries, got " + f.entries.length);
  const node = w.createFilterNode(f.id, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === N, "sanity: one extraction row per entry, got " + T.extractRowsData.length);

  // The data's own extents, by plain loops, to compare the plots against.
  const col = c => { const out = new Array(N); for (let i = 0; i < N; i++) out[i] = parseFloat(T.extractRowsData[i].values[c]); return out; };
  const loopMin = a => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
  const loopMax = a => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };
  const xs = col(0), ys = col(1), zs = col(2);
  const ext = { x: [loopMin(xs), loopMax(xs)], y: [loopMin(ys), loopMax(ys)], z: [loopMin(zs), loopMax(zs)] };
  assert(ext.x[1] > ext.x[0] && ext.y[1] > ext.y[0] && ext.z[1] > ext.z[0], "sanity: the simulated position walk has a real extent on all three axes");

  // jsdom cannot hold 200,000 SVG elements (the heap runs out), and what this
  // group needs is what the app BUILT: the markup string handed to
  // #plotSvg.innerHTML is captured instead of being parsed into the document.
  let svgMarkup = "";
  Object.defineProperty(d.querySelector("#plotSvg"), "innerHTML", { configurable: true, get() { return svgMarkup; }, set(v) { svgMarkup = String(v); } });
  // Opening the Plot tab draws the default chart already — on the whole data set.
  let err = null;
  try { w.applyFhView("plot"); } catch (e) { err = e; }
  assert(err === null, "opening the Plot tab over " + N + " rows does not throw, got " + err);
  // Plot state is set directly and rendered once per step: going through the
  // controls would redraw the 200k marks for every single select change. A
  // renderer that throws is reported with its message instead of ending the
  // group.
  const drawPlot = cfg => {
    try {
      Object.assign(T.plotConfig, cfg);
      w.renderPlotControls();
      w.renderPlotChart();
      return null;
    } catch (e) { return e; }
  };
  const countIn = (needle) => svgMarkup.split(needle).length - 1;
  const marks = tag => countIn("<" + tag + ' class="plot-mark"');
  // The home domain is the data extent snapped outwards to nice ticks: it
  // must contain the whole data range, and not be wildly bigger than it.
  const domainCovers = (lo, hi, [dataLo, dataHi]) => lo <= dataLo && hi >= dataHi && (hi - lo) < 3 * (dataHi - dataLo);

  err = drawPlot({ type: "scatter", xCol: 0, yCols: [1], colorCol: 2 });
  assert(err === null, "scatter over " + N + " rows (with a colour column) renders without throwing, got " + err);
  assert(marks("circle") === N, "scatter: one mark per row, got " + marks("circle"));
  assert(T.plotHoverPoints.length === N, "scatter: one hover target per row, got " + T.plotHoverPoints.length);
  let lr = T.plotLastRender || {}; // empty when the render threw, so the assertion below fails instead of crashing
  assert(domainCovers(lr.xHomeDomainMin, lr.xHomeDomainMax, ext.x) && domainCovers(lr.yHomeDomainMin, lr.yHomeDomainMax, ext.y),
    "scatter: the axes contain the data's whole extent (x " + ext.x + ", y " + ext.y + "), got x " + [lr.xHomeDomainMin, lr.xHomeDomainMax] + ", y " + [lr.yHomeDomainMin, lr.yHomeDomainMax]);
  assert(countIn('data-axis="color"') >= 1 && countIn(">" + w.formatAxisNumber(ext.z[1]) + "</text>") >= 1 && countIn(">" + w.formatAxisNumber(ext.z[0]) + "</text>") >= 1,
    "scatter: the colour legend is drawn and labelled with the colour column's true min and max (" + ext.z + ")");

  err = drawPlot({ type: "line", xCol: 0, yCols: [1, 2], colorCol: null, normalize: false });
  assert(err === null, "line over " + N + " rows and two series renders without throwing, got " + err);
  assert(countIn("<path ") >= 2, "line: one path per series, got " + countIn("<path "));
  assert(T.plotLastSeries.length === 2 && T.plotLastSeries.every(s => s.pts.length === N), "line: both series carry all " + N + " points");
  lr = T.plotLastRender || {};
  assert(domainCovers(lr.xHomeDomainMin, lr.xHomeDomainMax, ext.x), "line: the X axis covers the data's range");

  err = drawPlot({ type: "bar", xCol: 0, yCols: [1], normalize: false });
  assert(err === null, "bar over " + N + " rows renders without throwing, got " + err);
  assert(marks("rect") === N, "bar: one bar per row, got " + marks("rect"));

  /* ---------- normalize (needs two or more Y series) ---------- */
  section("big-array-spread c. normalize each series with 200,000 points");
  // The line chart with two series is already drawn; the "Normalize each series"
  // pill is clicked like a person would.
  err = drawPlot({ type: "line", xCol: 0, yCols: [1, 2], normalize: false });
  assert(err === null, "line with two series renders without throwing, got " + err);
  const normPill = d.querySelector("#plotNormalize");
  assert(normPill, "sanity: the Normalize pill is offered with two or more Y series to choose from");
  fireClick(normPill, w);
  assert(T.plotConfig.normalize === true, "the pill turns normalize on");
  const norm = T.plotLastSeries;
  assert(norm.length === 2 && norm.every(s => s.pts.length === N), "normalized: both series carry all " + N + " points");
  const seriesRange = s => { let lo = Infinity, hi = -Infinity; for (const p of s.pts) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; } return [lo, hi]; };
  assert(norm.every(s => { const [lo, hi] = seriesRange(s); return Math.abs(lo) < 1e-12 && Math.abs(hi - 1) < 1e-12; }),
    "normalized: every series spans exactly 0..1, got " + norm.map(s => seriesRange(s)).join(" | "));
  assert(norm.length > 0 && norm[0].pts.length > 1000 && Math.abs(norm[0].pts[1000].yOrig - ys[1000]) < 1e-9, "normalized: the original value rides along as yOrig");

  err = drawPlot({ type: "bar", xCol: 0, yCols: [1, 2], normalize: true });
  assert(err === null, "normalized bars over " + N + " rows and two series render without throwing, got " + err);
  assert(marks("rect") === 2 * N, "normalized bars: one bar per row and series, got " + marks("rect"));
  T.plotConfig.normalize = false;

  /* ---------- 3D scatter ---------- */
  section("big-array-spread d. 3D scatter: extents and colour range over 200,000 points");
  // jsdom has no canvas: a recording context takes the colour of every point.
  const pointColors = new Set();
  const canvas3d = d.querySelector("#plot3dCanvas");
  canvas3d.getContext = () => {
    let fillStyle = null;
    return {
      clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, setTransform() {},
      fill() { pointColors.add(fillStyle); },
      createLinearGradient() { return { addColorStop() {} }; },
      get fillStyle() { return fillStyle; }, set fillStyle(v) { fillStyle = v; },
      set strokeStyle(v) {}, set lineWidth(v) {}, set font(v) {},
    };
  };
  err = drawPlot({ type: "3d", xCol: 0, yCols: [1], zCol: 2, colorCol: 2, xMin: "", xMax: "", yMin: "", yMax: "", zMin: "", zMax: "", axisEqual3d: "off" });
  assert(err === null, "3D scatter over " + N + " rows (with a colour column) renders without throwing, got " + err);
  assert(T.plotHoverPoints.length === N, "3D: one hover target per point, got " + T.plotHoverPoints.length);
  assert(pointColors.has(w.plotColorScale(0, T.plotConfig.colorMap)) && pointColors.has(w.plotColorScale(1, T.plotConfig.colorMap)) && pointColors.size > 20,
    "3D: the colour scale runs over the colour column's whole range (lowest and highest value drawn in the two end colours), distinct colours " + pointColors.size);
  const r3 = T.plot3dLastRender || {};
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  assert(near(r3.sx, 1 / (ext.x[1] - ext.x[0])) && near(r3.sy, 1 / (ext.y[1] - ext.y[0])) && near(r3.sz, 1 / (ext.z[1] - ext.z[0])),
    "3D: each axis is scaled from the data's true min/max, got " + [r3.sx, r3.sy, r3.sz] + " expected " + [1 / (ext.x[1] - ext.x[0]), 1 / (ext.y[1] - ext.y[0]), 1 / (ext.z[1] - ext.z[0])]);

  /* ---------- time range from a selection of everything ---------- */
  section("big-array-spread e. time range / filter after / filter before from a 200,000-row selection");
  const firstTs = f.entries[0].ts, lastTs = f.entries[N - 1].ts;
  let tsMin = Infinity, tsMax = -Infinity;
  for (const e of f.entries) { if (e.ts < tsMin) tsMin = e.ts; if (e.ts > tsMax) tsMax = e.ts; }
  assert(tsMin === firstTs && tsMax === lastTs && lastTs > firstTs, "sanity: the simulated log runs forward in time");
  const newChild = parent => parent.children.map(id => T.state.nodes[id]).filter(n => n.filterType === "timerange").pop();
  const rowAction = action => d.querySelector('[data-row-action="' + action + '"]');

  // Log view: every row multi-selected (what Shift+click over the whole file
  // or a Select-all produces), then the toolbar's three actions and the
  // context menu's "Time filter from selection".
  w.applyFhView("filter");
  T.state.activeId = f.id;
  w.render();
  T.state.logMultiSelect = new Set(f.entries.map(e => e.id));
  w.updateRowActionButtons();
  assert(T.state.logMultiSelect.size === N && rowAction("timeRangeFromSelection").disabled === false, "sanity: all " + N + " rows selected, the time-range button is enabled");

  const before = f.children.length;
  fireClick(rowAction("timeRangeFromSelection"), w);
  assert(f.children.length === before + 1, "the toolbar's Time range adds exactly one filter node, got " + (f.children.length - before));
  let tr = newChild(f);
  assert(tr && tr.value.from === firstTs && tr.value.to === lastTs, "log view: Time range spans the first to the last timestamp, got " + JSON.stringify(tr && tr.value));

  T.state.activeId = f.id;
  w.render();
  T.state.logMultiSelect = new Set(f.entries.map(e => e.id));
  w.updateRowActionButtons();
  fireClick(rowAction("filterAfter"), w);
  tr = newChild(f);
  assert(tr && tr.value.from === firstTs && tr.value.to === null, "log view: Filter after takes the earliest selected timestamp, got " + JSON.stringify(tr && tr.value));

  T.state.activeId = f.id;
  w.render();
  T.state.logMultiSelect = new Set(f.entries.map(e => e.id));
  w.updateRowActionButtons();
  fireClick(rowAction("filterBefore"), w);
  tr = newChild(f);
  assert(tr && tr.value.from === null && tr.value.to === lastTs, "log view: Filter before takes the latest selected timestamp, got " + JSON.stringify(tr && tr.value));

  T.state.activeId = f.id;
  w.render();
  T.state.logMultiSelect = new Set(f.entries.map(e => e.id));
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[N - 1]);
  fireClick(d.querySelector("#ctxTimeRangeFromSelection"), w);
  tr = newChild(f);
  assert(tr && tr.value.from === firstTs && tr.value.to === lastTs, "context menu: Time filter from selection spans the first to the last timestamp, got " + JSON.stringify(tr && tr.value));
  T.state.logMultiSelect = new Set();

  // Plot tab: the whole plot is visible, so every entry counts.
  T.state.activeId = node.id;
  try { w.applyFhView("plot"); } catch (e) { err = e; }
  err = drawPlot({ type: "line", xCol: 0, yCols: [1], normalize: false });
  assert(err === null, "sanity: the line plot is back");
  w.updateRowActionButtons();
  let kids = node.children.length;
  fireClick(rowAction("timeRangeFromSelection"), w);
  assert(node.children.length === kids + 1, "Plot tab: Time range adds exactly one filter node");
  tr = newChild(node);
  assert(tr && tr.value.from === firstTs && tr.value.to === lastTs, "Plot tab: Time range over the fully visible plot spans the first to the last timestamp, got " + JSON.stringify(tr && tr.value));

  // Table tab: every cell marked.
  T.state.activeId = node.id;
  w.applyFhView("table");
  // What Ctrl+clicking the three column headers marks (columnsRangeCells), as
  // the table's selection set — without selectCells' per-cell DOM lookups,
  // which would only measure jsdom here.
  T.state.tableSelection = new Set(w.columnsRangeCells(0, 2).map(([r, c]) => w.cellKey(r, c)));
 
  w.updateRowActionButtons();
  kids = node.children.length;
  fireClick(rowAction("timeRangeFromSelection"), w);
  assert(node.children.length === kids + 1, "Table tab: Time range adds exactly one filter node");
  tr = newChild(node);
  assert(tr && tr.value.from === firstTs && tr.value.to === lastTs, "Table tab: Time range over every marked row spans the first to the last timestamp, got " + JSON.stringify(tr && tr.value));

  /* ---------- extraction table cell selection ---------- */
  section("big-array-spread f. columnsRangeCells over a 200,000-row extraction");
  let cells = null;
  try { cells = w.columnsRangeCells(0, 0); } catch (e) { err = e; }
  assert(cells && cells.length === N, "one whole column is " + N + " cells, got " + (cells ? cells.length : err));
  assert(cells && cells[0][0] === 0 && cells[0][1] === 0 && cells[N - 1][0] === N - 1 && cells[N - 1][1] === 0, "…from row 0 to row " + (N - 1) + " of that column");
  cells = [];
  try { cells = w.columnsRangeCells(0, 2); } catch (e) { err = e; }
  assert(cells.length === 3 * N, "three whole columns are " + 3 * N + " cells, got " + (cells.length || err));
  assert(cells.length === 3 * N && cells[N][1] === 1 && cells[3 * N - 1][0] === N - 1 && cells[3 * N - 1][1] === 2, "…column after column");
});
