// GROUP llm-what-changed — LLM analysis tools, phase 2 (docs/concept-llm-analysis-tools.md
// → 2.2): the analysisWhatChanged engine (new / more / rarer / gone with
// Expected = countB × durationA ÷ durationB, ≥ 3 occurrences) and the
// what_changed tool (A = node, pattern id or time window; B = rest of the
// file, another node or window).
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim (all,-text,-gaps seed 7; motion/sensors/basic).
group("llm-what-changed");

const countBy = entries => {
  const m = new Map();
  for (const e of entries) { const k = LLMW.normalizeMessagePattern(e.message); m.set(k, (m.get(k) || 0) + 1); }
  return m;
};
let LLMW = null;

await withApp(async (w, d, T) => {
  LLMW = w;
  section("llm-what-changed a. a burst against the rest of the file");
  const f = await llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);
  const lv = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
  const b = llmRun(w, "timeline", { nodeId: lv.id }).result.bursts[1];
  const nodes = Object.keys(T.state.nodes).length;
  const res = llmRun(w, "what_changed", { aFrom: b.from, aTo: b.to });
  const r = res.result;
  assert(!res.error && Object.keys(T.state.nodes).length === nodes, "what_changed reads only");
  const inA = f.entries.filter(e => w.llmTime(f.id, e.ts) >= b.from && w.llmTime(f.id, e.ts) <= b.to);
  assert(r.a.entries === inA.length && r.b.entries === 6000 - inA.length && r.b.what === "rest of file", "A = the entries of the window, B = the rest of the file");
  assert(r.b.seconds > 400 && r.a.seconds < 3, "durations in seconds: the burst ~1 s, the rest ~ the file span");
  const pool = r.more.find(x => x.type.startsWith("Connection pool exhausted"));
  assert(pool, "the pool warnings are 'more' in the burst, got " + JSON.stringify(r.more.map(x => x.type)));
  const ca = countBy(inA), cb = countBy(f.entries.filter(e => !inA.includes(e)));
  const key = [...ca.keys()].find(k => w.patternDisplayText(k) === pool.type);
  assert(pool.countA === ca.get(key) && pool.countB === cb.get(key), "countA / countB equal an independent count (" + ca.get(key) + "/" + cb.get(key) + ")");
  const expPool = pool.countB * (inA[inA.length - 1].ts - inA[0].ts) / (r.b.seconds * 1000);
  assert(pool.factor > 10 && Math.abs(pool.expected - expPool) < 0.3, "factor is large, Expected ≈ countB × durationA ÷ durationB (" + expPool.toFixed(2) + "), got " + pool.expected);
  assert(r.more.every(x => x.countA >= 3 && x.factor >= 2), "every 'more' row: countA ≥ 3 and factor ≥ 2");
  assert(/^p\d+$/.test(pool.patternId) && /^e\d+$/.test(pool.example), "patternId and example entry id");
  assert(r.new.every(x => x.countB === 0 && x.countA >= 3) && r.gone.every(x => x.countA === 0 && x.expected >= 3) && r.rarer.every(x => x.expected >= 3), "group rules hold for every row");
  const viaNode = llmRun(w, "what_changed", { aNodeId: llmRun(w, "create_window", { from: b.from, to: b.to }).result.nodeId }).result;
  assert(viaNode.a.entries === inA.length && viaNode.more.length === r.more.length, "A as a time-window node gives the same contrast");
  // explicit B window
  const bb = llmRun(w, "what_changed", { aFrom: b.from, aTo: b.to, bFrom: "08:00:10", bTo: "08:01:00" }).result;
  assert(bb.b.what === "file f1" && bb.b.entries > 0 && bb.b.entries < 1000 && Math.abs(bb.b.seconds - 50) < 0.5, "B as an explicit window of the file (50 s)");
  // pattern id as A: all entries of one type against the rest
  const pid = llmRun(w, "find_message_types", { query: "Connection pool" }).result.types[0].patternId;
  const pa = llmRun(w, "what_changed", { aNodeId: pid }).result;
  assert(pa.a.entries === ca.get(key) + cb.get(key) && !pa.more.some(x => x.type.startsWith("Connection pool")), "a pattern id as A");
});

