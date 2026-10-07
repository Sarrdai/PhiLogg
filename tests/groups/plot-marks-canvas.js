// GROUP plot-marks-canvas — line/bar/scatter marks are painted on a canvas
// layer (#plotMarksCanvas) from a per-pixel-reduced op list instead of one SVG
// element per point; hover/click use a hit-test over every point; the
// selection ring is a canvas op; the PNG export paints the ops again; the Plot
// tab is drawn exactly once per switch / render() / node re-selection.
// Origin: 2026-10-07 (FEATURE_BACKLOG #97: 300k points took 11 s as SVG).
group("plot-marks-canvas");

const pmcPattern = "Position update x=[*:float] y=[*:float] z=[*:float]";
async function pmcOpen(w, d, T, entries, seed) {
  const [file] = LOGSIM.generateToStrings({ format: "default", entries, seed: seed || 7, scenarios: "position" });
  const f = await w.addFile("pmc-position.log", file.text, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", pmcPattern);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === entries, "sanity: one extraction row per entry, got " + T.extractRowsData.length);
  w.applyFhView("plot");
  return { f, node };
}
const pmcDraw = (w, cfg) => { Object.assign(w.__t.plotConfig, cfg); w.renderPlotControls(); w.renderPlotChart(); };
const pmcOps = (T, kind) => T.plotMarkOps.filter(o => o.kind === kind);
const pmcCell = (x, y) => Math.round(x) + "," + Math.round(y);

await withApp(async (w, d, T) => {
  section("plot-marks-canvas a. 100,000 points: no SVG marks, reduced ops, every point still a hover target");
  const N = 100000;
  await pmcOpen(w, d, T, N);
  for (const type of ["scatter", "line", "bar"]) {
    pmcDraw(w, { type, xCol: type === "line" ? -1 : 0, yCols: [1], colorCol: null, normalize: false }); // line: X = time, monotonic, so columns collapse
    const r = T.plotLastRender;
    assert(d.querySelectorAll("#plotSvg .plot-mark").length === 0, type + ": no .plot-mark SVG elements");
    assert(T.plotHoverPoints.length === N, type + ": every point stays a hover target, got " + T.plotHoverPoints.length);
    assert(!d.querySelector("#plotMarksCanvas").classList.contains("hidden"), type + ": the marks canvas is shown");
    if (type === "bar") {
      const cols = new Set(T.plotHoverPoints.map(h => Math.round(h.bx) + "," + Math.round(h.bw)));
      const rects = pmcOps(T, "rect");
      assert(rects.length > 0 && rects.length <= cols.size && rects.length < N / 4, "bar: at most one rect per distinct pixel column+width (" + cols.size + "), got " + rects.length + " of " + N);
    } else {
      const cells = new Set(T.plotHoverPoints.map(h => pmcCell(h.px, h.py)));
      const circles = pmcOps(T, "circle");
      assert(circles.length > 0 && circles.length <= cells.size && circles.length < N / 4, type + ": at most one circle per distinct pixel (" + cells.size + "), got " + circles.length + " of " + N);
    }
    if (type === "line") {
      const paths = pmcOps(T, "path");
      assert(paths.length === 1 && paths[0].pts.length <= 4 * (r.W + 2) && paths[0].pts.length > 10, "line: the polyline keeps at most 4 points per pixel column, got " + paths[0].pts.length + " (W " + r.W + ")");
      pmcDraw(w, { type, xCol: 0 });
      assert(pmcOps(T, "path")[0].pts.length < N, "line over a non-monotonic X: consecutive same-column points collapse too");
    }
  }
});

await withApp(async (w, d, T) => {
  section("plot-marks-canvas b. small data: every point has its op, violated points their ring");
  await pmcOpen(w, d, T, 60, 5);
  const node = T.state.nodes[T.state.activeId];
  const ys = T.extractRowsData.map(r => parseFloat(r.values[1])).sort((a, b) => a - b);
  node.assertions = { 1: { mode: "range", min: ys[10], max: ys[49] } };
  w.render();
  pmcDraw(w, { type: "scatter", xCol: 0, yCols: [1], colorCol: null });
  const violated = T.plotLastSeries[0].pts.filter(p => p.violated).map(p => p.rowIndex);
  assert(violated.length >= 15, "sanity: the assertion flags several rows, got " + violated.length);
  const circleCells = new Map(pmcOps(T, "circle").map(o => [pmcCell(o.x, o.y), o]));
  assert(T.plotHoverPoints.every(h => circleCells.has(pmcCell(h.px, h.py)) && circleCells.get(pmcCell(h.px, h.py)).r === 4 && circleCells.get(pmcCell(h.px, h.py)).alpha === 0.85),
    "scatter: every point has a circle op in its pixel (r 4, alpha 0.85)");
  const vioCells = new Set(T.plotHoverPoints.filter(h => violated.includes(h.rowIndex)).map(h => pmcCell(h.px, h.py)));
  const rings = pmcOps(T, "ring");
  assert(rings.length === vioCells.size && rings.every(o => o.r === 6.5 && vioCells.has(pmcCell(o.x, o.y))), "scatter: one assertion ring (r 6.5) per violated pixel, got " + rings.length + " vs " + vioCells.size);

  pmcDraw(w, { type: "line", xCol: 0, yCols: [1] });
  const path = pmcOps(T, "path")[0];
  assert(path && path.width === 1.8 && path.pts.length >= 2, "line: a polyline op");
  const colMinMax = new Map();
  T.plotHoverPoints.forEach(h => { const c = Math.round(h.px), m = colMinMax.get(c) || [Infinity, -Infinity]; m[0] = Math.min(m[0], h.py); m[1] = Math.max(m[1], h.py); colMinMax.set(c, m); });
  const pathCol = new Map();
  path.pts.forEach(([x, y]) => { const c = Math.round(x), m = pathCol.get(c) || [Infinity, -Infinity]; m[0] = Math.min(m[0], y); m[1] = Math.max(m[1], y); pathCol.set(c, m); });
  assert([...colMinMax].every(([c, m]) => pathCol.has(c) && pathCol.get(c)[0] === m[0] && pathCol.get(c)[1] === m[1]), "line: the polyline reaches every pixel column's lowest and highest point");
  assert(pmcOps(T, "circle").every(o => o.r === 2.6 && o.alpha === 1) && pmcOps(T, "ring").every(o => o.r === 5), "line: markers r 2.6, rings r 5");
  assert(pmcOps(T, "ring").length > 0, "line: violated points are ringed");

  pmcDraw(w, { type: "bar", xCol: 0, yCols: [1] });
  const rects = pmcOps(T, "rect");
  assert(T.plotHoverPoints.every(h => rects.some(o => Math.round(o.x) === Math.round(h.bx) && Math.round(o.w) === Math.round(h.bw) && o.y <= h.by + 1e-9 && o.y + o.h >= h.by + h.bh - 1e-9)),
    "bar: every bar is covered by a rect op in its pixel column");
  assert(pmcOps(T, "rectStroke").length > 0, "bar: violated bars get a stroked rect");

  // Panned out of the plot rect: ops outside the clip are dropped, hover targets stay.
  T.plotZoom = { x0: T.plotLastRender.xDomainMin, x1: T.plotLastRender.xDomainMin + 1e-9, y0: 0, y1: 1 };
  w.renderPlotChart();
  assert(T.plotHoverPoints.length > 0 && T.plotMarkOps.length < 20, "zoomed far away: hover targets kept, ops culled, got " + T.plotMarkOps.length);
  T.plotZoom = null;
});

await withApp(async (w, d, T) => {
  section("plot-marks-canvas c. hover and click go through the hit-test over every point");
  await pmcOpen(w, d, T, 80, 11);
  pmcDraw(w, { type: "scatter", xCol: 0, yCols: [1], colorCol: null });
  const svg = d.querySelector("#plotSvg"), tip = d.querySelector("#plotTooltip");
  const h5 = plotHoverOfRow(T, 5);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: h5.px, clientY: h5.py }));
  assert(!tip.classList.contains("hidden") && svg.classList.contains("plot-over-mark"), "hovering a point shows the tooltip and the pointer cursor class");
  assert(tip.textContent.includes(String(T.extractRowsData[5].values[1])), "the tooltip carries row 5's value, got " + tip.textContent);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }));
  assert(tip.classList.contains("hidden") && !svg.classList.contains("plot-over-mark"), "moving into the margin hides both again");

  fireClickAt(svg, w, h5.px, h5.py);
  assert(T.state.selectedId === T.extractRowsData[5].entry.id && T.fhActiveTab === "plot", "a click selects exactly the entry the tooltip showed");
  assert(T.plotSelRingOps.length === 1 && T.plotSelRingOps[0].x === h5.px && T.plotSelRingOps[0].y === h5.py && T.plotSelRingOps[0].r > 4, "the ring op sits on the selected point");
  fireClickAt(svg, w, 2, 2);
  assert(T.state.selectedId === T.extractRowsData[5].entry.id, "a click on empty space keeps the selection");
  fireDblClickAt(svg, w, h5.px, h5.py);
  assert(T.fhActiveTab === "table" && T.state.selectedId === T.extractRowsData[5].entry.id, "a double-click reveals the entry in Table");
  w.applyFhView("plot");

  // A rectangle drag zooms; its trailing click does not select.
  const before = T.state.selectedId;
  const r0 = T.plotLastRender;
  const x0 = r0.left + 10, y0 = r0.top + 10, x1 = r0.left + r0.plotW * 0.75, y1 = r0.top + r0.plotH * 0.75;
  svg.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: x0, clientY: y0, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: x1, clientY: y1 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: x1, clientY: y1, button: 0 }));
  const h5z = plotHoverOfRow(T, 5);
  const lr = T.plotLastRender;
  const other = T.plotHoverPoints.find(h => h.rowIndex !== 5 && h.px > lr.left && h.px < lr.left + lr.plotW && h.py > lr.top && h.py < lr.top + lr.plotH && Math.hypot(h.px - h5z.px, h.py - h5z.py) > 30);
  assert(T.plotZoom && other, "sanity: the drag zoomed (" + JSON.stringify(T.plotZoom) + ") and another point is visible");
  fireClickAt(svg, w, other.px, other.py);
  assert(T.state.selectedId === before, "the click ending a drag does not select");
  fireClickAt(svg, w, other.px, other.py);
  assert(T.state.selectedId === T.extractRowsData[other.rowIndex].entry.id, "the next plain click does");
  T.plotZoom = null;

  // Everything squeezed into a few pixels: points hidden by dedup still hit-test to a real row.
  pmcDraw(w, { xMin: "-100000", xMax: "100000", yMin: "-100000", yMax: "100000" });
  const ops = pmcOps(T, "circle");
  assert(ops.length < 5 && T.plotHoverPoints.length === 80, "sanity: 80 points collapse into " + ops.length + " circle ops");
  const hidden = T.plotHoverPoints.find(h => ops.some(o => pmcCell(o.x, o.y) === pmcCell(h.px, h.py) && o.rowIndex !== h.rowIndex));
  assert(hidden, "sanity: a point whose pixel was taken over by a later one");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: hidden.px, clientY: hidden.py }));
  assert(!tip.classList.contains("hidden"), "the hidden point still shows a tooltip");
  fireClickAt(svg, w, hidden.px, hidden.py);
  const hit = w.plotHitTest({ x: hidden.px, y: hidden.py });
  assert(hit && T.extractRowsData[hit.rowIndex] && T.state.selectedId === T.extractRowsData[hit.rowIndex].entry.id, "...and a click selects a real row");
  pmcDraw(w, { xMin: "", xMax: "", yMin: "", yMax: "" });

  // Bars: hit-test is the bar rect.
  pmcDraw(w, { type: "bar" });
  const bar = plotHoverOfRow(T, 7);
  fireClickAt(svg, w, bar.bx + bar.bw / 2, bar.by + bar.bh / 2);
  assert(T.state.selectedId === T.extractRowsData[7].entry.id && T.plotSelRingOps[0].kind === "rectStroke", "bar: a click inside the rect selects the row and rings it");

  // Value charts stay SVG: the canvas is hidden and its ops are gone.
  pmcDraw(w, { type: "parallel" });
  assert(d.querySelector("#plotMarksCanvas").classList.contains("hidden") && T.plotMarkOps.length === 0 && T.plotSelRingOps.length === 0, "a value chart hides the marks canvas and clears the ops");
  assert(d.querySelectorAll("#plotSvg .plot-mark, #plotSvg .plot-pc-line").length > 0, "...and keeps its SVG marks");
});

await withApp(async (w, d, T) => {
  section("plot-marks-canvas d. image export paints the ops and the ring over the SVG");
  await pmcOpen(w, d, T, 50, 3);
  const rec = () => { const calls = []; const ctx = new Proxy({}, { get: (_, k) => k === "calls" ? calls : (...a) => { calls.push([k, ...a]); }, set: (_, k, v) => { calls.push(["set:" + k, v]); return true; } }); return ctx; };
  pmcDraw(w, { type: "scatter", xCol: 0, yCols: [1], colorCol: null });
  fireClickAt(d.querySelector("#plotSvg"), w, plotHoverOfRow(T, 4).px, plotHoverOfRow(T, 4).py);
  let ctx = rec();
  assert(w.composePlotExport(ctx, T.plotLastRender.W, T.plotLastRender.H) === true, "scatter: composePlotExport has marks to paint");
  const arcs = ctx.calls.filter(c => c[0] === "arc");
  assert(arcs.length === pmcOps(T, "circle").length + T.plotSelRingOps.length + pmcOps(T, "ring").length, "scatter: one arc per circle op, assertion ring and the selection ring, got " + arcs.length);
  assert(ctx.calls.some(c => c[0] === "arc" && c[1] === plotHoverOfRow(T, 4).px && c[3] > 4 + 3), "the selection ring is painted too");
  assert(ctx.calls.some(c => c[0] === "clip"), "painted inside the plot-rect clip");

  pmcDraw(w, { type: "bar" });
  ctx = rec();
  assert(w.composePlotExport(ctx, 400, 200) === true, "bar: composePlotExport has bars to paint");
  assert(ctx.calls.filter(c => c[0] === "fillRect").length === pmcOps(T, "rect").length, "bar: one fillRect per rect op");
  const sc = ctx.calls.find(c => c[0] === "scale");
  assert(sc && Math.abs(sc[1] - Math.min(400 / T.plotLastRender.W, 200 / T.plotLastRender.H)) < 1e-9, "painted at the export's own scale");

  pmcDraw(w, { type: "parallel" });
  ctx = rec();
  assert(w.composePlotExport(ctx, 400, 200) === false && ctx.calls.length === 0, "value chart: nothing but the SVG is exported");
});

