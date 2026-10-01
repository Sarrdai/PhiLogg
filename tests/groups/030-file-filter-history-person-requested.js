// GROUP 30 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 30 — File filter history (person-requested, this session)
   Per-file filter-tree memory, separate from the session cache: the latest
   filter tree for any real (non-merged) file is kept in a new "fileHistory"
   IndexedDB store, keyed by content fingerprint, and offered back as a
   dismissable ghost preview (never auto-applied) the next time a file with
   matching content is loaded — even in a brand new session. See PROJECT.md
   "File filter history" for the full design writeup.
   ============================================================ */
group(30);
await withApp(async (w, d, T) => {
  section("30a. File filter history: tier-1 match across a simulated new session");
  const idb = new IDBFactory();

  // --- Session 1: load a file, build a filter tree, persist history ---
  const text = makeLog(0, 10, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });
  await withApp(async (w1, d1, T1) => {
    const f = await w1.addFile("a.log", text, () => {});
    T1.state.activeId = f.id;
    const t1 = w1.createFilterNode(f.id, "text", "message 1");
    w1.createFilterNode(t1.id, "after", 0);
    w1.render();
    await w1.persistFileHistoryNow();
    const all = await w1.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
    assert(Array.isArray(all) && all.length === 1, "sanity: exactly one history record written, got " + (all && all.length));
    assert(all[0].filters.length === 1 && all[0].filters[0].filterType === "text" && all[0].filters[0].children.length === 1,
      "sanity: stored record's filter tree has the right shape (1 root, 1 nested child)");
  }, { indexedDB: idb });

  // --- Session 2 (fresh window, same IndexedDB): load the SAME content again ---
  await withApp(async (w2, d2, T2) => {
    const f2 = await w2.addFile("a.log", text, () => {});
    const match = await w2.matchFileHistory(f2);
    assert(match !== null, "matchFileHistory finds the record from the other session");
    assert(match.tier === 1, "exact byte-identical content matches at tier 1, got tier " + (match && match.tier));
    assert(match.record.filters.length === 1 && match.record.filters[0].filterType === "text",
      "matched record carries the original filter tree");

    // --- Ghost preview appears in the tree for a childless file with a match ---
    f2.filterHistoryMatch = { filters: match.record.filters, tier: match.tier };
    w2.render();
    const ghost = d2.querySelector(".tree-ghost");
    assert(ghost !== null, "ghost preview renders under the file when it has no filters yet and a history match exists");
    assert(ghost.querySelectorAll(".tree-ghost-row").length === 2, "ghost preview shows both levels of the saved tree (root + nested child), got " + ghost.querySelectorAll(".tree-ghost-row").length);
    const restoreBtn = ghost.querySelector(".tree-ghost-restore-btn");
    assert(restoreBtn !== null && restoreBtn.textContent === "Restore filters", "restore button present with the expected label");
    assert(ghost.querySelectorAll(".tree-ghost-row")[0].hasAttribute("draggable") === false,
      "sanity: ghost rows carry none of a real tree-row's interactive attributes");

    // --- Cancel dismisses the ghost preview WITHOUT building a filter tree
    // (person-requested, this session: previously the only way to get rid
    // of an unwanted ghost was to create a real filter yourself) ---
    const cancelBtn = ghost.querySelector(".tree-ghost-cancel-btn");
    assert(cancelBtn !== null && cancelBtn.textContent === "Cancel", "a Cancel button sits alongside Restore filters");
    fireClick(cancelBtn, w2);
    assert(d2.querySelector(".tree-ghost") === null, "the ghost preview is gone immediately after Cancel");
    assert(f2.children.length === 0, "Cancel does NOT create any filter — the file's tree stays empty");
    assert(f2.filterHistoryMatch === null, "Cancel clears filterHistoryMatch directly, the same field a real Restore also clears");

    // Re-seed the match (Cancel is a plain dismissal, not "forget forever" —
    // see its own comment) to independently verify the Restore path still
    // works afterward, unaffected by having been cancelled once already.
    f2.filterHistoryMatch = { filters: match.record.filters, tier: match.tier };
    w2.render();
    const restoreBtn2 = d2.querySelector(".tree-ghost-restore-btn");
    assert(restoreBtn2 !== null, "sanity: the ghost preview (and its Restore button) can reappear after being re-matched");

    // --- Clicking Restore materializes the real filter tree and the ghost disappears ---
    fireClick(restoreBtn2, w2);
    assert(f2.children.length === 1, "restore materializes the saved tree onto the file node");
    assert(state_childFilterType(T2, f2) === "text", "materialized root child has the saved filterType");
    assert(d2.querySelector(".tree-ghost") === null, "ghost preview is gone immediately after restoring (file now has real children)");
  }, { indexedDB: idb });
});

