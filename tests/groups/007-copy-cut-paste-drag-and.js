// GROUP 7 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 7 — Copy/Cut/Paste, drag-and-drop, self-contained AND/OR/LINK inputs
   Origin: 3f879dbe; REWRITTEN for the bakedA/bakedB correction (this
   session — see PROJECT.md "Core data model"). and/or/link nodes now carry
   two flat, self-contained BAKED condition snapshots that have no bearing
   on tree position at all — moving/copying/dragging one anywhere (even
   across files) only ever changes parentId (display), never bakedA/bakedB,
   so there is no ancestor-cycle risk to guard against for an ordinary
   move/reparent any more (moveNode's only remaining guard is the plain
   isDescendantOrSelf structural check every node needs). Also covers the
   file-drop overlay isFileDrag() gate from the origin session.
   ============================================================ */
group(7);
await withApp(async (w, d, T) => {
  section("7. Copy/Cut/Paste + drag-and-drop + self-contained and/or/link inputs");
  const fa = await w.addFile("a.log", makeLog(0, 20), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "other" }), () => {});
  w.render();

  // Plain filter copy/paste (regression baseline)
  const plain = w.createFilterNode(fa.id, "text", "message 1");
  T.state.activeId = plain.id;
  T.state.clipboard = { id: plain.id, mode: "copy" };
  T.state.activeId = fa.id;
  w.pasteClipboard();
  assert(T.state.activeId !== plain.id && T.state.nodes[T.state.activeId].filterType === "text",
    "plain filter copy/paste creates a new node");

  // AND node combining a filter from A with one from B — createAndOrNode
  // always places its result under the FIRST input's root file, regardless
  // of where the second input lives.
  const fFilterA = w.createFilterNode(fa.id, "text", "message");
  const fFilterB = w.createFilterNode(fb.id, "text", "other");
  const andNode = w.createAndOrNode([fFilterA.id, fFilterB.id], "and");
  w.render();
  assert(andNode.baked[0].filterType === "text" && andNode.baked[0].value === "message" && andNode.baked[1].value === "other",
    "AND node stores a flat baked condition snapshot of each side's own condition");
  assert(andNode.parentId === fa.id, "AND node is placed directly under file A (fFilterA's root), not nested under fFilterA");

  T.state.activeId = andNode.id;
  T.state.clipboard = { id: andNode.id, mode: "copy" };
  T.state.activeId = fFilterA.id;
  const beforePaste = fFilterA.children.length;
  w.pasteClipboard();
  assert(fFilterA.children.length === beforePaste + 1, "AND node can be copy/pasted");
  const pastedAndId = fFilterA.children[fFilterA.children.length - 1];
  assert(T.state.nodes[pastedAndId].baked[0].value === "message" && T.state.nodes[pastedAndId].baked[1].value === "other",
    "pasted AND node's bakedA/bakedB carry the same flat condition data (cloneSubtree deep-copies them)");

  // Moving the AND node into what would have been a cyclic position under
  // the old linkedId model is now a completely ordinary move — bakedA/
  // bakedB never change, and parentId has no bearing on the node's own
  // logic any more (see the "Core data model" note above createAndOrNode
  // in philogg.html).
  const childOfB = w.createFilterNode(fFilterB.id, "text", "x");
  const movedOk1 = w.moveNode(andNode.id, childOfB.id);
  assert(movedOk1 === true, "moving the AND node under fFilterB's subtree now succeeds (no cycle risk any more)");
  assert(andNode.parentId === childOfB.id, "AND node's parentId updated to the new position");
  assert(andNode.baked[0].value === "message" && andNode.baked[1].value === "other", "...but bakedA/bakedB are completely untouched by the move");
  assert(w.getEntries(andNode.id), "getEntries still resolves correctly (no infinite recursion) after the move");

  // Cross-file cut/paste is now an ordinary paste too — no reconstruction,
  // no cross-file special-casing (see docs/filters.md).
  T.state.activeId = andNode.id;
  T.state.clipboard = { id: andNode.id, mode: "cut" };
  T.state.activeId = fb.id;
  w.pasteClipboard();
  assert(T.state.clipboard === null, "cross-file cut succeeds as a plain move");
  assert(T.state.nodes[andNode.id], "the SAME node id survives a cross-file cut/paste — no reconstruction any more");
  assert(andNode.parentId === fb.id, "the AND node now sits under file B");
  assert(andNode.baked[0].value === "message" && andNode.baked[1].value === "other", "bakedA/bakedB are unaffected by crossing a file boundary");

  // Legit same-file move still works
  const gA = w.createFilterNode(fa.id, "text", "g");
  const gB = w.createFilterNode(fa.id, "text", "h");
  const gAnd = w.createAndOrNode([gA.id, gB.id], "and");
  const otherFilterA = w.createFilterNode(fa.id, "text", "y");
  T.state.activeId = otherFilterA.id;
  const movedOk = w.moveNode(gAnd.id, otherFilterA.id);
  assert(movedOk === true, "moveNode allows a non-cyclic reparent");
  assert(gAnd.parentId === otherFilterA.id, "AND node's parentId updated after a legit move");
  assert(gAnd.baked[0].value === "g" && gAnd.baked[1].value === "h", "bakedA/bakedB survive a legit move untouched");

  // Real drag-and-drop DOM path + isFileDrag() overlay gate
  w.render();
  const rows = [...d.querySelectorAll(".tree-row")];
  const plainRow = rows.find(r => r.querySelector(".tree-label") && r.querySelector(".tree-label").textContent.includes("message 1"));
  const fileRow = rows.find(r => r.dataset.nodeId === fb.id);
  assert(plainRow && fileRow, "located rows for a real drag-and-drop simulation");
  // Mouse-event drag (not HTML5 DnD — see treeDrag in philogg.html; Tauri's
  // native drag-drop handler swallows HTML5 dragover/drop on Windows).
  const plainNodeId = plainRow.dataset.nodeId;
  const mouse = (el, type, x, buttons) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX: x, clientY: 10 }));
  assert(plainRow.classList.contains("tree-draggable") && !plainRow.hasAttribute("draggable"),
    "a filter row is mouse-draggable, not an HTML5 draggable");
  const dropOverlayBefore = d.querySelector("#dropOverlay").classList.contains("hidden");
  mouse(plainRow, "mousedown", 10, 1);
  mouse(fileRow, "mousemove", 12, 1);
  assert(!fileRow.classList.contains("drag-over"), "a move below the threshold is not a drag yet (plain clicks stay clicks)");
  mouse(fileRow, "mousemove", 40, 1);
  assert(fileRow.classList.contains("drag-over"), "moving over a valid drop target highlights it");
  mouse(plainRow, "mousemove", 41, 1);
  assert(!plainRow.classList.contains("drag-over") && !fileRow.classList.contains("drag-over"),
    "the dragged row itself is no drop target, and the previous target loses its highlight");
  mouse(fileRow, "mousemove", 42, 1);
  mouse(fileRow, "mouseup", 42, 0);
  assert(T.state.nodes[plainNodeId].parentId === T.state.nodes[fileRow.dataset.nodeId].id, "dropping on another file's row reparents the filter under it");
  assert(T.state.activeId === plainNodeId, "the moved filter becomes active");
  assert(!d.querySelector("#tree .drag-over, #tree .dragging") && !d.body.classList.contains("tree-dragging"), "drag classes are cleared after the drop");
  // Internal tree drag must NOT trigger the file-drop overlay.
  assert(d.querySelector("#dropOverlay").classList.contains("hidden") === dropOverlayBefore,
    "internal tree drag does not toggle the file-drop overlay");
  // Drop on another filter: becomes its child. A click right after the
  // drag is swallowed (it isn't a selection click).
  w.render();
  const rows2 = [...d.querySelectorAll(".tree-row")];
  const src = rows2.find(r => r.dataset.nodeId === gB.id);
  const dst = rows2.find(r => r.dataset.nodeId === otherFilterA.id);
  mouse(src, "mousedown", 10, 1);
  mouse(dst, "mousemove", 50, 1);
  mouse(dst, "mouseup", 50, 0);
  assert(gB.parentId === otherFilterA.id, "dropping a filter on another filter appends it as that filter's child");
  const clickEv = new w.MouseEvent("click", { bubbles: true, cancelable: true });
  d.querySelector('.tree-row[data-node-id="' + gB.id + '"]').dispatchEvent(clickEv);
  assert(clickEv.defaultPrevented, "the click that ends a drag is swallowed");
  // A plain click (no move) never reparents.
  const before = gA.parentId;
  const gARow = d.querySelector('.tree-row[data-node-id="' + gA.id + '"]');
  mouse(gARow, "mousedown", 10, 1);
  mouse(d.querySelector('.tree-row[data-node-id="' + fb.id + '"]'), "mouseup", 10, 0);
  assert(gA.parentId === before, "mousedown + mouseup without moving is not a drop");
});
