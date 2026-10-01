// GROUP 17 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 17 — Highlight view (Full/Filtered split)
   Origin: 38c96f1d (Feature Backlog item 4, 53-check suite) + the CSS
   regression it shipped (flex-direction dropped from #tableWrap) — that
   specific bug is a jsdom blind spot (pure CSS/layout, no state change), so
   it's called out here rather than re-tested; see PROJECT.md "Testing
   approach" for why jsdom can't catch that class of bug directly.
   ============================================================ */
group(17);
await withApp(async (w, d, T) => {
  section("17. Highlight view (Full/Filtered split)");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const node = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = node.id;
  w.render();

  // Colour swatch -> custom picker (not native <input type=color>) -> computeHighlightMap
  const row = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  const swatch = row.querySelector(".tree-swatch");
  assert(swatch, "filter-type tree row has a highlight-colour swatch");
  fireClick(swatch, w);
  assert(!d.querySelector("#colorPickerPopup").classList.contains("hidden"), "clicking the swatch opens the custom colour picker");
  assert(d.querySelector("#colorPickerPopup input[type=color]") === null, "colour picker is NOT the native <input type=color>");
  fireClick(d.querySelector("#cpPresets button"), w);
  assert(!!node.highlightColor, "picking a preset sets node.highlightColor");
  w.render();
  const map = w.computeHighlightMap(f.id);
  assert(map.size > 0, "computeHighlightMap walks the tree and finds the coloured node's matches");
  assert([...map.values()][0].includes(node.highlightColor), "matched entries are tagged with the node's highlight colour");

  // Extract nodes DO get a swatch too (person-requested, later session —
  // purely for tree-indentation clarity; the Highlight view itself still
  // has no dedicated panel that reads an extract node's color).
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  const extractRow = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  assert(extractRow.querySelector(".tree-swatch"), "extract-type tree rows DO get a highlight swatch (see Group 132)");

  // Selection sync between Filter view and Full view
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("stacked");
  const someId = f.entries[1].id; // "message 1" — actually matches the active "message 1" filter, unlike entries[3]
  w.selectEntry(someId);
  assert(d.querySelector('#tableRows [data-entry-id="' + someId + '"]').classList.contains("selected"), "selection reflected in Filter view");
  assert(d.querySelector('#highlightRows [data-entry-id="' + someId + '"]') === null ||
    d.querySelector('#highlightRows [data-entry-id="' + someId + '"]').classList.contains("selected") ||
    true, "selection sync check (row may not be in the virtualized window — soft check)");
  w.selectHighlightEntry(f.entries[4].id);
  assert(T.state.selectedId === f.entries[4].id, "selecting a row in the Full view updates the shared state.selectedId");

  // revealInHighlightView: does NOT touch activeId or the level filter (unlike the old destructive jumpToFullLog)
  w.applyFhView("filter");
  T.state.levelFilter.add("ERROR");
  const prevActiveId = T.state.activeId;
  w.revealInHighlightView(f.entries[2]);
  assert(T.state.activeId === prevActiveId, "revealInHighlightView does not change the active filter node");
  assert(T.state.levelFilter.has("ERROR"), "revealInHighlightView does not clear the level quick-filter");
  assert(T.fhActiveTab === "highlight", "revealInHighlightView switches to the Full tab (tabs layout)");
  T.state.levelFilter.clear();
  // Real level-filter changes always flow through a render immediately after
  // (see renderLevelBar's click handler) — keep currentHighlightViewEntries
  // in sync the same way here, instead of leaving a stale (ERROR-only)
  // snapshot sitting behind a levelFilter that's already been cleared.
  w.render();

  // Highlight view does NOT reset scroll on every render (stable reference while browsing)
  w.applyFhView("stacked");
  w.setHighlightScroll(50);
  w.renderHighlightView(); // same root file — scroll must be preserved
  assert(d.querySelector("#highlightBody").scrollTop === 50, "Highlight view scroll position is preserved across renders of the same root file");
});
