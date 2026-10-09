// GROUP 303 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 303 — LLM assistant, phase 3: the agent loop and sessions,
   driven by a scripted fake model (no LM Studio): the reference scenario
   (message types → question → link → plot), streamed text/tool-call
   deltas, one undo step per round, history compaction, Stop, the turn
   limit and errors, "undo this round" on top of the undo stack and after
   further actions, references resolved after a simulated restart and with
   the file gone. Sample data from tools/log-sim (motion, sensors).
   ============================================================ */
group(303);

await withApp(async (w, d, T) => {
  section("303a. Reference scenario with a fake model: types → question → link → plot");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["motion", "sensors"], entries: 3000, seed: 5 });
  const f = await w.addFile(file.name, file.text, () => {});
  T.resetUndoRedo();
  const streamed = [];
  T.llm.views.add(msg => { if (msg.type === "stream") streamed.push(msg.text); });
  const fake = llmFakeModel([
    { calls: [["get_overview", {}], ["find_message_types", { query: "position reached" }]] },
    (req, res) => ({ calls: [
      ["create_filter", { parentId: llmLast(res, "get_overview").files[0].id, pattern: llmLast(res, "find_message_types").types[0].pattern }],
      ["create_filter", { parentId: llmLast(res, "get_overview").files[0].id, pattern: "Sensor T1 temperature=[*:float]" }],
    ] }),
    { content: "Welche Achse ist gemeint?\n- 1\n- 2\n- 3\n- 4" },
    // round 2
    (req, res) => ({ calls: [["create_filter", { parentId: llmLast(res, "get_overview").files[0].id, pattern: "Position reached axis=2 " }]] }),
    (req, res) => ({ calls: [["create_link", { refId: llmLast(res, "create_filter").nodeId, targetId: res.create_filter[1].nodeId, direction: "after" }]] }),
    (req, res) => ({ calls: [["create_filter", { parentId: llmLast(res, "create_link").nodeId, pattern: "temperature=[*:float]" }]] }),
    (req, res) => ({ calls: [["show_view", { nodeId: llmLast(res, "create_filter").nodeId, view: "plot", plot: { type: "line", x: "time", y: "1" } }]] }),
    (req, res) => ({ content: "Link-Filter " + llmLast(res, "create_link").nodeId + " paart jede Positionierung von Achse 2 mit der nächsten Temperatur; der Plot liegt in " + llmLast(res, "show_view").nodeId + "." }),
    // round 3
    { content: "<think>kurz</think>Gern." },
  ]);
  T.llmTransportOverride = fake;
  const r1 = await w.llmSend("Mich interessiert der Temperaturwert nach jeder Positionierung.");
  const req1 = fake.requests[0];
  assert(req1.messages[0].role === "system" && req1.messages[0].content.includes("[*:float]") && req1.messages[1].content.startsWith("Mich interessiert"), "request: system prompt, then the person's message");
  assert(req1.tools.length === 15 && req1.stream === true && req1.temperature === 0.2 && !("model" in req1), "request: 15 tools, streaming, default temperature, no model when none is chosen");
  assert(fake.endpoint === "http://localhost:1234/v1", "default endpoint");
  assert(r1.status === "done" && r1.created.length === 2, "round 1 done, two filters created (streamed tool-call deltas assembled), got " + r1.status + "/" + r1.error);
  assert(r1.items.filter(i => i.kind === "tool").length === 4 && r1.items[r1.items.length - 1].text.startsWith("Welche Achse"), "round 1: four tool steps, then the question");
  assert(streamed.some(t => t === "Welche Achse ist gemeint?\n- 1\n- 2\n- 3\n- 4") && streamed.some(t => t.length < 25), "the answer was streamed to views in pieces");
  const sess = T.llm.sessions[0];
  assert(sess.title.startsWith("Mich interessiert"), "session titled from the first question");
  const created1 = r1.created.map(id => T.state.nodes[id]);
  assert(created1.every(n => n && n.parentId === f.id) && created1.every(n => T.llmCreatedNodeIds.has(n.id)), "round-1 nodes are in the tree, marked");
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "batch" && T.undoStack[0].actions.length === 2, "one undo step (batch) for the round");

  const r2 = await w.llmSend("Achse 2, reached.");
  assert(r2.status === "done" && r2.created.length === 3, "round 2: filter, link, extraction under the link — got " + r2.status + " " + r2.error);
  const link = T.state.nodes[r2.created[1]], plotNode = T.state.nodes[r2.created[2]];
  assert(link.filterType === "link" && plotNode.parentId === link.id && T.state.activeId === plotNode.id && T.fhActiveTab === "plot", "link → temperature extraction, plot on screen");
  assert(T.undoStack.length === 2 && T.undoStack[1].actions.length === 3, "one more undo step, three creates");
  const r2req1 = fake.requests[3];
  const toolMsgs = r2req1.messages.filter(m => m.role === "tool");
  assert(toolMsgs.length === 4 && toolMsgs.every(m => m.content.startsWith("{")), "round 2's first request still carries round 1's tool results verbatim");
  assert(r2.refs[link.id] && r2.refs[link.id].kind === "node" && r2.refs[plotNode.id], "the answer's node ids became references");
  assert(sess.files.length === 1 && sess.files[0].name === f.name && sess.files[0].key === f.cacheKey, "the file became the session's reference file");

  const r3 = await w.llmSend("Danke");
  const r3req = fake.requests[fake.requests.length - 1];
  const r3tools = r3req.messages.filter(m => m.role === "tool");
  const round1Tools = r3tools.slice(0, 4), round2Tools = r3tools.slice(4);
  assert(round1Tools.every(m => !m.content.startsWith("{")) && round1Tools[2].content.startsWith("create_filter → n"), "compaction: round 1's tool results became one-liners, got " + round1Tools.map(m => m.content.slice(0, 40)).join(" | "));
  assert(round2Tools.length === 4 && round2Tools.every(m => m.content.startsWith("{")), "the previous round stays verbatim");
  assert(r3req.messages[0].content === req1.messages[0].content, "the system prompt never changes (prompt cache)");
  assert(r3.items[0].text === "Gern." && sess.history[sess.history.length - 1].content === "Gern.", "<think> blocks are dropped");
  assert(T.undoStack.length === 2, "a round without creations adds no undo step");

  const snap = w.llmSnapshot();
  assert(snap.session.rounds.length === 3 && snap.session.rounds[1].undo === "available" && snap.session.refs[r2.id + ":" + link.id].state === "link", "snapshot: rounds, undo state, resolved references");
  w.undo();
  assert(r2.created.every(id => !T.state.nodes[id]) && r1.created.every(id => T.state.nodes[id]), "Ctrl+Z takes back exactly round 2");
  const snap2 = w.llmSnapshot();
  assert(snap2.session.refs[r2.id + ":" + link.id].state === "gone" && snap2.session.rounds[1].undo === "none", "a deleted node's reference greys out; nothing left to undo");
  w.redo();
  assert(r2.created.every(id => T.state.nodes[id]) && T.state.nodes[link.id].filterType === "link", "redo restores the round under the same ids");
  assert(w.llmRevealRef(r2.id, plotNode.id) && T.state.activeId === plotNode.id, "clicking a node reference activates it");
});

