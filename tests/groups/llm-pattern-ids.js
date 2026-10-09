// GROUP llm-pattern-ids — LLM analysis tools, phase 1 (docs/archive/concept-llm-analysis-tools.md
// → 1.1): pattern ids "p<n>" from find_message_types act as virtual nodes
// for the reading tools, create_filter takes patternId / column, and the
// analysisPatternCounts engine behind find_message_types.
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim (motion, sensors).
group("llm-pattern-ids");

await withApp(async (w, d, T) => {
  section("llm-pattern-ids a. find_message_types hands out stable pattern ids");
  const f = await llmSimFile(w, ["motion", "sensors"], 2000, 3);
  const r1 = llmRun(w, "find_message_types", { limit: 40 }).result;
  assert(r1.types.every(t => /^p\d+$/.test(t.patternId)), "every type carries a patternId");
  assert(new Set(r1.types.map(t => t.patternId)).size === r1.types.length, "ids are unique per type");
  const r2 = llmRun(w, "find_message_types", { limit: 40 }).result;
  assert(r2.types.every((t, i) => t.patternId === r1.types[i].patternId), "ids are stable across calls");
  const nodesBefore = Object.keys(T.state.nodes).length;
  const reached = r1.types.find(t => t.type.startsWith("Position reached"));
  const expect = f.entries.filter(e => e.message.startsWith("Position reached")).length;

  const ge = llmRun(w, "get_entries", { nodeId: reached.patternId, max: 5 });
  assert(!ge.error && ge.result.total === expect && ge.result.entries.length === 5 && ge.result.entries.every(e => e.message.startsWith("Position reached")), "get_entries accepts a pattern id: only that type's entries");
  const sub = llmRun(w, "find_message_types", { nodeId: reached.patternId }).result;
  assert(sub.entries === expect && sub.typesFound === 1 && sub.types[0].patternId === reached.patternId, "find_message_types on a pattern id analyses just that type, same id");
  assert(Object.keys(T.state.nodes).length === nodesBefore, "reading through pattern ids creates no node");

  const bad = llmRun(w, "get_entries", { nodeId: "p9999" });
  assert(bad.error && bad.error.includes("find_message_types again"), "unknown pattern id → error that says what to do, got " + bad.error);
  const asNode = llmRun(w, "create_window", { aroundNodeId: reached.patternId });
  assert(asNode.error && asNode.error.includes("pattern id"), "a node-only tool explains that a pattern id is not a node, got " + asNode.error);
  assert(llmRun(w, "show_view", { nodeId: reached.patternId, view: "filtered" }).error.includes("pattern id"), "show_view needs a node");
});

await withApp(async (w, d, T) => {
  section("llm-pattern-ids b. create_filter with patternId");
  const f = await llmSimFile(w, ["motion", "sensors"], 2000, 4);
  const types = llmRun(w, "find_message_types", { query: "position reached" }).result.types;
  const t = types[0];
  const byPattern = llmRun(w, "create_filter", { parentId: f.id, pattern: t.pattern }).result;
  const res = llmRun(w, "create_filter", { patternId: t.patternId });
  const c = res.result;
  assert(!res.error && c.parentId === f.id, "patternId alone: parent defaults to the pattern's file, got " + JSON.stringify(res.error || c.parentId));
  assert(T.state.nodes[c.nodeId].value === t.pattern, "the node carries the typed extraction pattern of the type");
  assert(c.matches === byPattern.matches && c.tablePlot === true && c.columns.length === 3 && c.columns[1].type === "float", "same matches/columns as typing the pattern, got " + JSON.stringify(c.columns));
  assert(T.llmCreatedNodeIds.has(c.nodeId), "marked as created by the assistant");
  assert(llmRun(w, "create_filter", { patternId: "p9999" }).error.includes("find_message_types again"), "unknown patternId → error");
  assert(llmRun(w, "create_filter", { patternId: t.patternId, parentId: "p1" }).error.includes("pattern id"), "a pattern id is no parent");
  const under = llmRun(w, "create_filter", { patternId: t.patternId, parentId: c.nodeId }).result;
  assert(T.state.nodes[under.nodeId].parentId === c.nodeId, "an explicit parentId wins");
});

