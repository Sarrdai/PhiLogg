// GROUP llm-mcp-friction — LLM/MCP analysis tools, round H: four friction
// points of an external MCP agent. (1) create_link key accepts extraction
// column names (translated into a key pattern, reported as `key`), the
// unknown-key error lists columns + suggestions, and `job=J-[*:int]` names
// its column "job"; (2) get_value_stats groupBy (facet or extraction
// column); (3) get_value_stats sources: one statistic over several formats;
// (4) create_filter column accepts extraction columns (new extraction filter
// with that placeholder fixed).
// Origin: 2026-10-09 (person-requested, round H).
// Sample data from tools/log-sim (motion, timing, ids, sensors, basic; seeds below).
group("llm-mcp-friction");

const manualPercentile = (sorted, p) => {
  const idx = (sorted.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};
const r6 = v => +v.toPrecision(6);
const manualStats = vals => {
  const s = vals.slice().sort((a, b) => a - b);
  return { n: s.length, min: s[0], max: s[s.length - 1], median: r6(manualPercentile(s, 0.5)), p90: r6(manualPercentile(s, 0.9)), mean: r6(s.reduce((a, b) => a + b, 0) / s.length) };
};

await withApp(async (w, d, T) => {
  section("llm-mcp-friction a. create_link key by extraction column name");
  const f = await llmSimFile(w, ["motion", "timing"], 4000, 5);
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested axis=[*:int] target=[*:float] job=J-[*:int]" }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached axis=[*:int] actual=[*:float] job=J-[*:int]" }).result;
  assert(req.columns.map(c => c.name).join() === "axis,target,job", "a prefix glued to the placeholder (job=J-[*:int]) names the column after the key, got " + req.columns.map(c => c.name));
  assert(w.compileExtractPattern("job=J-[*:int]").columns[0].name === "job" && w.compileExtractPattern("job=[*:word]").columns[0].name === "job" && w.compileExtractPattern("temperature=[*:float]").columns[0].name === "temperature", "naming of the plain forms is unchanged");
  assert(w.compileExtractPattern("time=12:[*:int]").columns[0].name === "value", "no prefix rule for a digit-led literal");
  assert(req.matches > 20 && done.matches > 20, "sim produced moves");
  const viaPattern = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "job=J-[*:int]" });
  assert(!viaPattern.error && viaPattern.result.pairs > 0 && viaPattern.result.key === undefined, "pattern key: no derived key reported");
  const viaName = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "JOB" });
  assert(!viaName.error && viaName.result.key === "job=J-[*:int]", "column name (case-insensitive) reported as derived pattern, got " + JSON.stringify(viaName.error || viaName.result.key));
  assert(viaName.result.pairs === viaPattern.result.pairs && viaName.result.unpaired === viaPattern.result.unpaired, "pairs equal the key-pattern link");
  assert(T.state.nodes[viaName.result.nodeId].linkKey.pattern === "job=J-[*:int]" && !T.state.nodes[viaName.result.nodeId].linkKey.column, "stored as an ordinary pattern key");
  const manualPairs = new Set(w.getEntries(req.nodeId).map(e => /job=(J-\d+)/.exec(e.message)[1]));
  const doneJobs = new Set(w.getEntries(done.nodeId).map(e => /job=(J-\d+)/.exec(e.message)[1]));
  assert(viaName.result.pairs === [...manualPairs].filter(j => doneJobs.has(j)).length, "pair count equals the jobs present on both sides");
  const byNumber = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "3", preview: true });
  assert(!byNumber.error && byNumber.result.key === "job=J-[*:int]" && byNumber.result.pairs === viaName.result.pairs, "1-based column number works too");
  const byAxis = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "axis", preview: true });
  assert(!byAxis.error && byAxis.result.key === "axis=[*:int]", "axis -> axis=[*:int], got " + JSON.stringify(byAxis.error || byAxis.result.key));
  const facet = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "thread", preview: true });
  assert(!facet.error && facet.result.key === undefined, "a facet column stays a facet key");
  const unknown = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, key: "nonsense" });
  assert(unknown.error && unknown.error.includes("thread") && unknown.error.includes("axis") && unknown.error.includes("job") && unknown.error.includes("job=[*:word]") && unknown.error.includes("axis=[*:word]"), "unknown key lists facet columns, extraction columns and suggestions, got " + unknown.error);
  // a column only one side has: error names the derived pattern
  const http = llmRun(w, "create_filter", { parentId: f.id, pattern: "Request GET [*] completed in [*:int]ms status=[*:int]" }).result;
  const nodes = Object.keys(T.state.nodes).length;
  const none = llmRun(w, "create_link", { refId: req.nodeId, targetId: http.nodeId, key: "axis" });
  assert(none.error && none.error.includes("axis=[*:int]") && none.error.includes("0 of the " + http.matches), "side without the key: error names pattern and counts, got " + none.error);
  assert(Object.keys(T.state.nodes).length === nodes, "no node created on that error");
  // a column that needs the lead-in words ("completed in [*:int]")
  const httpDone = llmRun(w, "create_link", { refId: http.nodeId, targetId: http.nodeId, key: "completed", preview: true });
  assert(!httpDone.error && httpDone.result.key === "completed in [*:int]", "placeholder behind a space takes the words back to the previous placeholder, got " + JSON.stringify(httpDone.error || httpDone.result.key));
});

