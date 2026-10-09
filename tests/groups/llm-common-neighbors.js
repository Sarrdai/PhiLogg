// GROUP llm-common-neighbors — LLM analysis tools, phase 2 (docs/archive/concept-llm-analysis-tools.md
// → 2.3): the common_neighbors tool over analysisNeighbors — what stands
// before/after the entries of a node, ranked by coverage then lift, only
// lift ≥ minLift unless showAll, at most 12 rows.
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim: -s causechain,basic (pool warnings 0.5–2 s
// before "Order processing failed" on the same thread in ~80 % of cases).
group("llm-common-neighbors");

await withApp(async (w, d, T) => {
  section("llm-common-neighbors a. the cause chain is found");
  const f = await llmSimFile(w, ["causechain", "basic"], 4000, 3);
  const ex = llmRun(w, "create_filter", { parentId: f.id, pattern: "Order processing failed" }).result;
  const nodes = Object.keys(T.state.nodes).length;
  const res = llmRun(w, "common_neighbors", { nodeId: ex.nodeId });
  const r = res.result;
  assert(!res.error && Object.keys(T.state.nodes).length === nodes, "reads only");
  assert(r.references === ex.matches && r.direction === "before" && r.windowMs === 5000 && r.sameThread === true && r.minLift === 2, "defaults: before, 5000 ms, same thread, lift ≥ 2");
  const top = r.neighbors[0];
  assert(top && top.type.startsWith("Connection pool exhausted") && top.lift >= 2 && top.maxLevel === "WARN", "the pool warning ranks first with lift ≥ 2, got " + JSON.stringify(top));
  const [n, m] = top.coverage.split("/").map(Number);
  assert(m === r.references && n / m > 0.7 && n / m < 0.9, "coverage ≈ 80 % (" + top.coverage + ")");
  assert(top.inWindows >= n && top.medianDistMs >= 400 && top.medianDistMs <= 2100, "median distance 0.5–2 s, got " + top.medianDistMs);
  assert(/^e\d+$/.test(top.example) && /^p\d+$/.test(top.patternId), "example entry and pattern id");
  assert(r.neighbors.every(x => x.lift >= 2), "only lift ≥ 2 by default");
  assert(r.neighbors.every((x, i) => i === 0 || r.neighbors[i - 1].coverage.split("/")[0] * 1 >= x.coverage.split("/")[0] * 1), "sorted by coverage");
  assert(r.tip.includes("create_window") && r.tip.includes("5000"), "tip names the follow-up");
  // brute-force the top row
  const ex1 = f.entries.filter(e => e.message.startsWith("Order processing failed"));
  let covered = 0;
  for (const x of ex1) if (f.entries.some(e => e.thread === x.thread && e.ts >= x.ts - 5000 && e.ts < x.ts && e.message.startsWith("Connection pool exhausted"))) covered++;
  assert(n === covered, "coverage equals an independent count (" + covered + ")");
});

await withApp(async (w, d, T) => {
  section("llm-common-neighbors b. options");
  const f = await llmSimFile(w, ["causechain", "basic"], 4000, 3);
  const ex = llmRun(w, "create_filter", { parentId: f.id, pattern: "Order processing failed" }).result;
  const all = llmRun(w, "common_neighbors", { nodeId: ex.nodeId, showAll: true, sameThread: false }).result;
  assert(all.neighbors.length > 3 && all.neighbors.length <= 12, "showAll lists more types, at most 12, got " + all.neighbors.length);
  assert(all.neighbors.some(x => x.significant === false) && all.neighbors.every(x => typeof x.significant === "boolean"), "showAll marks significance, everyday types are below the lift");
  assert(all.neighbors.find(x => /^Heartbeat/.test(x.type) || /^Queue depth/.test(x.type)).lift < 2, "heartbeat / queue depth have a lift near 1");
  const after = llmRun(w, "common_neighbors", { nodeId: ex.nodeId, direction: "after", windowMs: 1000 }).result;
  assert(after.direction === "after" && !after.neighbors.some(x => x.type.startsWith("Connection pool")), "after the failure: no pool warnings");
  assert(after.hint || after.neighbors.length >= 0, "a hint when nothing stands out");
  const short = llmRun(w, "common_neighbors", { nodeId: ex.nodeId, windowMs: 100 }).result;
  assert(!short.neighbors.some(x => x.type.startsWith("Connection pool")), "a 100 ms window is too short for the chain (0.5–2 s)");
  assert(short.hint && short.hint.includes("windowMs"), "…and says what to try");
  const strict = llmRun(w, "common_neighbors", { nodeId: ex.nodeId, minLift: 100000 }).result;
  assert(strict.neighbors.length === 0 && strict.hint, "minLift very high → no rows, hint");
  const pid = llmRun(w, "find_message_types", { query: "Order processing failed" }).result.types[0].patternId;
  const viaPattern = llmRun(w, "common_neighbors", { nodeId: pid }).result;
  assert(viaPattern.references === ex.matches && viaPattern.neighbors[0].type.startsWith("Connection pool"), "a pattern id works as the references");
  const link = llmRun(w, "create_filter", { parentId: f.id, pattern: "Connection pool exhausted" }).result;
  const lk = llmRun(w, "create_link", { refId: link.nodeId, targetId: ex.nodeId, direction: "after", key: "thread" }).result;
  assert(llmRun(w, "common_neighbors", { nodeId: lk.nodeId }).result.references === lk.pairs, "a link node: one reference per pair");
  assert(llmRun(w, "common_neighbors", { nodeId: ex.nodeId, windowMs: -5 }).error.includes("windowMs"), "bad windowMs → error");
  assert(llmRun(w, "common_neighbors", { nodeId: "n424242" }).error.includes("Unknown node"), "unknown node");
  assert(llmRun(w, "common_neighbors", { nodeId: "p9999" }).error.includes("find_message_types again"), "unknown pattern id");
  const none = llmRun(w, "create_filter", { parentId: f.id, pattern: "nothing like this" }).result;
  assert(llmRun(w, "common_neighbors", { nodeId: none.nodeId }).result.note, "a node without entries → note");
});

await withApp(async (w, d, T) => {
  section("llm-common-neighbors c. same data, other windows (create_window materialises)");
  const f = await llmSimFile(w, ["causechain", "basic"], 3000, 5);
  const ex = llmRun(w, "create_filter", { parentId: f.id, pattern: "Order processing failed" }).result;
  const win = llmRun(w, "create_window", { aroundNodeId: ex.nodeId, beforeMs: 2000 }).result;
  const ctx = w.getEntries(win.nodeId);
  const pool = f.entries.filter(e => e.message.startsWith("Connection pool exhausted"));
  assert(pool.filter(p => ctx.includes(p)).length > 0, "the context node around the failures contains pool warnings");
});
