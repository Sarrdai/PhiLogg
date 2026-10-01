// GROUP 100 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 100 — Middle-click a filter node to delete it
   Origin: this session (2026-08-25), FEATURE_BACKLOG #17: middle-click a
   tree row or a breadcrumb chip deletes that node the same way its ✕
   button / context-menu "Remove" would, undoably (deleteFilterNodeWithUndo).
   ============================================================ */
group(100);
await withApp(async (w, d, T) => {
  section("100. Middle-click a filter node (tree row) deletes it");

  const f = await w.addFile("app.log", makeLog(0, 5), () => {});
  const filt = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = filt.id;
  w.render();

  const undoLenBefore = T.undoStack.length;
  const row = d.querySelector('.tree-row[data-node-id="' + filt.id + '"]');
  row.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
  assert(!T.state.nodes[filt.id], "middle-clicking a tree row deletes that filter node");
  assert(f.children.length === 0, "...removed from its parent's children");
  assert(T.undoStack.length === undoLenBefore + 1 && T.undoStack[T.undoStack.length - 1].kind === "delete",
    "the middle-click delete goes through deleteFilterNodeWithUndo — a real, undoable action");
  w.undo();
  assert(T.state.nodes[filt.id], "undo restores the middle-click-deleted node");
  w.render();

  // A non-primary/non-middle button (right-click, handled separately by the
  // context menu) must NOT also trigger this delete path via auxclick.
  const rowAgain = d.querySelector('.tree-row[data-node-id="' + filt.id + '"]');
  rowAgain.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 2 }));
  assert(!!T.state.nodes[filt.id], "auxclick with a non-middle button does not delete the node");

});
