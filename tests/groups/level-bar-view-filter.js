// GROUP level-bar-view-filter — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP level-bar-view-filter — the level chips are a pure view filter
   (Runde C / C2, step 2). A chip click only toggles state.levelFilter and
   narrows the Filtered view; it never creates or edits tree nodes. Counts
   describe the active node. "Add to tree" (#btnApplyLevelToTree) shows only
   while chips are selected, creates / edits (in place) a level node and then
   clears the selection. No Settings control, nothing persisted.
   ============================================================ */
group("level-bar-view-filter");

const lbvChip = (d, l) => d.querySelector('#levelBar .level-btn[data-level="' + l + '"]');
const lbvNodeCount = T => Object.keys(T.state.nodes).length;

await withApp(async (w, d, T) => {
  section("level-bar-view-filter a. A chip click never changes the tree; Filtered view narrows; counts follow the active node");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {}); // 4 ERROR / 16 INFO
  T.state.activeId = f.id;
  w.render();
  const nodesBefore = lbvNodeCount(T);
  fireClick(lbvChip(d, "ERROR"), w);
  assert(lbvNodeCount(T) === nodesBefore && f.children.length === 0 && T.state.activeId === f.id, "no node created, active node unchanged");
  assert(T.state.levelFilter.has("ERROR") && lbvChip(d, "ERROR").classList.contains("active"), "chip is lit and in state.levelFilter");
  assert(T.currentViewEntries.length === 4, "Filtered view narrowed to the 4 ERROR entries, got " + T.currentViewEntries.length);
  fireClick(lbvChip(d, "INFO"), w);
  assert(T.currentViewEntries.length === 20 && f.children.length === 0, "a second chip widens the selection, still no node");
  fireClick(lbvChip(d, "ERROR"), w);
  fireClick(lbvChip(d, "INFO"), w);
  assert(T.state.levelFilter.size === 0 && !lbvChip(d, "ERROR").classList.contains("active"), "toggling both off clears the selection");

  // Counts describe the ACTIVE node, also when it is a level node.
  const lvl = w.createFilterNode(f.id, "level", ["ERROR"]);
  w.render();
  assert(T.state.activeId === lvl.id, "sanity: level node active");
  const count = l => Number(lbvChip(d, l).querySelector(".level-count").textContent.replace(/\./g, ""));
  assert(count("ERROR") === 4 && count("INFO") === 0, "counts are those of the active level node (ERROR 4, INFO 0), got " + count("ERROR") + "/" + count("INFO"));
  assert(!lbvChip(d, "ERROR").classList.contains("active"), "a level node does not light its chip: chips show the view filter only");
});

await withApp(async (w, d, T) => {
  section("level-bar-view-filter b. The selection survives switching tree nodes");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const txt = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = f.id;
  w.render();
  fireClick(lbvChip(d, "ERROR"), w);
  T.state.activeId = txt.id;
  w.render();
  assert(T.state.levelFilter.has("ERROR") && lbvChip(d, "ERROR").classList.contains("active"), "ERROR stays lit on another node");
  assert(T.currentViewEntries.every(e => e.level === "ERROR") && T.currentViewEntries.length > 0, "...and still narrows that node's Filtered view");
  T.state.activeId = f.id;
  w.render();
  assert(lbvChip(d, "ERROR").classList.contains("active"), "...and back on the file");
});

await withApp(async (w, d, T) => {
  section("level-bar-view-filter c. Add to tree: visibility, creation, clears the selection, in-place edit");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();
  const btn = d.querySelector("#btnApplyLevelToTree");
  assert(!isVisible(btn, w), "hidden while nothing is selected");
  fireClick(lbvChip(d, "ERROR"), w);
  assert(isVisible(btn, w) && !btn.disabled, "visible while a chip is selected");
  fireClick(btn, w);
  assert(f.children.length === 1, "creates one level node");
  const node = T.state.nodes[f.children[0]];
  assert(node.filterType === "level" && node.value.join(",") === "ERROR" && T.state.activeId === node.id, "node = ERROR level node, active");
  assert(T.state.levelFilter.size === 0 && !lbvChip(d, "ERROR").classList.contains("active"), "the selection is cleared (the node does the filtering now)");
  assert(!isVisible(btn, w), "the button hides again");
  assert(T.currentViewEntries.length === 4, "Filtered view still shows the 4 ERROR entries (now via the node)");

  fireClick(lbvChip(d, "INFO"), w);
  fireClick(btn, w);
  assert(f.children.length === 1 && T.state.activeId === node.id && T.state.nodes[node.id].value.join(",") === "INFO",
    "with the level node active, Add to tree edits it in place, got " + T.state.nodes[node.id].value.join(","));
  assert(T.state.levelFilter.size === 0, "selection cleared again");
  fireClick(lbvChip(d, "ERROR"), w);
  fireClick(lbvChip(d, "INFO"), w);
  fireClick(btn, w);
  assert(T.state.nodes[node.id].value.join(",") === "ERROR,INFO", "several chips become one node, in the bar's order, got " + T.state.nodes[node.id].value.join(","));
});

await withApp(async (w, d, T) => {
  section("level-bar-view-filter d. No Settings control; the selection is not persisted");
  await waitForFormatConfig(T);
  assert(!d.getElementById("settingsLevelFilterTreeMode"), "no level-bar tree-mode select in Settings");
  assert(!("levelFilterTreeMode" in T), "no levelFilterTreeMode module state");
  assert(w.localStorage.getItem("philogg-level-filter-tree-mode") === null, "no localStorage key is written");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();
  fireClick(lbvChip(d, "ERROR"), w);
  const meta = w.buildCacheMeta();
  assert(meta.settings && meta.settings.levelFilter === undefined, "the session cache does not carry state.levelFilter");
  const doc = w.buildSessionExport([f.id], new Set());
  assert(doc.settings.levelFilter === undefined, "a session export does not carry it either");
});
