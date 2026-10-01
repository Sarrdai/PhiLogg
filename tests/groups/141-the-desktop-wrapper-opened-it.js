// GROUP 141 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 141 — The desktop "wrapper opened it, so the path is known" route
   (philogg.pickFiles + window.philoggLoadLocalFiles)
   Origin: this session. A webview never resolves a File back to an OS path,
   so the desktop wrapper was left unable to offer "Open File Location" for
   anything opened through the in-page picker or dropped onto the window.
   The fix routes around the limitation instead of trying to beat it: the
   wrapper runs the OS dialog / catches the native drop itself and hands
   philogg.html real paths plus the philogg://local/… URLs it serves them
   under. This group pins that contract from the page's side — the half a
   jsdom run can actually exercise.
   ============================================================ */
group(141);
await withApp(async (w, d, T) => {
  section("141a. openFilesPicker delegates to philogg.pickFiles when the wrapper offers one");

  let inPagePickerCalls = 0;
  w.showOpenFilePicker = () => { inPagePickerCalls++; return Promise.reject(new w.Error("should not be reached")); };
  w.fetch = async (u) => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(makeLog(0, 6)).buffer });
  w.philogg.pickFiles = () => Promise.resolve([
    { url: "philogg://local/7/picked.log", path: "/home/user/logs/picked.log", name: "picked.log" },
  ]);

  await w.openFilesPicker();
  assert(inPagePickerCalls === 0, "the page's own File System Access picker is never opened under such a wrapper");

  const node = T.state.nodes[T.state.rootIds[T.state.rootIds.length - 1]];
  assert(node && node.name === "picked.log", "the picked file lands in the tree, got " + (node && node.name));
  assert(node.localPath === "/home/user/logs/picked.log",
    "...carrying the real OS path the wrapper supplied, got " + node.localPath);
  assert(node.sourceUrl === "philogg://local/7/picked.log",
    "...and the philogg://local URL it is served under, got " + node.sourceUrl);
  assert(node.entries.length === 6, "...fully parsed, got " + node.entries.length + " entries");

  // The whole point: both location actions are now offered for a PICKED file.
  T.state.activeId = node.id;
  w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + node.id + '"]'), w);
  assert(d.querySelector('#treeContextMenu [data-action="revealLocation"]'),
    "\"Open File Location\" is offered for a wrapper-picked file");
  assert(d.querySelector('#treeContextMenu [data-action="copyPath"]'),
    "\"Copy Path\" is offered alongside it");
  w.closeTreeContextMenu();
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("141b. A wrapper-supplied file is tailed through its URL, like a file-association open");

  const initial = makeLog(0, 4);
  const appended = "\n" + makeLog(10, 2);
  w.fetch = async () => ({
    ok: true, status: 200,
    blob: async () => new w.Blob([initial]),
    arrayBuffer: async () => new w.TextEncoder().encode(initial).buffer,
  });
  await w.philoggLoadLocalFiles({ files: [{ url: "philogg://local/1/live.log", path: "/var/log/live.log", name: "live.log" }] });

  const node = T.state.nodes[T.state.rootIds[T.state.rootIds.length - 1]];
  assert(node.tail && typeof node.tail.handle.getFile === "function",
    "the URL doubles as a tail handle — the file is live, not a dead snapshot");
  assert(T.state.tailFollow === true, "...and a freshly opened live file starts in follow mode");

  // Growth on the next poll arrives through the same re-fetch.
  w.fetch = async () => ({
    ok: true, status: 200,
    arrayBuffer: async () => new w.TextEncoder().encode(initial + appended).buffer,
  });
  await w.tailTick();
  assert(node.entries.length === 6, "appended lines are picked up by the poll, got " + node.entries.length);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("141c. A multi-file batch keeps the queued placeholders and the merge prompt");

  w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new w.TextEncoder().encode(makeLog(0, 3)).buffer });
  const loading = w.philoggLoadLocalFiles({ files: [
    { url: "philogg://local/1/a.log", path: "/logs/a.log", name: "a.log" },
    { url: "philogg://local/2/b.log", path: "/logs/b.log", name: "b.log" },
  ] });

  // The lazy descriptor exists so every placeholder is in the tree BEFORE
  // the first byte is fetched — the merge dialog is proof the loop got
  // that far without awaiting any read.
  await new Promise(r => setTimeout(r, 0));
  assert(!d.querySelector("#mergeLoadDialog").classList.contains("hidden"),
    "the 2+ files merge prompt still fires for a wrapper-supplied batch");
  assert(T.state.rootIds.length === 2, "both queued placeholders are already in the tree, got " + T.state.rootIds.length);
  fireClick(d.querySelector("#mergeLoadDialogNo"), w);
  await loading;

  const nodes = T.state.rootIds.map(id => T.state.nodes[id]);
  assert(nodes.every(n => n.entries.length === 3 && !n.queued),
    "both files finish loading and no placeholder is left stuck");
  assert(nodes.map(n => n.localPath).join(",") === "/logs/a.log,/logs/b.log",
    "each node keeps its OWN path, in order, got " + nodes.map(n => n.localPath).join(","));
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });

await withApp(async (w, d, T) => {
  section("141d. A failed fetch removes its placeholder instead of leaving it stuck");

  w.fetch = async () => ({ ok: false, status: 404 });
  await w.philoggLoadLocalFiles({ files: [{ url: "philogg://local/9/gone.log", path: "/logs/gone.log", name: "gone.log" }] });
  assert(T.state.rootIds.length === 0,
    "the grayed placeholder is cleaned up when the read fails before loadOneFileIntoTree runs, left " + T.state.rootIds.length);
  assert(d.querySelector("#copyToast").textContent.includes("gone.log"),
    "...and the failure is reported by name, got " + d.querySelector("#copyToast").textContent);
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) } });
