// GROUP link-unmatched — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-unmatched — node._linkUnmatched: the references without a pair
   Origin: 2026-10-04 (link usability round B, step 1). computeLinkPairs
   collects the reference entries that got no pair (no key, no candidate,
   no match, order-enforce reject) — not the ones the Δt post-filter
   dropped — into node._linkUnmatched, runtime only (like _gapMs), refreshed
   whenever the node's cache is recomputed.
   ============================================================ */
group("link-unmatched");

await withApp(async (w, d, T) => {
  section("link-unmatched a. no-candidate, key-less and Δt-dropped references");
  const f = await w.addFile("link.log", linkKeyLog(), () => {});
  const move = w.createFilterNode(f.id, "text", "move requested");
  const reached = w.createFilterNode(f.id, "text", "position reached");
  const plain = w.createLinkNode(move.id, reached.id, "after", 1);
  w.getEntries(plain.id);
  assert(Array.isArray(plain._linkUnmatched) && plain._linkUnmatched.length === 0, "every move has an end: nothing unmatched");
  // 'before': the moves at 0.000 and 0.200 have no earlier 'position reached'.
  const before = w.createLinkNode(move.id, reached.id, "before", 1);
  const bp = w.getEntries(before.id);
  assert(before._linkUnmatched.map(e => e.message).join() === "move requested axis 1,move requested axis 2" && before._linkUnmatched[0].ts < before._linkUnmatched[1].ts && bp.length === 1,
    "direction before: the first two moves have no end, listed in ref order (" + bp.length + " pair)");
  // 3rd end after: the move at 5.000 has only two ends after it.
  const third = w.createLinkNode(move.id, reached.id, "after", 3);
  w.getEntries(third.id);
  assert(third._linkUnmatched.length === 1 && third._linkUnmatched[0].ts === w.getEntries(move.id)[2].ts, "N=3: the last move has no 3rd following end, got " + third._linkUnmatched.length);
  // Key: Thread — the T3 end (axis 1 @0.500) never pairs; moves only on T1/T2.
  const keyed = w.createLinkNode(move.id, reached.id, "after", 1, { key: { column: "thread" } });
  w.getEntries(keyed.id);
  assert(keyed._linkUnmatched.length === 0, "thread key: every move still finds an end on its own thread");
  // A key pattern the move messages do not carry: no key at all -> all unmatched.
  const nokey = w.createLinkNode(move.id, reached.id, "after", 1, { key: { pattern: "job=[*:word]" } });
  assert(w.getEntries(nokey.id).length === 0 && nokey._linkUnmatched.length === 3, "key-less references are unmatched (3 moves)");
  // Δt drops pairs but the references are not 'unmatched'.
  const dt = w.createLinkNode(move.id, reached.id, "after", 1, { dt: { op: ">", ms: 200 } });
  assert(w.getEntries(dt.id).length === 1 && dt._linkUnmatched.length === 0, "Δt-dropped pairs are not unmatched");
  // Exclusive: later references find their target taken.
  const ex = w.createLinkNode(move.id, reached.id, "after", 1, { exclusive: true, key: { column: "thread" } });
  w.getEntries(ex.id);
  assert(Array.isArray(ex._linkUnmatched), "exclusive node has the list too");
});

await withApp(async (w, d, T) => {
  section("link-unmatched b. order enforcement rejects count as unmatched; chained link lists pair entries");
  const f = await w.addFile("link.log", linkKeyLog(), () => {});
  const move = w.createFilterNode(f.id, "text", "move requested");
  const reached = w.createFilterNode(f.id, "text", "position reached");
  const hop1 = w.createLinkNode(move.id, reached.id, "after", 1);
  const chain = w.createLinkNode(hop1.id, move.id, "after", 1);
  const tuples = w.getEntries(chain.id);
  // hop1 has 3 pairs; only the one anchored at the first move's end reaches a later move.
  assert(tuples.length === 2 && chain._linkUnmatched.length === 1 && chain._linkUnmatched[0].isPair,
    "chained: the reference is a pair entry; 3 pairs, 2 tuples, 1 without a next move (got " + tuples.length + "/" + chain._linkUnmatched.length + ")");
  const mixed = w.createLinkNodeFromBaked(f.id, w.bakeNodeCondition(move), w.bakeNodeCondition(reached), "before", 1, { orderEnforced: true });
  w.getEntries(mixed.id);
  assert(w.getEntries(mixed.id).length === 0 && mixed._linkUnmatched.length === 3, "order enforced + 'before': every match lands before the anchor and is rejected, all 3 unmatched");
});

await withApp(async (w, d, T) => {
  section("link-unmatched c. refreshed with the cache, not persisted");
  const f = await w.addFile("link.log", linkKeyLog(), () => {});
  const move = w.createFilterNode(f.id, "text", "move requested");
  const reached = w.createFilterNode(f.id, "text", "position reached");
  const link = w.createLinkNode(move.id, reached.id, "before", 1);
  w.getEntries(link.id);
  assert(link._linkUnmatched.length === 2, "before: 2 unmatched");
  w.updateLinkNodeWithUndo(link.id, w.hopsToLinkChain(w.bakedTextCondition("move requested"), [{ baked: w.bakedTextCondition("position reached"), direction: "after", n: 1 }], {}));
  w.getEntries(link.id);
  assert(link._linkUnmatched.length === 0, "after the edit the list is recomputed: 0 unmatched");
  w.undo();
  w.getEntries(link.id);
  assert(link._linkUnmatched.length === 2, "undo restores the direction and the list is recomputed: 2 unmatched");
  const ser = JSON.stringify(w.serializeFilterBranch(link.id));
  assert(!ser.includes("_linkUnmatched") && !ser.includes("linkUnmatched"), "not in the filter JSON");
  const snap = w.snapshotSubtree(link.id);
  assert(!JSON.stringify(snap).includes("nmatched"), "not in the undo snapshot");
  const clone = w.cloneSubtree(link.id, f.id);
  assert(clone._linkUnmatched === undefined, "not copied by clone");
});
