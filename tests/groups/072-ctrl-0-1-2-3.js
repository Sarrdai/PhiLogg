// GROUP 72 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 72 — Ctrl+0/1/2/3(/4) tree/Log-view shortcuts + Enter
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Shortcuts to
   switch between Tree and Filter view", REVISED twice same session per
   person-requested follow-up feedback, and again on 2026-09-05
   (person-requested): Ctrl+0 focuses the filter tree at whichever node is
   ALREADY active — a filter included, not just its root file — so arrow
   keys continue navigating from wherever the person currently is (an even
   earlier pass jumped up to the active node's root FILE instead, which
   undid exactly that); falls back to the first root file only if nothing's
   active yet. Ctrl+1-4 (jumpToViewTab/currentViewTabsList) no longer mirror
   fixed Full/Filtered/Stacked toggle buttons — they jump POSITIONALLY
   through whichever tabs the View Selector currently shows, same order:
   with a plain (non-extraction) node that's just [Context, Filtered], so
   Ctrl+3/4 are no-ops there; Ctrl+1/2 still open Full/Filtered and focus
   the entries pane for arrow-key navigation exactly as before — a new
   state.entriesView ("filter" | "highlight") decides which of
   moveSelection/moveHighlightSelection the global ArrowUp/Down handler
   calls, also updated by a plain click/dblclick in either Log view.
   Entering Stacked itself is no longer a Ctrl+3 action (there's no
   "Stacked" tab to jump to from tabs layout — it only appears once Stacked
   is already the active layout) — that's exercised with an
   extraction-capable node instead, see 72b below.
   ============================================================ */
group(72);
await withApp(async (w, d, T) => {
  section("72. Ctrl+0/1/2/3/4 tree/Log-view shortcuts + Enter");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const filterA = w.createFilterNode(f.id, "text", "message");
  w.render();

  // Ctrl+0: focus the tree at whichever node is ALREADY active — a filter
  // stays the active node, it does NOT jump up to its root file.
  T.state.activeId = filterA.id;
  fireKeydown(d, w, "0", { ctrlKey: true });
  assert(T.state.activeId === filterA.id, "Ctrl+0 keeps the already-active FILTER active, doesn't jump up to its root file");
  assert(T.state.focusRegion === "tree", "Ctrl+0 switches focus to the tree");

  T.state.activeId = null;
  fireKeydown(d, w, "0", { ctrlKey: true });
  assert(T.state.activeId === f.id, "Ctrl+0 with no active node falls back to the first root file");

  // Ctrl+1: Patterns is the leftmost View Selector tab (2026-09-26, GROUP 288).
  w.applyFhView("filter");
  fireKeydown(d, w, "1", { ctrlKey: true });
  assert(T.fhActiveTab === "patterns", "Ctrl+1 opens the Patterns tab (leftmost)");

  // Ctrl+2: opens Full (Highlight) and focuses it for arrow-key navigation.
  w.applyFhView("filter");
  fireKeydown(d, w, "2", { ctrlKey: true });
  assert(T.fhActiveTab === "highlight", "Ctrl+2 opens the Full view");
  assert(T.state.focusRegion === "entries" && T.state.entriesView === "highlight", "...and focuses it (entriesView) for arrow-key navigation");

  const beforeHighlightSelect = T.state.selectedId;
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId !== beforeHighlightSelect, "with entriesView \"highlight\", ArrowDown moves the Full view's own selection, not the Filtered view's");

  // Ctrl+3: opens Filtered and focuses it — arrow keys move that view instead.
  fireKeydown(d, w, "3", { ctrlKey: true });
  assert(T.fhActiveTab === "filter", "Ctrl+3 opens the Filtered view");
  assert(T.state.focusRegion === "entries" && T.state.entriesView === "filter", "...and focuses it (entriesView) for arrow-key navigation");

  // Ctrl+4: this node isn't extraction-capable, so position 4 (Table) is
  // disabled — a silent no-op.
  const beforeCtrl4 = { tab: T.fhActiveTab, layout: T.fhLayout };
  fireKeydown(d, w, "4", { ctrlKey: true });
  assert(T.fhActiveTab === beforeCtrl4.tab && T.fhLayout === beforeCtrl4.layout, "Ctrl+4 on a disabled Table slot is a no-op");

  // Enter on an active FILTER node while the tree has focus reveals the Filtered view.
  w.applyFhView("highlight");
  T.state.activeId = filterA.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "filter", "Enter on an active filter node (tree focus) reveals the Filtered view");
  assert(T.state.focusRegion === "entries" && T.state.entriesView === "filter", "...and switches focus to the entries pane");

  // Enter on a FILE node (not a filter) is a no-op for the view switch.
  w.applyFhView("highlight");
  T.state.activeId = f.id;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "Enter");
  assert(T.fhActiveTab === "highlight", "Enter on a file node (not a filter) leaves the Full tab showing");
  assert(T.state.focusRegion === "tree", "...and focus stays on the tree");
});

await withApp(async (w, d, T) => {
  section("72b. Ctrl+1-5 on an extraction-capable node jump positionally (Patterns/Context/Filtered/Table/Plot); in Stacked layout only 1-4 exist (Patterns/Stacked/Table/Plot)");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("filter");

  fireKeydown(d, w, "4", { ctrlKey: true });
  assert(T.fhActiveTab === "table", "Ctrl+4 jumps to position 4 (Table), now that it is enabled");
  fireKeydown(d, w, "5", { ctrlKey: true });
  assert(T.fhActiveTab === "plot", "Ctrl+5 jumps to position 5 (Plot)");
  fireKeydown(d, w, "2", { ctrlKey: true });
  assert(T.fhActiveTab === "highlight", "Ctrl+2 jumps back to position 2 (Context)");

  // Switch to Stacked layout (a Settings choice, not a Ctrl shortcut) — from
  // here the View Selector collapses Context+Filtered into one "Stacked"
  // slot, so there are only 4 positions: Patterns, Stacked, Table, Plot
  // (Patterns moved first 2026-09-26, GROUP 288).
  const layoutSelect = d.querySelector("#settingsFhLayout");
  layoutSelect.value = "stacked";
  layoutSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.fhLayout === "stacked", "sanity: now in Stacked layout");

  fireKeydown(d, w, "3", { ctrlKey: true });
  assert(T.fhActiveTab === "table", "Ctrl+3 in Stacked layout jumps to position 3 (Table)");
  fireKeydown(d, w, "4", { ctrlKey: true });
  assert(T.fhActiveTab === "plot", "Ctrl+4 in Stacked layout jumps to position 4 (Plot)");
  fireKeydown(d, w, "1", { ctrlKey: true });
  assert(T.fhActiveTab === "patterns", "Ctrl+1 in Stacked layout jumps to position 1 (Patterns)");
  const before5 = T.fhActiveTab;
  fireKeydown(d, w, "5", { ctrlKey: true });
  assert(T.fhActiveTab === before5, "Ctrl+5 in Stacked layout is a no-op — only 4 positions exist");
  fireKeydown(d, w, "2", { ctrlKey: true });
  assert(T.fhLayout === "stacked" && !["table", "plot", "patterns"].includes(T.fhActiveTab), "Ctrl+2 in Stacked layout jumps to position 2 (Stacked itself)");
});
