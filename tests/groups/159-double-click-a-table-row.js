// GROUP 159 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 159 — Double-click a Table row jumps to the Filtered view; click a
   Plot mark jumps to the corresponding Table row (this session, follow-up
   feature request alongside the filterType merge above; the Plot half
   REVISED 2026-09-05, person-requested: a plot click used to go straight to
   Filtered too, now it lands on Table first)
   Origin: this session. Previously the extraction table row's double-click
   and the Plot tab's mark click both called jumpToFullLog — a destructive
   jump away to the node's root FILE, clearing the level filter, since an
   extraction node had no Filtered view of its own to reveal into instead.
   That's no longer true (see the filterType-merge group above): an
   extraction-capable "text" node has an ordinary Filtered pane showing
   exactly its own matched entries. The Table row's double-click calls
   revealInFilteredView(entry, sourceEl, sourceScrollEl) — same node stays
   active, fhActiveTab switches to "filter", and the row is
   selected/scrolled/flashed there, modeled directly on
   revealInHighlightView's own Context-view counterpart. The Plot mark's
   click instead calls revealInTableView(entry) — same node, fhActiveTab
   switches to "table" and the matching row is selected/scrolled there; from
   there that row's own double-click already goes on into Filtered, so one
   more click gets you the same place a direct plot-to-Filtered jump used to.
   jumpToFullLog itself was left in place un-wired at the time and has since
   been removed as dead code.
   ============================================================ */
group(159);
await withApp(async (w, d, T) => {
  section("159a. Double-clicking a Table row reveals the entry in the SAME node's Filtered view");

  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i}"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "id=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.fhActiveTab === "table", "sanity: the Table tab is showing (explicit switch)");

  const targetRow = [...d.querySelectorAll("#extractBody tr")][1];
  const targetEntry = T.extractRowsData[1].entry;
  fireDblClick(targetRow, w);

  assert(T.state.activeId === node.id, "the active node stays the SAME extraction-capable node — no jump to the root file");
  assert(T.fhActiveTab === "filter", "fhActiveTab switches to Filtered");
  assert(T.state.selectedId === targetEntry.id, "the double-clicked row's real underlying entry becomes selected");
  // The content COMPONENT (#extractWrap vs #fhSplit), not just the tab pill,
  // must actually switch — renderMainView() is the only place that toggles
  // these two via inline style.display; showFhTab() (what a plain Filtered-
  // tab click goes through) never touches them, since before this feature
  // nothing ever reached it FROM Table/Plot. A "#tableWrap has no .hidden
  // class" check would pass vacuously here (nothing in this flow ever sets
  // that class) without proving #extractWrap actually got hidden, which is
  // exactly the bug this asserts against.
  assert(d.querySelector("#extractWrap").style.display === "none", "the extraction table is no longer the visible content component");
  assert(d.querySelector("#fhSplit").style.display === "flex", "the Filtered pane (#fhSplit) is now the visible content component");
  assert(!d.querySelector("#tableWrap").classList.contains("hidden"), "the Filtered pane (log table) is now the visible content");
});

await withApp(async (w, d, T) => {
  section("159b. Clicking a Plot mark reveals the entry as the corresponding row in the SAME node's Table view");

  const rows = [[0, 0], [10, 10], [20, 20]];
  const log = rows.map(([x, y], i) =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y}"`
  ).join("\n") + "\n";
  const f = await w.addFile("pos.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w); // line/bar's multi-Y checkboxes have no single #plotYSelectSingle
  d.querySelector("#plotXSelect").value = "0";
  d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1";
  d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));

  const marks = [...d.querySelectorAll("#plotSvg circle.plot-mark")];
  assert(marks.length === 3, "sanity: one mark per plotted row");
  const targetMark = marks.find(m => +m.dataset.row === 1);
  const targetEntry = T.extractRowsData[1].entry;
  fireClick(targetMark, w);

  assert(T.state.activeId === node.id, "the active node stays the SAME extraction-capable node");
  assert(T.fhActiveTab === "table", "fhActiveTab switches to Table, not Filtered");
  assert(T.state.selectedId === targetEntry.id, "the clicked mark's real underlying entry becomes selected");
  // #extractWrap (Table/Plot's shared content component) stays the visible
  // one throughout — unlike 159a's Table-row double-click, this never leaves
  // it for #fhSplit.
  assert(d.querySelector("#extractWrap").style.display !== "none", "the extraction view stays the visible content component");
  assert(!d.querySelector("#extractScroll").classList.contains("hidden"), "the Table sub-view (not Plot) is now the one showing inside it");
  const selectedCells = [...d.querySelectorAll("#extractBody td.cell-selected")];
  assert(selectedCells.length > 0, "the matching Table row is selected/highlighted");
  assert(selectedCells.every(td => +td.dataset.row === 1), "the highlighted row is row 1, the one whose mark was clicked");
});
