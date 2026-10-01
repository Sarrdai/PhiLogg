// GROUP 9 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 9 — Time context filter
   Origin: 1dd227c6. Covers window construction, overlapping-range merge,
   the whole-root-file source pool (not a second reference filter), bracket
   rendering, anchor dots, ms-unit dialog (a same-session follow-up dropped
   the earlier *1000 seconds conversion), and NOT-exclusion (verified
   structurally in Group 8; here we verify getEntries() itself, not just the
   menu omission).
   ============================================================ */
group(9);
await withApp(async (w, d, T) => {
  section("9. Time context filter");
  // Two reference entries close enough together that their +/-500ms windows
  // overlap and should merge into ONE bracket group; a third, far-away
  // reference entry should stay a separate group.
  const f = await w.addFile("a.log", makeLog(0, 40, { msgPrefix: "ref", suffix: i => (i === 5 || i === 6 || i === 30) ? "MARK" : "" }), () => {});
  w.render();
  const refFilter = w.createFilterNode(f.id, "text", "MARK");
  assert(w.getEntries(refFilter.id).length === 3, "reference filter matches the 3 marked entries");

  const ctxNode = w.createContextNode(refFilter.id, 1500, 1500); // ms, generous enough to bridge entries 5&6 (1s apart)
  const ctxEntries = w.getEntries(ctxNode.id);
  assert(ctxEntries.length > 3, "context filter pulls in entries from the WHOLE root file, not just the reference filter's own result");
  assert(ctxNode._contextRanges.length === 2, "overlapping windows (entries 5&6) merge into one range; the far entry (30) stays separate — got " + ctxNode._contextRanges.length);
  assert(ctxNode._anchorIds.has(f.entries[5].id) && ctxNode._anchorIds.has(f.entries[30].id), "anchor id set contains the reference entries");

  // Child filters chain underneath a context node exactly like any other
  // filter, because its result is real entries, not synthetic ones.
  const childUnderCtx = w.createFilterNode(ctxNode.id, "text", "ref");
  assert(w.getEntries(childUnderCtx.id).length === ctxEntries.length, "a plain filter chains underneath a context node without special handling");

  // Bracket + anchor-dot rendering
  T.state.activeId = ctxNode.id;
  T.state.sortColumn = null;
  w.render();
  assert(d.querySelectorAll("#tableRows .ctx-bracket").length > 0, "context bracket renders in the log view");
  assert(d.querySelectorAll("#tableRows .ctx-anchor-dot").length > 0, "anchor dot renders on reference-entry rows");

  // Dialog: ms units (no *1000 conversion), values round-tripped verbatim
  const someRef = w.createFilterNode(f.id, "text", "MARK");
  T.state.activeId = someRef.id;
  w.render();
  w.openContextDialog(someRef.id);
  d.querySelector("#contextBeforeInput").value = "250";
  d.querySelector("#contextAfterInput").value = "0";
  fireClick(d.querySelector("#contextDialogCreate"), w);
  const createdCtx = T.state.nodes[T.state.activeId];
  assert(createdCtx.contextBefore === 250, "context dialog stores the value as milliseconds verbatim (no unit conversion)");
});
