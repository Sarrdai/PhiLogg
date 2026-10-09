// GROUP llm-group-by — LLM analysis tools, phase 2 (docs/archive/concept-llm-analysis-tools.md
// → 2.4): the analysisGroupBy engine and the group_by tool — distribution over
// a format/facet column or an extraction column, on a link node grouped by
// the START entry with noEnd and Δt min/median/max per value.
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim (all,-text,-gaps seed 7; motion, sensors).
group("llm-group-by");

await withApp(async (w, d, T) => {
  section("llm-group-by a. format columns");
  const f = await llmSimFile(w, ["motion", "sensors", "basic"], 3000, 4);
  const res = llmRun(w, "group_by", { nodeId: f.id, column: "thread" });
  const r = res.result;
  const byThread = {};
  f.entries.forEach(e => { byThread[e.thread] = (byThread[e.thread] || 0) + 1; });
  assert(!res.error && r.column === "thread" && r.total === 3000 && r.distinct === Object.keys(byThread).length, "thread: total and distinct");
  assert(r.values.every(v => v.count === byThread[v.value]) && r.values.every((v, i) => i === 0 || r.values[i - 1].count >= v.count), "counts per thread equal a manual count, sorted by count");
  assert(r.values.every(v => Object.values(v.levels).reduce((s, n) => s + n, 0) === v.count), "levels per value add up");
  assert(llmRun(w, "group_by", { nodeId: f.id, column: "Thread" }).result.column === "thread", "column match is case-insensitive");
  const lv = llmRun(w, "group_by", { nodeId: f.id, column: "level" }).result;
  assert(lv.values.reduce((s, v) => s + v.count, 0) === 3000 && lv.values.some(v => v.value === "INFO"), "level column");
  const nodes = Object.keys(T.state.nodes).length;
  const sub = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor" }).result;
  const g2 = llmRun(w, "group_by", { nodeId: sub.nodeId, column: "thread" }).result;
  assert(g2.total === sub.matches, "works on a filter node's entries");
  assert(Object.keys(T.state.nodes).length === nodes + 1, "creates no node itself");
  const bad = llmRun(w, "group_by", { nodeId: f.id, column: "nonsense" });
  assert(bad.error.startsWith("Unknown column") && bad.error.includes("thread"), "unknown column → the column list, got " + bad.error);
  assert(llmRun(w, "group_by", { nodeId: f.id, column: "" }).error, "empty column refused");
  assert(llmRun(w, "group_by", { nodeId: "n424242", column: "thread" }).error.includes("Unknown node"), "unknown node");
  const pid = llmRun(w, "find_message_types", { query: "Position reached" }).result.types[0].patternId;
  const gp = llmRun(w, "group_by", { nodeId: pid, column: "thread" }).result;
  assert(gp.total === f.entries.filter(e => e.message.startsWith("Position reached")).length && gp.values.every(v => /^axis-/.test(v.value)), "a pattern id as the node: Position reached sits on axis threads");
  const loc = llmRun(w, "group_by", { nodeId: f.id, column: "location" }).result;
  assert(loc.values.some(v => v.value === "(empty)") || loc.values.length >= 1, "location column answers (empty values show as (empty))");
});

await withApp(async (w, d, T) => {
  section("llm-group-by b. extraction columns and the 20-value cap");
  const f = await llmSimFile(w, ["motion", "sensors"], 3000, 5);
  const ex = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached axis=[*:int] actual=[*:float] job=[*]" }).result;
  const byAxis = {};
  f.entries.filter(e => e.message.startsWith("Position reached")).forEach(e => { const a = /axis=(\d+)/.exec(e.message)[1]; byAxis[a] = (byAxis[a] || 0) + 1; });
  const r = llmRun(w, "group_by", { nodeId: ex.nodeId, column: "1" }).result;
  assert(r.total === ex.matches && r.distinct === Object.keys(byAxis).length && r.values.every(v => v.count === byAxis[v.value]), "extraction column by number: counts per axis value");
  const col = ex.columns[0].name;
  assert(llmRun(w, "group_by", { nodeId: ex.nodeId, column: col.toUpperCase() }).result.distinct === r.distinct, "…and by (case-insensitive) name");
  const jobs = llmRun(w, "group_by", { nodeId: ex.nodeId, column: "3" }).result;
  assert(jobs.distinct > 20 && jobs.values.length === 20 && jobs.others.values === jobs.distinct - 20, "more than 20 values: 20 listed, the rest in others, got " + JSON.stringify(jobs.others));
  assert(jobs.values.reduce((s, v) => s + v.count, 0) + jobs.others.count === jobs.total, "listed + others = total");
  assert(llmRun(w, "group_by", { nodeId: ex.nodeId, column: "9" }).error.includes("Columns:"), "unknown extraction column → list");
});