await withApp(async (w, d, T) => {
  section("llm-pattern-ids c. create_filter by column value");
  const f = await llmSimFile(w, ["motion", "sensors"], 2000, 5);
  const threads = {};
  f.entries.forEach(e => { threads[e.thread] = (threads[e.thread] || 0) + 1; });
  const thread = Object.keys(threads).find(t => /axis/i.test(t)) || Object.keys(threads)[0];
  const undoBefore = T.undoStack.length;
  const res = llmRun(w, "create_filter", { column: "Thread", pattern: thread });
  const c = res.result;
  assert(!res.error && c.matches === threads[thread], "column filter matches the thread's entries (" + threads[thread] + "), got " + JSON.stringify(res.error || c.matches));
  const node = T.state.nodes[c.nodeId];
  assert(node.isRegex && node.caseSensitive && node.columns.join() === "thread" && node.value === "^" + thread.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "same node the Facets panel builds: anchored case-sensitive regex on the column");
  assert(node.name === "Thread = " + thread, "named like a facet filter, got " + node.name);
  const inv = llmRun(w, "create_filter", { column: "thread", pattern: thread, invert: true }).result;
  assert(inv.matches === 2000 - threads[thread] && T.state.nodes[inv.nodeId].inverted, "invert");
  const lvl = f.entries.find(e => e.level === "ERROR" || e.level === "WARN");
  if (lvl) {
    const lv = llmRun(w, "create_filter", { column: "level", pattern: lvl.level.toLowerCase() }).result;
    assert(T.state.nodes[lv.nodeId].filterType === "level" && lv.matches === f.entries.filter(e => e.level === lvl.level).length, "level column → a level filter, value matched case-insensitively");
  }
  const bad = llmRun(w, "create_filter", { column: "nonsense", pattern: "x" });
  assert(bad.error.startsWith("Unknown column") && bad.error.includes("thread"), "unknown column → the column list, got " + bad.error);
  assert(llmRun(w, "create_filter", { column: "thread" }).error, "column without a value refused");
  assert(llmRun(w, "create_filter", { column: "thread", pattern: "x", patternId: "p1" }).error, "column + patternId refused");
  const zero = llmRun(w, "create_filter", { column: "thread", pattern: "no-such-thread" }).result;
  assert(zero.matches === 0 && zero.hint, "no match → hint");
  // The Facets panel's own path still builds the same node.
  T.state.activeId = f.id;
  const facetCols = w.facetColumnsFor(f.id);
  w.createFacetFilter(facetCols.find(cc => cc.key === "thread"), thread, false);
  const facetNode = T.state.nodes[T.state.activeId];
  assert(facetNode.value === node.value && facetNode.name === node.name && facetNode.columns.join() === "thread" && facetNode.caseSensitive === true && facetNode.isRegex === true, "createFacetFilter (UI) unchanged by the refactor");
  assert(T.undoStack.length > undoBefore, "the UI path still pushes an undo step");
});

await withApp(async (w, d, T) => {
  section("llm-pattern-ids d. analysisPatternCounts engine");
  const f = await llmSimFile(w, ["motion", "sensors"], 1500, 6);
  const rows = w.analysisPatternCounts(f.entries);
  assert(rows.length > 3 && rows.every((g, i) => i === 0 || rows[i - 1].count >= g.count), "sorted by count");
  assert(rows.reduce((s, g) => s + g.count, 0) === 1500, "counts add up to the entries");
  const g = rows[0];
  assert(g.key && g.example && g.first <= g.last && Object.values(g.levels).reduce((s, n) => s + n, 0) === g.count && !g.entries, "row shape: key, example, first/last, levels, no entries unless asked");
  const keep = w.analysisPatternCounts(f.entries, { keepEntries: true });
  assert(keep[0].entries.length === keep[0].count, "keepEntries returns the member entries");
  const reached = rows.find(x => x.key.startsWith("Position reached"));
  assert(reached && (reached.floatMask & 2) === 2, "floatMask marks the actual= float placeholder, got " + (reached && reached.floatMask));
  assert(w.analysisPatternCounts([]).length === 0, "empty input → no rows");
});
