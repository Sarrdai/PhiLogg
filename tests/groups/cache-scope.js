// GROUP cache-scope - loaded by philogg.regression.test.js (tests/README.md ->
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, LOGSIM, ...) is in scope.

/* ============================================================
   GROUP cache-scope - a bookmark/note change or a single-node edit only
   throws away the caches that really depend on it
   Origin: 2026-10-02 (performance: toggling a bookmark cost ~0.6 s on a
   300k-entry file because syncBookmarksFilterNode/syncNotesFilterNode,
   updateFilterNode, mute, invert, move, ... all called invalidateAllCaches(),
   after which renderTree() recomputed EVERY node's filter chain). A node's
   result depends only on its parentId chain, except for the nodes that read
   state.bookmarks / state.notes: a "bookmarks"/"notes" node, and any
   and/or/link node whose baked conditions (nested to any depth) mention one.
   Part a is the safety net and is deliberately independent of HOW the
   invalidation is scoped: after EVERY operation of a long scripted sequence,
   every filter node's result and level counts as served by whatever caches
   survived are compared with a forced invalidateAllCaches() recompute. A
   difference is a stale cache - worse than a slow one. Part b pins the
   scoping itself (which caches keep their array identity, which are
   dropped), part c the merged-root case (a merge shares its sources' entry
   objects, so a bookmark on one of them reaches nodes under the merge too).
   ============================================================ */
group("cache-scope");

// One sim file with a deliberately varied filter tree. Returns the file node
// and every node of interest by name.
const buildCacheScopeTree = async (w, T) => {
  const S = T.state;
  const [simFile] = LOGSIM.generateToStrings({ scenarios: ["basic", "motion", "bursts", "gaps"], entries: 320, seed: 11 });
  const f = await w.addFile(simFile.name, simFile.text, () => {});
  S.activeId = f.id;
  w.render();
  const pick = (needle, k = 0) => f.entries.filter(e => e.message.includes(needle))[k];
  const mk = (parent, text, inverted) => w.createFilterNode(parent.id, "text", text, !!inverted);
  const N = { f };
  // plain text filters: a 3-level chain, a sibling, an inverted one, a muted one with a child
  N.tick = mk(f, "Scheduler tick");
  N.jobs = mk(N.tick, "jobs pending");
  N.jobsLeaf = mk(N.jobs, "1");
  N.tickSib = mk(N.tick, "7 jobs");
  N.queue = mk(f, "Queue depth");
  N.queueMuted = mk(N.queue, "items");
  N.queueMutedChild = mk(N.queueMuted, "1");
  w.toggleMuteWithUndo([N.queueMuted.id]);
  N.heart = mk(f, "Heartbeat", true);
  N.lvl = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
  N.tr = w.createFilterNode(f.id, "timerange", { from: f.entries[40].ts, to: f.entries[200].ts });
  N.gap = w.createGapNode(N.lvl.id, { ms: 300, per: null });
  N.move = mk(f, "Move requested");
  N.reach = mk(f, "Position reached");
  N.linkPlain = w.createLinkNode(N.move.id, N.reach.id, "after", 1);
  N.sel = w.createSelectionFilterNode(f.id, f.entries.slice(5, 9).map(e => e.id));
  // bookmarks and notes (creates the auto nodes)
  [pick("Heartbeat", 0), pick("Scheduler tick", 1), pick("Move requested", 0), pick("Position reached", 0), pick("Retrying", 0)]
    .forEach(e => w.toggleBookmark(e.id));
  w.setNoteAndRepaint(pick("Queue depth", 0).id, "first note");
  w.setNoteAndRepaint(pick("Heartbeat", 2).id, "second note");
  N.bm = f.children.map(id => S.nodes[id]).find(n => n.filterType === "bookmarks");
  N.notes = f.children.map(id => S.nodes[id]).find(n => n.filterType === "notes");
  // children of the auto nodes (their results derive from state.bookmarks/notes)
  N.bmChild = mk(N.bm, "Heartbeat");
  N.bmCtx = w.createContextNode(N.bm.id, 500, 500);
  N.notesChild = mk(N.notes, "Queue");
  // combiners that bake the Bookmarks / Notes node, nested to several levels
  N.orBm = w.createAndOrNode([N.bm.id, N.tick.id], "or");
  N.andBm = w.createAndOrNode([N.bm.id, N.lvl.id], "and");
  N.nestAnd = w.createAndOrNode([N.orBm.id, N.queue.id], "and");   // baked: and[ or[bookmarks, text], text ]
  N.nest3 = w.createAndOrNode([N.nestAnd.id, N.move.id], "or");    // one level deeper still
  N.linkBm = w.createLinkNode(N.bm.id, N.reach.id, "after", 1);    // baked bookmarks reference side
  N.linkNest = w.createLinkNode(N.linkBm.id, N.queue.id, "after", 1); // baked link whose side bakes bookmarks
  N.notesOr = w.createAndOrNode([N.notes.id, N.tick.id], "or");
  // a combiner over plain nodes only: bakes snapshots, depends on neither Set
  N.orPlain = w.createAndOrNode([N.tick.id, N.queue.id], "or");
  return { N, f, pick };
};