await withApp(async (w, d, T) => {
  section("llm-mcp-friction b. get_value_stats groupBy");
  const f = await llmSimFile(w, ["sensors", "timing", "basic"], 4000, 6);
  const sens = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor T[*:int] temperature=[*:float] C" }).result;
  assert(sens.columns[0].name === "T" && sens.matches > 50, "sensor extraction: " + JSON.stringify(sens.columns));
  const rows = w.getEntries(sens.nodeId).map(e => { const m = /Sensor T(\d+) temperature=(-?[\d.]+)/.exec(e.message); return { e, t: m[1], v: +m[2] }; });
  const overall = llmRun(w, "get_value_stats", { nodeId: sens.nodeId, column: "temperature" }).result;
  const grouped = llmRun(w, "get_value_stats", { nodeId: sens.nodeId, column: "temperature", groupBy: "T" });
  assert(!grouped.error && grouped.result.groupBy === "T" && grouped.result.median === overall.median && grouped.result.n === overall.n, "overall stats stay, got " + JSON.stringify(grouped.error || grouped.result).slice(0, 200));
  const byT = {};
  rows.forEach(r => { (byT[r.t] = byT[r.t] || []).push(r.v); });
  const groups = grouped.result.groups;
  assert(groups.length === Object.keys(byT).length, "one group per sensor, " + groups.length);
  let ok = true;
  for (const g of groups) {
    const m = manualStats(byT[g.value]);
    if (g.rows !== byT[g.value].length || g.n !== m.n || g.min !== m.min || g.max !== m.max || g.median !== m.median || g.mean !== m.mean || g.p90 !== m.p90) ok = false;
  }
  assert(ok, "group stats equal manual computation: " + JSON.stringify(groups[0]));
  assert(groups.every((g, i) => i === 0 || groups[i - 1].rows >= g.rows), "groups sorted by rows desc");
  assert(Object.keys(groups[0]).join() === "value,rows,n,min,median,mean,p90,max", "group fields, got " + Object.keys(groups[0]));
  // facet column groupBy
  const byLevel = llmRun(w, "get_value_stats", { nodeId: sens.nodeId, column: "temperature", groupBy: "level" }).result;
  const manualLevel = {};
  w.getEntries(sens.nodeId).forEach(e => { const l = w.makeLevelBucketer()(e.level, e.formatId); manualLevel[l] = (manualLevel[l] || 0) + 1; });
  assert(byLevel.groups.every(g => g.rows === manualLevel[g.value]) && byLevel.groups.length === Object.keys(manualLevel).length, "facet groupBy (level) counts equal manual, got " + JSON.stringify(byLevel.groups.map(g => g.value + ":" + g.rows)));
  const byThread = llmRun(w, "get_value_stats", { nodeId: sens.nodeId, column: "temperature", groupBy: "thread" });
  assert(!byThread.error && byThread.result.groups.reduce((n, g) => n + g.rows, 0) === overall.rows, "thread groupBy covers all rows");
  const bad = llmRun(w, "get_value_stats", { nodeId: sens.nodeId, column: "temperature", groupBy: "nope" });
  assert(bad.error && bad.error.includes("Unknown groupBy column") && bad.error.includes("thread") && bad.error.includes("temperature"), "unknown groupBy lists columns, got " + bad.error);
  // group_by, get_value_stats and create_filter share one resolver: same columns
  const gb = llmRun(w, "group_by", { nodeId: sens.nodeId, column: "T" }).result;
  assert(gb.column === "T" && gb.values.length === groups.length, "group_by still resolves the extraction column");
  // more than 20 groups: cut + others
  const http = llmRun(w, "create_filter", { parentId: f.id, pattern: "Request GET [*] completed in [*:int]ms status=[*:int]" }).result;
  const byMs = llmRun(w, "get_value_stats", { nodeId: http.nodeId, column: "status", groupBy: "completed" }).result;
  const distinctMs = new Set(w.getEntries(http.nodeId).map(e => /completed in (\d+)ms/.exec(e.message)[1])).size;
  assert(distinctMs > 20 && byMs.groups.length === 20 && byMs.others === distinctMs - 20, "20 groups + others, got " + byMs.groups.length + "/" + byMs.others + " of " + distinctMs);
  // a non-numeric value column: rows + value distribution per group
  const nn = llmRun(w, "get_value_stats", { nodeId: http.nodeId, column: "GET", groupBy: "status" }).result;
  assert(nn.numeric === false && nn.groups[0].rows > 0 && nn.groups[0].distribution && !("median" in nn.groups[0]), "non-numeric column: distribution per group, got " + JSON.stringify(nn.groups[0]));
  // pattern id as the node
  const mt = llmRun(w, "find_message_types", { query: "Sensor T" }).result.types[0];
  const viaPid = llmRun(w, "get_value_stats", { nodeId: mt.patternId, column: 2, groupBy: "level" });
  assert(!viaPid.error && viaPid.result.groups.length >= 1, "pattern id with groupBy, got " + JSON.stringify(viaPid.error || ""));
});

