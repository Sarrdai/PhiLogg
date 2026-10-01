// GROUP 178 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   Group 178 — this session (2026-09-04), person-requested: on the Plot
   tab, the Filter-Toolbar's row-actions all key off a log-row selection
   Plot doesn't have. REVISED 2026-09-08 (person-requested, unify the
   Table/Plot filters): "Time range"/"Select" resolve their input per view
   (a 2+ log-row multi-selection, marked-cell rows, or the plot's visible
   viewport). Plot's two dedicated buttons are removed entirely.
   REVISED AGAIN this session (2026-09-08, person-requested follow-up):
   "Filter after"/"Filter before" also resolve per view now (see
   afterBeforeActionEntries) and stay VISIBLE on Table/Plot too.
   REVISED ONCE MORE the same session (person-requested correction):
   "Message"/"Extract" — which both need exactly one reference entry — go
   back to hiding on BOTH Table and Plot, not just Plot; even though Table
   could technically supply a single marked row, it doesn't read as a
   sensible action there.
   ============================================================ */
group(178);
await withApp(async (w, d, T) => {
  section("178. Table/Plot: After/Before stay visible everywhere; Message/Extract hide on both");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();

  const byAction = action => d.querySelector('[data-row-action="' + action + '"]');
  const alwaysVisibleActions = ["filterAfter", "filterBefore"];
  const singleEntryActions = ["filterForMessage", "extractMessage"];

  // No plot-viewbar group any more — Plot's two dedicated buttons are gone.
  assert(d.querySelector('[data-row-actions="plot-viewbar"]') === null, "the plot-viewbar group is gone");
  assert(d.querySelector("#plotFilterTimeRangeBtn") === null && d.querySelector("#plotFilterEntriesBtn") === null,
    "Plot's two dedicated viewport-filter buttons are gone");

  // --- Context/Filtered: all row-actions show ---
  ["highlight", "filter"].forEach(tab => {
    w.applyFhView(tab);
    alwaysVisibleActions.concat(singleEntryActions).forEach(a => assert(isVisible(byAction(a), w) === true, a + " is visible on the " + tab + " tab"));
    assert(isVisible(byAction("timeRangeFromSelection"), w) === true, "Time range is visible on the " + tab + " tab");
  });

  // --- Table: After/Before stay visible (marked-row resolved); Message/Extract hide (doesn't read as sensible there) ---
  w.applyFhView("table");
  alwaysVisibleActions.forEach(a => assert(isVisible(byAction(a), w) === true, a + " stays visible on the Table tab"));
  singleEntryActions.forEach(a => assert(isVisible(byAction(a), w) === false, a + " hides on the Table tab (person-requested — doesn't read as sensible there)"));
  assert(isVisible(byAction("timeRangeFromSelection"), w) === true, "Time range stays visible on the Table tab (it is context-aware now)");

  // --- Plot: After/Before stay visible (viewport-resolved); Message/Extract both hide (no single-point reference on Plot) ---
  w.applyFhView("plot");
  alwaysVisibleActions.forEach(a => assert(isVisible(byAction(a), w) === true, a + " stays visible on the Plot tab (resolves from the visible viewport)"));
  singleEntryActions.forEach(a => assert(isVisible(byAction(a), w) === false, a + " hides on the Plot tab (no single-point reference there)"));
  assert(isVisible(byAction("timeRangeFromSelection"), w) === true, "Time range stays visible on the Plot tab (enabled only once a 2D plot exists)");

  // --- Leaving Table/Plot restores Message/Extract's visibility ---
  w.applyFhView("filter");
  alwaysVisibleActions.concat(singleEntryActions).forEach(a => assert(isVisible(byAction(a), w) === true, a + " is visible again on the Filtered tab"));
  assert(isVisible(byAction("timeRangeFromSelection"), w) === true, "Time range is visible again on the Filtered tab");
});
