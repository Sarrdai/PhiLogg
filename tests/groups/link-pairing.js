// GROUP link-pairing - loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP link-pairing - link pairing modes: "Before the next start"
   (linkPairing "window") and "Nested" (linkPairing "nested")
   Origin: 2026-10-09 (person-requested, link pairing round, step 1:
   engine, key and persistence; the dialog is step 2). Simulator data
   only: scenario `axes` (a move whose Y end only sometimes comes) and
   `flows` (nested start/end brackets, some with the same name).
     a  window vs nearest on axes: pairs == Y lines, skipped moves are
        not "without end", only the trailing one is
     b  window, direction before (mirrored) on the same data
     c  nested on flows with the wildcard key: every pair shares its flow
        name, same-name nesting pairs inner with inner, leftovers are
        "without end" in reference order
     d  nested without a key (plain brackets), Δt stays a post-filter
     e  persistence of linkPairing: filter JSON, session cache, copy/paste,
        undo of a dialog edit, hostile values, name suffix, chain helpers
   ============================================================ */
group("link-pairing");

// Pairs of (start, end) message ids, for comparing with a reference run.
const pairIds = pairs => pairs.map(p => p.first.id + ">" + p.second.id);

await withApp(async (w, d, T) => {
  section("link-pairing a. 'Before the next start' on axes: every Y line pairs, skipped moves are not 'without end'");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["axes"], entries: 800, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const all = w.getEntries(f.id);
  const moves = all.filter(e => e.message === "Move axes requested");
  const ys = all.filter(e => /^Axis Y moved/.test(e.message));
  assert(moves.length > 100 && ys.length > 20 && ys.length < moves.length, "sanity: many moves, fewer Y ends (" + moves.length + " moves, " + ys.length + " Y)");
  // Reference: a move's own Y is the Y between it and the next move.
  const idx = e => all.indexOf(e);
  const ownY = moves.map((m, i) => {
    const hi = i + 1 < moves.length ? idx(moves[i + 1]) : all.length;
    return ys.find(y => idx(y) > idx(m) && idx(y) < hi) || null;
  });
  const withoutY = ownY.filter(y => !y).length;
  const lastHasNoY = !ownY[ownY.length - 1];
  const move = w.createFilterNode(f.id, "text", "Move axes requested");
  const yEnd = w.createFilterNode(f.id, "text", "Axis Y moved");

  const near = w.createLinkNode(move.id, yEnd.id, "after", 1);
  const nearPairs = w.getEntries(near.id);
  const win = w.createLinkNode(move.id, yEnd.id, "after", 1, { pairing: "window" });
  const winPairs = w.getEntries(win.id);
  assert(win.linkPairing === "window" && near.linkPairing === undefined, "the node carries linkPairing only when it is not nearest");
  assert(winPairs.length === ys.length, "window: one pair per Y line (" + winPairs.length + " of " + ys.length + ")");
  assert(winPairs.every(p => ownY[moves.indexOf(p.first)] === p.second), "window: every pair is a move with its own Y");
  assert(nearPairs.length > winPairs.length, "baseline: nearest also pairs the moves without Y with a LATER move's Y (" + nearPairs.length + " vs " + winPairs.length + ")");
  assert(pairIds(winPairs).join() === pairIds(winPairs.slice().sort((a, b) => a.ts - b.ts)).join(), "window: pairs come out in reference order");

  const meta = {};
  const evaluated = w.evaluateFilterCondition(win, w.getEntries(f.id), f.id, meta);
  assert(pairIds(evaluated).join() === pairIds(winPairs).join(), "evaluateFilterCondition gives the same pairs");
  const skipped = meta.linkSkipped, unmatched = meta.linkUnmatched;
  assert(Array.isArray(skipped) && Array.isArray(unmatched), "meta.linkSkipped and meta.linkUnmatched are arrays");
  assert(skipped.length === withoutY - (lastHasNoY ? 1 : 0), "skipped == moves without Y minus the last one if it has none (" + skipped.length + " vs " + (withoutY - (lastHasNoY ? 1 : 0)) + ")");
  assert(unmatched.length === (lastHasNoY ? 1 : 0), "only a trailing move without any end later is 'without end' (" + unmatched.length + ")");
  assert(win._linkUnmatched.length === unmatched.length && skipped.every(s => !win._linkUnmatched.includes(s)), "node._linkUnmatched holds none of the skipped starts");
  assert(skipped.every(s => ownY[moves.indexOf(s)] === null), "every skipped start is a move without its own Y");
  assert(winPairs.length + skipped.length + unmatched.length === moves.length, "every move is paired, skipped or without end");
  assert(near._skipped === undefined && Object.keys(near).every(k => !/skipped/i.test(k)), "skipped is not a node field");
  const nearMeta = {};
  w.evaluateFilterCondition(near, w.getEntries(f.id), f.id, nearMeta);
  assert(nearMeta.linkSkipped.length === 0, "nearest never skips");

  // N works within the window: the 2nd end after a move is never inside it (X is the 1st? no: Y only) -> all skipped/unmatched
  const win2 = w.createLinkNode(move.id, yEnd.id, "after", 2, { pairing: "window" });
  assert(w.getEntries(win2.id).length === 0, "window, N=2: a window never holds two Y ends, so nothing pairs");
  // Δt stays a post-filter: a pair it drops is neither skipped nor unmatched.
  const winDt = w.createLinkNode(move.id, yEnd.id, "after", 1, { pairing: "window", dt: { op: ">", ms: 100000 } });
  const dtMeta = {};
  assert(w.evaluateFilterCondition(winDt, w.getEntries(f.id), f.id, dtMeta).length === 0 && dtMeta.linkSkipped.length === skipped.length && dtMeta.linkUnmatched.length === unmatched.length,
    "window + Δt: the dropped pairs are not counted as skipped or unmatched");
});

