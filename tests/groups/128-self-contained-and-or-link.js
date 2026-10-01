// GROUP 128 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 128 — Self-contained and/or/link inputs via BAKED conditions
   (this session's correction of the 9fd140e inputA/inputB redesign — see
   CLAUDE.md/changelog.d: 9fd140e still did a LIVE node-id lookup, just
   renamed from linkedId; this session replaces that with node.bakedA/
   node.bakedB — a flat, self-contained copy of each side's OWN single
   condition, never an ancestor chain, never a node-id reference at all).
   createAndOrNode/createLinkNode still always place their result as a new
   top-level child of the shared root file; moving a node anywhere
   afterward only ever changes parentId, re-chaining its INPUT entries
   (getEntries(node.parentId), same as any other filter type) but never
   touching bakedA/bakedB; and Unpack materializes bakedA/bakedB back into
   visible sibling filters next to the original node, which is otherwise
   left completely untouched — no fresh combiner is created (a session fix:
   an earlier pass here had Unpack create a fresh combiner AND delete the
   original to "replace" it, which is unnecessary churn — the original
   node's own bakedA/bakedB already work fine once its inputs are visible
   again, so there is nothing to replace).
   ============================================================ */
group(128);
await withApp(async (w, d, T) => {
  section("128. Self-contained and/or/link inputs: placement, move, Unpack");

  const f = await w.addFile("128.log", makeLog(0, 10), () => {});
  const posFilter = w.createFilterNode(f.id, "text", "pos");
  const valFilter = w.createFilterNode(f.id, "text", "val");
  w.render();

  // --- Placement: AND/OR/LINK always land as a new top-level child of the
  // shared root file, regardless of where the two inputs sit in the tree. ---
  const nested = w.createFilterNode(posFilter.id, "text", "pos 1"); // a filter NESTED under posFilter
  const andNode = w.createAndOrNode([nested.id, valFilter.id], "and");
  assert(andNode.parentId === f.id, "AND node is placed directly under the FILE, not nested under either input");
  assert(f.children.includes(andNode.id), "...and is a real top-level child of the file");
  assert(andNode.baked[0].filterType === "text" && andNode.baked[0].value === "pos 1" && andNode.baked[1].value === "val",
    "bakedA/bakedB are flat copies of each side's OWN single condition");

  // --- getEntries() evaluates bakedA/bakedB as predicates over its own
  // ordinary parentId chain: moving the AND node deep into an unrelated
  // subtree changes ITS INPUT ENTRIES (parentEntries), same as any plain
  // filter — bakedA/bakedB themselves never change. ---
  const before = w.getEntries(andNode.id).map(e => e.id);
  const unrelatedParent = w.createFilterNode(f.id, "text", "message");
  const movedOk = w.moveNode(andNode.id, unrelatedParent.id);
  assert(movedOk === true, "moving an and/or/link node is always a plain, unguarded reparent now");
  assert(andNode.parentId === unrelatedParent.id, "parentId updated by the move");
  assert(andNode.baked[0].value === "pos 1" && andNode.baked[1].value === "val", "bakedA/bakedB are untouched by the move");
  const after = w.getEntries(andNode.id).map(e => e.id);
  // unrelatedParent ("message") still matches every entry in this log, so
  // the AND's own input pool is unchanged in practice — the move is a
  // pure re-chain, same mechanism as any other filter, not a special case.
  assert(JSON.stringify(before) === JSON.stringify(after), "the filtered RESULT is unchanged when the new parent's own pool still contains the same matching entries");

  // --- Link node: same placement + baked-condition logic, verified against
  // nearest-match pairing rather than set intersection. ---
  const link = w.createLinkNode(posFilter.id, valFilter.id, "before", 1, {});
  assert(link.parentId === f.id, "LINK node is also placed directly under the FILE");
  assert(link.bakedA.value === "pos" && link.bakedB.value === "val", "LINK node's bakedA/bakedB are the reference/target's own conditions");
  const pairs = w.getEntries(link.id);
  assert(Array.isArray(pairs), "LINK's getEntries resolves via bakedA/bakedB without throwing");

  // No cycle-guard test needed any more: bakedA/bakedB hold plain data, not
  // node-id references, so there is nothing left to hand-corrupt into a
  // cycle through them (a parentId self/mutual cycle is a pre-existing,
  // separate footgun outside this session's scope — moveNode's
  // isDescendantOrSelf guard already prevents it through the normal UI, see
  // the "Core data model" note above createAndOrNode in philogg.html).

  // --- CORE REPRO (the user-reported bug this session fixes): combine
  // "Some" (A) AND "Entry" (B), verify the result, delete A, verify the
  // AND's result is UNCHANGED, delete B, verify it's STILL unchanged. ---
  const some = w.createFilterNode(f.id, "text", "message 5"); // "Some"
  const entry = w.createFilterNode(f.id, "text", "message");  // "Entry" (matches every entry)
  const someAndEntry = w.createAndOrNode([some.id, entry.id], "and");
  const reproCountBefore = w.getEntries(someAndEntry.id).length;
  assert(reproCountBefore === 1, "sanity: 'Some' AND 'Entry' matches exactly the one entry containing 'message 5'");
  w.deleteFilterNodeWithUndo(some.id);
  w.invalidateAllCaches();
  assert(w.getEntries(someAndEntry.id).length === reproCountBefore, "REPRO: deleting 'Some' (A) leaves the AND filter's result completely unchanged");
  w.deleteFilterNodeWithUndo(entry.id);
  w.invalidateAllCaches();
  assert(w.getEntries(someAndEntry.id).length === reproCountBefore, "REPRO: deleting 'Entry' (B) too still leaves the AND filter's result completely unchanged");

  // --- Ancestor-independence: A nested under an unrelated ancestor C's
  // restriction must NOT leak into the combined result — only A's own
  // single condition (and B's) matter, never A's parent chain. ---
  const afterTen = w.createFilterNode(f.id, "timerange", { from: f.entries[8].ts, to: null }); // C: "only entries after index 8"
  const aUnderC = w.createFilterNode(afterTen.id, "text", "message 5"); // A, NESTED under C
  const bPlain = w.createFilterNode(f.id, "text", "message");           // B, matches everything
  const combinedUnderC = w.createAndOrNode([aUnderC.id, bPlain.id], "and");
  // A's own condition ("message 5") matches ONE entry file-wide (index 5),
  // which sits BEFORE C's "after index 8" restriction — if C's restriction
  // leaked in, the combined result would wrongly be empty.
  assert(w.getEntries(combinedUnderC.id).length === 1, "combining a nested filter A ignores A's ancestor C's restriction — only A's own condition applies");

  // --- Unpack: materializes bakedA/bakedB back into two real, visible
  // sibling filter nodes next to the original's own position — the original
  // combiner node itself is left completely untouched, no fresh combiner is
  // created, so Unpack never leaves a duplicate of itself behind. ---
  const unpackA = w.createFilterNode(f.id, "text", "pos");
  const unpackB = w.createFilterNode(f.id, "text", "val");
  const toUnpack = w.createAndOrNode([unpackA.id, unpackB.id], "and");
  const resultBefore = w.getEntries(toUnpack.id).map(e => e.id);
  const parentBefore = toUnpack.parentId;
  const returnedId = w.unpackAndOrLinkNode(toUnpack.id);
  assert(returnedId === toUnpack.id, "unpackAndOrLinkNode returns the ORIGINAL node's own id — no fresh combiner is created");
  assert(T.state.nodes[toUnpack.id], "the original combiner node still exists after Unpack");
  assert(toUnpack.filterType === "and" && toUnpack.parentId === parentBefore, "the original combiner is completely untouched — same type, same position");
  const materializedA = f.children.map(id => T.state.nodes[id]).find(n => n.value === "pos" && n.id !== unpackA.id && n.id !== posFilter.id);
  const materializedB = f.children.map(id => T.state.nodes[id]).find(n => n.value === "val" && n.id !== unpackB.id && n.id !== valFilter.id);
  assert(materializedA && materializedB, "Unpack materializes bakedA/bakedB into two NEW, real, visible sibling filter nodes");
  const resultAfter = w.getEntries(toUnpack.id).map(e => e.id);
  assert(JSON.stringify(resultBefore) === JSON.stringify(resultAfter), "the original combiner still produces the exact same result after Unpack");

  // --- Persistence carriers thread bakedA/bakedB through as plain data ---
  const clone = w.cloneSubtree(andNode.id, f.id);
  assert(clone.baked[0].value === andNode.baked[0].value && clone.baked[1].value === andNode.baked[1].value,
    "cloneSubtree deep-copies bakedA/bakedB as plain data");

  const snap = w.snapshotSubtree(andNode.id);
  delete T.state.nodes[andNode.id];
  const restored = w.restoreSubtree(snap);
  assert(restored.id === andNode.id && restored.baked[0].value === "pos 1" && restored.baked[1].value === "val",
    "snapshotSubtree/restoreSubtree preserve the ORIGINAL id and bakedA/bakedB (undo/redo)");

  const { roots: cacheRoots } = w.serializeFilterTreeForCache(f);
  const findAnd = list => { for (const n of list) { if (n.filterType === "and" && n.baked) return n; const r = findAnd(n.children); if (r) return r; } return null; };
  const serializedAnd = findAnd(cacheRoots);
  assert(serializedAnd, "serializeFilterTreeForCache emits bakedA/bakedB for an and/or node");
  const f2 = await w.addFile("128b.log", makeLog(0, 10), () => {});
  const refMap2 = w.materializeCachedFilters(f2, cacheRoots);
  const restoredAndId = Object.values(refMap2).find(id => T.state.nodes[id].filterType === "and" && T.state.nodes[id].baked);
  assert(restoredAndId, "materializeCachedFilters carries bakedA/bakedB through as plain data, no ref-resolution needed");
});
