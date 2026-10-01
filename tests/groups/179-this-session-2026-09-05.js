// GROUP 179 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 179 — this session (2026-09-05), person-requested corrections to
   the toolbar reorganization: Add to selection moved from the Filter-
   Toolbar's row-actions (a filter-creating action) into the log views'
   own Actions group (an action on the selection, like Bookmark/Note — see
   Group 177 for that coverage); the time-filter arrow icons were reversed
   (Filter before this now points UP — it keeps everything above; Filter
   after this now points DOWN — it keeps everything below) and Time filter
   from selection now shows two arrows converging instead of diverging;
   and every view toolbar's group order flipped from Settings|Controls|
   Actions to Controls|Settings|Actions (see Group 177b for that
   coverage). This group covers just the icon-path swap itself, since the
   membership/ordering changes are already covered above.
   ============================================================ */
group(179);
await withApp(async (w, d, T) => {
  section("179. filterBefore/filterAfter arrow directions swapped; timeRangeFromSelection shows converging arrows");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const pathOf = action => d.querySelector('[data-row-action="' + action + '"] svg path').getAttribute("d");
  // filterBefore points up (its path ends going up from the shaft, i.e. the
  // vertical segment runs TO the top y=3): the shaft goes from y=13 to y=3.
  assert(pathOf("filterBefore").startsWith("M8 3v10"), "filterBefore now uses the up-pointing arrow path, got " + pathOf("filterBefore"));
  assert(pathOf("filterAfter").startsWith("M8 13V3"), "filterAfter now uses the down-pointing arrow path, got " + pathOf("filterAfter"));
  assert(pathOf("filterBefore") !== pathOf("filterAfter"), "sanity: the two are no longer identical");

  // Converging design: two separate arrowhead segments (one per half),
  // not the old single-path diverging design — distinguished simply by no
  // longer being the old literal path string.
  const rangePath = pathOf("timeRangeFromSelection");
  assert(rangePath !== "M8 13V3M8 3l-3 3M8 3l3 3M8 13l-3-3M8 13l3-3", "timeRangeFromSelection no longer uses the old diverging-arrows path");
  assert(rangePath.includes("M8 3v4") && rangePath.includes("M8 13v-4"), "timeRangeFromSelection's path has a top segment ending at y=7 and a bottom segment ending at y=9, meeting in the middle");
});
