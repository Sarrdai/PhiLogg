// GROUP 244 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 244 — a create-first merge's own combined progress bar
   (node.loadSources/updateMergeLoadFraction) is cleaned up once the merge
   finishes — REWRITTEN this session: this used to test the retired
   (n+1)-segment design (loadSegmentSourceIds/.tree-load-fill-segment),
   superseded by a single continuous, byte-weighted bar reusing the plain
   .tree-load-fill markup any ordinary file's own bar already uses — see
   Group 257 for the weighted-math/reserved-tail coverage.
   ============================================================ */
group(244);
await withApp(async (w, d, T) => {
  section("244. loadSources is cleared and no progress track lingers once a create-first merge finishes");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
  ].join("\n");
  const merged = await w.loadMetaFormatText("mix.log", text, metaFmt);
  T.state.activeId = merged.id;
  w.render();

  const row = d.querySelector('.tree-row[data-node-id="' + merged.id + '"]');
  assert(row, "sanity: the merge row itself renders");
  // loadSources is deleted once fillMergedEntries finishes (this fixture's
  // tiny fixture loads near-instantly) — assert the MECHANISM (the field
  // existed, is gone once done) rather than catching mid-flight widths,
  // which would be timing-flaky in a synchronous test fixture.
  assert(merged.loadSources === undefined, "loadSources is cleared once the merge finishes (fillMergedEntries)");
  assert(typeof merged.loadFraction !== "number", "loadFraction is cleared too — no lingering progress state");
  assert(!row.querySelector(".tree-load-track"), "no lingering progress bar once loading is fully done");
});
