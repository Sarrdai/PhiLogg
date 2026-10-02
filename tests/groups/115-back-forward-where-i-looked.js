// GROUP 115 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 115 — Back/forward "where I looked" navigation (FEATURE_BACKLOG.md
   #53) and the toolbar regroup (FEATURE_BACKLOG.md #56).
   Origin: this session, person-requested. #53: a browser/IDE-style history
   of visited filter nodes (+ per-node scroll position), distinct from
   Undo/Redo (which never touches navHistory — see the undo()/redo() code,
   unchanged). #56: "Session…"/"Open…" toolbar buttons became "Open…"
   (files/folder/import-session) and "Save" (export-session only), moved out
   of #toolbar entirely into #sidebarHeader.
   Follow-up (same session, person-requested): the version tag moved OUT of
   #toolbar's right side into its own line directly under the "PhiLogg"
   wordmark (`.brand` is now a column: `.brand-row` for mark+name, then
   `.brand-version` below — the wordmark's own position is unchanged). The
   back/forward buttons moved OUT of #sidebarHeader into #toolbar itself,
   in the same row as Settings/Undo/Redo but left-aligned right next to the
   brand (via `.toolbar-spacer` absorbing the rest of the row's width) —
   closer to the wordmark than the other toolbar-right buttons, which stay
   flush right exactly as before.
   ============================================================ */
group(115);
await withApp(async (w, d, T) => {
  section("115a. Toolbar regroup: nav buttons live in #toolbar near the wordmark, open/save in #sidebarHeader, #btnSession is gone, version tag under the wordmark");
  assert(!!d.querySelector("#toolbar #btnNavBack"), "back button lives in #toolbar");
  assert(!!d.querySelector("#toolbar #btnNavForward"), "forward button lives in #toolbar");
  assert(d.querySelector("#sidebarHeader #btnNavBack") === null, "back button no longer lives in #sidebarHeader");
  assert(d.querySelector("#sidebarHeader #btnNavForward") === null, "forward button no longer lives in #sidebarHeader");
  assert(!!d.querySelector("#sidebarHeader #btnOpen"), "Open button lives in #sidebarHeader");
  assert(!!d.querySelector("#sidebarHeader #btnSave"), "Save button lives in #sidebarHeader");
  assert(d.querySelector("#toolbar #btnOpen") === null, "Open button is not in the top toolbar");
  assert(d.querySelector("#btnSession") === null, "#btnSession no longer exists");
  assert(d.querySelector("#sessionMenu") === null, "#sessionMenu no longer exists");
  assert(!!d.querySelector(".brand #brandVersion"), "version tag sits under the wordmark, inside .brand");
  assert(d.querySelector(".toolbar-right #brandVersion") === null, "version tag no longer sits in the toolbar's right side");
  assert(!!d.querySelector(".brand .brand-row .brand-name"), "the wordmark itself stays in its own row, unmoved");
  // Nav group must come right after .brand and before the spacer that
  // pushes the rest of the toolbar's controls to the far right.
  // (#btnDrawer, the hamburger for the compact/phone tiers, is the very first child — skipped here.)
  const toolbarChildren = [...d.querySelector("#toolbar").children].filter(c => c.id !== "btnDrawer").map(c => c.className || c.id);
  const brandIdx = toolbarChildren.findIndex(c => c === "brand");
  const navIdx = toolbarChildren.findIndex(c => c === "toolbar-group" || c.includes("toolbar-group"));
  const spacerIdx = toolbarChildren.findIndex(c => c === "toolbar-spacer");
  assert(brandIdx === 0 && navIdx === 1 && spacerIdx === 2,
    "DOM order is brand, nav group, spacer, then the rest — got " + toolbarChildren.join(","));
  assert(d.querySelector("#btnNavBack").disabled, "back starts disabled with nothing visited yet");
  assert(d.querySelector("#btnNavForward").disabled, "forward starts disabled with nothing visited yet");
});

await withApp(async (w, d, T) => {
  section("115b. Back/forward steps through visited filter nodes, distinct from Undo/Redo");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const n1 = w.createFilterNode(f.id, "text", "message");
  w.render();
  const n2 = w.createFilterNode(f.id, "text", "ERROR");
  w.render();
  assert(T.state.activeId === n2.id, "sanity: creating n2 made it active");
  assert(T.navHistory.length === 3, "history has file + n1 + n2, got " + T.navHistory.length); // file root counts as the first visit
  assert(!d.querySelector("#btnNavBack").disabled, "back is enabled after two navigations");
  assert(d.querySelector("#btnNavForward").disabled, "forward is disabled at the head of history");

  fireClick(d.querySelector("#btnNavBack"), w);
  assert(T.state.activeId === n1.id, "back moved active node from n2 to n1");
  assert(!d.querySelector("#btnNavForward").disabled, "forward is enabled after going back");

  fireClick(d.querySelector("#btnNavBack"), w);
  assert(T.state.activeId === f.id, "back again moved to the file root");
  assert(d.querySelector("#btnNavBack").disabled, "back is disabled at the start of history");

  fireClick(d.querySelector("#btnNavForward"), w);
  fireClick(d.querySelector("#btnNavForward"), w);
  assert(T.state.activeId === n2.id, "forward twice returns to n2");

  // Undo/Redo is untouched by any of this — it only ever tracks tree edits.
  assert(T.undoStack.length === 0, "sanity: Undo/Redo stayed empty, back/forward is not recorded as an edit");
});

await withApp(async (w, d, T) => {
  section("115c. A fresh navigation truncates any forward history, same as browser back/forward");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const n1 = w.createFilterNode(f.id, "text", "message");
  w.render();
  const n2 = w.createFilterNode(f.id, "text", "ERROR");
  w.render();
  fireClick(d.querySelector("#btnNavBack"), w); // back to n1
  assert(T.state.activeId === n1.id, "sanity: back landed on n1");

  const n3 = w.createFilterNode(f.id, "text", "warn");
  w.render();
  assert(T.state.activeId === n3.id, "sanity: creating n3 made it active");
  assert(d.querySelector("#btnNavForward").disabled, "forward is disabled — n2 was dropped by the new branch");
  fireClick(d.querySelector("#btnNavBack"), w);
  assert(T.state.activeId === n1.id, "back from n3 goes to n1, not the discarded n2");
});

// Rewritten in place this session: scrolling used to overwrite the current
// waypoint's raw scrollTop on EVERY scroll event, which both destroyed the
// place being left and made a scroll unable to be a waypoint of its own.
// It is now B1 (scroll + dwell + one viewport of travel) plus an anchor row
// instead of a raw pixel offset — see the nav-history comment in
// philogg.html for the full tier list.
await withApp(async (w, d, T) => {
  section("115d. A scroll the person dwells on becomes its own waypoint, restored via its anchor row");
  const f = await w.addFile("a.log", makeLog(0, 200), () => {});
  const n1 = w.createFilterNode(f.id, "text", "message");
  w.render();
  const tableBody = d.querySelector("#tableBody");
  const rowH = T.ROW_HEIGHT;
  // renderTable's own reset-to-top is a programmatic scroll; a person's
  // scroll landing inside its 150ms window is deliberately ignored (same
  // guard the tail-follow listeners use), so step outside it first.
  await sleep(PROGRAMMATIC_SCROLL_SETTLE);
  // Well past one viewport (clientHeight is stubbed at 400 in this suite),
  // then held still — that is what makes it a place worth returning to.
  tableBody.scrollTop = rowH * 50 + 10;
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  await sleep(NAV_DWELL_WAIT);
  assert(T.navHistory.length === 3, "scroll + dwell appended a waypoint after the file + filter visits, got " + T.navHistory.length);

  const n2 = w.createFilterNode(f.id, "text", "ERROR");
  w.render();
  tableBody.scrollTop = 0; // n2's own view starts at the top

  fireClick(d.querySelector("#btnNavBack"), w);
  assert(T.state.activeId === n1.id, "sanity: back landed on n1");
  // Row-granular by design: the waypoint remembers the ENTRY that was at the
  // top of the viewport (robust against a tail tick, a level-filter change or
  // a re-sort shifting every pixel offset underneath it), and puts that row
  // back at the top.
  assert(tableBody.scrollTop === rowH * 50, "going back lands the anchor row back at the top of the viewport, got " + tableBody.scrollTop);
});

await withApp(async (w, d, T) => {
  section("115e. Deleting the node a stale history entry points at doesn't break further back/forward");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const n1 = w.createFilterNode(f.id, "text", "message");
  w.render();
  const n2 = w.createFilterNode(f.id, "text", "ERROR");
  w.render();
  fireClick(d.querySelector("#btnNavBack"), w); // active is n1, n2 still ahead in forward history
  assert(T.state.activeId === n1.id, "sanity: back landed on n1");

  w.deleteNode(n2.id);
  w.render();

  // Forward history still references the now-deleted n2 — must not throw
  // and must not get stuck on a dangling id.
  fireClick(d.querySelector("#btnNavForward"), w);
  assert(T.state.nodes[T.state.activeId] !== undefined, "forward after a deleted target lands on a node that still exists, got " + T.state.activeId);
});

await withApp(async (w, d, T) => {
  section("115f. Mouse back/forward buttons (button 3/4) drive the same navigation");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const n1 = w.createFilterNode(f.id, "text", "message");
  w.render();
  w.createFilterNode(f.id, "text", "ERROR");
  w.render();

  d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 3 }));
  assert(T.state.activeId === n1.id, "mouse back-button (button 3) navigates back");

  d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 4 }));
  assert(T.state.activeId !== n1.id, "mouse forward-button (button 4) navigates forward");
});

