// GROUP 6 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 6 — Double-click DOM-identity regression
   Origin: 3f879dbe (root-cause session). The single most consequential bug
   in the project history — see PROJECT.md "Testing approach". Re-verified
   here because it's exactly the kind of regression a later refactor of
   renderVisibleRows()/selectEntry() could silently reintroduce.
   ============================================================ */
group(6);
await withApp(async (w, d, T) => {
  section("6. Double-click DOM-identity regression (renderVisibleRows must not tear down rows on plain click)");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const idBefore = f.entries[2].id;
  let rowEl = d.querySelector('#tableRows [data-entry-id="' + idBefore + '"]');
  fireClick(rowEl, w);
  const rowElAfter = d.querySelector('#tableRows [data-entry-id="' + idBefore + '"]');
  assert(rowEl === rowElAfter, "plain click does not recreate the row DOM node (dblclick would silently break otherwise)");
  assert(rowElAfter.classList.contains("selected"), "plain click still marks the row selected (in-place class toggle)");

  // dblclick now reveals the entry in the Full view (revealInHighlightView),
  // replacing the old destructive jumpToFullLog for the plain log/link view —
  // see Group 18 for the Highlight-view-specific assertions.
  w.applyFhView("filter");
  fireDblClick(rowElAfter, w);
  assert(T.fhActiveTab === "highlight", "double-click on a Filter-view row reveals the Full view");
  assert(T.state.selectedId === idBefore, "double-click keeps the same entry selected");
});
