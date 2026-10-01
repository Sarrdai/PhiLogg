// GROUP 109 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 109 — "Open File Location" (FEATURE_BACKLOG.md #52)
   Origin: this session (person-requested, generalized beyond the backlog
   entry's one-wrapper wording): a file node's context menu offers
   "Open File Location" whenever a real OS path is actually known
   (node.localPath, supplied by the desktop wrapper — simulated here via a
   stub window.philogg, since jsdom can't run a real webview host) AND
   window.philogg exists (i.e. the desktop build) — never in a plain
   browser build, where no web API can resolve a File back to a filesystem
   path at all. A node loaded via a philogg://local/… deep link (desktop
   launch-arg/file-association) gets the same item routed through
   revealLocalUrl instead, since only the wrapper holds that path. Any ?url= node (local or plain http(s)) instead offers
   "Copy URL" for the URL itself, but ONLY for a genuine http(s) link —
   not for the desktop-local scheme, which has no meaningful "URL" to a
   person. Both items are also round-tripped through the session cache
   (persistFileNode/restoreSessionFromCache) so they survive a reload.
   ============================================================ */
group(109);
await withApp(async (w, d, T) => {
  section("109a. \"Open File Location\" / \"Copy URL\": absent outside the desktop build (no window.philogg)");

  const f = await w.addFile("plain.log", makeLog(0, 5), () => {});
  f.localPath = "/home/user/logs/plain.log"; // simulate a resolved path even though nothing can act on it
  T.state.activeId = f.id;
  w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  assert(!d.querySelector('#treeContextMenu [data-action="revealLocation"]'),
    "no \"Open File Location\" item without window.philogg, even with a localPath set");
  w.closeTreeContextMenu();
});

await withApp(async (w, d, T) => {
  section("109b. \"Open File Location\": local path resolved via window.philogg (in-app picker / drag-drop / folder watch)");

  let revealedPath = null;
  w.philogg = { getPathForFile: () => null, revealPath: p => { revealedPath = p; }, revealLocalUrl: () => {} };

  const f = await w.addFile("app.log", makeLog(0, 5), () => {});
  f.localPath = "/home/user/logs/app.log";
  T.state.activeId = f.id;
  w.render();

  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  const revealItem = d.querySelector('#treeContextMenu [data-action="revealLocation"]');
  assert(revealItem, "\"Open File Location\" offered once window.philogg + node.localPath are both present");
  assert(!d.querySelector('#treeContextMenu [data-action="copyUrl"]'), "no \"Copy URL\" — this node has no sourceUrl");
  fireClick(revealItem, w);
  assert(revealedPath === "/home/user/logs/app.log", "clicking it calls philogg.revealPath with the node's localPath, got " + revealedPath);
});

await withApp(async (w, d, T) => {
  section("109c. \"Open File Location\": desktop launch-arg file (philogg://local/… sourceUrl, no localPath)");

  let revealedLocalUrl = null;
  w.philogg = { getPathForFile: () => null, revealPath: () => { throw new Error("should not be called"); }, revealLocalUrl: u => { revealedLocalUrl = u; } };

  const f = await w.addFile("launched.log", makeLog(0, 5), () => {});
  f.sourceUrl = "philogg://local/3/launched.log"; // set directly — loadUrlIntoTree itself needs a live fetch, out of scope here
  T.state.activeId = f.id;
  w.render();

  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  const revealItem = d.querySelector('#treeContextMenu [data-action="revealLocation"]');
  assert(revealItem, "\"Open File Location\" offered for a philogg://local/… sourceUrl even with no localPath");
  assert(!d.querySelector('#treeContextMenu [data-action="copyUrl"]'), "no \"Copy URL\" for the desktop-local scheme — it's not a real URL to a person");
  fireClick(revealItem, w);
  assert(revealedLocalUrl === "philogg://local/3/launched.log", "clicking it calls philogg.revealLocalUrl with the node's sourceUrl, got " + revealedLocalUrl);
});

await withApp(async (w, d, T) => {
  section("109d. \"Copy URL\": a plain http(s) ?url= node offers copy instead of reveal");

  w.philogg = { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {} };
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };

  const f = await w.addFile("remote.log", makeLog(0, 5), () => {});
  f.sourceUrl = "https://ci.example.com/artifacts/remote.log";
  T.state.activeId = f.id;
  w.render();

  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  assert(!d.querySelector('#treeContextMenu [data-action="revealLocation"]'), "no \"Open File Location\" — an http(s) URL has no OS folder to reveal");
  const copyItem = d.querySelector('#treeContextMenu [data-action="copyUrl"]');
  assert(copyItem, "\"Copy URL\" offered for a plain http(s) sourceUrl");
  fireClick(copyItem, w);
  assert(copied === "https://ci.example.com/artifacts/remote.log", "clicking it copies the exact source URL, got " + copied);
});

await withApp(async (w, d, T) => {
  section("109e. localPath/sourceUrl survive the session cache (persist + restore)");

  const factory = new IDBFactory();
  await withApp(async (w2, d2, T2) => {
    const f = await w2.addFile("cached.log", makeLog(0, 5), () => {});
    f.localPath = "/srv/logs/cached.log";
    f.sourceUrl = "https://ci.example.com/cached.log";
    await w2.persistFileNode(f);
    await w2.persistMetaNow();
    const rec = await w2.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec.localPath === "/srv/logs/cached.log" && rec.sourceUrl === "https://ci.example.com/cached.log",
      "persistFileNode writes both fields to the cache record");
  }, { indexedDB: factory });

  await withApp(async (w2, d2, T2) => {
    await T2.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    const f = T2.state.nodes[T2.state.rootIds[0]];
    assert(f.localPath === "/srv/logs/cached.log", "restore: localPath preserved, got " + f.localPath);
    assert(f.sourceUrl === "https://ci.example.com/cached.log", "restore: sourceUrl preserved, got " + f.sourceUrl);
  }, { indexedDB: factory });
});
