// GROUP 123 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 123 — "Create filter from plot view" (FEATURE_BACKLOG.md #11)
   Origin: this session. Originally offered BOTH options off the Plot tab's
   zoomed/panned viewport via two dedicated buttons (#plotFilterTimeRangeBtn
   -> "timerange", #plotFilterEntriesBtn -> "idset"). Rewritten this session
   (person-requested): those two plot-specific buttons are gone — the unified
   "Time range" row-action (`[data-row-action="timeRangeFromSelection"]` in
   #viewBar) now covers the time-range half from the Plot tab's own viewport
   (see timeRangeActionEntries), and the entry-set half moved to the unified
   "Select" action (see GROUP 183). This group keeps the "idset" filterType's
   own direct coverage, the getPlotViewportEntries primitive (incl. its Y-axis
   bugfix), and the Plot-tab "Time range" -> "timerange" path.
   ============================================================ */
group(123);
await withApp(async (w, d, T) => {
  section("123. \"Create filter from plot view\": the unified Time-range action + getPlotViewportEntries from the Plot tab's visible viewport");

  // 5 entries, 1s apart, extracting a distinct int per row (0,10,20,30,40) —
  // the synthetic Index column (default X axis, plottable[0]) then gives a
  // clean, exact 0..4 row-index domain to zoom into.
  const lines = [0, 10, 20, 30, 40].map((n, i) =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"n=${n}"`
  );
  const logText = lines.join("\n") + "\n";
  const f = await w.addFile("plotfilter.log", logText, () => {});
  w.render();

  // --- getEntries "idset" branch, direct sanity check ---
  const idNode = w.createFilterNode(f.id, "idset", [f.entries[1].id, f.entries[3].id]);
  assert(idNode.filterType === "idset" && idNode.name.includes("2") && idNode.name.includes("entries"),
    "an idset node's display name reports its entry count");
  const idResult = w.getEntries(idNode.id);
  assert(idResult.length === 2 && idResult.some(e => e.id === f.entries[1].id) && idResult.some(e => e.id === f.entries[3].id),
    "an idset filter matches exactly the entries in its value array, regardless of order in the parent");

  // "idset" needed no new persistence-carrier code — its value rides the
  // same generic node.value field every filter type already gets copied
  // through (same precedent as "timerange", see docs/filters.md) — verified
  // directly via a real cloneSubtree (copy/paste) round trip.
  T.state.activeId = idNode.id;
  T.state.clipboard = { id: idNode.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pastedIdNode = T.state.nodes[f.children[f.children.length - 1]];
  assert(pastedIdNode.filterType === "idset" && JSON.stringify(pastedIdNode.value.slice().sort()) === JSON.stringify(idNode.value.slice().sort()),
    "cloneSubtree (copy/paste) carries an idset node's entry-id array to the pasted copy, confirming the generic value-field precedent holds");

  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  // A newly-activated node now defaults to Filtered (person-requested, see
  // GROUP 161) instead of auto-jumping to Table/Plot — applyFhView("plot"),
  // the real path a Plot tab click takes, is what actually renders
  // #extractWrap's content.
  w.applyFhView("plot");
  assert(T.extractRowsData.length === 5, "sanity: one extraction row per entry");
  assert(T.plotConfig.xCol === -1, "sanity: the time column (-1) is the default X axis (tablet UX round, step 5)");
  // The zoom checks below are written in Index units: pick Index explicitly (a user-changed choice is kept).
  T.plotConfig.xCol = -2;
  w.renderPlotControls();
  w.renderPlotChart();

  // The unified "Time range" row-action is still in #viewBar and stays
  // visible on the Plot tab now (person-requested: it replaced Plot's own
  // dedicated "Filter: time range" button).
  const timeRangeBtn = d.querySelector('[data-row-action="timeRangeFromSelection"]');
  assert(isVisible(timeRangeBtn, w) === true, "\"Time range\" stays visible on the Plot tab (it is context-aware now)");
  assert(timeRangeBtn.disabled === false, "\"Time range\" is enabled once a 2D plot exists");

  const beforeChildren = node.children.length;

  // No zoom active yet (home view) — the whole extraction is "visible".
  fireClick(timeRangeBtn, w);
  assert(node.children.length === beforeChildren + 1, "clicking \"Time range\" with no zoom active creates one new child filter");
  const homeTimeNode = T.state.nodes[node.children[node.children.length - 1]];
  assert(homeTimeNode.filterType === "timerange" && homeTimeNode.value.from === f.entries[0].ts && homeTimeNode.value.to === f.entries[4].ts,
    "with no zoom, the time-range filter spans the FULL extraction's timestamps (home view == the whole result)");

  // Zoom the plot's X domain down to rows [1.5, 3.5] — i.e. rows 2 and 3
  // only (Index values 2 and 3) — directly via the plotZoom test hook
  // (equivalent to what the wheel/drag-rect zoom interaction would produce),
  // then re-render so plotLastRender reflects it.
  T.state.activeId = node.id;
  T.plotZoom = { x0: 1.5, x1: 3.5, y0: -1e6, y1: 1e6 };
  w.applyFhView("plot"); // back to Plot — the first click switched to Filtered (see applyActivationView)
  assert(T.plotLastRender.xDomainMin > 1 && T.plotLastRender.xDomainMax < 4, "sanity: the zoomed render's X domain is narrowed to roughly [1.5, 3.5]");

  fireClick(timeRangeBtn, w);
  const zoomedTimeNode = T.state.nodes[node.children[node.children.length - 1]];
  assert(zoomedTimeNode.filterType === "timerange" && zoomedTimeNode.value.from === f.entries[2].ts && zoomedTimeNode.value.to === f.entries[3].ts,
    "with the same zoom, \"Time range\" spans only rows 2..3's timestamps, not the full extraction's");

  // Zooming into a gap with no rows at all (strictly between two integer
  // Index values, well inside the home domain so clampZoomAxis's
  // zoom-out-buffer snapping can't pull a real row back into view at an
  // edge) must not create a broken/empty filter (and a single-element/empty
  // viewport doesn't satisfy the 2+ requirement — a toast is shown instead).
  T.state.activeId = node.id;
  T.plotZoom = { x0: 2.6, x1: 2.9, y0: -1e6, y1: 1e6 };
  w.applyFhView("plot"); // back to Plot again (the previous click switched to Filtered)
  assert(w.getPlotViewportEntries().length === 0, "sanity: this zoom window genuinely contains no row's Index value");
  const beforeEmptyClickCount = node.children.length;
  fireClick(timeRangeBtn, w);
  assert(node.children.length === beforeEmptyClickCount, "a viewport with fewer than two visible entries creates no filter node at all (a toast is shown instead)");

  // --- Bugfix (this session, person-reported): getPlotViewportEntries used
  // to only check the X domain, so a row panned/zoomed OUT of view on the Y
  // axis alone (in range on X, off-screen on Y) was still counted as
  // "visible" and included in the created filter. Full X range, Y range
  // narrowed to rows with n=20/30/40 (indices 2..4) only, excluding n=0/10
  // (indices 0..1) which stay in X range but fall below the Y window. ---
  T.state.activeId = node.id;
  T.plotZoom = { x0: -1e6, x1: 1e6, y0: 15, y1: 45 };
  w.renderPlotChart();
  const yFiltered = w.getPlotViewportEntries();
  assert(yFiltered.length === 3 &&
    [f.entries[2].id, f.entries[3].id, f.entries[4].id].every(id => yFiltered.some(e => e.id === id)) &&
    ![f.entries[0].id, f.entries[1].id].some(id => yFiltered.some(e => e.id === id)),
    "getPlotViewportEntries excludes rows that are in the X range but panned/zoomed out of the Y range, got " + yFiltered.length);
});
