// GROUP 176 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   Group 176 — this session (2026-09-04), person-requested ("Filter-
   Toolbar" reorganization, follow-up to Group 175): the full row-/
   selection-action button set (Bookmark this row, Add note, Filter after
   this, Filter before this, Filter for this message, Time filter from
   selection, Add to selection) is a permanently visible, selection-
   dependent icon button group living in #viewBar itself (right of the
   level filter — `[data-row-actions="viewbar"]`) — same underlying
   functions the pre-existing right-click context menu already used, just
   fed the current single/multi row selection instead of whichever row was
   right-clicked. EXTENDED same session, person-requested follow-up: moved
   from being duplicated inside #contextToolbar/#filteredToolbar into this
   single #viewBar copy instead, and the breadcrumb's placement (its own
   row, but between the timeline minimap and #viewBar, not below it) — see
   Group 26's updated DOM-order assertion for that half. Also: Plot's two
   filter buttons switched from text to the same icon-button look, and the
   extraction table's "Export as CSV…" got a second entry point in
   #tableToolbar.
   ============================================================ */
group(176);
await withApp(async (w, d, T) => {
  section("176a. Row-action buttons (in #viewBar): disabled state follows the current selection");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  // Bookmark/Note/Add-to-selection moved OUT of #viewBar this session
  // (person-requested follow-up: they're actions on the current selection,
  // not filter creation, so they belong in each log view's own toolbar's
  // Actions group instead — see 176e below for their new home) — only the
  // four that genuinely create a filter node stay in the Filter-Toolbar.
  const actions = [...d.querySelector('[data-row-actions="viewbar"]').querySelectorAll("[data-row-action]")];
  // "Extract" (next to "Message") joined this group in Paket A (see Group 186).
  // Reordered (person-requested, 2026-09-08 — see Group 187/188): Before/
  // After/Time range first, so they never shift position depending on
  // whether Message/Extract are visible (Context/Filtered only). "New" was
  // then broken out into its own group (#viewbarNew, see Group 194), so it's
  // no longer part of this standard-filters group.
  const expectedActions = ["filterBefore", "filterAfter", "timeRangeFromSelection", "filterForMessage", "extractMessage"];
  assert(actions.map(b => b.dataset.rowAction).join(",") === expectedActions.join(","),
    "the Filter-Toolbar's standard row-actions group has the five filter-creating actions in order, got " + actions.map(b => b.dataset.rowAction).join(","));
  const newBtnRef = d.querySelector('#viewbarNew [data-row-action="newFilter"]');
  assert(newBtnRef, "New lives in its own #viewbarNew group now, not the standard row-actions group");
  assert(d.querySelector('[data-row-actions="viewbar"] [data-row-action="bookmark"]') === null &&
    d.querySelector('[data-row-actions="viewbar"] [data-row-action="note"]') === null &&
    d.querySelector('[data-row-actions="viewbar"] [data-row-action="addToSelection"]') === null,
    "bookmark/note/addToSelection are NOT in #viewBar any more");

  // --- Circle-with-hover-pill shape (person-requested, this session): each
  // button is a plain circle (.row-action-btn, matching .level-btn's own
  // rounded-end radius) with a hidden .row-action-label that CSS reveals on
  // hover/focus, carrying the exact same text as the button's title. ---
  actions.forEach(btn => {
    assert(btn.classList.contains("row-action-btn"), btn.dataset.rowAction + " has the .row-action-btn circle/hover-pill class");
    const label = btn.querySelector(".row-action-label");
    assert(label !== null, btn.dataset.rowAction + " has a .row-action-label span");
    assert(label.textContent === btn.title && btn.title.length > 0,
      btn.dataset.rowAction + "'s label text matches its title exactly, got label=" + JSON.stringify(label.textContent) + " title=" + JSON.stringify(btn.title));
    assert(btn.querySelector(".row-action-hit svg") !== null, btn.dataset.rowAction + "'s icon is wrapped in a fixed-size .row-action-hit span");
  });

  const filterAfterBtn = actions.find(b => b.dataset.rowAction === "filterAfter");
  const byAction = action => actions.find(b => b.dataset.rowAction === action);

  // --- No selection: single-row actions disabled, time-range disabled ---
  // "Time range" is the exception since the tablet UX round: in the log views it
  // is never disabled (no 2+ selection -> a dialog prefilled with the visible span).
  expectedActions.forEach(action => {
    assert(byAction(action).disabled === (action !== "timeRangeFromSelection"), action + (action === "timeRangeFromSelection" ? " is never disabled in the log views" : " starts disabled with no selection"));
  });
  // "New" only needs an active filter tree (state.activeId, already set above),
  // not a selected row, so it's enabled from the start (see Group 186b). It's
  // in its own #viewbarNew group now.
  assert(newBtnRef.disabled === false, "newFilter needs no row selection, only an active filter tree");

  // --- Single row selected: single-row actions enabled, time-range still disabled ---
  w.selectEntry(f.entries[2].id);
  ["filterAfter", "filterBefore", "filterForMessage", "extractMessage"].forEach(action => {
    assert(byAction(action).disabled === false, action + " enabled with exactly one row selected");
  });
  assert(byAction("timeRangeFromSelection").disabled === false, "timeRangeFromSelection stays enabled with only one row selected (opens the dialog)");

  // --- Expand/collapse keys off the .row-action-hit circle's position AS
  // MEASURED WHILE THE GROUP IS COLLAPSED (setupHitExpandGroups), not off a
  // plain mouseenter/mouseleave on the (now width-changing) button itself —
  // that avoids the flicker bug where a preceding sibling's growing box
  // keeps shoving the next hit-zone back and forth under a stationary
  // cursor mid-animation (person-reported, 2026-09-05). filterAfterBtn is
  // enabled here (one row selected above). ---
  // Every sibling hit in the group needs its own non-overlapping stub rect —
  // the harness's default getBoundingClientRect (see withApp's setup) is a
  // huge 800x400 box that would otherwise match (10,10) for WHICHEVER
  // sibling happens to come first in DOM order, masking filterAfterBtn's
  // own rect regardless of the reorder below.
  const group = filterAfterBtn.parentElement;
  [...group.querySelectorAll(".row-action-hit")].forEach((h, i) => {
    h.getBoundingClientRect = () => ({ top: 0, left: i * 30, right: i * 30 + 28, bottom: 28, width: 28, height: 28, x: i * 30, y: 0 });
  });
  const filterAfterHit = filterAfterBtn.querySelector(".row-action-hit");
  const filterAfterRect = filterAfterHit.getBoundingClientRect();
  const midX = (filterAfterRect.left + filterAfterRect.right) / 2;
  assert(!filterAfterBtn.classList.contains("expanded"), "sanity: starts collapsed");
  group.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: false, clientX: midX, clientY: 10 }));
  assert(filterAfterBtn.classList.contains("expanded"), "moving into the circle's (collapsed-state) rect expands the button");
  group.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: false, clientX: 5000, clientY: 5000 }));
  assert(!filterAfterBtn.classList.contains("expanded"), "moving off the circle's rect collapses it again");
  group.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));

  // --- 2+ rows multi-selected: timeRangeFromSelection enables. filterAfter/
  // filterBefore ALSO stay enabled now (person-requested follow-up,
  // 2026-09-08): they resolve inclusively across the whole selection (see
  // afterBeforeActionEntries) — earliest/latest ts becomes the bound —
  // unlike filterForMessage/extractMessage, which still need exactly one. ---
  T.state.logMultiSelect = new Set([f.entries[1].id, f.entries[4].id]);
  w.updateRowActionButtons();
  assert(byAction("timeRangeFromSelection").disabled === false, "timeRangeFromSelection enables with 2+ rows multi-selected");
  assert(byAction("filterAfter").disabled === false, "filterAfter stays enabled with 2+ rows multi-selected (inclusive earliest-ts bound)");
  assert(byAction("filterBefore").disabled === false, "filterBefore stays enabled with 2+ rows multi-selected (inclusive latest-ts bound)");
  assert(byAction("filterForMessage").disabled === true, "filterForMessage still needs exactly one reference entry — disabled with 2+ multi-selected");
  assert(byAction("extractMessage").disabled === true, "extractMessage still needs exactly one reference entry — disabled with 2+ multi-selected");

  // --- A disabled button's label stays reachable on hover (person-reported,
  // 2026-09-15): with no column/row context to explain a grayed-out icon,
  // hovering it is the only way to learn what it does or what would enable
  // it, so setupHitExpandGroups's hit-test no longer excludes disabled
  // buttons — hovering one expands it exactly like an enabled one, and a
  // button that becomes disabled while already expanded (e.g. the selection
  // changed via keyboard, not by the mouse leaving the circle) simply stays
  // expanded instead of being force-collapsed. filterAfter no longer
  // disables on 2+ multi-select, so use filterForMessage (still
  // single-entry-only) to exercise both. ---
  T.state.logMultiSelect = new Set();
  w.selectEntry(f.entries[3].id);
  const filterForMessageBtn = byAction("filterForMessage");
  filterForMessageBtn.classList.add("expanded"); // simulate: mouse still sitting over the circle
  T.state.logMultiSelect = new Set([f.entries[1].id, f.entries[4].id]); // disables filterForMessage again
  w.updateRowActionButtons();
  assert(filterForMessageBtn.disabled === true, "sanity: disabled again");
  assert(filterForMessageBtn.classList.contains("expanded"), "a newly-disabled button's pill is left open, not force-collapsed, so its label stays discoverable");

  // Reuses the same group + the distinct non-overlapping stub rects the
  // earlier filterAfter check installed on every sibling .row-action-hit.
  filterForMessageBtn.classList.remove("expanded");
  group.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false })); // clear restRects so it's remeasured collapsed
  const filterForMessageRect = filterForMessageBtn.querySelector(".row-action-hit").getBoundingClientRect();
  const ffmMidX = (filterForMessageRect.left + filterForMessageRect.right) / 2;
  group.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: false, clientX: ffmMidX, clientY: 10 }));
  assert(filterForMessageBtn.classList.contains("expanded"), "hovering a DISABLED button's hit-zone still expands it and reveals its label");
  group.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));

  // --- Stays visible/functional on Table too (Table/Plot presence — see Group 26/158a) ---
  // NOTE: on Table/Plot, After/Before/Extract/Time range are all now
  // context-aware and stay visible (Message hides only on Plot) —
  // see Group 178 for that coverage; not re-checked here.
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");
  assert(isVisible(d.querySelector('[data-row-actions="viewbar"]'), w) === true, "row-actions group stays visible on the Table tab — it's part of the universal Filter-Toolbar");
});

