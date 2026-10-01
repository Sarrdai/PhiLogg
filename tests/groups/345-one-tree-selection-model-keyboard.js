// GROUP 345 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 345 — One tree selection model + keyboard shortcuts scoped to the
   focused area (tree vs. log views)
   Origin: 2026-09-30, person-reported: Ctrl+C after clicking a filter copied
   the log line, and Ctrl+click on a second filter after creating one did not
   include the active filter. (A) The active node is always part of the tree
   selection (treeSelectionIds), selected rows look exactly like the active
   row (no frame). (B) state.focusRegion follows the last pointer interaction
   (tree row click / mousedown in #sidebar -> "tree", #content -> "entries");
   tree shortcuts (Ctrl+C/X/V of filters, Delete, F2, Ctrl+E, M, Esc on the
   tree selection) and log shortcuts (row copy, B, Alt+N, Enter, Esc on the
   log selection) only act in their own area. Alt+Arrow and Ctrl+0..5 stay
   global.
   ============================================================ */
group(345);
await withApp(async (w, d, T) => {
  section("345a. Unified tree selection: the active node is part of it, Ctrl+click toggles, one visual style");
  const bar = d.querySelector("#sidebarToolbar");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1"); // createFilterNode -> active, multiSelect empty
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = t1.id; T.state.multiSelect = new Set();
  w.render();
  const rowOf = id => d.querySelector('.tree-row[data-node-id="' + id + '"]');
  const ctrlClick = id => rowOf(id).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  const acts = () => [...bar.querySelectorAll("[data-multi-action]")].map(b => b.dataset.multiAction).join(",");
  assert(w.treeSelectionIds().size === 1 && w.treeSelectionIds().has(t1.id), "treeSelectionIds is just the active node when multiSelect is empty");

  ctrlClick(t2.id);
  assert(w.treeSelectionIds().size === 2 && w.treeSelectionIds().has(t1.id) && w.treeSelectionIds().has(t2.id),
    "Ctrl+click on another filter keeps the ACTIVE filter in the selection: both selected");
  assert(T.state.activeId === t2.id, "the Ctrl+clicked filter becomes active");
  assert(rowOf(t1.id).classList.contains("multi-selected") && rowOf(t2.id).classList.contains("active"), "both rows carry the selected look");
  assert(bar.classList.contains("multi") && acts().includes("and") && acts().includes("or"), "the toolbar offers AND/OR for the 2 selected filters, got " + acts());

  // One visual style: a selected row looks like the active row, without any frame.
  const cs1 = w.getComputedStyle(rowOf(t1.id)), cs2 = w.getComputedStyle(rowOf(t2.id));
  assert(["", "none"].includes(cs1.boxShadow) && ["", "none"].includes(cs2.boxShadow), "no box-shadow frame on selected rows");
  assert(cs1.backgroundColor === cs2.backgroundColor && cs1.borderLeftColor === cs2.borderLeftColor && cs1.color === cs2.color,
    "a selected row has the same background / left border / text colour as the active row");
  assert(!/box-shadow:inset 0 0 0 1\.5px var\(--accent\);\s*\}\s*\/\* The active row is marked/.test(d.documentElement.innerHTML), "the old multi-select frame rule is gone");

  // Ctrl+click on the active node deselects it; active moves to the most recently added remaining one.
  ctrlClick(t2.id);
  assert(T.state.activeId === t1.id && w.treeSelectionIds().size === 1 && !w.treeSelectionIds().has(t2.id),
    "Ctrl+click on the active node removes it; the remaining node becomes active");
  // Ctrl+click on the only selected node is a no-op.
  ctrlClick(t1.id);
  assert(T.state.activeId === t1.id && w.treeSelectionIds().size === 1, "Ctrl+click on the only selected node is a no-op");
  // Ctrl+click on a selected, NON-active node removes just it.
  ctrlClick(t2.id); // select t2 (active), t1 stays
  const t3 = w.createFilterNode(f.id, "text", "message 3");
  T.state.activeId = t2.id; T.state.multiSelect = new Set([t1.id, t2.id]); w.render();
  ctrlClick(t1.id);
  assert(T.state.activeId === t2.id && w.treeSelectionIds().size === 1 && !w.treeSelectionIds().has(t1.id), "Ctrl+click on a selected non-active node drops only that node");
  // A plain click selects just the clicked node.
  T.state.multiSelect = new Set([t1.id, t2.id]); w.render();
  fireClick(rowOf(t3.id), w);
  assert(w.treeSelectionIds().size === 1 && w.treeSelectionIds().has(t3.id), "a plain click leaves just the clicked node selected");
  // Esc with tree focus reduces the selection to the active node.
  T.state.multiSelect = new Set([t1.id, t3.id]); T.state.focusRegion = "tree"; w.render();
  fireKeydown(d, w, "Escape");
  assert(w.treeSelectionIds().size === 1 && w.treeSelectionIds().has(t3.id) && T.state.activeId === t3.id, "Esc (tree focus) reduces the selection to the active node");
});

