// GROUP 197 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(197);
await withApp(async (w, d, T) => {
  section("197. Plot settings: inherited-at-creation, persisted for a non-\"text\" node inheriting Table/Plot, and yCols survive a Line<->Scatter round trip");

  const rows = [[0, 0, 0], [50, 25, 5], [100, 50, 10]];
  const log = rows.map(([x, y, z], i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y} z=${z}"`
  ).join("\n") + "\n";
  const f = await w.addFile("plotinherit.log", log, () => {});
  w.render();
  T.state.activeId = f.id;
  const extractNode = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int] z=[*:int]");
  T.state.activeId = extractNode.id;
  w.render();

  /* ---------- 197a. Configure a plot on the extraction node ---------- */
  w.applyFhView("plot");
  d.querySelector("#plotXSelect").value = "0"; d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  fireClick(d.querySelector('#plotYList input[data-col="1"]'), w); // add column 1 alongside the default (column 0) -> yCols = [0,1]
  const eqCb = d.querySelector("#plotAxisEqual");
  fireClick(eqCb, w);
  assert(extractNode.plotConfig.xCol === 0 && extractNode.plotConfig.yCols.length === 2 && extractNode.plotConfig.axisEqual === true,
    "sanity: extraction node's own plot is configured, got " + JSON.stringify(extractNode.plotConfig));

  /* ---------- 197b. A new child inherits a ONE-TIME COPY at creation ---------- */
  const timeChild = w.createFilterNode(extractNode.id, "timerange", { from: rows[0][0], to: null });
  assert(timeChild.plotConfig && JSON.stringify(timeChild.plotConfig) === JSON.stringify(extractNode.plotConfig),
    "a timerange filter created under a plotted extraction node inherits the exact same plot settings at creation, got " + JSON.stringify(timeChild.plotConfig));
  assert(timeChild.plotConfig !== extractNode.plotConfig, "...as an independent deep copy, not a live-shared reference");
  timeChild.plotConfig.axisEqual = false;
  assert(extractNode.plotConfig.axisEqual === true, "editing the child's inherited plot afterward does not leak back into the parent");
  extractNode.plotConfig.xCol = 1;
  assert(timeChild.plotConfig.xCol === 0, "...nor does a later edit on the parent leak forward into the already-created child (one-time copy, not a live link)");

  /* ---------- 197c. Persistence for the inheriting node (filterType "timerange", NOT "text") ---------- */
  T.state.activeId = timeChild.id;
  w.render();
  w.applyFhView("plot"); // opens fine: timeChild inherits Table/Plot from extractNode via findExtractionAncestor/nodeIsExtractionView
  assert(d.querySelector("#plotXSelect"), "the inheriting timerange node's own Plot tab actually renders (view inheritance already worked before this fix)");

  // Copy/paste (cloneSubtree) — previously dropped plotConfig here because
  // the gate was `filterType === "text"`, which a timerange node never is.
  T.state.clipboard = { id: timeChild.id, mode: "copy" };
  T.state.activeId = extractNode.id;
  w.pasteClipboard();
  const pastedId = extractNode.children[extractNode.children.length - 1];
  const pastedChild = T.state.nodes[pastedId];
  assert(pastedChild.plotConfig && JSON.stringify(pastedChild.plotConfig) === JSON.stringify(timeChild.plotConfig),
    "cloneSubtree (copy/paste) now preserves plotConfig on a non-\"text\" node that only inherits its Plot tab, got " + JSON.stringify(pastedChild.plotConfig));

  // Undo/redo (snapshotSubtree/restoreSubtree) — was already correct (no filterType gate there), re-verified live here.
  T.resetUndoRedo();
  w.deleteFilterNodeWithUndo(timeChild.id);
  assert(!T.state.nodes[timeChild.id], "sanity: node gone after delete");
  w.undo();
  const restoredChild = T.state.nodes[timeChild.id];
  assert(restoredChild && restoredChild.plotConfig && JSON.stringify(restoredChild.plotConfig) === JSON.stringify(timeChild.plotConfig),
    "undo restores the deleted timerange node's plotConfig alongside the rest of it");

  // JSON export/import round trip (serializeFilterBranch/importFilterJson via materializeSerializedRoots).
  const branch = w.serializeFilterBranch(restoredChild.id);
  const savedRoot = branch.roots.find(r => r.attach === "target");
  assert(savedRoot && savedRoot.plotConfig && JSON.stringify(savedRoot.plotConfig) === JSON.stringify(restoredChild.plotConfig),
    "serializeFilterBranch now writes plotConfig for a non-\"text\" inheriting node too, got " + JSON.stringify(savedRoot && savedRoot.plotConfig));
  const created = w.materializeSerializedRoots([savedRoot], () => extractNode.id).created;
  assert(created[0].plotConfig && JSON.stringify(created[0].plotConfig) === JSON.stringify(restoredChild.plotConfig),
    "...and materializeSerializedRoots (the shared import/apply path) reads it back correctly");

  // Session-cache round trip (serializeFilterTreeForCache/materializeCachedFilters)
  // — serializes the whole file's tree, so find the timerange descendant
  // (nested under the extraction node's own serialized `children`) by its
  // distinguishing plotConfig value, same as the two copies below it.
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(f);
  const extractSerialized = cacheRoots.find(r => r.filterType === "text");
  const restoredSerialized = extractSerialized.children.find(c => c.filterType === "timerange" && c.plotConfig && c.plotConfig.axisEqual === false);
  assert(restoredSerialized && JSON.stringify(restoredSerialized.plotConfig) === JSON.stringify(restoredChild.plotConfig),
    "serializeFilterTreeForCache now writes plotConfig for a non-\"text\" inheriting node too, got " + JSON.stringify(restoredSerialized && restoredSerialized.plotConfig));

  const cacheFile = { id: w.uid("n"), type: "file", name: "cachefile", children: [], entries: f.entries, cacheKey: "ck-197" };
  T.state.nodes[cacheFile.id] = cacheFile;
  w.materializeCachedFilters(cacheFile, cacheRoots);
  const cacheExtract = cacheFile.children.map(id => T.state.nodes[id]).find(n => n.filterType === "text");
  const cacheChild = cacheExtract.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange" && n.plotConfig && n.plotConfig.axisEqual === false);
  assert(cacheChild && JSON.stringify(cacheChild.plotConfig) === JSON.stringify(restoredChild.plotConfig),
    "materializeCachedFilters (session cache restore) also reads plotConfig back for the inheriting node");

  /* ---------- 197d. Gegenprobe: a plain timerange with no extraction ancestor never gets/keeps a plotConfig ---------- */
  const plainTime = w.createFilterNode(f.id, "timerange", { from: rows[0][0], to: null });
  assert(!plainTime.plotConfig, "a timerange filter with no plotted extraction ancestor inherits nothing (no parent.plotConfig to copy)");
  const plainBranch = w.serializeFilterBranch(plainTime.id);
  const plainSaved = plainBranch.roots.find(r => r.attach === "target");
  assert(!plainSaved.plotConfig, "...and stays that way through export (no Plot tab exists for it either, so this is correctly inert)");

  /* ---------- 197e. yCols survives a Line -> Scatter -> Line round trip (previously destructively truncated) ---------- */
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("plot");
  d.querySelector("#plotXSelect").value = "-2"; d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  extractNode.plotConfig.yCols = [0, 1, 2];
  w.renderPlotControls();
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  assert(extractNode.plotConfig.yCols.length === 1 && extractNode.plotConfig.yCols[0] === 0,
    "switching to Scatter still truncates yCols down to the first column (Scatter only shows one Y series), got " + JSON.stringify(extractNode.plotConfig.yCols));
  fireClick(d.querySelector('.plot-type-btn[data-type="line"]'), w);
  assert(JSON.stringify(extractNode.plotConfig.yCols) === JSON.stringify([0, 1, 2]),
    "...but switching back to Line restores the full original Y selection instead of leaving it stuck on one column, got " + JSON.stringify(extractNode.plotConfig.yCols));
});
