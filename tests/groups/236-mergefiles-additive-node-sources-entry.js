// GROUP 236 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 236 — mergeFiles' additive node.sources/entry.sourceId stamping,
   for both merge origins: the pre-existing manual multi-file merge
   (disjoint AND overlapping paths) and the new meta-format auto-merge.
   ============================================================ */
group(236);
await withApp(async (w, d, T) => {
  section("236a. mergeFiles: node.sources/entry.sourceId, manual merge, disjoint (quick-concat) path");
  const fa = await w.addFile("a.log", makeLog(0, 3), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 3, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.sources.length === 2, "one Sources entry per source file");
  assert(merged.sources[0].id === fa.id && merged.sources[0].name === "a.log" && merged.sources[0].count === 3,
    "first source's breakdown matches, got " + JSON.stringify(merged.sources[0]));
  assert(merged.sources[1].id === fb.id && merged.sources[1].name === "b.log" && merged.sources[1].count === 3, "second source's breakdown matches");
  assert(merged.sources.every(s => s.color === null), "no color assigned yet");
  assert(merged.entries.filter(e => e.sourceId === fa.id).length === 3 && merged.entries.filter(e => e.sourceId === fb.id).length === 3,
    "every copied entry is stamped with its own source's id");
});

await withApp(async (w, d, T) => {
  section("236b. mergeFiles: node.sources/entry.sourceId, manual merge, overlapping (chunked copy+sort) path");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(2, 5, { msgPrefix: "other" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.entries.filter(e => e.sourceId === fa.id).length === 5 && merged.entries.filter(e => e.sourceId === fb.id).length === 5,
    "sourceId stamping also happens on the chunked copy+sort path");
});

await withApp(async (w, d, T) => {
  section("236c. loadMetaFormatText: node.sources named after target formats, per-grammar vnodes stay real and tagged, entries live in entryIndex");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
  ].join("\n");
  const merged = await w.loadMetaFormatText("mix.log", text, metaFmt);
  assert(merged.sources.map(s => s.name).sort().join(",") === "App log (log4net-style),Syslog (RFC 5424)", "sources named after the target formats, not filenames");
  // Per-grammar vnodes are never deleted (this session's rework) — real,
  // hidden-from-top-level, independently addressable file nodes.
  assert(T.state.rootIds.length === 3, "the merge + its 2 per-grammar vnodes are all real rootIds, got " + T.state.rootIds.length);
  const vnodeIds = T.state.rootIds.filter(id => id !== merged.id);
  assert(vnodeIds.every(id => T.state.nodes[id].mergeOwnerId === merged.id && T.state.nodes[id].mergeSourceHidden === true),
    "each vnode is tagged as this merge's hidden source");
  assert(merged.sources.every(s => vnodeIds.includes(s.id)), "merged.sources[i].id points at the still-live vnode, not a dangling id");
  const sharedId = merged.entries[0].id;
  assert(T.entryIndex[sharedId] === merged.entries[0], "the merged entries stay resolvable via entryIndex");
});
