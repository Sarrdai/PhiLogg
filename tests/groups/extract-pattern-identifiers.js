// GROUP extract-pattern-identifiers — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP extract-pattern-identifiers — auto-pattern leaves identifiers alone
   Origin: 2026-10-03 (tablet usability test). NUMERIC_TOKEN_RE had no left
   boundary: "job=J-00004" became "job=J[*:int]" (a column of negative ints),
   "v2" -> "v[*:int]", "worker-3" -> "worker[*:int]". A lookbehind now keeps
   a token from starting right after an ASCII letter/digit/underscore/dot or
   after "<letter>-"; CJK neighbours still extract.
   ============================================================ */
group("extract-pattern-identifiers");
await withApp(async (w, d, T) => {
  section("extract-pattern-identifiers a. Identifiers stay literal, real numbers still extract");
  const p = w.buildNumericExtractPattern;
  const eq = (msg, want) => assert(p(msg) === want, JSON.stringify(msg) + " -> " + JSON.stringify(p(msg)) + ", expected " + JSON.stringify(want));
  eq("Move requested axis=4 target=-20.604 job=J-00004", "Move requested axis=[*:int] target=[*:float] job=J-00004");
  eq("job=J-00001", null);
  eq("order O-73592 shipped", null);
  eq("worker-3 started", null);
  eq("running v2", null);
  eq("hash a3f9", null);
  eq("snake_9 x", null);
  eq("range 5-10", "range [*:int]-[*:int]");
  eq("moved to -3.5 after 12 tries", "moved to [*:float] after [*:int] tries");
  eq("took 250ms at 10:30:45", "took [*:time] at [*:time]");
  eq("waited 2.5 s", "waited [*:time]");
  eq("sum 1,234.5", "sum [*:float]");
  eq("注文70328", "注文[*:int]");
  eq("at 2026-01-15T12:30:00 done", "at [*:int]-[*:int]-[*:int]T[*:time] done");
  eq("version 1.2.3", "version [*:float].3");
  eq("(42)", "([*:int])");

  section("extract-pattern-identifiers b. Simulator data: 'Move requested' extracts axis and target, not the job id");
  const [mo] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 300, seed: 3 });
  const f = await w.addFile(mo.name, mo.text, () => {});
  const msg = f.entries.map(e => e.message).find(m => /^Move requested axis=\d+ target=-?[\d.]+ job=J-\d+/.test(m));
  assert(msg, "sanity: the simulator produced a 'Move requested ... job=J-N' line");
  const pat = p(msg);
  assert(/^Move requested axis=\[\*:int\] target=\[\*:float\] job=J-\d+$/.test(pat), "job id stays literal in the auto-pattern, got " + pat);
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", pat);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  const cols = T.extractRowsData.length ? T.extractRowsData[0].values.length : 0;
  assert(cols === 2, "the extraction table has 2 columns (axis, target), no job column, got " + cols);
});
