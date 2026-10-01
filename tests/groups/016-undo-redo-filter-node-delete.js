// GROUP 16 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 16 — Undo / Redo (filter node delete/move)
   Origin: 7ef2c2a6 (item 6). Snapshot-based stack, originally scoped to
   filter node delete/move ONLY — verifies the wrapped mutators, the
   redo-stack-clearing-on-new-action semantics, the stack limit, and that
   linkedId self-heals when a subtree is restored. File delete, value/
   pattern edits, invert toggle, and assertion changes were added to the
   same stack later this session (2026-08-17, FEATURE_BACKLOG.md "Extend
   undo/redo") — see Group 46, which also replaces this group's old
   "files are out of scope" assertion (now false).
   ============================================================ */
group(16);
await withApp(async (w, d, T) => {
  section("16. Undo / Redo");
  const fa = await w.addFile("a.log", makeLog(0, 10), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 10, { msgPrefix: "other" }), () => {});
  w.render();

  // Delete + undo + redo
  const toDelete = w.createFilterNode(fa.id, "text", "message 1");
  const beforeCount = fa.children.length;
  w.deleteFilterNodeWithUndo(toDelete.id);
  assert(fa.children.length === beforeCount - 1, "deleteFilterNodeWithUndo removes the node");
  assert(!T.state.nodes[toDelete.id], "deleted node is gone from state.nodes");
  w.undo();
  assert(T.state.nodes[toDelete.id], "undo restores the deleted node");
  assert(T.state.nodes[toDelete.id].id === toDelete.id, "restored node keeps its ORIGINAL id");
  w.redo();
  assert(!T.state.nodes[toDelete.id], "redo re-applies the delete");

  // bakedA/bakedB carry a flat condition snapshot, not a live reference —
  // deleting one of the two source nodes an AND was built from must have
  // ZERO effect on the AND's own result, before or after undo (the exact
  // bug this data model fixes — see CLAUDE.md/changelog.d). AND/OR combine
  // two filters from the SAME file by design (cross-file combination is
  // unsupported — see PROJECT.md).
  const refA = w.createFilterNode(fa.id, "text", "message");
  const refA2 = w.createFilterNode(fa.id, "text", "message 1"); // subset of refA's own file
  const andNode = w.createAndOrNode([refA.id, refA2.id], "and");
  w.render();
  const andCountBefore = w.getEntries(andNode.id).length;
  assert(andCountBefore > 0, "sanity: AND of two same-file filters has a non-empty intersection before any delete");
  w.deleteFilterNodeWithUndo(refA2.id); // deletes one of the AND's baked-from sources
  w.invalidateAllCaches();
  assert(w.getEntries(andNode.id).length === andCountBefore, "AND node's result is completely unaffected by deleting the node its bakedB was baked from");
  w.undo();
  w.invalidateAllCaches();
  assert(w.getEntries(andNode.id).length === andCountBefore, "AND node's result is still unaffected after undo restores the deleted node");

  // Move + undo
  const moveTarget = w.createFilterNode(fa.id, "text", "x");
  const oldParentId = moveTarget.parentId;
  const anotherParent = w.createFilterNode(fa.id, "text", "y");
  w.moveFilterNodeWithUndo(moveTarget.id, anotherParent.id);
  assert(moveTarget.parentId === anotherParent.id, "moveFilterNodeWithUndo reparents the node");
  w.undo();
  assert(moveTarget.parentId === oldParentId, "undo restores the original parentId after a move");

  // A brand-new action clears the redo stack (standard semantics)
  w.redo(); // move redone
  const redoNode = w.createFilterNode(fa.id, "text", "fresh");
  w.deleteFilterNodeWithUndo(redoNode.id);
  assert(T.redoStack.length === 0, "pushing a new undo action clears any existing redo history");

  // Plain file deletion is now ALSO undoable (Group 46 covers this in
  // depth — restored entryIndex/rootIds position/filter subtree — this is
  // just a smoke check that it goes through the same stack).
  const fileToDelete = await w.addFile("c.log", makeLog(0, 3), () => {});
  const stackLenBefore = T.undoStack.length;
  w.deleteFilterNodeWithUndo(fileToDelete.id);
  assert(!T.state.nodes[fileToDelete.id], "file deletion still works through the wrapped call");
  assert(T.undoStack.length === stackLenBefore + 1, "deleting a plain FILE now pushes an undo action too");
  w.undo();
  assert(T.state.nodes[fileToDelete.id], "undo restores the deleted file");
});