await withApp(async (w, d, T) => {
  section("176b. Row-action buttons: bookmark/note reflect state, and clicking one produces the same effect as the context-menu equivalent");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = textNode.id;
  w.render();
  const entry = f.entries[3];
  w.selectEntry(entry.id);

  // bookmark/note now live in the log views' own "Actions" group (moved
  // out of #viewBar this session — see 176a/176e) — querySelector picks up
  // whichever copy comes first in the DOM (Context's, since #highlightWrap
  // precedes #filterSlot); either copy reacts identically, same shared
  // state/click-delegation as the six log-display toggles.
  const bookmarkBtn = d.querySelector('[data-row-action="bookmark"]');
  const noteBtn = d.querySelector('[data-row-action="note"]');
  assert(!bookmarkBtn.classList.contains("active"), "bookmark button starts unmarked (not bookmarked yet)");
  fireClick(bookmarkBtn, w);
  assert(T.state.bookmarks.has(entry.id), "clicking the toolbar bookmark button bookmarks the selected row");
  assert(bookmarkBtn.classList.contains("active"), "bookmark button reflects the bookmarked state immediately");
  fireClick(bookmarkBtn, w);
  assert(!T.state.bookmarks.has(entry.id), "clicking again removes the bookmark");

  assert(!noteBtn.classList.contains("active"), "note button starts unmarked (no note yet)");
  fireClick(noteBtn, w);
  assert(isVisible(d.querySelector("#noteDialog"), w) === true, "clicking the toolbar note button opens the note dialog, same as the context-menu entry");
  d.querySelector("#noteDialogInput").value = "toolbar note";
  fireClick(d.querySelector("#noteDialogSave"), w);
  assert(T.state.notes.get(entry.id) === "toolbar note", "saving from the toolbar-opened dialog sets the note");
  assert(noteBtn.classList.contains("active"), "note button reflects the now-present note");

  // --- Filter after this / Filter before this: same "timerange" node the context-menu path creates ---
  const beforeChildCount = textNode.children.length;
  fireClick(d.querySelector('[data-row-action="filterAfter"]'), w);
  assert(textNode.children.length === beforeChildCount + 1, "Filter-after-this creates one new filter node");
  const afterNode = T.state.nodes[T.state.activeId];
  assert(afterNode.filterType === "timerange" && afterNode.value.from === entry.ts && afterNode.value.to === null,
    "created node is a timerange filter spanning from this entry's ts onward");
  assert(T.state.activeId === afterNode.id, "creating it activates the new node, same as the context-menu path");
});

