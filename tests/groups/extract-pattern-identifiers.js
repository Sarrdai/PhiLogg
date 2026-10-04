// GROUP extract-pattern-identifiers — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP extract-pattern-identifiers — auto-pattern turns identifiers into [*:word]
   Origin: 2026-10-03 (tablet usability test) + 2026-10-04 (desktop usability
   test follow-up). NUMERIC_TOKEN_RE had no left boundary: "job=J-00004"
   became "job=J[*:int]" (a column of negative ints). A lookbehind fixed
   that but left such identifiers literal, so Extract on "Move requested
   ... job=J-00004" matched only that one entry. Now a token that starts
   with a letter and contains a digit ("J-00004", "worker-3", "v2", "gen2",
   "a3f9", "snake_9") becomes ONE [*:word]; CJK neighbours, ranges, ISO
   timestamps and durations extract as before.
   ============================================================ */
group("extract-pattern-identifiers");
await withApp(async (w, d, T) => {
  section("extract-pattern-identifiers a. Identifiers become [*:word], real numbers still extract");
  const p = w.buildNumericExtractPattern;
  const eq = (msg, want) => assert(p(msg) === want, JSON.stringify(msg) + " -> " + JSON.stringify(p(msg)) + ", expected " + JSON.stringify(want));
  eq("Move requested axis=4 target=-20.604 job=J-00004", "Move requested axis=[*:int] target=[*:float] job=[*:word]");
  eq("job=J-00001", "job=[*:word]");
  eq("order O-73592 shipped", "order [*:word] shipped");
  eq("worker-3 started", "[*:word] started");
  eq("running v2", "running [*:word]");
  eq("hash a3f9", "hash [*:word]");
  eq("snake_9 x", "[*:word] x");
  eq("GC pause 10.2ms (gen2)", "GC pause [*:time] ([*:word])");
  eq("range 5-10", "range [*:int]-[*:int]");
  eq("moved to -3.5 after 12 tries", "moved to [*:float] after [*:int] tries");
  eq("took 250ms at 10:30:45", "took [*:time] at [*:time]");
  eq("waited 2.5 s", "waited [*:time]");
  eq("sum 1,234.5", "sum [*:float]");
  eq("注文70328", "注文[*:int]");
  eq("at 2026-01-15T12:30:00 done", "at [*:int]-[*:int]-[*:int]T[*:time] done");
  eq("version 1.2.3", "version [*:float].3");
  eq("(42)", "([*:int])");

  section("extract-pattern-identifiers b. Simulator data: 'Move requested' extracts axis, target and job across all entries");
  const [mo] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 300, seed: 3 });
  const f = await w.addFile(mo.name, mo.text, () => {});
  const moves = f.entries.filter(e => /^Move requested axis=\d+ target=-?[\d.]+ job=J-\d+/.test(e.message));
  assert(moves.length > 1, "sanity: the simulator produced several 'Move requested ... job=J-N' lines, got " + moves.length);
  const pat = p(moves[0].message);
  assert(/^Move requested axis=\[\*:int\] target=\[\*:float\] job=\[\*:word\]$/.test(pat), "job id is a [*:word] in the auto-pattern, got " + pat);
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", pat);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  const rows = T.extractRowsData;
  assert(rows.length === moves.length, "the node matches every 'Move requested' entry, got " + rows.length + " of " + moves.length);
  const cols = rows.length ? rows[0].values.length : 0;
  assert(cols === 3, "the extraction table has 3 columns (axis, target, job), got " + cols);
  assert(rows.every(r => typeof r.values[2] === "string" && /^J-\d+$/.test(r.values[2])), "the job column holds strings like J-00001, got " + JSON.stringify(rows[0] && rows[0].values));
});
