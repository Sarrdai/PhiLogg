// GROUP 156 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 156 — Person-requested (2026-09-02): the Plot view's zoom/filter
   controls moved out of the shared extraction toolbar into a dedicated
   #plotToolbar row inside #plotWrap itself (same "real row, not an
   overlay" pattern as #contextToolbar in the Context view), plus a new
   Fullscreen button (plot only, exit via X or Esc) and a Save button
   (exports the plot exactly as currently zoomed/panned). Updated same
   session, same-day follow-up: the fullscreen close button didn't work for
   a 3D chart (its position:absolute button lost the stacking race to
   #plotChartArea specifically when #plot3dCanvas — hit-tested everywhere
   in its box, unlike mostly-transparent #plotSvg — was the visible child),
   fixed by giving the button a real header row instead of overlaying it;
   and the chart itself now always carries axis titles (column names) and,
   for multi-series line/bar, an in-SVG legend, so the separate DOM-only
   fullscreen legend was removed as redundant (the real one is included in
   fullscreen AND in the exported/saved image, since it's drawn as part of
   #plotSvg itself, unlike the old DOM sidecar).
   ============================================================ */
group(156);
await withApp(async (w, d, T) => {
  section("156a. Plot view's own toolbar lives inside #plotWrap; fullscreen open/close (button + Escape) for 2D and 3D");

  const log = Array.from({ length: 5 }, (_, i) => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${i} y=${i * 2} z=${i * 3}"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int] z=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");

  const plotWrap = d.querySelector("#plotWrap");
  const plotToolbar = d.querySelector("#plotToolbar");
  const plotBody = d.querySelector("#plotBody");
  const chartArea = d.querySelector("#plotChartArea");
  const overlay = d.querySelector("#plotFullscreenOverlay");
  assert(plotWrap.contains(plotToolbar), "the plot toolbar is a real row inside #plotWrap, not the shared extraction toolbar");
  assert(!d.querySelector("#extractToolbar").contains(plotToolbar), "the old shared-toolbar #plotZoomBar location no longer holds the plot toolbar");
  assert(plotBody.contains(chartArea), "the chart area starts out inside #plotBody, next to #plotControls");
  assert(overlay.classList.contains("hidden"), "the fullscreen overlay starts hidden");
  // The close button now lives in its own #plotFullscreenHeader flex row,
  // not position:absolute over the chart — that's the actual fix for the
  // 3D case (jsdom has no real layout engine to catch the old stacking bug
  // itself, see docs/extraction-and-plotting.md, but the structural fix is
  // asserted directly here).
  assert(d.querySelector("#plotFullscreenHeader").contains(d.querySelector("#plotFullscreenCloseBtn")), "the close button lives in its own header row, not overlaid on the chart");

  fireClick(d.querySelector("#plotFullscreenBtn"), w);
  assert(!overlay.classList.contains("hidden"), "clicking Fullscreen reveals the overlay");
  assert(d.querySelector("#plotFullscreenChartHost").contains(chartArea), "the SAME #plotChartArea node (not a copy) is moved into the fullscreen host, keeping its zoom/pan/hover listeners");
  assert(!plotBody.contains(chartArea), "the chart area is no longer under #plotBody while fullscreen");

  fireKeydown(d, w, "Escape");
  assert(overlay.classList.contains("hidden"), "Escape exits fullscreen");
  assert(plotBody.contains(chartArea), "the chart area moves back under #plotBody after exiting fullscreen");

  fireClick(d.querySelector("#plotFullscreenBtn"), w);
  assert(!overlay.classList.contains("hidden"), "Fullscreen can be re-opened after closing");
  fireClick(d.querySelector("#plotFullscreenCloseBtn"), w);
  assert(overlay.classList.contains("hidden"), "the X button exits fullscreen too (2D chart)");
  assert(plotBody.contains(chartArea), "the chart area is back under #plotBody after the X button");

  // Switch to 3D and repeat the X-button close — this is the actual
  // person-reported bug (worked for 2D, not for 3D).
  fireClick(d.querySelector('.plot-type-btn[data-type="3d"]'), w);
  fireClick(d.querySelector("#plotFullscreenBtn"), w);
  assert(!overlay.classList.contains("hidden"), "Fullscreen opens for a 3D chart too");
  fireClick(d.querySelector("#plotFullscreenCloseBtn"), w);
  assert(overlay.classList.contains("hidden"), "the X button exits fullscreen for a 3D chart too");

  // Save button: exercised for a synchronous crash only (jsdom's Image never
  // fires load/error for a blob: URL, so the async rasterization itself
  // can't be observed here — see docs/extraction-and-plotting.md).
  fireClick(d.querySelector("#plotSaveImageBtn"), w);
});

await withApp(async (w, d, T) => {
  section("156b. 2D plot axis titles (column names) and the in-SVG multi-series legend");

  const log = Array.from({ length: 5 }, (_, i) => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${i} y=${i * 2} z=${i * 3}"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int] z=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");

  // Single Y series (the default): both an X and a Y axis title, named
  // after their respective columns.
  let titles = Array.from(d.querySelectorAll("#plotSvg .plot-axis-title")).map(t => t.textContent);
  assert(titles.length === 2, "a single-series chart gets both an X and a Y axis title, got " + JSON.stringify(titles));
  assert(titles[0] === "Time", "the X title is \"Time\" for the default time column (clock ticks), got " + titles[0]);
  const yColName = w.findExtractColumn(T.plotConfig.yCols[0]).name;
  assert(titles[1] === yColName, "the Y title is the single plotted Y column's own name, got " + titles[1] + " expected " + yColName);
  assert(d.querySelectorAll("#plotSvg text").length > titles.length, "sanity: real tick-number labels are drawn too, not just the two titles");

  // Two Y series: the X title stays, but the Y title drops (ambiguous which
  // of two differently-named series it would describe) in favor of the
  // existing in-SVG per-series legend (swatch + name, drawn at the top of
  // the chart) — the same one that now ends up inside a fullscreen view and
  // an exported/saved image too, since it's part of #plotSvg itself.
  T.plotConfig.yCols = [1, 2];
  w.renderPlotChart();
  titles = Array.from(d.querySelectorAll("#plotSvg .plot-axis-title")).map(t => t.textContent);
  assert(titles.length === 1 && titles[0] === "Time", "with 2 Y series, only the X title remains, got " + JSON.stringify(titles));
  const name1 = w.findExtractColumn(1).name, name2 = w.findExtractColumn(2).name;
  const svgText = d.querySelector("#plotSvg").textContent;
  assert(svgText.includes(name1) && svgText.includes(name2), "both Y series' names appear somewhere in the chart (the in-SVG legend), got column names " + name1 + "/" + name2);
});
