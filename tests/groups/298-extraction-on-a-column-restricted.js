// GROUP 298 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 298 — Extraction on a column-restricted pattern and array columns:
   a [*] pattern restricted to a JSON Lines column tabulates that column;
   a column of JSON arrays switches between Joined / Per index / Aggregate /
   Explode (header toggle + context menu), persisted as node.arrayViews. */
group(298);
await withApp(async (w, d, T) => {
  section("298a. A pattern restricted to a column is extracted from that column");
  const f = await setup298(w, T);
  const node = w.createFilterNode(f.id, "text", "[*:int]", false, null, false, ["user"]);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 3 && T.extractRowsData.map(r => r.values[0]).join(",") === "7,8,9", "values come from ctx.user, got " + T.extractRowsData.map(r => r.values[0]).join(","));
  assert(T.extractArrayColumns.length === 0, "a scalar column is no array column");
});

await withApp(async (w, d, T) => {
  section("298b. Array column: Joined default, then Per index / Aggregate / Explode via the header toggle and the context menu");
  const f = await setup298(w, T);
  const node = w.createFilterNode(f.id, "text", "[*]", false, null, false, ["motor"]);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractArrayColumns.length === 1 && T.extractArrayColumns[0].maxLen === 4, "the motor column is detected as an array column");
  assert(T.extractRowsData[0].values[0] === "1.2, 1.3, 1.1, 1.4", "Joined is the default view, got " + T.extractRowsData[0].values[0]);
  assert(JSON.stringify(T.extractRowsData[2].arrays[0]) === "[1.22,2.6,1.09]", "rows carry the parsed array");

  const pick = mode => {
    const btn = d.querySelector('#extractHead .extract-array-btn[data-array-col="0"]');
    assert(btn, "the header shows the array toggle");
    fireClick(btn, w);
    const menu = d.querySelector("#extractContextMenu");
    assert(isVisible(menu, w) && !isVisible(d.querySelector("#ctxRenameColumn"), w) && !isVisible(d.querySelector("#ctxExportCsv"), w), "the toggle opens only the array items of the context menu");
    fireClick(menu.querySelector('.ctx-array-view[data-array-mode="' + mode + '"]'), w);
  };
  pick("index");
  let names = T.extractColumns.map(c => c.name);
  assert(names.join(",") === "Index,t (ms),value[0],value[1],value[2],value[3]", "Per index: one column per element, got " + names.join(","));
  const c1 = T.extractColumns.find(c => c.name === "value[1]");
  assert(c1.type === "float" && c1.colIndex < -1000 && w.isPlottableType(c1.type), "element columns are numeric, plottable, with a derived colIndex");
  assert(T.extractRowsData.map(r => r.values[c1.colIndex]).join(",") === "1.3,1.9,2.6", "element values per row");
  assert(T.extractRowsData[2].values[T.extractColumns.find(c => c.name === "value[3]").colIndex] === "", "a shorter array leaves the cell empty");
  assert(T.extractRowsData[0].values.length === 1, "row.values keeps its dense length");
  assert(JSON.stringify(node.arrayViews) === '{"0":"index"}', "stored on the node");

  // The context menu on a derived column's header offers the same items.
  d.querySelector('#extractHead th[data-col="' + c1.colIndex + '"]').dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  const menu = d.querySelector("#extractContextMenu");
  assert(!menu.querySelector('.ctx-array-view[data-array-mode="aggregate"]').classList.contains("hidden") && menu.querySelector('.ctx-array-view[data-array-mode="index"]').classList.contains("active"), "right-click on an element column shows the array views, current one active");
  fireClick(menu.querySelector('.ctx-array-view[data-array-mode="aggregate"]'), w);
  names = T.extractColumns.map(c => c.name);
  assert(names.join(",") === "Index,t (ms),value.len,value.min,value.max,value.avg,value.sum", "Aggregate columns, got " + names.join(","));
  const val = (name, r) => T.extractRowsData[r].values[T.extractColumns.find(c => c.name === name).colIndex];
  assert(val("value.len", 2) === "3" && val("value.max", 1) === "1.9" && val("value.min", 2) === "1.09", "aggregates per row");

  pick("explode");
  assert(T.extractRowsData.length === 11, "Explode: one row per element (4+4+3), got " + T.extractRowsData.length);
  names = T.extractColumns.map(c => c.name);
  assert(names.join(",") === "Index,t (ms),value,value #", "the element column plus its element index, got " + names.join(","));
  const idxCol = T.extractColumns.find(c => c.name === "value #").colIndex;
  const r5 = T.extractRowsData[5];
  assert(r5.entry === f.entries[1] && r5.values[0] === "1.9" && r5.values[idxCol] === "1" && r5.values[-1] === "250", "an exploded row keeps its entry, t(ms) and element index");
  assert(T.extractColumns.find(c => c.colIndex === 0).type === "float", "the exploded column is numeric");

  pick("joined");
  assert(!node.arrayViews && T.extractRowsData.length === 3, "back to Joined removes the stored view");
});

await withApp(async (w, d, T) => {
  section("298c. arrayViews persistence: clone, filter export/import, session cache; sanitizing");
  const f = await setup298(w, T);
  const node = w.createFilterNode(f.id, "text", "[*]", false, null, false, ["motor"]);
  node.arrayViews = { 0: "index" };
  const clone = w.cloneSubtree(node.id, f.id);
  assert(clone && JSON.stringify(clone.arrayViews) === '{"0":"index"}' && clone.arrayViews !== node.arrayViews, "cloneSubtree copies arrayViews");
  const branch = w.serializeFilterBranch(node.id, false);
  assert(JSON.stringify(branch.roots[0].arrayViews) === '{"0":"index"}', "the filter export carries arrayViews");
  const cached = w.serializeFilterTreeForCache(f);
  assert(JSON.stringify(cached).includes('"arrayViews":{"0":"index"}'), "the session cache carries arrayViews");
  assert(JSON.stringify(w.sanitizeArrayViews({ 0: "explode", 1: "explode", 2: "bogus", x: "index", 3: "joined", 4: "aggregate" })) === '{"0":"explode","4":"aggregate"}', "sanitizing keeps valid modes and one explode");
  T.state.activeId = f.id;
  const json = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  const before = f.children.length;
  w.importPhiloggJsonText(json);
  const imported = f.children.length > before ? T.state.nodes[f.children[f.children.length - 1]] : null;
  assert(imported && JSON.stringify(imported.arrayViews) === '{"0":"index"}', "importing the filter file restores arrayViews");
});
