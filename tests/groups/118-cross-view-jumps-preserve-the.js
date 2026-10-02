// GROUP 118 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 118 — Cross-view jumps preserve the entry's on-screen pixel
   position instead of hard-centering it
   Origin: this session (person request, German: "Bei allen Wechseln
   zwischen views, egal ob Doppelklick, Klick auf Filter, Alt+Pfeiltasten,
   etc. versuche den selektierten Logeintrag an seiner aktuellen Position zu
   halten... Wenn im Ziel View nicht genügend Einträge oberhalb des
   Eintrags vorhanden sind, darf der Eintrag entsprechend nach oben
   springen."). The tree-click/Alt+Arrow path already did this via
   captureViewAnchor/restoreViewAnchor (GROUP 61) — this group covers the
   paths that used to bypass it entirely and hard-center
   (revealInHighlightView/scrollTargetId's opts.offset, see
   captureRowScreenOffset).
   ============================================================ */
group(118);
await withApp(async (w, d, T) => {
  section("118a. Double-click reveal-in-Highlight keeps the entry at the SAME on-screen pixel offset instead of centering it");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.applyFhView("stacked"); // both panels rendered so highlightBody is measurable
  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");

  w.setTableScroll(35 * 28); // brings entry 40's row into the virtualized window
  w.renderVisibleRows();
  const entry = f.entries[40];
  const rowEl = d.querySelector('#tableRows [data-entry-id="' + entry.id + '"]');
  assert(rowEl, "sanity: entry 40's row is rendered in the Filter view");
  // Stub this ONE row's geometry (jsdom has no real layout — see the
  // module-level getBoundingClientRect stub/comment) to sit 140px below
  // tableBody's own top edge, i.e. "currently on screen at pixel offset 140".
  rowEl.getBoundingClientRect = () => ({ top: 140, left: 0, right: 800, bottom: 168, width: 800, height: 28, x: 0, y: 140 });

  w.revealInHighlightView(entry, rowEl, tableBody);
  assert(T.state.selectedId === entry.id, "sanity: entry 40 selected");
  // Entry 40 is at index 40 in the (unfiltered) Highlight view too.
  const expectedScrollTop = 40 * 28 - 140;
  assert(highlightBody.scrollTop === expectedScrollTop,
    "Highlight view scrolled so entry 40 lands at the SAME 140px on-screen offset it had in the Filter view, got " + highlightBody.scrollTop + " expected " + expectedScrollTop);
});

await withApp(async (w, d, T) => {
  section("118b. ...but when the target view doesn't have enough rows above to keep that offset, the entry moves as high as possible (offset 0), not centered");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  w.applyFhView("stacked");
  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");

  const entry = f.entries[2]; // only 2 rows (56px) above it — nowhere near enough to preserve a 300px offset
  w.renderVisibleRows(); // default scrollTop 0 already has entry 2 in the virtualized window
  const rowEl = d.querySelector('#tableRows [data-entry-id="' + entry.id + '"]');
  assert(rowEl, "sanity: entry 2's row is rendered");
  rowEl.getBoundingClientRect = () => ({ top: 300, left: 0, right: 800, bottom: 328, width: 800, height: 28, x: 0, y: 300 });

  w.revealInHighlightView(entry, rowEl, tableBody);
  assert(highlightBody.scrollTop === 0,
    "not enough entries above to preserve the 300px offset (2*28=56 < 300) — clamped to the top instead of centering, got " + highlightBody.scrollTop);
  const rowTop = 2 * 28;
  assert(rowTop - highlightBody.scrollTop === rowTop, "entry 2 ends up as high on screen as it can go, its own row top (not dead-center)");
});

await withApp(async (w, d, T) => {
  section("118c. revealInFilteredView (extraction table double-click) preserves the source row's on-screen offset into the Filter view too");

  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");
  const tableBody = d.querySelector("#tableBody");
  const extractScroll = d.querySelector("#extractScroll");

  const entry = f.entries[30];
  assert(T.extractRowsData[30] && T.extractRowsData[30].entry.id === entry.id, "sanity: extraction row 30 is entry 30 (extract pattern matches every row)");
  extractScroll.scrollTop = 30 * 28; // bring row 30 into the virtualized window (clientHeight stubbed to 400, EXTRACT_ROW_HEIGHT default 28)
  w.renderExtractVisibleRows();
  const tr = d.querySelector('.extract-gutter[data-row="30"]').closest("tr");
  assert(tr, "sanity: entry 30's extraction row is rendered");
  tr.getBoundingClientRect = () => ({ top: 80, left: 0, right: 800, bottom: 108, width: 800, height: 28, x: 0, y: 80 });

  w.revealInFilteredView(entry, tr, extractScroll);
  assert(T.state.activeId === extractNode.id, "sanity: stayed on the extraction node (its own Filtered pane), no jump to the plain file");
  const newIdx = T.currentViewEntries.findIndex(e => e.id === entry.id);
  assert(newIdx === 30, "sanity: entry 30 is at index 30 in the node's own filtered view (the pattern matches every row)");
  const expectedScrollTop = 30 * 28 - 80;
  assert(tableBody.scrollTop === expectedScrollTop,
    "Filter view scrolled so entry 30 keeps its 80px on-screen offset from the extraction table, got " + tableBody.scrollTop + " expected " + expectedScrollTop);
});
