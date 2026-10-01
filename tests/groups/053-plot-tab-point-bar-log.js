// GROUP 53 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 53 — Plot tab: point/bar -> log entry, and an "Equal axis scale"
   option
   Origin: this session (2026-08-18, person-requested backlog items):
   "Plot Point → Log-Eintrag" (the Plot tab was previously a dead end — an
   outlier was visible but not reachable, per PROJECT.md's "Known
   limitations") and "Plot Option für Axis-Equal" (so an x/y position plot
   isn't visually distorted by the chart area's own, generally non-square,
   aspect ratio). Both are additive plotConfig/UI-state features (plotConfig
   gains `axisEqual`, ephemeral like `normalize`/xMin/etc. — not threaded
   through any persistence carrier, so none is tested here).
   ============================================================ */
group(53);
await withApp(async (w, d, T) => {
  section("53. Plot: point -> log entry, axis-equal");
  // Three entries with x/y values on the SAME 0..20 scale on both axes —
  // deliberately, so any leftover pixel-distortion between the two axes
  // below can only come from the chart area's own aspect ratio (708x332
  // per the stubbed 800x400 clientWidth/Height minus PLOT_MARGIN), not from
  // the data itself.
  const rows = [[0, 0], [10, 10], [20, 20]];
  const log = rows.map(([x, y], i) =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y}"`
  ).join("\n") + "\n";
  const f = await w.addFile("pos.log", log, () => {});
  w.render();
  T.state.activeId = f.id;

  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 3, "sanity: one extraction row per entry");

  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));

  /* ---------- Axis-equal ---------- */
  const markByRow = r => d.querySelector('#plotSvg circle.plot-mark[data-row="' + r + '"]');
  const pxPerUnit = () => {
    const m0 = markByRow(0), m2 = markByRow(2);
    return {
      x: (parseFloat(m2.getAttribute("cx")) - parseFloat(m0.getAttribute("cx"))) / 20,
      y: Math.abs(parseFloat(m0.getAttribute("cy")) - parseFloat(m2.getAttribute("cy"))) / 20,
    };
  };
  assert(T.plotConfig.axisEqual === false, "axis-equal defaults off, matching every other plotConfig flag");
  const before = pxPerUnit();
  assert(Math.abs(before.x - before.y) > 1, "sanity: without axis-equal, X and Y pixels-per-unit differ substantially (708x332 chart area, same 0..20 data range on both axes), got x=" + before.x.toFixed(3) + " y=" + before.y.toFixed(3));

  const axisCb = d.querySelector("#plotAxisEqual");
  assert(axisCb !== null, "'Equal axis scale' toggle is offered for a non-bar chart type (scatter)");
  fireClick(axisCb, w);
  assert(T.plotConfig.axisEqual === true, "toggling the pill flips plotConfig.axisEqual");

  const after = pxPerUnit();
  // Small epsilon: cx/cy are serialized via toFixed(1) in the SVG markup, so
  // a little quantization noise survives the round trip through the DOM.
  assert(Math.abs(after.x - after.y) < 0.1, "with axis-equal on, X and Y pixels-per-unit now match, got x=" + after.x.toFixed(3) + " y=" + after.y.toFixed(3));
  assert(Math.abs(after.y - before.y) < 0.1, "the axis that already had the tighter (smaller) pixel budget per unit — Y, the shorter dimension — is left unpadded; only X's domain widens to meet it");

  // Bar charts have a categorical X axis — no equal-scale option offered.
  fireClick(d.querySelector('.plot-type-btn[data-type="bar"]'), w);
  assert(d.querySelector("#plotAxisEqual") === null, "no axis-equal checkbox for a bar chart (categorical X)");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  d.querySelector("#plotXSelect").value = "0";
  d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1";
  d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));

  /* ---------- Point -> log entry ---------- */
  const marks = [...d.querySelectorAll("#plotSvg circle.plot-mark")];
  assert(marks.length === 3, "one clickable mark per plotted row, got " + marks.length);
  const targetEntry = T.extractRowsData[1].entry; // the x=10,y=10 row
  const targetMark = markByRow(1);
  assert(targetMark, "row 1's mark carries a data-row attribute for the click handler to resolve");

  fireClick(targetMark, w);
  assert(T.state.activeId === node.id,
    "clicking a plot mark reveals the entry as the corresponding Table row (revealInTableView, person-requested this session) — it stays on the extraction-capable node rather than jumping away to the raw file");
  assert(T.fhActiveTab === "table", "the Table tab becomes active, not Filtered — Filtered is one more step away via that row's own double-click");
  assert(T.state.selectedId === targetEntry.id, "the clicked mark's real underlying entry becomes selected");

  // Clicking empty chart space (not a mark) is a no-op — sanity that the
  // delegated listener doesn't misfire on the axes/gridlines/background.
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  const beforeClick = T.state.activeId;
  fireClick(d.querySelector("#plotSvg"), w);
  assert(T.state.activeId === beforeClick, "clicking the plot SVG background (no mark under the cursor) doesn't navigate away");
});
