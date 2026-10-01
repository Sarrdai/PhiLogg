// GROUP 174 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 174 — This session (2026-09-04): "Time filter from selection" —
   right-clicking a 2+ row multi-selection (state.logMultiSelect) offers a
   new context-menu item, #ctxTimeRangeFromSelection, that creates one
   "timerange" filter node spanning from the EARLIEST to the LATEST ts
   among the selected rows (inclusive both ends), same bound semantics as
   the existing single-row "Filter after/before this". Hidden for a
   single-row selection (0-1 rows), same threshold currentSelectionRowIds
   already uses for "Filter from selection".
   ============================================================ */
group(174);
await withApp(async (w, d, T) => {
  section("174. \"Time filter from selection\": timerange node spanning selected rows' min/max ts");

  const f = await w.addFile("timesel.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));

  // --- Single selected/right-clicked row: the item is hidden ---
  clickWith(rowAt(2), {});
  assert(T.state.logMultiSelect.size <= 1, "sanity: no 2+ row multi-selection active");
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[2]);
  assert(isVisible(d.querySelector("#ctxTimeRangeFromSelection"), w) === false,
    "with a single row selected, \"Time filter from selection\" is hidden (already covered by Filter after/before this)");
  w.closeContextMenu();

  // --- Multi-select 3 rows out of order (2, 7, 4) — the resulting filter
  // must span the actual MIN/MAX ts among them, not just first/last picked. ---
  clickWith(rowAt(2), {});
  clickWith(rowAt(7), { ctrlKey: true });
  clickWith(rowAt(4), { ctrlKey: true });
  assert(T.state.logMultiSelect.size === 3, "sanity: 3 rows multi-selected");

  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[4]);
  assert(isVisible(d.querySelector("#ctxTimeRangeFromSelection"), w) === true,
    "with a 2+ row multi-selection, the item is shown");

  const beforeChildren = f.children.slice();
  fireClick(d.querySelector("#ctxTimeRangeFromSelection"), w);
  assert(f.children.length === beforeChildren.length + 1, "creates exactly one new filter node");
  const addedId = f.children.find(id => !beforeChildren.includes(id));
  const node = T.state.nodes[addedId];
  assert(node.filterType === "timerange", "the created node is a \"timerange\" filter");
  assert(node.value.from === f.entries[2].ts && node.value.to === f.entries[7].ts,
    "from/to span the EARLIEST and LATEST ts among the 3 selected rows (entries 2 and 7), regardless of click order, got " + JSON.stringify(node.value));
  assert(T.state.activeId === node.id, "creating it reveals it as the active node");

  const narrowed = w.getEntries(node.id);
  assert(narrowed.length === 6 && narrowed[0].id === f.entries[2].id && narrowed[narrowed.length - 1].id === f.entries[7].id,
    "the filter is inclusive on both ends, keeping every entry from row 2 through row 7, got " + narrowed.length);

  // --- Context menu closes and clears ctxEntry as usual ---
  assert(isVisible(d.querySelector("#contextMenu"), w) === false, "the context menu closes after the action");
});
