// GROUP link-wildcard-key - loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP link-wildcard-key - link correlation key "Same -> wildcards"
   (linkKey { wildcards: [[startIdx, endIdx], ...] })
   Origin: 2026-10-09 (person-requested, link pairing round, step 1).
   Start and end pair only when the chosen wildcard captures of the START
   pattern equal the chosen captures of the END pattern - the two patterns
   have their own wildcards. Simulator scenario `flows` ("Flow [*] started
   run=[*]" / "Flow [*] ended result=[*]").
     a  sanitizeLinkKey cases
     b  start #1 = end #1 with differing second wildcards (nearest pairing)
     c  a side that is not a wildcard text condition keys nothing
     d  name suffix and the persistence carriers
   ============================================================ */
group("link-wildcard-key");

await withApp(async (w, d, T) => {
  section("link-wildcard-key a. sanitizeLinkKey");
  const sk = w.sanitizeLinkKey;
  assert(JSON.stringify(sk({ wildcards: [[0, 0], [1, 2]] })) === '{"wildcards":[[0,0],[1,2]]}', "valid pairs are kept in order");
  assert(JSON.stringify(sk({ wildcards: [[0, 1], [0, 1], [0, 1]] })) === '{"wildcards":[[0,1]]}', "duplicates are dropped");
  assert(JSON.stringify(sk({ wildcards: [[0, 0], [-1, 0], [1.5, 0], ["1", 2], [1], [1, 2, 3], null, "x", [0, NaN]] })) === '{"wildcards":[[0,0]]}', "invalid pairs are dropped, valid ones stay");
  assert(sk({ wildcards: [] }) === null && sk({ wildcards: [[-1, 0]] }) === null && sk({ wildcards: "0,0" }) === null && sk({ wildcards: {} }) === null, "no valid pair -> no key");
  assert(sk({ column: "thread", wildcards: [[0, 0]] }).column === "thread" && sk({ pattern: " a=[*] ", wildcards: [[0, 0]] }).pattern === "a=[*]", "column and pattern keep precedence (the stored key has one shape)");
  const src = { wildcards: [[0, 0]] }, out = sk(src);
  assert(out !== src && out.wildcards !== src.wildcards && out.wildcards[0] !== src.wildcards[0], "a fresh object, nothing shared with the input");
  const node = {};
  w.copyLinkOptions({ linkKey: src }, node);
  src.wildcards[0][0] = 9;
  assert(node.linkKey.wildcards[0][0] === 0, "copyLinkOptions copies the pairs deeply");
});

await withApp(async (w, d, T) => {
  section("link-wildcard-key b. start #1 = end #1 while the second wildcards differ");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 4000, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const all = w.getEntries(f.id);
  const nameOf = e => { const m = /^Flow (\S+) (?:started|ended)/.exec(e.message); return m ? m[1] : null; };
  const starts = all.filter(e => / started run=/.test(e.message));
  const ends = all.filter(e => / ended result=/.test(e.message));
  const start = w.createFilterNode(f.id, "text", "Flow [*] started run=[*]");
  const end = w.createFilterNode(f.id, "text", "Flow [*] ended result=[*]");
  const keyed = w.createLinkNode(start.id, end.id, "after", 1, { key: { wildcards: [[0, 0]] } });
  const pairs = w.getEntries(keyed.id);
  // Reference: nearest later end with the same name (no exclusivity).
  const idx = new Map(all.map((e, i) => [e, i]));
  const refPairs = starts.map(s => ({ s, e: ends.find(e => idx.get(e) > idx.get(s) && nameOf(e) === nameOf(s)) })).filter(x => x.e);
  assert(pairs.length === refPairs.length && pairs.every((p, i) => p.first === refPairs[i].s && p.second === refPairs[i].e), "each start takes the nearest later end of the same flow name (" + pairs.length + " pairs)");
  assert(pairs.every(p => nameOf(p.first) === nameOf(p.second)), "all pairs share the name");
  const plain = w.createLinkNode(start.id, end.id, "after", 1);
  assert(w.getEntries(plain.id).some(p => nameOf(p.first) !== nameOf(p.second)), "baseline: without the key some pairs cross flow names");
  assert(keyed.name.includes("[same #1=#1]"), "name suffix: " + keyed.name);
  // The second wildcards (run=R-n vs result=OK) never agree: a two-mapping key pairs nothing.
  const both = w.createLinkNode(start.id, end.id, "after", 1, { key: { wildcards: [[0, 0], [1, 1]] } });
  assert(w.getEntries(both.id).length === 0 && both._linkUnmatched.length === starts.length, "#1=#1 and #2=#2 together: run id never equals result, every start is without end");
  // Crossing indexes: start run vs end name never agree either.
  const cross = w.createLinkNode(start.id, end.id, "after", 1, { key: { wildcards: [[1, 0]] } });
  assert(w.getEntries(cross.id).length === 0, "start #2 = end #1 pairs nothing (run id vs name)");
  // An index past the pattern's wildcards keys nothing.
  const oor = w.createLinkNode(start.id, end.id, "after", 1, { key: { wildcards: [[5, 0]] } });
  assert(w.getEntries(oor.id).length === 0 && oor._linkUnmatched.length === starts.length, "an out-of-range wildcard index keys nothing");
  // Direction before and exclusive keep their meaning among same-key candidates.
  const back = w.createLinkNode(end.id, start.id, "before", 1, { key: { wildcards: [[0, 0]] } });
  assert(w.getEntries(back.id).length > 0 && w.getEntries(back.id).every(p => nameOf(p.first) === nameOf(p.second)), "direction before with the key");
  const ex = w.createLinkNode(start.id, end.id, "after", 1, { exclusive: true, key: { wildcards: [[0, 0]] } });
  const exPairs = w.getEntries(ex.id);
  assert(new Set(exPairs.map(p => p.second.id)).size === exPairs.length && exPairs.length <= pairs.length, "exclusive: no end is used twice");
  // The key works in the window mode, too: starts of other names are not the limit.
  const win = w.createLinkNode(start.id, end.id, "after", 1, { pairing: "window", key: { wildcards: [[0, 0]] } });
  const winPairs = w.getEntries(win.id);
  assert(winPairs.length > 0 && winPairs.every(p => nameOf(p.first) === nameOf(p.second)), "window + wildcard key pairs within the same name");
});

await withApp(async (w, d, T) => {
  section("link-wildcard-key c. a side that is not a wildcard text condition keys nothing");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 1500, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const key = { wildcards: [[0, 0]] };
  const wild = w.bakedTextCondition("Flow [*] started run=[*]");
  const wildEnd = w.bakedTextCondition("Flow [*] ended result=[*]");
  const ok = w.createLinkNodeFromBaked(f.id, wild, wildEnd, "after", 1, { key });
  assert(w.getEntries(ok.id).length > 10, "sanity: both sides wildcard text -> pairs");
  const plainStart = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("started run="), wildEnd, "after", 1, { key });
  assert(w.getEntries(plainStart.id).length === 0, "a plain-text start keys nothing: no pairs");
  const plainEnd = w.createLinkNodeFromBaked(f.id, wild, w.bakedTextCondition("ended result="), "after", 1, { key });
  assert(w.getEntries(plainEnd.id).length === 0, "a plain-text end keys nothing: no pairs");
  const regexStart = w.createLinkNodeFromBaked(f.id, Object.assign({}, wild, { isRegex: true }), wildEnd, "after", 1, { key });
  assert(w.getEntries(regexStart.id).length === 0, "a regex text side keys nothing");
  const levelStart = w.createLinkNodeFromBaked(f.id, { filterType: "level", value: ["INFO"], inverted: false }, wildEnd, "after", 1, { key });
  assert(w.getEntries(levelStart.id).length === 0 && levelStart._linkUnmatched.length > 0, "a level side keys nothing: the starts are without end");
  // A chained hop: the first side is a link, so the key keys nothing there (single-step only).
  const hop2 = w.createLinkNodeFromBaked(f.id, w.hopsToLinkChain(wild, [{ baked: wildEnd, direction: "after", n: 1 }], { key }), wild, "after", 1, { key });
  assert(w.getEntries(hop2.id).length === 0, "a chained hop with a wildcards key keys nothing");
});

