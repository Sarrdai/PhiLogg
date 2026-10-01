// GROUP 19 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 19 — Today's code-review session (navigation/view-update
   correctness + large-file responsiveness)
   Origin: this session (see changelog.d, top entry). Eight fixes:
   revealFilteredView() on every filter-creation path, bookmark toggle
   repainting both views, minimap background-bucket memoization, scoped
   tail-cache invalidation, per-node level-count cache, computeHighlightMap
   running once per renderMainView, and the arrow-key index-hint.
   ============================================================ */
group(19);
await withApp(async (w, d, T) => {
  section("19. Review-session fixes: reveal-on-create, bookmark repaint, caches");
  const fa = await w.addFile("a.log", makeLog(0, 60, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const fb = await w.addFile("b.log", makeLog(120, 40, { msgPrefix: "other" }), () => {});
  w.render();

  // Full -> Filtered reveal on every creation path (tabs layout only; Stacked untouched)
  T.state.activeId = fa.id; w.render();
  w.applyFhView("highlight");
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message 1";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(T.fhActiveTab === "filter", "creating a filter via the popup jumps Full -> Filtered");

  w.applyFhView("stacked");
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message 2";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(T.fhLayout === "stacked", "creating a filter in Stacked layout leaves it untouched (both panels already visible)");

  w.applyFhView("highlight");
  const someEntry = fa.entries[10];
  w.openContextMenu({ clientX: 10, clientY: 10 }, someEntry);
  fireClick(d.querySelector("#ctxAfter"), w);
  assert(T.fhActiveTab === "filter", "right-click 'after this' jumps Full -> Filtered");

  w.applyFhView("highlight");
  w.jumpToEntry(someEntry.id);
  assert(T.fhActiveTab === "filter", "bookmark jump (jumpToEntry) reveals the Filtered view — was a real bug before (invisible scroll target)");

  // Bookmark toggle repaints BOTH views immediately (row bookmark icon was
  // removed — coloring the auto "Bookmarks" filter node is the only visual
  // marker now, see GROUP 15 — so this just checks the row itself repaints)
  w.applyFhView("stacked");
  T.state.activeId = fa.id; w.render();
  const firstEntry = fa.entries[0];
  w.selectEntry(firstEntry.id);
  const rowSel = '[data-entry-id="' + firstEntry.id + '"]';
  w.toggleBookmark(firstEntry.id);
  assert(!!d.querySelector("#tableRows " + rowSel), "row still present in Filter view immediately after bookmarking");
  assert(!!d.querySelector("#highlightRows " + rowSel), "row still present in Full view immediately after bookmarking");
  assert(!d.querySelector("#tableRows " + rowSel + " .row-bookmark-dot") && !d.querySelector("#highlightRows " + rowSel + " .row-bookmark-dot"),
    "no per-row bookmark icon is rendered anywhere (removed — the colorable 'Bookmarks' filter node is the marker now)");
  w.toggleBookmark(firstEntry.id);

  // Level-count cache
  const countsA = w.getLevelCounts(fa.id);
  assert(countsA.ERROR === 12 && countsA.INFO === 48, "level counts correct (60 entries, every 5th ERROR)");
  assert(w.getLevelCounts(fa.id) === countsA, "level counts cached (same object identity on repeat call)");
  w.invalidateAllCaches();
  assert(w.getLevelCounts(fa.id) !== countsA, "invalidateAllCaches clears the level-count cache too");

  // Scoped tail-cache invalidation
  T.state.activeId = fb.id;
  const filterB1 = w.createFilterNode(fb.id, "text", "other");
  const filterA1 = w.createFilterNode(fa.id, "text", "message");
  const andB = w.createAndOrNode([filterB1.id, filterA1.id], "and");
  const andChild = w.createFilterNode(andB.id, "text", "1");
  w.invalidateAllCaches();
  [filterA1, filterB1, andB, andChild].forEach(n => w.getEntries(n.id));
  w.getLevelCounts(filterB1.id);
  w.invalidateCachesForRoots([fa.id]);
  assert(filterA1._cache === null, "tail change invalidates filters under the CHANGED file");
  assert(filterB1._cache !== null, "filters under an UNTOUCHED file keep their cache across a tail tick");
  assert(filterB1._levelCounts !== null, "untouched file keeps its level-count cache too");
  // andB's parentId chain is fb (createAndOrNode places it under its first
  // input's root file), and its bakedA/bakedB are flat condition snapshots
  // baked once at creation — it has no live dependency on fa at all any
  // more (see the "Core data model" note above createAndOrNode in
  // philogg.html), so a tail tick on fa alone must NOT invalidate it.
  assert(andB._cache !== null, "and/or node's cache only depends on its OWN parentId chain (fb), not on where its baked conditions came from");
  assert(andChild._cache !== null, "descendants of an untouched node keep their cache across a tail tick too");

  // Minimap background-bucket memoization
  T.state.activeId = fa.id; w.render();
  const cache1 = T.minimapBgCache;
  assert(cache1 && cache1.rootId === fa.id, "minimap background cache populated on first render");
  w.renderTable();
  assert(T.minimapBgCache === cache1, "minimap background cache reused across renders of the same root/geometry (was rebuilt every renderTable() before)");
  T.state.activeId = fb.id; w.render();
  assert(T.minimapBgCache !== cache1 && T.minimapBgCache.rootId === fb.id, "minimap background cache rebuilt on root-file switch");
  const clone = { ...fb.entries[fb.entries.length - 1], id: "e_extra_review", ts: fb.entries[fb.entries.length - 1].ts + 1 };
  fb.entries.push(clone);
  const cache2 = T.minimapBgCache;
  w.renderTable();
  assert(T.minimapBgCache !== cache2, "minimap background cache rebuilt when entry count changes (tail append)");
  fb.entries.pop();

  // computeHighlightMap called once per renderMainView (was twice)
  let mapCalls = 0;
  const s = d.createElement("script");
  s.textContent = `
    const __origMap = computeHighlightMap;
    computeHighlightMap = function(fid) { window.__mapCalls = (window.__mapCalls||0)+1; return __origMap(fid); };
  `;
  d.body.appendChild(s);
  w.__mapCalls = 0;
  w.renderMainView();
  assert(w.__mapCalls === 1, "computeHighlightMap runs exactly once per renderMainView, got " + w.__mapCalls);

  // Arrow-key index hint (no double findIndex scan) — behavioral check only,
  // since the perf win itself isn't observable from outside.
  T.state.activeId = fa.id; T.state.selectedId = null; w.render();
  if (d.activeElement && d.activeElement.blur) d.activeElement.blur();
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId === T.currentViewEntries[0].id, "ArrowDown selects the first entry");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId === T.currentViewEntries[1].id, "ArrowDown advances the selection (index-hint path)");
  fireKeydown(d, w, "ArrowUp");
  assert(T.state.selectedId === T.currentViewEntries[0].id, "ArrowUp moves the selection back");
});
