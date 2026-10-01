// GROUP 184 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 184 — Minimap sync for Table & Plot (this session, 2026-09-08,
   person-requested bugfix): updateMinimapRenderedRange() previously had no
   branch for fhActiveTab === "table"/"plot" — switching to either view left
   #minimapRenderedRangeRect showing whatever the Log view last computed,
   and scrolling the table or zooming the plot did nothing to it.
     a) New Table branch: derives the visible row range from
        extractScroll.scrollTop/EXTRACT_ROW_HEIGHT (fixed row height, same
        idea as minimapRenderedSpan's flat-ROW_HEIGHT case, header height
        subtracted first — see renderExtractVisibleRows), sets the rect from
        the first/last visible row's entry.ts via minimapBarSpan. Wired into
        renderExtractTable() (Table branch) and the extractScroll scroll
        listener (rAF-batched, same pattern as tableBody/highlightBody).
     b) New Plot branch + new shared helper visiblePlotPoints() (also meant
        for Paket B's filter-info point count): every finite-(x,y) point
        from the last render, restricted to plotZoom's x-domain when set.
        The rect bounds come from each point's SOURCE ENTRY ts
        (extractRowsData[p.rowIndex].entry.ts), not the plotted x value —
        the X column plotted is often not time at all. Wired into
        renderPlotChart()'s end (covers every plotZoom-changing call site
        too, since they all re-render the chart).
     c) Both renderExtractTable()/renderPlotChart() now also call
        renderTimelineMinimap(rootId, entries) with their OWN view's
        entries, so the minimap's background/full-range reflects Table/Plot
        data instead of stale Log-view data — renderTimelineMinimap() does
        NOT call updateMinimapRenderedRange() itself, so both are called.
   ============================================================ */
group(184);
await withApp(async (w, d, T) => {
  section("184a. Table view: #minimapRenderedRangeRect follows extractScroll's scroll position");

  const f = await w.addFile("a.log", makeLog(0, 100), () => {}); // 100 entries, 1s apart
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.fhActiveTab === "table", "sanity: Table tab active");
  assert(T.extractRowsData.length === 100, "sanity: 100 extraction rows");

  const rect = d.querySelector("#minimapRenderedRangeRect");
  const extractScrollEl = d.querySelector("#extractScroll");
  assert(!rect.classList.contains("hidden"), "rect visible once the Table view has rows");

  // Scroll to bring rows [30..~44] into the (400px-tall, EXTRACT_ROW_HEIGHT=28) viewport.
  extractScrollEl.scrollTop = 30 * 28;
  extractScrollEl.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 50)); // let the rAF-batched scroll handler flush

  const headerH = d.querySelector("#extractHead").offsetHeight || 0;
  const viewportH = extractScrollEl.clientHeight || 400;
  const bodyScrollTop = Math.max(0, extractScrollEl.scrollTop - headerH);
  const startIdx = Math.min(99, Math.max(0, Math.floor(bodyScrollTop / 28)));
  const endIdx = Math.min(99, Math.max(startIdx, Math.ceil((bodyScrollTop + viewportH) / 28)));
  const expLeft = w.minimapBarSpan(T.extractRowsData[startIdx].entry.ts).left;
  const expRight = w.minimapBarSpan(T.extractRowsData[endIdx].entry.ts).right;
  assert(Math.abs(+rect.getAttribute("x") - expLeft) < 0.2,
    "rect x matches the scrolled-to row range's earliest ts, got " + rect.getAttribute("x") + " expected ~" + expLeft.toFixed(1));
  assert(Math.abs(+rect.getAttribute("width") - Math.max(2, expRight - expLeft)) < 0.2,
    "rect width matches the scrolled-to row range's span, got " + rect.getAttribute("width") + " expected ~" + Math.max(2, expRight - expLeft).toFixed(1));

  // Scrolling further changes it again — proves this isn't a one-shot value frozen at the first scroll.
  const rectXAtRow30 = +rect.getAttribute("x");
  extractScrollEl.scrollTop = 80 * 28;
  extractScrollEl.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(+rect.getAttribute("x") > rectXAtRow30, "scrolling further down the table moves the rect further right, got " + rect.getAttribute("x") + " (was " + rectXAtRow30 + ")");
});

