// GROUP 253 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 253 — a create-first merge's own combined progress bar shows
   regardless of "Show Sources" — REWRITTEN this session: the original
   (n+1)-segment design (retired) had this same person-reported bug
   (Show Sources on/default hid all progress on the merge row); the new
   single continuous bar (node.loadFraction via updateMergeLoadFraction)
   reuses the plain .tree-load-fill markup any ordinary file's own bar
   already uses, so this now just confirms that plain bar isn't
   accidentally gated on the setting either.
   ============================================================ */
group(253);
await withApp(async (w, d, T) => {
  section("253. The merge row's combined progress bar shows with Show Sources ON (default) too, not just when off");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  // A synthetic in-progress merge shell — the same shape createMergeShell
  // leaves mid-load — set up directly rather than racing a real async load,
  // to avoid timing flakiness (same idiom Group 244 documents).
  const merged = {
    id: "merge-test-253", type: "file", name: "merged.log", parentId: null, children: [], entries: [],
    merged: true, cacheKey: "k253", loadFraction: 0.4, formatId: fa.formatId,
    sources: [{ id: fa.id, name: fa.name, color: null, count: fa.entries.length }],
    loadSources: [{ id: fa.id, weight: 1 }],
  };
  T.state.nodes[merged.id] = merged;
  T.state.rootIds.push(merged.id);
  T.state.activeId = merged.id;

  w.render();
  const row = d.querySelector('.tree-row[data-node-id="' + merged.id + '"]');
  assert(row, "sanity: the merge row renders");
  const fill = () => row.querySelector(".tree-load-fill");
  assert(fill(), "the merge row shows the plain progress fill even with Show Sources ON (the default)");
  assert(fill().style.width === "40%", "the fill width reflects node.loadFraction directly — got " + fill().style.width);

  fireClick(d.querySelector("#settingsShowSources"), w); // off
  w.render();
  const rowAfter = d.querySelector('.tree-row[data-node-id="' + merged.id + '"]');
  assert(rowAfter.querySelector(".tree-load-fill"), "...and still shows with Show Sources OFF, unchanged");
});
