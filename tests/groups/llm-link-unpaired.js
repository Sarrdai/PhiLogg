// GROUP llm-link-unpaired — LLM analysis tools, phase 1 (docs/archive/concept-llm-analysis-tools.md
// → 1.4): create_link explains the references without an end (unpaired,
// unpairedExamples, unpairedFollowedBy from the analysisNeighbors engine),
// show_view unpaired: "only" flips the link view's switch, and the
// analysisNeighbors engine itself (windows, same thread, lift, reference
// exclusion) is held against an independent brute-force count.
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim (motion, sensors, basic, bursts).
group("llm-link-unpaired");

// Independent re-count of coverage / occurrences / median distance per pattern.
function bruteNeighbors(w, refs, file, { direction, windowMs, sameThread }) {
  const refIds = new Set(refs.map(r => r.id));
  const rows = new Map();
  refs.forEach((r, ri) => {
    for (const e of file) {
      if (refIds.has(e.id)) continue;
      const inWin = direction === "before" ? (e.ts >= r.ts - windowMs && e.ts < r.ts) : (e.ts > r.ts && e.ts <= r.ts + windowMs);
      if (!inWin || (sameThread && e.thread !== r.thread)) continue;
      const key = w.normalizeMessagePattern(e.message);
      let row = rows.get(key);
      if (!row) rows.set(key, row = { covered: new Set(), inWindows: 0, dists: [] });
      row.covered.add(ri);
      row.inWindows++;
      row.dists.push(Math.abs(e.ts - r.ts));
    }
  });
  for (const row of rows.values()) row.dists.sort((a, b) => a - b);
  return rows;
}

await withApp(async (w, d, T) => {
  section("llm-link-unpaired a. create_link explains the references without an end");
  const f = await llmSimFile(w, ["motion", "sensors", "basic", "bursts"], 6000, 7);
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const res = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, direction: "after", key: "job=[*]" });
  const l = res.result;
  const node = T.state.nodes[l.nodeId];
  const un = node._linkUnmatched;
  assert(!res.error && l.unpaired === un.length && un.length > 5 && l.pairs + l.unpaired === l.references, "unpaired = the link node's references without an end (" + un.length + ")");
  assert(l.unpairedExamples.length === 3 && l.unpairedExamples.every(id => un.some(e => e.id === id)), "three unpaired examples, all really unpaired");
  const rows = l.unpairedFollowedBy;
  assert(Array.isArray(rows) && rows.length >= 2 && rows.length <= 5, "unpairedFollowedBy: 2-5 rows, got " + JSON.stringify(rows));
  assert(rows.every(r => /^Move aborted /.test(r.type) && /^p\d+$/.test(r.patternId) && /^\d+\/\d+$/.test(r.coverage) && r.medianDtMs >= 0), "rows: the Move aborted types with patternId, coverage, medianDtMs");
  assert(rows.every(r => r.coverage.endsWith("/" + un.length)), "coverage is out of the unpaired references (" + un.length + ")");
  const pairDts = T.state.nodes[l.nodeId] && w.getEntries(l.nodeId).map(p => p.dtMs).sort((a, b) => a - b);
  const win = Math.max(1000, Math.ceil(pairDts[Math.floor((pairDts.length - 1) * 0.9)]));
  const brute = bruteNeighbors(w, un, f.entries, { direction: "after", windowMs: win, sameThread: true });
  for (const r of rows) {
    const key = [...brute.keys()].find(k => w.patternDisplayText(k) === r.type);
    const b = brute.get(key);
    assert(b && r.coverage === b.covered.size + "/" + un.length && r.medianDtMs === b.dists[Math.floor(b.dists.length / 2)], "row '" + r.type + "' matches the brute-force count (" + (b && b.covered.size) + "), got " + r.coverage);
  }
  assert(rows.every(r => !/Position reached|Move requested/.test(r.type)), "ordinary moves on the thread (lift < 2) are not listed");
  // The pattern ids resolve as virtual nodes.
  const ge = llmRun(w, "get_entries", { nodeId: rows[0].patternId, max: 20 }).result;
  assert(ge.total >= 1 && ge.entries.every(e => e.message.startsWith("Move aborted")), "a returned patternId reads as that type's entries");
  const fil = llmRun(w, "create_filter", { patternId: rows[0].patternId }).result;
  assert(fil.matches === ge.total && fil.parentId === f.id, "and builds a filter");
  const nb = w.analysisNeighbors(un, f.entries, { direction: "after", windowMs: win, sameThread: true });
  const abortRows = nb.rows.filter(x => w.patternDisplayText(x.patternKey).startsWith("Move aborted"));
  assert(abortRows.length === rows.length && abortRows.every(x => x.significant && x.lift > 5), "the abort types have a large lift (> 5): " + abortRows.map(x => x.lift.toFixed(1)).join(", "));
  const any = w.analysisNeighbors(un, f.entries, { direction: "after", windowMs: win, sameThread: false });
  const common = any.rows.filter(x => /^(Heartbeat|Queue depth|Scheduler tick)/.test(w.patternDisplayText(x.patternKey)));
  assert(common.length >= 2 && common.every(x => !x.significant && x.lift < 2), "everyday patterns (heartbeat, queue depth) have a lift near 1, not significant: " + common.map(x => x.lift.toFixed(2)).join(", "));
  assert(l.tip && !l.tip.startsWith("Preview"), "(real link keeps its tip)");
  assert(l.dtMs.min <= l.dtMs.median && l.dtMs.median <= l.dtMs.max, "Δt statistics unchanged");
});