await withApp(async (w, d, T) => {
  section("303b. Stop mid-round, the turn limit, transport errors, history healing");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 500, seed: 2 });
  const f = await w.addFile(file.name, file.text, () => {});
  T.resetUndoRedo();
  const fake = llmFakeModel([{ calls: [["create_filter", { parentId: f.id, pattern: "Move requested" }]] }, "hang"]);
  T.llmTransportOverride = fake;
  const p = w.llmSend("Zeig mir die Bewegungen");
  assert(await waitFor(() => fake.pending), "second model turn is waiting");
  assert(T.llm.running && w.llmSnapshot().running === true, "running shows in the snapshot");
  assert(w.llmUndoRound(T.llm.running.roundId).reason === "running", "a running round can't be undone");
  w.llmStop();
  const r = await p;
  assert(r.status === "stopped" && fake.cancelled[0] === fake.pending.requestId, "Stop cancels the request through the bridge and marks the round stopped");
  assert(r.created.length === 1 && T.state.nodes[r.created[0]], "no automatic rollback: the filter made before Stop stays");
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "batch", "…and is one undo step");
  assert(!T.llm.running, "not running any more");

  const s = { history: [
    { role: "user", content: "x", round: 0 },
    { role: "assistant", content: "", round: 0, tool_calls: [{ id: "a", type: "function", function: { name: "get_overview", arguments: "{}" } }, { id: "b", type: "function", function: { name: "get_entries", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "a", content: "{}", summary: "s", round: 0 },
  ] };
  w.llmHealHistory(s);
  assert(s.history.length === 4 && s.history[3].tool_call_id === "b" && s.history[3].content.includes("Cancelled"), "an unanswered tool call gets a 'cancelled' answer right after its siblings");

  w.localStorage.setItem("philogg-llm-max-turns", "2");
  T.llmTransportOverride = llmFakeModel([{ calls: [["get_overview", {}]] }, { calls: [["get_overview", {}]] }]);
  const lim = await w.llmSend("loop");
  assert(lim.status === "limit" && /2 model turns/.test(lim.error), "turn limit ends the round with a note");
  w.localStorage.removeItem("philogg-llm-max-turns");
  T.llmTransportOverride = llmFakeModel([{ fail: "cannot reach localhost:1234 — is LM Studio's server running?" }]);
  const err = await w.llmSend("hallo");
  assert(err.status === "error" && err.error.includes("LM Studio"), "a transport error ends the round with its message");
  T.llmTransportOverride = llmFakeModel([(req) => ({ content: "ok" })]);
  const bad = llmFakeModel([]);
  bad.chat = (id, ep, req, onEvent) => { onEvent({ type: "chunk", data: { error: { message: "Model unloaded" } } }); return Promise.resolve(); };
  T.llmTransportOverride = bad;
  assert((await w.llmSend("x")).error === "Model unloaded", "an error object inside the stream ends the round");
  const unknown = llmFakeModel([{ calls: [["drop_database", {}]] }, { content: "sorry" }]);
  T.llmTransportOverride = unknown;
  const u = await w.llmSend("x");
  assert(u.status === "done" && u.items[0].error && u.items[0].summary.includes("Unknown tool"), "an unknown tool comes back to the model as an error text");
  const msg = llmFakeModel([]);
  msg.chat = (id, ep, req, onEvent) => { onEvent({ type: "message", data: { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "z", type: "function", function: { name: "get_overview", arguments: {} } }] }, finish_reason: "tool_calls" }] } }); msg.chat = (i, e, r, on) => { on({ type: "message", data: { choices: [{ message: { content: "fertig" }, finish_reason: "stop" }] } }); return Promise.resolve(); }; return Promise.resolve(); };
  T.llmTransportOverride = msg;
  const m = await w.llmSend("non-streamed");
  assert(m.status === "done" && m.items[0].name === "get_overview" && m.items[1].text === "fertig", "a non-streamed answer (object arguments) works too");
});

