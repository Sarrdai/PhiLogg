// GROUP llm-preview — LLM analysis tools, phase 1 (docs/concept-llm-analysis-tools.md
// → 1.2): create_filter / create_link with preview: true evaluate the
// condition as plain data (evaluateFilterCondition) and leave the tree, the
// active node, the assistant marker set and the undo stack untouched; the
// numbers equal the real tool's.
// Origin: 2026-10-08 (person-requested, backlog #119).
// Sample data from tools/log-sim (motion, sensors).
group("llm-preview");

function snapshot(w, T) {
  return {
    nodes: Object.keys(T.state.nodes).sort().join(","),
    active: T.state.activeId,
    undo: T.undoStack.length,
    marked: T.llmCreatedNodeIds.size,
  };
}

await withApp(async (w, d, T) => {
  section("llm-preview a. create_filter preview: no node, same numbers");
  const f = await llmSimFile(w, ["motion", "sensors"], 2000, 3);
  const before = snapshot(w, T);
  const pv = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested axis=2", preview: true });
  assert(!pv.error && pv.result.preview === true && pv.result.nodeId === undefined, "preview: flagged, no nodeId, got " + JSON.stringify(pv.error || Object.keys(pv.result)));
  assert(JSON.stringify(snapshot(w, T)) === JSON.stringify(before), "no node, no active-node change, no undo step, no assistant marker");
  const real = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested axis=2" }).result;
  assert(pv.result.matches === real.matches && pv.result.of === real.of && pv.result.matches > 0, "preview matches = the real filter's (" + real.matches + ")");
  assert(JSON.stringify(pv.result.examples) === JSON.stringify(real.examples), "same examples");
  assert(pv.result.parentId === f.id && pv.result.tablePlot === false, "parent + tablePlot reported");

  const rx = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move (requested|aborted)", mode: "regex", preview: true }).result;
  assert(rx.matches === f.entries.filter(e => /Move (requested|aborted)/.test(e.message)).length, "regex preview");
  const inv = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor", invert: true, preview: true }).result;
  assert(inv.matches === 2000 - f.entries.filter(e => e.message.includes("Sensor")).length, "inverted preview");
  const none = llmRun(w, "create_filter", { parentId: f.id, pattern: "nothing like this", preview: true }).result;
  assert(none.matches === 0 && none.hint, "no match → hint");
  const under = llmRun(w, "create_filter", { parentId: real.nodeId, pattern: "reason", preview: true }).result;
  assert(under.of === real.matches && under.parentId === real.nodeId, "preview under a filter works on the parent's entries");
  assert(llmRun(w, "create_filter", { parentId: f.id, pattern: "(", mode: "regex", preview: true }).error.startsWith("Invalid regex"), "errors are the same in preview");
});

await withApp(async (w, d, T) => {
  section("llm-preview b. extraction, patternId and column previews");
  const f = await llmSimFile(w, ["motion", "sensors"], 2000, 4);
  const pat = "Position reached axis=[*:int] actual=[*:float] job=[*]";
  const before = snapshot(w, T);
  const pv = llmRun(w, "create_filter", { parentId: f.id, pattern: pat, preview: true }).result;
  assert(pv.tablePlot === true && pv.columns.length === 3 && pv.columns[1].type === "float" && pv.sampleValues.length === 5, "extraction preview: columns + sample values");
  const real = llmRun(w, "create_filter", { parentId: f.id, pattern: pat }).result;
  assert(JSON.stringify(pv.columns) === JSON.stringify(real.columns) && JSON.stringify(pv.sampleValues) === JSON.stringify(real.sampleValues) && pv.tablePlot === real.tablePlot, "identical to the real result");
  const t = llmRun(w, "find_message_types", { query: "position reached" }).result.types[0];
  const mid = snapshot(w, T);
  const byId = llmRun(w, "create_filter", { patternId: t.patternId, preview: true }).result;
  const byCol = llmRun(w, "create_filter", { column: "thread", pattern: f.entries[0].thread, preview: true }).result;
  assert(byId.matches === t.count && byCol.matches === f.entries.filter(e => e.thread === f.entries[0].thread).length, "patternId and column previews count right");
  assert(JSON.stringify(snapshot(w, T)) === JSON.stringify(mid), "neither creates anything");
  assert(before.nodes !== mid.nodes, "(sanity) the real filter did create a node");
});

await withApp(async (w, d, T) => {
  section("llm-preview c. create_link preview");
  const f = await llmSimFile(w, ["motion", "sensors"], 3000, 5);
  const req = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested axis=[*:int] " }).result;
  const done = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached axis=[*:int] " }).result;
  const before = snapshot(w, T);
  const pv = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, direction: "after", key: "thread", preview: true });
  assert(!pv.error && pv.result.preview === true && pv.result.nodeId === undefined && pv.result.pairs > 0, "link preview: pairs, no node, got " + JSON.stringify(pv.error || pv.result));
  assert(JSON.stringify(snapshot(w, T)) === JSON.stringify(before), "no node, active node and undo stack untouched");
  const real = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, direction: "after", key: "thread" }).result;
  for (const k of ["pairs", "references", "unpaired"]) assert(pv.result[k] === real[k], "preview " + k + " = real (" + real[k] + "), got " + pv.result[k]);
  assert(JSON.stringify(pv.result.dtMs) === JSON.stringify(real.dtMs) && JSON.stringify(pv.result.examples) === JSON.stringify(real.examples), "same Δt statistics and examples");
  assert(JSON.stringify(pv.result.unpairedFollowedBy) === JSON.stringify(real.unpairedFollowedBy) && JSON.stringify(pv.result.unpairedExamples) === JSON.stringify(real.unpairedExamples), "same unpaired explanation");
  const dt = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, maxDtMs: 150, preview: true }).result;
  const dtReal = llmRun(w, "create_link", { refId: req.nodeId, targetId: done.nodeId, maxDtMs: 150 }).result;
  assert(dt.pairs === dtReal.pairs && dt.unpaired === dtReal.unpaired, "Δt condition in preview too");
  const nodes = Object.keys(T.state.nodes).length;
  assert(llmRun(w, "create_link", { refId: f.id, targetId: done.nodeId, preview: true }).error.includes("filter nodes"), "errors are the same in preview");
  assert(Object.keys(T.state.nodes).length === nodes, "an error creates nothing");
});