await withApp(async (w, d, T) => {
  section("llm-link-unpaired b. nothing unpaired → no explanation fields");
  const f = await llmSimFile(w, ["motion", "sensors"], 3000, 5);
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const l = llmRun(w, "create_link", { refId: done.nodeId, targetId: req.nodeId, direction: "before" }).result;
  assert(l.unpaired === 0 && l.unpairedExamples === undefined && l.unpairedFollowedBy === undefined, "every Position reached has an earlier request: no unpaired fields, got " + JSON.stringify([l.unpaired, l.unpairedExamples]));
  const sv = llmRun(w, "show_view", { nodeId: l.nodeId, view: "filtered", unpaired: "only" });
  assert(!sv.error && /^none/.test(sv.result.unpaired), "unpaired: only on a link without unpaired references says so, got " + JSON.stringify(sv.result));
});

await withApp(async (w, d, T) => {
  section("llm-link-unpaired c. show_view unpaired: only");
  const f = await llmSimFile(w, ["motion", "sensors", "basic", "bursts"], 6000, 7);
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const l = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "job=[*]" }).result;
  llmRun(w, "show_view", { nodeId: req.nodeId, view: "filtered" });
  const sv = llmRun(w, "show_view", { nodeId: l.nodeId, view: "filtered", unpaired: "only" });
  assert(!sv.error && sv.result.unpaired === "only" && T.state.activeId === l.nodeId, "view switched to the link, unpaired: only reported");
  const chip = d.querySelector("#linkUnChip");
  assert(chip.textContent === "only " + l.unpaired + " without end" && chip.getAttribute("aria-pressed") === "true", "the chip shows 'only N without end', got " + chip.textContent);
  assert(d.querySelectorAll("#linkBody .pair-block").length > 0 || d.querySelectorAll("#linkBody > *").length > 0, "the link view lists blocks");
  const again = llmRun(w, "show_view", { nodeId: l.nodeId, view: "filtered" });
  assert(!again.error && !again.result.unpaired, "without the parameter the result carries no unpaired field");
  assert(llmRun(w, "show_view", { nodeId: req.nodeId, view: "filtered", unpaired: "only" }).error.includes("link node"), "only valid on a link node");
  assert(llmRun(w, "show_view", { nodeId: l.nodeId, view: "log", unpaired: "only" }).error.includes("filtered"), "only valid with view filtered");
  assert(llmRun(w, "show_view", { nodeId: l.nodeId, view: "filtered", unpaired: "all" }).error.includes("only"), "other values refused");
  assert(T.state.activeId === l.nodeId, "a refused call changes nothing");
});

