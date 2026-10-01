// GROUP 78 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 78 — Enter on a selected Filtered/Stacked row mirrors dblclick
   Origin: this session (2026-08-21), person request: with a single row
   selected in the Filtered view (or the Filtered/bottom pane of the
   Stacked view — same entriesView === "filter" rows either way), Enter
   should do what a dblclick on that row already does: revealInHighlightView
   (see its own comment — centres the Full view on the entry without
   touching activeId/levelFilter/the Filter view's own scroll position).
   Left alone (no-op) with a multi-selection active, since there's no
   single obvious target row; also left alone with focus on the tree or the
   Full/Highlight pane itself (unrelated to this request).
   ============================================================ */
group(78);
await withApp(async (w, d, T) => {
  section("78. Enter on a selected Filtered/Stacked row mirrors dblclick (revealInHighlightView)");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();

  // Filtered (tabs layout): Enter on the single selected row reveals the Full view.
  w.applyFhView("filter");
  const target = f.entries[2];
  w.selectEntry(target.id);
  T.state.focusRegion = "entries";
  assert(T.state.entriesView === "filter", "sanity: entriesView is \"filter\" after selecting a row in the Filtered view");
  const prevActiveId = T.state.activeId;
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "highlight", "Enter on the selected Filtered row switches to the Full tab, same as a dblclick would");
  assert(T.state.selectedId === target.id, "...keeping the same entry selected");
  assert(T.state.activeId === prevActiveId, "...without touching the active filter node (revealInHighlightView's own contract)");

  // Stacked layout: Enter on the selected row in the bottom (Filtered) pane does the same thing.
  w.applyFhView("stacked");
  const target2 = f.entries[4];
  w.selectEntry(target2.id);
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "highlight", "Enter on the selected row in Stacked's Filtered pane reveals the Full view the same way");
  assert(T.state.selectedId === target2.id, "...keeping that entry selected");

  // Multi-selection active: Enter is a no-op (no single obvious target row).
  w.applyFhView("filter");
  w.selectEntry(f.entries[1].id);
  T.state.logMultiSelect = new Set([f.entries[1].id, f.entries[3].id]);
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "filter", "Enter with a multi-selection active leaves the Filtered tab showing (no-op)");

  // Focus elsewhere (tree): Enter's existing tree behavior is untouched, doesn't fall through to this new path.
  T.state.logMultiSelect = new Set();
  w.applyFhView("filter");
  const filterA = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = filterA.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "filter", "Enter on the tree still runs its own (unrelated) filter-node behavior, not this new entries-pane path");
});
