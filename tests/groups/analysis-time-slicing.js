// GROUP analysis-time-slicing — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP analysis-time-slicing — the Neighbors tab and Patterns Compare above the sync limit run in
   time slices (analysisRunSliced over the engines' *Steps generators) with a percentage placeholder;
   a changed signature cancels the running job; the LLM tools keep the synchronous engine API.
   Origin: 2026-10-09 (person-requested, backlog #120, analysis time slicing).
   Sample data: tools/log-sim (causechain, basic; motion, bursts, basic).
   ============================================================ */
group("analysis-time-slicing");

if (groupSelected()) {
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const simFile = async (w, scenarios, entries, seed) => {
    const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
    return w.addFile(file.name, file.text, () => {});
  };
  const nbRows = d => [...d.querySelectorAll("#nbTable .nb-row")];

  await withApp(async (w, d, T) => {
    section("analysis-time-slicing a. engine step form: the plain function equals the drained generator, progress is monotonic");
    const f = await simFile(w, ["causechain", "basic"], 6000, 3);
    const err = w.createFilterNode(f.id, "text", "Order processing failed");
    const refs = w.getEntries(err.id);
    const opts = { direction: "before", windowMs: 5000, sameThread: true, minLift: 2 };
    const plain = w.analysisNeighbors(refs, f.entries, opts);
    const gen = w.analysisNeighborsSteps(refs, f.entries, opts);
    let r, last = 0, steps = 0, mono = true;
    while (!(r = gen.next()).done) { steps++; if (r.value < last || r.value > 1) mono = false; last = r.value; }
    assert(steps > 0 && mono, "yields monotonic progress in 0..1 (" + steps + " steps)");
    assert(JSON.stringify(r.value.rows.map(x => [x.patternKey, x.coverage, x.lift])) === JSON.stringify(plain.rows.map(x => [x.patternKey, x.coverage, x.lift])), "same rows as the plain call");
    const wc = w.analysisWhatChanged(refs, f.entries, {});
    const g2 = w.analysisWhatChangedSteps(refs, f.entries, {});
    let r2; while (!(r2 = g2.next()).done);
    assert(JSON.stringify(r2.value.more.map(x => x.key)) === JSON.stringify(wc.more.map(x => x.key)) && r2.value.new.length === wc.new.length, "what changed: same result");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("analysis-time-slicing b. Neighbors above the limit: percentage first, final rows identical to the sync engine");
    const f = await simFile(w, ["causechain", "basic"], 60000, 3);
    const err = w.createFilterNode(f.id, "text", "Order processing failed");
    T.state.activeId = err.id; w.render();
    w.setLowerTab("neighbors");
    assert(f.entries.length > 50000, "above the sync limit: " + f.entries.length);
    assert(/^Computing… \d+%$/.test(txt(d.querySelector("#nbTable .nb-empty"))), "placeholder with percentage: " + txt(d.querySelector("#nbTable")));
    await waitFor(() => nbRows(d).length > 0, { timeout: 20000 });
    const ref = w.analysisNeighbors(w.getEntries(err.id), f.entries, { direction: "before", windowMs: 5000, sameThread: true, minLift: 2 });
    const want = ref.rows.filter(x => x.significant);
    assert(nbRows(d).length === want.length, "same row count as the sync engine: " + nbRows(d).length + " vs " + want.length);
    assert(txt(nbRows(d)[0].children[0]) === want[0].coverage, "first row coverage equal: " + want[0].coverage);

    section("analysis-time-slicing c. switching the signature mid-run cancels the old job");
    const b30 = d.querySelector('#nbPanelBody [data-nb-win="30000"]');
    const b1 = d.querySelector('#nbPanelBody [data-nb-win="1000"]');
    fireClick(b30, w);
    assert(/^Computing…/.test(txt(d.querySelector("#nbTable .nb-empty"))), "30 s computing");
    fireClick(b1, w);
    assert(/^Computing…/.test(txt(d.querySelector("#nbTable .nb-empty"))), "1 s computing, 30 s job replaced");
    await waitFor(() => d.querySelector("#nbTable .nb-row, #nbTable .nb-empty:not(:empty)") && !/^Computing…/.test(txt(d.querySelector("#nbTable"))), { timeout: 20000 });
    const head = txt(d.querySelector("#nbHead"));
    assert(/ 1 s before/.test(head), "the header shows the latest window: " + head);
    // 30 s was cancelled: selecting it again must compute again (not served from cache)
    fireClick(b30, w);
    assert(/^Computing…/.test(txt(d.querySelector("#nbTable .nb-empty"))), "cancelled result was never cached");
    await waitFor(() => !/^Computing…/.test(txt(d.querySelector("#nbTable"))), { timeout: 20000 });
    const ref30 = w.analysisNeighbors(w.getEntries(err.id), f.entries, { direction: "before", windowMs: 30000, sameThread: true, minLift: 2 });
    assert(nbRows(d).length === ref30.rows.filter(x => x.significant).length, "30 s rows equal the sync engine");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("analysis-time-slicing d. Compare above the limit: percentage first, cancelled by a node switch");
    const f = await simFile(w, ["motion", "bursts", "basic"], 60000, 7);
    const lv = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
    T.state.activeId = lv.id; w.render();
    T.state.fhActive = "patterns"; w.applyFhView("patterns");
    fireClick(d.querySelector("#patternsCompareBtn"), w);
    assert(/^Comparing… \d+%$/.test(txt(d.querySelector("#patternsCmpBody"))), "Comparing with percentage: " + txt(d.querySelector("#patternsCmpBody")));
    const other = w.createFilterNode(f.id, "level", ["ERROR"]);
    T.state.activeId = other.id; w.render(); T.state.fhActive = "patterns"; w.applyFhView("patterns");
    await waitFor(() => d.querySelectorAll("#patternsCmpBody .cmp-row").length > 0, { timeout: 30000 });
    const inp = w.cmpInputs();
    const res = w.analysisWhatChanged(inp.a, inp.b, { durationAMs: inp.aDur, durationBMs: inp.bDur });
    const want = ["new", "more", "rarer", "gone"].reduce((n, k) => n + Math.min(res[k].length, 200), 0);
    const got = d.querySelectorAll("#patternsCmpBody .cmp-row").length;
    assert(got === want && want > 0, "rows of the new node equal the sync engine (" + want + "), got " + got + " " + txt(d.querySelector("#patternsCmpBody")).slice(0, 120));
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("analysis-time-slicing e. LLM tools stay synchronous above the limit");
    const f = await llmSimFile(w, ["all", "-text", "-gaps"], 60000, 7);
    const lv = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
    const res = llmRun(w, "common_neighbors", { nodeId: lv.id });
    assert(res && typeof res.then !== "function" && !res.error && res.result.references > 0, "common_neighbors returns a result synchronously");
    const direct = w.analysisNeighbors(w.getEntries(lv.id), f.entries, { direction: "before", windowMs: 5000, sameThread: true });
    assert(res.result.references === direct.references, "same reference count as the engine");
    const tl = llmRun(w, "timeline", { nodeId: lv.id }).result.bursts[0];
    const wc = llmRun(w, "what_changed", { aFrom: tl.from, aTo: tl.to });
    assert(wc && typeof wc.then !== "function" && !wc.error && wc.result.a.entries > 0, "what_changed returns a result synchronously");
  }, { indexedDB: new IDBFactory() });
}
