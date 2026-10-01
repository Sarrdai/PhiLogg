// GROUP 57 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 57 — Multi-select log rows (Ctrl/Shift+click) + Ctrl+C raw-line copy
   Origin: this session (person-requested): select multiple lines in the log
   view and copy their raw text to the system clipboard via Ctrl+C. Ctrl+click
   toggles a row into/out of state.logMultiSelect (folding the prior plain-
   click single selection in on the first Ctrl+click); Shift+click selects
   the contiguous range from the last-clicked anchor. Ctrl+C copies the
   multi-selected rows (or just the single selected entry when nothing's
   multi-selected) sorted chronologically, taking priority over the tree's
   own filter-node clipboard (state.clipboard) whenever focusRegion is
   "entries" (i.e. the log view, not the tree, was last interacted with).
   Since GROUP 345 the two are strictly scoped: tree focus never copies log
   rows and entries focus never touches the tree clipboard.
   ============================================================ */
group(57);
await withApp(async (w, d, T) => {
  section("57. Multi-select log rows + Ctrl+C raw-line copy");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };

  const rowAt = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
  const clickWith = (el, opts) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ...opts }));

  // --- Plain click: unchanged single-selection behavior, no multi-select ---
  clickWith(rowAt(2), {});
  assert(T.state.selectedId === f.entries[2].id, "plain click selects the entry as before");
  assert(T.state.logMultiSelect.size === 0, "plain click does not populate logMultiSelect");
  assert(T.state.focusRegion === "entries", "sanity: focusRegion is entries after a row click");

  // --- Ctrl+C with just a single selection: copies that one raw line ---
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(copied === f.entries[2].raw, "Ctrl+C with a single selection copies just that entry's raw line");

  // --- Ctrl+click a second row: folds the prior single selection in; this
  // click also becomes the new Shift-range anchor (index 5) ---
  clickWith(rowAt(5), { ctrlKey: true });
  assert(T.state.logMultiSelect.has(f.entries[2].id) && T.state.logMultiSelect.has(f.entries[5].id) && T.state.logMultiSelect.size === 2,
    "first Ctrl+click folds the previous plain selection in, got " + [...T.state.logMultiSelect]);
  assert(rowAt(2).classList.contains("row-multi-selected") && rowAt(5).classList.contains("row-multi-selected"),
    "both rows carry the multi-select CSS class in the DOM immediately (no full render needed)");

  // --- Shift+click: contiguous range from the anchor (index 5) to index 8 ---
  clickWith(rowAt(8), { shiftKey: true });
  const expectedRange = [5, 6, 7, 8].map(i => f.entries[i].id);
  assert(expectedRange.every(id => T.state.logMultiSelect.has(id)) && T.state.logMultiSelect.size === 4,
    "Shift+click selects the contiguous range from the anchor, got " + [...T.state.logMultiSelect].length + " ids");
  assert(!T.state.logMultiSelect.has(f.entries[2].id), "Shift+click REPLACES the set rather than extending the previous Ctrl+click selection");

  // --- Ctrl+C now copies all 4 rows, sorted chronologically, as raw lines ---
  fireKeydown(d, w, "c", { ctrlKey: true });
  const expectedText = [5, 6, 7, 8].map(i => f.entries[i].raw).join("\n");
  assert(copied === expectedText, "Ctrl+C copies every multi-selected row's raw text, newline-joined, in chronological order");

  // --- A later Shift+click narrows the range from the SAME anchor (index 5, untouched by Shift+click itself), not the previous Shift target (index 8) ---
  clickWith(rowAt(6), { shiftKey: true });
  assert(T.state.logMultiSelect.size === 2 && T.state.logMultiSelect.has(f.entries[5].id) && T.state.logMultiSelect.has(f.entries[6].id),
    "repeated Shift+click re-derives the range from the ORIGINAL anchor (5), not the previous Shift+click's target (8)");

  // --- Ctrl+click one of the currently-selected rows: toggles it back off,
  // and (like any Ctrl+click) becomes the new anchor ---
  clickWith(rowAt(5), { ctrlKey: true });
  assert(!T.state.logMultiSelect.has(f.entries[5].id) && T.state.logMultiSelect.has(f.entries[6].id),
    "Ctrl+click on an already-selected row removes it from the set");
  assert(!rowAt(5).classList.contains("row-multi-selected"), "removed row's class is cleared in place");

  // --- Plain click again clears the multi-selection ---
  clickWith(rowAt(3), {});
  assert(T.state.logMultiSelect.size === 0, "a later plain click clears the multi-selection");
  assert(T.state.selectedId === f.entries[3].id, "...and selects just the clicked row");

  // --- Multi-select made in the Highlight (Full) view is mirrored onto the Filter view's copy of the same rows ---
  w.showFhTab("highlight");
  const hRowAt = i => d.querySelector('#highlightRows [data-entry-id="' + f.entries[i].id + '"]');
  clickWith(hRowAt(1), {});
  clickWith(hRowAt(4), { shiftKey: true });
  assert(T.state.logMultiSelect.size === 4, "shift-range built from the Highlight view's own entries works the same way");
  assert(rowAt(1) && rowAt(1).classList.contains("row-multi-selected"),
    "the Filter view's row for the same entry id picks up the multi-select class too (state.logMultiSelect is shared, same as state.selectedId)");

  // --- Escape clears the multi-selection ---
  fireKeydown(d, w, "Escape");
  assert(T.state.logMultiSelect.size === 0, "Escape clears logMultiSelect");
  assert(!hRowAt(4).classList.contains("row-multi-selected"), "...and the DOM class is cleared too");

  // --- Tree-node Ctrl+C is unaffected when focus is on the tree, not the log view ---
  const filterNode = w.createFilterNode(f.id, "text", "message");
  w.render();
  T.state.activeId = filterNode.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(T.state.clipboard && T.state.clipboard.id === filterNode.id, "with focusRegion 'tree', Ctrl+C still copies the active FILTER NODE (tree clipboard), unaffected by the new log-row copy path");

  // --- FEATURE_BACKLOG.md #55: a text selection inside the Entry Detail
  // panel takes priority over the raw-line copy — Ctrl+C is left alone
  // (not preventDefault'd, not overridden) so the browser's native copy
  // grabs just the selected substring instead of the whole line. ---
  T.state.focusRegion = "entries";
  T.state.activeId = f.id;
  w.selectEntry(f.entries[3].id);
  w.render();
  copied = null;
  const realGetSelection = w.getSelection.bind(w);
  w.getSelection = () => ({ toString: () => "some substring", anchorNode: d.querySelector("#detailMessage") });
  const ev = new w.KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });
  d.dispatchEvent(ev);
  assert(copied === null, "a selection inside Entry Detail is not overridden with the full raw line");
  assert(!ev.defaultPrevented, "the keydown is left un-prevented so native copy handles the Entry Detail selection");
  w.getSelection = realGetSelection;

  // --- Sanity: with no selection inside Entry Detail, Ctrl+C still copies the raw line as before ---
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(copied === f.entries[3].raw, "without a Detail selection, Ctrl+C still copies the selected entry's raw line");
});
