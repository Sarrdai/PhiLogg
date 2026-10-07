// GROUP selection-shortcuts-need-live-node — loaded by philogg.html's
// regression harness (tests/README.md → "Group files").

/* ============================================================
   GROUP selection-shortcuts-need-live-node — bookmark (B), note (Alt+N) and
   Copy for ticket (Ctrl+Shift+C) do nothing while no log view is shown
   Origin: 2026-10-06 (FEATURE_BACKLOG #94). The tree cursor on an unloaded
   entry (placeCursorOnUnloaded) clears activeId but left state.selectedId on
   the hidden file's row, so the three shortcuts acted on a file nobody could
   see. logKeysActive() now also requires a live active node (the same test
   renderMainView uses for its "nothing selected" placeholder).
   ============================================================ */
group("selection-shortcuts-need-live-node");
if (groupSelected()) {
  const simLog = seed => LOGSIM.generateToStrings({ format: "default", entries: 6, seed })[0].text;
  // Hand-built stored ZIP (fixture tooling only, like GROUP 343).
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
  const zipRow = (d, name) => [...d.querySelectorAll("#zipList .folder-watch-file")].find(r => r.querySelector(".folder-watch-file-name").textContent === name);

  section("selection-shortcuts-need-live-node. cursor on an unloaded entry: B / Alt+N / Ctrl+Shift+C do nothing and are not swallowed; with the file shown they work");
  await withApp(async (w, d, T) => {
    let plain = null, writes = 0;
    w.ClipboardItem = function (items) { this.items = items; };
    w.navigator.clipboard.write = () => { writes++; return Promise.resolve(); };
    w.navigator.clipboard.writeText = t => { plain = t; writes++; return Promise.resolve(); };
    const zip = await w.openZipSource(new w.File([storedZip([
      { name: "a.log", data: simLog(1) }, { name: "b.log", data: simLog(2) },
    ])], "logs.zip"), "logs.zip");
    fireDblClick(zipRow(d, "a.log"), w);
    const a = await waitFor(() => { const n = Object.values(T.state.nodes).find(x => x.zipId === zip.id && x.name === "a.log"); return n && typeof n.loadFraction !== "number" && n.entries.length > 0 ? n : null; });
    const key = (k, o) => { const ev = new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o }); d.dispatchEvent(ev); return ev; };
    const noteOpen = () => isVisible(d.querySelector("#noteDialog"), w);
    const entry = a.entries[2];
    T.state.selectedId = entry.id;
    T.state.focusRegion = "entries";
    assert(w.logKeysActive(), "sanity: a.log is shown, log keys are active");

    // Positive case first: all three act on the selected row of the shown file.
    let ev = key("b");
    assert(T.state.bookmarks.has(entry.id) && ev.defaultPrevented, "B bookmarks the selected row while the file is shown");
    key("b");
    assert(!T.state.bookmarks.has(entry.id), "B again removes it");
    ev = key("n", { altKey: true });
    assert(noteOpen() && ev.defaultPrevented, "Alt+N opens the note editor");
    fireClick(d.querySelector("#noteDialogCancel"), w);
    assert(!noteOpen(), "sanity: note editor closed again");
    ev = key("C", { ctrlKey: true, shiftKey: true });
    assert(plain && plain.includes(entry.raw) && ev.defaultPrevented, "Ctrl+Shift+C copies the selected row for a ticket");

    // Cursor onto the closed b.log: the file is deselected, selectedId goes stale.
    w.placeCursorOnUnloaded(w.unloadedNavId("zip", zip.id, "b.log"));
    w.render();
    assert(T.state.activeId === null && T.state.selectedId === entry.id, "sanity: nothing is shown, selectedId still names a.log's row");
    assert(!w.logKeysActive(), "log keys are not active without a live node");
    plain = null; writes = 0;
    const marks = T.state.bookmarks.size, notes = T.state.notes.size;
    ev = key("b");
    assert(!T.state.bookmarks.has(entry.id) && T.state.bookmarks.size === marks && !ev.defaultPrevented, "B: no bookmark, not swallowed");
    ev = key("n", { altKey: true });
    assert(!noteOpen() && T.state.notes.size === notes && !ev.defaultPrevented, "Alt+N: no note editor, not swallowed");
    ev = key("C", { ctrlKey: true, shiftKey: true });
    assert(plain === null && writes === 0 && !ev.defaultPrevented, "Ctrl+Shift+C: nothing copied, not swallowed");
    T.state.logMultiSelect.add(a.entries[0].id); T.state.logMultiSelect.add(a.entries[1].id);
    key("C", { ctrlKey: true, shiftKey: true });
    assert(plain === null && writes === 0, "...also not with marked rows of the hidden file");
    T.state.logMultiSelect.clear();

    // Selecting the file again brings the shortcuts back.
    T.state.activeId = a.id; w.setTreeCursor(null); w.render();
    assert(w.logKeysActive(), "a.log shown again: log keys active");
    key("b");
    assert(T.state.bookmarks.has(entry.id), "B works again");
  });
}
