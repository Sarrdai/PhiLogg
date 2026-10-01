// GROUP 257 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 257 — Part B: the create-first merge's single continuous,
   byte-weighted combined progress bar (updateMergeLoadFraction,
   MERGE_STEP_BAR_FRACTION) — replaces the retired (n+1)-segment design
   entirely (see Groups 244/253's rewrites).
   ============================================================ */
group(257);
await withApp(async (w, d, T) => {
  section("257a. updateMergeLoadFraction weights sources by their real size, not a plain average");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  fa.loadFraction = 0.5; // 10x weight, half done
  fb.loadFraction = 0.5; // 1x weight, half done — same fraction as fa, so weighting shouldn't matter here...
  const merged = {
    id: "merge-test-257a", type: "file", name: "m.log", parentId: null, children: [], entries: [],
    merged: true, cacheKey: "k257a", formatId: fa.formatId, sources: [],
    loadSources: [{ id: fa.id, weight: 10 }, { id: fb.id, weight: 1 }],
  };
  T.state.nodes[merged.id] = merged;
  T.state.rootIds.push(merged.id);
  // Unequal PROGRESS this time: the heavier (10x) source is much further
  // along than the lighter one — a plain average would read (0.9+0.1)/2 =
  // 0.5; the correct byte-weighted figure is dominated by the 10x source.
  fa.loadFraction = 0.9;
  fb.loadFraction = 0.1;
  w.updateMergeLoadFraction(merged.id);
  const expectedLoadPhase = (10 * 0.9 + 1 * 0.1) / 11; // = 0.8272...
  const expected = expectedLoadPhase * (1 - 0.1); // MERGE_STEP_BAR_FRACTION = 0.1
  assert(Math.abs(merged.loadFraction - expected) < 1e-9,
    "loadFraction is the byte-weighted average, not a plain (0.9+0.1)/2=0.5 — got " + merged.loadFraction + ", expected " + expected);
});

await withApp(async (w, d, T) => {
  section("257b. the reserved MERGE_STEP_BAR_FRACTION tail: fully-loaded sources but the merge step not yet run stays below 100%");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = {
    id: "merge-test-257b", type: "file", name: "m.log", parentId: null, children: [], entries: [],
    merged: true, cacheKey: "k257b", formatId: fa.formatId, sources: [],
    loadSources: [{ id: fa.id, weight: 1 }, { id: fb.id, weight: 1 }],
  };
  T.state.nodes[merged.id] = merged;
  T.state.rootIds.push(merged.id);
  fa.loadFraction = 1;
  fb.loadFraction = 1;
  w.updateMergeLoadFraction(merged.id);
  assert(merged.loadFraction < 1, "the bar does NOT read 100% while sources are done but the merge-copy step hasn't run yet — got " + merged.loadFraction);
  assert(Math.abs(merged.loadFraction - 0.9) < 1e-9, "...specifically stops at 1 - MERGE_STEP_BAR_FRACTION (0.9) — got " + merged.loadFraction);
});

await withApp(async (w, d, T) => {
  section("257c. a disjoint (quick-merge) real merge still jumps the WHOLE bar to 100% in one step, and no segmented markup exists anywhere");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {}); // disjoint time ranges
  const fb = await w.addFile("b.log", makeLog(1000, 5, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.entries.length === 10, "sanity: the quick/disjoint merge actually ran");
  assert(typeof merged.loadFraction !== "number", "loadFraction is cleared once finished — was set to 1 (the WHOLE bar), never a partial fraction, for the disjoint fast path");
  T.state.activeId = merged.id;
  w.render();
  const row = d.querySelector('.tree-row[data-node-id="' + merged.id + '"]');
  assert(!row.querySelector(".tree-load-track"), "no lingering progress track once done");
  assert(d.querySelectorAll(".tree-load-fill-segment").length === 0, "no segmented-bar markup exists anywhere in the DOM — the retired design is fully gone");
});
