// GROUP extract-column-migration — editing an extraction pattern so its placeholders are inserted,
// removed or reordered re-keys the index-based per-column settings (ignoredColumns, assertions,
// columnRenames, arrayViews, plotConfig refs) on the node and on the views inheriting its pattern,
// inside the edit's one undo step, with one toast only when something moved or was dropped.
// Origin: 2026-10-07 (FEATURE_BACKLOG #21). Data: the log simulator's sensors scenario.
group("extract-column-migration");

if (groupSelected()) {
  const P0 = "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V";
  // 0 word, 1 temperature, 2 pressure, 3 voltage
  async function setup(w, T, d) {
    const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: "sensors", entries: 40, seed: 3 });
    const f = await w.addFile(file.name, file.text, () => {});
    const node = w.createFilterNode(f.id, "text", P0);
    const child = w.createFilterNode(node.id, "level", ["INFO", "WARN", "ERROR", "DEBUG"]);
    node.ignoredColumns = [3];
    node.assertions = { 1: { mode: "range", min: 1, max: 99 }, 2: { mode: "range", min: 0, max: 5 } };
    node.columnRenames = { 2: "Press" };
    node.plotConfig = Object.assign(w.defaultPlotConfig(), { xCol: -1, yCols: [1, 2], colorCol: 2 });
    child.assertions = { 3: { mode: "range", min: 0, max: 400 } };
    child.plotConfig = Object.assign(w.defaultPlotConfig(), { xCol: -1, yCols: [3] });
    T.state.activeId = node.id;
    w.render();
    return { f, node, child };
  }
  // The real edit popup: open it on the node, type the pattern, press Save.
  async function edit(w, d, T, nodeId, pattern) {
    w.openEditFilterPopup(nodeId);
    d.querySelector("#filterInput").value = pattern;
    fireClick(d.querySelector("#filterSubmitBtn"), w);
    assert(d.querySelector("#filterPopup").classList.contains("hidden") || T.state.nodes[nodeId].value === pattern, "the edit was saved");
  }
  const toastText = d => d.querySelector("#copyToast").textContent;

  await withApp(async (w, d, T) => {
    section("extract-column-migration a. a placeholder inserted before a settings column shifts them");
    const { node, child } = await setup(w, T, d);
    const undoBefore = T.undoStack.length;
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C offset=[*:float] pressure=[*:float] bar voltage=[*:float] V");
    const n = T.state.nodes[node.id], c = T.state.nodes[child.id];
    assert(JSON.stringify(n.ignoredColumns) === "[4]", "ignored voltage 3 -> 4, got " + JSON.stringify(n.ignoredColumns));
    assert(Object.keys(n.assertions).join() === "1,3", "assertions: temperature stays 1, pressure 2 -> 3, got " + Object.keys(n.assertions));
    assert(n.assertions[3].max === 5, "the pressure assertion's content moved with it");
    assert(Object.keys(n.columnRenames).join() === "3" && n.columnRenames[3] === "Press", "rename follows pressure");
    assert(JSON.stringify(n.plotConfig.yCols) === "[1,3]" && n.plotConfig.colorCol === 3 && n.plotConfig.xCol === -1, "plot refs re-keyed, synthetic t(ms) untouched: " + JSON.stringify(n.plotConfig));
    assert(Object.keys(c.assertions).join() === "4" && JSON.stringify(c.plotConfig.yCols) === "[4]", "the inheriting child's assertion and plot moved too");
    assert(toastText(d) === "Pattern changed \u2014 settings kept for Press, voltage", "one toast naming the columns whose settings moved, got: " + toastText(d));
    assert(T.undoStack.length === undoBefore + 1, "pattern and settings are ONE undo step");

    section("extract-column-migration b. one Undo restores pattern and settings together; Redo re-applies");
    w.undo();
    const u = T.state.nodes[node.id], uc = T.state.nodes[child.id];
    assert(u.value === P0 && JSON.stringify(u.ignoredColumns) === "[3]" && Object.keys(u.assertions).join() === "1,2" && Object.keys(u.columnRenames).join() === "2", "node restored");
    assert(JSON.stringify(u.plotConfig.yCols) === "[1,2]" && u.plotConfig.colorCol === 2, "plot refs restored");
    assert(Object.keys(uc.assertions).join() === "3" && JSON.stringify(uc.plotConfig.yCols) === "[3]", "child restored");
    w.redo();
    assert(JSON.stringify(T.state.nodes[node.id].ignoredColumns) === "[4]" && Object.keys(T.state.nodes[child.id].assertions).join() === "4", "redo re-applies the shift");
  });

  await withApp(async (w, d, T) => {
    section("extract-column-migration c. a removed placeholder drops its settings, later ones move up");
    const { node, child } = await setup(w, T, d);
    node.assertions[3] = { mode: "range", min: 200, max: 250 };
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C voltage=[*:float] V");
    const n = T.state.nodes[node.id], c = T.state.nodes[child.id];
    assert(Object.keys(n.assertions).join() === "1,2" && n.assertions[2].min === 200, "pressure's assertion dropped, voltage's moved 3 -> 2, got " + JSON.stringify(n.assertions));
    assert(!n.columnRenames, "the removed column's rename is gone");
    assert(JSON.stringify(n.ignoredColumns) === "[2]", "ignored voltage follows it");
    assert(JSON.stringify(n.plotConfig.yCols) === "[1]" && n.plotConfig.colorCol === null, "plot refs to the removed column dropped: " + JSON.stringify(n.plotConfig));
    assert(Object.keys(c.assertions).join() === "2" && JSON.stringify(c.plotConfig.yCols) === "[2]", "child follows voltage");
    assert(toastText(d) === "Pattern changed \u2014 settings kept for voltage \u00b7 dropped for pressure", "toast names moved and dropped columns, got: " + toastText(d));
  });

  await withApp(async (w, d, T) => {
    section("extract-column-migration d. reordered placeholders: each column keeps its settings by its label");
    const { node } = await setup(w, T, d);
    await edit(w, d, T, node.id, "Sensor [*:word] voltage=[*:float] V temperature=[*:float] C pressure=[*:float] bar");
    const n = T.state.nodes[node.id];
    // old 1 temperature -> 2, old 2 pressure -> 3, old 3 voltage -> 1
    assert(Object.keys(n.assertions).join() === "2,3" && n.assertions[3].max === 5, "assertions follow their columns, got " + JSON.stringify(n.assertions));
    assert(JSON.stringify(n.ignoredColumns) === "[1]", "ignored voltage is now column 1");
    assert(n.columnRenames[3] === "Press", "rename follows pressure");
  });

  await withApp(async (w, d, T) => {
    section("extract-column-migration e. unchanged column layout: nothing re-keyed, no toast, plain undo step");
    const { node } = await setup(w, T, d);
    const before = JSON.stringify([node.ignoredColumns, node.assertions, node.columnRenames, node.plotConfig]);
    d.querySelector("#copyToast").textContent = "";
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] volts");
    const n = T.state.nodes[node.id];
    assert(n.value.endsWith("volts"), "the pattern text changed");
    assert(JSON.stringify([n.ignoredColumns, n.assertions, n.columnRenames, n.plotConfig]) === before, "settings untouched");
    assert(!toastText(d).includes("Pattern changed"), "no toast when the layout is the same, got: " + toastText(d));
    // An insertion that touches no setting (nothing keyed by the shifted columns) stays silent too.
    delete n.assertions; delete n.columnRenames; delete n.ignoredColumns; n.plotConfig = w.defaultPlotConfig();
    d.querySelector("#copyToast").textContent = "";
    await edit(w, d, T, node.id, "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] volts extra=[*:int]");
    assert(!toastText(d).includes("Pattern changed"), "nothing to move, no toast, got: " + toastText(d));
  });

  await withApp(async (w, d, T) => {
    section("extract-column-migration f. ignore set toggled in the preview is taken as the new pattern's indices");
    const { node } = await setup(w, T, d);
    w.openEditFilterPopup(node.id);
    const input = d.querySelector("#filterInput");
    input.value = "[*:word] [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert(await waitFor(() => d.querySelectorAll("#filterPatternPreview .preview-value-span").length === 5), "the preview shows the new pattern's five captures");
    fireClick(d.querySelectorAll("#filterPatternPreview .preview-value-span")[1], w); // ignore the new word column
    fireClick(d.querySelector("#filterSubmitBtn"), w);
    const n = T.state.nodes[node.id];
    assert(JSON.stringify([...n.ignoredColumns].sort()) === "[1,4]", "preview showed voltage at 4 (re-keyed live), the toggled set is kept as shown, got " + JSON.stringify(n.ignoredColumns));
    assert(Object.keys(n.assertions).join() === "2,3", "the other settings are still re-keyed, got " + Object.keys(n.assertions));
  });

  section("extract-column-migration g. pure helper: label-first alignment, derived array columns re-based");
  await withApp(async (w, d, T) => {
    const m = (a, b) => JSON.stringify(w.extractColumnMigrationMap(a, b));
    assert(m("a=[*:int] b=[*:int]", "a=[*:int] b=[*:int]") === "null", "identical layout: no map");
    assert(m("a=[*:int] b=[*:int]", "b=[*:int]") === "[-1,0]", "first removed: b follows its label, got " + m("a=[*:int] b=[*:int]", "b=[*:int]"));
    assert(m("a=[*:int] b=[*:int]", "a=[*:int] z=[*:int] b=[*:int]") === "[0,2]", "inserted in the middle");
    assert(m("x=[*:int]", "x=[*:float]") === "null", "a type change in place keeps the column");
    assert(m("x=[*:int]", "y=[*:float]") === "[-1]", "another type under another label is a different column");
    assert(m("[*:int] [*:int]", "[*:int] [*:int] [*:int]") === "[0,1]", "an appended unlabeled column keeps the old ones in place");
    assert(m("plain text", "x=[*:int]") === "null" && m("x=[*:int]", "plain text") === "null", "a non-extraction side never migrates");
    const node = { assertions: {}, arrayViews: { 1: "index" }, columnRenames: { [w.arrayDerivedColIndex(1, 3)]: "ch3" } };
    const tally = { moved: 0, removed: 0, movedBases: new Set(), removedBases: new Set() };
    w.remapColumnSettings(node, [0, 2], tally);
    assert(JSON.stringify(node.arrayViews) === '{"2":"index"}' && node.columnRenames[w.arrayDerivedColIndex(2, 3)] === "ch3", "a derived column's base is re-based, slot kept");
    assert(tally.moved === 2 && tally.removed === 0, "tally " + JSON.stringify(tally));
  });
}
