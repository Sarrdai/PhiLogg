// GROUP link-chain-edit — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-chain-edit — chain <-> hops helpers, create-from-baked, edit with undo, key suggestions
   Origin: 2026-10-04 (link usability round B, step 1). bakedTextCondition,
   hopsToLinkChain / linkChainToHops (round trip), createLinkNodeFromBaked,
   updateLinkNodeWithUndo (one undo step, name only while auto-generated),
   suggestLinkKeys (job recommended over axis on the tour demo log).
   ============================================================ */
group("link-chain-edit");

await withApp(async (w, d, T) => {
  section("link-chain-edit a. bakedTextCondition and the chain <-> hops round trip");
  const bt = w.bakedTextCondition("Move requested");
  assert(JSON.stringify(bt) === JSON.stringify({ filterType: "text", value: "Move requested", inverted: false, columns: ["message"] }), "bakedTextCondition shape");
  const hops = [{ baked: w.bakedTextCondition("B"), direction: "after", n: 1 }, { baked: w.bakedTextCondition("C"), direction: "before", n: 2 }];
  const opts = { key: { pattern: "job=[*:word]" }, dt: { op: ">", ms: 500 }, exclusive: true, orderEnforced: true };
  const chain = w.hopsToLinkChain(w.bakedTextCondition("A"), hops, opts);
  assert(chain.filterType === "link" && chain.bakedA.filterType === "link" && chain.bakedB.value === "C" && chain.linkDirection === "before" && chain.linkN === 2, "outer link = last hop, nested inner link = first hop");
  assert(chain.linkDt && !chain.bakedA.linkDt && chain.linkKey && chain.bakedA.linkKey && chain.linkExclusive && chain.bakedA.linkExclusive && chain.bakedA.linkOrderEnforced,
    "key and flags on every hop, Δt on the last only");
  const back = w.linkChainToHops(chain);
  assert(back.start.value === "A" && JSON.stringify(back.hops) === JSON.stringify(hops) && JSON.stringify(back.key) === JSON.stringify(opts.key) && JSON.stringify(back.dt) === JSON.stringify(opts.dt) && back.exclusive && back.orderEnforced,
    "linkChainToHops inverts hopsToLinkChain");
  assert(JSON.stringify(w.hopsToLinkChain(back.start, back.hops, back)) === JSON.stringify(chain), "full round trip is identical");
  assert(w.hopsToLinkChain(bt, [], {}) === null && w.linkChainToHops({ filterType: "text" }) === null, "empty hops / non-link give null");
  assert(w.linkChainName(chain) === "“A” → “B” ←2 “C”", "chain name: " + w.linkChainName(chain));

  section("link-chain-edit b. createLinkNodeFromBaked: node, placement, name; createLinkNode still works");
  const f = await w.addFile("link.log", linkKeyLog(), () => {});
  const node = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("move requested"), w.bakedTextCondition("position reached"), "after", 1, { key: { column: "thread" } });
  assert(node.filterType === "link" && node.parentId === f.id && f.children[0] === node.id && T.state.activeId === node.id, "top-level child of the root, activated");
  assert(node.name === "“move requested” → “position reached” [same Thread]", "auto name from the text sides + key suffix: " + node.name);
  assert(node.value === null && node.bakedA.value === "move requested" && node.linkKey.column === "thread" && w.getEntries(node.id).length === 3, "baked sides evaluate (3 pairs)");
  const named = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("move requested"), w.bakedTextCondition("position reached"), "after", 1, { dt: { op: ">", ms: 200 } }, "Moves");
  assert(named.name === "Moves (Δt > 200ms)", "explicit name + option suffix: " + named.name);
  assert(w.createLinkNodeFromBaked("nope", bt, bt, "after", 1, {}) === null && w.createLinkNodeFromBaked(f.id, null, bt, "after", 1, {}) === null, "bad root / missing side give null");
  const move = w.createFilterNode(f.id, "text", "move requested"), reached = w.createFilterNode(f.id, "text", "position reached");
  const viaNodes = w.createLinkNode(move.id, reached.id, "after", 2);
  assert(viaNodes.name === move.name + " →2 " + reached.name && viaNodes.linkN === 2 && viaNodes.bakedA.value === "move requested", "createLinkNode keeps its naming via the helper: " + viaNodes.name);
});

