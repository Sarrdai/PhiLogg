// GROUP 243 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 243 — create-merge-first via loadFileDescriptors: the merge row
   exists and is interactive BEFORE any source finishes loading, sources
   load nested under Sources (never as a separate top-level flash), and
   end up real, tagged, hidden-from-top-level nodes.
   ============================================================ */
group(243);
await withApp(async (w, d, T) => {
  section("243. loadFileDescriptors: merge shell created first, sources load nested/tagged, never a top-level flash");
  w.confirmMergeOnLoad = () => Promise.resolve(true); // auto-answer "Merge" without driving the real dialog
  const fileA = new w.File([makeLog(0, 3)], "a.log", { type: "text/plain" });
  const fileB = new w.File([makeLog(100, 3, { msgPrefix: "later" })], "b.log", { type: "text/plain" });
  await w.loadFileDescriptors([{ file: fileA }, { file: fileB }]);

  assert(T.state.rootIds.length === 3, "merge + 2 sources, all real rootIds, got " + T.state.rootIds.length);
  const merged = T.state.nodes[T.state.activeId];
  assert(merged && merged.merged === true, "the merge is the active node once loading finishes");
  assert(merged.entries.length === 6, "both sources' entries are combined, got " + merged.entries.length);
  const sourceIds = merged.sources.map(s => s.id);
  assert(sourceIds.every(id => {
    const n = T.state.nodes[id];
    return n && n.mergeOwnerId === merged.id && n.mergeSourceHidden === true;
  }), "each source is a real, tagged, hidden-from-top-level node");
  assert(!T.state.rootIds.some(id => id !== merged.id && !sourceIds.includes(id)), "no stray top-level rows besides the merge and its own sources");
});