await withApp(async (w, d, T) => {
  section("link-pairing b. 'Before the next start', direction before (mirrored): the end must lie after the previous start");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["axes"], entries: 800, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const all = w.getEntries(f.id);
  const moves = all.filter(e => e.message === "Move axes requested");
  const idx = e => all.indexOf(e);
  const ys = all.filter(e => /^Axis Y moved/.test(e.message));
  const ownY = moves.map((m, i) => {
    const hi = i + 1 < moves.length ? idx(moves[i + 1]) : all.length;
    return ys.find(y => idx(y) > idx(m) && idx(y) < hi) || null;
  });
  const move = w.createFilterNode(f.id, "text", "Move axes requested");
  const yEnd = w.createFilterNode(f.id, "text", "Axis Y moved");
  // Reference move k looks BACK for a Y after move k-1: that is move k-1's own Y.
  const back = w.createLinkNode(move.id, yEnd.id, "before", 1, { pairing: "window" });
  const pairs = w.getEntries(back.id);
  const expected = moves.filter((m, k) => k > 0 && ownY[k - 1]).length;
  assert(pairs.length === expected, "before: a move pairs with the Y of the move before it (" + pairs.length + " of " + expected + ")");
  assert(pairs.every(p => { const k = moves.indexOf(p.second === undefined ? null : (p.first.message === "Move axes requested" ? p.first : p.second)); return k > 0 && ownY[k - 1] && (p.first === ownY[k - 1] || p.second === ownY[k - 1]); }), "before: every pair is move k with Y of move k-1");
  const meta = {};
  w.evaluateFilterCondition(back, w.getEntries(f.id), f.id, meta);
  assert(meta.linkUnmatched.length === 1 && meta.linkUnmatched[0] === moves[0], "before: only the first move (no previous start, no end before it) is 'without end'");
  const skippedExpected = moves.filter((m, k) => k > 0 && !ownY[k - 1]).length;
  assert(meta.linkSkipped.length === skippedExpected, "before: a move whose previous move had no Y is skipped (" + meta.linkSkipped.length + " of " + skippedExpected + ")");
});

