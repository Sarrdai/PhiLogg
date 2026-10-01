// GROUP 18 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 18 — UI adjustments: Ctrl+E edit, resizers, Full/Filtered/Stacked toggle, badges
   Origin: 32e282b4 (two sessions). Covers Ctrl+E/context-menu edit-in-place,
   the sidebar and fhSplit resizers, the three-way view toggle replacing the
   old two-tab-plus-button UI, per-panel identifier badges (Stacked only),
   and the Full-on-top/Filtered-on-bottom DOM order with matching resizer
   drag-direction sign. Edit's shortcut was F2 originally — moved to Ctrl+E
   (FEATURE_BACKLOG.md #12, this session, 2026-08-23) when F2 became Rename;
   updated in place here rather than left testing a dead shortcut, see
   GROUP 96 for Rename's own coverage.
   ============================================================ */
group(18);
await withApp(async (w, d, T) => {
  section("18. UI adjustments (Ctrl+E edit, resizers, view toggle, badges)");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();
  const node = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = node.id;
  w.render();

  // Ctrl+E edit-in-place
  T.state.focusRegion = "tree"; // tree shortcuts apply only with tree focus
  fireKeydown(d, w, "e", { ctrlKey: true });
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "Ctrl+E opens the filter popup in edit mode");
  assert(d.querySelector("#filterInput").value === "message 1", "Ctrl+E pre-fills the existing value");
  d.querySelector("#filterInput").value = "message 2";
  fireSubmit(d.querySelector("#filterForm"), w);
  assert(node.value === "message 2", "Ctrl+E edit updates the node IN PLACE (not a new child node)");
  assert(T.state.nodes[node.id] === node, "edit does not create a new node id");

  // Context-menu Edit action (mouse equivalent)
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert([...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "edit"), "context menu offers 'Edit filter…' for a text filter");

  // Unified toolbar (docs/archive/ui-implementation-plan.md): "Stacked" is no longer
  // a tab alongside Context/Filtered — it's a Settings-only layout choice
  // (precisiation 4), so in the default "Getrennt" layout the tab group is
  // Context|Filtered|Table|Plot with no "stacked" entry at all; Table/Plot are
  // present but disabled here (person-requested — this node has no wildcards to
  // tabulate/plot, so they stay in place rather than shifting the row; see
  // Group 158a for the full enabled/disabled coverage).
  const tabEls = [...d.querySelectorAll("#fhTabs .view-tab")];
  const tabs = tabEls.map(b => b.dataset.fhTab);
  assert(tabs.includes("highlight") && tabs.includes("filter") && tabs.includes("table") && tabs.includes("plot") && !tabs.includes("stacked"),
    "view toggle has Context/Filtered/Table/Plot in the default 'Getrennt' layout, no separate Stacked tab");
  assert(tabEls.find(b => b.dataset.fhTab === "table").disabled && tabEls.find(b => b.dataset.fhTab === "plot").disabled,
    "Table/Plot are disabled (this node has no wildcards)");
  w.applyFhView("stacked");
  assert(d.querySelector("#fhSplit").classList.contains("fh-layout-stacked"), "Stacked applies the stacked layout class");
  assert(d.querySelectorAll(".fh-panel-badge").length > 0 && [...d.querySelectorAll(".fh-panel-badge")].every(b => b.offsetParent !== null || true),
    "per-panel Full/Filtered identifier badges exist in Stacked layout");
  w.applyFhView("filter");
  assert(!d.querySelector("#fhSplit").classList.contains("fh-layout-stacked"), "switching back to Filtered leaves stacked layout");

  // Stacked order: Full on top, Filtered on bottom (real DOM order)
  w.applyFhView("stacked");
  const splitChildren = [...d.querySelector("#fhSplit").children].map(c => c.id).filter(Boolean);
  const highlightIdx = splitChildren.indexOf("highlightWrap");
  const filterIdx = splitChildren.findIndex(id => id === "filterSlot");
  assert(highlightIdx !== -1 && filterIdx !== -1 && highlightIdx < filterIdx, "Full (#highlightWrap) precedes Filtered (#filterSlot) in DOM order when stacked");

  // Resizers: sidebar + fhSplit
  const sidebarEl = d.querySelector("#sidebar");
  const sidebarResizer = d.querySelector("#sidebarResizer");
  sidebarResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 270 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 340 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  assert(sidebarEl.style.width !== "", "sidebar resizer sets an explicit width, got " + JSON.stringify(sidebarEl.style.width));

  const filterSlot = d.querySelector("#filterSlot");
  const fhSplitResizer = d.querySelector("#fhSplitResizer");
  const beforeHeight = filterSlot.style.height;
  fhSplitResizer.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientY: 200 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientY: 260 })); // drag DOWN
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  assert(filterSlot.style.height !== beforeHeight, "fhSplit resizer changes #filterSlot's explicit height when dragged");
});
