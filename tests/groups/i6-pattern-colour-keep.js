// GROUP i6-pattern-colour-keep — loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP i6-pattern-colour-keep — Round I, package I6 (small fixes), items 5, 6, 10
   Origin: 2026-10-09 (desktop usability test, Latte; data: simulator sensors).
   5. Editing an extraction pattern so placeholders move: the toast names the
      columns instead of counting settings ("Pattern changed — settings kept
      for temperature").
   6. A column's colour (plot series, chips, stats) stays with the column's
      compiled name: inserting a placeholder before "temperature" no longer
      turns its series from one palette colour into another.
   10. Plot column chip on a word column: "Keep only “<value of the selected
      row>”" replaces that placeholder by the literal value (one undoable
      pattern edit), next to "Ignore column"; disabled without a selected row
      or when it is the only placeholder. (A small step towards FEATURE_BACKLOG
      #127, which stays in the backlog.)
   ============================================================ */
group("i6-pattern-colour-keep");

if (groupSelected()) {
  const P0 = "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V";
  const PALETTE = ["#4fc7c3", "#c792ea", "#e8a94a", "#6fa8ff", "#f0708a", "#8bd17c"];
  async function setup(w, T, d, view) {
    const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: "sensors", entries: 60, seed: 3 });
    const f = await w.addFile(file.name, file.text, () => {});
    const node = w.createFilterNode(f.id, "text", P0);
    T.state.activeId = node.id;
    w.render();
    if (view) w.applyFhView(view);
    return { f, node };
  }
  async function edit(w, d, T, nodeId, pattern) {
    w.openEditFilterPopup(nodeId);
    d.querySelector("#filterInput").value = pattern;
    fireClick(d.querySelector("#filterSubmitBtn"), w);
  }
  const toastText = d => d.querySelector("#copyToast").textContent;

  await withApp(async (w, d, T) => {
    section("i6-pattern-colour-keep a. toast names the columns (kept / dropped), singular and plural");
    const { node } = await setup(w, T, d, "table");
    node.columnRenames = { 2: "Press" };
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C offset=[*:float] pressure=[*:float] bar voltage=[*:float] V");
    assert(toastText(d) === "Pattern changed — settings kept for Press", "only the column that has a setting is named, by its display name, got: " + toastText(d));
    w.undo();
    node.assertions = { 3: { mode: "range", min: 0, max: 400 } };
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V extra=[*:int]");
    assert(!/Pattern changed/.test(toastText(d)) || /kept for/.test(toastText(d)), "an appended placeholder moves nothing");
    d.querySelector("#copyToast").textContent = "";
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C voltage=[*:float] V");
    assert(toastText(d) === "Pattern changed — settings kept for voltage · dropped for pressure", "moved and dropped, got: " + toastText(d));
    assert(w.patternChangedToastText({ movedNames: ["a", "b", "c", "d", "e"], removedNames: [] }) === "Pattern changed — settings kept for a, b, c +2 more", "more than three names are cut");
    assert(w.patternChangedToastText({ movedNames: [], removedNames: ["x"] }) === "Pattern changed — dropped for x", "only dropped");
  });

  await withApp(async (w, d, T) => {
    section("i6-pattern-colour-keep b. a column keeps its colour when a placeholder is inserted before it");
    const { node } = await setup(w, T, d, "table");
    const before = [0, 1, 2, 3].map(i => w.columnColor(i));
    assert(before.join() === PALETTE.slice(0, 4).join(), "initial colours are the index colours, got " + before);
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C offset=[*:float] pressure=[*:float] bar voltage=[*:float] V");
    w.applyFhView("table");
    // temperature stays 1; offset is new at 2; pressure 2 -> 3; voltage 3 -> 4
    assert(w.columnColor(1) === before[1], "temperature keeps its colour");
    assert(w.columnColor(3) === before[2], "pressure (now column 3) keeps its colour");
    assert(w.columnColor(4) === before[3], "voltage (now column 4) keeps its colour");
    const all = [0, 1, 2, 3, 4].map(i => w.columnColor(i));
    assert(new Set(all).size === 5, "every column has its own colour: " + all);
    // Reordering: the colours follow the names too.
    await edit(w, d, T, node.id, "Sensor [*:word] voltage=[*:float] V temperature=[*:float] C pressure=[*:float] bar");
    w.applyFhView("table");
    assert(w.columnColor(2) === before[1] && w.columnColor(3) === before[2] && w.columnColor(1) === before[3], "reordered: colours follow the names");
    // Undo brings the old layout back with the old colours.
    w.undo();
    w.applyFhView("table");
    assert(w.columnColor(3) === before[2] && w.columnColor(1) === before[1], "undo: colours still by name");
    // Synthetic columns keep the index colour.
    assert(w.columnColor(-1) === PALETTE[5] && w.columnColor(-2) === PALETTE[4], "t(ms)/Index: plain index colour");
  });

  await withApp(async (w, d, T) => {
    section("i6-pattern-colour-keep c. Plot chip: 'Keep only <value>' on a word column");
    const { node } = await setup(w, T, d, "plot");
    const menu = ci => w.plotRoleMenuItems(ci);
    const keepOf = ci => menu(ci).find(i => /^Keep only/.test(i.t));
    let k = keepOf(0);
    assert(!!k && k.dis && k.note === "select a row", "no selected row: the item is listed but disabled ('select a row')");
    const idx = menu(0).findIndex(i => /Ignore column/.test(i.t));
    assert(idx >= 0 && /^Keep only/.test(menu(0)[idx + 1].t), "right after 'Ignore column'");
    assert(!keepOf(1), "a float column has no 'Keep only'");
    const row = w.eval("extractRowsData")[0];
    const val = row.values[0];
    assert(/^T\d/.test(val), "the word column holds a sensor name from the simulator, got " + val);
    T.state.selectedId = row.entry.id;
    w.render();
    k = keepOf(0);
    assert(!k.dis && k.t === "Keep only “" + val + "”", "the item names the selected row's value, got " + k.t);
    const undoBefore = T.undoStack.length;
    k.fn();
    const n = T.state.nodes[node.id];
    assert(n.value === "Sensor " + val + " temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V", "the placeholder became the literal, got " + n.value);
    assert(T.undoStack.length === undoBefore + 1, "one undo step");
    const shown = w.eval("extractRowsData");
    assert(shown.length > 0 && shown.every(r => r.entry.message.includes("Sensor " + val + " ")), "only rows with that value remain (" + shown.length + ")");
    assert(w.eval("lastPatternViewArgs[1]").length === 3, "three placeholders remain");
    w.undo();
    assert(T.state.nodes[node.id].value === P0, "undo restores the pattern");
  });

  await withApp(async (w, d, T) => {
    section("i6-pattern-colour-keep d. 'Keep only' is refused for the only placeholder");
    const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: "sensors", entries: 60, seed: 3 });
    const f = await w.addFile(file.name, file.text, () => {});
    const node = w.createFilterNode(f.id, "text", "Sensor [*:word]");
    T.state.activeId = node.id;
    w.render();
    w.applyFhView("plot");
    T.state.selectedId = w.eval("extractRowsData")[0].entry.id;
    w.render();
    const k = w.plotRoleMenuItems(0).find(i => /^Keep only/.test(i.t));
    assert(!!k && k.dis && k.note === "only column", "disabled, 'only column'");
    w.keepOnlyColumnValue(T.state.nodes[node.id], 0, "T1");
    assert(T.state.nodes[node.id].value === "Sensor [*:word]", "the direct call leaves the pattern alone as well");
  });
}
