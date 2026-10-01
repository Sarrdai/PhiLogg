// GROUP 324 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 324 — Left/Right expand/collapse in tree navigation
   Origin: 2026-09-29 (person-requested). moveTreeSelection (plain arrows
   with tree focus AND Alt+Arrow), Explorer/VS Code model: Right expands a
   collapsed node with children, else moves to the first listed child, leaf
   no-op; Left collapses an expanded node (selection stays), else moves to the
   parent WITHOUT collapsing it, top level no-op. Also for every collapsible
   element: the "Sources" node (nodeHasCollapsibleChildren, shared with the
   chevron) and the subfolder rows of watched folders / ZIPs (virtual
   "dirnav:" ids in flattenTreeIds, state.treeCursor cursor with the
   active row style, click toggles + puts the cursor there).
   ============================================================ */
group(324);
await withApp(async (w, d, T) => {
  section("324a. Right/Left expand, move, collapse, Left to parent (no parent collapse), leaf no-op");
  const f = await w.addFile("a.log", makeLog(0, 8), () => {});
  const fa = w.createFilterNode(f.id, "text", "a");
  const fb = w.createFilterNode(fa.id, "text", "b");
  const fc = w.createFilterNode(f.id, "text", "c");
  T.state.activeId = f.id; T.state.focusRegion = "tree"; w.render();
  const key = k => fireKeydown(d, w, k);
  assert(w.nodeHasCollapsibleChildren(f) && !w.nodeHasCollapsibleChildren(fc), "helper: file has collapsible children, leaf does not");

  f.collapsed = true; w.render();
  key("ArrowRight");
  assert(f.collapsed === false && T.state.activeId === f.id, "Right on a collapsed node expands it, selection stays");
  key("ArrowRight");
  assert(T.state.activeId === fa.id, "Right on an expanded node moves to its first child");
  key("ArrowLeft");
  assert(fa.collapsed === true && T.state.activeId === fa.id, "Left on an expanded node collapses it, selection stays");
  key("ArrowRight");
  assert(fa.collapsed === false && T.state.activeId === fa.id, "Right re-expands");
  key("ArrowRight");
  assert(T.state.activeId === fb.id, "Right -> first child fb");
  key("ArrowRight");
  assert(T.state.activeId === fb.id, "Right on a leaf is a no-op");
  key("ArrowLeft");
  assert(T.state.activeId === fa.id && fa.collapsed === false, "Left on a leaf moves to its parent WITHOUT collapsing it");
  fa.collapsed = true; w.render();
  key("ArrowLeft");
  assert(T.state.activeId === f.id && f.collapsed === false, "Left on a collapsed node moves to its parent, which stays expanded");
  f.collapsed = true; w.render();
  key("ArrowLeft");
  assert(T.state.activeId === f.id, "Left on a collapsed top-level node is a no-op");

  section("324b. Right skips a first child that flattenTreeIds does not list (queued placeholder)");
  f.collapsed = false;
  fa.queued = true; w.render();
  T.state.activeId = f.id;
  key("ArrowRight");
  assert(T.state.activeId === fc.id, "first listed child (fc) is chosen, queued fa is skipped");
  delete fa.queued;

  section("324c. Alt+Arrow from entries focus does the same");
  f.collapsed = true; T.state.focusRegion = "entries"; T.state.activeId = f.id; w.render();
  fireKeydown(d, w, "ArrowRight", { altKey: true });
  assert(f.collapsed === false && T.state.activeId === f.id, "Alt+Right expands");
  fireKeydown(d, w, "ArrowRight", { altKey: true });
  assert(T.state.activeId !== f.id && T.state.focusRegion === "entries", "Alt+Right steps to the first child, focus stays on entries");
  fireKeydown(d, w, "ArrowLeft", { altKey: true });
  assert(T.state.activeId === f.id && f.collapsed === false, "Alt+Left from a leaf child moves to the parent");

  section("324d. Sources node: expand, first source, collapse, Left to the merge");
  const fs1 = await w.addFile("s1.log", makeLog(0, 2), () => {});
  const fs2 = await w.addFile("s2.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fs1.id, fs2.id]);
  const srcNode = T.state.nodes[merged.children[0]];
  assert(srcNode.filterType === "sources" && w.nodeHasCollapsibleChildren(srcNode), "sources node counts as collapsible via the owner's sources array");
  merged.collapsed = false; srcNode.collapsed = true;
  T.state.activeId = srcNode.id; T.state.focusRegion = "tree"; w.render();
  key("ArrowRight");
  assert(srcNode.collapsed === false && T.state.activeId === srcNode.id, "Right expands the collapsed Sources node");
  key("ArrowRight");
  assert(T.state.activeId === merged.sources[0].id, "Right on the expanded Sources node moves to the first source");
  T.state.activeId = srcNode.id; w.render();
  key("ArrowLeft");
  assert(srcNode.collapsed === true && T.state.activeId === srcNode.id, "Left collapses the expanded Sources node");
  key("ArrowLeft");
  assert(T.state.activeId === merged.id && merged.collapsed === false, "Left on the collapsed Sources node moves to the merge without collapsing it");
});

await withApp(async (w, d, T) => {
  section("324e. watched folder: subfolder rows are nav targets (Up/Down), Right/Left expand/collapse/parent, active style, click puts the cursor there");
  function fakeDir(name, entries) {
    return {
      kind: "directory", name,
      async *values() {
        for (const [key, val] of Object.entries(entries)) {
          if (typeof val === "string") yield { kind: "file", name: key, async getFile() { const b = new w.Blob([val]); b.text = async () => val; return b; } };
          else yield fakeDir(key, val);
        }
      },
    };
  }
  await w.addWatchedFolder(fakeDir("tlogs", { "Root.log": makeLog(0, 2), "sub": { "Nested.log": makeLog(1, 2), "deeper": { "Deep.log": makeLog(2, 2) } } }));
  const folder = T.state.folders[0];
  folder.settings.includeSubfolders = true;
  await w.rescanFolder(folder);
  w.render();
  const other = await w.addFile("plain.log", makeLog(0, 3), () => {});
  T.state.activeId = other.id; T.state.focusRegion = "tree"; w.render();
  const key = k => fireKeydown(d, w, k);
  const subId = w.dirNavId("folder", folder.id, "sub"), deeperId = w.dirNavId("folder", folder.id, "sub/deeper");
  const cursor = () => w.treeCursorId();
  const activeDirLabels = () => [...d.querySelectorAll("#folderWatchList .tree-dir-row.tree-cursor .tree-label")].map(l => l.textContent).join(",");

  let ids = w.flattenTreeIds();
  assert(ids.includes(subId) && !ids.includes(deeperId), "collapsed: the top dir row is listed, its child dir is not");
  assert(w.navParentId(subId) === null, "a top-level dir row has no parent");

  // Nav order follows the sidebar: folders first (dirs before files), then the main tree.
  assert(ids.indexOf(subId) < ids.indexOf(other.id), "folder section is listed before the main tree, as rendered");
  const beforeMain = ids[ids.indexOf(other.id) - 1];
  T.state.activeId = beforeMain; w.render();
  // Walk Up from the folder's last listed row until the dir row is reached.
  for (let k = 0; k < 5 && cursor() !== subId; k++) key("ArrowUp");
  assert(cursor() === subId, "Up reaches the dir row as a cursor position");
  assert(activeDirLabels() === "sub", "the dir row is rendered with the active style, got " + activeDirLabels());
  key("ArrowRight");
  assert(folder.expandedDirs.has("sub") && cursor() === subId, "Right on a collapsed dir expands it, cursor stays");
  key("ArrowRight");
  assert(cursor() === deeperId, "Right on an expanded dir moves to its first child (the nested dir row: dirs come first)");
  key("ArrowLeft");
  assert(cursor() === subId, "Left on a collapsed dir goes to its parent dir row (no collapsing)");
  assert(folder.expandedDirs.has("sub"), "...which stays expanded");
  key("ArrowLeft");
  assert(!folder.expandedDirs.has("sub") && cursor() === subId, "Left on an expanded dir collapses it");
  key("ArrowLeft");
  assert(cursor() === subId, "Left on a collapsed top-level dir is a no-op");
  const afterSub = w.flattenTreeIds()[w.flattenTreeIds().indexOf(subId) + 1];
  assert(w.isUnloadedNavId(afterSub), "the entry after the collapsed dir is the unloaded Root.log stop (GROUP 329)");
  key("ArrowDown");
  assert(cursor() === afterSub, "Down leaves the dir row for the next stop (the unloaded entry keeps the cursor)");
  assert(activeDirLabels() === "", "no dir row is highlighted any more");
  key("ArrowDown");
  assert(cursor() === null && T.state.activeId === w.flattenTreeIds()[w.flattenTreeIds().indexOf(afterSub) + 1], "Down onto a real node clears the cursor");

  // Open a nested file; it must sit under its dir in the nav order.
  folder.expandedDirs.add("sub"); folder.expandedDirs.add("sub/deeper"); w.render();
  const nestedRec = folder.files.find(f => f.name === "Nested.log");
  await w.loadFolderFile(folder, nestedRec);
  w.render();
  ids = w.flattenTreeIds();
  const i = id => ids.indexOf(id);
  assert(i(subId) > -1 && i(deeperId) === i(subId) + 1 && i(nestedRec.nodeId) === i(deeperId) + 2,
    "order under an expanded dir: dir row, nested dir row (+ its unloaded Deep.log), then the opened Nested.log");
  assert(w.navParentId(nestedRec.nodeId) === subId && w.navParentId(deeperId) === subId, "the opened file's and the nested dir's parent is the dir row");
  T.state.activeId = nestedRec.nodeId; T.state.focusRegion = "tree"; w.render();
  key("ArrowLeft");
  assert(cursor() === subId && T.state.activeId === nestedRec.nodeId, "Left on an opened file inside a subfolder moves the cursor to its dir row");
  assert(activeDirLabels() === "sub", "dir row highlighted");
  key("ArrowDown");
  assert(cursor() === deeperId, "Down from a dir row steps to the next nav entry");
  key("ArrowDown");
  assert(w.isUnloadedNavId(cursor()), "Down from the nested dir row lands on its unloaded Deep.log (cursor-only)");
  key("ArrowDown");
  assert(cursor() === null && T.state.activeId === nestedRec.nodeId, "Down onto a real node makes it the selection again (cursor cleared)");

  // Mouse: click toggles AND puts the cursor there, focus -> tree.
  T.state.focusRegion = "entries";
  const row = [...d.querySelectorAll("#folderWatchList .tree-dir-row")].find(r => r.querySelector(".tree-label").textContent === "deeper");
  fireClick(row, w);
  assert(!folder.expandedDirs.has("sub/deeper"), "click toggles the dir");
  assert(cursor() === deeperId && T.state.focusRegion === "tree", "click puts the cursor on it and focuses the tree");
  assert(activeDirLabels() === "deeper", "clicked dir row shows active");
  const activeRow = d.querySelector('.tree-row[data-node-id="' + nestedRec.nodeId + '"]');
  assert(activeRow, "the main-view node keeps its own state");
  const n = Object.keys(T.state.nodes).length;
  key("Delete");
  assert(Object.keys(T.state.nodes).length === n, "Delete with the cursor on a dir row does not delete the active node");
  // A click on a node row clears the cursor.
  fireClick(activeRow, w);
  assert(cursor() === null && activeDirLabels() === "", "clicking a node row clears the dir cursor");
});

await withApp(async (w, d, T) => {
  section("324f. ZIP: dir rows navigable (nested dirs, Right expands/enters, Left collapses/goes to the parent dir)");
  const zlib = require("zlib");
  const stored = (entries) => {
    let offset = 0; const local = [], central = [];
    for (const e of entries) {
      const nameBuf = Buffer.from(e.name, "utf8"), data = Buffer.from(e.data, "utf8");
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
      lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
      const rec = Buffer.concat([lh, nameBuf, data]);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
      ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
      local.push(rec); central.push(Buffer.concat([ch, nameBuf])); offset += rec.length;
    }
    const L = Buffer.concat(local), C = Buffer.concat(central), eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(C.length, 12); eocd.writeUInt32LE(L.length, 16);
    return Buffer.concat([L, C, eocd]);
  };
  const zip = await w.openZipSource(new w.File([stored([
    { name: "top.log", data: makeLog(0, 3) },
    { name: "sub/app.log", data: makeLog(0, 3) },
    { name: "sub/inner/deep.log", data: makeLog(0, 3) },
  ])], "logs.zip"), "logs.zip");
  const subId = w.dirNavId("zip", zip.id, "sub"), innerId = w.dirNavId("zip", zip.id, "sub/inner");
  const key = k => fireKeydown(d, w, k);
  T.state.focusRegion = "tree";
  let ids = w.flattenTreeIds();
  const topId = w.unloadedNavId("zip", zip.id, "top.log"), appId = w.unloadedNavId("zip", zip.id, "sub/app.log");
  assert(ids.join("|") === subId + "|" + topId, "the collapsed top dir row, then the unloaded top.log stop (GROUP 329), got " + ids.join("|"));
  key("ArrowDown");
  assert(w.treeCursorId() === subId, "Down reaches the ZIP dir row when nothing else is in the list");
  key("ArrowRight");
  assert(zip.expandedDirs.has("sub"), "Right expands the ZIP dir");
  ids = w.flattenTreeIds();
  assert(ids.join("|") === subId + "|" + innerId + "|" + appId + "|" + topId, "expanded: the nested dir row, then the dir's unloaded entries follow, got " + ids.join("|"));
  key("ArrowRight");
  assert(w.treeCursorId() === innerId, "Right enters the nested dir row (first listed child)");
  key("ArrowRight");
  assert(w.treeCursorId() === innerId && zip.expandedDirs.has("sub/inner"), "Right on the collapsed nested dir expands it");
  key("ArrowRight");
  assert(w.isUnloadedNavId(w.treeCursorId()) && w.navParentId(w.treeCursorId()) === innerId, "Right on an expanded dir steps to its first listed child (its unloaded deep.log)");
  key("ArrowLeft");
  assert(w.treeCursorId() === innerId && zip.expandedDirs.has("sub/inner"), "Left on the unloaded entry goes to its dir row (no collapsing)");
  key("ArrowLeft"); key("ArrowLeft");
  assert(w.treeCursorId() === subId, "Left, Left: collapse the nested dir, then go to the parent dir row");
});
