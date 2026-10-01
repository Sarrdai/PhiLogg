// GROUP 204 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 204 — Folder-watch minimap for picking which files to load/merge
   (FEATURE_BACKLOG.md, folder-only — see the entry's own comment for why
   ZIP was deferred). Folder objects are seeded directly into
   state.folders rather than routed through addWatchedFolder/
   scanFolderHandle: scanning itself is already covered by Groups
   37/38/145/164/195, so this only exercises the new pieces —
   probeFolderFileRange's caching/invalidation, the folderView main-view
   dispatch, and the Load button's two selection modes (individual bars,
   no merge; a dragged window, full merge + a "timerange" filter matching
   it). Drag/click pixel math on the SVG itself is NOT covered here — jsdom
   has no real layout, and the bridge exposes fmSelectedRecKeys/
   fmSelectedWindow directly so tests can set the outcome of a drag/click
   instead of simulating raw mouse coordinates over an un-laid-out SVG.
   ============================================================ */
group(204);
await withApp(async (w, d, T) => {
  section("204a. probeFolderFileRange: probes and caches a range, invalidated by mergeScannedFiles on mtime change");

  function fakeProbeFileHandle(text) {
    return {
      async getFile() {
        return {
          size: text.length,
          async text() { return text; },
          slice(start, end) {
            const sliced = text.slice(start, end === undefined ? text.length : end);
            return { text: async () => sliced };
          },
        };
      },
    };
  }

  const log = makeLog(0, 3); // 10:00:00 .. 10:00:02
  const expectedFirst = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const rec = { name: "a.log", relPath: "a.log", handle: fakeProbeFileHandle(log), nodeId: null, mtime: 111 };
  const folder = { id: "fm-folder-a", name: "watched", files: [rec] };

  const range = await w.probeFolderFileRange(folder, rec);
  assert(range && range.first === expectedFirst, "probeFolderFileRange finds the file's first timestamp");
  assert(rec._range === range, "the resolved range is cached on the record as rec._range");

  // A second call must reuse the cache, not re-probe — swap in a handle
  // that throws if it's ever actually opened again.
  rec.handle = { async getFile() { throw new Error("should not be called — a cached range must not be re-probed"); } };
  const cached = await w.probeFolderFileRange(folder, rec);
  assert(cached === range, "a cached range is reused instead of re-probing");

  // mergeScannedFiles drops the cache once the file's mtime changes
  // underneath it (see that function's own comment).
  await w.mergeScannedFiles(folder, [{ name: "a.log", relPath: "a.log", handle: rec.handle, mtime: 222 }]);
  assert(rec._range === undefined, "mergeScannedFiles clears the cached range once the file's mtime changes");
});

await withApp(async (w, d, T) => {
  section("204b. folderFileTimeRange: an already-opened file's range comes from its real entries, not a re-probe");

  const fa = await w.addFile("a.log", makeLog(0, 3), () => {}); // 10:00:00-02
  const rec = { name: "a.log", relPath: "a.log", nodeId: fa.id, handle: { async getFile() { throw new Error("must not be probed — already open"); } } };
  const r = w.folderFileTimeRange(rec);
  assert(r && r.first === fa.entries[0].ts && r.last === fa.entries[fa.entries.length - 1].ts,
    "an opened file's range is read from its real entries (fileEntryTimeRange), never re-probed");
});

await withApp(async (w, d, T) => {
  section("204c. selectFolderContainer: switches the main view to the folder minimap, and back on a real node click");

  const rec = { name: "a.log", relPath: "a.log", nodeId: null, handle: { async getFile() { return { size: 0, async text() { return ""; }, slice: () => ({ text: async () => "" }) }; } } };
  const folder = { id: "fm-folder-c", name: "watched-c", files: [rec] };
  T.state.folders.push(folder);
  w.render();

  const titleEl = d.querySelector(".folder-watch-name");
  assert(titleEl !== null, "the folder's title renders as .folder-watch-name");
  fireClick(titleEl, w);
  assert(T.state.folderView === folder.id, "clicking the folder title sets state.folderView to that folder");
  assert(d.querySelector("#folderMinimapWrap").style.display !== "none", "the folder minimap wrap is shown");
  assert(d.querySelector("#tableWrap").style.display === "none", "the normal log table view is hidden while the minimap is showing");

  // Loading a real file (any normal node activation) leaves the special view.
  const fb = await w.addFile("b.log", makeLog(0, 1), () => {});
  assert(T.state.folderView === null, "activating a real node (loading a file) clears state.folderView");
  assert(T.state.activeId === fb.id, "the newly loaded file is the active node");

  // Re-select the folder (still in state.folders from the top of this
  // test), then remove it entirely — renderMainView must fall back to the
  // normal dispatch instead of rendering a wrap for a folder that's gone.
  w.selectFolderContainer(folder.id);
  T.state.folders = T.state.folders.filter(f => f.id !== folder.id);
  w.render();
  assert(T.state.folderView === null, "renderMainView clears state.folderView once its target folder is gone");
});

