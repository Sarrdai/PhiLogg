// GROUP temp-anchor-stale-row — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP temp-anchor-stale-row — a real selection elsewhere drops the ghost row
   Origin: 2026-10-04 desktop usability test. applySelection cleared
   state.tempAnchor but left the anchor's spliced clone (_tempAnchor) in
   currentViewEntries and in the DOM (#tableRows .temp-anchor-row); the fade
   timer early-returned on !state.tempAnchor, so the "not in this filter" row
   survived until the next full renderTable (e.g. after a tab switch). Now
   applySelection calls dropTempAnchorRow(), and selectEntry only trusts
   opts.index while it still points at the entry.
   ============================================================ */
group("temp-anchor-stale-row");
await withApp(async (w, d, T) => {
  const f = await w.addFile("app.log", makeLog(0, 60, { suffix: i => (i >= 50 ? "keep" : "skip") }), () => {});
  const skipFilter = w.createFilterNode(f.id, "text", "skip"); // entries 0-49
  const keepFilter = w.createFilterNode(f.id, "text", "keep"); // entries 50-59
  const setMode = m => {
    const sel = d.querySelector("#settingsTempAnchorMode");
    sel.value = m;
    sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const ghostRows = () => d.querySelectorAll("#tableRows .temp-anchor-row").length;
  const anchored = () => T.currentViewEntries.some(e => e._tempAnchor);
  // Select entry 0 in skipFilter, then switch to keepFilter through the tree.
  const makeGhost = () => {
    T.state.activeId = skipFilter.id;
    w.render();
    fireClick([...d.querySelectorAll("#tableRows .log-row")][0], w);
    const xId = T.state.selectedId;
    assert(xId === f.entries[0].id, "sanity: entry 0 selected");
    fireClick(d.querySelector('.tree-row[data-node-id="' + keepFilter.id + '"]'), w);
    assert(T.state.tempAnchor && T.state.tempAnchor.entryId === xId, "sanity: temp anchor set for entry 0");
    return xId;
  };

  section("temp-anchor-stale-row a. Persistent mode: selecting another entry removes the ghost row");
  setMode("persistent");
  for (const [label, pick] of [["selectEntry", id => w.selectEntry(id)], ["selectHighlightEntry", id => w.selectHighlightEntry(id)]]) {
    const xId = makeGhost();
    assert(ghostRows() === 1 && anchored(), label + ": one ghost row drawn and spliced into currentViewEntries");
    const y = f.entries[55];
    pick(y.id);
    assert(T.state.selectedId === y.id, label + ": Y selected");
    assert(T.state.tempAnchor === null, label + ": state.tempAnchor cleared");
    assert(!anchored(), label + ": no _tempAnchor entry left in currentViewEntries");
    assert(ghostRows() === 0, label + ": no .temp-anchor-row left in #tableRows");
    assert(!d.querySelector('#tableRows [data-entry-id="' + xId + '"]'), label + ": the anchored entry has no row at all");
  }

  section("temp-anchor-stale-row b. Fade mode: selecting Y before the timer fires leaves no ghost row afterwards");
  setMode("fade");
  for (let i = 0; i < 5; i++) d.querySelector("#tempAnchorFadeDown").click(); // 3s -> 0.5s
  assert(d.querySelector("#tempAnchorFadeValue").textContent === "0.5s", "sanity: fade duration is 0.5s");
  makeGhost();
  assert(ghostRows() === 1, "fade: ghost row drawn right after the switch");
  w.selectEntry(f.entries[55].id);
  assert(ghostRows() === 0 && !anchored(), "fade: ghost row gone immediately after the real selection");
  await sleep(1200); // past the fade timer + collapse
  assert(ghostRows() === 0 && !anchored() && T.state.tempAnchor === null, "fade: still no ghost row after the timer would have fired");
  assert(T.currentViewEntries.length === 10, "fade: keepFilter view is its 10 real entries, got " + T.currentViewEntries.length);

  section("temp-anchor-stale-row c. ArrowDown from the anchor row lands on the real next entry, selected class set");
  setMode("persistent");
  const xId = makeGhost();
  const list = T.currentViewEntries;
  const ai = list.findIndex(e => e._tempAnchor);
  assert(ai !== -1 && list[ai].id === xId, "sanity: anchor row is in the list");
  const nextId = list[ai + 1].id;
  w.moveSelection(1);
  assert(T.state.selectedId === nextId, "ArrowDown selects the next real entry, got " + T.state.selectedId);
  assert(ghostRows() === 0 && !anchored(), "the ghost row is gone after moving off it");
  const row = d.querySelector('#tableRows .log-row[data-entry-id="' + nextId + '"]');
  assert(row && row.classList.contains("selected"), "the next entry's row is rendered and carries the selected class");
});