await withApp(async (w, d, T) => {
  section("115g. A scroll burst is ONE waypoint at the destination; a short scroll is none");
  const f = await w.addFile("a.log", makeLog(0, 300), () => {});
  w.createFilterNode(f.id, "text", "message");
  w.render();
  const tableBody = d.querySelector("#tableBody");
  const before = T.navHistory.length;
  await sleep(PROGRAMMATIC_SCROLL_SETTLE); // see 115d — step clear of renderTable's own reset-to-top

  // Three rapid scroll events with no dwell between them: the timer restarts
  // each time, so only the resting position counts.
  for (const top of [300, 900, 1800]) {
    tableBody.scrollTop = top;
    tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
    await sleep(40);
  }
  await sleep(NAV_DWELL_WAIT);
  assert(T.navHistory.length === before + 1, "a scroll burst produces exactly one waypoint, got " + (T.navHistory.length - before));

  // Under one viewport of travel from the waypoint just made: refreshed in
  // place, not appended.
  const afterBurst = T.navHistory.length;
  tableBody.scrollTop = 1900;
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  await sleep(NAV_DWELL_WAIT);
  assert(T.navHistory.length === afterBurst, "a scroll shorter than one viewport adds no waypoint, got " + (T.navHistory.length - afterBurst));
});

