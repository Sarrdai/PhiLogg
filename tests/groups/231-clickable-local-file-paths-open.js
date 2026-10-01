// GROUP 231 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 231 — Clickable local file paths: "Open here" (this session,
   person-requested). A third action alongside GROUP 201's "Open
   file"/"Open containing folder", offered only for a path whose extension
   PhiLogg itself can load (isCompatibleFolderFile — the same "supported
   log format" check folder watch and ZIP entries already use). Clicking it
   (openFpPathHere) registers the path through the new
   window.philogg.openLocalPath bridge method
   (desktop/src-tauri/src/commands.rs::open_local_path) and feeds the
   result straight into loadDesktopLocalFiles — the exact route
   drag-drop/pickFiles/folder-watch already use to get a wrapper-known path
   into the tree, just entered from a log line instead of a filesystem
   listing.
   ============================================================ */
group(231);
await withApp(async (w, d, T) => {
  section("231a. \"Open here\" is offered first, but only for a path PhiLogg itself can load (isCompatibleFolderFile)");

  // Both candidates need to be in the SAME active view at once — a second
  // file's rows never render while it isn't the active one.
  const twoPaths =
    '2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"wrote to /var/log/app.log ok"\n' +
    '2024-01-15 10:00:01,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"wrote to /var/log/app.txt ok"\n';
  await w.addFile("a.log", twoPaths, () => {});
  T.state.activeId = T.state.rootIds[0];
  w.render();
  await new Promise(r => setTimeout(r, 0));

  const logSpan = d.querySelector('.fp-candidate[data-fp="/var/log/app.log"]');
  const txtSpan = d.querySelector('.fp-candidate[data-fp="/var/log/app.txt"]');
  assert(logSpan && logSpan.classList.contains("fp-verified"), "sanity: the .log path verified");
  assert(txtSpan && txtSpan.classList.contains("fp-verified"), "sanity: the .txt path verified too — gating is on extension, not existence");

  logSpan.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  let items = [...d.querySelector("#fpPathMenu").querySelectorAll("[data-fp-action]")].map(i => i.dataset.fpAction);
  assert(items[0] === "open-here", "\"Open here\" is offered, and listed first, for a .log path, got " + JSON.stringify(items));

  txtSpan.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  items = [...d.querySelector("#fpPathMenu").querySelectorAll("[data-fp-action]")].map(i => i.dataset.fpAction);
  assert(!items.includes("open-here"), "...but NOT for a .txt path — isCompatibleFolderFile only recognizes .log today, got " + JSON.stringify(items));
  assert(items.includes("open") && items.includes("reveal"), "the other two actions are still offered regardless, got " + JSON.stringify(items));
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]), pathExists: () => Promise.resolve(true), openPath: () => {} } });

await withApp(async (w, d, T) => {
  section("231b. clicking \"Open here\" registers the path via philogg.openLocalPath and loads it straight into the tree");

  w.philogg.openLocalPath = path => Promise.resolve({ url: "philogg://local/7/" + path.split("/").pop(), path, name: path.split("/").pop() });
  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(makeLog(0, 4)).buffer });

  await w.addFile("a.log", makeLog(0, 1, { msgPrefix: "wrote to /var/log/other.log ok" }), () => {});
  T.state.activeId = T.state.rootIds[0];
  w.render();
  await new Promise(r => setTimeout(r, 0));

  const span = d.querySelector('.fp-candidate[data-fp="/var/log/other.log"]');
  span.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true }));
  const item = d.querySelector('#fpPathMenu [data-fp-action="open-here"]');
  assert(item, "sanity: the item is there to click");
  fireClick(item, w);

  await waitFor(() => T.state.rootIds.length === 2 && T.state.nodes[T.state.rootIds[1]].entries.length > 0);
  const opened = T.state.nodes[T.state.rootIds[1]];
  assert(opened.localPath === "/var/log/other.log" && opened.name === "other.log",
    "the file is loaded straight into the tree under its own path/name, got " + JSON.stringify({ localPath: opened.localPath, name: opened.name }));
  assert(opened.entries.length === 4, "...fully parsed like any other wrapper-supplied load, got " + opened.entries.length);
  assert(d.querySelector("#fpPathMenu").classList.contains("hidden"), "the popup closes right after the click, same as the other two actions");
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]), pathExists: () => Promise.resolve(true), openPath: () => {}, openLocalPath: () => Promise.resolve(null) } });

await withApp(async (w, d, T) => {
  section("231c. a rejected philogg.openLocalPath() (the file vanished since path_exists last checked) shows a toast instead of throwing or loading anything");

  w.philogg.openLocalPath = () => Promise.reject(new Error("\"/var/log/gone.log\" no longer exists"));

  await w.addFile("a.log", makeLog(0, 1, { msgPrefix: "wrote to /var/log/gone.log ok" }), () => {});
  T.state.activeId = T.state.rootIds[0];
  w.render();
  await new Promise(r => setTimeout(r, 0));

  await w.openFpPathHere("/var/log/gone.log");
  assert(d.querySelector("#copyToast").textContent.includes("/var/log/gone.log"),
    "the failure is reported by path instead of silently doing nothing, got " + d.querySelector("#copyToast").textContent);
  assert(T.state.rootIds.length === 1, "...and nothing new was added to the tree");
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]), pathExists: () => Promise.resolve(true), openPath: () => {}, openLocalPath: () => Promise.reject(new Error("gone")) } });
