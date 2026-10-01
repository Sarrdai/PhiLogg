// GROUP 270 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 270 — Context view: built only while visible, match/gap part
   memoized
   Origin: 2026-09-24, load/filter performance session. renderMainView used
   to rebuild the Context view on every render, even with only the
   Filtered tab on screen — a match set, order lookups, a sort and a gap
   list over the whole file (~300ms for a 162k-match level filter on 650k
   entries). Now a hidden Context view is marked stale and built when it is
   revealed (its tab, Stacked, a jump into it), and the match/gap part
   (contextMatchesAndGaps) is memoized per active node + result + root
   entries, so only the expansion-dependent rows/strips/runs are rebuilt.
   ============================================================ */
group(270);
{
  const tab = (d, name) => d.querySelector('#fhTabs .view-tab[data-fh-tab="' + name + '"]');
  // The Context view as a from-scratch reference: rows (entry ids + strips)
  // for the current active node, computed with a cold memo.
  function contextShape(T) {
    return JSON.stringify({ rows: T.currentHighlightViewEntries.map(e => e.id), strips: [...T.contextStrips].map(([k, v]) => [k, v.map(x => x.kind + x.from + "-" + x.to)]),
      matchRows: T.contextMatchRows, pos: [...T.contextMatchPos], gaps: T.contextGaps, ids: [...T.contextMatchIds].sort() });
  }

  await withApp(async (w, d, T) => {
    section("270a. With the Filtered tab on screen, a render doesn't build the Context view; revealing it builds it for the current node");
    const f = await w.addFile("a.log", makeLog(0, 200), () => {});
    T.state.activeId = f.id;
    w.render();
    let builds = 0;
    const origBuild = w.buildContextView;
    w.buildContextView = function () { builds++; return origBuild.apply(this, arguments); };
    const err = w.createFilterNode(f.id, "level", ["ERROR"]);
    w.revealFilteredView();
    w.render();
    assert(T.fhActiveTab === "filter", "sanity: the Filtered tab is showing");
    assert(builds === 0, "no Context build while it is hidden (" + builds + ")");
    assert(T.contextViewStale === true, "the hidden Context view is marked stale");
    fireClick(tab(d, "highlight"), w);
    assert(builds === 1, "revealing the Context tab builds it once (" + builds + ")");
    assert(T.contextViewStale === false, "...and it is no longer stale");
    assert(T.contextMatchRows.length === 40 && T.contextActive, "it shows the ERROR filter's 40 matches");
    assert(d.querySelector("#highlightRows .log-row"), "...with rows rendered");
    const counter = d.querySelector("#contextToolbar");
    assert(counter && /40/.test(counter.textContent), "the toolbar's match counter reflects them, got " + (counter && counter.textContent.trim().slice(0, 80)));
    w.buildContextView = origBuild;
    // Stacked: both views on screen, so every render builds it.
    w.applyFhView("stacked");
    builds = 0;
    w.buildContextView = function () { builds++; return origBuild.apply(this, arguments); };
    w.render();
    assert(builds === 1 && T.contextViewStale === false, "Stacked: a render builds the Context view (" + builds + ")");
    w.buildContextView = origBuild;
  });

  await withApp(async (w, d, T) => {
    section("270b. The match/gap part is memoized: a re-render or a gap expansion reuses it, a changed result or root rebuilds it");
    const f = await w.addFile("a.log", makeLog(0, 300), () => {});
    const err = w.createFilterNode(f.id, "level", ["ERROR"]);
    T.state.activeId = err.id;
    w.applyFhView("highlight");
    w.render();
    const ids1 = T.contextMatchIds;
    let orderMaps = 0;
    const origMap = w.buildOrderIndexMap;
    w.buildOrderIndexMap = function () { orderMaps++; return origMap.apply(this, arguments); };
    w.render();
    assert(T.contextMatchIds === ids1, "re-render: the same match set object (memo hit)");
    const before = contextShape(T);
    // Open one gap the way the gap row's click does: only the expansion part changes.
    const g = T.contextGaps[3];
    T.contextExpansions.set(g.start, [{ from: g.start, to: g.end }]);
    w.render();
    assert(T.contextMatchIds === ids1, "a gap expansion reuses the match set too");
    assert(T.currentHighlightViewEntries.length === 60 + (g.end - g.start), "...while its rows are rebuilt with the gap revealed (" + T.currentHighlightViewEntries.length + ")");
    assert(orderMaps === 0, "no id -> index map needed for a filter whose result is a subsequence of the file (" + orderMaps + ")");
    T.contextExpansions.delete(g.start);
    w.render();
    assert(contextShape(T) === before, "closing it again restores the exact previous view");
    // A tail append changes the root and the result: rebuilt.
    f.tail = { pending: "" };
    w.appendTailText(f, makeLog(400, 10));
    delete f.tail;
    w.invalidateCachesForRoots([f.id]);
    w.render();
    assert(T.contextMatchIds !== ids1 && T.contextMatchRows.length === 62, "after an append the matches are recomputed (" + T.contextMatchRows.length + ")");
    // Cold reference for the same state.
    const warm = contextShape(T);
    w.invalidateAllCaches(); // new getEntries() results: the memo misses, built from scratch
    w.render();
    assert(contextShape(T) === warm, "memoized view identical to one built from scratch");
    w.buildOrderIndexMap = origMap;
  });

  await withApp(async (w, d, T) => {
    section("270c. OR and link nodes: gaps and ordinals match a hand-computed reference; a link node's pairs take the id -> index route");
    const lines = makeLog(0, 120).trimEnd().split("\n");
    const f = await w.addFile("a.log", lines.join("\n") + "\n", () => {});
    const a = w.createFilterNode(f.id, "text", "message 1");
    const b = w.createFilterNode(f.id, "level", ["ERROR"]);
    const or = w.createAndOrNode([a.id, b.id], "or");
    T.state.activeId = or.id;
    w.applyFhView("highlight");
    w.render();
    const expectIdx = f.entries.map((e, i) => (/message 1/.test(e.raw) || e.level === "ERROR") ? i : -1).filter(i => i >= 0);
    const gaps = [];
    let prev = -1;
    for (const i of expectIdx) { if (i > prev + 1) gaps.push({ start: prev + 1, end: i }); prev = i; }
    if (prev + 1 < f.entries.length) gaps.push({ start: prev + 1, end: f.entries.length });
    assert(JSON.stringify(T.contextGaps) === JSON.stringify(gaps), "OR node: gaps match the reference");
    assert(expectIdx.every((i, k) => T.contextMatchPos.get(f.entries[i].id) === k + 1), "OR node: every match's ordinal is its position among the matches");
    const link = w.createLinkNode ? w.createLinkNode(b.id, a.id, "after", 1) : null;
    if (link) {
      T.state.activeId = link.id;
      w.applyFhView("highlight");
      let orderMaps = 0;
      const origMap = w.buildOrderIndexMap;
      w.buildOrderIndexMap = function () { orderMaps++; return origMap.apply(this, arguments); };
      w.render();
      w.buildOrderIndexMap = origMap;
      assert(orderMaps > 0, "link node: its (possibly out-of-order) underlying entries go through the id -> index map");
      const under = new Set();
      w.getEntries(link.id).forEach(p => w.getTupleEntries(p).forEach(e => under.add(e.id)));
      assert(T.contextMatchIds.size === under.size && [...under].every(id => T.contextMatchIds.has(id)), "link node: the underlying entries are the matches");
      const rowsOrder = T.contextMatchRows.map(r => T.currentHighlightViewEntries[r].id);
      const idxs = rowsOrder.map(id => f.entries.findIndex(e => e.id === id));
      assert(idxs.every((v, i) => i === 0 || v > idxs[i - 1]), "link node: matches shown in file order");
    }
  });

  await withApp(async (w, d, T) => {
    section("270d. A jump into the Context view from the Filtered tab (double-click) builds it and expands around the entry");
    const f = await w.addFile("a.log", makeLog(0, 300), () => {});
    const err = w.createFilterNode(f.id, "level", ["ERROR"]);
    T.state.activeId = err.id;
    w.revealFilteredView();
    w.render();
    assert(T.contextViewStale === true, "sanity: Context hidden and stale");
    const target = f.entries[150];
    w.revealInHighlightView(target);
    assert(T.fhActiveTab === "highlight" && T.contextViewStale === false, "the jump shows a freshly built Context view");
    assert(T.currentHighlightViewEntries.some(e => e.id === target.id), "the jumped-to entry is in it");
    assert(T.state.selectedId === target.id, "and selected");
  });
}