// Small helper used only by Group 30 above — reads the filterType of a
// file node's first child via the live state, since w.render() already ran.
function state_childFilterType(T, fileNode) {
  return T.state.nodes[fileNode.children[0]].filterType;
}

await withApp(async (w, d, T) => {
  section("30b. File filter history: tier-2 match against a grown file");
  const idb = new IDBFactory();

  await withApp(async (w1) => {
    const f = await w1.addFile("b.log", makeLog(0, 10), () => {});
    w1.createFilterNode(f.id, "text", "message 1");
    w1.render();
    await w1.persistFileHistoryNow();
  }, { indexedDB: idb });

  await withApp(async (w2) => {
    // Same first 10 lines (makeLog is deterministic per index) plus 5 more —
    // simulates the same tailed file having grown since the earlier session.
    const grown = await w2.addFile("b.log", makeLog(0, 15), () => {});
    const match = await w2.matchFileHistory(grown);
    assert(match !== null, "grown file still matches its earlier (smaller) history snapshot");
    assert(match.tier === 2, "match is tier 2 (window fingerprint), not tier 1 (content differs now), got tier " + (match && match.tier));
    assert(match.record.entryCount === 10, "matched record is the original 10-entry snapshot, not something else");
  }, { indexedDB: idb });

  await withApp(async (w3) => {
    // A file that's merely SIMILAR (not a superset) must not match at all —
    // regression guard against a false positive from a loose window check.
    const unrelated = await w3.addFile("c.log", makeLog(100, 10), () => {});
    const match = await w3.matchFileHistory(unrelated);
    assert(match === null, "an unrelated file's own span doesn't overlap the stored snapshot's span — no match, not even a near-miss");
  }, { indexedDB: idb });
});

await withApp(async (w, d, T) => {
  section("30c. File filter history: exclusions (merged files, empty trees) and ghost auto-hide");

  // --- Merged files are never written to history, even once they have filters ---
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(50, 5), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  w.createFilterNode(merged.id, "text", "message 1");
  w.render();
  await w.persistFileHistoryNow();
  let all = await w.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
  assert(Array.isArray(all) && all.length === 0, "a merged file's filter tree is never written to history, even with real filters, got " + (all && all.length) + " records");

  // --- A file with an empty filter tree doesn't get a record either ---
  const fc = await w.addFile("c.log", makeLog(200, 5), () => {});
  w.render();
  await w.persistFileHistoryNow();
  all = await w.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
  assert(Array.isArray(all) && all.length === 0, "a file with no filters yet contributes no history record, got " + (all && all.length));

  // --- Now give fc a real filter: it DOES get written ---
  w.createFilterNode(fc.id, "text", "message 1");
  w.render();
  await w.persistFileHistoryNow();
  all = await w.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
  assert(Array.isArray(all) && all.length === 1 && all[0].name === "c.log", "a real (non-merged) file with a filter tree IS written to history");

  // --- Ghost auto-hide: creating a NEW filter without restoring hides the ghost ---
  const fd = await w.addFile("d.log", makeLog(300, 5), () => {});
  fd.filterHistoryMatch = { filters: [{ ref: 1, filterType: "text", name: "“old”", inverted: false, children: [] }], tier: 1 };
  w.render();
  assert(d.querySelector(".tree-ghost") !== null, "sanity: ghost preview visible for the childless file with a match");
  w.createFilterNode(fd.id, "text", "brand new filter"); // person creates their own filter, never clicked Restore
  w.render();
  assert(d.querySelector(".tree-ghost") === null, "ghost preview disappears once the file has ANY real filter child, restored or not");

  // BUGFIX (person-reported, this session, 2026-08-14 — superseding what
  // used to be asserted here): the match itself USED TO survive
  // unconditionally ("not deleted — only hidden by the children.length
  // condition"), which is exactly what let it resurface with the OLD,
  // pre-session filters once every real filter was removed again — see the
  // dedicated 30e below for the full round-trip. Once the tree actually has
  // real children, a persist cycle now clears the in-memory match for good.
  await w.persistFileHistoryNow();
  assert(fd.filterHistoryMatch === null, "the stale match IS now cleared once the file has a real filter tree — it can no longer resurface later just because children.length returns to 0");
}, { indexedDB: new IDBFactory() });

