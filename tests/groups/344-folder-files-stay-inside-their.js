// GROUP 344 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 344 — Folder files stay inside their folder while it waits for
   Reconnect after a reload
   Origin: 2026-09-30, person-reported. A restored folder (needsPermission)
   listed only its restored LOG nodes, and with `relPath: n.name`: (1) an
   inline viewer (an image since 2026-10-01; then also .txt/.json) was not
   listed (until Reconnect scanned the folder again); (2) a subfolder log's seed rec didn't match the
   scan's "sub/x.log", so Reconnect CLOSED the open file. Now node.folderRelPath
   (persisted) seeds the log's relPath and restoreViewersFromCache seeds the
   viewer's listing entry.
   ============================================================ */
group(344);
if (groupSelected()) {
  const simText = seed => LOGSIM.generateToStrings({ format: "default", entries: 6, seed })[0].text;
  const fileHandle = (w, name, text) => ({
    kind: "file", name,
    async getFile() {
      const blob = new w.Blob([text]);
      Object.defineProperty(blob, "name", { value: name, configurable: true });
      Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
      blob.text = async () => text;
      blob.arrayBuffer = async () => new w.TextEncoder().encode(text).buffer;
      blob.slice = start => { const t = text.slice(start); const b = new w.Blob([t]); b.text = async () => t; return b; };
      return blob;
    },
  });
  // Class instance so fake-indexeddb's structured clone drops the methods (Group 38c).
  const dirState = new WeakMap();
  class Dir {
    constructor(w, name, map) { this.kind = "directory"; this.name = name; dirState.set(this, { w, map }); }
    async *values() {
      const { w, map } = dirState.get(this);
      for (const k of Object.keys(map)) yield typeof map[k] === "string" ? fileHandle(w, k, map[k]) : new Dir(w, k, map[k]);
    }
    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
  }
  const disk = w => ({ "pic.png": "PNGDATA", "notes.txt": "alpha\nbeta\ngamma\n", "top.log": simText(1), sub: { "deep.log": simText(2) } });
  const factory = new IDBFactory();
  let folderId = null;

  await withApp(async (w, d, T) => {
    section("344a. Window A: watch a folder (subfolders on), open a subfolder log, an image viewer and a .txt plain-text node");
    await T.bootRestore;
    await w.addWatchedFolder(new Dir(w, "watched", disk(w)));
    const folder = T.state.folders[0];
    folderId = folder.id;
    folder.settings.includeSubfolders = true;
    await w.persistFolder(folder);
    await w.rescanFolder(folder);
    assert(folder.files.some(r => r.relPath === "sub/deep.log"), "sanity: the scan lists sub/deep.log, got " + folder.files.map(r => r.relPath));
    const deep = folder.files.find(r => r.relPath === "sub/deep.log");
    await w.loadFolderFile(folder, deep);
    const node = T.state.nodes[deep.nodeId];
    assert(node && node.folderRelPath === "sub/deep.log", "the folder log node remembers its folder-relative path, got " + (node && node.folderRelPath));
    await w.persistFileNode(node);
    const fileRec = await w.cacheStoreOp("files", "readonly", s => s.get(node.cacheKey));
    assert(fileRec.folderRelPath === "sub/deep.log", "...and it is persisted");
    const pic = folder.files.find(r => r.name === "pic.png");
    await w.loadFolderFile(folder, pic);
    const viewer = folder.inlineViewers.get("pic.png");
    assert(viewer, "the .png opened as a folder inline viewer");
    await waitFor(async () => !!(await w.cacheStoreOp("files", "readonly", s => s.get(viewer.cacheKey))));
    const txt = folder.files.find(r => r.name === "notes.txt");
    await w.loadFolderFile(folder, txt);
    const tv = T.state.nodes[txt.nodeId];
    assert(tv && tv.formatId === "fmt-plaintext" && tv.folderId === folder.id, "the .txt opened as a plain-text node of the folder");
    await w.persistFileNode(tv);
    w.activateInlineViewer(viewer);
    await w.persistMetaNow();
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("344b. Window B (folder awaiting Reconnect): viewer listed in the folder, the text node and the subfolder log nested inside, nothing loose in #tree");
    await T.bootRestore;
    const folder = T.state.folders[0];
    assert(folder && folder.id === folderId && folder.needsPermission === true, "sanity: the folder is restored and awaits Reconnect");
    const rel = folder.files.map(r => r.relPath).sort();
    assert(rel.join(",") === "notes.txt,pic.png,sub/deep.log", "the folder lists the viewer, the text file and the subfolder log by relPath, got " + rel);
    assert(folder.inlineViewers.has("pic.png"), "the viewer is restored into the folder");
    const tvNode = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "notes.txt");
    assert(tvNode && tvNode.folderId === folder.id && tvNode.formatId === "fmt-plaintext", "the text file's node is restored into the folder as plain text");
    w.render();
    const box = d.querySelector(".folder-watch");
    assert(box && /Reconnect/.test(box.textContent), "the folder shows Reconnect");
    assert(box.querySelector(".zip-source-file") || [...box.querySelectorAll(".folder-watch-file-name")].some(e => e.textContent === "pic.png"), "the viewer row is inside .folder-watch");
    assert(box.querySelector('[data-node-id="' + tvNode.id + '"]'), "the text file's row is inside .folder-watch");
    const loose = [...d.querySelectorAll("#tree [data-node-id]")].filter(e => !e.closest(".folder-watch"));
    assert(loose.length === 0, "no file row sits outside the folder container, got " + loose.length);

    section("344c. Reconnect: identity kept, the subfolder log is not closed, still nothing outside");
    const deepRec = folder.files.find(r => r.relPath === "sub/deep.log");
    const deepNode = T.state.nodes[deepRec.nodeId];
    const viewerBefore = folder.inlineViewers.get("pic.png");
    const recBefore = folder.files.find(r => r.relPath === "pic.png");
    folder.handle = new Dir(w, "watched", disk(w));
    await w.reconnectFolder(folder);
    assert(folder.needsPermission === false, "reconnected");
    const deepAfter = folder.files.find(r => r.relPath === "sub/deep.log");
    assert(deepAfter === deepRec && deepAfter.nodeId === deepNode.id && T.state.nodes[deepNode.id] === deepNode, "the subfolder log's rec and node survived the reconnect");
    assert(folder.files.find(r => r.relPath === "pic.png") === recBefore && folder.inlineViewers.get("pic.png") === viewerBefore, "the viewer and its rec kept their identity");
    assert(tvNode && T.state.nodes[tvNode.id] === tvNode, "the text file's node is still alive");
    w.render();
    assert([...d.querySelectorAll("#tree [data-node-id]")].every(e => e.closest(".folder-watch")), "after Reconnect nothing is outside the folder either");
  }, { indexedDB: factory });
}
