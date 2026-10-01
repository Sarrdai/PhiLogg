// GROUP 175 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   Group 175 — this session (2026-09-04), person-requested:
   1. Removed #statusStrip ("N of M shown" bar) entirely.
   2. Added a "view toolbar" to the Filtered view (#filteredToolbar, inside
      #tableWrap, same real-row-under-the-header pattern as #contextToolbar)
      and to the Table view (#tableToolbar, inside #extractWrap, same pattern
      as #plotToolbar) — both currently empty, buttons land later. Stacked
      layout shows both #contextToolbar and #filteredToolbar at once since
      both panels are simply visible together in that layout.
   ============================================================ */
group(175);
await withApp(async (w, d, T) => {
  section("175. Status strip removed; Filtered/Table views get their own toolbar row");

  assert(d.querySelector("#statusStrip") === null, "#statusStrip no longer exists in the DOM");

  const fa = await w.addFile("a.log", makeLog(0, 10), () => {});
  const extractNode = w.createFilterNode(fa.id, "text", "message [*:int]");
  T.state.activeId = fa.id;
  w.render();

  // --- Filtered view: toolbar row is present whenever the Filtered panel is ---
  w.applyFhView("filter");
  assert(d.querySelector("#filteredToolbar") !== null, "#filteredToolbar exists in the Filtered view");
  assert(isVisible(d.querySelector("#filteredToolbar"), w) === true, "#filteredToolbar is visible while on the Filtered tab");

  // --- Stacked view: both Context's and Filtered's toolbars are on screen at once ---
  w.applyFhView("stacked");
  assert(isVisible(d.querySelector("#filteredToolbar"), w) === true, "#filteredToolbar stays visible in Stacked layout");
  assert(d.querySelector("#contextToolbar") !== null, "#contextToolbar (Context view's own toolbar) still exists alongside it");

  // --- Table view: #tableToolbar shows only while Table is the active tab, not Plot ---
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");
  assert(isVisible(d.querySelector("#tableToolbar"), w) === true, "#tableToolbar is visible on the Table tab");
  assert(d.querySelector("#tableToolbar").classList.contains("hidden") === false, "#tableToolbar has no .hidden class while on Table");

  w.applyFhView("plot");
  assert(d.querySelector("#tableToolbar").classList.contains("hidden") === true, "#tableToolbar gets .hidden when switching to the Plot tab");
  assert(d.querySelector("#plotToolbar") !== null, "#plotToolbar (Plot view's own, pre-existing toolbar) is still there");

  w.applyFhView("table");
  assert(d.querySelector("#tableToolbar").classList.contains("hidden") === false, "#tableToolbar reappears when switching back to Table");
});
