// GROUP 242 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 242 — the "Show Sources" setting (default true): a pure display
   toggle, persisted to localStorage, never touching node.sources/
   mergeOwnerId data itself.
   ============================================================ */
group(242);
await withApp(async (w, d, T) => {
  section("242. Show Sources: defaults true, toggling off hides the row without touching data, toggling back on restores it, persists");
  await waitFor(() => T.state.logFormats.length > 0); // boot settle, same as waitForFormatConfig elsewhere
  assert(w.pillGet(d.querySelector("#settingsShowSources")) === true, "the toggle reflects the true default on a fresh boot");

  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  T.state.activeId = merged.id;
  w.render();
  const sourcesId = merged.children[0];
  assert(d.querySelector('.tree-row[data-node-id="' + sourcesId + '"]'), "Sources row renders by default");

  fireClick(d.querySelector("#settingsShowSources"), w);
  assert(!d.querySelector('.tree-row[data-node-id="' + sourcesId + '"]'), "toggling off hides the row immediately");
  assert(merged.sources.length === 2 && merged.children.includes(sourcesId), "...but the underlying node/data are untouched");
  assert(w.localStorage.getItem("philogg-show-sources") === "0", "persisted to localStorage");

  fireClick(d.querySelector("#settingsShowSources"), w);
  assert(d.querySelector('.tree-row[data-node-id="' + sourcesId + '"]'), "toggling back on restores the row, same data");
  assert(w.localStorage.getItem("philogg-show-sources") === "1", "persisted back");
});
