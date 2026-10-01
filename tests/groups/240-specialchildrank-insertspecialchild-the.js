// GROUP 240 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 240 — specialChildRank/insertSpecialChild: the tree's auto-managed
   rows always sort Sources, Bookmarks, Notes, Selection 1, Selection 2, ...
   regardless of creation order (this session's rework — previously
   syncBookmarksFilterNode/syncNotesFilterNode/createSelectionFilterNode
   each used their own ad hoc unshift/splice, with no shared rule and no
   awareness of each other — a Selection even unshifted itself ABOVE an
   existing Bookmarks/Notes node).
   ============================================================ */
group(240);
await withApp(async (w, d, T) => {
  section("240a. insertSpecialChild: Sources/Bookmarks/Notes/Selection N always sort in that fixed order, regardless of creation order");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});

  // Bookmark, then note, then two selections, in that creation order —
  // exercises Notes' bookmarks-relative placement AND two selections'
  // ascending (not reverse-unshifted) order in one pass.
  w.toggleBookmark(f.entries[0].id);
  T.state.notes.set(f.entries[1].id, "a note");
  w.syncNotesFilterNode(f.id);
  w.createSelectionFilterNode(f.id, [f.entries[2].id]);
  w.createSelectionFilterNode(f.id, [f.entries[3].id]);

  const names = () => f.children.map(id => T.state.nodes[id].name);
  assert(JSON.stringify(names()) === JSON.stringify(["Bookmarks", "Notes", "Selection 1", "Selection 2"]),
    "no merge on this file, so no Sources — Bookmarks, Notes, Selection 1, Selection 2 in ascending order, got " + JSON.stringify(names()));
});

await withApp(async (w, d, T) => {
  section("240b. insertSpecialChild: a merge's own Sources (created at merge time) still sorts first even when a Bookmark/Selection is added afterward");
  const fb = await w.addFile("b.log", makeLog(100, 3, { msgPrefix: "later" }), () => {});
  const fc = await w.addFile("c.log", makeLog(200, 3, { msgPrefix: "even later" }), () => {});
  const merged = await w.mergeFiles([fb.id, fc.id]);
  w.createSelectionFilterNode(merged.id, [merged.entries[0].id]);
  // Bookmarking directly via state.bookmarks + syncBookmarksFilterNode(merged.id)
  // rather than w.toggleBookmark(entryId): a merged file's entries are the
  // SAME shared objects as its (still-visible, unhidden) sources' own
  // entries (see mergeFiles' comment), so findRootIdForEntry's lookup for
  // a shared entry id is inherently ambiguous between the merge and its
  // sources — a pre-existing property of entry-sharing, not something this
  // ordering test is about; syncing directly on the node under test sidesteps it.
  T.state.bookmarks.set(merged.entries[1].id, { bookmarkedAt: Date.now() });
  w.syncBookmarksFilterNode(merged.id);
  const mergedNames = () => merged.children.map(id => T.state.nodes[id].name);
  assert(JSON.stringify(mergedNames()) === JSON.stringify(["Sources", "Bookmarks", "Selection 1"]),
    "Sources (created at merge time) still sorts before a Bookmark/Selection added afterward, got " + JSON.stringify(mergedNames()));
});