// Served-vs-fresh comparison over every filter node of every file.
const cacheScopeDiffer = (w, T) => {
  const S = T.state;
  const snap = () => {
    const o = {};
    for (const n of Object.values(S.nodes)) {
      if (n.type !== "filter") continue;
      o[n.id] = w.getEntries(n.id).map(e => e.id).join("|") + "#" + JSON.stringify(w.getLevelCounts(n.id));
    }
    return o;
  };
  // Returns the names of nodes whose served result differs from a full
  // recompute. Leaves every cache freshly (and correctly) populated, so the
  // next operation starts from a fully cached tree - which is what makes a
  // too-narrow invalidation observable.
  return () => {
    const served = snap();
    w.invalidateAllCaches();
    const fresh = snap();
    return Object.keys(fresh).filter(id => served[id] !== fresh[id]).map(id => (S.nodes[id].name || S.nodes[id].filterType) + " [" + S.nodes[id].filterType + "]");
  };
};

await withApp(async (w, d, T) => {
  section("cache-scope a. differential: served results equal a forced full recompute after every operation");
  const S = T.state;
  const { N, f, pick } = await buildCacheScopeTree(w, T);
  const diffAll = cacheScopeDiffer(w, T);
  const check = label => {
    const bad = diffAll();
    assert(bad.length === 0, label + ": every node equals a forced recompute" + (bad.length ? " - STALE: " + bad.join(", ") : ""));
  };
  const alive = id => !!S.nodes[id];

  check("fresh tree");
  assert(N.bm && N.notes && N.bmChild && N.bmCtx && N.orBm && N.andBm && N.nestAnd && N.nest3 && N.linkBm && N.linkNest && N.notesOr,
    "the tree has the Bookmarks/Notes nodes, children below them and the nested combiners/links baking them");
  assert(w.getEntries(N.orBm.id).length > 0 && w.getEntries(N.bm.id).length === 5, "the Bookmarks node matches the 5 bookmarked entries and the or node is not empty");

  // The checker itself must be able to see a stale cache: change the Set
  // behind the app's back (no sync, no invalidation) and the Bookmarks node
  // and its dependants must be reported. Then the app's own sync path must
  // bring everything back in line.
  {
    const extra = pick("Order", 0);
    S.bookmarks.set(extra.id, { bookmarkedAt: 1 });
    const bad = diffAll();
    assert(bad.length >= 3 && bad.some(n => n.includes("[bookmarks]")) && bad.some(n => n.includes("[or]")),
      "control: a bookmark added without any invalidation is reported as stale (" + bad.join(", ") + ")");
    // the full recompute inside diffAll repaired every cache; undo the raw change through the app's own path
    S.bookmarks.delete(extra.id);
    w.syncBookmarksFilterNode(f.id);
    check("after undoing the raw change through syncBookmarksFilterNode");
  }

  // ---- bookmarks: toggle on/off, never the last one
  w.toggleBookmark(pick("Move requested", 3).id);      check("bookmark added");
  w.toggleBookmark(pick("Move requested", 3).id);      check("same bookmark removed again");
  w.toggleBookmark(pick("Order", 0).id);               check("another bookmark added");
  w.toggleBookmark(pick("Slow query", 0).id);          check("a fourth extra bookmark added");
  // a bookmark on an entry the nested combiners' OTHER side also matches, so their results really change
  w.toggleBookmark(pick("Queue depth", 2).id);
  assert(w.getEntries(N.nestAnd.id).some(e => e.id === pick("Queue depth", 2).id), "the nested and node (or[bookmarks, tick] and queue) picks up a bookmarked 'Queue depth' entry");
  check("bookmark on an entry the nested combiners match");
  w.toggleBookmark(pick("Queue depth", 2).id);
  assert(!w.getEntries(N.nestAnd.id).some(e => e.id === pick("Queue depth", 2).id), "... and drops it again");
  check("that bookmark removed again");

  // ---- notes: add / edit / remove (never the last one)
  w.setNoteAndRepaint(pick("Retrying", 1).id, "added");        check("note added");
  w.setNoteAndRepaint(pick("Retrying", 1).id, "edited");       check("note edited");
  w.setNoteAndRepaint(pick("Retrying", 1).id, "");             check("note removed (others remain)");

  // ---- single-node edits
  w.toggleMuteWithUndo([N.tick.id]);                   check("mute a mid-chain node (tick)");
  w.toggleMuteWithUndo([N.tick.id]);                   check("unmute it");
  w.toggleInvertWithUndo(N.queue.id);                  check("invert queue (has a muted child chain and baked snapshots of it)");
  w.toggleInvertWithUndo(N.queue.id);                  check("remove the inversion");
  w.updateFilterNodeWithUndo(N.jobs.id, "text", "pending", false);          check("updateFilterNode on a mid-chain node");
  w.updateFilterNodeWithUndo(N.jobs.id, "text", "jobs pending", true);      check("updateFilterNode: inverted via edit");
  w.updateFilterNodeWithUndo(N.jobsLeaf.id, "text", "2", false);            check("updateFilterNode on a leaf");
  w.updateTimeRangeFilterNodeWithUndo(N.tr.id, f.entries[10].ts, f.entries[120].ts); check("time range edited");
  w.updateGapNodeWithUndo(N.gap.id, { ms: 1000, per: null });               check("gap edited");
  w.updateFilterNodeWithUndo(N.lvl.id, "level", ["ERROR"], false);          check("level filter edited (its gap child, andBm and the combiners baking it)");
  w.addRowsToSelectionFilter(N.sel.id, f.entries.slice(20, 25).map(e => e.id)); check("rows added to the selection filter");
  w.toggleMuteWithUndo([N.bmChild.id]);                check("mute a child of the Bookmarks node");
  w.toggleMuteWithUndo([N.queue.id, N.tick.id]);       check("mute two nodes in one step (one has a muted child)");
  w.toggleBookmark(pick("Heartbeat", 5).id);           check("bookmark toggled while nodes under it are muted");
  w.toggleMuteWithUndo([N.queue.id, N.tick.id, N.bmChild.id], false); check("unmute them all");

  // ---- moves
  assert(w.moveFilterNodeWithUndo(N.jobs.id, N.queue.id) === N.jobs.id, "move: the jobs subtree goes under queue");
  check("subtree moved under another chain");
  assert(w.moveFilterNodeWithUndo(N.heart.id, N.bm.id) === N.heart.id, "move: a node goes under the Bookmarks node");
  check("a node moved under the Bookmarks node");
  w.toggleBookmark(pick("Order", 0).id);               check("bookmark toggled with a foreign node under the Bookmarks node");
  assert(w.moveFilterNodeWithUndo(N.heart.id, N.f.id) === N.heart.id, "move: it goes back to the file");
  check("moved back out of the Bookmarks node");
  assert(w.moveFilterNodeWithUndo(N.jobs.id, N.tick.id) === N.jobs.id, "move: the jobs subtree goes back under tick");
  check("subtree moved back");

  // ---- undo / redo stay on the global sweep; they must still leave nothing stale behind the scoped ops
  for (let i = 0; i < 6; i++) { w.undo(); check("undo " + (i + 1)); }
  for (let i = 0; i < 6; i++) { w.redo(); check("redo " + (i + 1)); }

  // ---- the Bookmarks node disappears with the LAST bookmark and comes back with the next one
  for (const id of [...S.bookmarks.keys()]) {
    const wasLast = S.bookmarks.size === 1;
    w.toggleBookmark(id);
    check("bookmark removed" + (wasLast ? " (the LAST one: the Bookmarks node and everything below it is gone)" : ""));
  }
  assert(!alive(N.bm.id) && !alive(N.bmChild.id) && !alive(N.bmCtx.id), "the Bookmarks node and its children are deleted with the last bookmark");
  assert(alive(N.orBm.id) && alive(N.linkNest.id) && w.getEntries(N.orBm.id).length > 0, "the combiners that baked it survive (now matching nothing on the bookmarks side)");
  w.toggleBookmark(pick("Scheduler tick", 4).id);      check("first bookmark again: the node is re-created");
  w.toggleBookmark(pick("Position reached", 2).id);    check("second bookmark");

  // ---- notes: remove the last one, add again
  for (const id of [...S.notes.keys()]) { w.setNoteAndRepaint(id, ""); check("note removed"); }
  assert(!alive(N.notes.id) && !alive(N.notesChild.id), "the Notes node and its children are deleted with the last note");
  assert(alive(N.notesOr.id), "the combiner that baked the Notes node survives");
  w.setNoteAndRepaint(pick("Queue depth", 3).id, "again"); check("note added again: the Notes node is re-created");

  // ---- the paths that stay on the global sweep, for completeness
  S.activeId = N.queue.id;
  const unpacked = w.unpackAndOrLinkNode(N.orPlain.id);
  assert(unpacked === N.orPlain.id, "unpack runs");
  check("unpack of a combiner");
  const shift = w.applyClockOffset(f.id, 1500);
  assert(shift === true, "clock offset applies");
  check("clock offset applied to the file");
});

