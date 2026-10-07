// GROUP 238 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 238 — undo/redo: a merged file's Sources breakdown (incl. any
   assigned colors) and a meta-format auto-merge's metaFormatId both
   survive an in-session delete+undo round trip (snapshotSubtree/
   restoreSubtree's file branch).
   ============================================================ */
group(238);
await withApp(async (w, d, T) => {
  section("238a. Undo/redo: node.sources (incl. colors) survives a delete+undo round trip on a manually merged file");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  merged.sources[0].color = "#ff0000";
  const mergedId = merged.id;

  w.deleteFilterNodeWithUndo(mergedId);
  assert(!T.state.nodes[mergedId], "the merged file is gone after delete");

  w.undo();
  const restored = T.state.nodes[mergedId];
  assert(restored, "the merged file is back after undo");
  assert(restored.sources && restored.sources.length === 2, "its Sources breakdown survived the round trip");
  assert(restored.sources[0].color === "#ff0000", "...including the assigned color");
  assert(restored.merged === true, "still flagged as a merged file");
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("238b. Undo/redo: a meta-format auto-merge's metaFormatId survives a delete+undo round trip too");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
  ].join("\n");
  const merged = await w.loadMetaFormatText("mix.log", text, metaFmt);
  const mergedId = merged.id;
  w.deleteFilterNodeWithUndo(mergedId);
  w.undo();
  assert(T.state.nodes[mergedId].metaFormatId === "fmt-demo-app-syslog-meta", "metaFormatId survives the round trip");
}, { demoFormats: true });