await withApp(async (w, d, T) => {
  section("llm-group-by c. link node: grouped by the start entry");
  const f = await llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const l = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "job=[*]" }).result;
  assert(l.pairs === 484 && l.unpaired === 31, "reference scenario: 484 pairs, 31 without end");
  const r = llmRun(w, "group_by", { nodeId: l.nodeId, column: "thread" }).result;
  assert(r.byStartEntry === true && r.total === 484 && r.noEnd === 31, "link: pairs grouped by the start entry, noEnd total");
  const noEnd = Object.fromEntries(r.values.map(v => [v.value, v.noEnd]));
  assert(noEnd["axis-2"] === 11 && noEnd["axis-4"] === 10 && noEnd["axis-1"] === 6 && noEnd["axis-3"] === 4, "without end per axis: 11 / 10 / 6 / 4, got " + JSON.stringify(noEnd));
  const pairs = w.getEntries(l.nodeId);
  for (const v of r.values) {
    const mine = pairs.filter(p => p.thread === v.value).map(p => p.dtMs).sort((a, b) => a - b);
    assert(v.count === mine.length && v.dtMs.min === mine[0] && v.dtMs.max === mine[mine.length - 1] && v.dtMs.median === mine[Math.floor(mine.length / 2)], v.value + ": count and Δt min/median/max equal a manual computation");
  }
  assert(r.values.reduce((s, v) => s + v.count, 0) === 484, "values add up to the pairs");
});

await withApp(async (w, d, T) => {
  section("llm-group-by c2. \"before\" link: grouped by the reference, not the earlier match");
  const f = await llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const l = llmRun(w, "create_link", { refId: done.nodeId, targetId: req.nodeId, direction: "before", key: "job=[*]" }).result;
  assert(l.pairs > 0, "before link pairs each Position reached with its Move requested");
  const r = llmRun(w, "group_by", { nodeId: l.nodeId, column: "method" }).result;
  assert(r.values.length === 1 && r.values[0].value === "OnPositionReached" && r.values[0].count === l.pairs, "method of the reference (OnPositionReached), not of the earlier match (MoveTo), got " + JSON.stringify(r.values.map(v => v.value)));
});

await withApp(async (w, d, T) => {
  section("llm-group-by d. analysisGroupBy engine");
  const f = await llmSimFile(w, ["motion", "basic"], 1500, 6);
  const g = w.analysisGroupBy(f.entries, e => e.thread, { max: 2 });
  assert(g.total === 1500 && g.values.length === 2 && g.distinct >= 3 && g.others && g.others.values === g.distinct - 2, "max collapses the rest into others");
  assert(g.values[0].count >= g.values[1].count && !("noEnd" in g.values[0]) && !g.values[0].dtMs, "no noEnd / dtMs without opts");
  const un = f.entries.slice(0, 5);
  const h = w.analysisGroupBy([], e => e.thread, { unpaired: un });
  assert(h.total === 0 && h.values.reduce((s, v) => s + v.noEnd, 0) === 5 && h.values.every(v => v.count === 0), "unpaired-only values still appear, with count 0");
  const d2 = w.analysisGroupBy(f.entries.slice(0, 4), e => "x", { dtOf: e => 10 });
  assert(d2.values[0].dtMs.min === 10 && d2.values[0].dtMs.median === 10 && d2.others === null, "dtOf feeds the Δt statistics");
  assert(w.analysisGroupBy([], e => "x").values.length === 0, "empty input");
});
