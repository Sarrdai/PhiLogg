// GROUP undo-delete-selection — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP undo-delete-selection — undo/redo leave the restored node as the
   single selection. Origin: 2026-10-04 (tablet usability re-test): deleting
   a NON-active filter (tree menu "Remove filter" on a long-pressed node)
   while the file was the multi-selection, then undo, left activeId = the
   restored filter but multiSelect = {file}: the sidebar showed "Select only
   files or only filters" with both rows highlighted.
   ============================================================ */
group("undo-delete-selection");

await withApp(async (w, d, T) => {
  section("undo-delete-selection a. undo of a non-active node's delete: single selection");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 2 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const x1 = w.createFilterNode(f.id, "text", "Heartbeat");
  const x2 = w.createFilterNode(f.id, "text", "Order");
  T.state.activeId = f.id;
  T.state.multiSelect = new Set([f.id]);
  w.render();
  w.deleteFilterNodeWithUndo(x2.id);
  w.deleteFilterNodeWithUndo(x1.id);
  w.undo();
  assert(T.state.activeId === x1.id, "undo activates the restored node");
  assert(T.state.multiSelect.size === 1 && T.state.multiSelect.has(x1.id), "multiSelect is exactly the restored node, got " + [...T.state.multiSelect].join());
  w.undo();
  assert(T.state.activeId === x2.id && T.state.multiSelect.size === 1 && T.state.multiSelect.has(x2.id), "second undo: same");
  assert(!d.querySelector("#sidebar").textContent.includes("Select only files or only filters"), "no mixed-selection hint in the sidebar");
  w.redo();
  assert(T.state.multiSelect.size === 1 && T.state.multiSelect.has(T.state.activeId), "redo keeps a single selection too, active " + T.state.activeId);
});

await withApp(async (w, d, T) => {
  section("undo-delete-selection b. undo of a file delete");
  const fa = await w.addFile("a.log", makeLog(0, 10), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 10, { msgPrefix: "other" }), () => {});
  T.state.activeId = fb.id;
  T.state.multiSelect = new Set([fa.id, fb.id]);
  w.deleteFilterNodeWithUndo(fa.id);
  w.undo();
  assert(T.state.nodes[fa.id] && T.state.multiSelect.size === 1 && T.state.multiSelect.has(T.state.activeId), "restored file is the single selection, got " + [...T.state.multiSelect].join());
});
