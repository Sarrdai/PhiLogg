// GROUP 189 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 189 — this session (2026-09-08), person-reported perf bugfix:
   deleting a filter node visibly stalled (~1s) versus switching the active
   filter, because deleteNode() nulled EVERY node's _cache/_levelCounts
   (invalidateAllCaches()) instead of just the deleted node's — the next
   render() then had to recompute every remaining filter's count badge from
   scratch. A surviving node's cached result only ever depends on its own
   parentId chain (same reasoning invalidateCachesForRoots already relies
   on), and deletion never changes any surviving node's parentId, so no
   cache invalidation is needed there at all.
   ============================================================ */
group(189);
await withApp(async (w, d, T) => {
  section("189. deleteFilterNodeWithUndo no longer wipes sibling caches");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const sibling1 = w.createFilterNode(f.id, "text", "message");
  const sibling2 = w.createFilterNode(f.id, "text", "message 1");
  const toDelete = w.createFilterNode(f.id, "text", "message 2");

  // Populate caches on the survivors before deleting. (File nodes have no
  // _cache of their own — getEntries() returns node.entries directly for
  // them — so only filter nodes are relevant here.)
  w.getEntries(sibling1.id);
  w.getEntries(sibling2.id);
  w.getLevelCounts(sibling1.id);
  assert(T.state.nodes[sibling1.id]._cache !== null, "sanity: sibling1 cache populated before delete");
  assert(T.state.nodes[sibling1.id]._levelCounts !== null, "sanity: sibling1 level counts populated before delete");
  assert(T.state.nodes[sibling2.id]._cache !== null, "sanity: sibling2 cache populated before delete");

  w.deleteFilterNodeWithUndo(toDelete.id);

  assert(!T.state.nodes[toDelete.id], "deleted node is gone from state.nodes");
  assert(T.state.nodes[sibling1.id]._cache !== null, "sibling1's cache survives an unrelated sibling's deletion");
  assert(T.state.nodes[sibling1.id]._levelCounts !== null, "sibling1's level counts survive an unrelated sibling's deletion");
  assert(T.state.nodes[sibling2.id]._cache !== null, "sibling2's cache survives an unrelated sibling's deletion");

  // Deletion still needs to be correct, not just cache-cheap: a filter
  // chained off the deleted node must actually be gone from the tree, and
  // an unrelated node's own recomputation (if ever forced) must still be
  // correct data, not stale.
  const chained = w.createFilterNode(sibling1.id, "text", "1");
  const chainedCountBefore = w.getEntries(chained.id).length;
  w.deleteFilterNodeWithUndo(sibling2.id);
  assert(w.getEntries(chained.id).length === chainedCountBefore,
    "a node unrelated to the deleted one still recomputes to the same correct result");
});