await withApp(async (w, d, T) => {
  section("llm-link-unpaired d. analysisNeighbors engine");
  const f = await llmSimFile(w, ["motion", "sensors", "basic", "bursts"], 6000, 7);
  const refs = f.entries.filter(e => e.message.startsWith("Move aborted"));
  assert(refs.length > 10, "aborted moves exist (" + refs.length + ")");
  for (const opts of [
    { direction: "before", windowMs: 5000, sameThread: true },
    { direction: "before", windowMs: 5000, sameThread: false },
    { direction: "after", windowMs: 1000, sameThread: false },
    { direction: "after", windowMs: 3000, sameThread: true },
  ]) {
    const tag = opts.direction + "/" + opts.windowMs + "/" + (opts.sameThread ? "thread" : "any");
    const r = w.analysisNeighbors(refs, f.entries, opts);
    const brute = bruteNeighbors(w, refs, f.entries, opts);
    assert(r.references === refs.length && r.direction === opts.direction && r.windowMs === opts.windowMs && r.sameThread === opts.sameThread && r.minLift === 2, tag + ": options + reference count echoed");
    assert(r.rows.length === brute.size, tag + ": one row per pattern seen in a window (" + brute.size + "), got " + r.rows.length);
    let ok = true, why = "";
    for (const row of r.rows) {
      const b = brute.get(row.patternKey);
      if (!b || row.covered !== b.covered.size || row.coverage !== b.covered.size + "/" + refs.length || row.inWindows !== b.inWindows || row.medianDistMs !== b.dists[Math.floor(b.dists.length / 2)]) { ok = false; why = row.patternKey; break; }
    }
    assert(ok, tag + ": covered / coverage / inWindows / medianDistMs equal the brute-force count" + (why ? " (differs at " + JSON.stringify(why) + ")" : ""));
    assert(r.rows.every((x, i) => i === 0 || r.rows[i - 1].covered > x.covered || (r.rows[i - 1].covered === x.covered && r.rows[i - 1].lift >= x.lift)), tag + ": sorted by coverage, then lift");
    assert(r.rows.every(x => x.significant === (x.lift >= 2) && x.lift > 0 && x.example && x.maxLevel), tag + ": significant = lift ≥ minLift; example and maxLevel present");
  }
  // The references themselves never count as neighbours.
  const allReq = f.entries.filter(e => e.message.startsWith("Move requested"));
  const r1 = w.analysisNeighbors(allReq, f.entries, { direction: "before", windowMs: 5000, sameThread: false });
  assert(!r1.rows.some(x => w.patternDisplayText(x.patternKey).startsWith("Move requested")), "with every 'Move requested' as reference, none shows up as its own neighbour");
  // minLift decides `significant`; lift of a pattern that only ever stands after the references is large.
  const un = allReq.filter((e, i) => i % 5 === 0);
  const hi = w.analysisNeighbors(un, f.entries, { direction: "after", windowMs: 1000, sameThread: false, minLift: 1000 });
  assert(hi.minLift === 1000 && hi.rows.every(x => !x.significant), "minLift 1000 → nothing significant");
  const lo = w.analysisNeighbors(un, f.entries, { direction: "after", windowMs: 1000, sameThread: false, minLift: 0 });
  assert(lo.rows.length === hi.rows.length && lo.rows.every(x => x.significant), "minLift 0 → everything significant; same rows");
  // Empty / degenerate input.
  assert(w.analysisNeighbors([], f.entries, {}).rows.length === 0 && w.analysisNeighbors(refs, [], {}).rows.length === 0, "no references or no file → no rows");
  const dflt = w.analysisNeighbors(refs, f.entries);
  assert(dflt.direction === "before" && dflt.windowMs === 5000 && dflt.sameThread === true && dflt.minLift === 2, "defaults: before, 5000 ms, same thread, minLift 2");
});
