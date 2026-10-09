// GROUP llm-agent-corrections — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP llm-agent-corrections — an LLM/MCP agent can correct its own mistakes:
   delete_node / rename_node (only ✦ nodes), their undo recording (one step per
   MCP call, part of the round batch in the in-app loop, "Undo this round"),
   and annotate's bookmark:false / replaceNote / note:"". Data: log simulator.
   Origin: 2026-10-09 (round G, package G1). */
group("llm-agent-corrections");

await withApp(async (w, d, T) => {
  section("llm-agent-corrections a. delete_node / rename_node only touch the assistant's own nodes");
  const f = await llmSimFile(w, ["motion"], 500, 3);
  T.resetUndoRedo();
  const own = llmRun(w, "create_filter", { parentId: f.id, pattern: "Move requested" }).result.nodeId;
  const mine = w.createFilterNode(f.id, "text", "Position reached"); // the person's node
  const e = tool => tool.error || "";
  assert(e(llmRun(w, "delete_node", { nodeId: mine.id })).includes("belongs to the person"), "a person's node is refused (delete)");
  assert(e(llmRun(w, "rename_node", { nodeId: mine.id, name: "x" })).includes("belongs to the person"), "…and rename");
  assert(e(llmRun(w, "delete_node", { nodeId: f.id })).includes("belongs to the person"), "a file is refused");
  assert(e(llmRun(w, "rename_node", { nodeId: f.id, name: "x" })).includes("belongs to the person"), "…also for rename");
  assert(e(llmRun(w, "delete_node", { nodeId: "p1" })).includes("pattern id"), "a pattern id is refused");
  assert(e(llmRun(w, "delete_node", { nodeId: "n99999" })).includes("Unknown"), "unknown id");
  assert(T.state.nodes[mine.id] && T.state.nodes[f.id] && mine.label === undefined, "nothing changed");
  assert(e(llmRun(w, "rename_node", { nodeId: own, name: "  " })).includes("name is empty"), "empty name refused");
  const rn = llmRun(w, "rename_node", { nodeId: own, name: "  Moves  " }).result;
  assert(rn.nodeId === own && rn.name === "Moves" && T.state.nodes[own].label === "Moves" && w.nodeDisplayName(T.state.nodes[own]) === "Moves", "rename sets the label (trimmed)");
  T.state.nodes[own].locked = true;
  assert(e(llmRun(w, "delete_node", { nodeId: own })).includes("cannot be deleted") && T.state.nodes[own], "a locked node is refused");
  delete T.state.nodes[own].locked;
  const undoLen = T.undoStack.length;
  const del = llmRun(w, "delete_node", { nodeId: own }).result;
  assert(del.deleted === own && del.removedNodes === 1 && !T.state.nodes[own], "delete works on the assistant's node");
  assert(T.llmCreatedNodeIds.has(own), "the id stays marked (undo restores under the same id)");
  assert(T.undoStack.length === undoLen, "tools outside a call/round record no undo step themselves");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("llm-agent-corrections b. MCP: one undo step per call; subtree delete; mixed batches");
  const f = await llmSimFile(w, ["motion"], 500, 3);
  const res = () => w.philogg.calls.filter(c => c[0] === "mcpToolResult");
  const call = (id, name, args) => { w.philoggMcpCall(id, name, args); return JSON.parse(res().filter(c => c[1] === id)[0][2]); };
  const a = call("c1", "create_filter", { parentId: f.id, pattern: "Move requested" }).nodeId;
  const b = call("c2", "create_filter", { parentId: a, pattern: "axis=2" }).nodeId;
  T.resetUndoRedo();

  assert(call("c3", "rename_node", { nodeId: a, name: "Moves" }).name === "Moves", "rename via MCP");
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "edit" && T.undoStack[0].label === "MCP: rename_node", "one labelled edit step");
  w.undo();
  assert(T.state.nodes[a].label === undefined, "undo restores the label");
  w.redo();
  assert(T.state.nodes[a].label === "Moves", "redo renames again");

  T.resetUndoRedo();
  const dl = call("c4", "delete_node", { nodeId: a });
  assert(dl.deleted === a && dl.removedNodes === 2 && !T.state.nodes[a] && !T.state.nodes[b], "delete removes the subtree");
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "delete" && T.undoStack[0].label === "MCP: delete_node", "one delete step");
  w.undo();
  assert(T.state.nodes[a] && T.state.nodes[b] && T.state.nodes[b].parentId === a && T.state.nodes[a].parentId === f.id, "undo restores node and child, same ids and parents");
  assert(T.state.nodes[a].label === "Moves" && T.llmCreatedNodeIds.has(a) && T.llmCreatedNodeIds.has(b), "…label and ✦ survive");
  w.redo();
  assert(!T.state.nodes[a] && !T.state.nodes[b], "redo deletes again");
  w.undo();

  // Mixed batch in ONE call is impossible over MCP (one tool per call), so drive the collector
  // directly the way mcpRunCall/the agent loop do: create X, rename X, delete X.
  T.resetUndoRedo();
  const list = [];
  w.__arr = list;
  w.eval("llmRoundActions = window.__arr; llmRoundCreated = []");
  const x = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor" }).result.nodeId;
  llmRun(w, "rename_node", { nodeId: x, name: "X" });
  llmRun(w, "delete_node", { nodeId: x });
  w.eval("llmRoundActions = null; llmRoundCreated = null");
  assert(list.map(a => a.kind).join() === "create,edit,delete", "chronological recording: " + list.map(a => a.kind));
  const acts = w.llmRoundUndoActions(list);
  assert(acts.length === 3, "the create of a node that was deleted again is kept");
  w.pushUndo({ kind: "batch", actions: acts });
  assert(!T.state.nodes[x], "(node gone)");
  w.undo();
  assert(!T.state.nodes[x], "undo of create-edit-delete: ends with the node gone (as before the batch)");
  w.redo();
  assert(!T.state.nodes[x], "redo ends with the node gone again");
  w.undo();
  assert(!T.state.nodes[x], "and again");
  // A creation of a node removed by something else (not a recorded delete) is dropped.
  const y = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor" }).result.nodeId;
  w.deleteNode(y);
  assert(w.llmRoundUndoActions([{ kind: "create", nodeId: y, parentId: f.id }]).length === 0, "an unrelated vanished creation is dropped");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("llm-agent-corrections c. In-app round: corrections join the batch; Undo this round");
  const f = await llmSimFile(w, ["motion"], 500, 3);
  T.resetUndoRedo();
  const fake = llmFakeModel([
    { calls: [["create_filter", { parentId: f.id, pattern: "Move requested" }], ["create_filter", { parentId: f.id, pattern: "Sensor" }]] },
    (req, res) => ({ calls: [
      ["rename_node", { nodeId: res.create_filter[0].nodeId, name: "Moves" }],
      ["delete_node", { nodeId: res.create_filter[1].nodeId }],
    ] }),
    { content: "Done." },
  ]);
  T.llmTransportOverride = fake;
  const r = await w.llmSend("go");
  assert(r.status === "done" && r.created.length === 2, "round done: " + r.status + " " + r.error);
  const [n1, n2] = r.created;
  assert(T.state.nodes[n1].label === "Moves" && !T.state.nodes[n2], "rename applied, second node deleted");
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "batch" && T.undoStack[0].llmRoundId === r.id, "one batch for the whole round");
  assert(T.undoStack[0].actions.map(a => a.kind).join() === "create,create,edit,delete", "…in order: " + T.undoStack[0].actions.map(a => a.kind));
  assert(!Object.keys(JSON.parse(JSON.stringify(r))).includes("actions"), "round.actions is not persisted");
  assert(w.llmSnapshot().session.rounds[0].undo === "available", "undo available");
  const u = w.llmUndoRound(r.id);
  assert(u.ok && u.via === "undo" && !T.state.nodes[n1] && !T.state.nodes[n2], "Undo this round: everything gone (incl. the one deleted in the round)");
  w.redo();
  assert(T.state.nodes[n1] && T.state.nodes[n1].label === "Moves" && !T.state.nodes[n2], "redo: first node back with its new name, second stays deleted");
  w.undo();
  assert(!T.state.nodes[n1] && !T.state.nodes[n2], "undo again");
  w.redo();

  // Round that only corrects: one rename, no creations.
  T.resetUndoRedo();
  const fake2 = llmFakeModel([{ calls: [["rename_node", { nodeId: n1, name: "Again" }]] }, { content: "ok" }]);
  T.llmTransportOverride = fake2;
  const r2 = await w.llmSend("rename it");
  assert(r2.created.length === 0 && T.state.nodes[n1].label === "Again", "renamed");
  assert(T.undoStack.length === 1 && T.undoStack[0].kind === "batch" && T.undoStack[0].actions.length === 1, "a rename-only round still gets one undo step");
  assert(w.llmUndoRound(r2.id).ok && T.state.nodes[n1].label === "Moves", "Undo this round takes the rename back");

  // Delete-only round, batch no longer on top: nothing left to remove, but the person's Ctrl+Z restores.
  T.resetUndoRedo();
  const fake3 = llmFakeModel([{ calls: [["delete_node", { nodeId: n1 }]] }, { content: "gone" }]);
  T.llmTransportOverride = fake3;
  const r3 = await w.llmSend("delete it");
  assert(!T.state.nodes[n1] && T.undoStack.length === 1, "deleted, one step");
  assert(w.llmUndoRound(r3.id).ok && T.state.nodes[n1], "Undo this round restores the deleted node");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });

await withApp(async (w, d, T) => {
  section("llm-agent-corrections d. annotate: bookmark:false, replaceNote, note:\"\"");
  const f = await llmSimFile(w, ["motion"], 500, 3);
  const ids = [f.entries[1].id, f.entries[2].id];
  T.state.notes.set(ids[1], "my own note");
  let r = llmRun(w, "annotate", { entryIds: ids, note: "finding", bookmark: true }).result;
  assert(r.bookmarked === 2 && r.noted === 2 && r.unbookmarked === 0 && r.cleared === 0, "default call unchanged");
  assert(T.state.notes.get(ids[0]) === "finding" && T.state.notes.get(ids[1]) === "my own note\nfinding", "default: appended");
  r = llmRun(w, "annotate", { entryIds: ids, note: "finding" }).result;
  assert(T.state.notes.get(ids[1]) === "my own note\nfinding", "same note again: no duplicate");
  r = llmRun(w, "annotate", { entryIds: ids, note: "better", replaceNote: true }).result;
  assert(r.noted === 2 && T.state.notes.get(ids[0]) === "better" && T.state.notes.get(ids[1]) === "better", "replaceNote replaces");
  r = llmRun(w, "annotate", { entryIds: [ids[0], f.entries[3].id], bookmark: false }).result;
  assert(r.unbookmarked === 1 && r.bookmarked === 0 && !T.state.bookmarks.has(ids[0]) && T.state.bookmarks.has(ids[1]), "bookmark:false removes only existing bookmarks of those entries");
  assert(T.state.notes.get(ids[0]) === "better", "…and leaves the note alone");
  r = llmRun(w, "annotate", { entryIds: ids, bookmark: true }).result;
  assert(r.bookmarked === 1, "bookmark:true adds only the missing one");
  r = llmRun(w, "annotate", { entryIds: [ids[0], f.entries[3].id], note: "" }).result;
  assert(r.cleared === 1 && r.noted === 0 && !T.state.notes.has(ids[0]) && T.state.notes.get(ids[1]) === "better", "note:\"\" clears the note of those entries only");
  const err = llmRun(w, "annotate", { entryIds: ids }).error;
  assert(err.startsWith("Nothing to do") && err.includes("bookmark: true / false") && err.includes("replaceNote"), "error text mentions the new options");
  assert(T.undoStack.length === 0, "annotate is not undoable (the GUI's bookmarks/notes aren't either)");
}, { philogg: llmDesktopStub(), beforeParse: llmOn });
