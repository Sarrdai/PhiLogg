// GROUP 203 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 203 — Quick merge (Machbarkeitsuntersuchung feasibility session,
   2026-09-12): mergeFiles skips the chunked copy-with-yield + O(n log n)
   sort when the sources' time ranges are disjoint (a plain concat is
   already sorted), falling back to the original copy+sort path whenever
   ranges overlap at all (equal-boundary timestamps count as overlap).
   Also adds probeFileTimeRange, a head+tail-only file time-range probe
   for a future folder-watch minimap, which never loads/parses a file in
   full.
   ============================================================ */
group(203);
await withApp(async (w, d, T) => {
  section("203a. mergeFiles: quick merge (concat) when source time ranges are disjoint");

  const fa = await w.addFile("a.log", makeLog(0, 3), () => {}); // 10:00:00-02
  const fb = await w.addFile("b.log", makeLog(100, 3, { msgPrefix: "later" }), () => {}); // 10:01:40-42, disjoint from fa
  const merged = await w.mergeFiles([fb.id, fa.id]); // pass out of chronological order on purpose
  assert(merged.entries.length === 6, "quick merge still combines all entries, got " + merged.entries.length);
  assert(merged.entries.every((e, i, arr) => i === 0 || arr[i - 1].ts <= e.ts),
    "quick-merge output is chronologically ordered even though source order was reversed");
  assert(merged.entries[0].message.startsWith("message"), "chronologically-first source's (fa) entries come first");
  assert(merged.entries[3].message.startsWith("later"), "chronologically-second source's (fb) entries follow");
});

await withApp(async (w, d, T) => {
  section("203b. mergeFiles: overlapping time ranges still fall back to the full copy+sort path");

  const fa = await w.addFile("a.log", makeLog(0, 5), () => {}); // 10:00:00-04
  const fb = await w.addFile("b.log", makeLog(2, 5, { msgPrefix: "other" }), () => {}); // 10:00:02-06, overlaps fa
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.entries.length === 10, "overlapping merge still combines both files, got " + merged.entries.length);
  assert(merged.entries.every((e, i, arr) => i === 0 || arr[i - 1].ts <= e.ts), "overlapping merge result is sorted");
});

await withApp(async (w, d, T) => {
  section("203c. mergeFiles: an equal boundary timestamp between sources counts as overlap, not disjoint");

  // fa's last entry and fb's first entry share the exact same timestamp
  // (10:00:02) — a naive "sort by range.min, check strictly-less" check
  // must treat this as overlapping, not disjoint, or the two entries at
  // the shared timestamp could come out in the wrong relative order.
  const fa = await w.addFile("a.log", makeLog(0, 3), () => {}); // 10:00:00-02
  const fb = await w.addFile("b.log", makeLog(2, 3, { msgPrefix: "boundary" }), () => {}); // 10:00:02-04
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.entries.length === 6, "combines both files, got " + merged.entries.length);
  assert(merged.entries.every((e, i, arr) => i === 0 || arr[i - 1].ts <= e.ts), "boundary-equal case still produces sorted output");
});

await withApp(async (w, d, T) => {
  section("203d. probeFileTimeRange: reads only head+tail bytes to learn a file's time range without full parsing");

  // Minimal Blob-like fixture: only .size and .slice(start, end).text() are
  // used by probeFileTimeRange. Same "ASCII text ~ byte offsets" shortcut
  // Group 12's tailing fixture uses.
  function makeProbeFile(text) {
    return {
      size: text.length,
      slice(start, end) {
        const sliced = text.slice(start, end === undefined ? text.length : end);
        return { text: async () => sliced };
      },
    };
  }

  const log = makeLog(0, 5); // 10:00:00 .. 10:00:04
  const expectedFirst = new Date(2024, 0, 15, 10, 0, 0, 0).getTime();
  const expectedLast = new Date(2024, 0, 15, 10, 0, 4, 0).getTime();

  const range = await w.probeFileTimeRange(makeProbeFile(log));
  assert(range, "range found for a normal multi-entry file");
  assert(range.first === expectedFirst, "first timestamp matches the file's first entry, got " + range.first + " expected " + expectedFirst);
  assert(range.last === expectedLast, "last timestamp matches the file's last entry (read from EOF backward), got " + range.last + " expected " + expectedLast);

  const singleRange = await w.probeFileTimeRange(makeProbeFile(makeLog(0, 1)));
  assert(singleRange && singleRange.first === singleRange.last, "single-entry file: first and last coincide");

  assert((await w.probeFileTimeRange(makeProbeFile(""))) === null, "empty file: no range found, returns null");

  const withTrailingContinuation = makeProbeFile(log + "    at SomeMethod() in Foo.cs:line 42\n");
  const contRange = await w.probeFileTimeRange(withTrailingContinuation);
  assert(contRange && contRange.last === expectedLast,
    "a trailing continuation line (stack trace, no timestamp) doesn't confuse the tail probe — it still finds the last real header line");
});