await withApp(async (w, d, T) => {
  section("184b. Plot view: #minimapRenderedRangeRect narrows to plotZoom's time span; visiblePlotPoints() reflects it");

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

  // NOTE: re-queried after every render() call below, never cached across
  // one — renderPlotChart() calls renderTimelineMinimap(), which rebuilds
  // the minimap SVG's innerHTML wholesale (a fresh #minimapRenderedRangeRect
  // node each time), detaching any previously-held reference.
  assert(!d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"), "sanity: rect visible for the unzoomed (home) Plot view");
  const homeWidth = +d.querySelector("#minimapRenderedRangeRect").getAttribute("width");
  assert(w.visiblePlotPoints().length === 11, "visiblePlotPoints() reports all 11 points at the home (unzoomed) view");

  // Zoom to x in [40, 60] — rows 4..6 (x=40,50,60).
  T.plotZoom = { x0: 40, x1: 60, y0: 0, y1: 100 };
  w.renderPlotChart();
  const zoomedPts = w.visiblePlotPoints();
  assert(zoomedPts.length === 3, "visiblePlotPoints() restricted to plotZoom's x-domain reports exactly the 3 in-range points, got " + zoomedPts.length);

  const rectAfterZoom = d.querySelector("#minimapRenderedRangeRect");
  const zoomedWidth = +rectAfterZoom.getAttribute("width");
  assert(zoomedWidth < homeWidth, "rect narrows once zoomed, got " + zoomedWidth + " (was " + homeWidth + " unzoomed)");
  const expLeft = w.minimapBarSpan(T.extractRowsData[4].entry.ts).left;
  const expRight = w.minimapBarSpan(T.extractRowsData[6].entry.ts).right;
  assert(Math.abs(+rectAfterZoom.getAttribute("x") - expLeft) < 0.2, "rect x matches the zoomed span's earliest source-entry ts, got " + rectAfterZoom.getAttribute("x") + " expected ~" + expLeft.toFixed(1));
  assert(Math.abs(zoomedWidth - Math.max(2, expRight - expLeft)) < 0.2, "rect width matches the zoomed span, got " + zoomedWidth + " expected ~" + Math.max(2, expRight - expLeft).toFixed(1));

  // Zooming out to where nothing matches hides the rect instead of leaving a stale span.
  T.plotZoom = { x0: 1000, x1: 2000, y0: 0, y1: 100 };
  w.renderPlotChart();
  assert(d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"), "rect hides when plotZoom's x-domain matches zero points");
});

await withApp(async (w, d, T) => {
  section("184c. Regression: Log -> Table -> Plot -> Log leaves no stale rendered-range span at any point");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {}); // 60 entries, 1s apart
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();

  // NOTE: re-queried after every render() call below, never cached across
  // one — Table/Plot's renders call renderTimelineMinimap(), which rebuilds
  // the minimap SVG's innerHTML wholesale (a fresh #minimapRenderedRangeRect
  // node each time), detaching any previously-held reference.
  const tableBodyEl = d.querySelector("#tableBody");

  // --- Log (Filtered) view: scroll to row 40, note its span ---
  w.applyFhView("filter");
  tableBodyEl.scrollTop = 40 * 28; // ROW_HEIGHT=28
  w.renderVisibleRows();
  w.updateMinimapRenderedRange();
  const logX = +d.querySelector("#minimapRenderedRangeRect").getAttribute("x");
  assert(!d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"), "sanity: rect visible in the Log/Filtered view");

  // --- Table view: rect must reflect Table's OWN scroll (top of the table), not the Log view's leftover span ---
  w.applyFhView("table");
  const extractScrollEl = d.querySelector("#extractScroll");
  assert(extractScrollEl.scrollTop === 0, "sanity: Table view starts scrolled to the top for this freshly-activated node");
  const tableX = +d.querySelector("#minimapRenderedRangeRect").getAttribute("x");
  const expTableLeft = w.minimapBarSpan(T.extractRowsData[0].entry.ts).left;
  assert(Math.abs(tableX - expTableLeft) < 0.2, "switching to Table immediately re-evaluates the rect from Table's own (top-of-scroll) span, not the Log view's row-40 span, got " + tableX + " expected ~" + expTableLeft.toFixed(1));

  // --- Plot view: rect must reflect Plot's own visible points, not Table's leftover span ---
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "-1"; xSel.dispatchEvent(new w.Event("change", { bubbles: true })); // t (ms) column
  ySel.value = "0"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const plotX = +d.querySelector("#minimapRenderedRangeRect").getAttribute("x");
  const expPlotLeft = w.minimapBarSpan(T.extractRowsData[0].entry.ts).left;
  assert(Math.abs(plotX - expPlotLeft) < 0.2, "switching to Plot re-evaluates the rect from Plot's own visible points (all 60, unzoomed), got " + plotX + " expected ~" + expPlotLeft.toFixed(1));

  // --- Back to Log view: rect must NOT still show Table/Plot's leftover span ---
  w.applyFhView("filter");
  const backX = +d.querySelector("#minimapRenderedRangeRect").getAttribute("x");
  assert(Math.abs(backX - logX) < 0.2, "switching back to Log/Filtered restores the Log view's own row-40 span (not left stuck on Table/Plot's), got " + backX + " expected ~" + logX.toFixed(1));
});
