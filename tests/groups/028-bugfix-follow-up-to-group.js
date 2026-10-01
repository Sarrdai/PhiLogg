// GROUP 28 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 28 — Bugfix follow-up to Group 27 (person-reported, this session)
   toggleBookmark() repainted the Filtered view via renderVisibleRows() using
   the STALE currentViewEntries/pinnedOnlyIds from the last full render —
   fine before Group 27 (a bookmark change never used to affect WHICH rows
   are shown, only a dot on an existing row), but wrong now that pin mode
   can add/remove rows on a bookmark change. Only the pin toggle button
   itself (which routes through render() -> renderTable() -> getVisibleEntries())
   picked up bookmark changes; adding/removing a bookmark via the button,
   context menu, or "B" left the Filtered view showing the pre-change set
   until some unrelated full render happened to run. Fixed by having
   toggleBookmark() recompute currentViewEntries/pinnedOnlyIds itself when
   pin mode is on, WITHOUT going through renderTable() (which would reset
   scroll to the top on every single bookmark toggle — see the fix's own
   comment in philogg.html).
   ============================================================ */
group(28);
await withApp(async (w, d, T) => {
  section("28. Bugfix: pinned Filtered view now updates on bookmark add/remove, not just on the pin toggle");
  const fa = await w.addFile("a.log", makeLog(0, 20, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const textNode = w.createFilterNode(fa.id, "text", "message 1"); // matches 11 of 20 (see Group 27)
  T.state.activeId = textNode.id;
  w.render();
  const baselineCount = w.getVisibleEntries().length;

  // Turn pin mode on via the button (this path already worked before the fix)
  fireClick(d.querySelector(".toggle-pin"), w);
  assert(T.state.pinBookmarksInFilteredView === true, "sanity: pin mode on");

  // --- Adding a bookmark while pin mode is already on must show up WITHOUT any further render() ---
  const outsideEntry = fa.entries[0]; // does not match "message 1"
  d.querySelector("#tableBody").scrollTop = 123; // arbitrary non-zero value
  w.toggleBookmark(outsideEntry.id); // NOTE: no w.render() call after this — reproduces the reported bug exactly
  assert(d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]') !== null,
    "BUGFIX: newly bookmarked entry appears in the Filtered view immediately on toggleBookmark, with no separate render() call");
  assert(d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]').classList.contains("pinned-row"),
    "the newly-added row is correctly marked .pinned-row immediately");
  assert(d.querySelectorAll("#tableRows .pinned-row").length === 1, "exactly one pinned-only row rendered immediately");
  assert(d.querySelector("#tableBody").scrollTop === 123, "toggleBookmark does NOT reset scroll position (would be a new regression if it routed through renderTable())");

  // --- Removing that same bookmark must drop the row immediately too ---
  w.toggleBookmark(outsideEntry.id); // unbookmark, still no w.render() in between
  assert(d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]') === null,
    "BUGFIX: unbookmarking a pinned-only entry removes its row from the Filtered view immediately");
  assert(d.querySelectorAll("#tableRows .pinned-row").length === 0, "no pinned-only rows remain once the bookmark is removed");
  assert(w.getVisibleEntries().length === baselineCount, "back to the exact unpinned baseline count");

  // --- Sanity: with pin mode OFF, toggling a bookmark must NOT trigger the recompute path (no behavior change for the common case) ---
  fireClick(d.querySelector(".toggle-pin"), w); // pin mode off
  assert(T.state.pinBookmarksInFilteredView === false, "sanity: pin mode off");
  const spacerHeightBefore = d.querySelector("#tableSpacer").style.height;
  w.toggleBookmark(outsideEntry.id);
  assert(d.querySelector("#tableSpacer").style.height === spacerHeightBefore, "with pin mode off, bookmarking doesn't touch the row count/spacer at all (unchanged code path)");
  w.toggleBookmark(outsideEntry.id); // revert
});