await withApp(async (w, d, T) => {
  section("link-pairing c. 'Nested' with the wildcard key on flows: brackets per flow name");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 4000, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const all = w.getEntries(f.id);
  const nameOf = e => { const m = /^Flow (\S+) (started|ended)/.exec(e.message); return m ? m[1] : null; };
  const starts = all.filter(e => / started run=/.test(e.message));
  const ends = all.filter(e => / ended result=/.test(e.message));
  // Reference: per-name stacks over the merged log.
  const stacks = {}, refPairs = new Map(), openAtEnd = [];
  for (const e of all) {
    const nm = nameOf(e);
    if (!nm) continue;
    if (/ started /.test(e.message)) (stacks[nm] = stacks[nm] || []).push(e);
    else if (stacks[nm] && stacks[nm].length) refPairs.set(stacks[nm].pop(), e);
  }
  for (const s of starts) if (!refPairs.has(s)) openAtEnd.push(s);
  assert(starts.length > 500 && ends.length > 500 && openAtEnd.length > 5, "sanity: hundreds of flows, some that never end (" + starts.length + "/" + ends.length + "/" + openAtEnd.length + ")");

  const start = w.createFilterNode(f.id, "text", "Flow [*] started run=[*]");
  const end = w.createFilterNode(f.id, "text", "Flow [*] ended result=[*]");
  const nested = w.createLinkNode(start.id, end.id, "after", 1, { pairing: "nested", key: { wildcards: [[0, 0]] } });
  const pairs = w.getEntries(nested.id);
  assert(pairs.length === ends.length, "one pair per 'ended' line (" + pairs.length + " of " + ends.length + ")");
  assert(pairs.every(p => nameOf(p.first) === nameOf(p.second) && p.first.ts <= p.second.ts), "every pair's start and end share the flow name, start first");
  assert(pairs.length === refPairs.size && pairs.every(p => refPairs.get(p.first) === p.second), "the pairs equal the reference per-name stack run");
  assert(pairIds(pairs).join() === pairIds(pairs.slice().sort((a, b) => a.ts - b.ts)).join(), "pairs come out in reference (start) order");
  assert(nested._linkUnmatched.length === openAtEnd.length && nested._linkUnmatched.every((s, i) => s === openAtEnd[i]), "the starts that never ended are 'without end', in reference order (" + nested._linkUnmatched.length + ")");
  // A same-name nesting (Retry in Retry, ...) pairs inner with inner.
  const encl = pairs.find(o => pairs.some(i => i !== o && nameOf(i.first) === nameOf(o.first) && i.first.ts > o.first.ts && i.second.ts < o.second.ts));
  assert(!!encl, "sanity: the data holds a same-name flow nested in another");
  const inner = pairs.find(i => i !== encl && nameOf(i.first) === nameOf(encl.first) && i.first.ts > encl.first.ts && i.second.ts < encl.second.ts);
  assert(inner.second.ts < encl.second.ts && all.indexOf(inner.first) > all.indexOf(encl.first) && all.indexOf(inner.second) < all.indexOf(encl.second), "inner start pairs with the inner end, the outer start with the outer end");
  // Same ids on the evaluator path, with the skipped list empty (nested never skips).
  const meta = {};
  w.evaluateFilterCondition(nested, w.getEntries(f.id), f.id, meta);
  assert(meta.linkSkipped.length === 0 && meta.linkUnmatched.length === openAtEnd.length, "nested: nothing is skipped");
  // Direction and N do not apply.
  const nestedBefore = w.createLinkNode(start.id, end.id, "before", 3, { pairing: "nested", key: { wildcards: [[0, 0]] } });
  assert(pairIds(w.getEntries(nestedBefore.id)).join() === pairIds(pairs).join(), "nested ignores direction and N");
  // A chained hop falls back to nearest pairing.
  const hop2 = w.createLinkNode(nested.id, end.id, "after", 1, { pairing: "nested", key: { wildcards: [[0, 0]] } });
  assert(Array.isArray(w.getEntries(hop2.id)), "a nested link used as a chained hop does not throw (it pairs nearest)");

  // An entry that is both a start and an end closes an open same-key start, else it opens one.
  const bothSide = w.createFilterNode(f.id, "text", " started run=");
  const both = w.createLinkNode(bothSide.id, bothSide.id, "after", 1, { pairing: "nested" });
  const bothPairs = w.getEntries(both.id);
  assert(bothPairs.length === Math.floor(starts.length / 2) && bothPairs.every((p, k) => p.first === starts[2 * k] && p.second === starts[2 * k + 1]),
    "both sides = the same entries: they alternate open/close, (1st,2nd), (3rd,4th), ... (" + bothPairs.length + " pairs of " + starts.length + " entries)");
  assert(both._linkUnmatched.length === starts.length % 2, "an odd last entry stays open: 'without end'");
});