await withApp(async (w, d, T) => {
  section("176c. Time filter from selection / Add to selection toolbar buttons match the context-menu behavior");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  T.state.logMultiSelect = new Set([f.entries[2].id, f.entries[7].id, f.entries[4].id]);
  w.updateRowActionButtons();

  const beforeChildCount = f.children.length;
  fireClick(d.querySelector('[data-row-action="timeRangeFromSelection"]'), w);
  assert(f.children.length === beforeChildCount + 1, "creates exactly one new filter node");
  const rangeNode = T.state.nodes[T.state.activeId];
  assert(rangeNode.filterType === "timerange" && rangeNode.value.from === f.entries[2].ts && rangeNode.value.to === f.entries[7].ts,
    "spans the earliest/latest ts among the 3 selected rows, regardless of click order");

  // --- Add to selection: opens the same #addToSelectionMenu, anchored to the clicked button ---
  T.state.activeId = f.id;
  T.state.logMultiSelect = new Set([f.entries[1].id, f.entries[5].id]);
  w.updateRowActionButtons();
  const addBtn = d.querySelector('[data-row-action="addToSelection"]');
  fireClick(addBtn, w);
  assert(isVisible(d.querySelector("#addToSelectionMenu"), w) === true, "clicking Add-to-selection opens the same popup the context-menu entry uses");
  const createItem = d.querySelector('#addToSelectionMenu [data-selection-action="create"]');
  assert(createItem !== null, "'Create new selection filter' option is present");
  fireClick(createItem, w);
  const created = Object.values(T.state.nodes).find(n => n.selectionFilter);
  assert(created && created.value.length === 2 && created.value.includes(f.entries[1].id) && created.value.includes(f.entries[5].id),
    "creates a selection filter node containing exactly the 2 multi-selected rows");
});

