// GROUP 166 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 166 — Files & Filters / Folder watch detail fixes (this session,
   person-reported):
   1) the tailed-file "live" indicator is a pulsing FILE ICON now (no
      separate .tree-live dot before it), so a tailed file's icon no longer
      shifts other rows' labels out of alignment.
   2) an opened folder-watch file's row lines up flush with its still-closed
      (grayed) siblings — no chevron-slot/padding indent — instead of
      reading as extra-indented once opened.
   3) applyFolderAutoRules' auto-open/auto-close-keep now fire at most once
      per file (rec.autoOpenFired): a file the person closed again after an
      auto-open stays closed on the next rescan/poll instead of reopening.
      A file the person opened by hand is likewise never auto-closed by
      "keep only N open" (rec.openedByAuto gates that). An auto-opened
      file's icon carries the "(A)" auto-open badge; a manually opened one
      doesn't.
   ============================================================ */
group(166);
await withApp(async (w, d, T) => {
  section("166a. Tailed-file live indicator moved from a separate dot onto the file icon");

  const liveNode = await w.addFile("166-live.log", makeLog(0, 2), () => {});
  liveNode.tail = { handle: {}, offset: 0, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
  w.render();
  const liveRow = [...d.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "166-live.log");
  assert(liveRow.querySelector(".tree-live") === null, "no separate .tree-live dot element is rendered anymore");
  const liveIcon = liveRow.querySelector(".tree-icon");
  assert(liveIcon !== null && liveIcon.classList.contains("tree-icon-live"), "the file's own .tree-icon carries the pulsing live class instead");
  assert(liveIcon.title.includes("Live"), "the live tooltip moved onto the icon itself");

  liveNode.tail.lastGrowth = Date.now() - 20000; // past TAIL_LIVE_MS staleness window
  w.render();
  const liveRowNow = [...d.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "166-live.log");
  assert(!liveRowNow.querySelector(".tree-icon").classList.contains("tree-icon-live"), "the icon stops pulsing once the file goes stale, same staleness rule as before");
});

await withApp(async (w, d, T) => {
  section("166b. An opened folder-watch file's row aligns with its closed siblings (no extra indent)");

  function fakeFileHandle(name, text) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() { for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]); },
    };
  }

  const fileMap = { "align-a.log": makeLog(0, 2), "align-b.log": makeLog(10, 2) };
  const dir = fakeDirHandle("alignlogs", fileMap);
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];
  const bRec = folder.files.find(f => f.name === "align-b.log");
  await w.loadFolderFile(folder, bRec);
  await waitFor(() => bRec.nodeId && T.state.nodes[bRec.nodeId].entries.length === 2);
  w.render();

  const folderBox = d.querySelector(".folder-watch");
  const closedRow = folderBox.querySelector(".folder-watch-file");
  const openRow = [...folderBox.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "align-b.log");
  assert(closedRow !== null && openRow !== null, "both a closed and an opened row are present to compare");
  assert(openRow.style.paddingLeft === "12px", "an opened top-level folder-watch file's row uses the same 12px inset as its closed siblings, got " + openRow.style.paddingLeft);
  assert(openRow.querySelector(".tree-chevron-slot") === null, "no chevron-slot is reserved for an opened folder-watch file with no filters of its own, so nothing pushes its icon further right");
});

await withApp(async (w, d, T) => {
  section("166c. Auto-open fires once per file; a manual close after it sticks");

  function fakeFileHandle(name, text) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() { for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]); },
    };
  }

  const fileMap = { "auto-1.log": makeLog(0, 1) };
  const dir = fakeDirHandle("autologs", fileMap);
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];
  folder.settings.patterns = [{ pattern: "*", autoOpenNewest: true, autoCloseKeep: null, showNewest: null }];
  await w.rescanFolder(folder);

  const rec = folder.files.find(f => f.name === "auto-1.log");
  assert(rec.nodeId && T.state.nodes[rec.nodeId], "auto-open newest opened the only file");
  assert(rec.autoOpenFired === true, "rec.autoOpenFired is set once an auto rule opens a file");
  assert(rec.openedByAuto === true, "rec.openedByAuto reflects that this open came from the auto rule");
  w.render();
  const autoRow = [...d.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "auto-1.log");
  assert(autoRow.querySelector(".tree-icon").title.includes("automatically"), "the auto-opened file's icon tooltip mentions it was opened automatically");

  // Person closes it by hand.
  const closeBtn = autoRow.querySelector(".tree-del");
  fireClick(closeBtn, w);
  assert(!rec.nodeId, "closing the file clears its folder record's nodeId");

  // A later rescan (simulating the next poll) must NOT reopen it.
  await w.rescanFolder(folder);
  const recAfter = folder.files.find(f => f.name === "auto-1.log");
  assert(!recAfter.nodeId, "a file auto-opened once and then manually closed stays closed across a later rescan, doesn't silently reopen");
});

await withApp(async (w, d, T) => {
  section("166d. A manually opened file is never auto-closed by \"keep only N open\"");

  function fakeFileHandle(name, text) {
    return {
      kind: "file", name,
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "name", { value: name, configurable: true });
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }
  function fakeDirHandle(name, fileMap) {
    return {
      kind: "directory", name,
      async *values() { for (const fname of Object.keys(fileMap)) yield fakeFileHandle(fname, fileMap[fname]); },
    };
  }

  const fileMap = { "keep-01.log": makeLog(0, 1), "keep-02.log": makeLog(1, 1) };
  const dir = fakeDirHandle("keeplogs", fileMap);
  await w.addWatchedFolder(dir);
  const folder = T.state.folders[0];

  // Person opens the OLDER file by hand first, before any auto rule exists.
  const oldRec = folder.files.find(f => f.name === "keep-01.log");
  await w.loadFolderFile(folder, oldRec);
  await waitFor(() => oldRec.nodeId && T.state.nodes[oldRec.nodeId].entries.length === 1);
  assert(oldRec.openedByAuto === false, "a manually opened file's rec.openedByAuto is false");

  // Now a keep-1 rule is configured and a newer file arrives — the sliding
  // window would normally close whichever open file falls outside it, but
  // the manually opened one must be left alone.
  folder.settings.patterns = [{ pattern: "*", autoOpenNewest: false, autoCloseKeep: 1, showNewest: null }];
  await w.rescanFolder(folder);
  const oldRecAfter = folder.files.find(f => f.name === "keep-01.log");
  const newRecAfter = folder.files.find(f => f.name === "keep-02.log");
  assert(oldRecAfter.nodeId, "the manually opened older file is still open despite falling outside the keep-1 window");
  assert(newRecAfter.nodeId && newRecAfter.openedByAuto === true, "the newer file was auto-opened to satisfy the keep-1 rule");
});