await withApp(async (w, d, T) => {
  section("link-wildcard-key d. name suffix and every carrier");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 600, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  const S = T.state;
  const start = w.createFilterNode(f.id, "text", "Flow [*] started run=[*]");
  const end = w.createFilterNode(f.id, "text", "Flow [*] ended result=[*]");
  const link = w.createLinkNode(start.id, end.id, "after", 1, { key: { wildcards: [[0, 0], [1, 2]] }, pairing: "nested" });
  assert(link.name.endsWith(" [same #1=#1, #2=#3] (nested)"), "name suffix lists the 1-based mappings, then the pairing: " + link.name);
  assert(w.linkOptionsNameSuffix({ linkKey: { wildcards: [[2, 0]] }, linkDt: { op: ">", ms: 500 } }) === " [same #3=#1] (Δt > 500ms)", "suffix with Δt");
  const clone = w.cloneSubtree(link.id, f.id);
  assert(JSON.stringify(clone.linkKey) === JSON.stringify(link.linkKey) && clone.linkKey.wildcards !== link.linkKey.wildcards, "copy/paste");
  const wire = JSON.parse(JSON.stringify(w.serializeFilterBranch(link.id, false)));
  const { created } = w.materializeSerializedRoots(wire.roots, () => f.id);
  assert(JSON.stringify(created[0].linkKey) === '{"wildcards":[[0,0],[1,2]]}', "filter JSON round trip");
  const evil = JSON.parse(JSON.stringify(wire.roots[0]));
  evil.linkKey = { wildcards: [[0, 0], [-3, 1], "x", [2, 2], [2, 2]] };
  assert(JSON.stringify(w.materializeSerializedRoots([evil], () => f.id).created[0].linkKey) === '{"wildcards":[[0,0],[2,2]]}', "a hand-edited key is sanitized on import");
  evil.linkKey = { wildcards: [[-1, -1]] };
  assert(!("linkKey" in w.materializeSerializedRoots([evil], () => f.id).created[0]), "an all-invalid key is dropped on import");
  const cacheWire = JSON.parse(JSON.stringify(w.serializeFilterTreeForCache(f)));
  const n0 = f.children.length;
  w.materializeCachedFilters(f, cacheWire.roots);
  assert(f.children.slice(n0).map(id => S.nodes[id]).some(n => n.filterType === "link" && JSON.stringify(n.linkKey) === '{"wildcards":[[0,0],[1,2]]}'), "session cache round trip");
  const chain = w.hopsToLinkChain(w.bakedTextCondition("a [*]"), [{ baked: w.bakedTextCondition("b [*]"), direction: "after", n: 1 }], { key: { wildcards: [[0, 0]] } });
  assert(JSON.stringify(w.linkChainToHops(chain).key) === '{"wildcards":[[0,0]]}', "chain helpers keep it");
  w.updateLinkNodeWithUndo(link.id, chain);
  assert(JSON.stringify(link.linkKey) === '{"wildcards":[[0,0]]}', "edit sets the key");
  w.undo();
  assert(JSON.stringify(S.nodes[link.id].linkKey) === '{"wildcards":[[0,0],[1,2]]}', "undo restores the previous key");
  assert(JSON.stringify(w.restoreSubtree(w.snapshotSubtree(link.id)).linkKey) === '{"wildcards":[[0,0],[1,2]]}', "undo/redo snapshot");
});
