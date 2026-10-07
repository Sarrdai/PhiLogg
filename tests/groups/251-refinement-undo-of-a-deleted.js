// GROUP 251 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 251 — Refinement: undo of a deleted create-first merge restores
   the whole entry, including its cascade-deleted hidden sources (live,
   clickable, back in state.rootIds).
   ============================================================ */
group(251);
await withApp(async (w, d, T) => {
  section("251. Delete a create-first merge, then undo — merge AND its hidden sources reappear, live and in state.rootIds");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
  ].join("\n");
  const merged = await w.loadMetaFormatText("mix.log", text, metaFmt);
  const mergedId = merged.id;
  const vnodeIds = T.state.rootIds.filter(id => id !== mergedId).sort();

  w.deleteFilterNodeWithUndo(mergedId);
  assert(!T.state.nodes[mergedId] && vnodeIds.every(id => !T.state.nodes[id]), "sanity: merge + hidden sources all gone before undo");

  w.undo();
  assert(T.state.nodes[mergedId], "the merge is back after undo");
  assert(T.state.rootIds.includes(mergedId), "...in rootIds");
  vnodeIds.forEach(id => {
    assert(T.state.nodes[id], "hidden source " + id + " is back too");
    assert(T.state.rootIds.includes(id), "...and back in rootIds");
    assert(T.state.nodes[id].mergeOwnerId === mergedId, "...still tagged as this merge's source");
  });
  const restored = T.state.nodes[mergedId];
  assert(restored.sources.map(s => s.id).sort().join(",") === vnodeIds.join(","), "restored.sources still references the (now-live-again) same ids");

  // Live and clickable: activating one renders without throwing.
  T.state.activeId = vnodeIds[0];
  let threw = false;
  try { w.render(); } catch (e) { threw = true; }
  assert(!threw, "the restored hidden source renders fine as the active node");
}, { demoFormats: true });
