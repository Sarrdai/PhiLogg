// GROUP 126 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 126 — Plot config persists per extraction node (person-requested,
   this session: "Die Plots sollen ihren Zustand behalten. Ich möchte einen
   Plot verlassen und später wieder hineinschauen können und dann den
   gleichen Plot sehen. Auch wenn ich einen Extraction Knoten kopiere,
   möchte ich das er den gleichen Plot erzeugt."). Previously the entire
   plot definition (chart type, axes, color-by, axis-equal, ranges) lived in
   one shared global reset to defaults on every node switch, including a
   switch back to the SAME node. It now lives on the node itself
   (node.plotConfig, extract-only, lazily created — see
   philogg.html's loadPlotConfigForNode), threaded through the same four
   persistence carriers CLAUDE.md's gotcha requires for any new filter-node
   field: cloneSubtree, snapshotSubtree/restoreSubtree, serializeFilterBranch/
   importFilterJson, serializeFilterTreeForCache/materializeCachedFilters.
   Zoom/pan/rotation stay ephemeral view state, unaffected by this — only the
   plot's actual definition is now remembered.
   ============================================================ */
group(126);
await withApp(async (w, d, T) => {
  section("126. Plot config persists per extraction node (leave/return, copy, undo, save/load, session cache)");

  const rows = [[0, 0, 0], [50, 25, 5], [100, 50, 10]];
  const log = rows.map(([x, y, z], i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y} z=${z}"`
  ).join("\n") + "\n";
  const f = await w.addFile("persist3d.log", log, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int] z=[*:int]");
  T.state.activeId = node.id;
  w.render();

  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="3d"]'), w);
  d.querySelector("#plotXSelect").value = "0"; d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1"; d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotZSelect").value = "2"; d.querySelector("#plotZSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  const eqSel = d.querySelector("#plotAxisEqual3d");
  eqSel.value = "all"; eqSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const xMaxInput = d.querySelector("#plotXMax");
  xMaxInput.value = "80"; xMaxInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(node.plotConfig && node.plotConfig.type === "3d" && node.plotConfig.xCol === 0 && node.plotConfig.zCol === 2
    && node.plotConfig.axisEqual3d === "all" && node.plotConfig.xMax === "80",
    "the configured plot lives on the node itself (node.plotConfig), not just a detached global");

  /* ---------- Leave the plot (switch to a different node/view) and come back ---------- */
  T.state.activeId = f.id;
  w.render(); // "leaving" — the file's own (table) view, no Plot tab at all
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  assert(T.plotConfig.type === "3d" && T.plotConfig.xCol === 0 && T.plotConfig.yCols[0] === 1 && T.plotConfig.zCol === 2
    && T.plotConfig.axisEqual3d === "all" && T.plotConfig.xMax === "80",
    "returning to the SAME extraction's Plot tab shows the exact same plot again, with no re-selection needed");
  assert(d.querySelector('.plot-type-btn[data-type="3d"]').classList.contains("active"), "the 3D type button is shown active again on return, matching the remembered config");
  assert(d.querySelector("#plotAxisEqual3d").value === "all", "the axis-equal-mode select shows the remembered value again on return");
  assert(d.querySelector("#plotXMax").value === "80", "the manual X-max range input shows the remembered value again on return");

  /* ---------- Copying the extraction node reproduces the same plot ---------- */
  T.state.clipboard = { id: node.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pastedId = f.children[f.children.length - 1];
  const pasted = T.state.nodes[pastedId];
  assert(pasted.plotConfig && JSON.stringify(pasted.plotConfig) === JSON.stringify(node.plotConfig),
    "the pasted copy's plotConfig matches the original's exactly, got " + JSON.stringify(pasted.plotConfig));
  assert(pasted.plotConfig !== node.plotConfig && pasted.plotConfig.yCols !== node.plotConfig.yCols,
    "...as an independent deep copy, not a shared reference (editing one must not edit the other)");

  T.state.activeId = pasted.id;
  w.render();
  w.applyFhView("plot");
  assert(d.querySelector('.plot-type-btn[data-type="3d"]').classList.contains("active")
    && d.querySelector("#plotZSelect").value === "2" && d.querySelector("#plotAxisEqual3d").value === "all",
    "opening the pasted copy's own Plot tab reproduces the exact same plot, unprompted");

  // Editing the copy afterward must not leak back into the original.
  const eqSel2 = d.querySelector("#plotAxisEqual3d");
  eqSel2.value = "off"; eqSel2.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(pasted.plotConfig.axisEqual3d === "off" && node.plotConfig.axisEqual3d === "all",
    "changing the copy's axis-equal mode leaves the original extraction's own plot untouched");

  /* ---------- Persistence: undo/redo (snapshotSubtree/restoreSubtree) ---------- */
  T.resetUndoRedo();
  w.deleteFilterNodeWithUndo(node.id);
  assert(!T.state.nodes[node.id], "sanity: node gone after delete");
  w.undo();
  const restored = T.state.nodes[node.id];
  assert(restored && restored.plotConfig && restored.plotConfig.type === "3d" && restored.plotConfig.axisEqual3d === "all" && restored.plotConfig.xMax === "80",
    "undo restores the deleted node's plotConfig alongside the rest of it");

  /* ---------- Persistence: filter save/load JSON round trip ---------- */
  const branch = w.serializeFilterBranch(node.id);
  const savedRoot = branch.roots.find(r => r.attach === "target");
  assert(savedRoot && savedRoot.plotConfig && savedRoot.plotConfig.type === "3d" && savedRoot.plotConfig.axisEqual3d === "all",
    "serializeFilterBranch writes plotConfig into the saved JSON");
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const anchor = w.createFilterNode(f.id, "text", "id=");
  w.render();
  const loadScript = d.createElement("script");
  loadScript.textContent = `loadFilterTargetId = ${JSON.stringify(anchor.id)};`;
  d.body.appendChild(loadScript);
  const beforeChildren = anchor.children.length;
  w.importFilterJson(json);
  assert(anchor.children.length === beforeChildren + 1, "load creates the extract node under the target anchor");
  const loaded = T.state.nodes[anchor.children[anchor.children.length - 1]];
  assert(loaded.plotConfig && loaded.plotConfig.type === "3d" && loaded.plotConfig.zCol === 2 && loaded.plotConfig.axisEqual3d === "all" && loaded.plotConfig.xMax === "80",
    "plotConfig travels through filter save/load JSON (sanitized via sanitizePlotConfig on the way in)");

  /* ---------- Persistence: session cache serialization ---------- */
  const { roots } = w.serializeFilterTreeForCache(f);
  const serializedNode = roots.find(r => r.filterType === "text" && r.plotConfig && r.plotConfig.axisEqual3d === "all" && r.plotConfig.xMax === "80");
  assert(serializedNode, "serializeFilterTreeForCache writes plotConfig for an extraction-capable 'text' node");

  const cacheFile = { id: w.uid("n"), type: "file", name: "cachefile", children: [], entries: f.entries, cacheKey: "ck1" };
  T.state.nodes[cacheFile.id] = cacheFile;
  w.materializeCachedFilters(cacheFile, roots);
  const restoredFromCache = cacheFile.children.map(id => T.state.nodes[id]).find(n => n.filterType === "text" && n.plotConfig && n.plotConfig.axisEqual3d === "all");
  assert(restoredFromCache && restoredFromCache.plotConfig.xMax === "80" && restoredFromCache.plotConfig.zCol === 2,
    "materializeCachedFilters restores plotConfig from the session-cache round trip");

  /* ---------- sanitizePlotConfig rejects a corrupt/foreign value ---------- */
  const badJson = JSON.stringify({
    format: "philogg-filters", version: 2, activeRef: null,
    roots: [{ ref: 1, filterType: "text", name: "bad", inverted: false, children: [], value: "n=[*:int]", attach: "target",
      plotConfig: { type: "not-a-real-type", xCol: "not-a-number", yCols: "not-an-array", axisEqual3d: "bogus" } }],
  });
  // Switch back to the Table view first: importFilterJson makes the newly
  // created node active and calls render(), and with the Plot tab left open
  // that would immediately auto-pick X/Y defaults on top of the sanitized
  // result (same normal first-open behavior any fresh extraction gets) —
  // switching away first isolates what sanitizePlotConfig itself produced.
  w.switchExtractView("table");
  const anchor2 = w.createFilterNode(f.id, "text", "id=");
  w.render();
  const loadScript2 = d.createElement("script");
  loadScript2.textContent = `loadFilterTargetId = ${JSON.stringify(anchor2.id)};`;
  d.body.appendChild(loadScript2);
  w.importFilterJson(badJson);
  const loadedBad = T.state.nodes[anchor2.children[anchor2.children.length - 1]];
  assert(loadedBad.plotConfig.type === "line" && loadedBad.plotConfig.xCol === null && Array.isArray(loadedBad.plotConfig.yCols) && loadedBad.plotConfig.yCols.length === 0
    && loadedBad.plotConfig.axisEqual3d === "off",
    "sanitizePlotConfig falls back to safe defaults for every unrecognized/malformed field instead of trusting a hand-edited or foreign file, got " + JSON.stringify(loadedBad.plotConfig));
});
