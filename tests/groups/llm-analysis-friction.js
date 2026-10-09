// GROUP llm-analysis-friction — LLM/MCP analysis tools, round G package G2:
// friction fixes. (1) get_value_stats / group_by see the columns of every
// extraction ancestor (by name; numbers stay the nearest extraction's),
// (2) pattern ids accept their placeholder columns, with fix hints in the
// errors, (3) find_message_types query: smart case, (4) what_changed keeps a
// lone new ERROR/FATAL type (engine option keepSevere, tool passes it),
// (5) create_link says that unpairedFollowedBy coverages overlap.
// Origin: 2026-10-09 (person-requested, round G).
// Sample data from tools/log-sim (timing, basic, bursts, motion; seeds below).
group("llm-analysis-friction");

await withApp(async (w, d, T) => {
  section("llm-analysis-friction a. extraction columns inherited from ancestor extractions");
  const f = await llmSimFile(w, ["timing", "basic"], 2000, 3);
  const parent = llmRun(w, "create_filter", { parentId: f.id, pattern: "Request GET [*] completed in [*:int]ms status=[*:int]" }).result;
  const child = llmRun(w, "create_filter", { parentId: parent.nodeId, pattern: "status=[*:int>=400]" }).result;
  assert(child.columns.length === 1 && child.columns[0].name === "status" && child.matches > 0 && child.matches < parent.matches, "child extraction has only its own column");
  const re = /completed in (\d+)ms status=(\d+)/;
  const msgs = w.getEntries(child.nodeId).map(e => re.exec(e.message));
  const ms = msgs.map(m => +m[1]).sort((x, y) => x - y);
  const st = llmRun(w, "get_value_stats", { nodeId: child.nodeId, column: "completed" });
  assert(!st.error && st.result.column.name === "completed" && st.result.column.from === parent.nodeId && st.result.n === ms.length, "ancestor column by name: " + JSON.stringify(st));
  assert(st.result.min === ms[0] && st.result.max === ms[ms.length - 1], "values come from the child's entries (min/max equal a manual computation)");
  const own = llmRun(w, "get_value_stats", { nodeId: child.nodeId, column: "1" }).result;
  assert(own.column.name === "status" && own.column.index === 1 && own.min >= 400, "number 1 still means the nearest extraction's first column");
  const no2 = llmRun(w, "get_value_stats", { nodeId: child.nodeId, column: "2" });
  assert(no2.error && no2.error.includes("completed (from " + parent.nodeId + ")") && no2.error.includes("Request (from " + parent.nodeId + ")"), "number 2 is not an ancestor column; the error lists names with their origin, got " + no2.error);
  const clash = llmRun(w, "get_value_stats", { nodeId: child.nodeId, column: "status" }).result;
  assert(clash.column.index === 1 && clash.min >= 400 && !clash.column.from, "name clash: the nearest extraction wins");
  const g = llmRun(w, "group_by", { nodeId: child.nodeId, column: "completed" });
  assert(!g.error && g.result.column === "completed" && g.result.total === child.matches, "group_by takes the ancestor column too");
  const byMs = {};
  msgs.forEach(m => { byMs[m[1]] = (byMs[m[1]] || 0) + 1; });
  assert(g.result.values.every(v => v.count === byMs[v.value]), "group_by counts equal a manual count");
  const gs = llmRun(w, "group_by", { nodeId: child.nodeId, column: "status" }).result;
  assert(gs.values.every(v => +v.value >= 400), "group_by: nearest wins a name clash");
  const gbad = llmRun(w, "group_by", { nodeId: child.nodeId, column: "nope" });
  assert(gbad.error.includes("completed (from " + parent.nodeId + ")") && gbad.error.includes("status"), "group_by unknown column lists ancestors, got " + gbad.error);
  // a plain filter below the child inherits the whole chain
  const plain = llmRun(w, "create_filter", { parentId: child.nodeId, pattern: "status=500" }).result;
  const viaPlain = llmRun(w, "get_value_stats", { nodeId: plain.nodeId, column: "completed" });
  assert(!viaPlain.error && viaPlain.result.n === plain.matches, "a non-extraction filter below the chain sees the same columns");
  // the Table view is unchanged: nearest extraction only
  const ex = w.llmExtractRows(T.state.nodes[child.nodeId]);
  assert(ex.columns.length === 1, "llmExtractRows(...).columns stays the nearest extraction's");
  // a node without any extraction: unchanged error
  assert(llmRun(w, "get_value_stats", { nodeId: f.id }).error.includes("no extraction pattern"), "plain node: no extraction error");
});