await withApp(async (w, d, T) => {
  section("link-chain-edit c. updateLinkNodeWithUndo: one undo step, name rule, caches");
  const f = await w.addFile("link.log", linkKeyLog(), () => {});
  const A = w.bakedTextCondition("move requested"), B = w.bakedTextCondition("position reached");
  const node = w.createLinkNodeFromBaked(f.id, A, B, "after", 1, {});
  assert(w.getEntries(node.id).length === 3, "3 pairs before the edit");
  const undoLen = T.undoStack.length;
  const before = JSON.stringify(w.captureNodeFields(node));
  const chain = w.hopsToLinkChain(A, [{ baked: B, direction: "after", n: 1 }], { key: { column: "thread" }, dt: { op: ">", ms: 200 } });
  assert(w.updateLinkNodeWithUndo(node.id, chain) === true, "returns true");
  assert(T.undoStack.length === undoLen + 1, "exactly one undo step");
  assert(node.linkKey.column === "thread" && node.linkDt.ms === 200 && node.name === "“move requested” → “position reached” [same Thread] (Δt > 200ms)", "fields and regenerated auto name: " + node.name);
  assert(w.getEntries(node.id).length === 2, "caches invalidated: the edited definition is evaluated (2 pairs)");
  w.undo();
  assert(!node.linkKey && !node.linkDt && node.name === "“move requested” → “position reached”" && JSON.stringify(w.captureNodeFields(node)) === before, "undo restores fields and name");
  assert(w.getEntries(node.id).length === 3, "...and the result");
  w.redo();
  assert(node.linkKey.column === "thread" && node.linkDt.ms === 200 && w.getEntries(node.id).length === 2, "redo re-applies");
  // multi-hop: node becomes a 2-hop chain, direction/N come from the outer link
  const two = w.hopsToLinkChain(A, [{ baked: B, direction: "after", n: 1 }, { baked: A, direction: "after", n: 1 }], {});
  w.updateLinkNodeWithUndo(node.id, two);
  assert(w.linkChainToHops(node).hops.length === 2 && !node.linkKey && !node.linkDt && node.name === "“move requested” → “position reached” → “move requested”", "edited into a 2-hop chain, name regenerated: " + node.name);
  assert(w.getEntries(node.id).length === 2, "2 tuples");

  section("link-chain-edit d. a renamed node keeps its name");
  const custom = w.createLinkNodeFromBaked(f.id, A, B, "after", 1, {});
  custom.name = "My moves";
  w.updateLinkNodeWithUndo(custom.id, w.hopsToLinkChain(A, [{ baked: B, direction: "before", n: 1 }], {}));
  assert(custom.name === "My moves" && custom.linkDirection === "before", "name kept, definition replaced");
  assert(w.updateLinkNodeWithUndo(f.id, chain) === false && w.updateLinkNodeWithUndo(custom.id, { filterType: "text" }) === false, "non-link node / non-link chain refused");
});

await withApp(async (w, d, T) => {
  section("link-chain-edit e. suggestLinkKeys on the tour demo log: job recommended, axis not");
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const f = await w.addFile("app.log", TOUR.demoLog(), () => {});
  const starts = w.getEntriesFromBaked(w.bakedTextCondition("Move requested"), f.entries, f.id);
  const ends = w.getEntriesFromBaked(w.bakedTextCondition("Position reached"), f.entries, f.id);
  const sug = w.suggestLinkKeys(starts, ends);
  assert(sug.map(s => s.field).sort().join() === "axis,job", "fields in both sides: axis, job (target/actual are side-specific), got " + sug.map(s => s.field));
  assert(sug[0].field === "job" && sug[0].recommended && sug[0].pattern === "job=[*:word]" && !sug[1].recommended, "job recommended and first, axis not");
  const keyOf = w.compileLinkKey({ pattern: sug[0].pattern });
  assert(keyOf(starts[0]) === "J-00001" && keyOf(ends[0]) === keyOf(starts[0]) && keyOf(starts[1]) === "J-00002", "the pattern captures exactly the value token (J-00001)");
  assert(w.compileLinkKey({ pattern: "axis=[*:word]" })(starts[0]) === "1", "axis=[*:word] captures '1'");
  const node = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: sug[0].pattern } });
  assert(w.getEntries(node.id).length === 192 && node._linkUnmatched.length === 13, "suggested key: 192 pairs, 13 without end");
  assert(w.suggestLinkKeys([], ends).length === 0 && w.suggestLinkKeys(starts, []).length === 0, "empty side: no suggestions");
  const none = w.suggestLinkKeys(w.getEntriesFromBaked(w.bakedTextCondition("Move requested"), f.entries, f.id).slice(0, 1).map(e => Object.assign({}, e, { message: "no fields here" })), ends);
  assert(none.length === 0, "no shared name=value field: no suggestions");
});
