// GROUP 267 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 267 — Session cache off the load path
   Origin: 2026-09-24, load/filter performance session. A file loaded from
   a File is cached as that File (a Blob — IndexedDB copies it off the JS
   thread) instead of rebuildFileText's ~100 MB string; a desktop file with
   a known path is cached as the path alone and re-read from disk on
   restore (person-decided: a file gone since is not restored); every
   remaining text record is written when idle, never before the load's
   render.
   ============================================================ */
group(267);
{
  const logText = makeLog(0, 20);
  const factory = new IDBFactory();
  let savedRaws = null;
  await withApp(async (w, d, T) => {
    section("267a. A File load caches the File itself (no rebuilt text), restore parses it back identically");
    await T.bootRestore;
    let rebuilds = 0;
    const origRebuild = w.rebuildFileText;
    w.rebuildFileText = function () { rebuilds++; return origRebuild.apply(this, arguments); };
    await w.loadFiles([new w.File([logText], "blob.log", { type: "text/plain" })]);
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f && f.entries.length === 20, "file loaded");
    assert(!!f._cacheBlob, "the node keeps the File it was loaded from as its cache source");
    const rec = await waitFor(() => w.cacheStoreOp("files", "readonly", st => st.get(f.cacheKey)));
    assert(rec && rec.blob && rec.text === null, "the cache record carries the blob and no text");
    assert(rec && rec.blob && typeof rec.blob.text === "function" && (await rec.blob.text()) === logText, "the stored blob is the original file content");
    assert(rebuilds === 0, "no rebuildFileText on the load path (" + rebuilds + ")");
    savedRaws = f.entries.map(e => e.raw);
    await w.persistMetaNow();
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    await T.bootRestore;
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f && f.name === "blob.log", "restore: the blob record came back");
    assert(f && JSON.stringify(f.entries.map(e => e.raw)) === JSON.stringify(savedRaws), "restore: entries parsed from the blob are identical");
    assert(f && !!f._cacheBlob, "restore: the restored node keeps the blob, so its next write stays cheap");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("267b. A text record (merge, meta-format, ZIP, tail) is written when idle, not synchronously");
    await T.bootRestore;
    const f = await w.addFile("text.log", logText, () => {});
    let rebuilds = 0;
    const origRebuild = w.rebuildFileText;
    w.rebuildFileText = function () { rebuilds++; return origRebuild.apply(this, arguments); };
    const p = w.persistFileNode(f);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert(rebuilds === 0, "the text is not built within the current task (" + rebuilds + ")");
    await p;
    assert(rebuilds === 1, "awaiting persistFileNode still means written (" + rebuilds + ")");
    const rec = await w.cacheStoreOp("files", "readonly", st => st.get(f.cacheKey));
    assert(rec && rec.text === logText.trimEnd() && !rec.blob, "the deferred write stored the rebuilt text");
    // Two requests before idle coalesce into one write.
    const p1 = w.persistFileNode(f), p2 = w.persistFileNode(f);
    await Promise.all([p1, p2]);
    assert(rebuilds === 2, "one write for both (" + rebuilds + ")");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("267c. A tail append or rotation drops the File as cache source — the next write is text again");
    await T.bootRestore;
    await w.loadFiles([new w.File([logText], "tail.log", { type: "text/plain" })]);
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f && !!f._cacheBlob, "loaded from a File: blob source");
    f.tail = { handle: w.urlTailHandle("philogg://local/1/tail.log"), offset: logText.length, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
    w.appendTailText(f, makeLog(100, 1));
    w.onTailChange([f.id]);
    assert(!f._cacheBlob, "grown: the File no longer matches the entries");
    await w.persistFileNode(f);
    const rec = await w.cacheStoreOp("files", "readonly", st => st.get(f.cacheKey));
    assert(rec && !rec.blob && typeof rec.text === "string" && rec.text.split("\n").length === 21, "the record is the rebuilt text incl. the appended entry");
  }, { indexedDB: new IDBFactory() });

  // Desktop: a stub bridge whose openLocalPath knows which paths still exist.
  const onDisk = { "/logs/app.log": logText, "/logs/gone.log": makeLog(0, 3) };
  let nextId = 1;
  const bridge = () => ({
    openLocalPath: async p => {
      if (!(p in onDisk)) throw new Error('"' + p + '" no longer exists');
      const name = p.split("/").pop();
      return { url: "philogg://local/" + (nextId++) + "/" + name, path: p, name };
    },
  });
  const deskFactory = new IDBFactory();
  await withApp(async (w, d, T) => {
    section("267d. Desktop (person's choice: path only): a file with a known path is cached as its path and re-read from disk on restore");
    await T.bootRestore;
    let rebuilds = 0;
    const origRebuild = w.rebuildFileText;
    w.rebuildFileText = function () { rebuilds++; return origRebuild.apply(this, arguments); };
    const a = await w.addFile("app.log", onDisk["/logs/app.log"], () => {});
    a.localPath = "/logs/app.log"; a.sourceUrl = "philogg://local/99/app.log";
    const g = await w.addFile("gone.log", onDisk["/logs/gone.log"], () => {});
    g.localPath = "/logs/gone.log";
    await w.persistFileNode(a);
    await w.persistFileNode(g);
    await w.persistMetaNow();
    const rec = await w.cacheStoreOp("files", "readonly", st => st.get(a.cacheKey));
    assert(rec && rec.text === null && rec.blob === null && rec.localPath === "/logs/app.log", "the record holds the path, no content");
    assert(rebuilds === 0, "no text built for it (" + rebuilds + ")");
  }, { indexedDB: deskFactory, philogg: bridge() });

  // Meanwhile on disk: app.log grew by 2 entries, gone.log was deleted.
  onDisk["/logs/app.log"] = logText + makeLog(100, 2);
  delete onDisk["/logs/gone.log"];
  await withApp(async (w, d, T) => {
    const fetched = [];
    w.fetch = async u => {
      fetched.push(u);
      const text = onDisk["/logs/" + String(u).split("/").pop()];
      return { ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(text).buffer };
    };
    await T.bootRestore;
    const roots = T.state.rootIds.map(id => T.state.nodes[id]);
    assert(roots.length === 1 && roots[0].name === "app.log", "restore: the file that still exists came back, the deleted one is dropped (" + roots.map(n => n.name) + ")");
    const f = roots[0];
    assert(f && f.entries.length === 22, "restore: re-read from disk — the 2 entries written since are there (" + (f && f.entries.length) + ")");
    assert(f && /^philogg:\/\/local\/\d+\/app\.log$/.test(f.sourceUrl) && f.sourceUrl !== "philogg://local/99/app.log", "restore: this run's own URL replaces the stored one");
    assert(f && f.localPath === "/logs/app.log", "restore: localPath kept");
    assert(f && f.tail && f.tail.offset === new w.TextEncoder().encode(onDisk["/logs/app.log"]).length && w.isUrlTailHandle(f.tail.handle),
      "restore: tailing resumes from the bytes just read");
    assert(!d.querySelector(".tree-row.queued"), "restore: no queued placeholder left behind");
  }, { indexedDB: deskFactory, philogg: bridge() });
}
