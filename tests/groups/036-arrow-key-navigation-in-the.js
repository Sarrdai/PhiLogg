// GROUP 36 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 36 — Arrow-key navigation in the filter tree
   Origin: this session (FEATURE_BACKLOG.md "Arrow-key navigation in the
   filter tree"). New state.focusRegion ("entries" | "tree", default
   "entries") decides what plain arrow keys act on: a tree-row/breadcrumb
   click or a tree drop sets it to "tree", any entry-table selection
   (applySelection) sets it back to "entries" — the pre-existing ArrowUp/
   ArrowDown log-row navigation (Group 19) is completely untouched when
   focus stays on "entries". With "tree" focus, moveTreeSelection moves
   state.activeId: Up/Down step through flattenTreeIds() (the same
   depth-first order renderNode renders in), Left jumps to the parent,
   Right to the first child.
   ============================================================ */
group(36);
await withApp(async (w, d, T) => {
  section("36. Arrow-key navigation in the filter tree");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  assert(T.state.focusRegion === "entries", "focusRegion defaults to \"entries\" (pre-existing ArrowUp/Down-selects-a-row behavior is unaffected by default)");

  // Build file -> filterA -> filterB, and a sibling filterC under the file,
  // so the flattened DFS order is [f, filterA, filterB, filterC] — walking
  // past filterB back out to a sibling of filterA exercises the "not just a
  // flat sibling list" part of the traversal.
  const filterA = w.createFilterNode(f.id, "text", "a");
  const filterB = w.createFilterNode(filterA.id, "text", "b");
  const filterC = w.createFilterNode(f.id, "text", "c");
  w.render();

  // A real tree-row click is what flips focus onto the tree — locate the
  // file's own row via its label text and click it, same DOM path a person
  // uses.
  const fileRow = [...d.querySelectorAll(".tree-row")].find(r => r.querySelector(".tree-label").textContent === "a.log");
  fireClick(fileRow, w);
  assert(T.state.activeId === f.id, "clicking the file's tree row makes it active");
  assert(T.state.focusRegion === "tree", "clicking a tree row gives the tree keyboard focus (focus follows the last pointer interaction; arrow keys then move the tree selection)");

  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterA.id, "ArrowDown from the file moves to its first child (filterA)");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterB.id, "ArrowDown descends into filterA's own child (filterB) before its sibling");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterC.id, "ArrowDown from filterB steps back out to its uncle (filterC), matching the flattened visual order");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === filterC.id, "ArrowDown at the last node clamps instead of wrapping around");

  fireKeydown(d, w, "ArrowUp");
  assert(T.state.activeId === filterB.id, "ArrowUp moves back up through the same flattened order");

  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === filterA.id, "ArrowLeft jumps from leaf filterB to its parent filterA");
  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === filterA.id && filterA.collapsed === true, "ArrowLeft on the expanded filterA collapses it, selection stays");
  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === f.id, "ArrowLeft on collapsed filterA jumps up to the root file");
  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === f.id && f.collapsed === true, "ArrowLeft on the expanded root file collapses it");
  fireKeydown(d, w, "ArrowLeft");
  assert(T.state.activeId === f.id, "ArrowLeft on a collapsed root file (no parent) is a no-op");

  fireKeydown(d, w, "ArrowRight");
  assert(T.state.activeId === f.id && !f.collapsed, "ArrowRight on the collapsed file expands it, selection stays");
  fireKeydown(d, w, "ArrowRight");
  assert(T.state.activeId === filterA.id, "ArrowRight from the expanded file descends to its first child");
  assert(T.state.multiSelect.has(filterA.id) && T.state.multiSelect.size === 1, "tree arrow navigation also collapses multiSelect to just the newly-active node, same as a plain row click");

  // Selecting a table entry hands focus back to "entries" — subsequent
  // arrow keys must move the row selection again, not the tree.
  T.state.selectedId = null;
  const entryRow = d.querySelector("#tableRows .log-row");
  fireClick(entryRow, w);
  assert(T.state.focusRegion === "entries", "clicking a log row switches focusRegion back to \"entries\"");
  const activeBeforeEntryNav = T.state.activeId;
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === activeBeforeEntryNav, "with \"entries\" focus, ArrowDown moves the row selection and leaves the tree's active node untouched");
  assert(T.state.selectedId != null, "ArrowDown with \"entries\" focus still selects a log row (Group 19 behavior intact)");
});