await withApp(async (w, d, T) => {
  section("303c. 'Undo this round' on top of the stack and after further actions");
  const [file] = LOGSIM.generateToStrings({ scenarios: ["motion", "sensors"], entries: 800, seed: 3 });
  const f = await w.addFile(file.name, file.text, () => {});
  T.resetUndoRedo();
  const round = pat2 => [
    { calls: [["create_filter", { parentId: f.id, pattern: "Position reached" }]] },
    (req, res) => ({ calls: [["create_filter", { parentId: llmLast(res, "create_filter").nodeId, pattern: pat2 }]] }),
    { content: "ok" },
  ];
  T.llmTransportOverride = llmFakeModel(round("axis=2 "));
  const r1 = await w.llmSend("eins");
  const res1 = w.llmUndoRound(r1.id);
  assert(res1.ok && res1.via === "undo" && r1.created.every(id => !T.state.nodes[id]) && T.redoStack.length === 1, "on top of the undo stack it is Ctrl+Z");
  assert(w.llmUndoRound(r1.id).reason === "nothing left", "then there is nothing left");
  w.redo();
  // Further work by the person: a filter of their own (an undo step of its own).
  const own = w.createFilterNode(f.id, "text", "Sensor");
  w.pushCreateUndo(own);
  const res2 = w.llmUndoRound(r1.id);
  assert(res2.ok && res2.via === "delete" && res2.removed === 1 && r1.created.every(id => !T.state.nodes[id]) && T.state.nodes[own.id], "otherwise the round's nodes are deleted (the nested one with its parent), the person's own filter stays");
  assert(T.undoStack[T.undoStack.length - 1].kind === "batch" && T.undoStack[T.undoStack.length - 1].llmRoundId === r1.id + ":undo", "…as one new undo step");
  w.undo();
  assert(r1.created.every(id => T.state.nodes[id]) && T.state.nodes[r1.created[1]].parentId === r1.created[0], "which Ctrl+Z restores, nesting intact");
  const child = w.createFilterNode(r1.created[1], "text", "axis=2");
  w.pushCreateUndo(child);
  const res3 = w.llmUndoRound(r1.id);
  assert(!res3.ok && res3.needsConfirm && res3.foreign === 1 && T.state.nodes[r1.created[0]], "a filter of the person's under the round's nodes → asks first, deletes nothing");
  const res4 = w.llmUndoRound(r1.id, true);
  assert(res4.ok && !T.state.nodes[child.id] && !T.state.nodes[r1.created[0]], "confirmed: removed together");
  assert(w.llmSnapshot().session.rounds[0].undo === "none", "the round's undo button is now disabled");
});

