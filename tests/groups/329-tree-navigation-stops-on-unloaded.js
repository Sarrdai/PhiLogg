// GROUP 329 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 329 — tree navigation stops on unloaded (grayed) ZIP / folder entries
   Origin: 2026-09-29 (person-requested). flattenTreeIds lists every listed,
   not-yet-loaded entry as a cursor-only "unloadednav:" stop (like a dir row):
   Up/Down/Alt+Up/Down land on it without touching the main view; Shift (Alt+
   Shift+Up/Down, Shift+Up/Down with tree focus) skips them; Right loads/opens
   it exactly like its double-click and shows the result only if the cursor is
   still there; Left goes to the dir row; cursor look = dashed .tree-cursor
   (also for dir rows) + "→ load" badge; a click puts the cursor there.
   ============================================================ */
group(329);
{
  // Hand-built stored ZIP (fixture tooling only, like GROUP 199 / 324f).
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
  const zipFixture = () => storedZip([
    { name: "sub/deep.log", data: makeLog(0, 3) },
    { name: "a.log", data: makeLog(0, 4) },
    { name: "c.log", data: makeLog(1, 4) },
    { name: "notes.png", data: "hello notes" },
  ]);

  await withApp(async (w, d, T) => {
    section("329a. ZIP: Alt+Up/Down stops on unloaded entries (cursor-only), main view unchanged, cursor look");
    const zip = await w.openZipSource(new w.File([zipFixture()], "logs.zip"), "logs.zip");
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "entries"; w.render();
    const subId = w.dirNavId("zip", zip.id, "sub");
    const U = n => w.unloadedNavId("zip", zip.id, n);
    assert(w.flattenTreeIds().join("|") === [subId, U("a.log"), U("c.log"), U("notes.png"), plain.id].join("|"),
      "flatten: dir row, the unloaded entries in listing order, then the main tree, got " + w.flattenTreeIds().join("|"));
    const key = (k, o) => fireKeydown(d, w, k, o);
    key("ArrowUp", { altKey: true });
    assert(w.treeCursorId() === U("notes.png"), "Alt+Up from a loaded node lands on the unloaded entry above");
    assert(T.state.activeId === null && !T.state.inlineViewer, "...and deselects the previous file (Group 343: activeId null, nothing shown for it)");
    assert(T.state.focusRegion === "entries", "Alt+Arrow leaves focusRegion alone");
    const cur = [...d.querySelectorAll("#zipList .tree-cursor")];
    assert(cur.length === 1 && cur[0].classList.contains("zip-source-file") && !cur[0].classList.contains("active"), "exactly one cursor row (dashed class, not .active)");
    const badge = cur[0].querySelector(".tree-load-badge");
    assert(badge && badge.textContent === "→ load", "the cursor row carries the '→ load' badge");
    assert(cur[0].parentElement.querySelector(".tree-cursor") === cur[0] && d.querySelectorAll("#zipList .zip-source-file:not(.tree-cursor)").length >= 2, "other unloaded rows are not marked");
    key("ArrowUp", { altKey: true });
    assert(w.treeCursorId() === U("c.log"), "Alt+Up again -> the next unloaded entry");
    key("ArrowDown", { altKey: true });
    assert(w.treeCursorId() === U("notes.png"), "Alt+Down goes back down");
    key("ArrowDown", { altKey: true });
    assert(w.treeCursorId() === null && T.state.activeId === plain.id, "Alt+Down onto the loaded node selects it again (cursor cleared)");
    key("ArrowUp", { altKey: true }); key("ArrowUp", { altKey: true }); key("ArrowUp", { altKey: true }); key("ArrowUp", { altKey: true });
    assert(w.treeCursorId() === subId, "Up walks on to the dir row");
    const dirRow = d.querySelector("#zipList .tree-dir-row");
    assert(dirRow.classList.contains("tree-cursor") && !dirRow.classList.contains("active"), "the dir row cursor uses the dashed class, not .active");
    assert(T.state.activeId === null, "a dir row is cursor-only: the walk over unloaded entries left nothing selected, the dir row selects nothing");
  });

  await withApp(async (w, d, T) => {
    section("329b. Shift skips unloaded entries (dir rows stay stops); Shift+Left/Right = plain");
    const zip = await w.openZipSource(new w.File([zipFixture()], "logs.zip"), "logs.zip");
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "entries"; w.render();
    const subId = w.dirNavId("zip", zip.id, "sub");
    const key = (k, o) => fireKeydown(d, w, k, o);
    key("ArrowUp", { altKey: true, shiftKey: true });
    assert(w.treeCursorId() === subId, "Shift+Alt+Up from the node above skips all unloaded entries, stops on the dir row");
    key("ArrowDown", { altKey: true, shiftKey: true });
    assert(w.treeCursorId() === null && T.state.activeId === plain.id, "Shift+Alt+Down steps over them back to the node");
    // tree focus, plain arrows with Shift
    T.state.focusRegion = "tree"; T.state.activeId = plain.id; w.render();
    key("ArrowUp", { shiftKey: true });
    assert(w.treeCursorId() === subId, "Shift+Up with tree focus skips unloaded entries too");
    key("ArrowDown");
    assert(w.isUnloadedNavId(w.treeCursorId()), "plain Down from the dir row stops on the first unloaded entry");
    key("ArrowDown", { shiftKey: true });
    assert(T.state.activeId === plain.id && w.treeCursorId() === null, "Shift+Down from an unloaded stop continues past the remaining unloaded entries");
    // Shift+Right on an unloaded entry behaves like Right
    T.state.focusRegion = "tree";
    w.setTreeCursor(w.unloadedNavId("zip", zip.id, "notes.png")); w.render();
    key("ArrowRight", { shiftKey: true });
    await waitFor(() => T.state.inlineViewer);
    assert(T.state.inlineViewer && T.state.inlineViewer.name === "notes.png", "Shift+Right opens the entry like Right");
  });

  await withApp(async (w, d, T) => {
    section("329c. Right loads a log entry and activates it when the cursor stayed; Left goes to the parent dir row; Enter/Delete do nothing");
    const zip = await w.openZipSource(new w.File([zipFixture()], "logs.zip"), "logs.zip");
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    const flt = w.createFilterNode(plain.id, "text", "e");
    T.state.activeId = flt.id; T.state.focusRegion = "tree"; w.render();
    const key = (k, o) => fireKeydown(d, w, k, o);
    const U = n => w.unloadedNavId("zip", zip.id, n);
    w.setTreeCursor(U("a.log")); w.render();
    const nodeCount = Object.keys(T.state.nodes).length;
    key("Delete"); key("Enter");
    assert(Object.keys(T.state.nodes).length === nodeCount && T.state.activeId === flt.id, "Delete/Enter with the cursor on an unloaded entry do nothing");
    key("ArrowRight", { altKey: true });
    await waitFor(() => T.state.activeId !== flt.id);
    const node = T.state.nodes[T.state.activeId];
    assert(node && node.zipId === zip.id && node.name === "a.log", "the loaded a.log became the active node");
    await waitFor(() => typeof node.loadFraction !== "number");
    assert(node.entries.length === 4 && w.treeCursorId() === null, "fully loaded, cursor cleared");
    assert(!T.state.inlineViewer && !T.state.folderView, "main view shows the log");

    // Left on an unloaded entry inside a dir -> the dir row; top level -> nothing
    zip.expandedDirs = new Set(["sub"]); w.render();
    const deepId = U("sub/deep.log"), subId = w.dirNavId("zip", zip.id, "sub");
    w.setTreeCursor(deepId); w.render();
    key("ArrowLeft", { altKey: true });
    assert(w.treeCursorId() === subId, "Alt+Left on an unloaded entry inside a dir goes to its dir row");
    w.setTreeCursor(U("c.log")); w.render();
    key("ArrowLeft", { altKey: true });
    assert(w.treeCursorId() === U("c.log"), "Alt+Left on a top-level unloaded entry is a no-op");
  });

  await withApp(async (w, d, T) => {
    section("329d. navigating away during the load: it finishes without jumping back; while loading the row stays a cursor stop");
    const zip = await w.openZipSource(new w.File([zipFixture()], "logs.zip"), "logs.zip");
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "tree"; w.render();
    const key = (k, o) => fireKeydown(d, w, k, o);
    const cEntry = zip.entries.find(e => e.name === "c.log");
    let release; const gate = new Promise(r => { release = r; });
    const realExtract = cEntry.extract;
    cEntry.extract = async () => { await gate; return realExtract.call(cEntry); };
    const cId = w.unloadedNavId("zip", zip.id, "c.log");
    w.setTreeCursor(cId); w.render();
    key("ArrowRight");
    await waitFor(() => Object.values(T.state.nodes).some(n => n.zipId === zip.id && n.name === "c.log"));
    assert(T.state.activeId === plain.id && w.treeCursorId() === cId, "loading: main view unchanged, cursor still on the entry");
    assert(w.flattenTreeIds().includes(cId), "the loading entry is still a cursor-only stop in the nav list");
    assert(d.querySelectorAll("#zipList .tree-cursor").length === 1, "and its (loading) row still shows the cursor");
    key("ArrowRight"); // second Right while loading: no second load
    assert(Object.values(T.state.nodes).filter(n => n.zipId === zip.id && n.name === "c.log").length === 1, "Right while loading does not start a second load");
    key("ArrowDown");
    assert(w.isUnloadedNavId(w.treeCursorId()) && w.treeCursorId() !== cId, "Down from the loading entry works (next stop)");
    key("ArrowDown"); key("ArrowDown");
    assert(T.state.activeId === plain.id && w.treeCursorId() === null, "navigated on to the loaded node");
    release();
    const node = await waitFor(() => Object.values(T.state.nodes).find(n => n.zipId === zip.id && n.name === "c.log" && !n.queued && typeof n.loadFraction !== "number" && n.entries.length));
    assert(node, "the load finished");
    await sleep(20);
    assert(T.state.activeId === plain.id, "finishing the load did NOT change the selection");
    assert(w.flattenTreeIds().includes(node.id) && !w.flattenTreeIds().includes(w.unloadedNavId("zip", zip.id, "c.log")), "the loaded entry is now a normal node in the nav list");
  });

  await withApp(async (w, d, T) => {
    section("329e. Right on a non-log entry opens its inline viewer (cursor still there); gone cursor -> viewer registered, not shown");
    const zip = await w.openZipSource(new w.File([zipFixture()], "logs.zip"), "logs.zip");
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "tree"; w.render();
    const key = (k, o) => fireKeydown(d, w, k, o);
    w.setTreeCursor(w.unloadedNavId("zip", zip.id, "notes.png")); w.render();
    key("ArrowRight", { altKey: true });
    await waitFor(() => T.state.inlineViewer);
    assert(T.state.inlineViewer.name === "notes.png" && T.state.activeId === null && w.treeCursorId() === null, "inline viewer shown, cursor cleared");
    assert(zip.inlineViewers.has("notes.png"), "viewer registered under the entry name (row is now an opened row)");
    assert(w.flattenTreeIds().includes(w.viewerNavId("zip", zip.id, "notes.png")) && !w.flattenTreeIds().includes(w.unloadedNavId("zip", zip.id, "notes.png")), "nav list now has the viewer id instead of the unloaded stop");
  });

  await withApp(async (w, d, T) => {
    section("329f. watched folder: unloaded files are stops; Alt+Right loads + activates; Shift skips; click sets cursor + keeps the row for dblclick");
    function fakeDir(name, entries) {
      return {
        kind: "directory", name,
        async *values() {
          for (const [key, val] of Object.entries(entries)) {
            yield { kind: "file", name: key, async getFile() { const b = new w.Blob([val]); b.text = async () => val; return b; } };
          }
        },
      };
    }
    await w.addWatchedFolder(fakeDir("flogs", { "One.log": makeLog(0, 2), "Two.log": makeLog(1, 3) }));
    const folder = T.state.folders[0];
    const plain = await w.addFile("plain.log", makeLog(0, 3), () => {});
    T.state.activeId = plain.id; T.state.focusRegion = "entries"; w.render();
    const key = (k, o) => fireKeydown(d, w, k, o);
    const F = n => w.unloadedNavId("folder", folder.id, n);
    assert(w.flattenTreeIds().join("|") === [F("One.log"), F("Two.log"), plain.id].join("|"), "flatten lists the unloaded folder files before the main tree, got " + w.flattenTreeIds().join("|"));
    key("ArrowUp", { altKey: true });
    assert(w.treeCursorId() === F("Two.log") && T.state.activeId === null, "Alt+Up lands on an unloaded folder file, the previous file is deselected (Group 343)");
    const row = d.querySelector("#folderWatchList .folder-watch-file.tree-cursor");
    assert(row && row.querySelector(".tree-load-badge").textContent === "→ load", "cursor row + badge in the folder listing");
    key("ArrowUp", { altKey: true, shiftKey: true });
    assert(w.treeCursorId() === F("Two.log") && T.state.activeId === null, "Shift+Alt+Up from the stop: nothing but unloaded entries above -> stays");
    T.state.activeId = plain.id; w.setTreeCursor(null); w.render();
    key("ArrowUp", { altKey: true, shiftKey: true });
    assert(w.treeCursorId() === null && T.state.activeId === plain.id, "Shift+Alt+Up from the node skips every unloaded folder file (nothing else above: stays)");
    key("ArrowUp", { altKey: true });
    key("ArrowUp", { altKey: true });
    assert(w.treeCursorId() === F("One.log"), "Alt+Up twice reaches the first file");
    key("ArrowRight", { altKey: true });
    const rec = folder.files.find(f => f.name === "One.log");
    await waitFor(() => rec.nodeId && T.state.nodes[rec.nodeId] && typeof T.state.nodes[rec.nodeId].loadFraction !== "number" && T.state.activeId === rec.nodeId);
    assert(T.state.activeId === rec.nodeId && w.treeCursorId() === null, "Alt+Right loaded One.log and made it active");

    // mouse: click puts the cursor there (focus -> tree) and keeps the row element, so a native dblclick still lands
    T.state.focusRegion = "entries"; w.render();
    const before = [...d.querySelectorAll("#folderWatchList .folder-watch-file")].find(r => r.textContent.includes("Two.log"));
    fireClick(before, w);
    assert(w.treeCursorId() === F("Two.log") && T.state.focusRegion === "tree", "click on an unloaded row sets the cursor and tree focus");
    const after = [...d.querySelectorAll("#folderWatchList .folder-watch-file")].find(r => r.textContent.includes("Two.log"));
    assert(after === before && after.classList.contains("tree-cursor"), "the row element survives the click's render (dblclick keeps working)");
    before.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    const rec2 = folder.files.find(f => f.name === "Two.log");
    await waitFor(() => rec2.nodeId && T.state.nodes[rec2.nodeId]);
    assert(T.state.activeId === rec2.nodeId, "double-click behavior is unchanged (activates on load start)");
  });
}