/* ============================================================
   GROUP 30e — Bugfix (person-reported via screenshot, this session,
   2026-08-14): the ghost-preview restore banner correctly disappeared when
   creating a new filter, but reappeared — showing the OLD, pre-session
   filters — the moment that new filter was deleted again. Root cause: only
   the "tree has filters" case ever wrote/overwrote a fileHistory record;
   an emptied tree fell through untouched, so the stale record (and the
   never-cleared in-memory filterHistoryMatch) just sat there waiting to
   resurface. Fix: buildFileHistoryRecords now also emits a "delete" for
   any file whose tree was populated earlier THIS SESSION (own filter or a
   Restore) and is empty again — both adding a filter and removing the last
   one now overwrite whatever restore memory came before, exactly as
   requested. See "File filter history" bugfix in PROJECT.md.
   ============================================================ */
group(30);
await withApp(async (w, d, T) => {
  section("30e. File filter history bugfix: emptying a tree overwrites (deletes) the old restore state, both in-session and across a reload");
  const idb = new IDBFactory();

  // --- Session 1: build and persist a filter tree, same as 30a's setup ---
  await withApp(async (w1) => {
    const f = await w1.addFile("e.log", makeLog(0, 10), () => {});
    w1.createFilterNode(f.id, "text", "message 1");
    w1.render();
    await w1.persistFileHistoryNow();
  }, { indexedDB: idb });

  // --- Session 2: load the same content, the ghost preview offers the old tree ---
  await withApp(async (w2, d2, T2) => {
    // Bugfix (this session): render() unconditionally debounces a session-
    // cache meta write (schedulePersistMeta, 400ms — see philogg.html), and
    // that timer is a REAL one that outlives its own window's close under
    // load (jsdom's window.close() does not reliably cancel it — reproduced
    // via parallel-shard runs). Session 1 above never calls persistMetaNow
    // itself, but its own render() still schedules one; under load it can
    // fire well after session 1's withApp() has already returned, landing
    // mid-way through session 2's setup below and writing a real "meta"
    // record into this shared idb — which flips sessionRestoreInProgress on
    // for session 2's OWN boot-time restoreSessionFromCache (same "meta"
    // store, same shared idb) and silently no-ops session 2's own explicit
    // persistFileHistoryNow() call further down (that function's own early-
    // return guard). Barrier on T2.bootRestore first — same "reload" idiom
    // every other group here already uses — so that flag is back to false
    // before any of this session's own actions run, regardless of whether
    // session 1's stray meta write happened to land in time.
    await T2.bootRestore;
    const text = makeLog(0, 10);
    const f2 = await w2.addFile("e.log", text, () => {});
    const match = await w2.matchFileHistory(f2);
    assert(match !== null, "sanity: session 2 finds session 1's stored filter tree");
    f2.filterHistoryMatch = { filters: match.record.filters, tier: match.tier };
    w2.render();
    assert(d2.querySelector(".tree-ghost") !== null, "sanity: ghost preview with the old filters is showing");

    // --- The person creates their OWN filter (never clicked Restore) — ghost hides ---
    const ownFilter = w2.createFilterNode(f2.id, "text", "a brand new filter, unrelated to the old one");
    w2.render();
    await w2.persistFileHistoryNow();
    assert(d2.querySelector(".tree-ghost") === null, "sanity: ghost hidden once the file has its own real filter child");
    let stored = await w2.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
    assert(stored.length === 1 && stored[0].filters[0].value === "a brand new filter, unrelated to the old one",
      "creating a filter overwrites the stored record with the NEW tree, replacing the old one (already worked before this bugfix)");

    // --- THE BUG: the person now deletes that filter — tree is empty again ---
    w2.deleteNode(ownFilter.id);
    w2.render();
    await w2.persistFileHistoryNow();
    assert(f2.children.length === 0, "sanity: the file's filter tree is empty again");
    assert(d2.querySelector(".tree-ghost") === null,
      "BUGFIX: the ghost preview does NOT reappear after deleting the last filter — it used to resurface here showing the OLD pre-session filters");
    assert(f2.filterHistoryMatch === null || f2.filterHistoryMatch === undefined,
      "the in-memory match stays cleared — nothing left for renderNode's children.length===0 condition to show");
    stored = await w2.cacheStoreOp("fileHistory", "readonly", s => s.getAll());
    assert(Array.isArray(stored) && stored.length === 0,
      "BUGFIX: the stored record is REMOVED, not just left stale — emptying the tree is itself the new state, got " + (stored && stored.length) + " records");
  }, { indexedDB: idb });

  // --- Session 3 (fresh window, same IndexedDB): reloading the SAME content
  // now offers nothing to restore, exactly as requested ---
  await withApp(async (w3) => {
    const f3 = await w3.addFile("e.log", makeLog(0, 10), () => {});
    const match = await w3.matchFileHistory(f3);
    assert(match === null, "BUGFIX: reloading the file after all filters were deleted finds no history match — nothing is offered, not even the very first session's filters");
  }, { indexedDB: idb });
});

