// GROUP 23 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 23 — Link filter: same-timestamp tie-break (this session,
   2026-08-12, follow-up). Person-reported: linking "Target Real" (anchor)
   to the nearest preceding "Target Vir" produced a match ~11s away instead
   of the entry immediately before it in the Full log, because both shared
   the exact same millisecond timestamp — the log format's finest
   resolution — and findNthOccurrence's strict ts comparison excluded ties
   from "before"/"after" entirely rather than resolving them somehow.
   Confirmed root cause, then implemented exactly the fix requested: break
   ties by log/array order (buildOrderIndexMap + the updated
   findNthOccurrence/findNthOccurrenceExcluding/buildPairEntry). See
   PROJECT.md "Link filter" → "Same-timestamp tie-break".
   ============================================================ */
group(23);
{
  // Mirrors the reported scenario: an earlier burst 11s before containing a
  // "Target Vir" decoy, then a later burst where several lines share ONE
  // exact millisecond, including a "Target Vir" line immediately followed
  // by a "Target Real" line — same shape as the screenshot's
  // MotionServiceBase.cs:243/251 pair.
  function makeTieLog() {
    const lines = [
      `2025-11-18 09:38:05,496\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Target VirtualPosition: OLD decoy"`,
      `2025-11-18 09:38:16,470\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Executed Operator"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"Target VirtualPosition: Source"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"Target RealPosition: (X0)"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 4\t[DoWork]\t"Starting movement to"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 5\t[DoWork]\t"Movement to position was"`,
    ];
    return lines.join("\n") + "\n";
  }

  await withApp(async (w, d, T) => {
    section("23. Link filter: same-timestamp tie-break");
    const f = await w.addFile("a.log", makeTieLog(), () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(real.id, vir.id, "before", 1);
    const res = w.getEntries(link.id);
    assert(res.length === 1, "one pair produced");
    assert(res[0].first.message === "Target VirtualPosition: Source" && res[0].second.message === "Target RealPosition: (X0)",
      "before-search picks the log-adjacent same-ms Vir entry, not the 11s-earlier decoy");
    assert(res[0].second.ts - res[0].first.ts === 0, "the picked pair has a 0ms delta (same burst)");
  });

  // Same tie situation from the other direction ("after"), plus confirming
  // the untied decoy Vir entry still resolves normally (nothing broke
  // for candidates that AREN'T part of a tie).
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeTieLog(), () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(vir.id, real.id, "after", 1); // anchor=Vir, find Real after
    const res = w.getEntries(link.id);
    assert(res.length === 2, "two pairs produced, one per Vir entry");
    const decoyPair = res.find(p => p.first.message.includes("OLD decoy"));
    assert(!!decoyPair && decoyPair.second.message === "Target RealPosition: (X0)",
      "the untied decoy Vir still finds the (only) Real entry normally");
    const burstPair = res.find(p => !p.first.message.includes("OLD decoy"));
    assert(!!burstPair && burstPair.first.message === "Target VirtualPosition: Source" && burstPair.second.message === "Target RealPosition: (X0)",
      "after-search picks the log-adjacent same-ms Real entry, not skipping past the whole tied cluster");
  });

  // Regression guard: no ties at all -> completely unaffected.
  await withApp(async (w, d, T) => {
    const lines = [
      `2025-11-18 09:38:05,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Target VirtualPosition: A"`,
      `2025-11-18 09:38:05,010\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Target RealPosition: A"`,
    ];
    const f = await w.addFile("a.log", lines.join("\n") + "\n", () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(real.id, vir.id, "before", 1);
    const res = w.getEntries(link.id);
    assert(res.length === 1 && res[0].first.message === "Target VirtualPosition: A" && res[0].second.message === "Target RealPosition: A",
      "plain distinct-timestamp case is unaffected by the tie-break change");
  });

  // Tie-break combined with the exclusive-matches option: two Vir entries
  // and two Real entries all sharing one timestamp — exclusivity must still
  // hand out DIFFERENT Vir entries to each Real, using log order to decide
  // which is "nearest" among the tied candidates, same as the plain case.
  await withApp(async (w, d, T) => {
    const lines = [
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"Target VirtualPosition: X1"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"Target VirtualPosition: X2"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"Target RealPosition: X1"`,
      `2025-11-18 09:38:16,484\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"Target RealPosition: X2"`,
    ];
    const f = await w.addFile("a.log", lines.join("\n") + "\n", () => {});
    const real = w.createFilterNode(f.id, "text", "Target Real");
    const vir = w.createFilterNode(f.id, "text", "Target Vir");
    const link = w.createLinkNode(real.id, vir.id, "before", 1, { exclusive: true });
    const res = w.getEntries(link.id);
    assert(res.length === 2, "both Real entries get a match under exclusivity");
    const r1 = res.find(p => p.second.message === "Target RealPosition: X1");
    const r2 = res.find(p => p.second.message === "Target RealPosition: X2");
    assert(!!r1 && r1.first.message === "Target VirtualPosition: X2",
      "Real X1 claims the log-nearest Vir (X2)");
    assert(!!r2 && r2.first.message === "Target VirtualPosition: X1",
      "Real X2 falls back to the remaining Vir (X1) since X2 is already claimed");
  });
}
