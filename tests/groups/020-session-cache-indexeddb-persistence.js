// GROUP 20 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 20 — Session cache (IndexedDB persistence across reloads)
   Origin: this session. Simulates a browser reload by passing the SAME
   fake-indexeddb IDBFactory instance into two successive jsdom windows:
   window A builds a session (file + filters incl. an AND combiner with a
   linkedId, highlight colour, bookmark with note, level filter, active
   node) and persists it; window B's normal boot-time restore must bring
   everything back with fresh runtime ids but identical structure.
   ============================================================ */
group(20);
section("20. Session cache: persist in one window, restore in the next");
{
  const factory = new IDBFactory();

  // Log with one multi-line entry (continuation lines after entry 3) to
  // prove rebuildFileText round-trips entry.raw incl. embedded newlines.
  const logLines = makeLog(0, 30).trimEnd().split("\n");
  logLines.splice(4, 0, "  at Foo.Bar()", "  at Baz.Qux()");
  const logText = logLines.join("\n") + "\n";

  let savedEntryRaw = null;   // raw of the bookmarked entry, for cross-window comparison
  let savedMsg3 = null;       // multi-line message of entry 3

  // --- Window A: build + persist ---
  await withApp(async (w, d, T) => {
    const f = await w.addFile("cache.log", logText, () => {});
    savedMsg3 = f.entries[3].message;
    assert(savedMsg3.includes("at Baz.Qux()"), "cache: fixture entry 3 is multi-line");
    assert(typeof f.cacheKey === "string" && f.cacheKey.length > 0, "cache: addFile assigns a cacheKey");

    const t1 = w.createFilterNode(f.id, "text", "message 1");
    const t2 = w.createFilterNode(f.id, "text", "ERROR");
    t2.highlightColor = "#ff0000";
    const combo = w.createAndOrNode([t1.id, t2.id], "and");

    const bEntry = f.entries[5];
    savedEntryRaw = bEntry.raw;
    w.toggleBookmark(bEntry.id);
    T.state.notes.set(bEntry.id, "check this"); // general-purpose note, independent of the bookmark itself
    T.state.levelFilter.add("ERROR"); // a view filter: deliberately NOT persisted (asserted after the restore)
    T.state.activeId = combo.id;

    await w.persistFileNode(f);
    await w.persistMetaNow();

    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta && meta.fileOrder.length === 1, "cache: meta record written with one file");
    assert(meta.bookmarks.length === 1 && meta.bookmarks[0].ordinal === 5,
      "cache: bookmark persisted as ordinal");
    assert(meta.notes.length === 1 && meta.notes[0].ordinal === 5 && meta.notes[0].text === "check this",
      "cache: note persisted as ordinal + text, separately from the bookmark");
    // The auto "Bookmarks" filter node is deliberately NOT part of the
    // persisted filter tree (see syncBookmarksFilterNode) — only the three
    // manually-created top-level filters below are (t1, t2, and the AND
    // combiner — createAndOrNode always places its result directly under
    // the file, not nested under t1, see "Core data model" in PROJECT.md).
    assert(meta.filters[f.cacheKey].length === 3, "cache: the auto 'Bookmarks' node is excluded from the persisted filter tree");
    assert(meta.settings.active && meta.settings.active.ref != null, "cache: active filter persisted as ref");
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec && rec.text.includes("at Baz.Qux()"), "cache: file text persisted incl. continuation lines");
  }, { indexedDB: factory });

  // --- Window B: boot-time restore (same factory = same "disk") ---
  await withApp(async (w, d, T) => {
    await T.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    assert(T.state.rootIds.length === 1, "restore: file came back via boot-time restore");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.name === "cache.log", "restore: file name preserved");
    assert(f.entries.length === 30, "restore: entry count preserved");
    assert(f.entries[3].message === savedMsg3, "restore: multi-line message round-tripped");
    assert(f.entries[5].raw === savedEntryRaw, "restore: entry raw identical after re-parse");

    // 5 children, not 3: the three restored top-level filters (t1, t2, the
    // AND combiner — always placed directly under the file, see "Core data
    // model" in PROJECT.md; createAndOrNode unshifts, same convention as
    // syncBookmarksFilterNode, so exact order isn't guaranteed) PLUS the
    // auto "Bookmarks" AND "Notes" nodes, both re-derived from the restored
    // state.bookmarks/state.notes (see syncBookmarksFilterNode/
    // syncNotesFilterNode, called at the end of restoreSessionFromCache).
    assert(f.children.length === 5, "restore: all three top-level filters back, plus the re-derived auto 'Bookmarks'/'Notes' nodes");
    const childNodes = f.children.map(id => T.state.nodes[id]);
    const autoNode = childNodes.find(n => n.filterType === "bookmarks");
    assert(autoNode && autoNode.locked === true, "restore: the auto 'Bookmarks' node is re-created, not persisted-and-reloaded verbatim");
    const autoNotesNode = childNodes.find(n => n.filterType === "notes");
    assert(autoNotesNode && autoNotesNode.locked === true, "restore: the auto 'Notes' node is re-created, not persisted-and-reloaded verbatim");
    const r1 = childNodes.find(n => n.filterType === "text" && n.value === "message 1");
    const r2 = childNodes.find(n => n.filterType === "text" && n.value === "ERROR");
    assert(r1, "restore: first filter type/value");
    assert(r2 && r2.highlightColor === "#ff0000", "restore: highlight colour preserved");
    const combo = childNodes.find(n => n.filterType === "and");
    assert(combo && combo.baked[0] && combo.baked[0].value === "message 1" && combo.baked[1] && combo.baked[1].value === "ERROR",
      "restore: AND node's bakedA/bakedB round-tripped as plain data, no ref-remapping needed");
    // "message 1" matches entries 1, 10..19; ERROR matches 0,5,10,15,20,25 —
    // intersection is exactly {10, 15}.
    assert(w.getEntries(combo.id).length === 2, "restore: AND node re-evaluates to the correct result");

    assert(T.state.bookmarks.size === 1, "restore: bookmark came back");
    const [bid] = [...T.state.bookmarks.entries()][0];
    assert(bid === f.entries[5].id, "restore: bookmark maps to ordinal 5");
    assert(T.state.notes.size === 1 && T.state.notes.get(f.entries[5].id) === "check this", "restore: note maps to ordinal 5 with its text");
    assert(T.state.levelFilter.size === 0, "restore: the level-chip view filter is not persisted");
    assert(T.state.activeId === combo.id, "restore: active node is the restored AND filter");

    // --- Deletion clears the cached file record ---
    const key = f.cacheKey;
    w.deleteNode(f.id);
    await w.persistMetaNow();
    let rec = { placeholder: true };
    for (let i = 0; i < 20; i++) { // cacheDeleteFile is fire-and-forget
      rec = await w.cacheStoreOp("files", "readonly", s => s.get(key));
      if (!rec) break;
      await sleep(50);
    }
    assert(rec === null || rec === undefined, "delete: cached file record removed with the file node");
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta && meta.fileOrder.length === 0, "delete: meta rewritten with empty file order");
  }, { indexedDB: factory });

  // --- Window C: nothing left to restore ---
  await withApp(async (w, d, T) => {
    await sleep(400);
    assert(T.state.rootIds.length === 0, "restore: emptied cache restores nothing");
  }, { indexedDB: factory });

  // --- Escape hatch: localStorage flag disables persistence entirely ---
  const factory2 = new IDBFactory();
  await withApp(async (w, d, T) => {
    w.localStorage.setItem("philogg-cache-enabled", "0");
    const f = await w.addFile("nocache.log", makeLog(0, 5), () => {});
    await w.persistFileNode(f);
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta === null || meta === undefined, "disabled: no meta written while cache flag is off");
  }, { indexedDB: factory2 });
}