await withApp(async (w, d, T) => {
  section("204d. Actions: folderMinimapLoadIndividually loads picked bars with no merge; folderMinimapMergeWindow merges the drawn window's overlap and applies a matching timerange filter");

  // Unlike 204a/204b's plain-object fixture (probeFileTimeRange-only, never
  // read via FileReader), this one is also loaded for real by
  // loadFolderFile -> loadOneFileIntoTree -> readFileWithProgress, which
  // calls FileReader.readAsText(file) directly and needs a genuine Blob —
  // same real-w.Blob-plus-overridden-.slice/.text shape Group 164's own
  // fakeFileHandle uses.
  function fakeProbeFileHandle(text) {
    return {
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start, end) => {
          const sliced = text.slice(start, end === undefined ? text.length : end);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }

  const recA = { name: "a.log", relPath: "a.log", nodeId: null, handle: fakeProbeFileHandle(makeLog(0, 3)) };            // 10:00:00-02
  const recB = { name: "b.log", relPath: "b.log", nodeId: null, handle: fakeProbeFileHandle(makeLog(2, 3, { msgPrefix: "b" })) }; // 10:00:02-04, overlaps recA
  const recC = { name: "c.log", relPath: "c.log", nodeId: null, handle: fakeProbeFileHandle(makeLog(100, 3, { msgPrefix: "c" }))  }; // 10:01:40-42, far outside the window below
  const folder = { id: "fm-folder-d", name: "watched-d", files: [recA, recB, recC] };
  T.state.folders.push(folder);
  // Normally renderFolderMinimap kicks off probing as a side effect of
  // being shown; probe directly here since this test drives the actions
  // without ever rendering the minimap itself.
  await Promise.all(folder.files.map(rec => w.probeFolderFileRange(folder, rec)));

  // --- Individual selection: pick just recC, load it individually — no merge, no filter.
  T.fmFolderId = folder.id;
  T.fmSelectedRecKeys = new Set(["c.log"]);
  T.fmSelectedWindow = null;
  await w.folderMinimapLoadIndividually(folder);
  assert(recC.nodeId && T.state.nodes[recC.nodeId], "the individually-selected file (c.log) got loaded");
  assert(!recA.nodeId && !recB.nodeId, "individually selecting one bar does not load the others");
  assert(T.state.nodes[recC.nodeId].entries.length === 3 && !T.state.nodes[recC.nodeId].merged, "the loaded node is the plain file, not a merge");
  assert(T.state.folderView === null, "the action leaves the folder-minimap view");

  // --- Window selection: draw a window covering recA/recB (which overlap
  // each other) but not recC — "merge only the window" merges recA+recB
  // and applies a "timerange" filter for exactly the drawn window.
  w.selectFolderContainer(folder.id);
  const winFrom = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const winTo = new Date(2024, 0, 15, 10, 0, 4, 0).getTime();
  T.fmFolderId = folder.id;
  T.fmSelectedRecKeys = new Set();
  T.fmSelectedWindow = { from: winFrom, to: winTo };
  await w.folderMinimapMergeWindow(folder);

  assert(recA.nodeId && recB.nodeId, "both overlapping files (a.log, b.log) got loaded by the windowed merge");
  const mergedId = T.state.activeId && T.state.nodes[T.state.activeId] && T.state.nodes[T.state.activeId].parentId;
  const merged = mergedId ? T.state.nodes[mergedId] : null;
  assert(merged && merged.merged === true, "a merged node was created from the overlapping files");
  assert(merged.entries.length === 6, "the merge combines both overlapping files' entries, got " + (merged && merged.entries.length));
  const activeNode = T.state.nodes[T.state.activeId];
  assert(activeNode && activeNode.filterType === "timerange" && activeNode.value.from === winFrom && activeNode.value.to === winTo,
    "the active node after Load is a \"timerange\" filter matching the exact dragged window");
  assert(merged.name.includes("a.log") && merged.name.includes("b.log"), "the merged node covers exactly the two overlapping files, got " + merged.name);
});
