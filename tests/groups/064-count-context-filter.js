// GROUP 64 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 64 — Count context filter
   Origin: this session (2026-08-19), person-requested ("Analog zum Time
   Context erstelle einen Count Context, bei dem man einfach die Anzahl der
   Log Einträge vor und/oder nach dem Anchor einstellen kann"): a sibling of
   the Time context filter (Group 9) that windows by a fixed NUMBER of
   entries before/after each reference entry (in the root file's own
   chronological order) instead of a millisecond duration — useful when log
   density varies too much for a time window to reliably capture "N entries
   of surrounding context". Covers window construction by entry count,
   overlapping/adjacent-range merge, the whole-root-file source pool,
   boundary clamping at the start/end of the file, bracket rendering
   (shared renderer with Group 9's context filter), anchor dots, and the
   entry-count dialog (no unit conversion, unlike ms — verified round-trip).
   NOT-exclusion is covered in Group 8, not repeated here.
   ============================================================ */
group(64);
await withApp(async (w, d, T) => {
  section("64. Count context filter");
  // makeLog puts each entry exactly 1s apart in strict index order, so
  // "2 entries before/after" and "the previous/next 2 seconds" coincide —
  // convenient for asserting exact window membership by index.
  const f = await w.addFile("a.log", makeLog(0, 40, { msgPrefix: "ref", suffix: i => (i === 5 || i === 6 || i === 30) ? "MARK" : "" }), () => {});
  w.render();
  const refFilter = w.createFilterNode(f.id, "text", "MARK");
  assert(w.getEntries(refFilter.id).length === 3, "reference filter matches the 3 marked entries");

  // 2 entries before/after: entry 5's window is [3,7], entry 6's is [4,8] —
  // these overlap and must merge into ONE bracket group ([3,8], 6 entries);
  // entry 30's window [28,32] (5 entries) stays separate.
  const ctxNode = w.createCountContextNode(refFilter.id, 2, 2);
  const ctxEntries = w.getEntries(ctxNode.id);
  assert(ctxEntries.length === 11, "count context pulls in entries from the WHOLE root file by index window, not just the reference filter's own result — got " + ctxEntries.length);
  assert(ctxNode._contextRanges.length === 2, "overlapping windows (entries 5&6) merge into one range; the far entry (30) stays separate — got " + ctxNode._contextRanges.length);
  assert(ctxNode._anchorIds.has(f.entries[5].id) && ctxNode._anchorIds.has(f.entries[30].id), "anchor id set contains the reference entries");
  const ids = new Set(ctxEntries.map(e => e.id));
  for (let i = 3; i <= 8; i++) assert(ids.has(f.entries[i].id), "merged group includes index " + i);
  for (let i = 28; i <= 32; i++) assert(ids.has(f.entries[i].id), "far group includes index " + i);
  assert(!ids.has(f.entries[2].id) && !ids.has(f.entries[9].id), "window does not overreach past its own before/after count");

  // Boundary clamping: a reference entry near the start/end of the file
  // must clamp its window to the file's own bounds instead of going
  // negative or past the last index.
  const edgeRef = w.createFilterNode(f.id, "text", "ref 0 ");
  const edgeCtx = w.createCountContextNode(edgeRef.id, 5, 0); // entry 0, 5 before -> clamps to just [0,0]
  assert(w.getEntries(edgeCtx.id).length === 1, "a window that would start before index 0 clamps to the file's actual start");

  // Child filters chain underneath a count-context node exactly like any
  // other filter, because its result is real entries, not synthetic ones.
  const childUnderCtx = w.createFilterNode(ctxNode.id, "text", "ref");
  assert(w.getEntries(childUnderCtx.id).length === ctxEntries.length, "a plain filter chains underneath a count-context node without special handling");

  // Bracket + anchor-dot rendering (shared renderer with the time-context
  // filter — see the ctxNode selection in renderVisibleRows)
  T.state.activeId = ctxNode.id;
  T.state.sortColumn = null;
  w.render();
  assert(d.querySelectorAll("#tableRows .ctx-bracket").length > 0, "count-context bracket renders in the log view");
  assert(d.querySelectorAll("#tableRows .ctx-anchor-dot").length > 0, "anchor dot renders on reference-entry rows");

  // Dialog: entry counts round-tripped verbatim (no unit conversion, same
  // convention as the ms-based Time context dialog)
  const someRef = w.createFilterNode(f.id, "text", "MARK");
  T.state.activeId = someRef.id;
  w.render();
  w.openCountContextDialog(someRef.id);
  d.querySelector("#countContextBeforeInput").value = "3";
  d.querySelector("#countContextAfterInput").value = "0";
  fireClick(d.querySelector("#countContextDialogCreate"), w);
  const createdCtx = T.state.nodes[T.state.activeId];
  assert(createdCtx.filterType === "countContext" && createdCtx.countBefore === 3 && createdCtx.countAfter === 0,
    "count context dialog creates a countContext node storing the value as an entry count verbatim");

  // Copy/paste and undo/redo round-trip the countBefore/countAfter fields
  // (cloneSubtree / snapshotSubtree+restoreSubtree — same fields threaded
  // through as the ms-based context filter, per CLAUDE.md's persistence-
  // carrier checklist).
  const cloned = w.cloneSubtree(ctxNode.id, f.id);
  assert(cloned.filterType === "countContext" && cloned.countBefore === 2 && cloned.countAfter === 2, "cloneSubtree carries countBefore/countAfter onto the clone");
  const snap = w.snapshotSubtree(ctxNode.id);
  w.deleteNode(ctxNode.id);
  const restored = w.restoreSubtree(snap);
  assert(restored.filterType === "countContext" && restored.countBefore === 2 && restored.countAfter === 2, "snapshotSubtree/restoreSubtree round-trip countBefore/countAfter");
});
