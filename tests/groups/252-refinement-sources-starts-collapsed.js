// GROUP 252 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 252 — Refinement: "Sources" starts collapsed immediately after
   any merge load completes (create-first and the old bulk "Merge N
   files" action alike) — expanded only while still loading.
   ============================================================ */
group(252);
await withApp(async (w, d, T) => {
  section("252a. fillMergedEntries collapses the Sources node once a bulk merge completes");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  const sourcesNode = T.state.nodes[merged.children[0]];
  assert(sourcesNode.collapsed === true, "Sources is collapsed right after mergeFiles completes");
}, { demoFormats: true });

await withApp(async (w, d, T) => {
  section("252b. fillMergedEntries collapses the Sources node once a create-first (meta-format) merge completes");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
  ].join("\n");
  const merged = await w.loadMetaFormatText("mix.log", text, metaFmt);
  const sourcesNode = T.state.nodes[merged.children[0]];
  assert(sourcesNode.collapsed === true, "Sources is collapsed right after a create-first merge completes");
}, { demoFormats: true });