await withApp(async (w, d, T) => {
  section("115h. A programmatic scroll (tail-follow, a jump, a history restore) is never a waypoint");
  const f = await w.addFile("a.log", makeLog(0, 300), () => {});
  w.createFilterNode(f.id, "text", "message");
  w.render();
  const tableBody = d.querySelector("#tableBody");
  const before = T.navHistory.length;
  w.setTableScroll(3000); // stamps lastProgrammaticScrollTs, same as follow/jump/restore do
  tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
  await sleep(NAV_DWELL_WAIT);
  assert(T.navHistory.length === before, "a code-driven scroll adds no waypoint, got " + (T.navHistory.length - before));
});

await withApp(async (w, d, T) => {
  section("115i. A double-click reveal into the Context view is its own waypoint; Back returns to the Filtered pane");
  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  w.render();
  w.applyFhView("filter");
  const before = T.navHistory.length;

  w.revealInHighlightView(f.entries[30]);
  assert(T.fhActiveTab === "highlight", "sanity: the reveal switched to the Context pane");
  assert(T.navHistory.length === before + 1, "the reveal appended one waypoint, got " + (T.navHistory.length - before));

  fireClick(d.querySelector("#btnNavBack"), w);
  assert(T.fhActiveTab === "filter", "back returns to the Filtered pane the jump started from");
  fireClick(d.querySelector("#btnNavForward"), w);
  assert(T.fhActiveTab === "highlight", "forward returns to the Context pane");
  assert(T.state.selectedId === f.entries[30].id, "forward restores the entry the reveal had selected");
});

