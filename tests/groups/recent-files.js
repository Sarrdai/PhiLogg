// GROUP recent-files — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP recent-files — step 2 of "Recent files": the "recentFiles" IndexedDB
   store (+ in-memory mirror) and what gets recorded into it when a file, ZIP
   or folder is opened. Origin: 2026-10-11 (person-requested: Recent files in
   the Open menu / start screen; UI + reopen come in a later step).
   ============================================================ */
group("recent-files");

let W = null; // the current window; set at the top of every withApp below
const fileHandle = (name, extra) => Object.assign({
  kind: "file", name,
  async getFile() { return new W.Blob(["x"]); },
}, extra || {});
const dirHandle = (name, files) => ({
  kind: "directory", name,
  async *values() { for (const n of Object.keys(files)) yield { kind: "file", name: n, async getFile() { const b = new W.Blob([files[n]]); Object.defineProperty(b, "name", { value: n }); return b; } }; },
});
const names = w => w.getRecentFiles().map(e => e.name).join(",");

await withApp(async (w, d, T) => {
  W = w;
  section("recent-files a. recording per source: picker handle, desktop path, plain input");
  const idb = new IDBFactory();
  await withApp(async (w, d, T) => {
    W = w;
  W = w;
    await w.recentFilesReady;
    assert(w.getRecentFiles().length === 0, "starts empty");

    // Chromium picker / drop: a real FileSystemFileHandle
    const h = fileHandle("picked.log");
    await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 3)], "picked.log"), handle: h }]);
    await w.recentFilesIdle();
    let rec = w.getRecentFiles()[0];
    assert(rec && rec.kind === "file" && rec.name === "picked.log" && rec.handle === h && rec.localPath === null,
      "picker file recorded with its handle, got " + JSON.stringify(rec && { k: rec.kind, n: rec.name, l: rec.localPath }));
    assert(rec.size > 0 && rec.openedAt > 0 && typeof rec.key === "string", "size, openedAt and key are set");

    // Desktop: path + url-tail handle (never stored as a handle)
    await w.loadFileDescriptors([{ name: "desk.log", openFile: async () => new w.File([makeLog(0, 3)], "desk.log"), handle: w.urlTailHandle("philogg://local/x", "/var/log/desk.log"), localPath: "/var/log/desk.log", sourceUrl: "philogg://local/x" }]);
    await w.recentFilesIdle();
    rec = w.getRecentFiles()[0];
    assert(rec.name === "desk.log" && rec.localPath === "/var/log/desk.log" && rec.handle === null, "desktop file recorded by path, no handle");

    // Plain <input>: name + size only
    await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 4)], "plain.log"), handle: null }]);
    await w.recentFilesIdle();
    rec = w.getRecentFiles()[0];
    assert(rec.name === "plain.log" && rec.handle === null && rec.localPath === null && rec.size > 0, "plain input file recorded with name and size only");
    assert(names(w) === "plain.log,desk.log,picked.log", "newest first, got " + names(w));

    // Persisted: the store holds the same three entries
    const stored = await w.cacheStoreOp("recentFiles", "readonly", s => s.getAll());
    assert(Array.isArray(stored) && stored.length === 3, "three records in the IndexedDB store, got " + (stored && stored.length));
  }, { indexedDB: idb });

  section("recent-files b. persisted across a reload; boot restore records nothing");
  await withApp(async (w, d, T) => {
    W = w;
  W = w;
    await T.bootRestore;
    await w.refreshRecentFilesCache();
    assert(names(w) === "plain.log,desk.log,picked.log", "list comes back after a reload, got " + names(w));
    const before = w.getRecentFiles().map(e => e.key + ":" + e.openedAt).join("|");
    await w.recentFilesIdle();
    assert(w.getRecentFiles().map(e => e.key + ":" + e.openedAt).join("|") === before, "boot restore did not touch the list");
  }, { indexedDB: idb });
});

await withApp(async (w, d, T) => {
  W = w;
  section("recent-files c. skipped: folder entries, ZIP entries, merged files, deep-link URLs");
  const dir = dirHandle("logs", { "a.log": makeLog(0, 3), "b.log": makeLog(10, 3) });
  await w.addWatchedFolder(dir);
  await w.recentFilesIdle();
  assert(names(w) === "logs", "only the folder itself is recorded, got " + names(w));
  const folder = T.state.folders[0];
  const a = folder.files.find(f => f.name === "a.log");
  await w.loadFolderFile(folder, a);
  await w.recentFilesIdle();
  assert(names(w) === "logs", "a file opened out of a watched folder is not recorded, got " + names(w));

  const zipBuf = buildZipFixture([{ name: "z1.log", data: makeLog(0, 3) }]);
  const zip = await w.openZipSource(new w.File([zipBuf], "bundle.zip"), "bundle.zip");
  await w.recentFilesIdle();
  assert(names(w) === "bundle.zip,logs", "the ZIP is recorded, got " + names(w));
  await w.openZipEntry(zip, zip.entries[0]);
  await w.recentFilesIdle();
  assert(names(w) === "bundle.zip,logs", "a ZIP entry opened as a log is not recorded, got " + names(w));

  // 2 files loaded together and merged: the merged file and its sources are skipped
  const n0 = names(w);
    const p = w.loadFileDescriptors([
    { file: new w.File([makeLog(0, 3)], "m1.log"), handle: null },
    { file: new w.File([makeLog(5, 3)], "m2.log"), handle: null },
  ]);
  await waitFor(() => !d.getElementById("mergeLoadDialog").classList.contains("hidden"));
  fireClick(d.getElementById("mergeLoadDialogYes"), w);
  await p;
  await w.recentFilesIdle();
  assert(names(w) === n0, "merged sources and the merge are not recorded, got " + names(w));

  // deep link: a URL without a local path
  const before = names(w);
  await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 3)], "remote.log"), handle: null, sourceUrl: "https://example.com/remote.log" }]);
  await w.recentFilesIdle();
  assert(names(w) === before, "a deep-linked URL file is not recorded, got " + names(w));
});

await withApp(async (w, d, T) => {
  W = w;
  section("recent-files d. dedupe moves to the top (path / handle.isSameEntry / name+size)");
  const desc = (name, path) => ({ name, openFile: async () => new w.File([makeLog(0, 3)], name), handle: w.urlTailHandle("philogg://local/" + name, path), localPath: path, sourceUrl: "philogg://local/" + name });
  await w.loadFileDescriptors([desc("one.log", "/l/one.log")]);
  await w.loadFileDescriptors([desc("two.log", "/l/two.log")]);
  await w.recentFilesIdle();
  const key1 = w.getRecentFiles()[1].key;
  T.state.rootIds.slice().forEach(id => w.deleteNode(id));
  await w.loadFileDescriptors([desc("one.log", "/l/one.log")]);
  await w.recentFilesIdle();
  assert(names(w) === "one.log,two.log", "same path: moved to top, no duplicate, got " + names(w));
  assert(w.getRecentFiles()[0].key === key1, "the entry keeps its key");

  // same name in a different directory is a different entry
  T.state.rootIds.slice().forEach(id => w.deleteNode(id));
  await w.loadFileDescriptors([desc("one.log", "/other/one.log")]);
  await w.recentFilesIdle();
  assert(w.getRecentFiles().length === 3, "same name, other path: separate entry, got " + names(w));

  // handles: isSameEntry decides, names may differ
  const hA = fileHandle("h.log", { isSameEntry: async o => o.id === "same" }); hA.id = "same";
  const hB = fileHandle("h-renamed.log", { isSameEntry: async o => o.id === "same" }); hB.id = "same";
  const hC = fileHandle("h.log", { isSameEntry: async () => false }); hC.id = "other";
  await w.recordRecent({ kind: "file", name: "h.log", handle: hA, size: 5 });
  await w.recordRecent({ kind: "file", name: "h-renamed.log", handle: hB, size: 5 });
  assert(w.getRecentFiles().filter(e => e.handle === hA || e.handle === hB).length === 1, "same handle entry replaced, not duplicated");
  await w.recordRecent({ kind: "file", name: "h.log", handle: hC, size: 5 });
  assert(w.getRecentFiles().filter(e => e.name === "h.log").length === 1 && w.getRecentFiles().length === 5, "different handle with the same name is a separate entry, got " + names(w));

  // name + size fallback
  await w.recordRecent({ kind: "file", name: "p.log", size: 10 });
  await w.recordRecent({ kind: "file", name: "p.log", size: 10 });
  await w.recordRecent({ kind: "file", name: "p.log", size: 11 });
  assert(w.getRecentFiles().filter(e => e.name === "p.log").length === 2, "name+size: same size dedupes, different size does not");
  // same name but another kind is never the same entry
  await w.recordRecent({ kind: "zip", name: "p.log", size: 10 });
  assert(w.getRecentFiles().filter(e => e.name === "p.log").length === 3, "kind is part of the identity");
});

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files e. cap of 20, oldest dropped from memory and store");
  for (let i = 0; i < 23; i++) await w.recordRecent({ kind: "file", name: "f" + i + ".log", size: i });
  assert(w.getRecentFiles().length === 20, "capped at 20, got " + w.getRecentFiles().length);
  assert(w.getRecentFiles()[0].name === "f22.log" && w.getRecentFiles()[19].name === "f3.log", "keeps the newest 20");
  const stored = await w.cacheStoreOp("recentFiles", "readonly", s => s.getAll());
  assert(stored.length === 20 && !stored.some(e => e.name === "f0.log"), "the store dropped the oldest ones too, got " + stored.length);
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  W = w;
  section("recent-files f. hidden while open");
  const desc = (name, path) => ({ name, openFile: async () => new w.File([makeLog(0, 3)], name), handle: w.urlTailHandle("philogg://local/" + name, path), localPath: path, sourceUrl: "philogg://local/" + name });
  await w.loadFileDescriptors([desc("open.log", "/l/open.log")]);
  await w.recordRecent({ kind: "file", name: "closed.log", localPath: "/l/closed.log" });
  await w.recordRecent({ kind: "file", name: "plain.log", size: 3 });
  await w.recordRecent({ kind: "file", name: "open.log", localPath: "/l/open.log" });
  assert(w.getRecentFiles().length === 3, "sanity: three entries");
  const vis = () => w.visibleRecentFiles().map(e => e.name).join(",");
  assert(vis() === "plain.log,closed.log", "the open file (same path) is hidden, got " + vis());
  await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 3)], "plain.log"), handle: null }]);
  await w.recentFilesIdle();
  assert(vis() === "closed.log", "an open browser file is hidden by name, got " + vis());
  // a same-named file at another desktop path stays listed
  await w.recordRecent({ kind: "file", name: "open.log", localPath: "/other/open.log" });
  assert(vis() === "open.log,closed.log", "same name, other path stays visible, got " + vis());
  // folder + zip
  await w.addWatchedFolder(dirHandle("fold", { "a.log": makeLog(0, 2) }));
  await w.openZipSource(new w.File([buildZipFixture([{ name: "z.log", data: makeLog(0, 2) }])], "zz.zip"), "zz.zip");
  await w.recentFilesIdle();
  assert(!vis().includes("fold") && !vis().includes("zz.zip") && w.getRecentFiles().some(e => e.name === "fold") && w.getRecentFiles().some(e => e.name === "zz.zip"),
    "an open folder and an open ZIP are hidden, got " + vis());
  T.state.folders.slice().forEach(f => w.removeWatchedFolder(f.id));
  assert(vis().includes("fold"), "closing the folder lists it again");
});

await withApp(async (w, d, T) => {
  W = w;
  section("recent-files g. folder + ZIP records");
  const h = dirHandle("browser-dir", { "a.log": makeLog(0, 2) });
  await w.addWatchedFolder(h);
  await w.addWatchedFolder(w.nativeDirHandle("/srv/logs", "logs"));
  await w.recentFilesIdle();
  const [nat, br] = w.getRecentFiles();
  assert(br.kind === "folder" && br.handle === h && br.localPath === null && br.folderSettings && typeof br.folderSettings === "object", "browser folder: handle + settings, no path");
  assert(nat.kind === "folder" && nat.name === "logs" && nat.localPath === "/srv/logs" && nat.handle === null && nat.folderSettings, "desktop folder: path + settings, no handle");

  await w.openZipSource(new w.File([buildZipFixture([{ name: "z.log", data: makeLog(0, 2) }])], "in.zip"), "in.zip");
  await w.openZipSource(new w.File([buildZipFixture([{ name: "z.log", data: makeLog(0, 2) }])], "path.zip"), "path.zip", { localPath: "/data/path.zip" });
  const zh = fileHandle("dropped.zip");
  await w.openZipSource(new w.File([buildZipFixture([{ name: "z.log", data: makeLog(0, 2) }])], "dropped.zip"), "dropped.zip", { handle: Promise.resolve(zh) });
  await w.recentFilesIdle();
  const z = n => w.getRecentFiles().find(e => e.name === n);
  assert(z("in.zip").kind === "zip" && z("in.zip").size > 0 && !z("in.zip").handle && !z("in.zip").localPath, "plain-input ZIP: name + size only");
  assert(z("path.zip").localPath === "/data/path.zip", "desktop ZIP keeps its path");
  assert(z("dropped.zip").handle === zh, "dropped ZIP keeps its handle");
});

await withApp(async (w, d, T) => {
  W = w;
  section("recent-files h. a handle that cannot be stored does not lose the record");
  const bad = fileHandle("bad.log", { fn() {} }); // functions cannot be structured-cloned
  await w.recordRecent({ kind: "file", name: "bad.log", handle: bad, size: 1 });
  const stored = await w.cacheStoreOp("recentFiles", "readonly", s => s.getAll());
  assert(stored.length === 1 && stored[0].name === "bad.log" && stored[0].handle === null, "record stored without the handle, got " + JSON.stringify(stored.map(e => e.name)));
  assert(w.getRecentFiles()[0].handle === bad, "the in-memory entry keeps the handle");
}, { indexedDB: new IDBFactory() });
