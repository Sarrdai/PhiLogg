// GROUP 206 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 206 — Folder minimap: hover crosshair + drag label, and three
   explicit actions (load individually / merge full / merge only the
   window) replacing the old single inferred Load button (person-
   requested). resolveFolderMinimapTargets is the one place both the
   toolbar's enable/disable logic and all three actions read "which files
   are relevant" from. folderMinimapMergeFull is the one new behavior:
   merges targets in full with NO timerange filter attached, even when
   reached via a drawn window (person-decided — that button means
   "everything, unfiltered"; only folderMinimapMergeWindow, unchanged from
   Group 204/205, still attaches the filter). folderMinimapMergeWindow
   stays disabled without an actual drawn window even if bars are picked
   (person-decided — no implied window from the selected bars' own
   ranges). The hover/drag DOM elements (#folderMinimapHoverLine/
   Tooltip/DragRect/DragLabel) are plain siblings of the SVG, not SVG
   children — same reasoning, and same real dispatched-mouse-event test
   technique, as the log minimap's own #timelineMinimapDragRect/
   DragLabel (see that group's own drag test) — jsdom's stubbed
   getBoundingClientRect/clientWidth plus real viewBox.baseVal support
   make this genuinely exercisable, not just state manipulation.
   ============================================================ */
group(206);
await withApp(async (w, d, T) => {
  section("206a. Toolbar buttons: enablement matches the selection — merge-window needs an actual drawn window, even with bars picked");

  function fakeFileHandle(text) {
    return { async getFile() { return { size: text.length, slice(s, e) { const ee = e === undefined ? text.length : e; const sl = text.slice(s, ee); return { text: async () => sl }; } }; } };
  }
  const recA = { name: "a.log", relPath: "a.log", nodeId: null, handle: fakeFileHandle(makeLog(0, 2)), _range: { first: 0, last: 1000 } };
  const recB = { name: "b.log", relPath: "b.log", nodeId: null, handle: fakeFileHandle(makeLog(0, 2)), _range: { first: 5000, last: 6000 } };
  const folder = { id: "fm-206-folder-1", name: "f206a", files: [recA, recB] };
  T.state.folders.push(folder);
  w.selectFolderContainer(folder.id);

  const loadEachBtn = d.querySelector("#folderMinimapLoadEachBtn");
  const mergeFullBtn = d.querySelector("#folderMinimapMergeFullBtn");
  const mergeWindowBtn = d.querySelector("#folderMinimapMergeWindowBtn");
  assert(loadEachBtn && mergeFullBtn && mergeWindowBtn, "all three action buttons render in the toolbar");
  assert(loadEachBtn.disabled && mergeFullBtn.disabled && mergeWindowBtn.disabled, "no selection: all three actions disabled");

  T.fmSelectedRecKeys = new Set(["a.log"]);
  T.fmSelectedWindow = null;
  w.renderFolderMinimap(folder);
  assert(!loadEachBtn.disabled && !mergeFullBtn.disabled, "bars picked: load-individually and merge-full enabled");
  assert(mergeWindowBtn.disabled, "bars picked but no window drawn: merge-window stays disabled");

  T.fmSelectedRecKeys = new Set();
  T.fmSelectedWindow = { from: -500, to: -100 }; // covers neither file's range
  w.renderFolderMinimap(folder);
  assert(loadEachBtn.disabled && mergeFullBtn.disabled && mergeWindowBtn.disabled, "a window covering zero files: all three disabled");

  T.fmSelectedWindow = { from: 0, to: 1000 }; // covers recA only
  w.renderFolderMinimap(folder);
  assert(!loadEachBtn.disabled && !mergeFullBtn.disabled && !mergeWindowBtn.disabled, "a window covering at least one file: all three enabled");
});

await withApp(async (w, d, T) => {
  section("206b. folderMinimapMergeFull: merges targets in full with no timerange filter, even when reached via a drawn window");

  function fakeFileHandle(text) {
    return {
      async getFile() {
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (s, e) => { const ee = e === undefined ? text.length : e; const sl = text.slice(s, ee); const b = new w.Blob([sl]); b.text = async () => sl; return b; };
        return blob;
      },
    };
  }
  const recA = { name: "a.log", relPath: "a.log", nodeId: null, handle: fakeFileHandle(makeLog(0, 3)) };
  const recB = { name: "b.log", relPath: "b.log", nodeId: null, handle: fakeFileHandle(makeLog(2, 3, { msgPrefix: "b" })) };
  const folder = { id: "fm-206-folder-2", name: "f206b", files: [recA, recB] };
  T.state.folders.push(folder);
  await Promise.all(folder.files.map(rec => w.probeFolderFileRange(folder, rec)));

  T.fmFolderId = folder.id;
  T.fmSelectedRecKeys = new Set();
  T.fmSelectedWindow = { from: new Date(2024, 0, 15, 10, 0, 0, 0).getTime(), to: new Date(2024, 0, 15, 10, 0, 4, 0).getTime() };
  await w.folderMinimapMergeFull(folder);

  assert(recA.nodeId && recB.nodeId, "both target files (window-selected) got loaded");
  const merged = T.state.nodes[T.state.activeId];
  assert(merged && merged.merged === true, "a merged node was created and is the active node");
  assert(merged.entries.length === 6, "merge combines both files' full entries, got " + merged.entries.length);
  // merged.children now always has the auto-managed "Sources" node (see
  // createMergeShell) — the assertion here is specifically about NOT
  // attaching a timerange filter (unlike folderMinimapMergeWindow below).
  assert(!merged.children.some(id => T.state.nodes[id].filterType === "timerange"),
    "merge-full attaches NO timerange filter, got children " + JSON.stringify(merged.children.map(id => T.state.nodes[id].filterType)));
});

await withApp(async (w, d, T) => {
  section("206c. resolveFolderMinimapTargets: the same file resolves whether reached via a bar pick or an equivalent window");

  const recA = { name: "a.log", relPath: "a.log", nodeId: null, _range: { first: 1000, last: 2000 } };
  const recB = { name: "b.log", relPath: "b.log", nodeId: null, _range: { first: 9000, last: 9500 } };
  const folder = { id: "fm-206-folder-3", name: "f206c", files: [recA, recB] };

  T.fmSelectedRecKeys = new Set(["a.log"]);
  T.fmSelectedWindow = null;
  assert(w.resolveFolderMinimapTargets(folder).map(r => r.name).join(",") === "a.log", "bar pick resolves to exactly a.log");

  T.fmSelectedRecKeys = new Set();
  T.fmSelectedWindow = { from: 500, to: 2500 }; // covers only recA
  assert(w.resolveFolderMinimapTargets(folder).map(r => r.name).join(",") === "a.log", "an equivalent window resolves to the same file");
});

await withApp(async (w, d, T) => {
  section("206d. Hover crosshair + drag label appear/disappear on real mouse events, mirroring the log minimap's own drag aid");

  function fakeFileHandle(text) {
    return { async getFile() { return { size: text.length, slice(s, e) { const ee = e === undefined ? text.length : e; const sl = text.slice(s, ee); return { text: async () => sl }; } }; } };
  }
  const recA = {
    name: "a.log", relPath: "a.log", nodeId: null, handle: fakeFileHandle(makeLog(0, 3)),
    _range: { first: new Date(2024, 0, 15, 10, 0, 0, 0).getTime(), last: new Date(2024, 0, 15, 10, 0, 2, 0).getTime() },
  };
  const folder = { id: "fm-206-folder-4", name: "f206d", files: [recA] };
  T.state.folders.push(folder);
  w.selectFolderContainer(folder.id);

  const svg = d.querySelector("#folderMinimapSvg");
  const hoverLine = d.querySelector("#folderMinimapHoverLine");
  const tooltip = d.querySelector("#folderMinimapTooltip");
  const dragRect = d.querySelector("#folderMinimapDragRect");
  const dragLabel = d.querySelector("#folderMinimapDragLabel");

  assert(hoverLine.classList.contains("hidden") && tooltip.classList.contains("hidden"), "hover aids start hidden");

  svg.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 400, clientY: 10 }));
  assert(!hoverLine.classList.contains("hidden") && !tooltip.classList.contains("hidden"), "hovering shows the crosshair line and the time tooltip");
  assert(tooltip.textContent.length > 0, "tooltip shows a formatted time, got " + JSON.stringify(tooltip.textContent));

  svg.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: true }));
  assert(hoverLine.classList.contains("hidden") && tooltip.classList.contains("hidden"), "leaving the minimap hides the hover aids again");

  // Drag from clientX 200 to 500 — past the click threshold (same
  // dispatched-event technique the real log minimap's own drag test uses).
  svg.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 10 }));
  assert(dragRect.classList.contains("hidden"), "drag overlay stays hidden until the pointer moves past the click threshold");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 500, clientY: 10 }));
  assert(!dragRect.classList.contains("hidden") && !dragLabel.classList.contains("hidden"), "drag band + label appear once past the threshold");
  assert(dragLabel.textContent.includes("→"), "drag label shows a from → to readout, got " + JSON.stringify(dragLabel.textContent));
  assert(hoverLine.classList.contains("hidden") && tooltip.classList.contains("hidden"), "the drag overlay hides the plain hover aids while dragging");

  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 500, clientY: 10 }));
  assert(dragRect.classList.contains("hidden") && dragLabel.classList.contains("hidden"), "drag band + label hide again after mouseup");
  assert(T.fmSelectedWindow && T.fmSelectedWindow.to > T.fmSelectedWindow.from, "the drag set a real selected window");
});
