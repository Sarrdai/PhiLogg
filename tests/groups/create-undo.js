// GROUP create-undo — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP create-undo — every user-initiated filter-node creation is exactly
   ONE undo step (activateNewNode hook + withCreateUndo for bulk paths);
   non-user creations (session restore, LLM tool runs) push no per-node
   step. Origin: 2026-10-06 (person-requested: only Patterns/Facets/AND-OR
   and LLM rounds were undoable, every other creation was permanent).
   ============================================================ */
group("create-undo");

await withApp(async (w, d, T) => {
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 200, seed: 11 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const ents = f.entries;

  // create() returns the ids that must vanish on undo and come back on redo;
  // parentId is where the selection must land after the undo.
  async function oneStep(label, parentId, create, opts = {}) {
    T.resetUndoRedo();
    T.state.activeId = parentId;
    const ids = await create();
    assert(ids.length >= 1 && ids.every(id => T.state.nodes[id]), label + ": nodes created");
    assert(T.undoStack.length === 1, label + ": exactly one undo step, got " + T.undoStack.length);
    const parents = ids.map(id => T.state.nodes[id].parentId);
    w.undo();
    assert(ids.every(id => !T.state.nodes[id]), label + ": undo removes every created node");
    assert(T.state.activeId === parentId, label + ": undo lands on the parent, got " + T.state.activeId);
    assert(T.undoStack.length === 0 && T.redoStack.length === 1, label + ": step moved to the redo stack");
    w.redo();
    assert(ids.every((id, i) => T.state.nodes[id] && T.state.nodes[id].parentId === parents[i]), label + ": redo restores the same ids under the same parents");
    assert(T.undoStack.length === 1, label + ": back to one step after redo");
    if (opts.cleanup) opts.cleanup(ids);
  }

  section("create-undo a. filter dialog (commitFilter) create");
  await oneStep("dialog", f.id, () => {
    w.openFilterPopup();
    d.querySelector("#filterInput").value = "Heartbeat";
    fireSubmit(d.querySelector("#filterForm"), w);
    return [T.state.activeId];
  });

  section("create-undo b. applyTimeWindow create vs edit");
  let tw;
  await oneStep("time window", f.id, () => {
    tw = w.applyTimeWindow(f.id, ents[10].ts, ents[50].ts);
    return [tw.id];
  });
  T.resetUndoRedo();
  w.applyTimeWindow(tw.id, ents[20].ts, null);
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "edit", "time window edit path pushes exactly one edit step, not edit + create, got " + T.undoStack.map(a => a.kind).join());

  section("create-undo c. level bar Add to tree, message filter");
  await oneStep("level", f.id, () => { w.applyLevelSelectionToTree(["ERROR"]); return [T.state.activeId]; });
  T.state.activeId = f.id;
  await oneStep("message filter", f.id, () => { w.extractMessageFilter(ents[3]); return [T.state.activeId]; });

  section("create-undo d. context / count-context / gap / link / selection");
  const base = w.createFilterNode(f.id, "text", "Order");
  const base2 = w.createFilterNode(f.id, "text", "Sensor");
  await oneStep("context", base.id, () => [w.createContextNode(base.id, 1000, 1000).id]);
  await oneStep("count context", base.id, () => [w.createCountContextNode(base.id, 2, 2).id]);
  await oneStep("gap", base.id, () => [w.createGapNode(base.id, { ms: 1000, per: null }).id]);
  await oneStep("link", f.id, () => [w.createLinkNode(base.id, base2.id, "after", 1, { orderEnforced: false, exclusive: false }).id]);
  await oneStep("selection filter", f.id, () => [w.createSelectionFilterNode(f.id, ents.slice(0, 3).map(e => e.id)).id]);

  section("create-undo e. copy+paste restores the subtree");
  const par = w.createFilterNode(f.id, "text", "Heartbeat");
  const kid = w.createFilterNode(par.id, "text", "ok");
  T.resetUndoRedo();
  T.state.clipboard = { id: par.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const clone = T.state.nodes[T.state.activeId];
  assert(clone && clone.id !== par.id && clone.children.length === 1, "sanity: clone with its child");
  const cloneKid = clone.children[0];
  assert(T.undoStack.length === 1, "paste is one step, got " + T.undoStack.length);
  w.undo();
  assert(!T.state.nodes[clone.id] && !T.state.nodes[cloneKid], "undo removes the pasted subtree");
  assert(T.state.nodes[par.id] && T.state.nodes[kid.id], "the original stays");
  w.redo();
  assert(T.state.nodes[clone.id] && T.state.nodes[cloneKid] && T.state.nodes[clone.id].children[0] === cloneKid, "redo restores the subtree under the same ids");

  section("create-undo f. one-click analysis creations and AND/OR stay exactly one step");
  T.resetUndoRedo();
  T.state.activeId = f.id;
  w.createFacetFilter({ key: "level", label: "Level" }, "ERROR", false);
  assert(T.undoStack.length === 1, "facet create: one step (no double push), got " + T.undoStack.length);
  w.undo();
  T.resetUndoRedo();
  w.performBulkAction("and", [base.id, base2.id]);
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "create", "AND: one step, got " + T.undoStack.length);
  const andNode = T.state.nodes[T.state.activeId];
  assert(andNode && andNode.filterType === "and", "sanity: AND node active");
  w.undo();
  assert(!T.state.nodes[andNode.id], "AND undo removes the node");
  w.redo();

  section("create-undo g. unpack = one step removing both clones");
  const before = T.state.nodes[andNode.id].parentId;
  T.resetUndoRedo();
  const kidsBefore = new Set(T.state.nodes[before].children);
  w.unpackAndOrLinkNode(andNode.id);
  const clones = T.state.nodes[before].children.filter(id => !kidsBefore.has(id));
  assert(clones.length === 2 && T.undoStack.length === 1, "unpack: two clones, one step, got " + clones.length + "/" + T.undoStack.length);
  w.undo();
  assert(clones.every(id => !T.state.nodes[id]) && T.state.nodes[andNode.id], "undo removes both clones, the AND node stays");
  w.redo();
  assert(clones.every(id => T.state.nodes[id]), "redo restores both clones");

  section("create-undo h. filter import (2 roots) and library apply = one step");
  const bA = w.serializeFilterBranch(base.id, false), bB = w.serializeFilterBranch(base2.id, false);
  bA.roots[0].ref = 100; bB.roots[0].ref = 101;
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: null, roots: [bA.roots[0], bB.roots[0]] });
  const tgt = w.createFilterNode(f.id, "text", "Target");
  await oneStep("import", tgt.id, () => {
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(tgt.id)};`;
    d.body.appendChild(s);
    const had = new Set(T.state.nodes[tgt.id].children);
    T.resetUndoRedo();
    w.importFilterJson(json);
    const made = T.state.nodes[tgt.id].children.filter(id => !had.has(id));
    assert(made.length === 2, "import created both roots");
    return made;
  });
  await oneStep("library apply", tgt.id, () => {
    const had = new Set(T.state.nodes[tgt.id].children);
    T.resetUndoRedo();
    w.applyFilterFromLibrary(tgt.id, { activeRef: bA.activeRef, roots: bA.roots });
    return T.state.nodes[tgt.id].children.filter(id => !had.has(id));
  });
});

await withApp(async (w, d, T) => {
  section("create-undo i. file-history Restore filters = one step; session restore and LLM tool runs push none");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 100, seed: 12 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const roots = [
    { ref: 1, filterType: "text", name: "“Heartbeat”", inverted: false, value: "Heartbeat", children: [] },
    { ref: 2, filterType: "text", name: "“Order”", inverted: false, value: "Order", children: [] },
  ];
  T.resetUndoRedo();
  w.materializeCachedFilters(f, roots);
  assert(f.children.length === 2 && T.undoStack.length === 0, "materializeCachedFilters (session restore) pushes no undo step");
  f.children.slice().forEach(id => w.deleteNode(id));
  T.resetUndoRedo();
  f.filterHistoryMatch = { filters: roots, tier: 1 };
  w.render();
  d.querySelector(".tree-ghost-restore-btn").click();
  const made = f.children.slice();
  assert(made.length === 2 && T.undoStack.length === 1, "Restore filters: two roots, one step, got " + made.length + "/" + T.undoStack.length);
  w.undo();
  assert(made.every(id => !T.state.nodes[id]) && T.state.activeId === f.id, "undo removes the restored roots, lands on the file");
  w.redo();
  assert(made.every(id => T.state.nodes[id]), "redo brings them back");

  T.resetUndoRedo();
  const r = w.runLlmTool("create_filter", { parentId: f.id, pattern: "Scheduler tick" });
  assert(r.result && r.result.nodeId && T.state.nodes[r.result.nodeId], "sanity: the LLM tool created a filter");
  assert(T.undoStack.length === 0, "LLM tool run pushes no per-node create entry (the round batch owns it), got " + T.undoStack.length);
});