await withApp(async (w, d, T) => {
  LLMW = w;
  section("llm-what-changed b. two files: new and gone types");
  const f1 = await llmSimFile(w, ["motion", "basic"], 2500, 1);
  const f2 = await llmSimFile(w, ["sensors", "basic"], 2500, 2);
  const r = llmRun(w, "what_changed", { aNodeId: f1.id, bNodeId: f2.id }).result;
  assert(r.a.entries === 2500 && r.b.entries === 2500, "A and B are the two files");
  assert(r.new.length > 0 && r.new.every(x => /Move|Position/.test(x.type)) && r.new.some(x => x.type.startsWith("Move requested")), "motion types are new in A, got " + JSON.stringify(r.new.map(x => x.type)));
  assert(r.gone.length > 0 && r.gone.every(x => /Sensor/.test(x.type)), "sensor types are gone, got " + JSON.stringify(r.gone.map(x => x.type)));
  assert(r.gone.every(x => x.countA === 0 && x.countB >= 3 && x.factor === 0), "gone rows: countA 0, factor 0");
  assert(r.new.every(x => x.factor === null && x.expected === 0), "new rows: nothing expected, factor null");
  const seconds = e => (e[e.length - 1].ts - e[0].ts);
  const gone = r.gone[0];
  const expected = gone.countB * seconds(f1.entries) / seconds(f2.entries);
  assert(Math.abs(gone.expected - expected) < 0.06, "Expected = countB × durationA ÷ durationB (" + expected.toFixed(1) + "), got " + gone.expected);
  assert(r.a.seconds === Math.round(seconds(f1.entries) / 100) / 10, "A's duration is the file's span");
});

await withApp(async (w, d, T) => {
  LLMW = w;
  section("llm-what-changed c. errors");
  const f = await llmSimFile(w, ["motion", "basic"], 800, 3);
  assert(llmRun(w, "what_changed", {}).error.includes("aNodeId"), "nothing to examine → error naming the parameters");
  assert(llmRun(w, "what_changed", { aFrom: "yesterday" }).error.includes("not a time"), "unreadable time → error");
  assert(llmRun(w, "what_changed", { aNodeId: "n424242" }).error.includes("Unknown node"), "unknown node");
  assert(llmRun(w, "what_changed", { aNodeId: "p9999" }).error.includes("find_message_types again"), "unknown pattern id");
  assert(llmRun(w, "what_changed", { aNodeId: f.id, bTo: "nope" }).error.includes("bTo"), "bad B time names bTo");
  const same = llmRun(w, "what_changed", { aNodeId: f.id }).result;
  assert(same.a.entries === 800 && same.b.entries === 0, "A = the whole file leaves an empty B");
});

await withApp(async (w, d, T) => {
  LLMW = w;
  section("llm-what-changed d. analysisWhatChanged engine");
  const f = await llmSimFile(w, ["motion", "basic"], 3000, 4);
  const aborts = f.entries.filter(e => e.message.startsWith("Move aborted")).slice(0, 2);
  const beats = f.entries.filter(e => e.message.startsWith("Heartbeat")).slice(0, 12);
  const A = aborts.concat(beats).sort((x, y) => x.ts - y.ts);
  const B = f.entries.filter(e => !A.includes(e));
  const r = w.analysisWhatChanged(A, B, { durationAMs: 6000, durationBMs: 600000 });
  assert(r.a.entries === A.length && r.a.durationMs === 6000 && r.b.durationMs === 600000, "durations from opts");
  assert(!r.new.some(x => x.key.startsWith("Move aborted")) && !r.more.some(x => x.key.startsWith("Move aborted")), "a type with only 2 occurrences in A is not reported");
  const hb = [...r.more, ...r.rarer, ...r.new].find(x => x.key.startsWith("Heartbeat"));
  assert(hb && hb.countA === 12, "12 heartbeats in A are reported, got " + JSON.stringify(hb && hb.countA));
  const row = r.more.concat(r.new)[0];
  assert(row.key && typeof row.floatMask === "number" && row.example && "countB" in row && "expected" in row && "factor" in row, "row shape");
  const lo = w.analysisWhatChanged(A, B, { durationAMs: 6000, durationBMs: 600000, minCount: 1 });
  assert(lo.new.some(x => x.key.startsWith("Move aborted")) || lo.more.some(x => x.key.startsWith("Move aborted")), "minCount 1 lets the 2-occurrence type through");
  assert(r.more.every((x, i) => i === 0 || Math.abs(Math.log((r.more[i - 1].countA + 0.5) / (r.more[i - 1].expected + 0.5))) * Math.sqrt(Math.max(r.more[i - 1].countA, r.more[i - 1].expected)) >= Math.abs(Math.log((x.countA + 0.5) / (x.expected + 0.5))) * Math.sqrt(Math.max(x.countA, x.expected)) - 1e-9), "rows are ranked by |ln factor| × √count");
  const empty = w.analysisWhatChanged([], []);
  assert(empty.new.length + empty.more.length + empty.rarer.length + empty.gone.length === 0, "empty sets");
});