await withApp(async (w, d, T) => {
  section("llm-mcp-friction c. get_value_stats sources over several formats");
  const f = await llmSimFile(w, ["timing", "ids"], 5000, 7);
  const a = llmRun(w, "create_filter", { parentId: f.id, pattern: "Request GET [*] completed in [*:int]ms status=[*:int]" }).result;
  const b = llmRun(w, "create_filter", { parentId: f.id, pattern: "GET [*] -> [*:int] ([*:int] ms)" }).result;
  assert(a.matches > 20 && b.matches > 5, "both GET formats exist: " + a.matches + "/" + b.matches);
  const aRows = w.getEntries(a.nodeId).map(e => { const m = /completed in (\d+)ms status=(\d+)/.exec(e.message); return { ms: +m[1], st: m[2] }; });
  const bRows = w.getEntries(b.nodeId).map(e => { const m = /-> (\d+) \((\d+) ms\)/.exec(e.message); return { ms: +m[2], st: m[1] }; });
  const all = aRows.concat(bRows);
  const res = llmRun(w, "get_value_stats", { sources: [{ nodeId: a.nodeId, column: "completed", groupBy: "status" }, { nodeId: b.nodeId, column: 3, groupBy: 2 }] });
  assert(!res.error, "sources call, got " + res.error);
  const m = manualStats(all.map(r => r.ms));
  const r = res.result;
  assert(r.n === m.n && r.min === m.min && r.max === m.max && r.median === m.median && r.mean === m.mean && r.p90 === m.p90 && r.rows === all.length, "combined stats equal manual, got " + JSON.stringify(r).slice(0, 220));
  assert(r.perSource.length === 2 && r.perSource[0].nodeId === a.nodeId && r.perSource[0].column === "completed" && r.perSource[0].n === aRows.length && r.perSource[0].median === manualStats(aRows.map(x => x.ms)).median && r.perSource[1].n === bRows.length && r.perSource[1].median === manualStats(bRows.map(x => x.ms)).median, "perSource: " + JSON.stringify(r.perSource));
  assert(r.duplicatesSkipped === undefined, "no duplicates reported when none");
  const g200 = r.groups.find(g => g.value === "200");
  const m200 = manualStats(all.filter(x => x.st === "200").map(x => x.ms));
  assert(g200 && g200.rows === m200.n && g200.median === m200.median && g200.max === m200.max, "status 200 of both formats in ONE group, got " + JSON.stringify(g200));
  assert(r.groups.length === new Set(all.map(x => x.st)).size, "groups merged by value string");
  // top-level groupBy applies to each source unless the source sets its own
  const top = llmRun(w, "get_value_stats", { sources: [{ nodeId: a.nodeId, column: "completed" }, { nodeId: a.nodeId, column: "completed" }], groupBy: "level" });
  assert(!top.error && top.result.groups, "top-level groupBy applies to sources, got " + top.error);
  // an entry in several sources counts once (parent + child)
  const child = llmRun(w, "create_filter", { parentId: a.nodeId, pattern: "status=[*:int>=400]" }).result;
  const dup = llmRun(w, "get_value_stats", { sources: [{ nodeId: a.nodeId, column: "completed" }, { nodeId: child.nodeId, column: "completed" }] });
  const single = llmRun(w, "get_value_stats", { nodeId: a.nodeId, column: "completed" }).result;
  assert(!dup.error && dup.result.duplicatesSkipped === child.matches && dup.result.n === single.n && dup.result.median === single.median && dup.result.perSource[1].n === 0, "parent + child counts once (first source wins), got " + JSON.stringify(dup.error || dup.result).slice(0, 260));
  // errors name the source index
  const e1 = llmRun(w, "get_value_stats", { sources: [{ nodeId: a.nodeId, column: "completed" }, { nodeId: b.nodeId, column: "nope" }] });
  assert(e1.error && e1.error.startsWith("sources[1]:") && e1.error.includes("Unknown column"), "bad column names source 1, got " + e1.error);
  const e0 = llmRun(w, "get_value_stats", { sources: [{ nodeId: "n9999", column: 1 }, { nodeId: b.nodeId }] });
  assert(e0.error && e0.error.startsWith("sources[0]:"), "bad node names source 0, got " + e0.error);
  const eg = llmRun(w, "get_value_stats", { sources: [{ nodeId: a.nodeId, column: "completed", groupBy: "zzz" }, { nodeId: b.nodeId, column: 3 }] });
  assert(eg.error && eg.error.startsWith("sources[0]:") && eg.error.includes("groupBy"), "bad groupBy names the source, got " + eg.error);
  assert(llmRun(w, "get_value_stats", { sources: [{ nodeId: a.nodeId }] }).error.includes("2 to 8"), "one source is refused");
  assert(llmRun(w, "get_value_stats", { sources: new Array(9).fill({ nodeId: a.nodeId }) }).error.includes("2 to 8"), "nine sources are refused");
  assert(llmRun(w, "get_value_stats", { nodeId: a.nodeId, sources: [{ nodeId: a.nodeId }, { nodeId: b.nodeId }] }).error.includes("not both"), "nodeId + sources refused");
  assert(llmRun(w, "get_value_stats", {}).error.includes("nodeId"), "neither given");
  // pattern ids are valid sources
  const mt = llmRun(w, "find_message_types", { query: "GET https" }).result.types[0];
  const viaP = llmRun(w, "get_value_stats", { sources: [{ nodeId: a.nodeId, column: "completed" }, { nodeId: mt.patternId, column: 2 }] });
  assert(!viaP.error && viaP.result.perSource[1].nodeId === mt.patternId, "a pattern id works as a source, got " + (viaP.error || ""));
});

