// GROUP 247 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 247 — the pre-existing manual "Merge N files" bulk action stays
   additive: originals untouched at top level, same nodes additionally
   nested under the new merge's Sources (regression-guard for the
   mergeFiles/createMergeShell split — see also Group 237's own coverage
   of the same shape).
   ============================================================ */
group(247);
await withApp(async (w, d, T) => {
  section("247. performBulkAction('merge'): originals stay exactly as before, same nodes additionally nested under the new merge's Sources");
  const fa = await w.addFile("a.log", makeLog(0, 3), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 3, { msgPrefix: "later" }), () => {});
  T.state.multiSelect = new Set([fa.id, fb.id]);
  w.performBulkAction("merge", [fa.id, fb.id]);
  await waitFor(() => T.state.rootIds.some(id => T.state.nodes[id].merged));
  const merged = T.state.nodes[T.state.rootIds.find(id => T.state.nodes[id].merged)];

  assert(T.state.rootIds.includes(fa.id) && T.state.rootIds.includes(fb.id), "both originals are still real, top-level rootIds — nothing removed");
  assert(fa.mergeOwnerId === merged.id && !fa.mergeSourceHidden, "fa is tagged as a source but explicitly NOT hidden");
  assert(fb.mergeOwnerId === merged.id && !fb.mergeSourceHidden, "same for fb");
  assert(merged.sources.map(s => s.id).sort().join(",") === [fa.id, fb.id].sort().join(","), "the merge's Sources breakdown references the very same nodes");
});
