// GROUP ctx-time-arrows — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP ctx-time-arrows — before/after arrows agree across menu, row actions and tree icons
   Origin: 2026-10-04 (tablet retest). The row context menu had #ctxAfter/#ctxBefore swapped
   (after = rows below = DOWN, before = UP, as in the row-action buttons and the tree symbols).
   ============================================================ */
group("ctx-time-arrows");

await withApp(async (w, d, T) => {
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  section("ctx-time-arrows a. Context menu arrows match the row-action buttons and tree symbols");
  const dirOf = path => { // "up" when the line's tip (arrowhead) is at the smaller y
    const m = /^M8 (\d+)/.exec(path);
    return /M8 3v10|M8 3l/.test(path) && m[1] === "3" ? "up" : "down";
  };
  // The menu items reference the sprite symbols (the tree icons' own), so their arrows ARE the tree symbols.
  const ctxSymbol = id => d.querySelector("#" + id + " svg use").getAttribute("href");
  const rowPath = action => d.querySelector('#viewBar [data-row-action="' + action + '"] svg path').getAttribute("d");
  const symPath = id => d.querySelector("symbol#" + id + " path").getAttribute("d");
  assert(dirOf(rowPath("filterBefore")) === "up" && dirOf(rowPath("filterAfter")) === "down", "row actions: before up, after down");
  assert(/^M8 13V3/.test(symPath("i-time-before")) && /^M8 3v10/.test(symPath("i-time-after")), "tree symbols: before up (tip at 3), after down");
  assert(ctxSymbol("ctxBefore") === "#i-time-before" && ctxSymbol("ctxAfter") === "#i-time-after", "menu items use the before/after sprite symbols");
  assert(ctxSymbol("ctxTimeRangeFromSelection") === "#i-time-range", "the time-range item uses the time-range symbol");
  assert(symPath("i-time-before") === "M8 13V3M5 6l3-3 3 3" && symPath("i-time-after") === "M8 3v10M5 10l3 3 3-3", "the symbols: before up, after down");
});