await withApp(async (w, d, T) => {
  section("plot-marks-canvas e. the Plot tab is drawn once per switch, render() and node re-selection");
  const { f, node } = await pmcOpen(w, d, T, 30, 9);
  let draws = 0;
  const orig = w.renderPlotChart;
  w.renderPlotChart = function () { draws++; return orig.apply(this, arguments); };
  w.applyFhView("table"); draws = 0;
  w.applyFhView("plot");
  assert(draws === 1, "switching Table -> Plot draws once, got " + draws);
  draws = 0;
  w.render();
  assert(draws === 1, "render() while Plot is shown draws once, got " + draws);
  T.state.activeId = f.id;
  w.render();
  assert(T.fhActiveTab === "filter" || T.fhActiveTab === "highlight", "sanity: the file node shows a log tab, got " + T.fhActiveTab);
  draws = 0;
  T.state.activeId = node.id;
  w.render();
  assert(T.fhActiveTab === "plot", "sanity: re-selecting the extraction node lands on Plot again, got " + T.fhActiveTab);
  assert(draws === 1, "re-selecting the node draws once, got " + draws);
  assert(d.querySelector("#plotSvg").children.length > 0 && T.plotMarkOps.length > 0, "and the chart is there");
  w.renderPlotChart = orig;
});
