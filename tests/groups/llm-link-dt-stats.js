// GROUP llm-link-dt-stats — the Δt of link pairs per value of a start-entry column
// (e.g. "which axis moves slower?"): an extraction filter under a link offers
// "Δt (ms)" as a value column of get_value_stats (with groupBy), and group_by on
// such a filter adds Δt min/median/max per value like on the link itself.
// Δt is not a log-line column: create_filter column / create_link key refuse it.
// Origin: 2026-10-10 (person-requested, MCP friction on sim-default.log).
// Sample data from tools/log-sim (all,-text,-gaps seed 7).
group("llm-link-dt-stats");

await withApp(async (w, d, T) => {
  section("llm-link-dt-stats a. Δt per axis under a link");
  const f = await llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const l = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "job=[*]" }).result;
  assert(l.pairs === 484, "reference scenario: 484 pairs");
  const ex = llmRun(w, "create_filter", { parentId: l.nodeId, pattern: "Move requested axis=[*:int]" }).result;
  assert(ex.matches === 484, "extraction under the link keeps every pair, got " + ex.matches);
  const pairs = w.getEntries(ex.nodeId);
  assert(pairs.length && pairs.every(p => p.isPair), "its entries are pairs");
  const axisOf = p => /axis=(\d+)/.exec((p.first.ts <= p.second.ts ? p.first : p.second).message)[1];
  const byAxis = {};
  pairs.forEach(p => (byAxis[axisOf(p)] = byAxis[axisOf(p)] || []).push(p.dtMs));
  Object.values(byAxis).forEach(a => a.sort((x, y) => x - y));

  const s = llmRun(w, "get_value_stats", { nodeId: ex.nodeId, column: "dt", groupBy: "axis" });
  assert(!s.error, "get_value_stats column dt on the extraction under a link, got " + s.error);
  const r = s.result;
  const all = pairs.map(p => p.dtMs).sort((x, y) => x - y);
  assert(r.column.name === "Δt (ms)" && r.n === 484 && r.min === all[0] && r.max === all[all.length - 1], "overall Δt min/max over all pairs");
  assert(r.groupBy && r.groups.length === Object.keys(byAxis).length, "one group per axis");
  for (const g of r.groups) {
    const mine = byAxis[g.value];
    assert(mine && g.n === mine.length && g.min === mine[0] && g.max === mine[mine.length - 1], "axis " + g.value + ": n/min/max equal a manual computation");
  }
  for (const alias of ["Δt", "Δt (ms)", "DT"]) assert(!llmRun(w, "get_value_stats", { nodeId: ex.nodeId, column: alias }).error, "column alias " + alias);

  const g = llmRun(w, "group_by", { nodeId: ex.nodeId, column: "axis" }).result;
  assert(g.total === 484 && g.values.every(v => v.dtMs), "group_by under a link: Δt per value");
  for (const v of g.values) {
    const mine = byAxis[v.value];
    assert(v.count === mine.length && v.dtMs.min === mine[0] && v.dtMs.median === mine[Math.floor(mine.length / 2)] && v.dtMs.max === mine[mine.length - 1], "axis " + v.value + ": Δt min/median/max");
  }

  const onLink = llmRun(w, "group_by", { nodeId: l.nodeId, column: "axis" });
  assert(onLink.error && onLink.error.includes("Δt"), "axis on the link itself: the hint names the Δt route, got " + onLink.error);
  const nodes = Object.keys(T.state.nodes).length;
  const cf = llmRun(w, "create_filter", { parentId: ex.nodeId, column: "dt", pattern: "100" });
  assert(cf.error && cf.error.includes("Δt") && Object.keys(T.state.nodes).length === nodes, "create_filter column dt refused, nothing created, got " + cf.error);
});

await withApp(async (w, d, T) => {
  section("llm-link-dt-stats b. no Δt column outside links");
  const f = await llmSimFile(w, ["motion"], 2000, 3);
  const ex = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested axis=[*:int]" }).result;
  const s = llmRun(w, "get_value_stats", { nodeId: ex.nodeId, column: "dt" });
  assert(s.error && s.error.startsWith("Unknown column") && !s.error.includes("Δt"), "plain extraction: no Δt column, got " + s.error);
  const g = llmRun(w, "group_by", { nodeId: ex.nodeId, column: "1" }).result;
  assert(g.values.every(v => !v.dtMs), "group_by without pairs: no Δt");
});