await withApp(async (w, d, T) => {
  section("345b. Focus: tree shortcuts only with tree focus, log shortcuts only with entries focus");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  w.render();
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  const rowOf = id => d.querySelector('.tree-row[data-node-id="' + id + '"]');

  // Select a log row first, then click a filter: the copy must act on the filter.
  w.selectEntry(f.entries[1].id);
  assert(T.state.focusRegion === "entries" && T.state.selectedId, "sanity: a log row is selected, entries focus");
  fireClick(rowOf(t1.id), w);
  assert(T.state.focusRegion === "tree" && T.state.activeId === t1.id, "clicking a filter row gives the tree focus");
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(T.state.clipboard && T.state.clipboard.id === t1.id && T.state.clipboard.mode === "copy", "Ctrl+C after a filter click copies the filter to the tree clipboard");
  assert(copied === null, "...and does NOT copy the log line");
  T.state.activeId = t2.id; w.render();
  fireKeydown(d, w, "v", { ctrlKey: true });
  assert(Object.values(T.state.nodes).filter(n => n.type === "filter" && n.value === "message 1").length === 2, "Ctrl+V with tree focus pastes the filter");
  fireKeydown(d, w, "x", { ctrlKey: true });
  assert(T.state.clipboard && T.state.clipboard.mode === "cut", "Ctrl+X with tree focus cuts");
  fireKeydown(d, w, "Escape");
  assert(T.state.clipboard === null, "Esc with tree focus clears the tree clipboard");

  // Entries focus: row copy works, the tree clipboard is untouched.
  fireClick(rowOf(f.id), w); w.applyFhView("filter");
  fireClick(d.querySelector("#tableRows .log-row"), w);
  assert(T.state.focusRegion === "entries", "clicking a log row gives the log focus");
  copied = null;
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(copied !== null, "Ctrl+C with entries focus copies the log row");
  assert(T.state.clipboard === null, "...and leaves the tree clipboard alone");
  T.state.clipboard = null;
  // Nothing selected in the log: Ctrl+C does nothing (no fallback to the tree clipboard).
  T.state.selectedId = null; T.state.logMultiSelect = new Set(); copied = null; w.render();
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(T.state.clipboard === null && copied === null, "Ctrl+C with entries focus and nothing selected does nothing");

  // Tree-only shortcuts do nothing with entries focus.
  T.state.activeId = t1.id; T.state.focusRegion = "entries"; w.render();
  const nBefore = Object.keys(T.state.nodes).length;
  fireKeydown(d, w, "Delete");
  assert(T.state.nodes[t1.id], "Delete with entries focus does not delete the active filter");
  fireKeydown(d, w, "F2");
  assert(T.renamingNodeId !== t1.id, "F2 with entries focus does not rename the tree node");
  fireKeydown(d, w, "e", { ctrlKey: true });
  assert(d.querySelector("#filterPopup").classList.contains("hidden"), "Ctrl+E with entries focus does not open the filter editor");
  fireKeydown(d, w, "m");
  assert(!t1.muted, "M with entries focus does not mute the active filter");
  fireKeydown(d, w, "x", { ctrlKey: true });
  fireKeydown(d, w, "v", { ctrlKey: true });
  assert(T.state.clipboard === null && Object.keys(T.state.nodes).length === nBefore, "Ctrl+X / Ctrl+V with entries focus do nothing to the tree");
  // ...and they work with tree focus.
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "m");
  assert(t1.muted === true, "M with tree focus mutes the active filter");
  fireKeydown(d, w, "m");
  fireKeydown(d, w, "F2");
  assert(T.renamingNodeId === t1.id, "F2 with tree focus renames");
  w.render();
  d.activeElement && d.activeElement.blur && d.activeElement.blur();
  T.renamingNodeId = null;
  fireKeydown(d, w, "Delete");
  assert(!T.state.nodes[t1.id], "Delete with tree focus deletes the active filter");

  // Log-only shortcuts do nothing with tree focus.
  w.selectEntry(f.entries[3].id);
  const selId = T.state.selectedId;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "b");
  assert(!T.state.bookmarks.has(selId), "B with tree focus does not bookmark the selected row");
  fireKeydown(d, w, "n", { altKey: true });
  assert(d.querySelector("#noteDialog") === null || d.querySelector("#noteDialog").classList.contains("hidden"), "Alt+N with tree focus does not open the note editor");
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "b");
  assert(T.state.bookmarks.has(selId), "B with entries focus bookmarks the selected row");

  // Esc with entries focus clears the log multi-selection, not the tree.
  T.state.logMultiSelect = new Set([selId]); T.state.clipboard = { id: t2.id, mode: "copy" };
  fireKeydown(d, w, "Escape");
  assert(T.state.logMultiSelect.size === 0 && T.state.clipboard !== null, "Esc with entries focus clears the log selection and leaves the tree clipboard");
});

