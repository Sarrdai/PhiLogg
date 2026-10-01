// GROUP 43 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 43 — Bugfix: tail handles now persist across a reload
   Origin: person-reported (this session): a log file that was still
   actively being written showed no live dot and never updated in Edge.
   Root cause: FEATURE_BACKLOG.md's known gap "Persist tail handles across
   reload" — a file the session cache auto-restored on relaunch (which the
   person experienced simply as "opening" the file, not as a reload) never
   got a node.tail at all, so it was permanently a static snapshot; only
   manually re-opening the file (which the person did, seeing more entries)
   re-established tailing. Fixed by persisting the file's
   FileSystemFileHandle alongside its text (persistFileNode) and a new
   tryReattachFileTail() helper, called from restoreSessionFromCache, that
   silently resumes tailing via queryPermission (no user gesture needed) —
   the same graceful-degradation shape restoreWatchedFolders already uses
   for directory handles.
   ============================================================ */
group(43);
section("43. Bugfix: tail handles persist across a reload");
{
  // A REAL FileSystemFileHandle survives IndexedDB's structured clone with
  // its methods intact — the same fact persistFolder/restoreWatchedFolders
  // already rely on for directory handles (see Group 38's own comment).
  // fake-indexeddb enforces structured clone strictly: a class instance's
  // OWN data fields (e.g. `kind`) clone through fine, but its PROTOTYPE
  // methods are simply dropped — so a round-tripped handle here ends up
  // exactly like a real handle whose permission needs reconfirming, not
  // like one that kept working. That's used deliberately below to prove
  // the degrade-gracefully path; the successful-reattach path is then
  // checked directly with a fresh (non-round-tripped) instance, same as
  // Group 38c does for reconnectFolder.
  class FakeFileHandle {
    constructor() { this.kind = "file"; }
    async queryPermission() { return "granted"; }
  }

  // --- Persisting a file with no tail writes handle:null, not a missing field ---
  await withApp(async (w, d, T) => {
    const g = await w.addFile("plain.log", makeLog(0, 2), () => {});
    await w.persistFileNode(g);
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(g.cacheKey));
    assert(rec && rec.handle === null, "persist: a file with no tail writes handle:null");
  }, { indexedDB: new IDBFactory() });

  const factory = new IDBFactory();

  // --- Window A: load a "live" (tailed) file, persist it. ---
  await withApp(async (w, d, T) => {
    const handle = new FakeFileHandle();
    const f = await w.addFile("live.log", makeLog(0, 3), () => {});
    f.tail = { handle, offset: w.rebuildFileText(f).length, pending: "", failed: false, busy: false };
    w.render();
    assert(d.querySelector(".tree-icon-live") !== null, "sanity: the live dot renders for a freshly-tailed file");

    await w.persistFileNode(f);
    await w.persistMetaNow();
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec && rec.handle && rec.handle.kind === "file", "persist: the tail handle's own data field is written to the files store");
  }, { indexedDB: factory });

  // --- Window B: boot-time restore (same factory = same "disk"). The
  // round-tripped handle lost its methods, so queryPermission() genuinely
  // fails — the same degraded state a real browser puts a restored file in
  // whenever it doesn't silently re-grant the permission (e.g. after an
  // actual browser restart, not just a tab reload). ---
  await withApp(async (w, d, T) => {
    await T.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    assert(T.state.rootIds.length === 1, "restore: the file came back via the normal session restore");
    const node = T.state.nodes[T.state.rootIds[0]];
    assert(!node.tail, "restore: a handle that can't survive structured clone leaves the file a static snapshot instead of throwing");
    w.render();
    assert(d.querySelector(".tree-icon-live") === null, "restore: no live dot renders while the tail couldn't be silently reattached");

    // Function-level check of the successful path (the part a real
    // IndexedDB round trip can't exercise in jsdom — see the class comment
    // above): a fresh, fully-working fixture handle stands in for "the
    // browser re-granted permission silently."
    const workingHandle = new FakeFileHandle();
    const ok = await w.tryReattachFileTail(node, workingHandle);
    assert(ok === true, "tryReattachFileTail resumes tailing when permission is (still) granted");
    assert(node.tail && node.tail.handle === workingHandle, "reattached tail carries the working handle");
    assert(node.tail.offset === w.rebuildFileText(node).length,
      "reattached tail's offset matches the restored file's current byte length, so the next poll only reads genuinely NEW bytes");
    w.render();
    assert(d.querySelector(".tree-icon-live") !== null, "the live dot renders once tailing is reattached");

    // Tailing genuinely resumes polling from here, not just a flag flip.
    const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"new entry"\n`;
    const grownText = w.rebuildFileText(node) + "\n" + appended;
    workingHandle.getFile = async () => {
      const blob = new w.Blob([grownText]);
      blob.slice = start => {
        const sliced = grownText.slice(start);
        const b = new w.Blob([sliced]);
        b.text = async () => sliced;
        return b;
      };
      Object.defineProperty(blob, "size", { get: () => grownText.length, configurable: true });
      return blob;
    };
    await w.tailTick();
    assert(node.entries.length === 4, "a reattached tail genuinely resumes polling for new content, got " + node.entries.length);

    // Permission NOT silently granted (e.g. after a real browser restart).
    class DeniedHandle { async queryPermission() { return "prompt"; } }
    const node2 = await w.addFile("other.log", makeLog(0, 2), () => {});
    const ok2 = await w.tryReattachFileTail(node2, new DeniedHandle());
    assert(ok2 === false && !node2.tail, "tryReattachFileTail leaves the file untailed when permission isn't silently granted");
  }, { indexedDB: factory });
}