group(303);
{
  const factory = new IDBFactory();
  let saved = null;
  await withApp(async (w, d, T) => {
    section("303d. Sessions persist; references resolve after a restart (entry by file + ordinal, node as text)");
    const [file] = LOGSIM.generateToStrings({ scenarios: ["motion"], entries: 400, seed: 8 });
    const f = await w.addFile(file.name, file.text, () => {});
    await w.llmInit();
    T.llmTransportOverride = llmFakeModel([
      { calls: [["create_filter", { parentId: f.id, pattern: "Position reached axis=3" }]] },
      (req, res) => ({ calls: [["get_entries", { nodeId: llmLast(res, "create_filter").nodeId, max: 2 }]] }),
      (req, res) => ({ content: "Filter " + res.create_filter[0].nodeId + ", erster Treffer " + llmLast(res, "get_entries").entries[1].id + " (e999999 gibt es nicht)." }),
    ]);
    const r = await w.llmSend("Achse 3?");
    const entryToken = Object.keys(r.refs).find(k => k.startsWith("e"));
    const nodeToken = Object.keys(r.refs).find(k => k.startsWith("n"));
    assert(entryToken && nodeToken && !r.refs.e999999, "entry and node references captured, an id that doesn't exist is not");
    const entry = w.jumpToEntry && T.entryIndex[entryToken];
    saved = { roundId: r.id, entryToken, nodeToken, raw: entry.raw, ordinal: r.refs[entryToken].ordinal, file: f.name };
    assert(f.entries[saved.ordinal] === entry, "the entry reference is stored as file + ordinal");
    await w.persistFileNode(f);
    await w.persistMetaNow();
    assert(await waitFor(async () => ((await w.llmDbOp("readonly", s => s.getAll())) || []).some(s => s.rounds.length === 1 && s.rounds[0].status === "done")), "the session is stored in its own IndexedDB database");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    await T.bootRestore;
    await w.llmInit();
    const snap = w.llmSnapshot();
    assert(snap.session && snap.session.rounds.length === 1 && snap.session.rounds[0].status === "done", "restart: the session is back");
    assert(snap.runId !== T.llm.sessions[0].rounds[0].refs[saved.nodeToken].runId, "a new app run");
    const refs = snap.session.refs;
    assert(refs[saved.roundId + ":" + saved.nodeToken].state === "text", "other run: a node reference is text only (the id may name another node now)");
    assert(refs[saved.roundId + ":" + saved.entryToken].state === "link", "other run, file loaded: the entry reference is clickable");
    assert(snap.session.missingFiles.length === 0, "no 'not loaded' hint");
    assert(w.llmRevealRef(saved.roundId, saved.entryToken) && T.entryIndex[T.state.selectedId].raw === saved.raw, "clicking it selects the same entry, found by ordinal");
    assert(!w.llmRevealRef(saved.roundId, saved.nodeToken), "the node reference does nothing");
    w.deleteNode(T.state.rootIds[0]);
    const snap2 = w.llmSnapshot();
    assert(snap2.session.refs[saved.roundId + ":" + saved.entryToken].state === "text" && snap2.session.missingFiles[0] === saved.file, "file not loaded: text only, and the session says which file it refers to");
    const [other] = LOGSIM.generateToStrings({ scenarios: ["sensors"], entries: 50, seed: 1 });
    await w.addFile(other.name, other.text, () => {});
    assert(w.llmSnapshot().session.refs[saved.roundId + ":" + saved.entryToken].state === "text", "a different log doesn't make it clickable");
  }, { indexedDB: factory });
}

