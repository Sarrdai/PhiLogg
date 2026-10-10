// GROUP llm-link-pairing - loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP llm-link-pairing - the assistant's create_link tool: `pairing`
   (nearest | before_next_start | nested) and `keyWildcards` (1-based
   [refWildcard, targetWildcard] pairs), in preview and on the created node.
   Origin: 2026-10-09 (link pairing round, step 3). Simulator scenarios
   `axes` and `flows`.
   ============================================================ */
group("llm-link-pairing");

await withApp(async (w, d, T) => {
  section("llm-link-pairing a. before_next_start on axes: skipped, few unpaired; preview creates no node");
  const f = await llmSimFile(w, ["axes"], 800, 7);
  const mv = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move axes requested" }).result;
  const y = llmRun(w, "create_filter", { parentId: f.id, pattern: "Axis Y moved" }).result;
  const nodesBefore = Object.keys(T.state.nodes).length;
  const pv = llmRun(w, "create_link", { refId: mv.nodeId, targetId: y.nodeId, pairing: "before_next_start", preview: true });
  assert(!pv.error && pv.result.preview && pv.result.pairing === "before_next_start" && pv.result.skipped > 20 && pv.result.unpaired <= 1,
    "preview: skipped > 20, at most the trailing move unpaired: " + JSON.stringify(pv.result).slice(0, 200));
  assert(Object.keys(T.state.nodes).length === nodesBefore, "preview creates no node");
  const near = llmRun(w, "create_link", { refId: mv.nodeId, targetId: y.nodeId, preview: true }).result;
  assert(near.skipped === undefined && near.pairing === undefined && near.unpaired > pv.result.unpaired, "nearest: no skipped/pairing fields, many more unpaired (" + near.unpaired + ")");
  const made = llmRun(w, "create_link", { refId: mv.nodeId, targetId: y.nodeId, pairing: "before_next_start" }).result;
  const node = T.state.nodes[made.nodeId];
  assert(node.linkPairing === "window" && made.pairs === pv.result.pairs && made.skipped === pv.result.skipped && made.unpaired === pv.result.unpaired && /before next start/.test(made.name), "the created node has linkPairing window and reports the same counts (" + made.name + ")");
  const nearest = llmRun(w, "create_link", { refId: mv.nodeId, targetId: y.nodeId, pairing: "nearest" }).result;
  assert(T.state.nodes[nearest.nodeId].linkPairing === undefined && nearest.pairing === undefined, "pairing: nearest stores nothing");
  const bad = llmRun(w, "create_link", { refId: mv.nodeId, targetId: y.nodeId, pairing: "sideways" });
  assert(bad.error || (bad.result && bad.result.error), "an unknown pairing is refused");
});

await withApp(async (w, d, T) => {
  section("llm-link-pairing b. nested + keyWildcards [[1,1]] on flows");
  const f = await llmSimFile(w, ["flows"], 3000, 7);
  const st = llmRun(w, "create_filter", { parentId: f.id, pattern: "Flow [*] started run=[*]" }).result;
  const en = llmRun(w, "create_filter", { parentId: f.id, pattern: "Flow [*] ended result=[*]" }).result;
  const nameOf = e => /^Flow (\S+) /.exec(e.message)[1];
  const r = llmRun(w, "create_link", { refId: st.nodeId, targetId: en.nodeId, pairing: "nested", keyWildcards: [[1, 1]] });
  assert(!r.error && !r.result.error && r.result.pairing === "nested" && r.result.pairs > 100, "created: " + JSON.stringify(r.result).slice(0, 160));
  const node = T.state.nodes[r.result.nodeId];
  assert(JSON.stringify(node.linkKey) === '{"wildcards":[[0,0]]}' && node.linkPairing === "nested", "stored as 0-based {wildcards} and linkPairing nested");
  const pairs = w.getEntries(node.id);
  assert(pairs.length === r.result.pairs && pairs.every(p => nameOf(p.first) === nameOf(p.second)), "every pair shares the flow name");
  assert(r.result.skipped === undefined, "nested never reports skipped");
  const pv = llmRun(w, "create_link", { refId: st.nodeId, targetId: en.nodeId, keyWildcards: [[1, 1]], preview: true }).result;
  assert(pv.preview && pv.pairs > 100 && pv.pairs <= r.result.references, "keyWildcards works in a nearest preview");
});

await withApp(async (w, d, T) => {
  section("llm-link-pairing c. keyWildcards errors");
  const f = await llmSimFile(w, ["flows"], 1500, 7);
  const st = llmRun(w, "create_filter", { parentId: f.id, pattern: "Flow [*] started run=[*]" }).result;
  const en = llmRun(w, "create_filter", { parentId: f.id, pattern: "Flow [*] ended result=[*]" }).result;
  const plain = llmRun(w, "create_filter", { parentId: f.id, pattern: "ended result=" }).result;
  const err = a => { const r = llmRun(w, "create_link", Object.assign({ refId: st.nodeId, targetId: en.nodeId }, a)); return r.error || (r.result && r.result.error) || ""; };
  const n0 = Object.keys(T.state.nodes).length;
  assert(/wildcards/.test(llmRun(w, "create_link", { refId: st.nodeId, targetId: plain.nodeId, keyWildcards: [[1, 1]] }).error || llmRun(w, "create_link", { refId: st.nodeId, targetId: plain.nodeId, keyWildcards: [[1, 1]] }).result.error), "a plain-text side is refused with an explanation");
  assert(/2 wildcard/.test(err({ keyWildcards: [[3, 1]] })) && /refId/.test(err({ keyWildcards: [[3, 1]] })), "out of range: names the counts (" + err({ keyWildcards: [[3, 1]] }) + ")");
  assert(/out of range/.test(err({ keyWildcards: [[1, 9]] })), "target number out of range");
  assert(/1-based/.test(err({ keyWildcards: [[0, 1]] })) && /1-based/.test(err({ keyWildcards: [["a", 1]] })), "zero and non-numbers are refused");
  assert(/not both/.test(err({ keyWildcards: [[1, 1]], key: "thread" })), "key and keyWildcards together are refused");
  assert(Object.keys(T.state.nodes).length === n0, "no node created by any refused call");
});