await withApp(async (w, d, T) => {
  section("link-pairing d. 'Nested' without a key is plain brackets; Δt stays a post-filter");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 4000, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const all = w.getEntries(f.id);
  const start = w.createFilterNode(f.id, "text", "started run=");
  const end = w.createFilterNode(f.id, "text", "ended result=");
  const stack = [], ref = new Map();
  for (const e of all) {
    if (/ started run=/.test(e.message)) stack.push(e);
    else if (/ ended result=/.test(e.message) && stack.length) ref.set(stack.pop(), e);
  }
  const brackets = w.createLinkNode(start.id, end.id, "after", 1, { pairing: "nested" });
  const pairs = w.getEntries(brackets.id);
  assert(pairs.length === ref.size && pairs.every(p => ref.get(p.first) === p.second), "plain brackets equal the single-stack reference (" + pairs.length + ")");
  const nearest = w.createLinkNode(start.id, end.id, "after", 1);
  assert(w.getEntries(nearest.id).length !== pairs.length || pairIds(w.getEntries(nearest.id)).join() !== pairIds(pairs).join(), "baseline: nearest pairs differently");

  const withDt = w.createLinkNode(start.id, end.id, "after", 1, { pairing: "nested", dt: { op: ">", ms: 300 } });
  const dtPairs = w.getEntries(withDt.id);
  const expectDt = pairs.filter(p => p.dtMs > 300);
  assert(dtPairs.length > 0 && dtPairs.length < pairs.length && pairIds(dtPairs).join() === pairIds(expectDt).join(), "Δt > 300 ms keeps exactly the matching brackets (" + dtPairs.length + " of " + pairs.length + ")");
  assert(withDt._linkUnmatched.length === brackets._linkUnmatched.length, "the Δt post-filter does not change what is 'without end'");
});

