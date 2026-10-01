// GROUP 10 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 10 — Bugfix regressions from the dedicated code-review session
   Origin: 94d8ec50. Three fixes: (1) Escape key on an active extraction
   cell-selection no longer throws (the handler called a helper that no
   longer existed); (2) deleting a file no longer corrupts entryIndex for
   OTHER files that share entries with it via merge (releaseEntriesFromIndex);
   (3) the same helper is used on tail rotation so rotated-out entries don't
   leak in entryIndex for the session lifetime (re-verified here structurally;
   the live poll itself is exercised in Group 12).
   ============================================================ */
group(10);
await withApp(async (w, d, T) => {
  section("10. Bugfix regressions (Escape handler, releaseEntriesFromIndex)");

  // (1) Escape with an active extraction cell selection
  const f = await w.addFile("a.log", makeLog(0, 5, { suffix: i => "n=" + i }), () => {});
  const extractNode = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  T.state.tableSelection = new Set(["0,0"]);
  let threw = false;
  try { fireKeydown(d, w, "Escape"); } catch (e) { threw = true; }
  assert(!threw, "Escape with an active extraction cell selection does not throw");
  assert(T.state.tableSelection === null, "Escape clears the extraction cell selection");

  // (2) Merged file entry-sharing survives deleting one of the source files
  const fa = await w.addFile("src-a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("src-b.log", makeLog(0, 5, { msgPrefix: "other" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.entries.length === 10, "merge combines both source files' entries");
  const sharedEntryId = fa.entries[0].id;
  assert(T.entryIndex[sharedEntryId] === fa.entries[0], "shared entry present in entryIndex before any delete");
  w.deleteFilterNodeWithUndo(fa.id); // deletes the FILE (out of undo scope, falls through to deleteNode)
  assert(T.entryIndex[sharedEntryId] !== undefined, "deleting a source file does NOT drop entries still referenced by the merged file (releaseEntriesFromIndex)");
  assert(merged.entries.some(e => e.id === sharedEntryId), "merged file's own entries array is unaffected by the source file's deletion");
  w.deleteFilterNodeWithUndo(merged.id);
  assert(T.entryIndex[sharedEntryId] === undefined, "once the LAST referencing root is gone, the entry is finally released from entryIndex");
});
