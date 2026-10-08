// GROUP llm-timeline — LLM analysis tools, phase 2 (docs/concept-llm-analysis-tools.md
// → 2.1): the analysisTimeline engine (buckets, per-second bursts merged and
// trimmed to the real first/last entry) and the timeline tool on top of it.
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim: -s all,-text,-gaps, 6000 entries, seed 7
// (docs/screenshots/generate.sh) — WARN+ERROR has four bursts.
group("llm-timeline");

const refFile = (w) => llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);

await withApp(async (w, d, T) => {
  section("llm-timeline a. bursts of the WARN+ERROR node");
  const f = await refFile(w);
  const lv = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
  const res = llmRun(w, "timeline", { nodeId: lv.id });
  const r = res.result;
  assert(!res.error && r.nodeId === lv.id && r.entries === w.getEntries(lv.id).length, "result names the node and counts its entries");
  assert(r.bursts.length === 4, "four bursts (reference: 08:00:03, 08:01:41, 08:03:30, 08:06:06), got " + r.bursts.map(b => b.from).join(" | "));
  const entries = w.getEntries(lv.id);
  for (const b of r.bursts) {
    const inside = entries.filter(e => w.llmTime(f.id, e.ts) >= b.from && w.llmTime(f.id, e.ts) <= b.to);
    assert(inside.length === b.count, "burst " + b.from + ": count " + b.count + " = the entries between its from/to, got " + inside.length);
    assert(w.llmTime(f.id, inside[0].ts) === b.from && w.llmTime(f.id, inside[inside.length - 1].ts) === b.to, "burst window is trimmed to its real first/last entry");
    assert(b.factor >= 4 && Object.values(b.levels).reduce((s, n) => s + n, 0) === b.count, "factor ≥ 4, levels add up");
    assert(b.topTypes.length >= 1 && b.topTypes.length <= 3 && /^p\d+$/.test(b.topTypes[0].patternId), "top types with pattern ids");
  }
  assert(r.bursts.map(b => b.from.slice(11, 19)).join() === "08:00:03,08:01:41,08:03:30,08:06:06", "burst start seconds equal the reference");
  assert(r.bursts[1].count === 73 && r.bursts[2].count === 61, "bursts 2 and 3 have the reference sizes (73, 61)");
  assert(r.bursts[1].topTypes[0].type.startsWith("Connection pool exhausted"), "the pool warnings lead the burst");
  const ge = llmRun(w, "get_entries", { nodeId: r.bursts[1].topTypes[0].patternId, max: 1 }).result;
  assert(ge.entries[0].message.startsWith("Connection pool exhausted"), "topTypes patternId resolves as a virtual node");
  assert(r.counts.length === 40 && r.counts.reduce((s, n) => s + n, 0) === r.entries, "40 buckets by default, counts add up");
  assert(r.usualPerSec >= 1 && r.bucketMs > 0 && r.from < r.to && r.tip.includes("create_window"), "usual rate, bucket width, span and a next-step tip");

  const whole = llmRun(w, "timeline", { nodeId: f.id }).result;
  assert(whole.bursts.length === 2, "the whole file has two bursts, got " + whole.bursts.length);
  assert(llmRun(w, "timeline", { nodeId: f.id, buckets: 500 }).result.counts.length === 120, "buckets are capped at 120");
  assert(llmRun(w, "timeline", { nodeId: f.id, buckets: 7 }).result.counts.length === 7, "buckets honoured");
  assert(llmRun(w, "timeline", {}).result.nodeId === T.state.activeId, "default: the active node");
  assert(llmRun(w, "timeline", { nodeId: "n424242" }).error.includes("Unknown node"), "unknown node → error");
  const nodes = Object.keys(T.state.nodes).length;
  llmRun(w, "timeline", { nodeId: f.id });
  assert(Object.keys(T.state.nodes).length === nodes, "timeline creates no node");
  const pid = llmRun(w, "find_message_types", { query: "Connection pool" }).result.types[0].patternId;
  const byPattern = llmRun(w, "timeline", { nodeId: pid }).result;
  assert(byPattern.nodeId === pid && byPattern.entries === f.entries.filter(e => e.message.startsWith("Connection pool exhausted")).length, "a pattern id works as the node");
});

await withApp(async (w, d, T) => {
  section("llm-timeline b. analysisTimeline engine");
  const f = await refFile(w);
  const tl = w.analysisTimeline(f.entries, { buckets: 10 });
  assert(tl.entries === 6000 && tl.from === f.entries[0].ts && tl.to === f.entries[5999].ts && tl.counts.length === 10 && tl.buckets === 10, "shape: entries, from/to as ts, buckets");
  assert(Math.abs(tl.bucketMs - (tl.to - tl.from) / 10) < 1e-6, "bucketMs = span ÷ buckets");
  assert(tl.bursts.every(b => typeof b.from === "number" && b.to >= b.from && b.count >= 5 && b.seconds >= 1 && b.topPatterns.length <= 3 && b.topPatterns[0].key), "burst rows: ts bounds, count, seconds, topPatterns with keys");
  // Independent re-count: seconds with ≥ 5 and ≥ 4× median of the non-empty seconds.
  const perSec = new Map();
  f.entries.forEach(e => { const s = Math.floor(e.ts / 1000); perSec.set(s, (perSec.get(s) || 0) + 1); });
  const sorted = [...perSec.values()].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const burstSecs = [...perSec].filter(([, n]) => n >= 5 && n >= 4 * med).map(([s]) => s).sort((a, b) => a - b);
  const groups = burstSecs.reduce((g, s, i) => { if (i && s === burstSecs[i - 1] + 1) g[g.length - 1].push(s); else g.push([s]); return g; }, []);
  assert(tl.usualPerSec === med && tl.bursts.length === groups.length, "same bursts as an independent per-second count (" + groups.length + ")");
  assert(tl.bursts.every((b, i) => b.seconds === groups[i].length && b.count === groups[i].reduce((s, x) => s + perSec.get(x), 0)), "burst sizes equal the merged seconds' entries");
  const empty = w.analysisTimeline([], {});
  assert(empty.entries === 0 && empty.bursts.length === 0 && empty.counts.length === 0 && empty.from === null, "empty input");
  const one = w.analysisTimeline([f.entries[0]], {});
  assert(one.entries === 1 && one.counts.reduce((s, n) => s + n, 0) === 1 && one.bursts.length === 0, "one entry: one count, no burst");
  assert(w.analysisTimeline(f.entries, { buckets: 9999 }).counts.length === 120, "engine caps buckets at 120");
});

await withApp(async (w, d, T) => {
  section("llm-timeline c. plain-text file has no time axis");
  const [doc] = LOGSIM.generateToStrings({ format: "plain", entries: 200, seed: 6 });
  const f = await w.addFile(doc.name, doc.text, () => {}, "fmt-plaintext");
  const r = llmRun(w, "timeline", { nodeId: f.id }).result;
  assert(r.entries > 0 && r.bursts.length === 0 && /Plain-text/.test(r.note) && /^line \d+/.test(r.from), "line numbers, no bursts, a note");
});
