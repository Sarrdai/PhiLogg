// GROUP 157 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 157 — Person-requested (2026-09-02): extraction table columns can
   be renamed — right-click a header -> "Rename column…", or F2 while
   exactly one column is selected (a plain header click). The renamed name
   is a display-only override (node.columnRenames, keyed by the column's
   stable colIndex — the compiled pattern's own token name is untouched)
   applied wherever a column's name is shown: the table header, the
   Extraction Pattern view's chip tooltip, and the Plot view's axis titles/
   legend (all three read names off extractColumns/findExtractColumn,
   which the rename overlay feeds). Threaded through every persistence
   carrier node.assertions already established (cloneSubtree, snapshot/
   restoreSubtree, save/load JSON, session cache).
   ============================================================ */
group(157);
await withApp(async (w, d, T) => {
  section("157a. F2 / right-click renames a column; the new name shows in the header, pattern chip tooltip, and Plot axis title");

  const log = Array.from({ length: 3 }, (_, i) => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${i} y=${i * 2}"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  const compiledName0 = w.findExtractColumn(0).name; // whatever the pattern compiler names it — not asserted on its own, just remembered

  // F2 with no column selected falls through to the tree-node rename (the
  // existing FEATURE_BACKLOG.md #12 behavior) — not the column path.
  T.state.tableSelection = null;
  T.state.focusRegion = "tree";
  fireKeydown(d, w, "F2");
  assert(T.renamingNodeId === node.id, "F2 with no column selected still starts the ordinary tree-node rename");
  fireKeydown(d.querySelector(".tree-rename-input"), w, "Escape");

  // A plain click on column 0's ("x") header selects the whole column —
  // the trigger getSingleSelectedColumn() looks for.
  d.querySelector('th[data-col="0"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  fireKeydown(d, w, "F2");
  let input = d.querySelector(".extract-col-rename-input");
  assert(input && input.dataset.col === "0", "F2 with column 0 selected opens its rename input, got " + (input && input.dataset.col));
  input.value = "MyX";
  fireKeydown(input, w, "Enter");
  assert(node.columnRenames && node.columnRenames[0] === "MyX", "committing the rename writes node.columnRenames keyed by the column's stable colIndex");
  assert(d.querySelector('th[data-col="0"]').textContent.includes("MyX"), "the table header now shows the renamed name");
  assert(w.findExtractColumn(0).name === "MyX", "findExtractColumn (read by everything else — stats, plot, ...) resolves the renamed name too");

  const chip = d.querySelector('#extractPatternView .pattern-chip[data-col="0"]');
  assert(chip.title.startsWith("MyX"), "the Extraction Pattern view's chip tooltip reflects the renamed name, got " + chip.title);

  w.applyFhView("plot");
  let titles = Array.from(d.querySelectorAll("#plotSvg .plot-axis-title")).map(t => t.textContent);
  assert(titles.includes("MyX"), "the Plot view's X axis title uses the renamed name, got " + JSON.stringify(titles));
  w.switchExtractView("table");

  // Right-click -> "Rename column…" on column 1 ("y"), then Escape cancels
  // without committing.
  const th1 = d.querySelector('th[data-col="1"]');
  th1.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  assert(!d.querySelector("#ctxRenameColumn").classList.contains("hidden"), "right-clicking a column header shows 'Rename column…' (hidden for a plain-body right-click)");
  fireClick(d.querySelector("#ctxRenameColumn"), w);
  input = d.querySelector('.extract-col-rename-input[data-col="1"]');
  assert(input, "the context menu opens the same rename input, for column 1 this time");
  input.value = "should not stick";
  fireKeydown(input, w, "Escape");
  assert(!(node.columnRenames && node.columnRenames[1]), "Escape cancels the rename without writing anything");
  assert(d.querySelector('th[data-col="1"]').textContent.includes(w.findExtractColumn(1).name) && !d.querySelector('th[data-col="1"]').textContent.includes("should not stick"),
    "column 1's header is back to its compiled name after Escape");

  // Renaming back to blank clears the override (reverts to the compiled name).
  d.querySelector('th[data-col="0"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  fireKeydown(d, w, "F2");
  input = d.querySelector(".extract-col-rename-input");
  input.value = "  ";
  fireKeydown(input, w, "Enter");
  assert(!node.columnRenames, "renaming to blank/whitespace clears node.columnRenames entirely (only one column was ever renamed)");
  assert(w.findExtractColumn(0).name === compiledName0, "the column is back to its compiled pattern name, got " + w.findExtractColumn(0).name + " expected " + compiledName0);
});

await withApp(async (w, d, T) => {
  section("157c. A re-render mid-rename (e.g. a live-tailed file's onTailChange -> render()) does not blur/cancel the in-progress edit");

  const log = Array.from({ length: 3 }, (_, i) => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${i} y=${i * 2}"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  d.querySelector('th[data-col="0"]').dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  fireKeydown(d, w, "F2");
  let input = d.querySelector(".extract-col-rename-input");
  assert(input && input.dataset.col === "0", "rename input for column 0 is showing");
  input.value = "WIP";
  // Simulate a tail tick's re-render landing while the user is mid-edit —
  // it must not tear down/rebuild the focused input (a detached input fires
  // "blur" synchronously, which would otherwise commit/cancel the rename
  // before the user finished typing).
  w.renderExtractTable(node);
  input = d.querySelector(".extract-col-rename-input");
  assert(input && input.dataset.col === "0" && input.value === "WIP" && d.activeElement === input,
    "the same rename input survives a re-render mid-edit, keeping its in-progress value and focus");
  fireKeydown(input, w, "Enter");
  assert(node.columnRenames && node.columnRenames[0] === "WIP", "the rename still commits normally afterward");
});

await withApp(async (w, d, T) => {
  section("157b. Column renames persist: copy/paste, undo, save/load JSON, session cache");

  const log = Array.from({ length: 3 }, (_, i) => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${i} y=${i * 2}"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.renameColumn(node, 0, "MyX");
  w.renameColumn(node, 1, "MyY");
  assert(node.columnRenames[0] === "MyX" && node.columnRenames[1] === "MyY", "sanity: both columns renamed directly via renameColumn");

  /* ---------- Copy/paste (cloneSubtree) ---------- */
  T.state.clipboard = { id: node.id, mode: "copy" };
  T.state.activeId = f.id;
  w.pasteClipboard();
  const pastedId = f.children[f.children.length - 1];
  const pasted = T.state.nodes[pastedId];
  assert(pasted.columnRenames && pasted.columnRenames[0] === "MyX" && pasted.columnRenames[1] === "MyY",
    "the pasted copy's columnRenames matches the original's");
  assert(pasted.columnRenames !== node.columnRenames, "...as an independent deep copy, not a shared reference");
  w.renameColumn(pasted, 0, "EditedOnCopy");
  assert(node.columnRenames[0] === "MyX", "editing the copy's rename afterward leaves the original untouched");

  /* ---------- Undo/redo (snapshotSubtree/restoreSubtree) ---------- */
  T.resetUndoRedo();
  w.deleteFilterNodeWithUndo(node.id);
  assert(!T.state.nodes[node.id], "sanity: node gone after delete");
  w.undo();
  const restored = T.state.nodes[node.id];
  assert(restored && restored.columnRenames && restored.columnRenames[0] === "MyX" && restored.columnRenames[1] === "MyY",
    "undo restores the deleted node's columnRenames alongside the rest of it");

  /* ---------- Filter save/load JSON round trip ---------- */
  const branch = w.serializeFilterBranch(node.id);
  const savedRoot = branch.roots.find(r => r.attach === "target");
  assert(savedRoot && savedRoot.columnRenames && savedRoot.columnRenames[0] === "MyX", "serializeFilterBranch writes columnRenames into the saved JSON");
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
  assert(loaded.columnRenames && loaded.columnRenames[0] === "MyX" && loaded.columnRenames[1] === "MyY",
    "columnRenames travels through filter save/load JSON (sanitized via sanitizeColumnRenames on the way in)");

  // A hand-edited/foreign file can't smuggle in a garbage rename map — a
  // non-string value, a non-integer key, or an all-whitespace name are all
  // dropped, same "filter to known-good values" stance sanitizePlotConfig
  // already takes for plotConfig.
  const dirtyBranch = JSON.parse(JSON.stringify(branch));
  dirtyBranch.roots.find(r => r.attach === "target").columnRenames = { 0: "  ", 1: 42, notanumber: "Bad", 2: "GoodOne" };
  const dirtyJson = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: dirtyBranch.activeRef, roots: dirtyBranch.roots });
  const beforeChildren2 = anchor.children.length;
  w.importFilterJson(dirtyJson);
  const loadedDirty = T.state.nodes[anchor.children[anchor.children.length - 1]];
  assert(anchor.children.length === beforeChildren2 + 1 && loadedDirty, "sanity: the dirty import still created a node");
  assert((!loadedDirty.columnRenames || !loadedDirty.columnRenames[0]) && (!loadedDirty.columnRenames || !loadedDirty.columnRenames[1]),
    "a blank name and a non-string name are both dropped by the import sanitizer");
  assert(loadedDirty.columnRenames && loadedDirty.columnRenames[2] === "GoodOne", "a genuinely valid entry in the same map still survives");

  /* ---------- Session cache serialization ---------- */
  const { roots } = w.serializeFilterTreeForCache(f);
  const serializedNode = roots.find(r => r.filterType === "text" && r.columnRenames && r.columnRenames[0] === "MyX");
  assert(serializedNode, "serializeFilterTreeForCache writes columnRenames for an extraction-capable 'text' node");
  const cacheFile = { id: w.uid("n"), type: "file", name: "cachefile", children: [], entries: f.entries, cacheKey: "ck1" };
  T.state.nodes[cacheFile.id] = cacheFile;
  w.materializeCachedFilters(cacheFile, roots);
  const restoredFromCache = cacheFile.children.map(id => T.state.nodes[id]).find(n => n.filterType === "text" && n.columnRenames && n.columnRenames[0] === "MyX");
  assert(restoredFromCache && restoredFromCache.columnRenames[1] === "MyY", "materializeCachedFilters restores columnRenames from the session-cache round trip");
});