await withApp(async (w, d, T) => {
  section("cache-scope b. scope: only the real dependants lose their cache");
  const S = T.state;
  const { N, f, pick } = await buildCacheScopeTree(w, T);
  const diffAll = cacheScopeDiffer(w, T);
  const assertClean = label => { const bad = diffAll(); assert(bad.length === 0, label + ": nothing stale" + (bad.length ? " - " + bad.join(", ") : "")); };
  const cacheOf = id => S.nodes[id]._cache;
  const take = ids => { const o = {}; ids.forEach(id => { o[id] = cacheOf(id); }); return o; };
  const same = (before, ids, label) => assert(ids.every(id => before[id] && cacheOf(id) === before[id]),
    label + ": cache kept (same array): " + ids.filter(id => !(before[id] && cacheOf(id) === before[id])).map(id => S.nodes[id].name).join(", "));
  const dropped = (before, ids, label) => assert(ids.every(id => cacheOf(id) !== before[id]),
    label + ": cache dropped/recomputed: " + ids.filter(id => cacheOf(id) === before[id]).map(id => S.nodes[id].name).join(", "));
  const cleared = (ids, label) => assert(ids.every(id => S.nodes[id]._cache === null && S.nodes[id]._levelCounts === null),
    label + ": cache and level counts cleared: " + ids.filter(id => !(S.nodes[id]._cache === null && S.nodes[id]._levelCounts === null)).map(id => S.nodes[id].name).join(", "));
  const ids = (...nodes) => nodes.map(n => n.id);

  // nodes by dependency class (muted queueMuted never caches, so it is not tracked as a value)
  const unrelated = ids(N.tick, N.jobs, N.jobsLeaf, N.tickSib, N.queue, N.queueMutedChild, N.heart, N.lvl, N.tr, N.gap, N.move, N.reach, N.linkPlain, N.sel, N.orPlain);
  const bmDependants = ids(N.bm, N.bmChild, N.bmCtx, N.orBm, N.andBm, N.nestAnd, N.nest3, N.linkBm, N.linkNest);
  const noteDependants = ids(N.notes, N.notesChild, N.notesOr);
  assertClean("fresh tree");

  // bakedMentions: the helper that decides who depends on a Set
  {
    const mention = (node, kind) => w.bakedMentions(node, kind);
    assert(mention(N.bm, "bookmarks") && !mention(N.bm, "notes"), "bakedMentions: the Bookmarks node mentions bookmarks only");
    assert(mention(N.orBm, "bookmarks") && !mention(N.orBm, "notes"), "bakedMentions: an or node with a baked bookmarks condition");
    assert(mention(N.nestAnd, "bookmarks") && mention(N.nest3, "bookmarks"), "bakedMentions: through baked.baked, two and three levels deep");
    assert(mention(N.linkBm, "bookmarks") && mention(N.linkNest, "bookmarks"), "bakedMentions: through bakedA, and through a link baked into a link");
    assert(mention(N.notesOr, "notes") && !mention(N.notesOr, "bookmarks"), "bakedMentions: a notes combiner mentions notes only");
    assert(!mention(N.orPlain, "bookmarks") && !mention(N.orPlain, "notes") && !mention(N.tick, "bookmarks") && !mention(N.linkPlain, "notes"),
      "bakedMentions: plain nodes and combiners over plain nodes mention nothing");
    assert(!mention(null, "bookmarks") && !mention({ filterType: "or", baked: [] }, "bookmarks"), "bakedMentions: tolerates null and an empty baked list");
  }

  // bookmark membership change that keeps the node (not the first/last one)
  {
    const before = take(unrelated.concat(bmDependants, noteDependants));
    S.bookmarks.set(pick("Order", 0).id, { bookmarkedAt: 1 });
    w.syncBookmarksFilterNode(f.id);
    same(before, unrelated.concat(noteDependants), "bookmark added, node kept: unrelated and notes-dependent nodes");
    cleared(bmDependants, "bookmark added, node kept: the Bookmarks node, what hangs below it and every combiner/link baking it");
    assertClean("after the sync-only change");
  }
  // the same through the real entry point, which also repaints the tree (recomputing the dropped caches)
  {
    const before = take(unrelated.concat(bmDependants, noteDependants));
    w.toggleBookmark(pick("Order", 1).id);
    same(before, unrelated.concat(noteDependants), "toggleBookmark: unrelated and notes-dependent nodes keep their cache");
    dropped(before, bmDependants, "toggleBookmark: bookmark-dependent nodes were recomputed by the repaint");
    assertClean("after toggleBookmark");
  }
  // note edit that keeps the node
  {
    const before = take(unrelated.concat(bmDependants, noteDependants));
    w.setNoteAndRepaint(pick("Queue depth", 0).id, "edited note");
    same(before, unrelated.concat(bmDependants), "note edit: unrelated and bookmark-dependent nodes keep their cache");
    dropped(before, noteDependants, "note edit: the Notes node, its child and the combiner baking it were recomputed");
    assertClean("after the note edit");
  }
  // a note added/removed on a second entry (not crossing the first/last threshold)
  {
    const before = take(unrelated.concat(bmDependants, noteDependants));
    w.setNoteAndRepaint(pick("Retrying", 1).id, "one more");
    same(before, unrelated.concat(bmDependants), "note added: unrelated and bookmark-dependent nodes keep their cache");
    dropped(before, noteDependants, "note added: notes-dependent nodes were recomputed");
    assertClean("after the note add");
  }
  // deleting and re-creating the Bookmarks node must not touch unrelated nodes either
  {
    const before = take(unrelated.concat(noteDependants));
    const survivors = ids(N.orBm, N.andBm, N.nestAnd, N.nest3, N.linkBm, N.linkNest);
    const beforeSurv = take(survivors);
    for (const id of [...S.bookmarks.keys()]) w.toggleBookmark(id);
    assert(!S.nodes[N.bm.id], "last bookmark removed: the Bookmarks node is gone");
    same(before, unrelated.concat(noteDependants), "Bookmarks node deleted: unrelated and notes-dependent nodes keep their cache");
    dropped(beforeSurv, survivors, "Bookmarks node deleted: the combiners/links that baked it were recomputed");
    assertClean("after deleting the Bookmarks node");
    const before2 = take(unrelated.concat(noteDependants));
    const beforeSurv2 = take(survivors);
    w.toggleBookmark(pick("Scheduler tick", 4).id);
    assert(f.children.some(id => S.nodes[id].filterType === "bookmarks"), "first bookmark: the Bookmarks node is created again");
    same(before2, unrelated.concat(noteDependants), "Bookmarks node created: unrelated and notes-dependent nodes keep their cache");
    dropped(beforeSurv2, survivors, "Bookmarks node created: the combiners/links that baked it were recomputed");
    assertClean("after re-creating the Bookmarks node");
  }

  // single-node edits only drop the node's own subtree
  const all = () => unrelated.concat(noteDependants, ids(N.orBm, N.andBm, N.nestAnd, N.nest3, N.linkBm, N.linkNest));
  {
    const before = take(all());
    w.updateFilterNodeWithUndo(N.jobsLeaf.id, "text", "2", false);
    cleared(ids(N.jobsLeaf), "edit of a leaf: the leaf");
    same(before, all().filter(id => id !== N.jobsLeaf.id), "edit of a leaf: its parent, siblings and everything else keep their cache");
    assertClean("after editing a leaf");
  }
  {
    const before = take(all());
    w.updateFilterNodeWithUndo(N.jobs.id, "text", "pending", false);
    cleared(ids(N.jobs, N.jobsLeaf), "edit of a mid-chain node: the node and its descendant");
    same(before, all().filter(id => id !== N.jobs.id && id !== N.jobsLeaf.id), "edit of a mid-chain node: ancestor, sibling and unrelated nodes keep their cache");
    assertClean("after editing a mid-chain node");
  }
  {
    const before = take(all());
    w.toggleInvertWithUndo(N.queue.id);
    cleared(ids(N.queue, N.queueMuted, N.queueMutedChild), "invert: the node and its descendants");
    same(before, all().filter(id => id !== N.queue.id && id !== N.queueMutedChild.id), "invert: everything else, including combiners that baked a snapshot of it, keeps its cache");
    assertClean("after invert");
  }
  {
    const before = take(all());
    w.toggleMuteWithUndo([N.tick.id]);
    cleared(ids(N.tick, N.jobs, N.jobsLeaf, N.tickSib), "mute: the node and its descendants");
    same(before, all().filter(id => ![N.tick, N.jobs, N.jobsLeaf, N.tickSib].some(n => n.id === id)), "mute: everything else keeps its cache");
    assertClean("after mute");
    w.toggleMuteWithUndo([N.tick.id]);
    assertClean("after unmute");
  }
  {
    const before = take(all());
    assert(w.moveFilterNodeWithUndo(N.jobs.id, N.queue.id) === N.jobs.id, "move runs");
    cleared(ids(N.jobs, N.jobsLeaf), "move: the moved subtree");
    same(before, all().filter(id => id !== N.jobs.id && id !== N.jobsLeaf.id), "move: old parent, new parent and everything else keep their cache");
    assertClean("after move");
  }
  {
    const before = take(all());
    w.updateTimeRangeFilterNodeWithUndo(N.tr.id, f.entries[10].ts, f.entries[120].ts);
    cleared(ids(N.tr), "time range edit: the node");
    same(before, all().filter(id => id !== N.tr.id), "time range edit: everything else keeps its cache");
    assertClean("after the time range edit");
  }
  {
    const before = take(all());
    w.updateGapNodeWithUndo(N.gap.id, { ms: 1000, per: null });
    cleared(ids(N.gap), "gap edit: the node");
    same(before, all().filter(id => id !== N.gap.id), "gap edit: everything else keeps its cache");
    assertClean("after the gap edit");
  }
  {
    const before = take(all());
    w.addRowsToSelectionFilter(N.sel.id, f.entries.slice(30, 33).map(e => e.id));
    cleared(ids(N.sel), "selection extended: the node");
    same(before, all().filter(id => id !== N.sel.id), "selection extended: everything else keeps its cache");
    assertClean("after extending the selection");
  }
  // a no-op addRows (nothing new) must not drop anything
  {
    const before = take(all());
    w.addRowsToSelectionFilter(N.sel.id, f.entries.slice(30, 33).map(e => e.id));
    same(before, all(), "selection extended by nothing new: nothing dropped");
  }

  // invalidateNodeSubtreeCaches: the node and every descendant, never an ancestor
  {
    const withBase = id => { S.nodes[id]._tailBase = { cache: [], stable: 0, parentStable: 0 }; S.nodes[id]._levelCounts = { INFO: 1 }; };
    [N.tick, N.tickSib, N.jobs, N.jobsLeaf].forEach(n => withBase(n.id));
    const parentCache = cacheOf(N.tick.id);
    w.invalidateNodeSubtreeCaches(N.jobs.id);
    const gone = n => n._cache === null && n._tailBase === null && n._levelCounts === null;
    assert(gone(S.nodes[N.jobs.id]) && gone(S.nodes[N.jobsLeaf.id]), "invalidateNodeSubtreeCaches clears _cache, _tailBase and _levelCounts of the node and its descendant");
    assert(cacheOf(N.tick.id) === parentCache && S.nodes[N.tick.id]._tailBase && S.nodes[N.tick.id]._levelCounts, "... and leaves the ancestor untouched");
    assert(cacheOf(N.tickSib.id) && S.nodes[N.tickSib.id]._tailBase && S.nodes[N.tickSib.id]._levelCounts, "... and the sibling untouched");
    w.invalidateNodeSubtreeCaches("no-such-node"); // must not throw
    w.invalidateAllCaches();
    assertClean("after the manual cache fiddling");
  }

  // invalidateCachesDependingOnState walks below a dependant only via invalidateNodeSubtreeCaches
  {
    const bmNode = f.children.map(id => S.nodes[id]).find(n => n.filterType === "bookmarks");
    assert(bmNode, "the Bookmarks node exists again");
    const before = take(unrelated.concat(noteDependants));
    w.invalidateCachesDependingOnState(f.id, "bookmarks");
    same(before, unrelated.concat(noteDependants), "invalidateCachesDependingOnState(bookmarks): unrelated and notes nodes untouched");
    assert(S.nodes[bmNode.id]._cache === null, "invalidateCachesDependingOnState(bookmarks): the Bookmarks node is dropped");
    w.invalidateCachesDependingOnState(f.id, "notes");
    assert(noteDependants.every(id => S.nodes[id]._cache === null), "invalidateCachesDependingOnState(notes): the Notes node, its child and the notes combiner are dropped");
    assertClean("after calling both directly");
  }
});