await withApp(async (w, d, T) => {
  section("link-pairing e. linkPairing through every carrier");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["axes"], entries: 300, seed: 3 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const S = T.state;
  const move = w.createFilterNode(f.id, "text", "Move axes requested");
  const yEnd = w.createFilterNode(f.id, "text", "Axis Y moved");
  const win = w.createLinkNode(move.id, yEnd.id, "after", 1, { pairing: "window", key: { column: "thread" } });
  const nest = w.createLinkNode(move.id, yEnd.id, "after", 1, { pairing: "nested" });
  const plain = w.createLinkNode(move.id, yEnd.id, "after", 1, {});
  assert(win.name.endsWith(" [same Thread] (before next start)") && nest.name.endsWith(" (nested)") && !/next start|nested/.test(plain.name), "name suffixes: ' (before next start)', ' (nested)', none for nearest: " + win.name + " / " + nest.name);
  assert(!("linkPairing" in plain), "a nearest link never stores linkPairing");

  const clone = w.cloneSubtree(win.id, f.id);
  assert(clone.linkPairing === "window", "copy/paste keeps linkPairing");
  const wire = JSON.parse(JSON.stringify(w.serializeFilterBranch(nest.id, false)));
  assert(wire.roots[0].linkPairing === "nested" && !("linkPairing" in JSON.parse(JSON.stringify(w.serializeFilterBranch(plain.id, false))).roots[0]), "filter JSON writes it for window/nested only");
  const { created } = w.materializeSerializedRoots(wire.roots, () => f.id);
  assert(created[0].linkPairing === "nested", "filter JSON import restores it");
  const cacheWire = JSON.parse(JSON.stringify(w.serializeFilterTreeForCache(f)));
  const n0 = f.children.length;
  w.materializeCachedFilters(f, cacheWire.roots);
  const reloaded = f.children.slice(n0).map(id => S.nodes[id]).filter(n => n.filterType === "link");
  assert(reloaded.some(n => n.linkPairing === "window") && reloaded.some(n => n.linkPairing === "nested") && reloaded.some(n => !n.linkPairing), "session cache round trip");
  // Hostile values are dropped.
  for (const bad of ["nearest", "bogus", 1, true, {}, ""]) {
    const evil = JSON.parse(JSON.stringify(wire.roots[0]));
    evil.linkPairing = bad;
    const { created: c2 } = w.materializeSerializedRoots([evil], () => f.id);
    assert(c2.length === 1 && !("linkPairing" in c2[0]), "import drops linkPairing " + JSON.stringify(bad));
  }
  // Undo of a dialog-style edit.
  const chain = w.hopsToLinkChain(w.bakedTextCondition("Move axes requested"), [{ baked: w.bakedTextCondition("Axis Y moved"), direction: "after", n: 1 }], { pairing: "window" });
  assert(chain.linkPairing === "window", "hopsToLinkChain writes opts.pairing on the link");
  assert(w.linkChainToHops(chain).pairing === "window" && w.linkChainToHops(w.hopsToLinkChain(w.bakedTextCondition("a"), [{ baked: w.bakedTextCondition("b"), direction: "after", n: 1 }], {})).pairing === null, "linkChainToHops reads it off the outermost link");
  w.updateLinkNodeWithUndo(plain.id, chain);
  assert(plain.linkPairing === "window" && plain.name.endsWith("(before next start)"), "an edit sets linkPairing and the auto name follows");
  w.undo();
  assert(S.nodes[plain.id].linkPairing === undefined, "undo of the edit removes it again");
  w.redo();
  assert(S.nodes[plain.id].linkPairing === "window", "redo brings it back");
  const noPairing = w.hopsToLinkChain(w.bakedTextCondition("Move axes requested"), [{ baked: w.bakedTextCondition("Axis Y moved"), direction: "after", n: 1 }], {});
  w.updateLinkNodeWithUndo(plain.id, noPairing);
  assert(S.nodes[plain.id].linkPairing === undefined, "an edit back to nearest deletes the field");
  // Baked conditions and from-baked creation.
  const baked = w.bakeNodeCondition(win);
  assert(baked.linkPairing === "window", "bakeNodeCondition keeps it");
  assert(w.materializeBakedAsNode(baked, f.id).linkPairing === "window", "materializeBakedAsNode keeps it");
  const fromBaked = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("a"), w.bakedTextCondition("b"), "after", 1, { pairing: "nested" });
  assert(fromBaked.linkPairing === "nested" && fromBaked.name.endsWith("(nested)"), "createLinkNodeFromBaked takes opts.pairing");
  // Snapshot / restore (undo of delete).
  const snap = w.snapshotSubtree(win.id);
  assert(snap.linkPairing === "window" && w.restoreSubtree(snap).linkPairing === "window", "undo/redo snapshot keeps it");
});
