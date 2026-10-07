// GROUP 233 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 233 — mergeFiles' disjoint-time-range fast path stays chronological
   even when a virtual stream's own on-disk line order isn't (the real
   risk this feature's auto-merge introduces: format B's syslog blocks
   aren't guaranteed sorted, per the reference sample's own lines 22-23).
   ============================================================ */
group(233);
await withApp(async (w, d, T) => {
  section("233. loadMetaFormatText: auto-merge stays chronological on the disjoint fast path despite an out-of-order syslog block");
  await waitForFormatConfig(T);
  const metaFmt = T.state.logFormats.find(f => f.id === "fmt-demo-app-syslog-meta");

  // Format A entries in the 09:00 hour, format B entries in the 10:00 hour
  // — the two ranges are disjoint, so mergeFiles takes its quick concat
  // path (philogg.html's mergeFiles, ~9315), which trusts each source's
  // OWN order rather than re-sorting. The syslog (format B) lines are
  // written in a deliberately non-chronological on-disk order (b2, b0, b1)
  // — mirroring the real sample's own descending-timestamp syslog block —
  // to prove loadMetaFormatText's per-vnode pre-sort (done before
  // mergeFiles ever sees the vnodes) is what keeps this fast path correct.
  const text = [
    "2025-01-02 09:00:00.000 [] INFO  app.X  - a0",
    "2025-01-02 09:00:01.000 [] INFO  app.X  - a1",
    "2025-01-02 09:00:02.000 [] INFO  app.X  - a2",
    "<13>1 2025-01-02T10:00:02.000000 host app 1 1 [log@1 filename='x.cpp'] b2",
    "<13>1 2025-01-02T10:00:00.000000 host app 1 1 [log@1 filename='x.cpp'] b0",
    "<13>1 2025-01-02T10:00:01.000000 host app 1 1 [log@1 filename='x.cpp'] b1",
  ].join("\n");

  const merged = await w.loadMetaFormatText("disjoint.log", text, metaFmt);
  assert(merged.entries.length === 6, "all 6 lines parsed, got " + merged.entries.length);
  assert(merged.entries.every((e, i, arr) => i === 0 || arr[i - 1].ts <= e.ts),
    "chronological despite the syslog block's own out-of-order on-disk lines");
  assert(merged.entries.map(e => e.message).join(",") === "a0,a1,a2,b0,b1,b2",
    "messages come out in true timestamp order (b0,b1,b2), not on-disk order (b2,b0,b1), got " + merged.entries.map(e => e.message).join(","));
}, { demoFormats: true });
