// GROUP 124 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 124 — "Add to selection": redesigned (this session) from the
   original "Filter from selection" single menu item. Selection filters
   ("idset" nodes, node.selectionFilter === true) are now always created
   TOP-LEVEL directly under the file, alongside the auto-managed "Bookmarks"
   node (syncBookmarksFilterNode) — never nested under whatever filter node
   happens to be active. A single right-clicked row now qualifies too, not
   just a 2+ row multi-selection. The single context-menu item is now a
   submenu trigger, #ctxAddToSelection, opening #addToSelectionMenu: existing
   top-level selection filters listed by name (clicking one ADDS the current
   row(s) to its value array, deduped) plus, below a separator, "Create new
   selection filter". Unlike Bookmarks: deletable (no `locked`), no
   "always show"/pin toggle, and membership never touches state.bookmarks.
   ============================================================ */
group(124);
await withApp(async (w, d, T) => {
  section("124. \"Add to selection\": top-level, named, deletable idset filters from log rows");

  const f = await w.addFile("selfilter.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));
  const menuAction = sel => d.querySelector('#addToSelectionMenu [' + sel + ']');

  // --- A SINGLE right-clicked row (no multi-selection) now qualifies too ---
  clickWith(rowAt(2), {});
  assert(T.state.logMultiSelect.size <= 1, "sanity: no 2+ row multi-selection active");
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[2]);
  assert(isVisible(d.querySelector("#ctxAddToSelection"), w) === true,
    "\"Add to selection\" is offered even for a single selected/right-clicked row");

  fireClick(d.querySelector("#ctxAddToSelection"), w);
  assert(isVisible(d.querySelector("#addToSelectionMenu"), w) === true, "clicking it opens the submenu");
  assert(menuAction('data-selection-id') === null,
    "with zero existing selection filters, the submenu lists none — just \"Create new selection filter\", no broken empty list");
  const createItem = menuAction('data-selection-action="create"');
  assert(createItem && createItem.textContent.includes("Create new selection filter"), "the create entry is present and labeled");

  const beforeRootChildren = f.children.slice();
  fireClick(createItem, w);
  assert(f.children.length === beforeRootChildren.length + 1, "creates exactly one new node");
  const addedId = f.children.find(id => !beforeRootChildren.includes(id));
  let sel1 = T.state.nodes[addedId];
  assert(sel1.filterType === "idset" && sel1.selectionFilter === true, "the created node is an \"idset\" filter marked selectionFilter:true");
  assert(sel1.value.length === 1 && sel1.value[0] === f.entries[2].id, "its value is exactly the single right-clicked row's entry id");
  assert(f.children[0] === sel1.id, "placed TOP-LEVEL as the file's first child — alongside where Bookmarks live — not nested under any other filter, regardless of state.activeId at click time");
  assert(sel1.locked !== true, "unlike the auto-managed Bookmarks node, a selection filter is NOT locked");
  assert(T.state.activeId === sel1.id, "creating it reveals it as the active node (revealFilteredView)");

  // --- Bugfix (this session, person-reported): a new selection is named as
  // a plain ordinal ("Selection 1", "Selection 2", ...) via
  // nextSelectionFilterOrdinal(), not the initial entry count (idSetFilterName's
  // "N entries (selection)"), which used to go stale the moment "Add to
  // selection" grew the set. ---
  assert(sel1.name === "Selection 1", "a new selection filter is named \"Selection 1\", not by its initial entry count, got " + sel1.name);

  // --- Deletable via the normal filter-node delete action (unlike Bookmarks) ---
  const beforeDeleteCount = f.children.length;
  w.deleteFilterNodeWithUndo(sel1.id);
  assert(f.children.length === beforeDeleteCount - 1 && !T.state.nodes[sel1.id],
    "a selection filter is deletable through deleteFilterNodeWithUndo, same as any ordinary unlocked filter node");
  w.undo();
  assert(T.state.nodes[sel1.id], "sanity: undo restores it for the rest of this test");
  // restoreSubtree rebuilds the node as a NEW object under the original id, so
  // the `sel1` captured above is now a detached husk — re-bind to the live one
  // before asserting on its fields. (This used to "work" only because
  // snapshotSubtree copies `value` by reference AND addRowsToSelectionFilter
  // pushed into that shared array in place; both node objects then observed
  // the same mutation. The in-place push was the copy/paste aliasing bug fixed
  // in addRowsToSelectionFilter — see GROUP 136 — so the stale reference has to
  // go too, rather than the test quietly depending on the aliasing.)
  sel1 = T.state.nodes[sel1.id];
  T.state.activeId = sel1.id;

  // --- No "always show" control: the global bookmarks-pin toggle is
  // hard-wired to state.bookmarks specifically and never references
  // selection filters at all — nothing analogous exists for them. ---
  assert(T.state.bookmarks.size === 0, "creating/populating a selection filter never touches state.bookmarks — no bookmark icon/state is set on member entries");

  // --- Multi-select 3 rows, then "Add to selection" -> the EXISTING
  // selection filter (sel1) instead of creating a second one ---
  T.state.activeId = f.id; // back to the full file (not sel1's own 1-row filtered result) so every row is on screen
  w.render();
  clickWith(rowAt(2), {});
  clickWith(rowAt(5), { ctrlKey: true });
  clickWith(rowAt(7), { ctrlKey: true });
  assert(T.state.logMultiSelect.size === 3, "sanity: 3 rows multi-selected");

  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[7]);
  fireClick(d.querySelector("#ctxAddToSelection"), w);
  const existingItem = menuAction('data-selection-id="' + sel1.id + '"');
  assert(existingItem && existingItem.textContent === sel1.name,
    "the submenu now lists the existing selection filter by its name (createSelectionFilterNode's \"Selection N\" auto-name)");

  const childCountBeforeAdd = f.children.length;
  fireClick(existingItem, w);
  assert(f.children.length === childCountBeforeAdd, "clicking an EXISTING selection adds to it — creates no new node");
  const expectedIds = [f.entries[2].id, f.entries[5].id, f.entries[7].id];
  assert(sel1.value.length === 3 && expectedIds.every(id => sel1.value.includes(id)),
    "the multi-selected rows' ids were added to the existing node's value array (the original single-row id, already present, wasn't duplicated)");
  const result = w.getEntries(sel1.id).map(e => e.id).sort();
  assert(JSON.stringify(result) === JSON.stringify(expectedIds.slice().sort()), "getEntries on the selection filter matches exactly those 3 entries");
  assert(sel1.name === "Selection 1", "growing the selection from 1 to 4 entries doesn't rewrite its ordinal name, got " + sel1.name);

  // --- Adding an already-present id again doesn't duplicate it ---
  T.state.activeId = f.id;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[2]);
  fireClick(d.querySelector("#ctxAddToSelection"), w);
  fireClick(menuAction('data-selection-id="' + sel1.id + '"'), w);
  assert(sel1.value.length === 3, "re-adding a row already in the selection is deduped, not appended again");

  // --- A plot-view-created "idset" node (no selectionFilter flag) must NOT
  // appear in the "Add to selection" submenu — it's a different producer. ---
  const plotNode = w.createFilterNode(f.id, "idset", [f.entries[0].id]);
  assert(!plotNode.selectionFilter, "sanity: a plain createFilterNode idset call (the plot-view producer's path) leaves selectionFilter unset");
  T.state.activeId = f.id;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[3]);
  fireClick(d.querySelector("#ctxAddToSelection"), w);
  assert(menuAction('data-selection-id="' + plotNode.id + '"') === null,
    "the plot-view idset node is excluded from the submenu's list of selection filters");
  assert(menuAction('data-selection-id="' + sel1.id + '"') !== null, "...while the real selection filter still is listed");
  w.closeContextMenu();

  // --- A second "Create new selection filter" gets the next ordinal ---
  T.state.activeId = f.id;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[9]);
  fireClick(d.querySelector("#ctxAddToSelection"), w);
  fireClick(menuAction('data-selection-action="create"'), w);
  // Looked up by name/flag, not f.children[0] — insertSpecialChild (this
  // session's ordering rework) now sorts Selection 2 AFTER Selection 1
  // (ascending, not unshifted-to-the-front), so index 0 is no longer where
  // the newest selection lands.
  const sel2 = Object.values(T.state.nodes).find(n => n.selectionFilter && n.name === "Selection 2");
  assert(sel2 && sel2.selectionFilter === true, "a second new selection filter is named \"Selection 2\", got " + (sel2 && sel2.name));

  // --- Persistence carriers: selectionFilter is a NEW field (unlike the
  // shared idset value/getEntries machinery, which needed no new code) —
  // verify it explicitly rides cloneSubtree, snapshot/restore (undo/redo,
  // already exercised above), and the session-cache serialize/materialize
  // round trip. ---
  T.state.clipboard = { id: sel1.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pastedNode = T.state.nodes[f.children[f.children.length - 1]];
  assert(pastedNode.filterType === "idset" && pastedNode.selectionFilter === true
    && JSON.stringify(pastedNode.value.slice().sort()) === JSON.stringify(sel1.value.slice().sort()),
    "cloneSubtree (copy/paste) carries selectionFilter:true and the full value array to the pasted copy");

  const { roots } = w.serializeFilterTreeForCache(f);
  const serializedSel1 = roots.find(r => r.value && JSON.stringify(r.value.slice().sort()) === JSON.stringify(sel1.value.slice().sort()) && r.selectionFilter);
  assert(serializedSel1, "serializeFilterTreeForCache writes selectionFilter:true for a selection filter node");

  const cacheFile = { id: w.uid("n"), type: "file", name: "cachefile", children: [], entries: f.entries, cacheKey: "ck1" };
  T.state.nodes[cacheFile.id] = cacheFile;
  w.materializeCachedFilters(cacheFile, roots);
  const restoredSel1 = cacheFile.children.map(id => T.state.nodes[id]).find(n => n.filterType === "idset" && n.selectionFilter);
  assert(restoredSel1 && JSON.stringify(restoredSel1.value.slice().sort()) === JSON.stringify(sel1.value.slice().sort()),
    "materializeCachedFilters restores selectionFilter:true and the value array from the cache round trip");
});
