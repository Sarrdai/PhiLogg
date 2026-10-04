// GROUP 22 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 22 — Link filter chaining fix + multi-way (N-tuple) link UI
   (this session, 2026-08-12). Source: REQUIREMENTS-link-chaining-and-
   multiway.md + its companion tests/link-chaining.spec.js (both supplied
   by the person). That spec's BASELINE/TARGET assertions are folded in
   here verbatim (as real pass/fail, not the original "informational,
   pre-implementation" framing — see this file's own README.md "Extending
   this suite": one consolidated suite, not a parallel standalone spec
   file) plus new coverage for the two opt-in options and the multi-hop
   dialog UI that spec deliberately left unpinned. See PROJECT.md "Link
   filter" for the chosen design (direction A: fix the nesting, keep
   pair-of-pairs) and the semantics chosen for order-enforcement/
   exclusivity where the requirements doc left them open.

   makeLogAt(entries): like makeLog, but each entry's second is given
   explicitly so scenarios needing precisely interleaved candidates (a
   "decoy" match at one timestamp, the "correct" one at another) can be
   laid out exactly, the same helper shape link-chaining.spec.js used.
   ============================================================ */
group(22);
{
  function makeLogAt(entries) {
    const lines = entries.map((e, i) =>
      `2024-01-15 10:00:${String(e.sec).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"${e.msg}"`);
    return lines.join("\n") + "\n";
  }

  // --- BASELINE: simple (non-chained) link anchor semantics, both directions ---
  // Locks in the reference/anchor semantics confirmed correct during spec
  // review — must stay green after the chaining fix, it's a regression
  // guard, not a target.
  await withApp(async (w, d, T) => {
    section("22. Link chaining fix + multi-way tuples");
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" },
      { sec: 10, msg: "First B" }, { sec: 15, msg: "Second B" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");

    const linkAF = w.createLinkNode(first.id, second.id, "after", 1);
    const resAF = w.getEntries(linkAF.id).map(p => p.message);
    assert(JSON.stringify(resAF) === JSON.stringify(["First A ⟶ Second A", "First B ⟶ Second B"]),
      "BASELINE: anchor=First, after 1, target=Second -> pairs each First with the next Second");

    const linkSB = w.createLinkNode(second.id, first.id, "before", 1);
    const resSB = w.getEntries(linkSB.id).map(p => p.message);
    assert(JSON.stringify(resSB) === JSON.stringify(["First A ⟶ Second A", "First B ⟶ Second B"]),
      "BASELINE: anchor=Second, before 1, target=First -> pairs each Second with the preceding First");
  });

  // --- BASELINE: matches are not exclusive by default ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 1, msg: "First B" }, { sec: 5, msg: "Second A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const link = w.createLinkNode(first.id, second.id, "after", 1);
    const res = w.getEntries(link.id);
    assert(res.length === 2 && res[0].second.id === res[1].second.id,
      "BASELINE: both First A and First B pair with the same Second A when exclusivity is off (default)");
  });

  // --- TARGET (Bug 1): chained link anchors on the previous hop's match ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" },
      { sec: 3, msg: "Marker Alpha" },   // decoy: nearest Marker after First's own ts
      { sec: 5, msg: "Second A" },
      { sec: 6, msg: "Marker Beta" },    // correct: nearest Marker after Second's ts
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Marker");

    const link1 = w.createLinkNode(first.id, second.id, "after", 1);   // First -> Second
    const link2 = w.createLinkNode(link1.id, third.id, "after", 1);    // (First->Second) -> Marker
    const res2 = w.getEntries(link2.id);

    assert(res2.length === 1, "Bug1 fix: one chained tuple produced");
    assert(res2[0] && res2[0].second.message === "Marker Beta",
      "Bug1 fix: chained hop anchors on Second's match (Marker Beta), not First's original ts (would be Alpha)");
  });

  // --- TARGET (Bug 2): highlight map covers every real entry across a chained link ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }, { sec: 8, msg: "Third A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    const link1 = w.createLinkNode(first.id, second.id, "after", 1);
    const link2 = w.createLinkNode(link1.id, third.id, "after", 1);
    link2.highlightColor = "#ff0000";

    const map = w.computeHighlightMap(f.id);
    const firstA = f.entries.find(e => e.message === "First A");
    const secondA = f.entries.find(e => e.message === "Second A");
    const thirdA = f.entries.find(e => e.message === "Third A");
    assert(map.has(firstA.id), "Bug2 fix: First A is highlighted through the nested pair");
    assert(map.has(secondA.id), "Bug2 fix: Second A is highlighted through the nested pair");
    assert(map.has(thirdA.id), "Bug2 fix: Third A is highlighted (outer real side, already worked before)");
  });

  // --- TARGET (Bug 3): every real entry in a chained tuple is individually
  // reachable via entryIndex (getTupleEntries contract) ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }, { sec: 8, msg: "Third A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    const link1 = w.createLinkNode(first.id, second.id, "after", 1);
    const link2 = w.createLinkNode(link1.id, third.id, "after", 1);
    const tuple = w.getEntries(link2.id)[0];

    assert(typeof w.getTupleEntries === "function", "Bug3 fix: getTupleEntries(entryLike) is implemented");
    const real = w.getTupleEntries(tuple);
    const ids = real.map(e => e.id);
    assert(ids.length === 3, "Bug3 fix: chained tuple flattens to 3 real entries");
    assert(ids.every(id => !!T.entryIndex[id]), "Bug3 fix: every flattened id resolves through entryIndex");

    // And at the UI layer: the Link view now renders one row per real
    // entry (2 deltas for a 3-way tuple), each wired to revealInHighlightView
    // with a REAL entry id, not a synthetic intermediate pair id.
    T.state.activeId = link2.id;
    w.render();
    const rows = d.querySelectorAll("#linkBody .pair-row");
    const deltas = d.querySelectorAll("#linkBody .pair-delta");
    assert(rows.length === 3, "Bug3 fix (UI): Link view renders 3 rows for the 3-way tuple, got " + rows.length);
    assert(deltas.length === 2, "Bug3 fix (UI): 2 delta labels between 3 rows, got " + deltas.length);
  });

  // --- Opt-in: exclusive matches (scoped globally per link node, default off) ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 1, msg: "First B" }, { sec: 5, msg: "Second A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const link = w.createLinkNode(first.id, second.id, "after", 1, { exclusive: true });
    const res = w.getEntries(link.id);
    assert(res.length === 1 && res[0].first.message === "First A",
      "exclusive matches: only the first (earlier) reference claims Second A, the later one gets no match");
  });

  // --- Opt-in: enforce chronological order (drops a hop whose match lands
  // before the anchor it was searched from — see PROJECT.md for why this
  // definition was chosen). Uses the requirements doc's REPRO scenario,
  // where an unconstrained chain matches an entry chronologically before
  // the very first reference entry. ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "Third FAR BEFORE" },
      { sec: 20, msg: "First A" },
      { sec: 25, msg: "Second A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    const link1 = w.createLinkNode(first.id, second.id, "after", 1);   // First(20) -> Second(25)
    const linkUnconstrained = w.createLinkNode(link1.id, third.id, "before", 1);
    assert(w.getEntries(linkUnconstrained.id).length === 1,
      "order NOT enforced (default): non-monotonic tuple (Third before First) is still produced");

    const linkEnforced = w.createLinkNode(link1.id, third.id, "before", 1, { orderEnforced: true });
    assert(w.getEntries(linkEnforced.id).length === 0,
      "order enforced (opt-in): the same non-monotonic tuple is dropped instead");
  });

  // --- Multi-hop dialog: reference + 2 target hops combined into one
  // tuple through the UI (bulk-select 3 filters -> Link…) ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([
      { sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }, { sec: 8, msg: "Third A" },
    ]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const third = w.createFilterNode(f.id, "text", "Third");
    w.render();

    T.state.multiSelect = new Set([first.id, second.id, third.id]);
    const { actions } = w.describeBulkActions([first, second, third]);
    assert(actions.some(a => a.action === "link" && a.label === "Link…"),
      "multi-hop dialog: 3-filter selection offers a plain Link… bulk action (no N-way suffix)");

    w.openLinkDialog([first.id, second.id, third.id]);
    assert(!d.querySelector("#linkDialog").classList.contains("hidden"), "multi-hop dialog: opens for 3 filters");
    const hopRows = d.querySelectorAll("#linkSides .link-hop-row");
    assert(hopRows.length === 2, "multi-hop dialog: 2 hop rows for start + 2 remaining filters");
    assert([...hopRows].every(r => r.querySelector('.link-hop-dir button[data-dir="after"]').getAttribute("aria-pressed") === "true"), "the direction defaults to next (after)");
    fireClick(d.querySelector("#linkDialogCreate"), w);
    assert(d.querySelector("#linkDialog").classList.contains("hidden"), "multi-hop dialog: closes after Create");

    // One node holds the whole chain (no intermediate hop nodes): its bakedA
    // is a NESTED baked link condition (First -> Second), a flat data
    // snapshot, not a reference to another node's id (see bakeNodeCondition's
    // "link" branch).
    const linkNodes = Object.values(T.state.nodes).filter(n => n.filterType === "link");
    assert(linkNodes.length === 1, "multi-hop dialog: ONE link node holds the whole chain");
    const hop2 = linkNodes[0];
    assert(hop2.bakedA && hop2.bakedA.filterType === "link" && hop2.bakedA.bakedA && hop2.bakedA.bakedA.value === "First" && hop2.bakedA.bakedB.value === "Second" && hop2.bakedB.value === "Third",
      "multi-hop dialog: bakedA is the nested First -> Second link, bakedB is Third");
    assert(hop2.parentId === f.id, "the node is placed directly under FILE");
    const tupleRes = w.getEntries(hop2.id);
    assert(tupleRes.length === 1 && tupleRes[0].second.message === "Third A",
      "multi-hop dialog: resulting 3-way tuple resolves First -> Second -> Third correctly");
  });

  // --- Persistence: linkOrderEnforced/linkExclusive survive save/load,
  // copy/paste (cloneSubtree) and undo/redo (snapshot/restoreSubtree) the
  // same way linkDirection/linkN already did. ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([{ sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }]);
    const f = await w.addFile("a.log", log, () => {});
    const first = w.createFilterNode(f.id, "text", "First");
    const second = w.createFilterNode(f.id, "text", "Second");
    const link = w.createLinkNode(first.id, second.id, "after", 1, { orderEnforced: true, exclusive: true });

    const branch = w.serializeFilterBranch(link.id);
    function findLink(node) {
      if (node.filterType === "link") return node;
      for (const c of node.children || []) { const r = findLink(c); if (r) return r; }
      return null;
    }
    const serLink = branch.roots.map(findLink).find(Boolean);
    assert(!!serLink && serLink.linkOrderEnforced === true && serLink.linkExclusive === true,
      "save/load: serializeFilterBranch carries both new flags");

    const clone = w.cloneSubtree(link.id, first.id);
    assert(clone.linkOrderEnforced === true && clone.linkExclusive === true,
      "copy/paste: cloneSubtree carries both new flags");

    const snap = w.snapshotSubtree(link.id);
    delete T.state.nodes[link.id];
    const restored = w.restoreSubtree(snap);
    assert(restored.linkOrderEnforced === true && restored.linkExclusive === true,
      "undo/redo: snapshotSubtree/restoreSubtree carry both new flags");
  });

  // --- A serialized link node with no linkOrderEnforced/linkExclusive
  // fields at all (e.g. hand-edited) still materializes cleanly, both
  // fields defaulting false. bakedA/bakedB travel as plain data — no
  // ref/remapping step needed any more. ---
  await withApp(async (w, d, T) => {
    const log = makeLogAt([{ sec: 0, msg: "First A" }, { sec: 5, msg: "Second A" }]);
    const f = await w.addFile("a.log", log, () => {});
    const roots = [
      {
        ref: 3, filterType: "link", name: "First -> Second", inverted: false,
        bakedA: { filterType: "text", value: "First", inverted: false },
        bakedB: { filterType: "text", value: "Second", inverted: false },
        linkDirection: "after", linkN: 1, children: [],
      },
    ];
    w.materializeCachedFilters(f, roots);
    const linkNode = Object.values(T.state.nodes).find(n => n.filterType === "link");
    assert(!!linkNode && linkNode.linkOrderEnforced === false && linkNode.linkExclusive === false,
      "a link node with no order/exclusive fields materializes with both defaulting to false");
    assert(linkNode.bakedA.value === "First" && linkNode.bakedB.value === "Second", "bakedA/bakedB materialize as plain data, no ref-remapping step needed");
    assert(w.getEntries(linkNode.id).length === 1, "the materialized link node evaluates correctly via its baked conditions");
  });
}
