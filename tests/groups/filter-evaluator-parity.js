// GROUP filter-evaluator-parity - loaded by philogg.regression.test.js
// (tests/README.md -> "Group files"): runs inside its main async function, so
// every harness helper (withApp, waitFor, assert, section, LOGSIM, ...) is in
// scope.

/* ============================================================
   GROUP filter-evaluator-parity - the node evaluator (getEntriesUncached)
   and the baked-condition evaluator (getEntriesFromBaked, used for every side
   of an and/or/link node) give the same answer for every filter type
   Origin: 2026-10-02 (code health: both functions implement every filter
   type, one on a live tree node, one on a flat baked snapshot, and the baked
   one's own comment says it "mirrors" the other exactly. A new filter type or
   option has to be added in two places forever, and nothing but the two
   copies agreeing keeps and/or/link results equal to the standalone node's.)
   Safety net for turning them into ONE evaluator, deliberately independent of
   how that is built: it compares RESULTS (ids, order, entry identity), plus
   the node-only side data (_gapMs, _contextRanges, _anchorIds) and the
   parentOverride contract the tail extension relies on. The fixture is one
   simulator log (a second one for the multi-file case) with filter bounds that
   sit exactly on entry timestamps and gap thresholds equal to gaps that really
   occur, so an inclusive/exclusive slip changes a result; the sections check
   that their comparisons are not vacuous.
   - a. anchors: standalone nodes of every plain type against hand-rolled
     predicates, so a change that breaks both evaluators the same way shows.
   - b. one node of every type and option, hung under six pools - the
     file, a filtered pool, a deeper chain, an empty pool, a second file and a
     filtered pool in it: getEntriesFromBaked(bakeNodeCondition(node), pool,
     the node's root file) must equal getEntries(node), same ids, same order.
   - c. and/or over EVERY pair of plain filter types, in both modes and over
     two pools: the combiner (baked sides) must equal the intersection / union
     of STANDALONE nodes of those two conditions placed under the same pool;
     plus combiners nested in combiners against set algebra over plain nodes.
   - d. link over every ordered pair of types, and every link option: the node
     must equal computeLinkPairs over the standalone nodes' results.
   - e. side data: _gapMs / _contextRanges / _anchorIds of the node path against
     brute-force recomputations, and the baked path writes none of it.
   - f. a parentOverride evaluation (extendCachedEntries' tail delta) tests
     exactly the slice it is given and never touches the cache.
   - g. inversion: applied to every plain type, withheld for link/context/
     countContext (their result is not a subset of the pool).
   ============================================================ */
group("filter-evaluator-parity");

