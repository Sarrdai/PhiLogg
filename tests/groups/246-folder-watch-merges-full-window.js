// GROUP 246 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 246 — folder-watch merges (full/window): create-first shell,
   sources tagged hidden once loaded, and the folder's own listing never
   double-renders a hidden source.
   ============================================================ */
group(246);
await withApp(async (w, d, T) => {
  section("246. folderMinimapMergeFull: shell created first, sources end up tagged+hidden, folder's own listing doesn't double-render them");
  function fakeFileHandle(text) {
    return {
      kind: "file",
      getFile: async () => {
        const blob = new w.Blob([text]);
        blob.slice = (s, e) => { const ee = e === undefined ? text.length : e; const sl = text.slice(s, ee); const b = new w.Blob([sl]); b.text = async () => sl; return b; };
        return blob;
      },
    };
  }
  const recA = { name: "a.log", relPath: "a.log", nodeId: null, handle: fakeFileHandle(makeLog(0, 3)) };
  const recB = { name: "b.log", relPath: "b.log", nodeId: null, handle: fakeFileHandle(makeLog(100, 3, { msgPrefix: "later" })) };
  const folder = { id: "fm-246-folder", name: "f246", files: [recA, recB] };
  T.state.folders.push(folder);
  await Promise.all(folder.files.map(rec => w.probeFolderFileRange(folder, rec)));

  T.fmFolderId = folder.id;
  T.fmSelectedRecKeys = new Set([w.folderFileKey(recA), w.folderFileKey(recB)]);
  T.fmSelectedWindow = null;
  await w.folderMinimapMergeFull(folder);

  const merged = T.state.nodes[T.state.activeId];
  assert(merged && merged.merged === true, "a merged node was created and is active");
  assert(recA.nodeId && recB.nodeId, "both targets loaded");
  assert(T.state.nodes[recA.nodeId].mergeOwnerId === merged.id && T.state.nodes[recA.nodeId].mergeSourceHidden === true,
    "recA's node ended up tagged hidden once its own load finished");
  assert(T.state.nodes[recB.nodeId].mergeOwnerId === merged.id && T.state.nodes[recB.nodeId].mergeSourceHidden === true, "same for recB");

  T.state.activeId = merged.id; // renderMainView needs an active node before render() touches the folder section
  w.render();
  const folderBox = w.renderFolderSection(folder);
  assert(!folderBox.querySelector('[data-node-id="' + recA.nodeId + '"]'), "the folder's own listing does not also render recA (would double-render alongside its nested Sources row)");
  assert(!folderBox.querySelector('[data-node-id="' + recB.nodeId + '"]'), "same for recB");
});