/* ============================================================
   GROUP 30d — File filter history through the REAL loadFileDescriptors
   entry point. 30a-c all load files via the lower-level addFile() helper
   directly (same as every other group in this suite) and call
   matchFileHistory() themselves — this closes that gap by exercising the
   actual integration point: a real File object read through FileReader
   (readFileWithProgress), then loadFileDescriptors' own persistFileNode +
   matchFileHistory hook attaching the match, with NO test code calling
   matchFileHistory directly. loadFileDescriptors is the single funnel
   behind "Open files…" (#btnOpen's click handler above), drag-and-drop,
   and the File System Access picker — only window.showOpenFilePicker
   itself is unavailable in jsdom (unlike showSaveFilePicker, which Group
   21 stubs), so this calls loadFileDescriptors directly with a descs
   array instead of clicking #btnOpen, exactly the same entry point a real
   drop or the hidden <input type="file"> change handler already reduces
   to. File/FileReader themselves need no stubbing — jsdom implements both
   natively.
   ============================================================ */
group(30);
await withApp(async (w, d, T) => {
  section("30d. File filter history: through the real loadFileDescriptors/FileReader entry point");
  const idb = new IDBFactory();
  const text = makeLog(0, 10, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] });

  // --- Session 1: seed history the same way 30a-c do (addFile is fine
  // here — this session's own job is just to have filtered this content
  // before, not to re-test the loading path itself). ---
  await withApp(async (w1) => {
    const f = await w1.addFile("a.log", text, () => {});
    w1.createFilterNode(f.id, "text", "message 1");
    w1.render();
    await w1.persistFileHistoryNow();
  }, { indexedDB: idb });

  // --- Session 2 (fresh window, same shared IndexedDB): load the SAME
  // content through the REAL browser-facing entry point — an actual File
  // object read via FileReader, exactly like a person picking the file in
  // "Open files…" or dropping it onto the window. ---
  await withApp(async (w2, d2, T2) => {
    const file = new w2.File([text], "a.log", { type: "text/plain" });
    const before = new Set(T2.state.rootIds);
    await w2.loadFileDescriptors([{ file, handle: null }]);

    const newId = T2.state.rootIds.find(id => !before.has(id));
    assert(newId, "loadFileDescriptors registered a new root file via the real FileReader path");
    const node = T2.state.nodes[newId];
    assert(node.entries.length === 10, "file content round-tripped through FileReader.readAsText correctly (10 entries), got " + node.entries.length);
    assert(node.name === "a.log", "file name carried through from the File object");

    // The history hook lives INSIDE loadFileDescriptors, right after
    // persistFileNode — the actual integration point 30a-c never exercise
    // (they call matchFileHistory directly instead of going through here).
    assert(node.filterHistoryMatch !== undefined, "loadFileDescriptors itself attached a filterHistoryMatch — no test code called matchFileHistory directly this time");
    assert(node.filterHistoryMatch.tier === 1, "match found via the real entry point is tier 1 (identical content), got tier " + node.filterHistoryMatch.tier);

    // loadFileDescriptors calls render() itself in its own finally block,
    // so the ghost preview should already be live in the DOM with no
    // test-driven render() call in between.
    const ghost = d2.querySelector(".tree-ghost");
    assert(ghost !== null, "ghost preview is already in the DOM right after loadFileDescriptors returns — no extra render() call needed");
    const restoreBtn = ghost.querySelector(".tree-ghost-restore-btn");
    fireClick(restoreBtn, w2);
    assert(node.children.length === 1, "Restore button works end-to-end for a file loaded via the real entry point");
    assert(d2.querySelector(".tree-ghost") === null, "ghost preview is gone after restoring");
  }, { indexedDB: idb });
});
