// GROUP 248 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 248 — deleting a source independently (its own ✕, top-level or
   nested-only) cleans up its owner's `sources` array instead of leaving a
   stale/dangling reference.
   ============================================================ */
group(248);
await withApp(async (w, d, T) => {
  section("248. deleteNode: removing a source independently drops it from its merge's own sources array, no dangling id, no crash rendering Sources");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.sources.length === 2, "sanity: 2 sources before deletion");

  w.deleteFilterNodeWithUndo(fa.id); // the top-level ✕ on a bulk-merge-visible source
  assert(merged.sources.length === 1 && merged.sources[0].id === fb.id, "fa is dropped from merged.sources once its node is deleted");

  T.state.activeId = merged.id;
  let threw = false;
  try { w.render(); } catch (e) { threw = true; }
  assert(!threw, "rendering the Sources node afterward doesn't throw on the now-dangling reference (it was cleaned up, not just defensively skipped)");
  const sourcesId = merged.children[0];
  assert([...(d.querySelectorAll('.tree-row[data-node-id="' + fb.id + '"]'))].length >= 1 &&
    d.querySelectorAll('.tree-row[data-node-id="' + fa.id + '"]').length === 0,
    "fb's nested row still renders, fa's is gone entirely (not a broken/empty row)");
});
