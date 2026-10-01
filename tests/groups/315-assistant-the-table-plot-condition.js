// GROUP 315 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 315 — Assistant: the Table/Plot condition is spelled out to the
   model. Person-reported: the model kept calling show_view table/plot on
   a node without an extraction (a plain filter, a link) and only
   recovered after the error. Every node result now carries tablePlot
   (get_overview: own or inherited extraction; create_filter; create_link
   always false), the system prompt and show_view's description state the
   condition, and the refusal names the concrete next step.
   ============================================================ */
group(315);
await withApp(async (w, d, T) => {
  section("315a. tablePlot flag, prompt rule and an actionable refusal");
  const f = await llmSimFile(w, ["motion", "sensors"], 2000, 6);
  const reached = llmRun(w, "create_filter", { parentId: f.id, pattern: "Position reached axis=2 " }).result;
  const temp = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor T1 temperature=[*:float]" }).result;
  assert(reached.tablePlot === false && temp.tablePlot === true, "create_filter reports tablePlot");
  const below = llmRun(w, "create_filter", { parentId: temp.nodeId, pattern: "Sensor" }).result;
  assert(below.tablePlot === true, "a plain filter below an extraction inherits tablePlot");
  const link = llmRun(w, "create_link", { refId: reached.nodeId, targetId: temp.nodeId }).result;
  assert(link.tablePlot === false && link.tip.includes("THAT new node"), "create_link: tablePlot false + tip to extract below it");
  const tree = llmRun(w, "get_overview").result.tree;
  const flag = id => tree.find(n => n.id === id).tablePlot === true;
  assert(!flag(f.id) && !flag(reached.nodeId) && flag(temp.nodeId) && flag(below.nodeId) && !flag(link.nodeId), "get_overview flags exactly the Table/Plot-capable nodes");
  const err = llmRun(w, "show_view", { nodeId: link.nodeId, view: "plot" }).error;
  assert(err.includes("tablePlot") && err.includes("parentId " + link.nodeId) && err.includes("filtered"), "refusal on a link names create_filter under it, got " + err);
  assert(llmRun(w, "show_view", { nodeId: reached.nodeId, view: "table" }).error.includes("parentId " + reached.nodeId), "refusal on a plain filter names it as parent");
  assert(w.eval("LLM_SYSTEM_PROMPT").includes("Table/Plot condition") && w.eval("LLM_SYSTEM_PROMPT").includes("tablePlot: true"), "system prompt states the condition");
  assert(w.eval("LLM_TOOLS").find(t => t.name === "show_view").description.includes("ONLY work on a node with tablePlot: true"), "show_view description states the condition");
});