await withApp(async (w, d, T) => {
  section("llm-analysis-friction b. pattern ids and link nodes with placeholder columns");
  const f = await llmSimFile(w, ["motion", "sensors", "basic"], 3000, 4);
  const mt = llmRun(w, "find_message_types", { query: "Position reached" }).result.types[0];
  const pid = mt.patternId;
  const cols = w.compileExtractPattern(mt.pattern).columns;
  const axisName = cols[0].name;
  const byAxis = {};
  f.entries.filter(e => e.message.startsWith("Position reached")).forEach(e => { const a = /axis=(\d+)/.exec(e.message)[1]; byAxis[a] = (byAxis[a] || 0) + 1; });
  for (const column of [axisName, "1"]) {
    const g = llmRun(w, "group_by", { nodeId: pid, column });
    assert(!g.error && g.result.total === mt.count && g.result.values.every(v => v.count === byAxis[v.value]), "group_by pattern id by placeholder column " + column + ", got " + JSON.stringify(g.error || g.result.values.slice(0, 2)));
  }
  const nodes = Object.keys(T.state.nodes).length;
  const actualName = cols[1].name;
  const vs = llmRun(w, "get_value_stats", { nodeId: pid, column: actualName });
  const actuals = f.entries.filter(e => e.message.startsWith("Position reached")).map(e => +/actual=(-?[\d.]+)/.exec(e.message)[1]);
  assert(!vs.error && vs.result.nodeId === pid && vs.result.n === actuals.length && vs.result.min === Math.min(...actuals) && vs.result.max === Math.max(...actuals), "get_value_stats accepts a pattern id: " + JSON.stringify(vs));
  assert(Object.keys(T.state.nodes).length === nodes, "creates no node");
  assert(llmRun(w, "group_by", { nodeId: pid, column: "thread" }).result.total === mt.count, "facet columns still work on a pattern id");
  const bad = llmRun(w, "group_by", { nodeId: pid, column: "nonsense" });
  assert(bad.error.includes(axisName) && bad.error.includes("create_filter with patternId"), "unknown column on a pattern id lists placeholders and names the fix, got " + bad.error);
  assert(llmRun(w, "get_value_stats", { nodeId: "p9999" }).error.includes("Unknown pattern id"), "unknown pattern id");
  // a link node grouped by an extraction column
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const l = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "job=[*]" }).result;
  const gl = llmRun(w, "group_by", { nodeId: l.nodeId, column: "axis" });
  assert(gl.error && gl.error.includes("create an extraction filter under the link") && gl.error.includes("parentId = the link node"), "link + extraction column: error names the fix, got " + gl.error);
  const sl = llmRun(w, "get_value_stats", { nodeId: l.nodeId, column: "1" });
  assert(sl.error && sl.error.includes("under the link"), "get_value_stats on a link: same hint, got " + sl.error);
  const under = llmRun(w, "create_filter", { parentId: l.nodeId, pattern: "Position reached axis=[*:int] actual=[*:float]" }).result;
  assert(llmRun(w, "group_by", { nodeId: under.nodeId, column: "1" }).result.total === under.matches, "…and the suggested extraction filter under the link can be grouped");
});

