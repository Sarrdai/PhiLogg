// GROUP 142 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 142 — "Copy Path" (the other half of a known location)
   Origin: this session. Wherever the location is known well enough to open
   it in the file manager, it is known well enough to put on the clipboard
   — person-requested as the fallback that works even when revealing
   doesn't. Two routes, mirroring "Open File Location"'s own two: a
   node.localPath is copied directly, while a philogg://local/… file is
   known to the page ONLY by that URL, so its path has to be asked back
   from the wrapper (philogg.pathForLocalUrl).
   ============================================================ */
group(142);
await withApp(async (w, d, T) => {
  section("142a. Copy Path with a known localPath copies it directly");

  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };

  const f = await w.addFile("app.log", makeLog(0, 5), () => {});
  f.localPath = "/home/user/logs/app.log";
  T.state.activeId = f.id;
  w.render();

  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  const item = d.querySelector('#treeContextMenu [data-action="copyPath"]');
  assert(item, "\"Copy Path\" offered once window.philogg + node.localPath are both present");
  fireClick(item, w);
  assert(copied === "/home/user/logs/app.log", "it copies the node's localPath, got " + copied);
  assert(d.querySelector("#copyToast").textContent.includes("Path copied"), "...and confirms with a toast");
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, pathForLocalUrl: () => Promise.resolve(null), listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("142b. Copy Path for a philogg://local/… file asks the wrapper for the path");

  let copied = null, asked = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.philogg.pathForLocalUrl = u => { asked = u; return Promise.resolve("/srv/logs/launched.log"); };

  const f = await w.addFile("launched.log", makeLog(0, 5), () => {});
  f.sourceUrl = "philogg://local/3/launched.log"; // no localPath — a file-association open
  T.state.activeId = f.id;
  w.render();

  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  fireClick(d.querySelector('#treeContextMenu [data-action="copyPath"]'), w);
  await new Promise(r => setTimeout(r, 0));
  assert(asked === "philogg://local/3/launched.log", "the URL is handed to pathForLocalUrl, got " + asked);
  assert(copied === "/srv/logs/launched.log", "the resolved path is what lands on the clipboard, got " + copied);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("142c. No Copy Path in a plain browser build, and none for a remote http(s) log");

  const f = await w.addFile("plain.log", makeLog(0, 5), () => {});
  f.localPath = "/home/user/logs/plain.log";
  T.state.activeId = f.id;
  w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  assert(!d.querySelector('#treeContextMenu [data-action="copyPath"]'),
    "no \"Copy Path\" without window.philogg, even with a localPath set — nothing could act on it");
  w.closeTreeContextMenu();
});

await withApp(async (w, d, T) => {
  section("142d. A remote http(s) log gets Copy URL, never Copy Path");

  const f = await w.addFile("remote.log", makeLog(0, 5), () => {});
  f.sourceUrl = "https://ci.example.com/artifacts/remote.log";
  T.state.activeId = f.id;
  w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + f.id + '"]'), w);
  assert(d.querySelector('#treeContextMenu [data-action="copyUrl"]'), "\"Copy URL\" is the analogue for a remote log");
  assert(!d.querySelector('#treeContextMenu [data-action="copyPath"]'),
    "no \"Copy Path\" — there is no local folder behind an http(s) URL");
  w.closeTreeContextMenu();
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });
