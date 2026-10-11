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

/* ---------- Step 3: UI, reopen, shortcut, filter badge ---------- */
const recentRows = (root) => [...root.querySelectorAll(".recent-row")];
const rowNames = (root) => recentRows(root).map(r => r.querySelector(".rr-name").textContent).join(",");
const DESKTOP = (extra) => Object.assign({
  getPathForFile: () => null, revealPath() {}, revealLocalUrl() {}, listSystemFonts: () => Promise.resolve([]),
  pathExists: () => Promise.resolve(true), openPath() {}, openLocalPath: p => Promise.resolve({ url: "philogg://local/" + encodeURIComponent(p), path: p }),
}, extra || {});

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files i. relative time labels");
  const now = new Date(2026, 9, 11, 15, 0, 0).getTime();
  const L = ms => w.relativeTimeLabel(now - ms, now);
  assert(L(10000) === "just now", "under a minute: just now, got " + L(10000));
  assert(L(5 * 60000) === "5 min ago", "minutes, got " + L(5 * 60000));
  assert(L(3 * 3600000) === "3 h ago", "hours, got " + L(3 * 3600000));
  assert(L(20 * 3600000) === "20 h ago", "under 24 h stays in hours, even across midnight, got " + L(20 * 3600000));
  assert(w.relativeTimeLabel(new Date(2026, 9, 10, 9, 0).getTime(), new Date(2026, 9, 11, 15, 0).getTime() + 0) === "yesterday", "yesterday");
  assert(L(5 * 86400000) === "Oct 6", "older, same year: 'Oct 6', got " + L(5 * 86400000));
  assert(w.relativeTimeLabel(new Date(2025, 2, 3).getTime(), now) === "Mar 3, 2025", "other year includes the year");

  section("recent-files j. Open menu section: rows, cap, remove, clear, empty state, Reopen last closed");
  const menu = d.querySelector("#openMenu");
  fireClick(d.querySelector("#btnOpen"), w);
  assert(!menu.classList.contains("hidden"), "Open menu opens");
  assert(menu.querySelector(".recent-note").textContent === "Files you open appear here." && !menu.querySelector('[data-recent-action="last"]') && !menu.querySelector(".recent-clear"),
    "empty list: note, no Clear, no 'Reopen last closed'");
  fireClick(d.querySelector("#btnOpen"), w);
  for (let i = 0; i < 10; i++) await w.recordRecent({ kind: i % 3 === 2 ? "zip" : "file", name: "f" + i + ".log", size: 2048 * (i + 1) });
  fireClick(d.querySelector("#btnOpen"), w);
  assert(recentRows(menu).length === 8, "at most 8 rows, got " + recentRows(menu).length);
  assert(rowNames(menu).startsWith("f9.log,f8.log"), "newest first, got " + rowNames(menu));
  assert(menu.querySelector(".recent-clear").title === "Remove every entry from this list", "Clear link with tooltip");
  const last = menu.querySelector('[data-recent-action="last"]');
  assert(last && /Reopen last closed/.test(last.textContent) && last.querySelector(".ctx-kbd").textContent === w.shortcutLabel("reopenClosed"), "'Reopen last closed' shows the current binding");
  const r0 = recentRows(menu)[0];
  assert(r0.querySelector(".rr-sub").textContent === "20 KB" && r0.querySelector(".rr-when").textContent === "just now", "sub line shows the size (browser), time label shown");
  assert(r0.title === "Reopen f9.log", "row tooltip");
  assert(r0.querySelector(".rr-x").title === "Remove from list", "x tooltip");
  fireClick(r0.querySelector(".rr-x"), w);
  await w.recentFilesIdle();
  assert(!menu.classList.contains("hidden"), "removing keeps the menu open");
  assert(w.getRecentFiles().length === 9 && !rowNames(menu).includes("f9.log") && recentRows(menu).length === 8, "entry removed from list and store, next one slides in");
  assert((await w.cacheStoreOp("recentFiles", "readonly", s => s.getAll())).length === 9, "the store dropped it too");
  fireClick(menu.querySelector(".recent-clear"), w);
  await w.recentFilesIdle();
  assert(w.getRecentFiles().length === 0 && menu.querySelector(".recent-note"), "Clear empties the list and shows the note");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files k. start screen list (<= 5 rows, Clear) and phone-independent behaviour");
  const start = d.querySelector("#startRecent");
  assert(start.children.length === 0 && d.querySelector("#emptyState").classList.contains("start"), "empty list: nothing extra on the start screen");
  for (let i = 0; i < 7; i++) await w.recordRecent({ kind: "file", name: "s" + i + ".log", size: 100 });
  assert(recentRows(start).length === 5 && rowNames(start).startsWith("s6.log,s5.log"), "five newest rows on the start screen, got " + rowNames(start));
  fireClick(start.querySelector(".recent-clear"), w);
  await w.recentFilesIdle();
  assert(start.children.length === 0, "Clear empties the start list");
  // opening a file hides the start screen; closing brings back the hidden-while-open entries
  await w.recordRecent({ kind: "file", name: "open.log", size: 5 });
  assert(rowNames(start) === "open.log", "entry listed");
  await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 3)], "open.log"), handle: null }]);
  T.state.rootIds.slice().forEach(id => w.deleteNode(id));
  w.render();
  assert(rowNames(start).includes("open.log"), "after closing the file the entry is listed again, got '" + rowNames(start) + "'");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files l. badges: Pick again, Not found, filter count");
  await w.recordRecent({ kind: "file", name: "plain.log", size: 10 });                       // no handle, no path
  await w.recordRecent({ kind: "file", name: "handled.log", handle: fileHandle("handled.log"), size: 10 });
  await w.recordRecent({ kind: "file", name: "desk.log", localPath: "/var/log/desk.log" });  // browser build: path not reopenable
  fireClick(d.querySelector("#btnOpen"), w);
  const menu = d.querySelector("#openMenu");
  const row = n => recentRows(menu).find(r => r.querySelector(".rr-name").textContent === n);
  const badges = n => [...row(n).querySelectorAll(".rr-badge")].map(b => b.textContent);
  assert(badges("plain.log").join() === "Pick again" && row("plain.log").querySelector(".rr-badge.warn").title.startsWith("This browser can't reopen"), "no handle: 'Pick again' with tooltip");
  assert(badges("handled.log").length === 0, "a stored handle: no badge");
  assert(badges("desk.log").join() === "Pick again", "path but no desktop wrapper: 'Pick again'");
  assert(row("desk.log").querySelector(".rr-sub").textContent === "/var/log", "sub line is the parent directory when a path exists");
  assert(row("desk.log").title === "Reopen desk.log · /var/log/desk.log", "tooltip carries the path");
  w.getRecentFiles().find(e => e.name === "handled.log").missing = true;
  fireClick(d.querySelector("#btnOpen"), w); fireClick(d.querySelector("#btnOpen"), w);
  assert(badges("handled.log").join() === "Not found" && row("handled.log").classList.contains("missing"), "missing entry: 'Not found', struck through");
  fireClick(d.querySelector("#btnOpen"), w);
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files m. the filter history write stamps fullHash on the recent entry; the badge shows after closing");
  const f = (await (async () => { await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 20)], "hist.log"), handle: null }]); return T.state.nodes[T.state.rootIds[0]]; })());
  await w.recentFilesIdle();
  assert(w.getRecentFiles()[0].fullHash === null, "sanity: no hash right after opening (no history record yet)");
  w.createFilterNode(f.id, "text", "message 1");
  w.createFilterNode(f.id, "text", "message 2");
  w.render();
  await w.persistFileHistoryNow();
  await w.recentFilesIdle();
  const hash = w.getRecentFiles()[0].fullHash;
  assert(typeof hash === "string" && hash.length > 0 && hash === f._historyKey, "history write stamped the recent entry's fullHash");
  const stored = (await w.cacheStoreOp("recentFiles", "readonly", s => s.getAll()))[0];
  assert(stored.fullHash === hash, "...and persisted it");
  T.state.rootIds.slice().forEach(id => w.deleteNode(id));
  w.render();
  await w.refreshRecentFilterCounts();
  const start = d.querySelector("#startRecent");
  const badge = [...start.querySelectorAll(".rr-badge")].find(b => !b.classList.contains("warn") && !b.classList.contains("gone"));
  assert(badge && badge.textContent === "2" && badge.title === "2 remembered filters", "start screen shows the filter badge with the count, got " + (badge && badge.textContent));
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files n. reopen: desktop path, missing, handle, permission, picker");
  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(makeLog(0, 4)).buffer });
  const dt = () => d.querySelector("#copyToast").textContent;

  await w.recordRecent({ kind: "file", name: "desk.log", localPath: "/var/log/desk.log" });
  fireClick(d.querySelector("#btnOpen"), w);
  fireClick(recentRows(d.querySelector("#openMenu"))[0], w);
  assert(d.querySelector("#openMenu").classList.contains("hidden"), "the menu closes before reopening");
  await waitFor(() => T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].entries.length > 0);
  assert(T.state.nodes[T.state.rootIds[0]].localPath === "/var/log/desk.log", "desktop file reopened by path");
  await w.recentFilesIdle();
  assert(w.getRecentFiles()[0].name === "desk.log" && w.visibleRecentFiles().length === 0, "recording moved it to the top; it is hidden while open");
  T.state.rootIds.slice().forEach(id => w.deleteNode(id));

  // vanished file: openLocalPath rejects
  w.philogg.openLocalPath = () => Promise.reject(new Error("gone"));
  await w.recordRecent({ kind: "file", name: "gone.log", localPath: "/var/log/gone.log" });
  w.getRecentFiles(); fireClick(d.querySelector("#btnOpen"), w);
  fireClick(recentRows(d.querySelector("#openMenu"))[0], w);
  await waitFor(() => w.getRecentFiles()[0].missing === true);
  assert(dt() === "“gone.log” is no longer at /var/log.Remove" || /gone\.log.*no longer at \/var\/log/.test(dt()), "toast names the file and directory, got " + dt());
  assert(T.state.rootIds.length === 0, "nothing was opened");
  fireClick(d.querySelector("#copyToast .toast-action"), w);
  await w.recentFilesIdle();
  assert(!w.getRecentFiles().some(e => e.name === "gone.log"), "the toast's Remove action drops the entry");

  // folder by path, with the stored settings
  w.philogg.openLocalPath = p => Promise.resolve({ url: "philogg://local/" + p, path: p });
  const calls = [];
  const realAdd = w.addWatchedFolder;
  w.addWatchedFolder = async (h, settings) => { calls.push({ path: h[w.NATIVE_DIR_HANDLE || "__philoggNativeDir"], settings }); };
  await w.recordRecent({ kind: "folder", name: "logs", localPath: "/srv/logs", folderSettings: { includeSubfolders: true, patterns: [] } });
  await w.reopenRecent(w.getRecentFiles()[0]);
  assert(calls.length === 1 && calls[0].path === "/srv/logs" && calls[0].settings.includeSubfolders === true, "desktop folder reopened by path with its stored settings");
  w.addWatchedFolder = realAdd;
}, { indexedDB: new IDBFactory(), philogg: DESKTOP() });

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files o. reopen: browser handle (permission), NotFound, no handle -> picker");
  const asked = [];
  const mk = (name, perm, getFile) => fileHandle(name, { requestPermission: async o => { asked.push(o.mode); return perm; }, getFile });
  const good = mk("good.log", "granted", async () => new w.File([makeLog(0, 4)], "good.log"));
  await w.recordRecent({ kind: "file", name: "good.log", handle: good, size: 5 });
  await w.reopenRecent(w.getRecentFiles()[0]);
  await waitFor(() => T.state.rootIds.length === 1);
  assert(asked.join() === "read" && T.state.nodes[T.state.rootIds[0]].name === "good.log", "handle: read permission requested, file loaded");
  assert(T.state.nodes[T.state.rootIds[0]].tail && T.state.nodes[T.state.rootIds[0]].tail.handle === good, "the handle is wired for tailing like a picked file");
  T.state.rootIds.slice().forEach(id => w.deleteNode(id));

  const denied = mk("denied.log", "denied", async () => { throw new Error("must not be read"); });
  await w.recordRecent({ kind: "file", name: "denied.log", handle: denied, size: 5 });
  await w.reopenRecent(w.getRecentFiles()[0]);
  assert(d.querySelector("#copyToast").textContent === "Permission denied — can't reopen “denied.log”." && T.state.rootIds.length === 0, "denied permission: toast, nothing opened");

  const nf = mk("nf.log", "granted", async () => { const e = new Error("x"); e.name = "NotFoundError"; throw e; });
  await w.recordRecent({ kind: "file", name: "nf.log", handle: nf, size: 5 });
  await w.reopenRecent(w.getRecentFiles()[0]);
  assert(w.getRecentFiles()[0].missing === true && /nf\.log.*no longer/.test(d.querySelector("#copyToast").textContent), "NotFoundError marks the entry missing and toasts");

  // zip via handle
  const zh = mk("h.zip", "granted", async () => new w.File([buildZipFixture([{ name: "z.log", data: makeLog(0, 2) }])], "h.zip"));
  await w.recordRecent({ kind: "zip", name: "h.zip", handle: zh, size: 5 });
  await w.reopenRecent(w.getRecentFiles()[0]);
  assert(T.state.zips.some(z => z.name === "h.zip"), "a ZIP handle reopens as a ZIP source");
  // folder via handle
  const fh = Object.assign(dirHandle("fh", { "a.log": makeLog(0, 2) }), { requestPermission: async () => "granted" });
  await w.recordRecent({ kind: "folder", name: "fh", handle: fh, folderSettings: { includeSubfolders: true } });
  await w.reopenRecent(w.getRecentFiles()[0]);
  assert(T.state.folders.some(f => f.name === "fh" && f.settings.includeSubfolders === true), "a folder handle reopens as a watched folder with its stored settings");

  // nothing usable: the matching picker opens
  const picked = [];
  w.openFilesPicker = () => picked.push("file"); w.openZipPickerFlow = () => picked.push("zip"); w.openFolderPickerFlow = () => picked.push("folder");
  await w.recordRecent({ kind: "file", name: "np.log", size: 1 });
  await w.recordRecent({ kind: "zip", name: "np.zip", size: 1 });
  await w.recordRecent({ kind: "folder", name: "np" });
  for (const e of w.getRecentFiles().slice(0, 3).reverse()) await w.reopenRecent(e);
  assert(picked.join() === "file,zip,folder", "no handle/path: the matching picker opens, got " + picked.join());
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  W = w;
  await w.recentFilesIdle();
  section("recent-files p. shortcut Reopen the most recently closed file");
  assert(w.shortcutLabel("reopenClosed") === "Alt+Shift+T", "browser build binding is Alt+Shift+T (the browser owns Ctrl+Shift+T), got " + w.shortcutLabel("reopenClosed"));
  const key = () => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "T", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  const calls = [];
  w.openFilesPicker = () => calls.push("picker");
  key();
  assert(calls.length === 0, "empty list: no-op");
  await w.recordRecent({ kind: "file", name: "older.log", size: 1 });
  await w.recordRecent({ kind: "file", name: "newer.log", size: 1 });
  await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 3)], "newer.log"), handle: null }]); // newer.log is open now
  await w.recentFilesIdle();
  key();
  assert(calls.length === 1, "reopens the newest entry that is not open (older.log -> picker, as it has no handle)");
}, { indexedDB: new IDBFactory() });
