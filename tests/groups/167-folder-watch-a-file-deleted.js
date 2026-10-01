// GROUP 167 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 167 — Folder watch: a file deleted outside the app disappears
   from the listing (this session, person-reported): mergeScannedFiles used
   to keep an OPEN listing entry forever once a scan stopped finding it on
   disk (deliberate scope at the time — "doesn't detect removed files").
   Now any entry a fresh scan no longer finds is dropped from folder.files
   entirely, closing it first (closeFolderFile) if it was open.
   ============================================================ */
group(167);
await withApp(async (w, d, T) => {
  section("167. A file deleted outside the app disappears from the folder-watch listing");

  function fakeFileHandle(name, text) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() { for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]); },
    };
  }

  const fileMap = { "del-open.log": makeLog(0, 2), "del-closed.log": makeLog(10, 2), "keep.log": makeLog(20, 2) };
  const dir = fakeDirHandle("dellogs", fileMap);
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];
  assert(folder.files.length === 3, "sanity: all 3 files listed initially");

  // Open one of the files that's about to be "deleted", to prove an open
  // file is dropped too, not just closed ones.
  const openRec = folder.files.find(f => f.name === "del-open.log");
  await w.loadFolderFile(folder, openRec);
  await waitFor(() => openRec.nodeId && T.state.nodes[openRec.nodeId].entries.length === 2);
  const openedNodeId = openRec.nodeId;
  assert(T.state.rootIds.includes(openedNodeId), "sanity: del-open.log is a real open root node before deletion");

  // Both del-open.log and del-closed.log vanish from the real folder.
  delete fileMap["del-open.log"];
  delete fileMap["del-closed.log"];
  await w.folderScanTick();

  assert(folder.files.length === 1 && folder.files[0].name === "keep.log",
    "both deleted files are gone from folder.files, only the still-present keep.log remains, got " + folder.files.map(f => f.name).join(","));
  assert(!T.state.rootIds.includes(openedNodeId), "the deleted file's open root node was removed from state.rootIds");
  assert(T.state.nodes[openedNodeId] === undefined, "the deleted file's open node is fully gone from state.nodes, not just unlinked");
  assert(T.entryIndex[T.state.nodes[openedNodeId] ? openedNodeId : "__none__"] === undefined,
    "no stale entryIndex reference survives for the deleted file's entries");
  w.render();
  const folderBox = d.querySelector(".folder-watch");
  assert([...folderBox.querySelectorAll(".folder-watch-file, .tree-row")].every(el => {
    const label = el.querySelector(".tree-label, .folder-watch-file-name");
    return !label || (label.textContent !== "del-open.log" && label.textContent !== "del-closed.log");
  }), "neither deleted file renders in the folder box anymore, open or closed");

  // A later poll finding nothing new/removed leaves the survivor untouched.
  await w.folderScanTick();
  assert(folder.files.length === 1 && folder.files[0].name === "keep.log", "a subsequent no-op scan doesn't disturb the surviving file");
});
