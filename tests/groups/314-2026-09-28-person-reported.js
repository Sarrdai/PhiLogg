// GROUP 314 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 314 — 2026-09-28 (person-reported): entries sharing one exact
   timestamp keep their original log order wherever a view re-sorts by
   time. Root cause: every re-sort is a stable `a.ts - b.ts`, so ties keep
   the order they were COLLECTED in — a meta-format merge collected stream
   by stream (all default lines, then all syslog lines), an "or" union
   A-matches then B-matches, a multi-selection copy in click order, and the
   temp anchor went after its whole tied cluster. Now: the meta-format
   split records each header line's physical position (headerOrds) and the
   merge copies in that order; the rest tie-break on buildOrderIndexMap via
   chronoComparator. Sample data: log-sim's opt-in "ties" scenario (control-
   loop ticks of 3-6 steps at one millisecond, alternating grammars under
   the mixed format).
   ============================================================ */
group(314);
await withApp(async (w, d, T) => {
  section("314a. Meta-format merge: same-timestamp entries from both grammars stay in file order");
  await waitForFormatConfig(T);
  await logsimRegister(w, T, "mixed", "fmt-sim-syslog");
  const meta = { id: "fmt-sim-meta", name: "Sim meta", mode: "meta", targetFormatIds: ["fmt-sim-syslog", "fmt-default"], builtin: false, edited: false, createdAt: 0 };
  T.state.logFormats.push(meta);
  const [file] = LOGSIM.generateToStrings({ format: "mixed", scenarios: ["ties", "basic"], entries: 400, seed: 3 });
  const gen = logsimEntries2("mixed", ["ties", "basic"], 400, 3);
  assert(!LOGSIM.normalizeScenarios("all").includes("ties") && !LOGSIM.normalizeScenarios(["all", "-gaps"]).includes("ties") && LOGSIM.normalizeScenarios("ties").join() === "ties",
    "log-sim: 'ties' is opt-in — never part of 'all', so every existing seed's output stays unchanged");
  assert(gen.some((e, i) => i > 0 && e.ts === gen[i - 1].ts && !!e.syslog !== !!gen[i - 1].syslog), "sanity: the sample has same-timestamp neighbours in different grammars");
  const streams = w.splitTextByMetaFormat(file.text, meta);
  assert(streams.every(s => s.headerOrds.length === s.text.split("\n").length) && streams.reduce((n, s) => n + s.headerOrds.length, 0) === 400,
    "the split records one physical header position per stream line (no continuation lines in this sample)");
  const merged = await w.loadMetaFormatText(file.name, file.text, meta);
  const got = merged.entries.map(e => e.message), want = gen.map(e => e.msg);
  assert(merged.entries.length === 400 && got.every((m, i) => m === want[i]),
    "merged order equals the file's own line order, first difference at " + got.findIndex((m, i) => m !== want[i]));
  assert(merged.sources.length === 2 && merged.entries.every(e => merged.sources.some(s => s.id === e.sourceId && T.state.nodes[s.id].entries.includes(e))),
    "every entry still carries the sourceId of the stream it came from");
});

await withApp(async (w, d, T) => {
  section("314b. OR filter (direct and nested/baked), multi-selection copy, temp anchor: ties in log order");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["ties"], entries: 120, seed: 5 });
  const f = await w.addFile(file.name, file.text, () => {});
  const pos = new Map(f.entries.map((e, i) => [e.id, i]));
  const inLogOrder = list => list.every((e, i) => i === 0 || pos.get(list[i - 1].id) < pos.get(e.id));
  const step2 = w.createFilterNode(f.id, "text", "step 2/");
  const step1 = w.createFilterNode(f.id, "text", "step 1/");
  const or = w.createAndOrNode([step2.id, step1.id], "or"); // A = step 2, B = step 1: collected in the "wrong" order
  const orEntries = w.getEntries(or.id);
  assert(orEntries.length === f.entries.filter(e => /step [12]\//.test(e.message)).length && inLogOrder(orEntries),
    "an OR union lists step 1 before step 2 of each tick (same timestamp), as in the file");
  const step3 = w.createFilterNode(f.id, "text", "step 3/");
  const nested = w.createAndOrNode([step3.id, or.id], "or"); // the inner OR is evaluated from its baked snapshot
  const nestedEntries = w.getEntries(nested.id);
  assert(nestedEntries.some(e => e.message.includes("step 3/")) && inLogOrder(nestedEntries), "a nested (baked) OR keeps log order too");

  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  const tick = f.entries.filter(e => e.message.startsWith("Tick 1 "));
  T.state.activeId = f.id;
  T.state.logMultiSelect = new Set(tick.map(e => e.id).reverse());
  w.copyLogSelectionToClipboard();
  assert(tick.length >= 3 && tick.every(e => e.ts === tick[0].ts) && copied === tick.map(e => e.raw).join("\n"),
    "copying a same-timestamp selection picked bottom-up copies it in file order");
  T.state.logMultiSelect = new Set();

  T.state.activeId = step1.id;
  w.render();
  const list = w.getEntries(step1.id);
  const anchor = tick[1]; // step 2 of tick 1: same ts as list[0] (its step 1), before tick 2's step 1
  T.state.tempAnchor = { entryId: anchor.id, nodeId: step1.id, faded: false };
  const spliced = w.spliceTempAnchor(list);
  const at = spliced.findIndex(e => e._tempAnchor);
  assert(at === 1 && spliced[0].id === tick[0].id, "the temp anchor lands right after its tick's step 1, got index " + at);
  const early = tick[0];
  T.state.tempAnchor = { entryId: early.id, nodeId: step2.id, faded: false };
  T.state.activeId = step2.id;
  const list2 = w.getEntries(step2.id);
  assert(w.spliceTempAnchor(list2).findIndex(e => e._tempAnchor) === 0, "an anchor tied with the first row but earlier in the file goes before it");
  T.state.tempAnchor = null;
});
