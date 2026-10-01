// GROUP 241 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 241 — "Sources" is a real, locked filter node (this session's
   rework, replacing the previous presentational-only group): its own
   getEntries is a pure passthrough, it's excluded from filter-tree
   persistence carriers exactly like Bookmarks/Notes, and its context menu
   reduces to the same locked-node "Copy only" treatment those two get.
   ============================================================ */
group(241);
await withApp(async (w, d, T) => {
  section("241a. Sources node: getEntries passthrough, excluded from the session-cache filter-tree carrier (mirrors Bookmarks/Notes)");
  const fa = await w.addFile("a.log", makeLog(0, 3), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 3, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  const sourcesId = merged.children[0];
  const sourcesNode = T.state.nodes[sourcesId];
  assert(sourcesNode.filterType === "sources" && sourcesNode.locked === true, "sanity: real, locked filter node");
  assert(w.getEntries(sourcesId).length === merged.entries.length,
    "getEntries on the Sources node is a pure passthrough of its parent's (the merged file's) own result");

  const cached = w.serializeFilterTreeForCache(merged);
  assert(!cached.roots.some(r => r.filterType === "sources"), "serializeFilterTreeForCache excludes the Sources node, same as Bookmarks/Notes");
});

await withApp(async (w, d, T) => {
  section("241b. Sources node: context menu reduces to Copy-only, the same locked-node treatment Bookmarks/Notes already get");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  T.state.activeId = merged.id;
  w.render();
  const sourcesId = merged.children[0];
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, sourcesId);
  const actions = [...d.querySelectorAll("#treeContextMenu [data-action]")].map(el => el.dataset.action);
  assert(actions.includes("copy"), "Copy is offered, got " + JSON.stringify(actions));
  assert(!actions.some(a => ["delete", "rename", "edit", "invert", "cut"].includes(a)),
    "delete/rename/edit/invert/cut are NOT offered for a locked node, got " + JSON.stringify(actions));
});
