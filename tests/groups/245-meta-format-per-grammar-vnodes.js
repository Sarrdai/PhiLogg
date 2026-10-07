// GROUP 245 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 245 — meta-format per-grammar vnodes stay real and independently
   usable after the merge finishes (supersedes the old "vnodes are
   deleted" design — see the rewritten Group 232b/236c above).
   ============================================================ */
group(245);
await withApp(async (w, d, T) => {
  section("245. Meta-format vnodes stay clickable/independently selectable after the merge — never deleted");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "2025-01-02 09:00:01.000 [] INFO  app.X  - a1",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
  ].join("\n");
  const merged = await w.loadMetaFormatText("mix.log", text, metaFmt);
  const appVnodeId = merged.sources.find(s => s.name.includes("App")).id;
  const appVnode = T.state.nodes[appVnodeId];
  assert(appVnode.type === "file" && appVnode.entries.length === 2, "the app-grammar vnode is a real file node with its own 2 entries");

  // Select it directly (as if the person clicked its nested row) and
  // confirm it behaves exactly like any other file node — own getEntries,
  // own filter tree.
  T.state.activeId = appVnodeId;
  const filt = w.createFilterNode(appVnodeId, "text", "a0");
  assert(w.getEntries(filt.id).length === 1, "a filter can be added directly onto the vnode and works normally");
  assert(appVnode.children.includes(filt.id), "the vnode has its own independent filter tree, untouched by the merge");
}, { demoFormats: true });
