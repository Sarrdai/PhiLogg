// GROUP 150 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 150 — Arrow-key navigation always drives the pane that is actually
   on screen (person-reported, this session: "navigating the selection
   upwards with the arrow keys, row by row past the top edge — sometimes the
   table doesn't scroll along, not reliably reproducible").
   Root cause: state.entriesView ("filter" | "highlight" — which of the two
   Log views ArrowUp/Down move through) was maintained independently of
   which pane tabs layout actually shows. Row clicks, Ctrl+1/2/3 and
   revealInHighlightView set it; the #fhTabs buttons and revealFilteredView()
   (tree click on a filter node, every filter-creation path, ...) switched
   the visible pane without touching it. Left out of sync, ArrowUp/Down ran
   against the HIDDEN pane — and because updateSelectedRowClass syncs the
   .selected class into BOTH views' rows, the selection visibly walked row by
   row through the pane on screen while the scroll container being moved was
   the other one (which, being display:none, cannot scroll at all, so the
   position was lost outright). Intermittent because clicking any row in the
   visible pane re-synced it. Fixed by pinning state.entriesView to the
   visible tab inside showFhTab, the single funnel every tabs-layout pane
   switch goes through. Stacked layout is deliberately untouched (both panes
   visible there, so "last pane clicked in" stays meaningful).
   ============================================================ */
group(150);
await withApp(async (w, d, T) => {
  section("150. Arrow keys follow the visible pane (tabs layout)");

  const f = await w.addFile("nav.log", makeLog(0, 300), () => {});
  T.state.activeId = f.id;
  w.render();
  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");
  const RH = T.ROW_HEIGHT;
  const VIEWPORT = 400; // clientHeight stub, see withApp

  /* ---------- #fhTabs button: Filtered -> Full ---------- */
  w.applyFhView("filter");
  w.selectEntry(T.currentViewEntries[200].id, { scroll: true, index: 200 });
  assert(T.state.entriesView === "filter", "sanity: a Filtered-view row selection points the arrow keys at the Filtered pane");
  const tableScrollBefore = tableBody.scrollTop;
  assert(tableScrollBefore > 0, "sanity: the Filtered pane really scrolled to entry 200, got " + tableScrollBefore);

  fireClick(d.querySelector('#fhTabs .view-tab[data-fh-tab="highlight"]'), w);
  assert(T.state.entriesView === "highlight",
    "clicking the Full tab points the arrow keys at the Full pane (the #fhTabs buttons used to leave state.entriesView stale)");

  for (let i = 0; i < 20; i++) fireKeydown(d, w, "ArrowUp");
  const hIdx = T.currentHighlightViewEntries.findIndex(e => e.id === T.state.selectedId);
  assert(hIdx === 180, "20x ArrowUp walked the selection 20 rows up the Full view's list, got " + hIdx);
  assert(highlightBody.scrollTop === 180 * RH,
    "the VISIBLE Full pane scrolled to keep the selected row in view, got " + highlightBody.scrollTop + " expected " + 180 * RH);
  assert(tableBody.scrollTop === tableScrollBefore,
    "the hidden Filtered pane was left alone (it used to be the one that got scrolled), got " + tableBody.scrollTop);
  const shownRow = d.querySelector('#highlightRows [data-entry-id="' + T.state.selectedId + '"]');
  assert(!!shownRow && shownRow.classList.contains("selected"),
    "the selected row is actually rendered inside the visible pane's virtualized window, not just marked in state");

  /* ---------- revealFilteredView(): tree click on a filter node ---------- */
  // The other route into the same desync, and the more common one: standing
  // in the Full view (arrow keys pointed at it) and clicking a filter in the
  // "Files & Filters" tree, which reveals the Filtered pane.
  const filterNode = w.createFilterNode(f.id, "text", "message");
  w.render();
  w.applyFhView("highlight");
  w.selectHighlightEntry(T.currentHighlightViewEntries[150].id, { scroll: true, index: 150 });
  assert(T.state.entriesView === "highlight", "sanity: a Full-view row selection points the arrow keys back at the Full pane");
  const highlightScrollBefore = highlightBody.scrollTop;

  fireClick(d.querySelector('.tree-row[data-node-id="' + filterNode.id + '"]'), w);
  assert(T.fhActiveTab === "filter", "sanity: the tree click revealed the Filtered pane (revealFilteredView)");
  assert(T.state.entriesView === "filter", "...and pointed the arrow keys at it too");

  const startIdx = T.currentViewEntries.findIndex(e => e.id === T.state.selectedId);
  T.state.focusRegion = "entries"; // the tree click gave the tree focus (GROUP 345); back to the log rows
  fireKeydown(d, w, "ArrowUp");
  const movedIdx = T.currentViewEntries.findIndex(e => e.id === T.state.selectedId);
  assert(movedIdx === startIdx - 1, "ArrowUp moves through the Filtered pane's own list, got " + movedIdx + " from " + startIdx);
  const rowTop = movedIdx * RH;
  assert(rowTop >= tableBody.scrollTop && rowTop + RH <= tableBody.scrollTop + VIEWPORT,
    "the newly visible Filtered pane scrolled so the selected row is inside its viewport (scrollTop " +
    tableBody.scrollTop + ", row top " + rowTop + ")");
  assert(highlightBody.scrollTop === highlightScrollBefore,
    "the now-hidden Full pane kept its own reading position, got " + highlightBody.scrollTop);

  /* ---------- Stacked layout is untouched ---------- */
  // Both panes are on screen there, so "whichever one was last clicked in"
  // stays the right answer and showFhTab's sync must not override it.
  w.applyFhView("highlight");
  w.selectHighlightEntry(T.currentHighlightViewEntries[100].id, { scroll: true, index: 100 });
  assert(T.state.entriesView === "highlight", "sanity: arrow keys on the Full pane");
  w.applyFhView("stacked");
  assert(T.state.entriesView === "highlight",
    "switching to Stacked leaves the arrow-key target alone — both panes are visible, so the last-clicked one still wins");

  /* ---------- Nav history round trip ---------- */
  // applyNavWaypoint restores state.entriesView AFTER its own render()/
  // applyFhView calls, both of which can route through showFhTab now.
  w.applyFhView("highlight");
  w.selectHighlightEntry(T.currentHighlightViewEntries[50].id, { scroll: true, index: 50 });
  w.pushNavWaypoint();
  const waypointCount = T.navHistory.length;
  w.applyFhView("filter");
  assert(T.state.entriesView === "filter", "sanity: moved the arrow-key target to the Filtered pane");
  w.navigateBack();
  assert(T.navHistory.length >= waypointCount - 1, "sanity: nav history still holds the waypoint");
  assert(T.state.entriesView === T.navHistory[T.navHistoryIndex].entriesView,
    "going back through nav history restores the waypoint's own arrow-key target, got \"" + T.state.entriesView + "\"");
});
