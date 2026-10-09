// GROUP llm-entries-full — LLM analysis tools, phase 1 (docs/archive/concept-llm-analysis-tools.md
// → 1.3): get_entries with ids: [...] (≤ 20) and full: true — every line of
// a message (a very long one keeps its head and tail), plus thread/location/
// method and the file. Without full nothing changed.
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim (stacktrace, pytrace, ids).
group("llm-entries-full");

await withApp(async (w, d, T) => {
  section("llm-entries-full a. full: true on multi-line entries");
  const f = await llmSimFile(w, ["stacktrace", "pytrace", "basic"], 1500, 3);
  const multi = f.entries.filter(e => e.message.includes("\n"));
  assert(multi.length >= 3, "the simulator produced multi-line entries (" + multi.length + ")");
  const e0 = multi.reduce((a, b) => (b.message.split("\n").length > a.message.split("\n").length ? b : a));
  const lines = e0.message.split("\n");
  const short = llmRun(w, "get_entries", { ids: [e0.id] }).result;
  assert(short.entries.length === 1 && short.entries[0].message.length <= 201 && !short.entries[0].message.includes("\n"), "without full: first line, cut to 200 chars (unchanged)");
  const res = llmRun(w, "get_entries", { ids: [e0.id], full: true });
  const e = res.result.entries[0];
  assert(!res.error && e.id === e0.id && e.lines === lines.length && e.message.split("\n").length === lines.length, "full: all " + lines.length + " lines");
  assert(e.message === lines.join("\n") || lines.some(l => l.length > 300), "the message text is complete");
  assert(e.thread === e0.thread && e.file === f.name, "thread and file name, got " + e.thread + " / " + e.file);
  if (e0.location) assert(e.location === e0.location, "location");
  assert(e.time && e.level === e0.level, "time and level");
  const viaNode = llmRun(w, "get_entries", { nodeId: f.id, from: f.entries.indexOf(e0), max: 1, full: true }).result;
  assert(viaNode.entries[0].id === e0.id && viaNode.entries[0].lines === lines.length, "full works with nodeId/from/max too");
  const plain = f.entries.find(x => !x.message.includes("\n"));
  const p = llmRun(w, "get_entries", { ids: [plain.id], full: true }).result.entries[0];
  assert(p.lines === 1 && p.message === plain.message, "a single-line entry: one line");
});

await withApp(async (w, d, T) => {
  section("llm-entries-full b. long messages keep head and tail");
  const f = await llmSimFile(w, ["basic"], 200, 4);
  const target = f.entries[10];
  const big = Array.from({ length: 100 }, (_, i) => "  at Frame.line" + (i + 1)).join("\n");
  target.message = "Boom\n" + big; // 101 lines
  const e = llmRun(w, "get_entries", { ids: [target.id], full: true }).result.entries[0];
  const out = e.message.split("\n");
  assert(e.lines === 101 && out.length === 15 + 1 + 30, "101 lines → first 15 + marker + last 30, got " + out.length);
  assert(out[0] === "Boom" && out[14] === "  at Frame.line14" && out[15] === "… 56 lines …" && out[16] === "  at Frame.line71" && out[45] === "  at Frame.line100", "head, '… 56 lines …', tail (innermost frame last)");
  target.message = Array.from({ length: 60 }, (_, i) => "l" + i).join("\n");
  assert(llmRun(w, "get_entries", { ids: [target.id], full: true }).result.entries[0].message.split("\n").length === 60, "exactly 60 lines are not cut");
  target.message = "x".repeat(1000);
  assert(llmRun(w, "get_entries", { ids: [target.id], full: true }).result.entries[0].message.length === 301, "a single huge line is cut to 300 chars + …");
});

await withApp(async (w, d, T) => {
  section("llm-entries-full c. ids: limits, unknown ids, budget");
  const f = await llmSimFile(w, ["stacktrace", "basic"], 1200, 5);
  const some = f.entries.slice(5, 10).map(e => e.id);
  const r = llmRun(w, "get_entries", { ids: some }).result;
  assert(r.entries.map(e => e.id).join() === some.join() && r.total === undefined, "ids: those entries, in the order asked");
  const mixed = llmRun(w, "get_entries", { ids: [some[0], "e99999999"] }).result;
  assert(mixed.entries.length === 1 && mixed.unknown.join() === "e99999999", "unknown ids are listed, the rest returned");
  assert(llmRun(w, "get_entries", { ids: ["e99999999"] }).error.includes("Unknown entry"), "only unknown ids → error");
  assert(llmRun(w, "get_entries", { ids: f.entries.slice(0, 21).map(e => e.id) }).error.includes("At most 20"), "more than 20 ids refused");
  assert(llmRun(w, "get_entries", { ids: [] }).error, "empty ids refused");
  assert(llmRun(w, "get_entries", { ids: some[0] }).result.entries.length === 1, "a single id string is accepted");
  const multi = f.entries.filter(e => e.message.split("\n").length > 10).slice(0, 20).map(e => e.id);
  const big = llmRun(w, "get_entries", { ids: multi, full: true });
  assert(big.text.length <= 6000, "20 full entries still fit the budget (" + big.text.length + " chars)");
  assert(w.llmToolSpecs().find(s => s.function.name === "get_entries").function.parameters.properties.ids, "the tool spec advertises ids/full");
});