await withApp(async (w, d, T) => {
  section("cache-scope c. a merge shares its sources' entry objects: a bookmark on one reaches the nodes under the merge");
  const S = T.state;
  const sim = seed => LOGSIM.generateToStrings({ scenarios: ["basic", "motion"], entries: 120, seed })[0].text;
  const fa = await w.addFile("a.log", sim(31), () => {});
  const fb = await w.addFile("b.log", sim(32), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  S.activeId = merged.id;
  w.render();
  const diffAll = cacheScopeDiffer(w, T);
  const mText = w.createFilterNode(merged.id, "text", "Heartbeat");
  const aText = w.createFilterNode(fa.id, "text", "Heartbeat");
  const first = fa.entries.find(e => e.message.includes("Heartbeat"));
  assert(first && merged.entries.includes(first), "the merge holds the very same entry object as its source");
  // the Bookmarks node under the merge is only ever created by a restore/sync of the merge itself
  w.toggleBookmark(first.id);
  w.syncBookmarksFilterNode(merged.id);
  const mBm = merged.children.map(id => S.nodes[id]).find(n => n.filterType === "bookmarks");
  assert(mBm, "the merge has its own Bookmarks node");
  const mOr = w.createAndOrNode([mBm.id, mText.id], "or");
  assert(mOr, "an or node under the merge bakes the Bookmarks node");
  assert(diffAll().length === 0, "fresh");
  const second = fa.entries.filter(e => e.message.includes("Retrying"))[0];
  const aUnrelated = S.nodes[aText.id]._cache;
  w.toggleBookmark(second.id); // findRootIdForEntry names the source, not the merge
  assert(S.nodes[aText.id]._cache === aUnrelated, "the unrelated text filter under the source keeps its cache");
  const bad = diffAll();
  assert(bad.length === 0, "nodes under the merge are not left stale by a bookmark on a shared entry" + (bad.length ? " - " + bad.join(", ") : ""));
  w.setNoteAndRepaint(second.id, "shared");
  const mNotes = merged.children.map(id => S.nodes[id]).find(n => n.filterType === "notes");
  w.syncNotesFilterNode(merged.id);
  const mNotes2 = merged.children.map(id => S.nodes[id]).find(n => n.filterType === "notes");
  assert(mNotes2 || mNotes, "the merge's Notes node exists after a sync");
  w.setNoteAndRepaint(second.id, "shared again");
  assert(diffAll().length === 0, "nodes under the merge are not left stale by a note on a shared entry");
});
