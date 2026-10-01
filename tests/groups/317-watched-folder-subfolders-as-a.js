// GROUP 317 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 317 — Watched-folder subfolders as a tree (person-requested):
   with "Include subfolders" on, each subfolder renders as a collapsible
   folder row (chevron, folder icon, connector lines) instead of the retired
   "Show relative path" labels. Collapsed by default; a folder watch rule
   auto-opening a file expands the path to it. Expansion is per container
   (folder.expandedDirs); tree navigation skips collapsed content. ZIP
   archives get the same tree — see 201e.
   ============================================================ */
group(317);
await withApp(async (w, d, T) => {
  section("317a. subfolder rows: collapsed by default, expand/collapse by click, nested rows with lines, opened file inside");
  function fakeDir(name, entries) {
    return {
      kind: "directory", name,
      async *values() {
        for (const [key, val] of Object.entries(entries)) {
          if (typeof val === "string") yield { kind: "file", name: key, async getFile() { const b = new w.Blob([val]); b.text = async () => val; return b; } };
          else yield fakeDir(key, val);
        }
      },
    };
  }
  const files = { "Root.log": makeLog(0, 2), "sub": { "Nested.log": makeLog(1, 2), "deeper": { "Deep.log": makeLog(2, 2) } } };
  await w.addWatchedFolder(fakeDir("tlogs", files));
  const folder = T.state.folders[0];
  folder.settings.includeSubfolders = true;
  await w.rescanFolder(folder);
  w.render();
  const box = () => d.querySelector("#folderWatchList .folder-watch");
  const dirLabels = () => [...box().querySelectorAll(".tree-dir-row .tree-label")].map(l => l.textContent);
  const fileLabels = () => [...box().querySelectorAll(".folder-watch-file-name")].map(l => l.textContent);
  assert(dirLabels().join(",") === "sub", "one collapsed folder row, got " + dirLabels().join(","));
  assert(fileLabels().join(",") === "Root.log", "files inside a collapsed subfolder aren't listed, got " + fileLabels().join(","));
  const subRow = box().querySelector(".tree-dir-row");
  assert(subRow.querySelector(".tree-icon use").getAttribute("href") === "#i-folder", "folder row has the folder icon");
  assert(!subRow.querySelector(".tree-chevron").classList.contains("expanded"), "its chevron shows the collapsed state");

  fireClick(subRow, w);
  assert(dirLabels().join(",") === "sub,deeper", "expanding shows the nested (still collapsed) subfolder, got " + dirLabels().join(","));
  assert(fileLabels().join(",") === "Nested.log,Root.log", "...and the subfolder's own files by basename, got " + fileLabels().join(","));
  assert(box().querySelector(".tree-dir-row").querySelector(".tree-chevron").classList.contains("expanded"), "chevron flips to expanded");
  const nestedRow = [...box().querySelectorAll(".folder-watch-file")].find(r => r.textContent.includes("Nested.log"));
  assert(nestedRow.classList.contains("in-tree") && nestedRow.querySelector(".tree-guide.h"), "a nested listed file gets an elbow line into its folder");
  assert(parseFloat(nestedRow.style.paddingLeft) > parseFloat(box().querySelector(".tree-dir-row").style.paddingLeft), "and sits one level deeper than its folder row");

  fireDblClick(nestedRow, w);
  const rec = folder.files.find(f => f.name === "Nested.log");
  await waitFor(() => rec.nodeId && T.state.nodes[rec.nodeId].entries.length > 0);
  w.render();
  const openRow = box().querySelector('.tree-row[data-node-id="' + rec.nodeId + '"]');
  assert(openRow && openRow.querySelector(".tree-label").textContent === "Nested.log", "the opened file renders inside its subfolder");
  assert(openRow.querySelector(".tree-guide"), "...with connector lines");
  assert(box().querySelector(".tree-dir-row").classList.contains("on-path"), "the folder row is on the highlighted path to the active file");
  assert(w.flattenTreeIds().includes(rec.nodeId), "reachable by tree navigation while expanded");

  fireClick(box().querySelector(".tree-dir-row"), w);
  assert(!box().querySelector('.tree-row[data-node-id="' + rec.nodeId + '"]'), "collapsing hides the opened file");
  assert(!w.flattenTreeIds().includes(rec.nodeId), "...and removes it from tree navigation");

  folder.settings.includeSubfolders = false;
  await w.rescanFolder(folder);
  w.render();
  assert(!box().querySelector(".tree-dir-row") && !box().querySelector(".in-tree"), "without subfolders the flat listing is unchanged");
});

await withApp(async (w, d, T) => {
  section("317b. a file auto-opened by a folder watch rule expands the path to it");
  function fakeDir(name, entries) {
    return {
      kind: "directory", name,
      async *values() {
        for (const [key, val] of Object.entries(entries)) {
          if (typeof val === "string") yield { kind: "file", name: key, async getFile() { const b = new w.Blob([val]); b.text = async () => val; return b; } };
          else yield fakeDir(key, val);
        }
      },
    };
  }
  await w.addWatchedFolder(fakeDir("alogs", { "a.log": makeLog(0, 2), "x": { "y": { "z.log": makeLog(1, 2) } }, "other": { "o.log": makeLog(2, 2) } }));
  const folder = T.state.folders[0];
  folder.settings.includeSubfolders = true;
  folder.settings.patterns = [{ pattern: "z.log", autoOpenNewest: true, autoCloseKeep: null, showNewest: null }, { pattern: "*" }];
  await w.rescanFolder(folder);
  const rec = folder.files.find(f => f.name === "z.log");
  await waitFor(() => rec.nodeId && T.state.nodes[rec.nodeId]);
  w.render();
  assert([...folder.expandedDirs].sort().join(",") === "x,x/y", "the auto-opened file's folders are expanded, got " + [...folder.expandedDirs].join(","));
  assert(d.querySelector('#folderWatchList .tree-row[data-node-id="' + rec.nodeId + '"]'), "the auto-opened file is visible");
  const dirs = [...d.querySelectorAll("#folderWatchList .tree-dir-row .tree-label")].map(l => l.textContent);
  assert(dirs.join(",") === "other,x,y", "unrelated subfolders stay collapsed, got " + dirs.join(","));
  assert(!d.querySelector("#folderWatchList .folder-watch-file-name") || ![...d.querySelectorAll("#folderWatchList .folder-watch-file-name")].some(l => l.textContent === "o.log"), "o.log stays hidden in its collapsed folder");
});
