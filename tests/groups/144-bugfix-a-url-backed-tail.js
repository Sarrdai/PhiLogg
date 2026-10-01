// GROUP 144 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 144 — Bugfix: a URL-backed tail handle broke the session cache
   Origin: this session (found while adding GROUP 141's route). A file
   opened by URL — ?url= deep-link, file association, or now the wrapper's
   own picker/drop — is tailed through urlTailHandle, a plain object
   holding a closure. persistFileNode stashed that in the record it puts
   into IndexedDB, where structured clone rejects it outright with a
   DataCloneError; cacheStoreOp swallows the synchronous throw, so the
   effect was that the ENTIRE record was silently never written and the
   file vanished from "restore last session". Nothing replaces the handle:
   the URL is all it ever was, and sourceUrl is persisted anyway, so it is
   rebuilt on restore.
   ============================================================ */
group(144);
await withApp(async (w, d, T) => {
  section("144a. A URL-tailed file is actually written to the session cache");

  w.fetch = async () => ({
    ok: true, status: 200,
    arrayBuffer: async () => new w.TextEncoder().encode(makeLog(0, 4)).buffer,
  });
  await w.philoggLoadUrl("philogg://local/2/cached.log");
  const node = T.state.nodes[T.state.rootIds[T.state.rootIds.length - 1]];
  assert(node.tail, "sanity: the file is tailed through its URL");

  await w.persistFileNode(node);
  const rec = await w.cacheStoreOp("files", "readonly", store => store.get(node.cacheKey));
  assert(rec, "the record exists at all — before this fix the DataCloneError dropped it whole");
  assert(rec.handle === null, "the non-cloneable urlTailHandle is deliberately not persisted");
  assert(rec.sourceUrl === "philogg://local/2/cached.log",
    "...because sourceUrl is what the handle is rebuilt from, got " + rec.sourceUrl);
}, {
  indexedDB: new IDBFactory(),
  philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) },
});

await withApp(async (w, d, T) => {
  section("144b. ...and comes back tailing after a reload");

  const factory = new (require("fake-indexeddb").IDBFactory)();
  await withApp(async (w2, d2, T2) => {
    w2.fetch = async () => ({
      ok: true, status: 200,
      arrayBuffer: async () => new w2.TextEncoder().encode(makeLog(0, 4)).buffer,
    });
    await w2.philoggLoadUrl("philogg://local/2/reloaded.log");
    const n = T2.state.nodes[T2.state.rootIds[T2.state.rootIds.length - 1]];
    n.localPath = "/srv/logs/reloaded.log";
    await w2.persistFileNode(n);
    await w2.persistMetaNow();
  }, { indexedDB: factory });

  await withApp(async (w2, d2, T2) => {
    await T2.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    await sleep(100);
    assert(T2.state.rootIds.length === 1, "the URL-opened file survives the reload at all, got " + T2.state.rootIds.length);
    const n = T2.state.nodes[T2.state.rootIds[0]];
    assert(n.name === "reloaded.log", "...as the same file, got " + n.name);
    assert(n.localPath === "/srv/logs/reloaded.log" && n.sourceUrl === "philogg://local/2/reloaded.log",
      "...keeping both location fields, so its context menu is unchanged after a refresh");
    assert(n.tail && typeof n.tail.handle.getFile === "function",
      "...and tailing resumes, rebuilt from sourceUrl with no permission round-trip");
  }, { indexedDB: factory });
});
