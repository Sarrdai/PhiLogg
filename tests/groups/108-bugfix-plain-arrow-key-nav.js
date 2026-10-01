// GROUP 108 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 108 — Bugfix: plain arrow-key nav after Alt+Arrow-switching onto a
   Link filter no longer navigates the STALE previous filter's entries
   (person-reported, this session: "after switching filters with Alt+Arrow,
   plain arrow keys seem to still navigate the old list — the entry detail
   panel updates but nothing highlights in the Log list").
   Root cause: renderMainView() calls renderLinkView() instead of
   renderTable() while a Link filter is active, so currentViewEntries (which
   only renderTable() repopulates) keeps whatever filter's list was active
   before the switch. The plain ArrowUp/ArrowDown handler didn't know this
   and called moveSelection(), which found some entry in that stale list,
   selected it (updating the detail panel via entryIndex, which works for
   ANY id), but no row in the (unrelated) Link view's DOM ever matches that
   id, so updateSelectedRowClass finds nothing to mark "selected" — exactly
   the reported symptom. Fixed with the same guard extractWrap already had:
   Up/Down no-ops while linkWrap is the visible Filtered-pane content,
   instead of running against stale data (the Link view has its own
   click-driven pair selection, no Up/Down of its own to route into).
   ============================================================ */
group(108);
await withApp(async (w, d, T) => {
  section("108. Bugfix: arrow-key nav doesn't use a stale currentViewEntries after switching onto a Link filter");

  const f = await w.addFile("app.log", makeLog(0, 6, { suffix: i => (i % 2 === 0 ? "keep" : "skip") }), () => {});
  const keepFilter = w.createFilterNode(f.id, "text", "keep"); // matches entries 0,2,4
  const skipFilter = w.createFilterNode(f.id, "text", "skip"); // matches entries 1,3,5
  const linkFilter = w.createLinkNode(keepFilter.id, skipFilter.id, "after", 1);
  w.render();

  T.state.activeId = keepFilter.id;
  T.state.entriesView = "filter";
  T.state.focusRegion = "entries";
  w.render();
  fireClick(d.querySelectorAll("#tableRows .log-row")[0], w); // select "keep" entry 0
  const keep0Id = T.state.selectedId;
  assert(!!keep0Id, "sanity: clicking a Filtered-view row selects it");

  // Switch the active node onto the Link filter (same net effect as an
  // Alt+Arrow tree-nav step — see GROUP 99 — deliberately not touching
  // focusRegion/entriesView/selectedId); linkFilter's own position in the
  // tree (always directly under FILE now, see GROUP 128) isn't what this
  // group is testing, just the stale-currentViewEntries guard once it's active.
  T.state.activeId = linkFilter.id;
  w.render();
  assert(T.state.activeId === linkFilter.id, "sanity: active node switched onto the Link filter");
  assert(d.querySelector("#linkWrap").style.display !== "none", "the Link view is now showing in the Filtered pane");

  fireKeydown(d, w, "ArrowDown"); // plain arrow key nav, no Alt
  assert(T.state.selectedId === keep0Id,
    "plain ArrowDown while the Link view is active does NOT change the selection (no stale-list jump)");

  // Switching back to a plain text filter (renderTable() runs again)
  // refreshes currentViewEntries and arrow-key nav works normally again.
  T.state.activeId = keepFilter.id;
  w.render();
  assert(T.state.activeId === keepFilter.id, "sanity: switched back onto keepFilter");
  fireKeydown(d, w, "ArrowDown");
  const keep2Id = d.querySelectorAll("#tableRows .log-row")[1].dataset.entryId;
  assert(T.state.selectedId === keep2Id, "arrow-key nav works normally again once back on a plain (table) filter");
});