await withApp(async (w, d, T) => {
  section("115j. Back/forward restores the selected row and the Context/Filtered/Stacked mode");
  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  const n1 = w.createFilterNode(f.id, "text", "message");
  w.render();
  w.selectEntry(f.entries[10].id);
  w.applyFhView("stacked");

  w.createFilterNode(f.id, "text", "ERROR");
  w.render();
  w.applyFhView("filter");
  w.selectEntry(f.entries[0].id);

  fireClick(d.querySelector("#btnNavBack"), w);
  assert(T.state.activeId === n1.id, "sanity: back landed on n1");
  assert(T.fhLayout === "stacked", "back restores the layout the waypoint was recorded in, got " + T.fhLayout);
  assert(T.state.selectedId === f.entries[10].id, "back restores the row that was selected there");
});

await withApp(async (w, d, T) => {
  section("115k. A jump that also switches the active node produces exactly one waypoint (same-place merge)");
  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  w.createFilterNode(f.id, "text", "ERROR");
  w.render();
  const before = T.navHistory.length;
  w.jumpToEntry(f.entries[7].id);
  assert(T.state.activeId === f.id, "sanity: the jump activated the entry's own root file");
  assert(T.navHistory.length === before + 1, "the jump adds one waypoint, not one per mechanism, got " + (T.navHistory.length - before));
  assert(T.state.selectedId === f.entries[7].id, "sanity: the jump selected the target entry");
});

await withApp(async (w, d, T) => {
  section("115l. Arrow-key row navigation on its own is not a waypoint");
  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  w.createFilterNode(f.id, "text", "message");
  w.render();
  const before = T.navHistory.length;
  for (let i = 0; i < 6; i++) fireKeydown(d, w, "ArrowDown");
  await sleep(NAV_DWELL_WAIT);
  assert(T.state.selectedId !== null, "sanity: the arrow keys did move the selection");
  assert(T.navHistory.length === before, "walking rows adds no waypoint, got " + (T.navHistory.length - before));
});

await withApp(async (w, d, T) => {
  section("115m. A waypoint whose anchor row is gone still navigates; the buttons name their destination");
  const f = await w.addFile("a.log", makeLog(0, 60), () => {});
  const n1 = w.createFilterNode(f.id, "text", "message");
  w.render();
  w.selectEntry(f.entries[1].id); // an INFO row — makeLog makes every 5th entry ERROR
  w.createFilterNode(f.id, "text", "ERROR");
  w.render();

  const backTitle = d.querySelector("#btnNavBack").title;
  assert(backTitle.startsWith("Back to: "), "the back button's tooltip names its destination, got " + JSON.stringify(backTitle));
  assert(backTitle.includes(T.state.nodes[n1.id].name), "the tooltip names the node it would return to, got " + JSON.stringify(backTitle));

  // Narrow the view so the anchored INFO row no longer exists in it at all.
  T.state.levelFilter.add("ERROR");
  w.render();
  fireClick(d.querySelector("#btnNavBack"), w);
  assert(T.state.activeId === n1.id, "back still navigates when the anchored row is no longer in the target view");
});
