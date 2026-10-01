// GROUP 74 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 74 — Double-click a filter row opens its edit dialog
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Double-click on a
   filter opens its edit dialog". NOT a native "dblclick" listener: a tree
   row's own click handler always ends in a full render(), which rebuilds
   every #tree row from scratch (CLAUDE.md's "DOM identity across clicks"
   gotcha, previously documented for renderVisibleRows()/native dblclick —
   the same class of bug applies here to a real browser's dblclick pairing,
   just unobservable from jsdom's directly-dispatched click events). Manual
   click-id+timestamp tracking (lastTreeRowClickId/Time) sidesteps that
   entirely. Shares the same editFilterNode helper F2 and the context
   menu's "Edit filter…" action already use.
   ============================================================ */
group(74);
await withApp(async (w, d, T) => {
  section("74. Double-click a filter row opens its edit dialog");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  const timeNode = w.createFilterNode(f.id, "after", f.entries[3].ts);
  w.render();
  function rowFor(nodeId) { return d.querySelector('.tree-row[data-node-id="' + nodeId + '"]'); }

  fireClick(rowFor(textNode.id), w);
  assert(d.querySelector("#filterPopup").classList.contains("hidden"), "a single click alone doesn't open the edit dialog");
  fireClick(rowFor(textNode.id), w);
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "...but a second quick click on the same row does (double-click)");
  assert(d.querySelector("#filterInput").value === "message 1", "...pre-filled with the existing value (edit mode)");
  w.closeFilterPopup();

  // A time-range ("after") node opens the OTHER dialog on double-click.
  w.render();
  fireClick(rowFor(timeNode.id), w);
  fireClick(rowFor(timeNode.id), w);
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "double-clicking a time-filter row opens the time-range dialog instead");
  w.closeTimeRangeDialog();

  // Two Ctrl+clicks (multi-select gesture) never count as a double-click.
  w.render();
  const ctrlClick = () => rowFor(textNode.id).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  ctrlClick(); ctrlClick();
  assert(d.querySelector("#filterPopup").classList.contains("hidden"), "two Ctrl+clicks (multi-select) never open the edit dialog");

  // Two clicks spread further apart than the double-click window don't count either.
  w.render();
  fireClick(rowFor(textNode.id), w);
  await new Promise(r => setTimeout(r, 600));
  fireClick(rowFor(textNode.id), w);
  assert(d.querySelector("#filterPopup").classList.contains("hidden"), "two clicks well over 450ms apart don't count as a double-click");

  // A file row (not a filter) double-click is a harmless no-op.
  w.render();
  fireClick(rowFor(f.id), w);
  fireClick(rowFor(f.id), w);
  assert(d.querySelector("#filterPopup").classList.contains("hidden") && d.querySelector("#timeRangeDialog").classList.contains("hidden"),
    "double-clicking a FILE row opens neither dialog");
});
