// GROUP find-root-id-for-entry-map — loaded by philogg.html's regression
// harness (tests/README.md -> "Group files").

/* ============================================================
   GROUP find-root-id-for-entry-map — findRootIdForEntry is a map lookup that
   stays correct across every path that changes which entries a root holds
   Origin: 2026-10-06 (FEATURE_BACKLOG #100). The old implementation scanned
   every root's entries (about 5 ms of each bookmark/note toggle on a 300k
   entry file). It now reads a lazily built entry id -> root id map that
   validates itself against each root's entries array + length, so no
   entry-mutating path has to invalidate it. Every check compares the answer
   with a naive scan of state.rootIds (the old behavior: first root in
   rootIds order that holds the entry).
   ============================================================ */
group("find-root-id-for-entry-map");
if (groupSelected()) {
  const sim = seed => LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 60, seed })[0].text;
  const naive = (T, id) => {
    for (const rootId of T.state.rootIds) { const r = T.state.nodes[rootId]; if (r && r.entries.some(e => e.id === id)) return rootId; }
    return null;
  };
  // Every entry of every root (plus an unknown id) answers like the naive scan.
  const agree = (w, T, label, extra = []) => {
    const ids = new Set(extra);
    for (const rootId of T.state.rootIds) for (const e of T.state.nodes[rootId].entries) ids.add(e.id);
    ids.add("e-does-not-exist");
    let bad = 0, first = "";
    for (const id of ids) { const got = w.findRootIdForEntry(id), want = naive(T, id); if (got !== want) { bad++; first = first || id + ": " + got + " != " + want; } }
    assert(bad === 0, label + ": findRootIdForEntry agrees with a scan for all " + ids.size + " ids (" + bad + " differ, " + first + ")");
  };

  section("find-root-id-for-entry-map a. plain files, merge (shared entry objects), delete + undo of the merge and of a source");
  await withApp(async (w, d, T) => {
    const S = T.state;
    const fa = await w.addFile("a.log", sim(41), () => {});
    const fb = await w.addFile("b.log", sim(42), () => {});
    agree(w, T, "two files");
    assert(w.findRootIdForEntry(fa.entries[3].id) === fa.id && w.findRootIdForEntry(fb.entries[3].id) === fb.id, "each entry names its own file");
    assert(w.findRootIdForEntry("e-does-not-exist") === null, "an unknown id gives null");

    const merged = await w.mergeFiles([fa.id, fb.id]);
    assert(merged && merged.entries.includes(fa.entries[0]), "sanity: the merge shares the sources' entry objects");
    agree(w, T, "after mergeFiles");
    // A bookmark on a shared entry goes through the same lookup (toggleBookmark -> findRootIdForEntry).
    const shared = fa.entries[5];
    w.toggleBookmark(shared.id);
    const owner = S.nodes[w.findRootIdForEntry(shared.id)];
    assert(owner.children.some(id => S.nodes[id].filterType === "bookmarks"), "the bookmark landed under the root the lookup names");

    // Delete the merge and undo.
    w.deleteFilterNodeWithUndo(merged.id);
    agree(w, T, "merge deleted", merged.entries.map(e => e.id));
    w.undo();
    assert(S.nodes[merged.id], "sanity: the undo brought the merge back");
    agree(w, T, "merge restored by undo");
    // Delete a source (the merge keeps its entries) and undo.
    w.deleteFilterNodeWithUndo(fa.id);
    agree(w, T, "source deleted", fa.entries.map(e => e.id));
    assert(S.nodes[w.findRootIdForEntry(fa.entries[2].id)] !== undefined && w.findRootIdForEntry(fb.entries[2].id) !== null, "an entry of the surviving file still resolves");
    w.undo();
    agree(w, T, "source restored by undo");
    // Root order matters for a shared entry: reorder the roots, the first holder in the new order wins.
    S.rootIds.reverse();
    agree(w, T, "roots reordered");
    S.rootIds.reverse();
    agree(w, T, "roots reordered back");
  });

  section("find-root-id-for-entry-map b. tail appends and a truncated/replaced entry list");
  await withApp(async (w, d, T) => {
    const fa = await w.addFile("a.log", sim(43), () => {});
    const fb = await w.addFile("b.log", sim(44), () => {});
    agree(w, T, "before the tail");
    assert(w.findRootIdForEntry(fa.entries[0].id) === fa.id, "warm the map");
    fa.tail = { pending: "" };
    const before = fa.entries.length;
    // More simulator lines of the same format (a few of them), appended like a tail tick would.
    const chunk = sim(47).split("\n").slice(0, 6).join("\n") + "\n";
    assert(w.appendTailText(fa, chunk) === true, "sanity: the tail appended entries");
    const fresh = fa.entries.slice(before);
    assert(fresh.length >= 1, "sanity: new entries exist (" + fresh.length + ")");
    assert(fresh.every(e => w.findRootIdForEntry(e.id) === fa.id), "tail-appended entries resolve to their file");
    agree(w, T, "after a tail append", fresh.map(e => e.id));
    // A bookmark on a tail-appended entry creates the Bookmarks node under the right file.
    w.toggleBookmark(fresh[0].id);
    assert(fa.children.some(id => T.state.nodes[id].filterType === "bookmarks") && !fb.children.some(id => T.state.nodes[id].filterType === "bookmarks"),
      "the bookmark on a tailed entry synced the right file's Bookmarks node");
    // Truncation (a rolled-back parse): the removed entries belong to no root any more.
    const dropped = fa.entries.splice(before);
    agree(w, T, "after truncating the tail again", dropped.map(e => e.id));
    assert(dropped.every(e => w.findRootIdForEntry(e.id) === null), "removed entries resolve to null");
    // Rotation: the whole array is replaced.
    const old = fa.entries;
    fa.entries = old.slice(0, 10);
    agree(w, T, "after the entries array was replaced", old.map(e => e.id));
    fa.entries = old;
    agree(w, T, "after the original array is back");
  });

  section("find-root-id-for-entry-map c. session restore");
  {
    const factory = new IDBFactory();
    await withApp(async (w, d, T) => {
      const f = await w.addFile("cache.log", sim(45), () => {});
      const g = await w.addFile("cache2.log", sim(46), () => {});
      agree(w, T, "before the reload");
      await w.persistFileNode(f); await w.persistFileNode(g);
      await w.persistMetaNow();
    }, { indexedDB: factory });
    await withApp(async (w, d, T) => {
      await T.bootRestore;
      assert(T.state.rootIds.length === 2, "restore: both files came back");
      agree(w, T, "after the session restore");
      const [r0, r1] = T.state.rootIds.map(id => T.state.nodes[id]);
      assert(w.findRootIdForEntry(r0.entries[4].id) === r0.id && w.findRootIdForEntry(r1.entries[4].id) === r1.id, "restored entries name their restored file");
      w.toggleBookmark(r1.entries[4].id);
      assert(r1.children.some(id => T.state.nodes[id].filterType === "bookmarks"), "a bookmark after the restore lands under the right restored file");
    }, { indexedDB: factory });
  }
}
