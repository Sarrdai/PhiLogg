// GROUP 269 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 269 — Per-file aggregates (level counts, minimap bars, widest
   message, ts range) computed while entries are adopted
   Origin: 2026-09-24, load/filter performance session. updateFileAggregate
   catches a file's aggregate up as each parsed batch is adopted, so the
   first render reads it instead of making full passes: getLevelCounts
   (per raw level + format, bucketed when read), the minimap (bucket
   boundaries by binary search when ts are sorted, the whole-file overlay
   from per-level index lists), updateMinimapFullRange and
   computeMaxMessageWidth. It must give exactly what the per-entry passes
   give, catch up incrementally on tail appends and survive rotation, clock
   offsets, merges and format level edits.
   ============================================================ */
group(269);
{
  // What the render produced, and the same render with every aggregate
  // shortcut switched off (the per-entry passes) — must be identical.
  function viewSnapshot(w, T, d) {
    const measured = [];
    const origMeasure = w.measureMsgWidth;
    w.measureMsgWidth = text => { measured.push(text); return origMeasure(text); };
    T.minimapBgCache = null;
    w.render();
    w.measureMsgWidth = origMeasure;
    const rect = d.querySelector("#minimapFullRangeRect");
    return JSON.stringify({ bars: T.minimapBars, measured, rect: rect && rect.getAttribute("x") + "/" + rect.getAttribute("width"),
      counts: w.getLevelCounts(T.state.rootIds[0]) });
  }
  function slowSnapshot(w, T, d) {
    const saved = { b: w.minimapBucketBounds, a: w.aggregateForEntries, f: w.fileAggregate };
    w.minimapBucketBounds = () => null;
    w.aggregateForEntries = () => null;
    T.state.rootIds.forEach(id => { T.state.nodes[id]._levelCounts = null; });
    // getLevelCounts' file branch reads the aggregate — count per entry instead.
    const origCounts = w.getLevelCounts;
    w.getLevelCounts = id => {
      const counts = {};
      for (const e of w.getEntries(id)) { const b = w.levelBucket(e.level, e.formatId); counts[b] = (counts[b] || 0) + 1; }
      return counts;
    };
    try { return viewSnapshot(w, T, d); }
    finally {
      w.minimapBucketBounds = saved.b; w.aggregateForEntries = saved.a; w.getLevelCounts = origCounts;
      T.state.rootIds.forEach(id => { T.state.nodes[id]._levelCounts = null; });
    }
  }
  function fastSnapshot(w, T, d) {
    T.state.rootIds.forEach(id => { T.state.nodes[id]._levelCounts = null; });
    return viewSnapshot(w, T, d);
  }
  // Sorted log with multi-line messages (the longest message is not the one
  // with the longest line), several levels per bucket and a custom level.
  function sortedLog(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const sec = Math.floor(i / 3);
      const ts = "2024-01-15 1" + Math.floor(sec / 3600) + ":" + String(Math.floor(sec / 60) % 60).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0") + "," + String((i % 3) * 100).padStart(3, "0");
      const lvl = ["INFO", "DEBUG", "WARN", "INFO", "ERROR", "NOTICE"][i % 6 === 5 && i % 7 ? 0 : i % 6];
      out.push(ts + "\t" + lvl + "\t\"t\"\tC:\\a.cs\tline " + i + "\t[M]\t\"msg " + i + (i === 700 ? " " + "x".repeat(90) : "") + "\"");
      if (i === 300) out.push("  " + "y".repeat(120));
    }
    return out.join("\n") + "\n";
  }
  let boundsCalls = 0;
  function countBounds(w) {
    const orig = w.minimapBucketBounds;
    if (typeof orig !== "function") return;
    w.minimapBucketBounds = function () { const r = orig.apply(this, arguments); if (r) boundsCalls++; return r; };
  }

  await withApp(async (w, d, T) => {
    section("269a. The aggregate is complete when a load finishes (built during adoption), and every reader matches the per-entry passes");
    const f = await w.addFile("sorted.log", sortedLog(3000), () => {});
    assert(f._agg && f._agg.count === f.entries.length && f._agg.entries === f.entries, "aggregate caught up to all " + f.entries.length + " entries by the end of the parse");
    assert(f._agg && f._agg.sorted === true, "sorted ts recognized");
    T.state.activeId = f.id;
    countBounds(w);
    for (const multi of [false, true]) {
      T.state.multilineMessages = multi;
      for (const mode of ["time", "entries"]) {
        T.minimapBinningMode = mode;
        boundsCalls = 0;
        const fast = fastSnapshot(w, T, d);
        assert(boundsCalls > 0, mode + (multi ? "/multi-line" : "") + ": the minimap took the bucket-boundary path");
        const slow = slowSnapshot(w, T, d);
        assert(fast === slow, mode + (multi ? "/multi-line" : "") + ": minimap bars, full-range box, measured message and level counts identical to the per-entry passes");
      }
    }
    T.state.multilineMessages = false;
    T.minimapBinningMode = "time";
    const measured = JSON.parse(fastSnapshot(w, T, d)).measured;
    assert(measured.length && measured.every(m => m.startsWith("msg 300\n  y")), "single-line mode measures the longest whole message");
    T.state.multilineMessages = true;
    const measuredMulti = JSON.parse(fastSnapshot(w, T, d)).measured;
    assert(measuredMulti.every(m => m === "  " + "y".repeat(120)), "multi-line mode measures the longest line");
    T.state.multilineMessages = false;
  });

  await withApp(async (w, d, T) => {
    section("269b. Unsorted and NaN timestamps: time-mode minimap falls back to the per-entry pass, results still identical");
    const lines = makeLog(0, 400).trimEnd().split("\n");
    lines.splice(100, 0, lines.splice(300, 1)[0]); // one entry out of order
    lines[50] = lines[50].replace(/^2024-01-15 10:00:50,000/, "not-a-time");
    const f = await w.addFile("unsorted.log", lines.join("\n") + "\n", () => {});
    assert(f._agg && f._agg.sorted === false, "out-of-order / NaN ts: not sorted");
    T.state.activeId = f.id;
    for (const mode of ["time", "entries"]) {
      T.minimapBinningMode = mode;
      assert(fastSnapshot(w, T, d) === slowSnapshot(w, T, d), mode + ": identical to the per-entry passes");
    }
    T.minimapBinningMode = "time";
  });

  await withApp(async (w, d, T) => {
    section("269c. Tail appends are folded in incrementally — including a continuation line that grows the last entry into the longest");
    const f = await w.addFile("tail.log", sortedLog(500), () => {});
    T.state.activeId = f.id;
    w.render();
    const agg = f._agg;
    f.tail = { handle: w.urlTailHandle("philogg://local/1/tail.log"), offset: 0, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
    w.appendTailText(f, "2024-01-15 11:00:00,000\tERROR\t\"t\"\tC:\\a.cs\tline 1\t[M]\t\"late\"\n" + "  " + "z".repeat(400) + "\n");
    w.onTailChange([f.id]);
    const fast = fastSnapshot(w, T, d);
    assert(f._agg === agg && agg.count === f.entries.length, "the same aggregate object caught up (" + (agg && agg.count) + "/" + f.entries.length + ")");
    assert(fast === slowSnapshot(w, T, d), "after the append: identical to the per-entry passes");
    assert(JSON.parse(fast).measured.every(m => m.includes("z".repeat(400))), "the grown last entry is now the widest");
  });

  await withApp(async (w, d, T) => {
    section("269d. Rotation, clock offset, merge and a format's level edit leave no stale aggregate behind");
    const f = await w.addFile("a.log", sortedLog(600), () => {});
    T.state.activeId = f.id;
    w.render();
    // Clock offset: every ts moved.
    w.applyClockOffset(f.id, 3600000);
    assert(fastSnapshot(w, T, d) === slowSnapshot(w, T, d), "clock offset: identical to the per-entry passes");
    assert(f._agg.minTs === f.entries[0].ts, "clock offset: the aggregate's ts range moved with the entries");
    // Rotation: a new, shorter array.
    const oldAgg = f._agg;
    f.entries = [];
    w.appendTailText(Object.assign(f, { tail: { pending: "" } }), sortedLog(40));
    w.invalidateCachesForRoots([f.id]);
    const fast = fastSnapshot(w, T, d);
    assert(f._agg !== oldAgg && f._agg.count === 40, "rotation: a fresh aggregate over the new entries");
    assert(fast === slowSnapshot(w, T, d), "rotation: identical to the per-entry passes");
    delete f.tail;
    // Merge: mergeFiles sorts its copy in place.
    const g = await w.addFile("b.log", makeLog(30, 300, { levels: ["WARN", "INFO"] }), () => {});
    const m = await w.mergeFiles([f.id, g.id]);
    const merged = m && m.id ? m : T.state.nodes[T.state.rootIds[T.state.rootIds.length - 1]];
    T.state.activeId = merged.id;
    const fm = fastSnapshot(w, T, d);
    assert(merged._agg && merged._agg.count === merged.entries.length, "merge: aggregate covers the merged entries");
    assert(fm === slowSnapshot(w, T, d), "merge: identical to the per-entry passes");
    // A format's level list edited after load: counts re-bucket when read.
    T.state.activeId = f.id;
    const fmt = { id: "fmt-269", name: "269", mode: "regex", builtin: false, edited: false, pattern: "", tsFormat: "yyyy-MM-dd HH:mm:ss,SSS",
      regex: "^(?<ts>\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d,\\d{3})\\t(?<level>\\w+)\\t(?<message>.*)$",
      levels: [{ value: "NOTICE", name: "NOTICE", color: null }, { value: "INFO", name: "INFO", color: null }] };
    T.state.logFormats.push(fmt);
    w.invalidateFormatCompileCache();
    const h = await w.addFile("c.log", "2024-01-15 10:00:00,000\tNOTICE\tx\n2024-01-15 10:00:01,000\tINFO\ty\n2024-01-15 10:00:02,000\tNOTICE\tz\n", () => {}, "fmt-269");
    const before = w.getLevelCounts(h.id);
    assert(before.NOTICE === 2, "custom level counted in its own bucket, got " + JSON.stringify(before));
    fmt.levels = [{ value: "INFO", name: "INFO", color: null }];
    w.invalidateFormatCompileCache();
    w.invalidateAllCaches();
    const after = w.getLevelCounts(h.id);
    const expected = {};
    for (const e of h.entries) { const b = w.levelBucket(e.level, e.formatId); expected[b] = (expected[b] || 0) + 1; }
    assert(JSON.stringify(after) === JSON.stringify(expected) && !after.NOTICE, "after the edit: re-bucketed, " + JSON.stringify(after));
  });
}
