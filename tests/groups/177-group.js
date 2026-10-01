// GROUP 177 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   Group 177 — this session (2026-09-04), person-requested, three related
   follow-ups to the toolbar reorganization:
   1. Table/Plot tabs are hidden entirely (not just disabled) when the
      active node can't tabulate/plot — see Group 158a for the bulk of
      this coverage; not repeated here.
   2. Bookmark this row/Add note moved out of #viewBar's row-actions group
      into each log view's own toolbar as a new "Actions" group — they
      mutate the SELECTION (bookmark/note state), not create a filter, so
      they no longer belong next to the ones that do. (2026-09-05,
      person-requested: Add to selection joined them there for the same
      reason.)
   3. Every view toolbar (#contextToolbar/#filteredToolbar/#tableToolbar/
      #plotToolbar) is grouped Controls | Settings | Actions (order
      revised 2026-09-05, person-requested — was Settings | Controls |
      Actions), no label on any group — just the existing
      `.ctx-toolbar-sep` `|` divider between whichever groups a given
      toolbar actually has (a toolbar with nothing for a group omits it
      entirely, never a dangling separator).
   ============================================================ */
group(177);
await withApp(async (w, d, T) => {
  section("177a. Bookmark/Note/Add-to-selection live in each log view's own toolbar as an Actions group, duplicated like the display toggles");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  ["bookmark", "note"].forEach(action => {
    const copies = [...d.querySelectorAll('[data-row-action="' + action + '"]')];
    assert(copies.length === 2, action + " exists exactly twice (Context's and Filtered's own Actions group), got " + copies.length);
    assert(d.querySelector("#contextToolbar [data-row-action=\"" + action + "\"]") !== null, action + " is present inside #contextToolbar");
    assert(d.querySelector("#filteredToolbar [data-row-action=\"" + action + "\"]") !== null, action + " is present inside #filteredToolbar");
    copies.forEach(btn => assert(btn.classList.contains("row-action-btn"), action + "'s copies keep the circle/hover-pill shape in their new home too"));
  });
  // "Select" (Add to selection) additionally lives in Table's and Plot's own
  // Actions groups now (person-requested, this session) — four copies total.
  {
    const selectCopies = [...d.querySelectorAll('[data-row-action="addToSelection"]')];
    assert(selectCopies.length === 4, "addToSelection exists exactly four times (Context/Filtered/Table/Plot), got " + selectCopies.length);
    ["#contextToolbar", "#filteredToolbar", "#tableToolbar", "#plotToolbar"].forEach(sel => {
      assert(d.querySelector(sel + ' [data-row-action="addToSelection"]') !== null, "addToSelection is present inside " + sel);
    });
    selectCopies.forEach(btn => assert(btn.classList.contains("row-action-btn") && btn.classList.contains("rect"),
      "addToSelection's copies keep the .row-action-btn.rect shape"));
  }
});

await withApp(async (w, d, T) => {
  section("177b. Every view toolbar is grouped Controls | Settings | Actions, in that order, no dangling separator");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();

  // Each top-level .toolbar-group carries its own data-toolbar-group
  // attribute ("settings"/"controls"/"actions") — read straight off the
  // markup rather than re-deriving it from which buttons happen to be
  // inside, which is both simpler and catches a group being miscategorized
  // in the HTML itself (a re-derived heuristic would just silently agree
  // with whatever the markup already says).
  function groupKinds(toolbarEl) {
    return [...toolbarEl.children]
      .filter(c => c.classList.contains("toolbar-group") && !c.hasAttribute("data-text-only")) // the plain-text Pretty/Raw group (GROUP 349) is not part of the log toolbar
      .map(c => c.dataset.toolbarGroup);
  }
  function assertOrdered(kinds, toolbarName) {
    const order = { controls: 0, settings: 1, actions: 2 };
    for (let i = 1; i < kinds.length; i++) {
      assert(order[kinds[i - 1]] <= order[kinds[i]], toolbarName + "'s groups are in Controls|Settings|Actions order, got " + kinds.join(","));
    }
  }
  // No group has a label of its own (person-requested: "ohne Label") — just
  // `.ctx-toolbar-sep` between them, i.e. no group carries visible text
  // that isn't inside one of its own buttons.
  function assertNoGroupLabel(toolbarEl) {
    [...toolbarEl.children].filter(c => c.classList.contains("toolbar-group")).forEach(g => {
      const directText = [...g.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");
      assert(directText === "", "a toolbar-group has no label text of its own (found " + JSON.stringify(directText) + ")");
    });
  }

  w.applyFhView("highlight");
  const contextKinds = groupKinds(d.querySelector("#contextToolbar"));
  assert(contextKinds.join(",") === "controls,settings,actions", "#contextToolbar is Controls|Settings|Actions, got " + contextKinds.join(","));
  assertOrdered(contextKinds, "#contextToolbar");
  assertNoGroupLabel(d.querySelector("#contextToolbar"));
  // Merged nav (Prev/Next match + Expand/Collapse) into one Controls group,
  // no separator between them any more (both are "Controls").
  assert(d.querySelector("#contextToolbar").querySelectorAll(".ctx-toolbar-sep:not([data-text-only])").length === 2,
    "#contextToolbar has exactly 2 separators for 3 groups (Controls|Settings|Actions)");

  w.applyFhView("filter");
  const filteredKinds = groupKinds(d.querySelector("#filteredToolbar"));
  assert(filteredKinds.join(",") === "settings,actions", "#filteredToolbar is Settings|Actions (no Controls — no nav buttons of its own), got " + filteredKinds.join(","));
  assertOrdered(filteredKinds, "#filteredToolbar");
  assertNoGroupLabel(d.querySelector("#filteredToolbar"));
  assert(d.querySelector("#filteredToolbar").querySelectorAll(".ctx-toolbar-sep").length === 1,
    "#filteredToolbar has exactly 1 separator for 2 groups (Settings|Actions)");

  // Table is Actions-only (just "Export as CSV…") — the Statistics
  // visibility Setting/toggle it briefly had is gone again (2026-09-05,
  // person-requested, later the same day): Statistics moved out into its
  // own standalone #statsPanel (Entry-Detail-style pin/hover), so there's no
  // toolbar button for it anymore, on Table or Plot.
  w.applyFhView("table");
  const tableKinds = groupKinds(d.querySelector("#tableToolbar"));
  assert(tableKinds.join(",") === "actions", "#tableToolbar is Actions-only (Export as CSV…), got " + tableKinds.join(","));
  assertOrdered(tableKinds, "#tableToolbar");
  assertNoGroupLabel(d.querySelector("#tableToolbar"));

  // Plot's own toolbar: back to Controls|Actions (zoom/fullscreen, Save
  // image) — no Settings group, same Statistics-panel-moved-out reasoning as
  // Table above.
  w.applyFhView("plot");
  const plotKinds = groupKinds(d.querySelector("#plotToolbar"));
  assert(plotKinds.join(",") === "controls,actions", "#plotToolbar is Controls|Actions (zoom/fullscreen, Save image), got " + plotKinds.join(","));
  assertOrdered(plotKinds, "#plotToolbar");
  assertNoGroupLabel(d.querySelector("#plotToolbar"));
});
