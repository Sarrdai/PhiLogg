// GROUP llm-create-window — LLM analysis tools, phase 2 (docs/concept-llm-analysis-tools.md
// → 2.5): create_window builds a timerange node (from/to, parsed like the
// times the tools return) or a context node (aroundNodeId + beforeMs/afterMs).
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim (all,-text,-gaps seed 7; causechain; plain).
group("llm-create-window");

await withApp(async (w, d, T) => {
  section("llm-create-window a. from/to");
  const f = await llmSimFile(w, ["all", "-text", "-gaps"], 6000, 7);
  const lv = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
  const b = llmRun(w, "timeline", { nodeId: lv.id }).result.bursts[1];
  const res = llmRun(w, "create_window", { from: b.from, to: b.to });
  const r = res.result;
  assert(!res.error && T.state.nodes[r.nodeId].filterType === "timerange" && r.parentId === f.id && r.of === 6000, "a timerange node under the file");
  assert(r.entries === f.entries.filter(e => w.llmTime(f.id, e.ts) >= b.from && w.llmTime(f.id, e.ts) <= b.to).length && r.entries >= b.count, "the burst's window holds every entry of the second(s), ≥ the burst's own " + b.count);
  assert(T.llmCreatedNodeIds.has(r.nodeId) && /–/.test(r.name), "marked as created by the assistant, named by its window");
  const v = T.state.nodes[r.nodeId].value;
  assert(typeof v.from === "number" && typeof v.to === "number" && v.to > v.from, "numeric bounds");
  const date = b.from.slice(0, 11);
  const forms = [
    [date + "08:01:41.204", date + "08:01:42.255"],
    [date.trim() + "T08:01:41.204", date.trim() + "T08:01:42.255"],
    ["08:01:41.204", "08:01:42.255"],
    ["08:01:41.2", "08:01:42.25"],
  ];
  for (const [fr, to] of forms) {
    const x = llmRun(w, "create_window", { from: fr, to });
    assert(!x.error && T.state.nodes[x.result.nodeId].value.from <= T.state.nodes[x.result.nodeId].value.to && x.result.entries > 0, "format accepted: " + fr);
  }
  const t1 = T.state.nodes[llmRun(w, "create_window", { from: "08:01:41.204", to: "08:01:42.255" }).result.nodeId].value;
  const t2 = T.state.nodes[llmRun(w, "create_window", { from: date + "08:01:41.204", to: date + "08:01:42.255" }).result.nodeId].value;
  assert(t1.from === t2.from && t1.to === t2.to, "a time of day and a full date+time give the same bounds");
  const open = llmRun(w, "create_window", { from: "08:01:00" }).result;
  assert(T.state.nodes[open.nodeId].value.to === null && open.entries > 0 && open.entries < 6000, "from only: open end");
  const swapped = llmRun(w, "create_window", { from: "08:01:42.255", to: "08:01:41.204" }).result;
  assert(T.state.nodes[swapped.nodeId].value.from < T.state.nodes[swapped.nodeId].value.to, "swapped bounds are put in order");
  const under = llmRun(w, "create_window", { parentId: r.nodeId, from: "08:01:41.500" }).result;
  assert(T.state.nodes[under.nodeId].parentId === r.nodeId && T.state.nodes[r.nodeId].filterType === "timerange" && T.state.nodes[r.nodeId].value.from === v.from, "under a time window it adds a child; the parent is not edited");
  assert(under.of === r.entries && under.entries < under.of, "of = the parent's entries");
  const nodes = Object.keys(T.state.nodes).length;
  assert(llmRun(w, "create_window", { from: "soon" }).error.includes("not a time"), "unreadable from → error with an example");
  assert(llmRun(w, "create_window", { to: "25:99" }).error.includes("to"), "unreadable to → error");
  assert(llmRun(w, "create_window", {}).error.includes("from/to"), "nothing given → error");
  assert(llmRun(w, "create_window", { from: "08:00:00", aroundNodeId: lv.id }).error.includes("not both"), "both modes → error");
  assert(llmRun(w, "create_window", { parentId: "n424242", from: "08:00:00" }).error.includes("Unknown parent"), "unknown parent");
  assert(Object.keys(T.state.nodes).length === nodes, "errors create nothing");
  // timeline → create_window round trip equals the burst
  const tl = llmRun(w, "timeline", { nodeId: r.nodeId }).result;
  assert(tl.entries === r.entries && tl.from >= b.from.slice(0, 11) , "a timeline over the new window covers just that window");
});

await withApp(async (w, d, T) => {
  section("llm-create-window b. aroundNodeId");
  const f = await llmSimFile(w, ["causechain", "basic"], 3000, 5);
  const ex = llmRun(w, "create_filter", { parentId: f.id, pattern: "Order processing failed" }).result;
  const res = llmRun(w, "create_window", { aroundNodeId: ex.nodeId, beforeMs: 2000, afterMs: 500 });
  const r = res.result;
  const node = T.state.nodes[r.nodeId];
  assert(!res.error && node.filterType === "context" && node.parentId === ex.nodeId && node.contextBefore === 2000 && node.contextAfter === 500, "a context node under the reference node");
  const brute = f.entries.filter(e => f.entries.some(x => x.message.startsWith("Order processing failed") && e.ts >= x.ts - 2000 && e.ts <= x.ts + 500));
  assert(r.entries === brute.length && r.of === undefined, "entries = everything within −2 s / +0.5 s of a failure (" + brute.length + ")");
  assert(T.llmCreatedNodeIds.has(r.nodeId), "marked as created by the assistant");
  const dflt = llmRun(w, "create_window", { aroundNodeId: ex.nodeId }).result;
  assert(T.state.nodes[dflt.nodeId].contextBefore === 1000 && T.state.nodes[dflt.nodeId].contextAfter === 1000, "default ±1000 ms");
  const one = llmRun(w, "create_window", { aroundNodeId: ex.nodeId, beforeMs: 300 }).result;
  assert(T.state.nodes[one.nodeId].contextBefore === 300 && T.state.nodes[one.nodeId].contextAfter === 0, "one side only");
  assert(llmRun(w, "create_window", { aroundNodeId: f.id, beforeMs: 100 }).error.includes("filter node"), "a file can't be the reference");
  assert(llmRun(w, "create_window", { aroundNodeId: ex.nodeId, beforeMs: 0, afterMs: 0 }).error.includes("both 0"), "0/0 refused");
  assert(llmRun(w, "create_window", { aroundNodeId: ex.nodeId, beforeMs: -1 }).error.includes("non-negative"), "negative refused");
  assert(llmRun(w, "create_window", { aroundNodeId: "p1", beforeMs: 100 }).error.includes("pattern id"), "a pattern id is no reference node");
  assert(T.state.activeId === one.nodeId, "the new node becomes active");
});

await withApp(async (w, d, T) => {
  section("llm-create-window c. plain-text file: line numbers");
  const [doc] = LOGSIM.generateToStrings({ format: "plain", entries: 120, seed: 6 });
  const f = await w.addFile(doc.name, doc.text, () => {}, "fmt-plaintext");
  const tl = llmRun(w, "timeline", { nodeId: f.id }).result;
  const r = llmRun(w, "create_window", { from: "line 10", to: "20" });
  assert(!r.error && r.result.entries === 11, "line 10..20 → 11 lines, got " + JSON.stringify(r.error || r.result.entries));
  assert(llmRun(w, "create_window", { from: "08:00:00" }).error, "a clock time is no line number");
});
