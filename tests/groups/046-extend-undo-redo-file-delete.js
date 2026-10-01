// GROUP 46 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 46 — Extend undo/redo: file delete, value/pattern edits, invert
   toggle, assertion changes
   Origin: this session (2026-08-17), FEATURE_BACKLOG.md "Extend undo/redo"
   (Group 16 originally covered filter delete/move only). Adds four more
   undoable action kinds on top of the SAME snapshot-based stack: plain
   (non-folder) file delete ("deleteFile" — snapshotSubtree/restoreSubtree
   extended to file nodes, entries/tail kept by reference), and a new
   generic "edit" kind (captureNodeFields/applyNodeFields before/after)
   backing value/pattern edits (F2 popup + time-range dialog), the invert
   toggle, and assertion add/clear. Folder-file close and node creation
   stay deliberately out of scope — see the undo/redo module comment in
   philogg.html.
   ============================================================ */
group(46);
await withApp(async (w, d, T) => {
  section("46. Extend undo/redo: file delete, edits, invert, assertions");

  // ---------- Plain file delete ----------
  const fa = await w.addFile("a.log", makeLog(0, 10), () => {});
  const filt = w.createFilterNode(fa.id, "text", "message 1");
  w.render();
  const rootIndexBefore = T.state.rootIds.indexOf(fa.id);
  const entryIdsBefore = fa.entries.map(e => e.id);
  const stackLenBefore = T.undoStack.length;

  w.deleteFilterNodeWithUndo(fa.id);
  assert(!T.state.nodes[fa.id], "plain file delete removes the node");
  assert(!T.state.rootIds.includes(fa.id), "plain file delete removes it from rootIds");
  assert(entryIdsBefore.every(id => !T.entryIndex[id]), "plain file delete releases its entries from entryIndex");
  assert(T.undoStack.length === stackLenBefore + 1, "plain file delete pushes an undo action (kind \"deleteFile\")");

  w.undo();
  assert(T.state.nodes[fa.id], "undo restores the deleted file node");
  assert(T.state.nodes[fa.id].id === fa.id, "restored file keeps its original id");
  assert(T.state.rootIds[rootIndexBefore] === fa.id, "restored file lands back at its original rootIds position, got index " + T.state.rootIds.indexOf(fa.id));
  assert(entryIdsBefore.every(id => T.entryIndex[id]), "undo re-adds every entry to entryIndex");
  assert(T.state.nodes[filt.id] && T.state.nodes[filt.id].parentId === fa.id, "restored file's filter subtree comes back too, same id and parent");

  w.redo();
  assert(!T.state.nodes[fa.id], "redo re-deletes the file");
  assert(entryIdsBefore.every(id => !T.entryIndex[id]), "redo re-releases entries from entryIndex");

  w.undo(); // leave the file restored for the rest of this group
  assert(T.state.nodes[fa.id], "sanity: file restored again for the rest of the group");

  // ---------- Folder-loaded file close is STILL not undoable ----------
  // Setting .folderId directly (no full watched-folder setup needed) is
  // enough to route deleteFilterNodeWithUndo into its folder branch, which
  // closeFolderFile handles gracefully even with no matching state.folders
  // record (the "if (folder)" guard there).
  const folderFile = await w.addFile("watched.log", makeLog(0, 3), () => {});
  folderFile.folderId = "not-a-real-folder";
  const stackLenBeforeFolder = T.undoStack.length;
  w.deleteFilterNodeWithUndo(folderFile.id);
  assert(!T.state.nodes[folderFile.id], "folder-file close still fully removes the node in this test (no folder record to return it to)");
  assert(T.undoStack.length === stackLenBeforeFolder, "folder-file close still does not push an undo action");

  // ---------- Value/pattern edit: Ctrl+E popup (text filter) ----------
  // (Edit's shortcut moved from F2 to Ctrl+E this session, FEATURE_BACKLOG.md
  // #12, once F2 became Rename — see GROUP 96.)
  const textNode = w.createFilterNode(fa.id, "text", "message 1");
  T.state.activeId = textNode.id;
  T.state.focusRegion = "tree"; // tree shortcuts apply only with tree focus
  w.render();
  const stackLenBeforeEdit = T.undoStack.length;
  fireKeydown(d, w, "e", { ctrlKey: true });
  d.querySelector("#filterInput").value = "message 2";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(textNode.value === "message 2", "Ctrl+E edit still updates the node in place");
  assert(T.undoStack.length === stackLenBeforeEdit + 1, "Ctrl+E edit now pushes an undo action");
  w.undo();
  assert(textNode.value === "message 1", "undo restores the pre-edit value");
  w.redo();
  assert(textNode.value === "message 2", "redo re-applies the edit");
  // A real browser blurs a focused input when its containing popup goes
  // display:none; jsdom doesn't compute that CSS-driven side effect, so the
  // next Ctrl+E press below would otherwise hit the global keydown handler's
  // "inInput" bail-out (see document's keydown listener) against a hidden,
  // stale-focused #filterInput. Blur it explicitly to match real behavior.
  d.querySelector("#filterInput").blur();

  // ---------- Value/pattern edit: time-range dialog (legacy after -> timerange migration) ----------
  const rangeNode = w.createFilterNode(fa.id, "after", fa.entries[3].ts);
  T.state.activeId = rangeNode.id;
  T.state.focusRegion = "tree"; // tree shortcuts apply only with tree focus
  w.render();
  const stackLenBeforeRange = T.undoStack.length;
  fireKeydown(d, w, "e", { ctrlKey: true });
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "Ctrl+E on a legacy \"after\" node opens the time-range dialog");
  d.querySelector("#timeRangeToInput").value = w.tsToLocalInputValue(fa.entries[7].ts);
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(rangeNode.filterType === "timerange" && rangeNode.value.to === fa.entries[7].ts, "time-range edit applied and migrated the node");
  assert(T.undoStack.length === stackLenBeforeRange + 1, "time-range edit pushes an undo action");
  w.undo();
  assert(rangeNode.filterType === "after" && rangeNode.value === fa.entries[3].ts, "undo restores the pre-edit legacy filterType AND value, got " + rangeNode.filterType + "/" + rangeNode.value);
  w.redo();
  assert(rangeNode.filterType === "timerange" && rangeNode.value.to === fa.entries[7].ts, "redo re-applies the migration + new bound");

  // ---------- Invert (NOT) toggle ----------
  const invNode = w.createFilterNode(fa.id, "text", "message 3");
  T.state.activeId = invNode.id;
  w.render();
  const invRow = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(invRow, w);
  const invertItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "invert");
  const stackLenBeforeInvert = T.undoStack.length;
  fireClick(invertItem, w);
  assert(invNode.inverted === true, "context-menu invert still toggles the flag");
  assert(T.undoStack.length === stackLenBeforeInvert + 1, "invert toggle pushes an undo action");
  w.undo();
  assert(invNode.inverted === false, "undo reverts the invert toggle");
  w.redo();
  assert(invNode.inverted === true, "redo re-applies the invert toggle");

  // ---------- Value assertion add/clear ----------
  const extractNode = w.createFilterNode(fa.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");
  d.querySelector('#extractHead th[data-col="0"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  const assertBtn = d.querySelector("#tableAssertBtn");
  fireClick(assertBtn, w);
  d.querySelector("#assertMinInput").value = "2";
  d.querySelector("#assertMaxInput").value = "5";
  const stackLenBeforeAssert = T.undoStack.length;
  fireClick(d.querySelector("#assertDialogSave"), w);
  assert(extractNode.assertions[0].min === 2 && extractNode.assertions[0].max === 5, "assertion saved");
  assert(T.undoStack.length === stackLenBeforeAssert + 1, "saving an assertion pushes an undo action");
  w.undo();
  assert(!extractNode.assertions || !extractNode.assertions[0], "undo removes the just-added assertion");
  w.redo();
  assert(extractNode.assertions[0].min === 2 && extractNode.assertions[0].max === 5, "redo re-applies the assertion");

  fireClick(assertBtn, w);
  const stackLenBeforeClear = T.undoStack.length;
  fireClick(d.querySelector("#assertDialogClear"), w);
  assert(!extractNode.assertions[0], "Clear removes the assertion");
  assert(T.undoStack.length === stackLenBeforeClear + 1, "clearing an assertion pushes an undo action");
  w.undo();
  assert(extractNode.assertions[0].min === 2 && extractNode.assertions[0].max === 5, "undo restores the cleared assertion");
  w.redo();
  assert(!extractNode.assertions[0], "redo re-applies the clear");
});