await withApp(async (w, d, T) => {
  section("303z. Diagnosis run: timeline → common_neighbors → create_window → show_view");
  const f = await llmSimFile(w, ["causechain", "basic"], 4000, 3);
  T.resetUndoRedo();
  const fake = llmFakeModel([
    { calls: [["get_overview", {}], ["timeline", { nodeId: f.id }]] },
    (req, res) => ({ calls: [["find_message_types", { query: "Order processing failed" }]] }),
    (req, res) => ({ calls: [["create_filter", { patternId: llmLast(res, "find_message_types").types[0].patternId }]] }),
    (req, res) => ({ calls: [["common_neighbors", { nodeId: llmLast(res, "create_filter").nodeId, direction: "before" }]] }),
    (req, res) => ({ calls: [["create_window", { aroundNodeId: llmLast(res, "create_filter").nodeId, beforeMs: 2000 }]] }),
    (req, res) => ({ calls: [["show_view", { nodeId: llmLast(res, "create_window").nodeId, view: "filtered" }]] }),
    (req, res) => ({ content: "Vor " + llmLast(res, "common_neighbors").references + " Fehlern steht " + llmLast(res, "common_neighbors").neighbors[0].coverage + " Mal '" + llmLast(res, "common_neighbors").neighbors[0].type + "'; Kontext: " + llmLast(res, "create_window").nodeId }),
  ]);
  T.llmTransportOverride = fake;
  const round = await w.llmSend("Was passiert vor den Bestellfehlern?");
  assert(round.status === "done", "the diagnosis round finishes, got " + round.status + " " + round.error);
  const summaries = round.items.filter(i => i.kind === "tool").map(i => i.summary || i.text || "");
  assert(summaries.some(s => /^timeline/.test(s)) && summaries.some(s => /^common_neighbors → 1 type/.test(s)) && summaries.some(s => /^create_window → n\d+/.test(s)) && summaries.some(s => /^show_view/.test(s)), "the one-line summaries name each analysis step, got " + JSON.stringify(summaries));
  assert(round.created.length === 2, "only the filter and the window became nodes (the analyses create none), got " + round.created.length);
  const win = T.state.nodes[round.created[1]];
  assert(win.filterType === "context" && win.parentId === round.created[0] && T.state.activeId === win.id, "the window node is the shown one");
  assert(T.undoStack.length === 1 && T.undoStack[0].actions.length === 2, "one undo step for the round");
  const sys = fake.requests[0].messages[0].content;
  assert(sys.includes("common_neighbors") && sys.includes("timeline") && sys.includes("Pattern ids") && sys.includes("preview: true"), "the system prompt carries the diagnosis flow and pattern ids");
  assert(fake.requests.every(r => r.messages[0].content === sys), "…and stays identical across requests (prompt cache)");
  const names = fake.requests[0].tools.map(t => t.function.name);
  assert(["timeline", "what_changed", "common_neighbors", "group_by", "create_window"].every(n => names.includes(n)), "the five analysis tools are offered");
});