await withApp(async (w, d, T) => {
  section("345c. Focus follows the mouse; Alt+Arrow / Ctrl+0 / Ctrl+1 stay global");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  T.state.activeId = t1.id; w.render();
  const md = el => el.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  T.state.focusRegion = "entries";
  md(d.querySelector("#sidebar .tree-row"));
  assert(T.state.focusRegion === "tree", "mousedown inside #sidebar gives the tree focus");
  md(d.querySelector("#tableRows .log-row") || d.querySelector("#content"));
  assert(T.state.focusRegion === "entries", "mousedown inside #content gives the log views focus");
  md(d.body);
  assert(T.state.focusRegion === "entries", "mousedown elsewhere leaves the focus alone");

  // Alt+Arrow moves the tree from either region and never changes focusRegion.
  for (const region of ["entries", "tree"]) {
    T.state.focusRegion = region; T.state.activeId = t1.id; w.render();
    fireKeydown(d, w, "ArrowDown", { altKey: true });
    assert(T.state.activeId === t2.id && T.state.focusRegion === region, "Alt+ArrowDown moves the tree from " + region + " focus without changing it");
  }
  // Ctrl+0 -> tree, Ctrl+1 -> entries from both.
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "0", { ctrlKey: true });
  assert(T.state.focusRegion === "tree", "Ctrl+0 focuses the tree from entries focus");
  fireKeydown(d, w, "1", { ctrlKey: true });
  assert(T.state.focusRegion === "entries", "Ctrl+1 focuses the log from tree focus");
  fireKeydown(d, w, "1", { ctrlKey: true });
  assert(T.state.focusRegion === "entries", "Ctrl+1 from entries focus stays on the log");
  // Arrow keys after a filter click move the tree (tree focus).
  fireClick(d.querySelector('.tree-row[data-node-id="' + t1.id + '"]'), w);
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.activeId === t2.id, "plain ArrowDown after a tree click moves the tree selection");
});

// Hidden views: the log-row copy / table-selection copy never fire for a view that is not shown.
await withApp(async (w, d, T) => {
  section("345d. Ctrl+C never copies from a hidden view");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.selectEntry(f.entries[1].id);
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(copied !== null, "sanity: the visible log row is copied");
  copied = null;
  T.state.inlineViewer = { kind: "image", id: "x", name: "x.png" };
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(copied === null, "no log-row copy while an inline viewer hides the log rows");
  T.state.inlineViewer = null;
  T.state.tableSelection = { kind: "cells", rows: [0], cols: [0] };
  w.eval("copyTableSelection = function () { window.__tsCopied = true; }");
  w.__tsCopied = false;
  const wrap = d.querySelector("#extractWrap");
  wrap.style.display = "none";
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(w.__tsCopied === false, "the extraction-table selection is not copied while the table is hidden");
  wrap.style.display = "block";
  fireKeydown(d, w, "c", { ctrlKey: true });
  assert(w.__tsCopied === true, "...but is copied while the table is shown");
});