await withApp(async (w, d, T) => {
  section("llm-analysis-friction c. find_message_types: smart case");
  const f = await llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);
  const types = q => llmRun(w, "find_message_types", { query: q, limit: 40 }).result.types.map(t => t.type);
  const lower = types("move requested");
  assert(lower.length > 0 && lower.every(t => /move requested/i.test(t)), "lowercase query: case-insensitive, " + lower.length + " types");
  const upper = types("Move requested");
  assert(upper.length > 0 && upper.every(t => t.includes("Move requested")), "query with an uppercase letter matches case-sensitively");
  assert(types("MOVE REQUESTED").length === 0, "all caps matches nothing when the text is not all caps");
  const get = types("get"), GET = types("GET");
  assert(GET.every(t => t.includes("GET")) && get.length >= GET.length && get.some(t => !t.includes("GET")), "\"get\" is a superset of \"GET\" (matches e.g. target=), got " + get.length + "/" + GET.length);
});

await withApp(async (w, d, T) => {
  section("llm-analysis-friction d. what_changed keeps a lone new ERROR type");
  const f = await llmSimFile(w, ["bursts", "basic"], 1200, 2);
  const sat = f.entries.filter(e => e.message.startsWith("Connection pool saturated"));
  assert(sat.length === 1 && sat[0].level === "ERROR", "reference scenario: one 'pool saturated' ERROR line");
  const node = llmRun(w, "create_filter", { parentId: f.id, pattern: "Connection pool saturated" }).result;
  const r = llmRun(w, "what_changed", { aNodeId: node.nodeId }).result;
  assert(r.new.length === 1 && r.new[0].countA === 1 && r.new[0].countB === 0 && r.new[0].type.startsWith("Connection pool saturated"), "tool: the lone new ERROR type is listed, got " + JSON.stringify(r.new));
  assert(!r.note, "…so no 'nothing differs' note");
  // engine: default unchanged, keepSevere keeps it; a lone WARN/INFO type stays hidden
  const rest = f.entries.filter(e => !e.message.startsWith("Connection pool saturated"));
  assert(w.analysisWhatChanged(sat, rest, {}).new.length === 0, "engine default: below minCount is dropped (contract unchanged)");
  assert(w.analysisWhatChanged(sat, rest, { keepSevere: true }).new.length === 1, "engine keepSevere: kept");
  const warn = f.entries.find(e => e.level === "WARN");
  const restW = f.entries.filter(e => w.normalizeMessagePattern(e.message) !== w.normalizeMessagePattern(warn.message));
  assert(w.analysisWhatChanged([warn], restW, { keepSevere: true }).new.length === 0, "a lone new WARN type stays hidden even with keepSevere");
  const info = f.entries.find(e => e.level === "INFO");
  const restI = f.entries.filter(e => w.normalizeMessagePattern(e.message) !== w.normalizeMessagePattern(info.message));
  assert(w.analysisWhatChanged([info], restI, { keepSevere: true }).new.length === 0, "a lone new INFO type stays hidden");
  // a type that also occurs in B is not 'new', however severe
  const errB = f.entries.filter(e => e.level === "ERROR");
  assert(errB.length > 1 && w.analysisWhatChanged([errB[0]], f.entries.filter(e => e !== errB[0]), { keepSevere: true }).new.every(x => x.countB === 0), "keepSevere only affects the 'new' group (countB = 0)");
});

await withApp(async (w, d, T) => {
  section("llm-analysis-friction e. create_link: unpairedFollowedBy note");
  const f = await llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached" }).result;
  const l = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "job=[*]" }).result;
  assert(Array.isArray(l.unpairedFollowedBy) && /overlap/.test(l.note) && /sum|add up/.test(l.note), "note next to unpairedFollowedBy, got " + l.note);
  const l2 = llmRun(w, "create_link", { refId: done.nodeId, targetId: req.nodeId, direction: "before", key: "job=[*]" }).result;
  assert(l2.unpaired === 0 && l2.unpairedFollowedBy === undefined && l2.note === undefined, "no unpairedFollowedBy → no note");
  const def = w.eval("LLM_TOOLS").find(t => t.name === "create_link");
  assert(def.description.includes("overlap") && w.eval("LLM_TOOLS").find(t => t.name === "what_changed").description.includes("ERROR/FATAL"), "tool descriptions updated");
});