await withApp(async (w, d, T) => {
  section("176d. Table view gets its own Export-as-CSV button; Plot's unified \"Select\"/\"Time range\" actions");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("plot");

  // The old Plot-specific #plotFilterTimeRangeBtn/#plotFilterEntriesBtn are
  // gone (person-requested, this session) — the unified "Time range"
  // row-action in #viewBar and "Select" in #plotToolbar replace them.
  assert(d.querySelector("#plotFilterTimeRangeBtn") === null && d.querySelector("#plotFilterEntriesBtn") === null,
    "Plot's two dedicated viewport-filter buttons are gone");
  assert(isVisible(d.querySelector('[data-row-action="timeRangeFromSelection"]'), w) === true,
    "the unified Time-range row-action is visible on the Plot tab instead");
  assert(d.querySelector("#plotToolbar [data-row-action=\"addToSelection\"]") !== null,
    "Plot's toolbar gained the \"Select\" (Add to selection) action");

  w.applyFhView("table");
  const exportBtn = d.querySelector("#tableExportCsvBtn");
  assert(exportBtn !== null, "#tableExportCsvBtn exists in #tableToolbar");
  assert(isVisible(exportBtn, w) === true, "#tableExportCsvBtn is visible on the Table tab");
  assert(d.querySelector("#tableToolbar [data-row-action=\"addToSelection\"]") !== null,
    "Table's toolbar gained the \"Select\" (Add to selection) action");
  assert(isVisible(d.querySelector("#csvExportDialog"), w) === false, "sanity: CSV export dialog starts closed");
  fireClick(exportBtn, w);
  assert(isVisible(d.querySelector("#csvExportDialog"), w) === true, "clicking it opens the same CSV export dialog as the right-click menu entry");
  fireClick(d.querySelector("#csvExportCancel"), w);
});
