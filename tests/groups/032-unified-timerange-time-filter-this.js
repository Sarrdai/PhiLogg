// GROUP 32 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 32 — Unified "timerange" time filter (this session, person-reported
   follow-up to the drag-select feature above: "I'd like the result as a
   single filter, without the two sub-filters"). Redesigns time filtering
   around one filterType, "timerange", holding both bounds directly as
   `value: { from, to }` (either null = unbounded on that side) — replacing
   the old single-bound "after"/"before" types for every CREATION path
   (drag-select, row context-menu "Filter after/before this row", and the
   new minimap right-click → dialog). "after"/"before" stay in FILTER_TYPES
   purely for backward-compatible READING of already-saved sessions/exports;
   nothing creates them anymore, and editing one through the new dialog
   migrates it to "timerange" (one-way, see updateTimeRangeFilterNode).
   New: a small time-range dialog (create AND edit, unlike the old after/
   before filters which had no edit UI at all) with empty-field-means-
   unbounded fields (no separate infinity checkbox — same convention the
   value-assertion dialog's optional min/max already uses) and a right-click
   on the minimap to open it in create mode, prefilled at the clicked point.
   Covers: legacy after/before nodes still evaluate/tag correctly, F2-edit
   migrates a legacy node in place, row context-menu actions now produce
   unified nodes, tree right-click Edit opens the new dialog for any of the
   three time-filter types, the dialog's own validation (reject empty,
   silently swap a reversed from/to) and Clear buttons, minimap right-click
   creation, and a "timerange" node's value round-tripping through the
   existing generic Save/Load filter JSON machinery unchanged (confirming no
   carrier-specific code was needed beyond adding it to FILTER_TYPES — see
   CLAUDE.md's "Known gotchas" note on filter-node fields).
   ============================================================ */
group(32);
await withApp(async (w, d, T) => {
  section("32. Unified time filter: single \"timerange\" node, editable dialog, migration, minimap right-click");
  const f = await w.addFile("range2.log", makeLog(0, 30), () => {});
  w.render();

  // --- A. Legacy "after"/"before" nodes stay readable (backward compat) ---
  const legacyAfter = w.createFilterNode(f.id, "after", f.entries[10].ts);
  w.render();
  assert(legacyAfter.filterType === "after", "sanity: a directly-created legacy \"after\" node keeps its old filterType (nothing auto-migrates on creation)");
  assert(w.typeTagFor(legacyAfter) === "TIME", "legacy \"after\" node still gets the TIME tag");
  const legacyEntries = w.getEntries(legacyAfter.id);
  assert(legacyEntries.length === f.entries.length - 10 && legacyEntries.every(e => e.ts >= f.entries[10].ts),
    "legacy \"after\" node still filters correctly, got " + legacyEntries.length);

  // --- B. Editing a legacy node (Ctrl+E) migrates it to "timerange" ---
  // (Edit's shortcut moved from F2 to Ctrl+E this session, FEATURE_BACKLOG.md
  // #12, once F2 became Rename — see GROUP 96.)
  T.state.activeId = legacyAfter.id;
  T.state.focusRegion = "tree"; // tree shortcuts apply only with tree focus
  w.render();
  fireKeydown(d, w, "e", { ctrlKey: true });
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "Ctrl+E on a legacy \"after\" node opens the time-range dialog (not the text popup)");
  assert(d.querySelector("#timeRangeFromInput").value !== "", "From is prefilled from the legacy node's value");
  assert(d.querySelector("#timeRangeToInput").value === "", "To starts empty — the legacy \"after\" node had no upper bound");
  w.setTimeRangeDialogBound("to", f.entries[20].ts);
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(legacyAfter.filterType === "timerange", "saving the edit migrates the node to \"timerange\"");
  assert(legacyAfter.value.from === f.entries[10].ts && legacyAfter.value.to === f.entries[20].ts,
    "migrated node's value holds both bounds, got " + JSON.stringify(legacyAfter.value));
  assert(legacyAfter.name.includes(" – "), "migrated node's name shows the span (both bounds), got " + legacyAfter.name);
  assert(T.state.nodes[legacyAfter.id] === legacyAfter, "edit updates the SAME node id in place (not a new node)");

  // --- C. Row context menu "Filter after/before this row" now create unified nodes ---
  // ctxAfter/ctxBefore attach under state.activeId (same as before this
  // session) — reset it to the file so both land as its direct children,
  // rather than under legacyAfter (left active by section B's edit).
  T.state.activeId = f.id;
  const beforeCtxCount = f.children.length;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[3]);
  fireClick(d.querySelector("#ctxAfter"), w);
  const ctxAfterNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.value.to === null);
  assert(ctxAfterNode && ctxAfterNode.value.from === f.entries[3].ts, "\"Filter after this row\" creates a \"timerange\" node with only the lower bound set");
  // createFilterNode leaves the just-created node active — reset back to the
  // file so this second action also lands as its direct child, not nested
  // under ctxAfterNode.
  T.state.activeId = f.id;
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[25]);
  fireClick(d.querySelector("#ctxBefore"), w);
  const ctxBeforeNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.value.from === null);
  assert(ctxBeforeNode && ctxBeforeNode.value.to === f.entries[25].ts, "\"Filter before this row\" creates a \"timerange\" node with only the upper bound set");
  assert(f.children.length === beforeCtxCount + 2, "exactly two new filter children (one per context-menu action), no extra AND/combinator node");

  // --- D. Tree right-click "Edit filter…" on a "timerange" node opens the same dialog ---
  T.state.activeId = ctxAfterNode.id;
  w.render();
  const activeRow = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(activeRow, w);
  const editItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "edit");
  assert(editItem, "tree context menu offers 'Edit filter…' for a \"timerange\" node");
  fireClick(editItem, w);
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "right-click Edit on a \"timerange\" node opens the time-range dialog");
  assert(d.querySelector("#timeRangeToInput").value === "", "To is still empty (unbounded) for this node");
  w.closeTimeRangeDialog();

  // --- E. Dialog validation: both fields empty is rejected, not silently accepted ---
  w.openTimeRangeDialog("create", f.id, { from: null, to: null });
  assert(d.querySelector("#timeRangeDialogError").classList.contains("hidden"), "sanity: no error shown on open");
  const childCountBeforeInvalid = f.children.length;
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(!d.querySelector("#timeRangeDialogError").classList.contains("hidden"), "submitting with both fields empty shows the validation error");
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "dialog stays open on validation failure");
  assert(f.children.length === childCountBeforeInvalid, "no node was created from the invalid (empty) submit");

  // --- F. Clear button empties a field ---
  w.setTimeRangeDialogBound("from", f.entries[0].ts);
  fireClick(d.querySelector("#timeRangeFromClear"), w);
  assert(d.querySelector("#timeRangeFromInput").value === "", "the clear button empties the From field");
  w.closeTimeRangeDialog();

  // --- G. Minimap right-click opens the create dialog prefilled at the clicked point ---
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const svg = d.querySelector("#timelineMinimapSvg");
  const clickX = w.minimapTsToX(f.entries[15].ts);
  svg.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: clickX, clientY: 10 }));
  assert(!d.querySelector("#timeRangeDialog").classList.contains("hidden"), "right-click on the minimap opens the time-range dialog");
  assert(d.querySelector("#timeRangeFromInput").value !== "" && d.querySelector("#timeRangeToInput").value !== "",
    "both fields are prefilled with the clicked point (a valid zero-width starting range)");
  const beforeMinimapCreate = f.children.length;
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(f.children.length === beforeMinimapCreate + 1, "submitting creates exactly one new \"timerange\" filter child");
  const minimapCreated = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.value.from === n.value.to);
  assert(minimapCreated, "the created node has equal from/to (the zero-width prefill was kept, unedited)");

  // --- H. "timerange" round-trips through Save/Load filter JSON unchanged
  // (confirms FILTER_TYPES + the generic `value` passthrough is all that was
  // needed — no carrier-specific code for the new object-shaped value) ---
  const branch = w.serializeFilterBranch(ctxAfterNode.id);
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const fc = await w.addFile("c.log", makeLog(0, 30), () => {});
  w.render();
  W_setLoadTarget(w, fc.id);
  w.importFilterJson(json);
  const importedNode = fc.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange");
  assert(importedNode, "a \"timerange\" node survives a save-to-JSON + load round trip");
  assert(importedNode.value.from === ctxAfterNode.value.from && importedNode.value.to === ctxAfterNode.value.to,
    "the imported node's { from, to } value round-tripped intact, got " + JSON.stringify(importedNode.value));

  // --- I. A reversed From/To on submit is silently swapped, not rejected — same as the minimap drag's own swap ---
  w.openTimeRangeDialog("create", f.id, { from: null, to: null });
  w.setTimeRangeDialogBound("from", f.entries[25].ts);
  w.setTimeRangeDialogBound("to", f.entries[5].ts);
  const beforeSwapCreate = f.children.length;
  fireClick(d.querySelector("#timeRangeDialogSubmit"), w);
  assert(f.children.length === beforeSwapCreate + 1, "a reversed From/To still creates a node (not rejected)");
  const swappedNode = f.children.map(id => T.state.nodes[id])
    .find(n => n.filterType === "timerange" && n.value.from === f.entries[5].ts && n.value.to === f.entries[25].ts);
  assert(swappedNode, "From/To were silently swapped so from <= to");

  function W_setLoadTarget(w, targetId) {
    // loadFilterTargetId is a top-level `let` — reach it via the shared
    // lexical scope the same way the T bridge does, but write instead of read.
    const s = d.createElement("script");
    s.textContent = `loadFilterTargetId = ${JSON.stringify(targetId)};`;
    d.body.appendChild(s);
  }
});