await withApp(async (w, d, T) => {
  section("llm-mcp-friction d. create_filter column = extraction column");
  const f = await llmSimFile(w, ["motion", "timing", "sensors"], 4000, 8);
  const http = llmRun(w, "create_filter", { parentId: f.id, pattern: "Request GET [*] completed in [*:int]ms status=[*:int]" }).result;
  const nStatus = w.getEntries(http.nodeId).filter(e => /status=500$/.test(e.message)).length;
  assert(nStatus > 0, "sim has status=500 lines");
  const c = llmRun(w, "create_filter", { parentId: http.nodeId, column: "status", pattern: "500" });
  assert(!c.error && c.result.matches === nStatus && c.result.tablePlot === true, "int column: matches equal manual count and Table/Plot kept, got " + JSON.stringify(c.error || c.result).slice(0, 200));
  const node = T.state.nodes[c.result.nodeId];
  assert(node.value === "Request GET [*] completed in [*:int]ms status=[*:int==500]" && node.filterType === "text" && !node.isRegex && !node.inverted, "extraction filter with an equality condition, got " + node.value);
  assert(c.result.columns.length === 3 && w.getEntries(c.result.nodeId).every(e => /status=500$/.test(e.message)), "all matches have the value");
  const stats = llmRun(w, "get_value_stats", { nodeId: c.result.nodeId, column: "status" }).result;
  assert(stats.min === 500 && stats.max === 500, "column values are the fixed value");
  // by column number, and an existing condition is replaced
  const cond = llmRun(w, "create_filter", { parentId: f.id, pattern: "Request GET [*] completed in [*:int]ms status=[*:int>=400]" }).result;
  const rep = llmRun(w, "create_filter", { parentId: cond.nodeId, column: "1", pattern: "x", preview: true });
  assert(rep.error && rep.error.includes("No such value"), "text column: value must exist, got " + JSON.stringify(rep));
  const num = llmRun(w, "create_filter", { parentId: cond.nodeId, column: "3", pattern: "500" });
  assert(!num.error && T.state.nodes[num.result.nodeId].value.endsWith("status=[*:int==500]") && num.result.matches === nStatus, "number selects the placeholder and replaces >=400, got " + JSON.stringify(num.error || T.state.nodes[num.result.nodeId].value));
  // preview creates nothing
  const before = Object.keys(T.state.nodes).length;
  const pv = llmRun(w, "create_filter", { parentId: http.nodeId, column: "status", pattern: "500", preview: true });
  assert(!pv.error && pv.result.preview && pv.result.matches === nStatus && Object.keys(T.state.nodes).length === before, "preview: same count, no node");
  // errors
  const inv = llmRun(w, "create_filter", { parentId: http.nodeId, column: "status", pattern: "500", invert: true });
  assert(inv.error && inv.error.includes("can't be inverted"), "invert refused, got " + inv.error);
  const none = llmRun(w, "create_filter", { parentId: http.nodeId, column: "status", pattern: "999" });
  assert(none.error && none.error.includes("No such value \"999\"") && /Existing values: [\d, ]+/.test(none.error), "unknown value lists existing values, got " + none.error);
  const nan = llmRun(w, "create_filter", { parentId: http.nodeId, column: "status", pattern: "abc" });
  assert(nan.error && nan.error.includes("No such value"), "non-number on a numeric column: no such value");
  const unk = llmRun(w, "create_filter", { parentId: http.nodeId, column: "T" });
  assert(unk.error, "pattern is required with column");
  const unk2 = llmRun(w, "create_filter", { parentId: http.nodeId, column: "T", pattern: "1" });
  assert(unk2.error && unk2.error.includes("thread") && unk2.error.includes("completed") && unk2.error.includes("status") && unk2.error.includes("GET"), "unknown column lists facet and extraction columns, got " + unk2.error);
  const both = llmRun(w, "create_filter", { patternId: "p1", column: "status", pattern: "500" });
  assert(both.error, "patternId + column stays an error");
  // facet columns are unchanged
  const th = w.getEntries(f.id).find(e => e.thread).thread;
  const fc = llmRun(w, "create_filter", { parentId: f.id, column: "thread", pattern: th });
  assert(!fc.error && fc.result.matches === w.getEntries(f.id).filter(e => e.thread === th).length, "facet column filter unchanged");
  // word column: replaced by the literal
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested axis=[*:int] target=[*:float] job=[*:word]" }).result;
  assert(req.columns[2].name === "job" && req.columns[2].type === "word", "word column present");
  const jobs = w.getEntries(req.nodeId).map(e => /job=(\S+)/.exec(e.message)[1]);
  const job = jobs[Math.floor(jobs.length / 2)];
  const j = llmRun(w, "create_filter", { parentId: req.nodeId, column: "job", pattern: job });
  assert(!j.error && j.result.matches === jobs.filter(x => x === job).length && j.result.tablePlot === true, "word column: matches equal manual count and Table/Plot kept, got " + JSON.stringify(j.error || j.result).slice(0, 200));
  assert(T.state.nodes[j.result.nodeId].value === "Move requested axis=[*:int] target=[*:float] job=" + job, "placeholder replaced by the literal, got " + T.state.nodes[j.result.nodeId].value);
  assert(j.result.columns.length === 2 && j.result.columns[0].name === "axis", "remaining placeholders stay columns");
  const jcase = llmRun(w, "create_filter", { parentId: req.nodeId, column: "job", pattern: job.toLowerCase(), preview: true });
  assert(!jcase.error && jcase.result.matches === j.result.matches, "case-insensitive value lookup");
  const axis = llmRun(w, "create_filter", { parentId: req.nodeId, column: "axis", pattern: "2" });
  assert(!axis.error && axis.result.matches === w.getEntries(req.nodeId).filter(e => /axis=2 /.test(e.message)).length, "int column in the middle of the pattern");
  // a value with "[*" can't become a pattern
  const sens = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor T[*:int] temperature=[*:float] C" }).result;
  const tv = llmRun(w, "create_filter", { parentId: sens.nodeId, column: "T", pattern: "1" });
  assert(!tv.error && tv.result.matches === w.getEntries(sens.nodeId).filter(e => /Sensor T1 /.test(e.message)).length, "Sensor T1 filter (the agent's original case), got " + JSON.stringify(tv.error || tv.result.matches));
  // an ancestor column by name from a deeper filter: built from the ancestor's pattern
  const low = llmRun(w, "create_filter", { parentId: http.nodeId, pattern: "status=[*:int>=400]" }).result;
  const msVal = /completed in (\d+)ms/.exec(w.getEntries(low.nodeId)[0].message)[1];
  const anc = llmRun(w, "create_filter", { parentId: low.nodeId, column: "completed", pattern: msVal });
  const ancManual = w.getEntries(low.nodeId).filter(e => new RegExp("completed in " + msVal + "ms ").test(e.message)).length;
  assert(!anc.error && anc.result.matches === ancManual && T.state.nodes[anc.result.nodeId].value === "Request GET [*] completed in [*:int==" + msVal + "]ms status=[*:int]", "ancestor column by name builds from the ancestor's pattern, got " + JSON.stringify(anc.error || T.state.nodes[anc.result.nodeId].value));
});
