// GROUP 343 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 343 — The tree cursor on an unloaded (grayed) entry deselects, and
   the main view shows a placeholder
   Origin: 2026-09-30 (person-reported). Alt+Arrow (or a plain click) onto a
   listed-but-not-loaded ZIP entry / watched-folder file used to leave the
   previously selected file highlighted and its content shown — it read as if
   the row under the cursor were open. Now placeCursorOnUnloaded clears
   activeId / inlineViewer / folderView / multiSelect (a dir row stays
   cursor-only), and renderMainView shows #emptyState with texts built in JS:
   `"<name>" is not loaded` (+ the keys that load it) while the cursor rests
   on an unloaded entry, `No file selected` when files are open but none is
   selected, the original "No log file loaded yet" otherwise. Everything that
   reads state.activeId while it is null must stay a no-op (343f).
   ============================================================ */
group(343);
if (groupSelected()) {
  const simLog = seed => LOGSIM.generateToStrings({ format: "default", entries: 6, seed })[0].text;
  // Hand-built stored ZIP (fixture tooling only, like GROUP 199 / 329).
  const storedZip = (entries) => {
    let offset = 0; const local = [], central = [];
    for (const e of entries) {
      const nameBuf = Buffer.from(e.name, "utf8"), data = Buffer.from(e.data, "utf8");
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
      lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
      const rec = Buffer.concat([lh, nameBuf, data]);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
      ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
      local.push(rec); central.push(Buffer.concat([ch, nameBuf])); offset += rec.length;
    }
    const L = Buffer.concat(local), C = Buffer.concat(central), eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(C.length, 12); eocd.writeUInt32LE(L.length, 16);
    return Buffer.concat([L, C, eocd]);
  };
  const zipBytes = () => storedZip([
    { name: "a.log", data: simLog(1) }, { name: "b.log", data: simLog(2) }, { name: "c.log", data: simLog(3) },
    { name: "notes.png", data: "PNGDATA" },
  ]);
  const ZIP_BODY = "Press → or Alt+→ to load it, or double-click it.";
  const empty = d => ({ el: d.querySelector("#emptyState"), h: d.querySelector("#emptyState h2").textContent, p: d.querySelector("#emptyState p").textContent });
  const zipRow = (d, name) => [...d.querySelectorAll("#zipList .folder-watch-file")].find(r => r.querySelector(".folder-watch-file-name").textContent === name);
  const zipNode = (T, zip, name) => Object.values(T.state.nodes).find(n => n.zipId === zip.id && n.name === name);
  const openZipLog = async (w, d, T, zip, name) => {
    fireDblClick(zipRow(d, name), w);
    const node = await waitFor(() => { const n = zipNode(T, zip, name); return n && typeof n.loadFraction !== "number" && n.entries.length > 0 ? n : null; });
    return node;
  };
  const surfacesHidden = (d, w) => ["#tableWrap", "#fhSplit", "#viewBar", "#detailPanel", "#inlineViewerWrap", "#folderMinimapWrap"].every(sel => !isVisible(d.querySelector(sel), w));

  section("343a. ZIP, Alt+Down onto a closed entry: the open file is deselected, the placeholder names the entry and the keys; Alt+Up selects the file again");
  await withApp(async (w, d, T) => {
    const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
    const U = n => w.unloadedNavId("zip", zip.id, n);
    const key = (k, o) => fireKeydown(d, w, k, o);
    const a = await openZipLog(w, d, T, zip, "a.log");
    assert(T.state.activeId === a.id && isVisible(d.querySelector("#tableWrap"), w) && !isVisible(d.querySelector("#emptyState"), w),
      "sanity: a.log is open and shown, no placeholder");
    assert(d.querySelector(".tree-row.active"), "sanity: its tree row is active");
    T.state.focusRegion = "entries";

    key("ArrowDown", { altKey: true });
    assert(w.treeCursorId() === U("b.log"), "Alt+Down lands on the closed b.log, got " + w.treeCursorId());
    assert(T.state.activeId === null && T.state.inlineViewer === null && T.state.folderView === null, "nothing is selected: activeId/inlineViewer/folderView are null");
    assert(T.state.multiSelect.size === 0, "multiSelect is cleared");
    assert(!d.querySelector(".tree-row.active") && !d.querySelector(".zip-entry-active"), "no row is highlighted as the active file");
    assert(d.querySelectorAll("#zipList .tree-cursor").length === 1, "exactly the cursor row carries the dashed cursor look");
    let e = empty(d);
    assert(isVisible(e.el, w) && e.h === '"b.log" is not loaded', "#emptyState shows the entry's name, got " + JSON.stringify(e.h));
    assert(e.p === ZIP_BODY, "...and the keys that load it, got " + JSON.stringify(e.p));
    assert(surfacesHidden(d, w), "the table, view bar, detail panel and the viewers are hidden");
    assert(T.state.nodes[a.id] && T.state.rootIds.includes(a.id), "a.log itself is still open (only deselected)");
    assert(T.state.focusRegion === "entries", "Alt+Arrow still leaves focusRegion alone");

    key("ArrowDown", { altKey: true });
    assert(w.treeCursorId() === U("c.log") && empty(d).h === '"c.log" is not loaded', "Alt+Down on to c.log: the placeholder follows the cursor, got " + empty(d).h);
    key("ArrowUp", { altKey: true });
    assert(w.treeCursorId() === U("b.log") && empty(d).h === '"b.log" is not loaded', "Alt+Up continues from the unloaded row");
    key("ArrowUp", { altKey: true });
    assert(T.state.activeId === a.id && w.treeCursorId() === null, "Alt+Up onto the open a.log selects it again (cursor cleared)");
    assert(!isVisible(empty(d).el, w) && isVisible(d.querySelector("#tableWrap"), w) && isVisible(d.querySelector("#fhSplit"), w) && isVisible(d.querySelector("#viewBar"), w),
      "...the placeholder is gone, the table is back");
    assert(d.querySelector(".tree-row.active"), "...and its row is active again");
  });

  section("343b. a plain click on a grayed ZIP row deselects the same way; a double-click after the click still loads it (the row element survives)");
  await withApp(async (w, d, T) => {
    const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
    const a = await openZipLog(w, d, T, zip, "a.log");
    const row = zipRow(d, "b.log");
    fireClick(row, w);
    assert(T.state.activeId === null && w.treeCursorId() === w.unloadedNavId("zip", zip.id, "b.log") && T.state.focusRegion === "tree",
      "the click deselects, puts the cursor on the row and focuses the tree");
    assert(empty(d).h === '"b.log" is not loaded' && surfacesHidden(d, w) && !d.querySelector(".tree-row.active"), "placeholder shown, a.log no longer highlighted");
    assert(zipRow(d, "b.log") === row && row.classList.contains("tree-cursor"), "the row element survives the click's render (a native dblclick keeps working)");
    fireDblClick(row, w); // the very element from before the click
    const b = await waitFor(() => { const n = zipNode(T, zip, "b.log"); return n && typeof n.loadFraction !== "number" && n.entries.length > 0 ? n : null; });
    assert(b && T.state.activeId === b.id && w.treeCursorId() === null, "the double-click loaded b.log and selected it");
    assert(!isVisible(empty(d).el, w) && isVisible(d.querySelector("#tableWrap"), w), "the placeholder is gone once b.log is shown");
    assert(T.state.nodes[a.id], "a.log is still open");
  });

  section("343c. a SHOWN inline viewer is deselected the same way (Alt+Up onto a closed entry), and its row stays open");
  await withApp(async (w, d, T) => {
    const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
    const key = (k, o) => fireKeydown(d, w, k, o);
    fireDblClick(zipRow(d, "notes.png"), w);
    await waitFor(() => T.state.inlineViewer && T.state.inlineViewer.name === "notes.png");
    assert(isVisible(d.querySelector("#inlineViewerWrap"), w) && !isVisible(empty(d).el, w), "sanity: the viewer is shown");
    key("ArrowUp", { altKey: true });
    assert(w.treeCursorId() === w.unloadedNavId("zip", zip.id, "c.log"), "Alt+Up from the viewer lands on c.log, got " + w.treeCursorId());
    assert(T.state.inlineViewer === null && T.state.activeId === null, "the viewer is no longer shown");
    assert(!isVisible(d.querySelector("#inlineViewerWrap"), w) && empty(d).h === '"c.log" is not loaded' && isVisible(empty(d).el, w), "the placeholder replaces it");
    assert(zip.inlineViewers.has("notes.png"), "the viewer entry itself is still open");
    const nr = zipRow(d, "notes.png");
    assert(nr.classList.contains("zip-entry-opened") && !nr.classList.contains("zip-entry-active"), "...its row is the opened look, not the active one");
    key("ArrowDown", { altKey: true });
    assert(T.state.inlineViewer && T.state.inlineViewer.name === "notes.png" && !isVisible(empty(d).el, w), "Alt+Down onto the open viewer shows it again");
  });

  section("343d. Right / Alt+Right loads the entry and selects it when the cursor stayed; while it loads the placeholder says so");
  await withApp(async (w, d, T) => {
    const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
    const a = await openZipLog(w, d, T, zip, "a.log");
    const bEntry = zip.entries.find(e => e.name === "b.log");
    let release; const gate = new Promise(r => { release = r; });
    const realExtract = bEntry.extract;
    bEntry.extract = async () => { await gate; return realExtract.call(bEntry); };
    fireKeydown(d, w, "ArrowDown", { altKey: true });
    assert(empty(d).h === '"b.log" is not loaded', "sanity: cursor on b.log");
    fireKeydown(d, w, "ArrowRight", { altKey: true });
    await waitFor(() => zipNode(T, zip, "b.log"));
    assert(T.state.activeId === null && empty(d).h === '"b.log" is loading…' && empty(d).p === "It opens here as soon as it is ready.",
      "while it loads: still nothing selected, the placeholder says it is loading, got " + JSON.stringify(empty(d).h));
    release();
    const b = await waitFor(() => { const n = zipNode(T, zip, "b.log"); return n && typeof n.loadFraction !== "number" && n.entries.length > 0 && T.state.activeId === n.id ? n : null; });
    assert(b && w.treeCursorId() === null, "Right loaded b.log and selected it (the stillThere check works from a null activeId)");
    assert(!isVisible(empty(d).el, w) && isVisible(d.querySelector("#tableWrap"), w), "placeholder gone, table shown");
    assert(T.state.nodes[a.id], "a.log stays open");
  });

  section("343e. watched folder: Alt+Down and a click on a grayed file deselect; dir rows stay cursor-only; Right loads + selects");
  await withApp(async (w, d, T) => {
    function fakeDir(name, entries) {
      return { kind: "directory", name, async *values() {
        for (const [k, v] of Object.entries(entries)) yield { kind: "file", name: k, async getFile() { const b = new w.Blob([v]); b.text = async () => v; return b; } };
      } };
    }
    await w.addWatchedFolder(fakeDir("flogs", { "One.log": simLog(4), "Two.log": simLog(5), "Three.log": simLog(6) }));
    const folder = T.state.folders[0];
    const F = n => w.unloadedNavId("folder", folder.id, n);
    const key = (k, o) => fireKeydown(d, w, k, o);
    const fRow = name => [...d.querySelectorAll("#folderWatchList .folder-watch-file")].find(r => r.querySelector(".folder-watch-file-name").textContent === name);
    assert(empty(d).h === "No log file loaded yet" && isVisible(empty(d).el, w), "sanity: nothing open, nothing selected -> the original hint");
    fireDblClick(fRow("One.log"), w);
    const recOne = folder.files.find(r => r.name === "One.log");
    await waitFor(() => recOne.nodeId && T.state.nodes[recOne.nodeId] && typeof T.state.nodes[recOne.nodeId].loadFraction !== "number" && T.state.activeId === recOne.nodeId);
    assert(T.state.activeId === recOne.nodeId && !isVisible(empty(d).el, w), "One.log is open and shown");

    key("ArrowDown", { altKey: true });
    assert(w.treeCursorId() === F("Three.log") || w.treeCursorId() === F("Two.log"), "Alt+Down lands on an unloaded folder file, got " + w.treeCursorId());
    const name1 = w.parseUnloadedNavId(w.treeCursorId()).key;
    assert(T.state.activeId === null && empty(d).h === `"${name1}" is not loaded` && empty(d).p === ZIP_BODY && surfacesHidden(d, w), "deselected + placeholder for " + name1 + ", got " + empty(d).h);
    assert(!d.querySelector(".tree-row.active"), "One.log's row is no longer active");

    // a click on another grayed row moves the placeholder with it
    const other = name1 === "Two.log" ? "Three.log" : "Two.log";
    const row = fRow(other);
    fireClick(row, w);
    assert(w.treeCursorId() === F(other) && empty(d).h === `"${other}" is not loaded` && T.state.activeId === null, "a click on " + other + " moves the cursor and the placeholder");
    assert(fRow(other) === row, "the grayed row element is reused across the render (dblclick keeps working)");

    // Right loads + selects
    key("ArrowRight", { altKey: true });
    const rec = folder.files.find(r => r.name === other);
    await waitFor(() => rec.nodeId && T.state.nodes[rec.nodeId] && typeof T.state.nodes[rec.nodeId].loadFraction !== "number" && T.state.activeId === rec.nodeId);
    assert(T.state.activeId === rec.nodeId && w.treeCursorId() === null && !isVisible(empty(d).el, w), "Alt+Right loaded " + other + " and selected it");
  });

  section("343f. texts: 'No file selected' with files open, the original hint restored when nothing is open, no cursor-only text for a dir row");
  await withApp(async (w, d, T) => {
    const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
    const key = (k, o) => fireKeydown(d, w, k, o);
    assert(empty(d).h === "No log file loaded yet" && /Drop one or more log files/.test(empty(d).p) && d.querySelector("#emptyState p b"),
      "sanity: the original hint (with its <b> markup)");
    key("ArrowDown", { altKey: true });
    assert(empty(d).h === '"a.log" is not loaded' && empty(d).p === ZIP_BODY && isVisible(empty(d).el, w),
      "no file open yet, cursor on an unloaded entry -> its placeholder, got " + JSON.stringify(empty(d).h));
    const a = await openZipLog(w, d, T, zip, "a.log");
    // files open, none selected, cursor NOT on an unloaded entry (e.g. an automatic close took the shown viewer)
    T.state.activeId = null; w.setTreeCursor(null); w.render();
    assert(empty(d).h === "No file selected" && empty(d).p === "Select a file on the left." && isVisible(empty(d).el, w) && surfacesHidden(d, w),
      "files open, nothing selected -> 'No file selected', got " + JSON.stringify(empty(d).h));
    assert(!d.querySelector("#emptyState p b"), "...the body is plain text");
    // closing the last file: back to the original hint
    T.state.activeId = a.id; w.render();
    w.deleteFilterNodeWithUndo(a.id); w.render();
    assert(T.state.rootIds.length === 0 && empty(d).h === "No log file loaded yet" && /Drop one or more log files/.test(empty(d).p) && d.querySelector("#emptyState p b"),
      "no files at all -> the original heading AND markup are restored, got " + JSON.stringify(empty(d).h));
    // selecting a file hides it again
    const f = await w.addFile("plain.log", simLog(9), () => {});
    T.state.activeId = f.id; w.render();
    assert(!isVisible(empty(d).el, w) && isVisible(d.querySelector("#tableWrap"), w), "a selected file shows the table, no placeholder");
  });

  section("343g. nothing breaks while activeId is null: nav history, session meta, find bar, Ctrl+F / Delete / F2 / copy-paste / Ctrl+0 are no-ops");
  await withApp(async (w, d, T) => {
    // jsdom reports an exception thrown by an event handler as an "error" event on the window.
    const errs = [];
    w.addEventListener("error", ev => { errs.push(ev.message || String(ev.error)); });

    const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
    const a = await openZipLog(w, d, T, zip, "a.log");
    const c = await openZipLog(w, d, T, zip, "c.log");
    assert(T.state.activeId === c.id, "sanity: c.log is the active file, a.log was visited before");
    const key = (k, o) => fireKeydown(d, w, k, o);
    const navId = w.unloadedNavId("zip", zip.id, "b.log");
    const toCursor = () => { w.placeCursorOnUnloaded(navId); w.render(); };
    toCursor();
    const nodesBefore = Object.keys(T.state.nodes).length, undoBefore = T.undoStack.length;

    // keys
    const keys = [["f", { ctrlKey: true }], ["g", { ctrlKey: true }], ["F3"], ["F3", { shiftKey: true }], ["F2"], ["Delete"], ["Enter"], ["c", { ctrlKey: true }],
      ["c", { ctrlKey: true, shiftKey: true }], ["v", { ctrlKey: true }], ["x", { ctrlKey: true }], ["z", { ctrlKey: true }], ["y", { ctrlKey: true }], ["w", { ctrlKey: true }],
      ["d", { ctrlKey: true }], ["e", { ctrlKey: true }], ["1", { ctrlKey: true }], ["Escape"]];
    keys.forEach(([k, o]) => { key(k, o); toCursor(); });
    assert(errs.length === 0, "none of the keys threw, got " + JSON.stringify(errs));
    assert(d.querySelector("#filterPopup").classList.contains("hidden"), "Ctrl+F opened no filter popup (nothing to filter)");
    assert(Object.keys(T.state.nodes).length === nodesBefore && T.undoStack.length === undoBefore, "Delete / Ctrl+W / paste created or removed nothing");
    assert(T.state.activeId === null && w.treeCursorId() === navId, "still nothing selected, the cursor stays on b.log");

    // focus-tree shortcut keeps the cursor instead of pulling in the first file
    key("0", { ctrlKey: true });
    assert(T.state.activeId === null && w.treeCursorId() === navId, "Ctrl+0 (focus tree) does not select the first file while the cursor rests on an unloaded entry");

    // find bar: open, type, step, close
    const fi = d.querySelector("#findInput");
    key("g", { ctrlKey: true });
    fi.value = "INFO"; fi.dispatchEvent(new w.Event("input", { bubbles: true }));
    key("F3"); key("F3", { shiftKey: true });
    fi.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    fi.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert(errs.length === 0, "the find bar with no visible log view threw nothing, got " + JSON.stringify(errs));
    toCursor();

    // nav history: back/forward from the null state
    d.querySelector("#btnNavBack").click();
    assert(errs.length === 0, "Back from the null state threw nothing, got " + JSON.stringify(errs));
    const afterBack = T.state.activeId;
    assert(afterBack === null || T.state.nodes[afterBack], "Back lands on nothing or on a live node, got " + afterBack);
    toCursor();
    d.querySelector("#btnNavForward").click();
    assert(errs.length === 0, "Forward threw nothing, got " + JSON.stringify(errs));
    w.navigateBack(); w.navigateForward(); w.navigateBack();
    assert(errs.length === 0 && (T.state.activeId === null || T.state.nodes[T.state.activeId]), "history stepping stays on live nodes, got " + JSON.stringify(errs));

    // session meta while nothing is selected: builds and persists, records no active node
    toCursor();
    const meta = w.buildCacheMeta();
    assert(meta.settings.active === null && meta.fileOrder.length === 2, "buildCacheMeta: no active node, both files listed, got " + JSON.stringify(meta.settings.active) + " / " + meta.fileOrder.length);
    await w.persistMetaNow();
    assert(errs.length === 0, "persisting the meta threw nothing");

    // Alt+Up/Down keeps walking from the unloaded row; a real selection then works normally
    key("ArrowDown", { altKey: true });
    assert(w.treeCursorId() === w.unloadedNavId("zip", zip.id, "notes.png") || T.state.inlineViewer || w.treeCursorId() !== navId,
      "Alt+Down moves on from the unloaded row");
    assert(errs.length === 0, "no errors anywhere above, got " + JSON.stringify(errs));
    T.state.activeId = a.id; w.render();
    assert(isVisible(d.querySelector("#tableWrap"), w) && errs.length === 0, "selecting a file afterwards works");
  }, { indexedDB: new IDBFactory() });

  section("343g2. nav history: leaving the placeholder (Back) does not re-capture the hidden file view over its waypoint");
  await withApp(async (w, d, T) => {
    const zip = await w.openZipSource(new w.File([zipBytes()], "logs.zip"), "logs.zip");
    const a = await openZipLog(w, d, T, zip, "a.log");
    const c = await openZipLog(w, d, T, zip, "c.log");
    assert(T.state.activeId === c.id, "sanity: a.log then c.log were visited (history [a, c])");
    fireKeydown(d, w, "ArrowDown", { altKey: true }); // c.log -> the closed notes.png entry below it, nothing selected
    assert(T.state.activeId === null && isVisible(empty(d).el, w), "sanity: placeholder shown");
    let captures = 0;
    const realCapture = w.captureNavWaypoint;
    w.captureNavWaypoint = (...args) => { captures++; return realCapture.apply(w, args); };
    w.navigateBack();
    w.captureNavWaypoint = realCapture;
    assert(T.state.activeId === a.id, "Back from the placeholder lands on a.log, got " + T.state.activeId);
    assert(captures === 0, "no waypoint was re-captured from the hidden (placeholder) view, got " + captures + " capture(s)");
  });

  section("343h. session restore: a meta written while nothing was selected restores the files (falls back to the first one)");
  {
    const factory = new IDBFactory();
    await withApp(async (w, d, T) => {
      const f1 = await w.addFile("one.log", simLog(1), () => {});
      await w.addFile("two.log", simLog(2), () => {});
      T.state.activeId = null; w.render();
      await w.persistMetaNow();
      assert(w.buildCacheMeta().settings.active === null, "sanity: the stored meta has no active node");
      await w.persistFileNode(T.state.nodes[f1.id]);
      await w.persistFileNode(T.state.nodes[T.state.rootIds[1]]);
      await w.persistMetaNow();
    }, { indexedDB: factory });
    await withApp(async (w, d, T) => {
      await T.bootRestore;
      assert(T.state.rootIds.length === 2, "both files came back, got " + T.state.rootIds.length);
      assert(T.state.activeId && T.state.nodes[T.state.activeId], "a file is selected after the restore (first one), got " + T.state.activeId);
    }, { indexedDB: factory });
  }
}
