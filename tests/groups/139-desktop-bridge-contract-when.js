// GROUP 139 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 139 — Desktop bridge contract when getPathForFile can't resolve
   anything (the wrapper in desktop/)
   Origin: the session adding the Tauri desktop wrapper. No system webview
   resolves a File object back to its real OS path, so that
   wrapper's window.philogg.getPathForFile always returns null. GROUP 109
   already covers the *menu* gating with a stub that returns null, but
   never exercises the load path that calls it — this group does, so a
   future change to loadOneFileIntoTree can't start assuming a truthy
   return.
   Updated by the session that closed the gap (GROUP 141+): that wrapper
   now opens picked and dropped files ITSELF and supplies their paths, so
   the "no path at all" case below is no longer what its picker/drop does.
   Re-pointed once more by GROUP 145: its folder watch supplies paths too
   now, so no route under that wrapper reaches this case at all — what is
   pinned here is the contract itself, which any File arriving without a
   supplied path must keep honouring. The other bridge functions
   stay fully functional there, so a file-association open
   (philogg://local/… sourceUrl) must still offer "Open File Location"
   via revealLocalUrl.
   ============================================================ */
group(139);
await withApp(async (w, d, T) => {
  section("139a. getPathForFile returning null: files still load, no localPath, no reveal item");

  const file = new w.File([makeLog(0, 5)], "folder-watched.log", { type: "text/plain" });
  await w.loadFileDescriptors([{ file, handle: null }]);
  const node = T.state.nodes[T.state.rootIds[T.state.rootIds.length - 1]];
  assert(node && node.name === "folder-watched.log", "the file loads normally under a wrapper that can't resolve paths");
  assert(node.localPath === undefined, "no localPath is invented from a null result, got " + node.localPath);

  T.state.activeId = node.id;
  w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + node.id + '"]'), w);
  assert(!d.querySelector('#treeContextMenu [data-action="revealLocation"]'),
    "no \"Open File Location\" for a file that arrived with no path and none resolvable");
  assert(!d.querySelector('#treeContextMenu [data-action="copyPath"]'),
    "...and no \"Copy Path\" either — same gate");
  w.closeTreeContextMenu();
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("139b. ...while a file-association open still reveals, through revealLocalUrl");

  let revealed = null;
  w.philogg.revealLocalUrl = u => { revealed = u; };

  const f = await w.addFile("launched.log", makeLog(0, 5), () => {});
  f.sourceUrl = "philogg://local/1/launched.log";
  T.state.activeId = f.id;
  w.render();

  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  const revealItem = d.querySelector('#treeContextMenu [data-action="revealLocation"]');
  assert(revealItem, "\"Open File Location\" still offered for a philogg://local/… sourceUrl");
  fireClick(revealItem, w);
  assert(revealed === "philogg://local/1/launched.log",
    "it routes through revealLocalUrl, which the desktop wrapper implements, got " + revealed);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });
