// GROUP 145 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 145 — Folder watch without the File System Access API
   (the Tauri wrapper's native listing: philogg.pickFolder + listFolder)
   Origin: this session. showDirectoryPicker() is a *webview* API and obeys
   the engine's rules, not the app's: Chromium refuses a directory handle
   for anything on its hardcoded sensitive-folder list ("this folder
   contains system files" — Desktop and Downloads among them), and no
   embedder switch turns that off, while WKWebView/WebKitGTK don't
   implement the API at all. So a wrapper that lists directories itself
   (Rust read_dir, files served under philogg://local/…) is the only way
   folder watch works on Desktop, or on macOS/Linux at all. philogg.html
   drives that through nativeDirHandle, a stand-in with the same four
   members the folder-watch code uses, so scanFolderHandle/rescanFolder/
   folderScanTick/tryReconnectFolder are untouched — and every listed file
   arrives with its real path, closing the last route in that wrapper whose
   files had no "Open File Location"/"Copy Path" (FEATURE_BACKLOG.md #61).
   ============================================================ */
group(145);

const dirsA = { "/home/user/Desktop": { "a.log": makeLog(0, 5), "b.log": makeLog(100, 3), "notes.pdf": "not compatible/viewable" } };
const bridgeA = nativeFolderBridge(dirsA);
bridgeA.picked = { path: "/home/user/Desktop", name: "Desktop" };

await withApp(async (w, d, T) => {
  section("145a. \"Open… → Folder…\" uses the wrapper's own picker, not showDirectoryPicker");
  bridgeA.installFetch(w);

  assert(typeof w.showDirectoryPicker === "undefined",
    "fixture sanity: no File System Access API here — the macOS/Linux webview case, and the one Group 38b calls unsupported");

  fireClick(d.querySelector("#btnOpen"), w);
  fireClick(d.querySelector('#openMenu [data-action="folder"]'), w);
  await waitFor(() => T.state.folders.length > 0 && T.state.folders[0].files);

  assert(T.state.folders.length === 1, "the folder is watched even with no showDirectoryPicker anywhere");
  assert(d.querySelector("#copyToast").textContent.indexOf("Chromium-based browser") === -1,
    "...and no \"unsupported browser\" notice is shown, unlike Group 38b's plain-browser case");
  const folder = T.state.folders[0];
  assert(folder.name === "Desktop", "the section is named after the picked folder, got " + folder.name);
  assert(folder.files.map(f => f.name).join(",") === "a.log,b.log",
    "only the compatible extensions are listed, in name order, got " + folder.files.map(f => f.name).join(","));
  assert(d.querySelectorAll(".folder-watch-file").length === 2, "both are rendered as grayed, unread listing rows");
}, { philogg: bridgeA });

await withApp(async (w, d, T) => {
  section("145b. A file opened from such a folder knows its path (FEATURE_BACKLOG #61)");
  bridgeA.installFetch(w);

  await w.openFolderPickerFlow();
  const folder = T.state.folders[0];
  const rec = folder.files.find(f => f.name === "a.log");
  await w.loadFolderFile(folder, rec);

  const node = T.state.nodes[rec.nodeId];
  assert(node && node.name === "a.log", "the listed file loads on demand, same as a handle-backed one");
  assert(node.folderId === folder.id, "...still tagged with its folder, so closing returns it to the listing");
  assert(node.localPath === "/home/user/Desktop/a.log", "...carrying the real OS path, got " + node.localPath);
  assert(node.sourceUrl === rec.handle.__philoggUrlTail,
    "...and the philogg://local URL it was read from, got " + node.sourceUrl);
  assert(node.tail && typeof node.tail.handle.getFile === "function", "...and it tails, through that same URL");

  T.state.activeId = node.id;
  w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + node.id + '"]'), w);
  assert(d.querySelector('#treeContextMenu [data-action="revealLocation"]'),
    "\"Open File Location\" is offered for a folder-watched file — the gap #61 describes");
  assert(d.querySelector('#treeContextMenu [data-action="copyPath"]'), "...and \"Copy Path\" with it");
  w.closeTreeContextMenu();
}, { philogg: bridgeA });

await withApp(async (w, d, T) => {
  section("145c. Rescans pick up new files; an unreadable folder fails the same way a revoked handle does");
  const dirs = { "/logs": { "one.log": makeLog(0, 3) } };
  const bridge = w.philogg;
  bridge.installFetch(w);
  bridge.picked = { path: "/logs", name: "logs" };
  bridge.dirs = dirs;

  await w.openFolderPickerFlow();
  const folder = T.state.folders[0];
  assert(folder.files.length === 1, "sanity: one file listed to start with");

  dirs["/logs"]["two.log"] = makeLog(500, 2);
  await w.folderScanTick();
  assert(folder.files.map(f => f.name).join(",") === "one.log,two.log",
    "a file that appeared after the watch started is merged in, got " + folder.files.map(f => f.name).join(","));

  delete dirs["/logs"];
  await w.folderScanTick();
  assert(folder.failed === true, "a folder that can no longer be listed is marked failed, not left silently scanning");
  assert(d.querySelector(".folder-watch-icon.live") === null, "...and stops showing the live state");
}, { philogg: (() => { const b = nativeFolderBridge({}); b.listFolder = async (p, exts) => {
      const map = b.dirs && b.dirs[p];
      if (!map) throw new Error("No such file or directory (os error 2)");
      return Object.keys(map).sort().filter(n => exts.some(e => n.toLowerCase().endsWith(e)))
        .map((n, i) => ({ url: "philogg://local/" + (i + 1) + "/" + n, path: p + "/" + n, name: n }));
    }; return b; })() });

await withApp(async (w, d, T) => {
  section("145d. A dropped folder now starts a watch instead of only explaining itself");
  bridgeA.installFetch(w);

  await w.philoggLoadLocalFiles({ files: [], folders: ["/home/user/Desktop"] });
  assert(T.state.folders.length === 1, "the native drop's folder path is enough to watch it");
  assert(T.state.folders[0].name === "Desktop", "the section is named after the dropped folder's last path segment");
  assert(T.state.folders[0].files.length === 2, "...and it is listed immediately, like a picked one");
  assert(d.querySelector("#copyToast").textContent.indexOf("Open… → Folder…") === -1,
    "the \"use Open… → Folder…\" notice is gone for a wrapper that can list folders");
}, { philogg: bridgeA });

await withApp(async (w, d, T) => {
  section("145e. Persistence: the path is stored, not the (uncloneable) stand-in, and restore resumes silently");
  const factory = new IDBFactory();
  const dirs = { "/srv/logs": { "kept.log": makeLog(0, 4), "other.log": makeLog(60, 2) } };
  let folderId = null, firstUrl = null;

  // --- Window A: watch, open one file, persist. ---
  const first = nativeFolderBridge(dirs, 1);
  first.picked = { path: "/srv/logs", name: "logs" };
  await withApp(async (w2, d2, T2) => {
    first.installFetch(w2);
    await w2.openFolderPickerFlow();
    const folder = T2.state.folders[0];
    folderId = folder.id;
    const rec = folder.files.find(f => f.name === "kept.log");
    await w2.loadFolderFile(folder, rec);
    const node = T2.state.nodes[rec.nodeId];
    firstUrl = node.sourceUrl;
    await w2.persistFileNode(node);
    await w2.persistMetaNow();

    const folderRec = await w2.cacheStoreOp("folders", "readonly", store => store.get(folderId));
    assert(folderRec, "the folder record exists at all — a stand-in stored as-is would DataCloneError the whole write (Group 144)");
    assert(folderRec.handle === null, "the closure-holding stand-in is deliberately not persisted");
    assert(folderRec.path === "/srv/logs", "...its folder path is, which is all a rebuild needs, got " + folderRec.path);
  }, { indexedDB: factory, philogg: first });

  // --- Window B: a fresh "process" — same disk, new philogg://local ids. ---
  const second = nativeFolderBridge(dirs, 100);
  second.picked = first.picked;
  await withApp(async (w2, d2, T2) => {
    second.installFetch(w2);
    await T2.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    await sleep(100);

    assert(T2.state.folders.length === 1, "the watched folder came back from its path");
    const folder = T2.state.folders[0];
    assert(folder.id === folderId, "...keeping its id, so restored files stay linked to it");
    assert(folder.needsPermission === false,
      "...and resumes watching with no Reconnect button: a path needs no permission re-grant, unlike a real handle");
    assert(folder.files.length === 2, "...with the folder re-listed, got " + folder.files.length);

    const node = T2.state.nodes[T2.state.rootIds[0]];
    assert(node && node.name === "kept.log" && node.folderId === folderId, "the open file came back as part of that folder");
    assert(node.sourceUrl !== firstUrl,
      "its previous-process URL is not kept — that id died with the old process");
    assert(node.sourceUrl === "philogg://local/100/kept.log",
      "...it is refreshed from the rescan, got " + node.sourceUrl);
    assert(node.localPath === "/srv/logs/kept.log", "...and its path is back too, got " + node.localPath);
    assert(node.tail && typeof node.tail.handle.getFile === "function", "...tailing resumes off the fresh URL");
  }, { indexedDB: factory, philogg: second });
});

const dirsF = {
  "/logs": { "root.log": makeLog(0, 1) },
  "/logs/sub": { "nested.log": makeLog(1, 1) },
  "/logs/sub/deeper": { "deep.log": makeLog(2, 1) },
};
const bridgeF = nativeFolderBridge(dirsF);
bridgeF.picked = { path: "/logs", name: "logs" };

await withApp(async (w, d, T) => {
  section("145f. \"Include subfolders\" recurses under the native (Tauri) bridge too — nativeDirHandle.values() also yields subdirectories via listSubfolders");
  bridgeF.installFetch(w);

  await w.openFolderPickerFlow();
  const folder = T.state.folders[0];
  assert(folder.files.length === 1, "without \"include subfolders\", only the top-level file is listed, got " + folder.files.length);

  folder.settings.includeSubfolders = true;
  await w.folderScanTick();
  assert(folder.files.map(f => f.name).sort().join(",") === "deep.log,nested.log,root.log",
    "recursion descends into nested subdirectories on the native bridge too, got " + folder.files.map(f => f.name).sort().join(","));
  const nested = folder.files.find(f => f.name === "nested.log");
  assert(nested.relPath === "sub/nested.log", "a nested file's relPath carries its subfolder path, got " + nested.relPath);
  const deep = folder.files.find(f => f.name === "deep.log");
  assert(deep.relPath === "sub/deeper/deep.log", "...two levels deep too, got " + deep.relPath);

  folder.settings.includeSubfolders = false;
  await w.folderScanTick();
  assert(folder.files.map(f => f.name).join(",") === "root.log",
    "turning the setting back off drops the nested files from the listing again, got " + folder.files.map(f => f.name).join(","));
}, { philogg: bridgeF });

// Deliberately picked so relPath order and mtime order DISAGREE: the
// top-level file's name sorts last alphabetically but is the oldest by
// mtime, while the true two newest files both live in a subfolder.
const dirsG = {
  "/watch": { "zzz_old.log": makeLog(0, 1) },
  "/watch/sub": { "a_older.log": makeLog(1, 1), "b_newest.log": makeLog(2, 1) },
};
const mtimesG = {
  "/watch/zzz_old.log": 1000,
  "/watch/sub/a_older.log": 2000,
  "/watch/sub/b_newest.log": 3000,
};
const bridgeG = nativeFolderBridge(dirsG, 1, mtimesG);
bridgeG.picked = { path: "/watch", name: "watch" };

await withApp(async (w, d, T) => {
  section("145g. Auto-close \"keep N newest\" uses real mtime, not relPath order, across subfolders on the native bridge (person-reported: picked stale files from a subfolder instead of the true newest)");
  bridgeG.installFetch(w);

  await w.openFolderPickerFlow();
  const folder = T.state.folders[0];
  folder.settings.includeSubfolders = true;
  folder.settings.patterns = [{ pattern: "*", autoOpenNewest: false, autoCloseKeep: 2, showNewest: null }];
  await w.folderScanTick();

  const openNames = folder.files.filter(f => f.nodeId).map(f => f.name).sort();
  assert(openNames.join(",") === "a_older.log,b_newest.log",
    "the 2 newest BY MTIME are opened (both from the subfolder), got " + openNames.join(","));
  const stale = folder.files.find(f => f.name === "zzz_old.log");
  assert(!stale.nodeId, "the alphabetically-last-but-chronologically-oldest top-level file is NOT opened, despite relPath sorting it last");

  const nested = folder.files.find(f => f.name === "b_newest.log");
  assert(nested.mtime === 3000, "mtime is attached straight from listFolder's result — no getFile() round trip needed, got " + nested.mtime);
}, { philogg: bridgeG });
