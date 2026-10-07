// GROUP 250 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 250 — Refinement: deleting a merge cascades to its hidden sources
   (deleteNode's own cascade over node.sources) — a create-first
   (mergeSourceHidden) source has no life outside the merge and is deleted
   too; a bulk-merge-visible (mergeOwnerId only) source survives at top
   level, un-orphaned.
   ============================================================ */
group(250);
await withApp(async (w, d, T) => {
  section("250a. Deleting a create-first merge cascade-deletes its hidden (mergeSourceHidden) sources too");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
  ].join("\n");
  const merged = await w.loadMetaFormatText("mix.log", text, metaFmt);
  const vnodeIds = T.state.rootIds.filter(id => id !== merged.id);
  assert(vnodeIds.length === 2, "sanity: 2 hidden vnode sources exist before deletion");
  assert(vnodeIds.every(id => T.state.nodes[id].mergeSourceHidden), "sanity: both are hidden sources");

  w.deleteFilterNodeWithUndo(merged.id);
  assert(!T.state.nodes[merged.id], "the merge itself is gone");
  vnodeIds.forEach(id => {
    assert(!T.state.nodes[id], "hidden source " + id + " is cascade-deleted, not orphaned");
    assert(!T.state.rootIds.includes(id), "...and removed from rootIds too");
  });
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("250b. Deleting a bulk-merge leaves its (mergeOwnerId-only) sources alive at top level, un-orphaned");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);

  w.deleteFilterNodeWithUndo(merged.id);
  assert(!T.state.nodes[merged.id], "the merge itself is gone");
  assert(T.state.nodes[fa.id] && T.state.nodes[fb.id], "both originals are still alive");
  assert(T.state.rootIds.includes(fa.id) && T.state.rootIds.includes(fb.id), "...and still at top level");
  assert(!fa.mergeOwnerId && !fb.mergeOwnerId, "mergeOwnerId is cleared on both — no longer pointing at a dead merge");
}, { demoFormats: true });