await withApp(async (w, d, T) => {
  const S = T.state;
  const [simFile] = LOGSIM.generateToStrings({ scenarios: ["basic", "motion", "bursts", "gaps"], entries: 260, seed: 11 });
  const f = await w.addFile(simFile.name, simFile.text, () => {});
  S.activeId = f.id;
  w.render();
  const E = f.entries;
  const ts0 = E[0].ts;
  // filter bounds sit exactly ON an entry's timestamp, so an inclusive/exclusive slip changes the result
  const tsAfter = E[100].ts, tsBefore = E[150].ts, tsFrom = E[40].ts, tsTo = E[120].ts, tsLateFrom = E[200].ts, tsEarlyTo = E[30].ts;
  const ids = list => list.map(e => e.id);
  // same entries in the same order; real log entries are shared objects, pair
  // entries (links) are rebuilt on every evaluation, so those compare by id
  const sameList = (a, b) => a.length === b.length && a.every((e, i) => e.id === b[i].id && (e.isPair || e === b[i]));
  const rank = new Map(E.map((e, i) => [e.id, i]));
  // the page runs in its own realm: its Map/Set are not this file's, so instanceof cannot be used
  const tag = x => Object.prototype.toString.call(x);
  const isMap = x => tag(x) === "[object Map]";
  const isSet = x => tag(x) === "[object Set]";

  // Bookmarks and notes are plain Maps on the state (no auto filter node is
  // needed for the "bookmarks"/"notes" filter types to evaluate), set before
  // anything is evaluated, so no cache can be stale.
  E.forEach((e, i) => {
    if (i % 9 === 0) S.bookmarks.set(e.id, { bookmarkedAt: 0 });
    if (i % 11 === 3) S.notes.set(e.id, "n");
  });

  // Pools: the nodes whose result the nodes under test receive as input.
  const mkText = (parentId, value, o = {}) => w.createFilterNode(parentId, "text", value, !!o.inv, null, !!o.cs, o.cols || null, !!o.re, !!o.word);
  const poolMix = mkText(f.id, "axis|retry|queue depth|scheduler tick", { re: true });
  const poolSub = w.createFilterNode(poolMix.id, "timerange", { from: ts0 + 2000, to: ts0 + 17000 });
  const poolNone = mkText(f.id, "zzz-no-such-text");
  const pools = [
    { name: "file", node: f },
    { name: "mix", node: poolMix },
    { name: "chain", node: poolSub },
    { name: "empty", node: poolNone },
  ];
  const poolsForPairs = pools.slice(0, 2);
  pools.forEach(pl => { pl.fileId = f.id; });
  // A second file: the baked evaluator is handed the root file by its caller, so
  // the nodes under test have to find THEIR file's entries, not the first one's.
  const [simFile2] = LOGSIM.generateToStrings({ scenarios: ["basic", "motion", "bursts", "gaps"], entries: 200, seed: 23 });
  const f2 = await w.addFile("second-" + simFile2.name, simFile2.text, () => {});
  pools.push({ name: "file2", node: f2, fileId: f2.id });
  pools.push({ name: "file2-filtered", node: mkText(f2.id, "axis|retry|queue depth|scheduler tick", { re: true }), fileId: f2.id });

  // Source nodes the combiners and links are built from (under the file).
  const base = {
    tick: mkText(f.id, "Scheduler tick"),
    heart: mkText(f.id, "Heartbeat"),
    retry: mkText(f.id, "Retrying"),
    move: mkText(f.id, "Move requested"),
    reach: mkText(f.id, "Position reached"),
    queue: mkText(f.id, "Queue depth"),
    warn: w.createFilterNode(f.id, "level", ["WARN"]),
    dbg: w.createFilterNode(f.id, "level", ["DEBUG", "WARN"]),
    span: w.createFilterNode(f.id, "timerange", { from: ts0 + 3000, to: ts0 + 14000 }),
  };
  // A combiner/link is always created as a child of the file (createAndOrNode,
  // createLinkNode); this hangs it under the pool the test wants.
  let unplaced = 0;
  const place = (node, parentId) => { if (parentId !== f.id && !w.moveNode(node.id, parentId)) unplaced++; return node; };
  const withInverted = node => { node.inverted = true; return node; };

  // One entry per filter type and option. make(parentId) creates a fresh node
  // of that condition as a child of parentId. `empty`: expected to match
  // nothing over the whole file (anything else must match something, so no
  // comparison below is vacuous). `link`: not combinable by and/or.
  const specs = [
    { name: "text", make: p => mkText(p, "order") },
    { name: "textCS", make: p => mkText(p, "Order", { cs: true }) },
    { name: "textWord", make: p => mkText(p, "order", { word: true }) },
    // "tick" is in the message of the scheduler ticks but also in the method column of the heartbeats and queue depths
    { name: "textCols", make: p => mkText(p, "tick", { cols: ["message"] }) },
    { name: "regex", make: p => mkText(p, "retry|abort", { re: true }) },
    { name: "regexCS", make: p => mkText(p, "order", { re: true, cs: true }) },
    { name: "regexCols", make: p => mkText(p, "axis-[12]$", { re: true, cols: ["thread"] }) },
    { name: "regexInvalid", make: p => mkText(p, "(unclosed", { re: true }), empty: true },
    { name: "wildcard", make: p => mkText(p, "Scheduler tick, [*:int>=8] jobs pending") },
    { name: "wildcardCols", make: p => mkText(p, "axis-[*:int>=2]", { cols: ["thread"] }) },
    { name: "timerange", make: p => w.createFilterNode(p, "timerange", { from: tsFrom, to: tsTo }) },
    { name: "timerangeFrom", make: p => w.createFilterNode(p, "timerange", { from: tsLateFrom, to: null }) },
    { name: "timerangeTo", make: p => w.createFilterNode(p, "timerange", { from: null, to: tsEarlyTo }) },
    { name: "after", make: p => w.createFilterNode(p, "after", tsAfter) },
    { name: "before", make: p => w.createFilterNode(p, "before", tsBefore) },
    { name: "idset", make: p => w.createFilterNode(p, "idset", E.filter((e, i) => i % 5 === 0).map(e => e.id)) },
    { name: "level", make: p => w.createFilterNode(p, "level", ["ERROR", "WARN"]) },
    { name: "levelEmpty", make: p => w.createFilterNode(p, "level", []), empty: true },
    { name: "bookmarks", make: p => w.createFilterNode(p, "bookmarks", "Bookmarks") },
    { name: "notes", make: p => w.createFilterNode(p, "notes", "Notes") },
    { name: "gap", make: p => w.createGapNode(p, { ms: 142, per: null }) },
    { name: "gapPerThread", make: p => w.createGapNode(p, { ms: 605, per: "thread" }) },
    { name: "context", make: p => w.createContextNode(p, 400, 600) },
    { name: "contextBefore", make: p => w.createContextNode(p, 900, 0) },
    { name: "countContext", make: p => w.createCountContextNode(p, 2, 1) },
    { name: "textInv", make: p => mkText(p, "heartbeat", { inv: true }) },
    { name: "regexInv", make: p => mkText(p, "retry|abort", { re: true, inv: true }) },
    { name: "wildcardInv", make: p => mkText(p, "Scheduler tick, [*:int>=8] jobs pending", { inv: true }) },
    { name: "timerangeInv", make: p => withInverted(w.createFilterNode(p, "timerange", { from: tsFrom, to: tsTo })) },
    { name: "afterInv", make: p => w.createFilterNode(p, "after", tsAfter, true) },
    { name: "idsetInv", make: p => w.createFilterNode(p, "idset", E.filter((e, i) => i % 5 === 0).map(e => e.id), true) },
    { name: "levelInv", make: p => w.createFilterNode(p, "level", ["INFO"], true) },
    { name: "bookmarksInv", make: p => withInverted(w.createFilterNode(p, "bookmarks", "Bookmarks")) },
    { name: "gapInv", make: p => withInverted(w.createGapNode(p, { ms: 142, per: null })) },
    // inverted context/countContext are never offered by the UI; the inversion
    // is withheld (section g), their result is the plain window
    { name: "contextInv", make: p => withInverted(w.createContextNode(p, 400, 600)) },
    { name: "countContextInv", make: p => withInverted(w.createCountContextNode(p, 2, 1)) },
    // combiners: baked lists, nested to two levels
    { name: "and", make: p => place(w.createAndOrNode([base.move.id, base.span.id], "and"), p) },
    { name: "or", make: p => place(w.createAndOrNode([base.reach.id, base.warn.id], "or"), p) },
    { name: "nested", make: p => {
        const inner = w.createAndOrNode([base.heart.id, base.retry.id], "or");
        return place(w.createAndOrNode([inner.id, base.dbg.id, base.span.id], "and"), p);
      } },
    { name: "nestedContext", make: p => {
        const inner = w.createAndOrNode([w.createContextNode(base.reach.id, 400, 600).id, base.warn.id], "or");
        return place(w.createAndOrNode([inner.id, base.span.id], "or"), p);
      } },
    { name: "andInv", make: p => place(withInverted(w.createAndOrNode([base.move.id, base.span.id], "and")), p) },
    // links: result is pair entries
    { name: "link", link: true, make: p => place(w.createLinkNode(base.move.id, base.reach.id, "after", 1), p) },
    { name: "linkBefore2", link: true, make: p => place(w.createLinkNode(base.reach.id, base.move.id, "before", 2), p) },
    { name: "linkOrderAfter", link: true, make: p => place(w.createLinkNode(base.move.id, base.reach.id, "after", 1, { orderEnforced: true }), p) },
    // searching "before" a reference always lands before it, so enforcing the order drops every pair
    { name: "linkOrderBefore", link: true, empty: true, make: p => place(w.createLinkNode(base.move.id, base.reach.id, "before", 1, { orderEnforced: true }), p) },
    { name: "linkExclusive", link: true, make: p => place(w.createLinkNode(base.tick.id, base.queue.id, "after", 1, { exclusive: true }), p) },
    { name: "linkDt", link: true, make: p => place(w.createLinkNode(base.move.id, base.reach.id, "after", 1, { dt: { op: ">", ms: 60 } }), p) },
    { name: "linkKeyColumn", link: true, make: p => place(w.createLinkNode(base.move.id, base.reach.id, "after", 1, { key: { column: "thread" } }), p) },
    { name: "linkKeyPattern", link: true, make: p => place(w.createLinkNode(base.move.id, base.reach.id, "after", 1, { key: { pattern: "axis=[*:int]" } }), p) },
    { name: "linkChain", link: true, make: p => {
        const first = w.createLinkNode(base.move.id, base.reach.id, "after", 1);
        return place(w.createLinkNode(first.id, base.queue.id, "after", 1), p);
      } },
    { name: "linkInv", link: true, make: p => place(withInverted(w.createLinkNode(base.move.id, base.reach.id, "after", 1)), p) },
  ];
  const specByName = Object.fromEntries(specs.map(s => [s.name, s]));
  const plainSpecs = specs.filter(s => !s.link);

  /* ------------------------------------------------------------ a. */
  section("filter-evaluator-parity a. anchors: every plain type against a hand-rolled predicate");
  {
    const rawHas = (e, needle) => e.raw.toLowerCase().includes(needle);
    const under = (name, p = f.id) => w.getEntries(specByName[name].make(p).id);
    const anchors = [
      ["text", e => rawHas(e, "order")],
      ["textCS", e => e.raw.includes("Order")],
      ["textWord", e => /(^|[^\p{L}\p{N}_])order($|[^\p{L}\p{N}_])/iu.test(e.raw)],
      ["textCols", e => e.message.toLowerCase().includes("tick")],
      ["regex", e => /retry|abort/i.test(e.raw)],
      ["regexCS", e => /order/.test(e.raw)],
      ["regexCols", e => /axis-[12]$/i.test(e.thread)],
      ["wildcard", e => { const m = /Scheduler tick, (-?\d+) jobs pending/i.exec(e.message); return !!m && +m[1] >= 8; }],
      ["wildcardCols", e => { const m = /axis-(-?\d+)/i.exec(e.thread); return !!m && +m[1] >= 2; }],
      ["timerange", e => e.ts >= tsFrom && e.ts <= tsTo],
      ["timerangeFrom", e => e.ts >= tsLateFrom],
      ["timerangeTo", e => e.ts <= tsEarlyTo],
      ["after", e => e.ts >= tsAfter],
      ["before", e => e.ts <= tsBefore],
      ["idset", e => rank.get(e.id) % 5 === 0],
      ["level", e => e.level === "ERROR" || e.level === "WARN"],
      ["bookmarks", e => S.bookmarks.has(e.id)],
      ["notes", e => S.notes.has(e.id)],
      ["textInv", e => !rawHas(e, "heartbeat")],
      ["levelInv", e => e.level !== "INFO"],
      ["timerangeInv", e => !(e.ts >= tsFrom && e.ts <= tsTo)],
    ];
    const bad = [];
    for (const [name, pred] of anchors) {
      const got = under(name);
      const want = E.filter(pred);
      if (!sameList(got, want)) bad.push(name + " (" + got.length + " vs " + want.length + ")");
      if (want.length === 0 || want.length === E.length) bad.push(name + " is vacuous on this log (" + want.length + ")");
    }
    assert(bad.length === 0, "every plain filter type equals its hand-rolled predicate over the file" + (bad.length ? ": " + bad.join(", ") : ""));
    assert(under("levelEmpty").length === 0 && under("regexInvalid").length === 0,
      "an empty level list and an invalid regex match nothing");
    // The same anchors one level deeper: input is the pool's result, not the file
    const mixIds = new Set(ids(w.getEntries(poolMix.id)));
    const deepBad = [];
    for (const [name, pred] of anchors) {
      const got = under(name, poolMix.id);
      const want = E.filter(e => mixIds.has(e.id) && pred(e));
      if (!sameList(got, want)) deepBad.push(name + " (" + got.length + " vs " + want.length + ")");
    }
    assert(deepBad.length === 0, "every plain filter type tests only its input pool's entries (inverted ones invert against the pool)" + (deepBad.length ? ": " + deepBad.join(", ") : ""));
  }

  /* ------------------------------------------------------------ b. */
  section("filter-evaluator-parity b. baked evaluation of a node equals the node's own result, over six pools (two files)");
  for (const pool of pools) {
    const bad = [];
    let nonEmpty = 0;
    const poolEntries = w.getEntries(pool.node.id);
    for (const spec of specs) {
      const node = spec.make(pool.node.id);
      const viaNode = w.getEntries(node.id);
      const viaBaked = w.getEntriesFromBaked(w.bakeNodeCondition(node), poolEntries, pool.fileId);
      if (!sameList(viaNode, viaBaked)) bad.push(spec.name + " (node " + viaNode.length + ", baked " + viaBaked.length + ")");
      if (viaNode.length) nonEmpty++;
      if (pool.name === "file" && !spec.empty && viaNode.length === 0) bad.push(spec.name + " matched nothing on the file (vacuous)");
      if (pool.name === "file" && spec.empty && viaNode.length !== 0) bad.push(spec.name + " expected to match nothing");
      if (pool.name === "empty" && viaNode.length !== 0) bad.push(spec.name + " produced entries from an empty pool");
    }
    assert(bad.length === 0, "pool '" + pool.name + "': baked evaluation equals the node for all " + specs.length + " specs" + (bad.length ? ": " + bad.join(", ") : ""));
    if (pool.name !== "empty") assert(nonEmpty >= specs.length / 2, "pool '" + pool.name + "': most specs produce entries, so the comparison is not vacuous (" + nonEmpty + "/" + specs.length + ")");
  }

  /* ------------------------------------------------------------ c. */
  section("filter-evaluator-parity c. and/or over every pair of filter types equals the standalone nodes' intersection/union");
  {
    // sources under the file; oracle nodes (standalone, same conditions) under each pool
    const src = plainSpecs.map(s => s.make(f.id));
    const oracle = {};
    for (const pool of poolsForPairs) oracle[pool.name] = plainSpecs.map((s, i) => (pool.node === f ? src[i] : s.make(pool.node.id)));
    for (const pool of poolsForPairs) {
      const badAnd = [], badOr = [];
      let pairs = 0, nonTrivial = 0;
      for (let i = 0; i < plainSpecs.length; i++) for (let j = i + 1; j < plainSpecs.length; j++) {
        const ra = w.getEntries(oracle[pool.name][i].id), rb = w.getEntries(oracle[pool.name][j].id);
        const inB = new Set(ids(rb));
        const wantAnd = ra.filter(e => inB.has(e.id));
        const seen = new Set();
        const wantOr = [];
        for (const e of ra.concat(rb)) if (!seen.has(e.id)) { seen.add(e.id); wantOr.push(e); }
        // chronological, entries sharing a timestamp in log order
        wantOr.sort((a, b) => a.ts - b.ts || rank.get(a.id) - rank.get(b.id));
        const label = plainSpecs[i].name + " x " + plainSpecs[j].name;
        for (const [mode, want, bad] of [["and", wantAnd, badAnd], ["or", wantOr, badOr]]) {
          const node = place(w.createAndOrNode([src[i].id, src[j].id], mode), pool.node.id);
          const got = w.getEntries(node.id);
          if (!sameList(got, want)) bad.push(label + " (" + got.length + " vs " + want.length + ")");
        }
        pairs++;
        if (wantAnd.length > 0 && wantAnd.length < wantOr.length) nonTrivial++;
      }
      assert(badAnd.length === 0, "pool '" + pool.name + "': AND of " + pairs + " type pairs equals the intersection of the standalone nodes" + (badAnd.length ? ": " + badAnd.slice(0, 12).join(", ") : ""));
      assert(badOr.length === 0, "pool '" + pool.name + "': OR of " + pairs + " type pairs equals the chronological union of the standalone nodes" + (badOr.length ? ": " + badOr.slice(0, 12).join(", ") : ""));
      assert(nonTrivial > pairs / 4, "pool '" + pool.name + "': many pairs have an intersection that is neither empty nor the whole union (" + nonTrivial + "/" + pairs + ")");
    }

    // Combiners nested inside combiners: the expectation is built from PLAIN
    // standalone nodes only, never from another combiner, so a fault in how the
    // nested level is evaluated cannot cancel out against the oracle.
    const union = lists => {
      const seen = new Set(), out = [];
      for (const l of lists) for (const e of l) if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
      return out.sort((a, b) => a.ts - b.ts || rank.get(a.id) - rank.get(b.id));
    };
    const nestedBad = [];
    for (const pool of pools.slice(0, 2).concat(pools.slice(4))) {
      const poolEntries = w.getEntries(pool.node.id);
      const poolSet = new Set(ids(poolEntries));
      const entriesOf = make => w.getEntries(make(pool.node.id).id);
      const heart = entriesOf(p => mkText(p, "Heartbeat")), retry = entriesOf(p => mkText(p, "Retrying"));
      const dbg = entriesOf(p => w.createFilterNode(p, "level", ["DEBUG", "WARN"])), warn = entriesOf(p => w.createFilterNode(p, "level", ["WARN"]));
      const span = entriesOf(p => w.createFilterNode(p, "timerange", { from: ts0 + 3000, to: ts0 + 14000 }));
      const ctx = entriesOf(p => w.createContextNode(p, 400, 600));
      const inDbg = new Set(ids(dbg)), inSpan = new Set(ids(span));
      const wantNested = union([heart, retry]).filter(e => inDbg.has(e.id) && inSpan.has(e.id));
      const wantCtx = union([ctx, warn, span]);
      for (const [name, want] of [["nested", wantNested], ["nestedContext", wantCtx]]) {
        const node = specByName[name].make(pool.node.id);
        const got = w.getEntries(node.id);
        const viaBaked = w.getEntriesFromBaked(w.bakeNodeCondition(node), poolEntries, pool.fileId);
        if (!sameList(got, want)) nestedBad.push(pool.name + " " + name + " node (" + got.length + " vs " + want.length + ")");
        if (!sameList(viaBaked, want)) nestedBad.push(pool.name + " " + name + " baked (" + viaBaked.length + " vs " + want.length + ")");
        if (want.length === 0) nestedBad.push(pool.name + " " + name + " is vacuous");
        // a context side pulls in entries from outside the pool (the whole file around it)
        if (name === "nestedContext" && pool.name === "mix" && !want.some(e => !poolSet.has(e.id))) nestedBad.push("nestedContext never leaves the pool, its context side is not exercised");
      }
    }
    assert(nestedBad.length === 0, "an and/or nested in an and/or equals the set algebra over plain standalone nodes, through the node and the baked snapshot" + (nestedBad.length ? ": " + nestedBad.join(", ") : ""));
  }

  /* ------------------------------------------------------------ d. */
  section("filter-evaluator-parity d. a link over every pair of filter types equals computeLinkPairs over the standalone nodes");
  {
    const src = plainSpecs.map(s => s.make(f.id));
    const oracle = {};
    for (const pool of poolsForPairs) oracle[pool.name] = plainSpecs.map((s, i) => (pool.node === f ? src[i] : s.make(pool.node.id)));
    for (const pool of poolsForPairs) {
      const bad = [];
      let pairs = 0, withPairs = 0;
      for (let i = 0; i < plainSpecs.length; i++) for (let j = 0; j < plainSpecs.length; j++) {
        if (i === j) continue;
        const dir = (i + j) % 2 ? "before" : "after";
        const n = 1 + ((i * j) % 2);
        const node = place(w.createLinkNode(src[i].id, src[j].id, dir, n), pool.node.id);
        const got = w.getEntries(node.id);
        const want = w.computeLinkPairs(node, w.getEntries(oracle[pool.name][i].id), w.getEntries(oracle[pool.name][j].id), f.id);
        pairs++;
        if (want.length) withPairs++;
        if (!sameList(got, want)) bad.push(plainSpecs[i].name + " -> " + plainSpecs[j].name + " " + dir + " " + n + " (" + got.length + " vs " + want.length + ")");
      }
      assert(bad.length === 0, "pool '" + pool.name + "': " + pairs + " ordered type pairs as link sides equal the standalone nodes' pairing" + (bad.length ? ": " + bad.slice(0, 12).join(", ") : ""));
      assert(withPairs > pairs / 4, "pool '" + pool.name + "': many of those links produce pairs (" + withPairs + "/" + pairs + ")");
    }
    // link options: same sides, only the option differs; oracle = computeLinkPairs
    // over standalone move/reach nodes under the same pool (the option is read
    // from the link node itself)
    const optBad = [];
    const variants = [
      ["after n=1", "after", 1, null], ["before n=1", "before", 1, null], ["after n=2", "after", 2, null],
      ["orderEnforced after", "after", 1, { orderEnforced: true }], ["orderEnforced before", "before", 1, { orderEnforced: true }], ["exclusive", "after", 1, { exclusive: true }],
      ["dt >", "after", 1, { dt: { op: ">", ms: 60 } }], ["dt <", "after", 1, { dt: { op: "<", ms: 60 } }],
      ["key column", "after", 1, { key: { column: "thread" } }], ["key pattern", "after", 1, { key: { pattern: "axis=[*:int]" } }],
    ];
    for (const pool of poolsForPairs) {
      const m = pool.node === f ? base.move : mkText(pool.node.id, "Move requested");
      const r = pool.node === f ? base.reach : mkText(pool.node.id, "Position reached");
      const refs = w.getEntries(m.id), tgts = w.getEntries(r.id);
      for (const [label, dir, n, opts] of variants) {
        const node = place(w.createLinkNode(base.move.id, base.reach.id, dir, n, opts), pool.node.id);
        const got = w.getEntries(node.id);
        const want = w.computeLinkPairs(node, refs, tgts, f.id);
        if (!sameList(got, want)) optBad.push(pool.name + " " + label + " (" + got.length + " vs " + want.length + ")");
        if (pool.name === "file" && label !== "dt <" && label !== "orderEnforced before" && want.length === 0) optBad.push(label + " paired nothing (vacuous)");
      }
    }
    assert(optBad.length === 0, "every link option gives the same pairs through the node as through computeLinkPairs" + (optBad.length ? ": " + optBad.join(", ") : ""));
    // a link whose reference side is itself a link (multi-hop): baked nested
    const chain = specByName.linkChain.make(f.id);
    const chainBaked = w.getEntriesFromBaked(w.bakeNodeCondition(chain), w.getEntries(f.id), f.id);
    assert(w.getEntries(chain.id).length > 0 && sameList(w.getEntries(chain.id), chainBaked), "a chained (multi-hop) link gives the same tuples through the node and its baked snapshot");
  }

  /* ------------------------------------------------------------ e. */
  section("filter-evaluator-parity e. node-only side data (_gapMs, _contextRanges, _anchorIds)");
  {
    const level = w.createFilterNode(f.id, "level", ["INFO", "WARN"]);
    const parent = w.getEntries(level.id);
    const parentIdx = parent.map(e => rank.get(e.id));

    // gap, measured between consecutive PARENT entries
    const bruteGaps = (list, ms, key) => {
      const m = new Map(), last = new Map();
      let prev;
      for (const e of list) {
        const k = key ? e[key] : "";
        const p = key ? last.get(k) : prev;
        last.set(k, e.ts); prev = e.ts;
        if (p !== undefined && e.ts - p >= ms) m.set(e.id, e.ts - p);
      }
      return m;
    };
    const sameMap = (a, b) => isMap(a) && a.size === b.size && [...b].every(([k, v]) => a.get(k) === v);
    for (const [label, val, key] of [["whole stream", { ms: 150, per: null }, null], ["per thread", { ms: 600, per: "thread" }, "thread"]]) {
      const gap = w.createGapNode(level.id, val);
      const got = w.getEntries(gap.id);
      const want = bruteGaps(parent, val.ms, key);
      assert(want.size > 0 && sameList(got, parent.filter(e => want.has(e.id))), "gap (" + label + "): result is the parent entries preceded by a long enough gap");
      assert(sameMap(gap._gapMs, want), "gap (" + label + "): _gapMs maps each kept entry to its measured gap");
      const baked = w.bakeNodeCondition(gap);
      const before = JSON.stringify(baked), keys = Object.keys(baked).join();
      const viaBaked = w.getEntriesFromBaked(baked, parent, f.id);
      assert(sameList(viaBaked, got) && JSON.stringify(baked) === before && Object.keys(baked).join() === keys && sameMap(gap._gapMs, want),
        "gap (" + label + "): evaluating the baked snapshot writes nothing onto the snapshot and leaves the node's _gapMs alone");
    }
    const gapEmpty = w.createGapNode(poolNone.id, { ms: 150, per: null });
    assert(w.getEntries(gapEmpty.id).length === 0 && isMap(gapEmpty._gapMs) && gapEmpty._gapMs.size === 0, "gap over an empty pool: no entries, an empty _gapMs");

    // time context: windows around the parent entries, merged when they touch
    const bruteTimeCtx = (anchors, before, after) => {
      const wins = anchors.map(e => ({ start: e.ts - before, end: e.ts + after })).sort((a, b) => a.start - b.start);
      const merged = [];
      for (const win of wins) {
        const last = merged[merged.length - 1];
        if (last && win.start <= last.end) last.end = Math.max(last.end, win.end); else merged.push({ ...win });
      }
      return { merged, kept: E.filter(e => anchors.some(a => e.ts >= a.ts - before && e.ts <= a.ts + after)) };
    };
    for (const [before, after] of [[400, 600], [900, 0], [0, 500]]) {
      const ctx = w.createContextNode(level.id, before, after);
      const got = w.getEntries(ctx.id);
      const want = bruteTimeCtx(parent, before, after);
      assert(sameList(got, want.kept) && got.length > parent.length, "context -" + before + "/+" + after + ": the whole file's entries inside any window around a parent entry");
      assert(JSON.stringify(ctx._contextRanges) === JSON.stringify(want.merged), "context -" + before + "/+" + after + ": _contextRanges are the merged windows");
      assert(isSet(ctx._anchorIds) && ctx._anchorIds.size === parent.length && parent.every(e => ctx._anchorIds.has(e.id)),
        "context -" + before + "/+" + after + ": _anchorIds are exactly the parent's entry ids");
    }

    // count context: index windows in the FILE's order, merged when adjacent
    const bruteCountCtx = (anchorIdx, before, after) => {
      const keep = new Set();
      for (const k of anchorIdx) for (let i = Math.max(0, k - before); i <= Math.min(E.length - 1, k + after); i++) keep.add(i);
      const runs = [];
      for (let i = 0; i < E.length; i++) {
        if (!keep.has(i)) continue;
        const last = runs[runs.length - 1];
        if (last && last.end === i - 1) last.end = i; else runs.push({ start: i, end: i });
      }
      return { kept: E.filter((e, i) => keep.has(i)), ranges: runs.map(r => ({ start: E[r.start].ts, end: E[r.end].ts })) };
    };
    for (const [before, after] of [[2, 1], [0, 3], [5, 0]]) {
      const cc = w.createCountContextNode(level.id, before, after);
      const got = w.getEntries(cc.id);
      const want = bruteCountCtx(parentIdx, before, after);
      assert(sameList(got, want.kept) && got.length > parent.length, "countContext -" + before + "/+" + after + ": the whole file's entries within N positions of a parent entry");
      assert(JSON.stringify(cc._contextRanges) === JSON.stringify(want.ranges), "countContext -" + before + "/+" + after + ": _contextRanges are the merged index windows expressed as timestamps");
      assert(isSet(cc._anchorIds) && cc._anchorIds.size === parent.length && parent.every(e => cc._anchorIds.has(e.id)),
        "countContext -" + before + "/+" + after + ": _anchorIds are exactly the parent's entry ids");
    }
    // empty pool: both context kinds leave empty side data (not stale or missing)
    for (const mk of [() => w.createContextNode(poolNone.id, 400, 600), () => w.createCountContextNode(poolNone.id, 2, 1)]) {
      const n = mk();
      assert(w.getEntries(n.id).length === 0 && Array.isArray(n._contextRanges) && n._contextRanges.length === 0 && isSet(n._anchorIds) && n._anchorIds.size === 0,
        n.filterType + " over an empty pool: no entries, empty _contextRanges and _anchorIds");
    }

    // The baked path never writes node-only side data: a combiner holding gap
    // and context sides computes the same entries without any of it, and its
    // baked snapshots are unchanged afterwards. A context node's own data
    // survives a baked evaluation of its snapshot untouched.
    const gapSrc = w.createGapNode(f.id, { ms: 150, per: null });
    const ctxSrc = w.createContextNode(base.reach.id, 400, 600);
    const ccSrc = w.createCountContextNode(base.move.id, 2, 1);
    const comb = w.createAndOrNode([gapSrc.id, ctxSrc.id], "or");
    const comb2 = w.createAndOrNode([ccSrc.id, base.warn.id], "or");
    const bakedBefore = JSON.stringify([comb.baked, comb2.baked]);
    const r1 = w.getEntries(comb.id), r2 = w.getEntries(comb2.id);
    const sideKeys = n => ["_gapMs", "_contextRanges", "_anchorIds"].filter(k => k in n && n[k] != null);
    assert(r1.length > 0 && r2.length > 0, "the combiners with gap / context sides produce entries");
    assert(sideKeys(comb).length === 0 && sideKeys(comb2).length === 0 && JSON.stringify([comb.baked, comb2.baked]) === bakedBefore,
      "an and/or node with gap / context / countContext sides gets no _gapMs/_contextRanges/_anchorIds and its snapshots stay as baked");
    const anchorsRef = ctxSrc._anchorIds, rangesRef = ctxSrc._contextRanges;
    w.getEntriesFromBaked(w.bakeNodeCondition(ctxSrc), w.getEntries(ctxSrc.parentId), f.id);
    assert(ctxSrc._anchorIds === anchorsRef && ctxSrc._contextRanges === rangesRef, "evaluating a context node's baked snapshot leaves the node's _anchorIds/_contextRanges objects alone");
  }

  /* ------------------------------------------------------------ f. */
  section("filter-evaluator-parity f. parentOverride: the tail extension's slice evaluation");
  {
    const slice = E.slice(90, 170);
    const bad = [];
    for (const spec of plainSpecs.filter(s => ["text", "textCS", "textWord", "textCols", "regex", "regexCols", "wildcard", "wildcardCols", "timerange", "timerangeFrom", "after", "before",
      "idset", "level", "bookmarks", "notes", "textInv", "regexInv", "wildcardInv", "timerangeInv", "afterInv", "idsetInv", "levelInv", "bookmarksInv", "levelEmpty", "regexInvalid"].includes(s.name))) {
      const fresh = spec.make(f.id);
      const viaOverride = w.getEntriesUncached(fresh, slice);
      const cachedAfterOverride = fresh._cache;
      const viaBaked = w.getEntriesFromBaked(w.bakeNodeCondition(fresh), slice, f.id);
      const full = w.getEntries(fresh.id);
      const cached = fresh._cache;
      const again = w.getEntriesUncached(fresh, slice);
      // slice results equal the full result restricted to the slice, in order
      const inSlice = new Set(ids(slice));
      // (an inverted node inverts against its input, here the slice, and the
      // full result over the file restricted to the slice is the same set)
      const want = full.filter(e => inSlice.has(e.id));
      if (!sameList(viaOverride, want)) bad.push(spec.name + " override (" + viaOverride.length + " vs " + want.length + ")");
      if (!sameList(viaOverride, viaBaked)) bad.push(spec.name + " override vs baked");
      if (cachedAfterOverride) bad.push(spec.name + " wrote _cache during an override evaluation");
      if (fresh._cache !== cached || again === cached) bad.push(spec.name + " an override evaluation replaced or returned the cached array");
    }
    assert(bad.length === 0, "an override evaluation equals the full result restricted to the slice, equals the baked evaluation, and never touches _cache" + (bad.length ? ": " + bad.join(", ") : ""));
  }

  /* ------------------------------------------------------------ g. */
  section("filter-evaluator-parity g. inversion: applied to plain types, withheld for link/context/countContext");
  {
    const bad = [];
    const poolEntries = w.getEntries(poolMix.id);
    const poolSet = new Set(ids(poolEntries));
    for (const spec of plainSpecs.filter(s => /^(text|regex|wildcard|timerange|after|idset|level|bookmarks|gap)$/.test(s.name))) {
      const plain = spec.make(poolMix.id);
      const inv = withInverted(spec.make(poolMix.id));
      const kept = new Set(ids(w.getEntries(plain.id)));
      const got = w.getEntries(inv.id);
      const wantNode = poolEntries.filter(e => !kept.has(e.id));
      const viaBaked = w.getEntriesFromBaked(w.bakeNodeCondition(inv), poolEntries, f.id);
      if (!sameList(got, wantNode)) bad.push(spec.name + " node (" + got.length + " vs " + wantNode.length + ")");
      if (!sameList(viaBaked, wantNode)) bad.push(spec.name + " baked (" + viaBaked.length + " vs " + wantNode.length + ")");
      if (got.some(e => !poolSet.has(e.id))) bad.push(spec.name + " inverted result leaves the pool");
    }
    assert(bad.length === 0, "an inverted node is its input pool minus the plain result, through the node and the baked snapshot" + (bad.length ? ": " + bad.join(", ") : ""));

    const wbad = [];
    for (const name of ["context", "countContext", "link", "linkChain"]) {
      const plain = specByName[name].make(poolMix.id);
      const inv = withInverted(specByName[name].make(poolMix.id));
      const a = w.getEntries(plain.id), b = w.getEntries(inv.id);
      const viaBaked = w.getEntriesFromBaked(w.bakeNodeCondition(inv), poolEntries, f.id);
      if (a.length === 0) wbad.push(name + " is vacuous over the pool");
      if (!sameList(a, b)) wbad.push(name + " node: inverted differs from plain (" + b.length + " vs " + a.length + ")");
      if (!sameList(a, viaBaked)) wbad.push(name + " baked: inverted differs from plain (" + viaBaked.length + " vs " + a.length + ")");
    }
    assert(wbad.length === 0, "inverted context/countContext/link nodes return the plain result, in the node and in the baked snapshot" + (wbad.length ? ": " + wbad.join(", ") : ""));

    // and/or: the combiner's own inversion is the pool minus its result; an
    // inverted SIDE inverts against the pool the combiner receives
    const sideInv = place(w.createAndOrNode([specByName.textInv.make(f.id).id, base.warn.id], "or"), poolMix.id);
    const wantSide = poolEntries.filter(e => !/heartbeat/i.test(e.raw) || e.level === "WARN");
    assert(sameList(w.getEntries(sideInv.id), wantSide), "an or node with an inverted text side: pool entries without 'heartbeat', plus the WARN ones");
  }

  assert(unplaced === 0, "every combiner/link was placed under its pool (moveNode accepted all of them)");
});
