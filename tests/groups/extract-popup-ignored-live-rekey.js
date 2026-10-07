// GROUP extract-popup-ignored-live-rekey — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP extract-popup-ignored-live-rekey — the edit popup's preview shows ignored columns
   at their NEW position while the pattern is edited
   Origin: 2026-10-07 (FEATURE_BACKLOG #113). While the ignore set is untouched the
   preview marks the old marks re-keyed through extractColumnMigrationMap (old
   pattern = the node's value at open, new = the input), so what is shown is what
   Save stores (no double re-key). The first toggle takes the shown set as typed.
   Data: the log simulator's sensors scenario.
   ============================================================ */
group("extract-popup-ignored-live-rekey");
if (groupSelected()) {
  const P0 = "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V"; // 0 word, 1 temp, 2 press, 3 volt
  const P1 = "[*:word] [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V"; // a word column inserted: voltage 3 -> 4
  async function setup(w, T) {
    const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: "sensors", entries: 40, seed: 3 });
    const f = await w.addFile(file.name, file.text, () => {});
    const node = w.createFilterNode(f.id, "text", P0);
    node.ignoredColumns = [3];
    T.state.activeId = node.id;
    w.render();
    return node;
  }
  const spans = d => d.querySelectorAll("#filterPatternPreview .preview-value-span");
  const typeInto = async (w, d, text, n) => {
    const input = d.querySelector("#filterInput");
    input.value = text;
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert(await waitFor(() => spans(d).length === n), "preview shows " + n + " captures");
  };
  const ignoredSpans = d => [...spans(d)].map((s, i) => s.classList.contains("chip-ignored") ? i : -1).filter(i => i >= 0);

  await withApp(async (w, d, T) => {
    section("extract-popup-ignored-live-rekey a. untouched set: the mark follows its column in the preview, Save stores exactly that");
    const node = await setup(w, T);
    w.openEditFilterPopup(node.id);
    assert(await waitFor(() => spans(d).length === 4), "preview of the open pattern");
    assert(JSON.stringify(ignoredSpans(d)) === "[3]", "voltage is marked at open, got " + ignoredSpans(d));
    await typeInto(w, d, P1, 5);
    assert(JSON.stringify(ignoredSpans(d)) === "[4]", "the mark moved to voltage (index 4), got " + ignoredSpans(d));
    fireClick(d.querySelector("#filterSubmitBtn"), w);
    assert(JSON.stringify(T.state.nodes[node.id].ignoredColumns) === "[4]", "saved ignore set equals the preview: " + JSON.stringify(T.state.nodes[node.id].ignoredColumns));
  });

  await withApp(async (w, d, T) => {
    section("extract-popup-ignored-live-rekey b. removing the ignored column drops its mark; typing the old pattern back restores it");
    const node = await setup(w, T);
    w.openEditFilterPopup(node.id);
    await typeInto(w, d, "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar", 3);
    assert(ignoredSpans(d).length === 0, "no mark: the ignored column is gone, got " + ignoredSpans(d));
    await typeInto(w, d, P0, 4);
    assert(JSON.stringify(ignoredSpans(d)) === "[3]", "the original mark is back, got " + ignoredSpans(d));
  });

  await withApp(async (w, d, T) => {
    section("extract-popup-ignored-live-rekey c. first toggle takes the shown set as typed (new indices), no second re-key on Save");
    const node = await setup(w, T);
    w.openEditFilterPopup(node.id);
    await typeInto(w, d, P1, 5);
    fireClick(spans(d)[1], w); // ignore the inserted word column; voltage's mark (shown at 4) is kept
    assert(JSON.stringify(ignoredSpans(d)) === "[1,4]", "shown set plus the toggled column, got " + ignoredSpans(d));
    await typeInto(w, d, P1 + " ", 5);
    assert(JSON.stringify(ignoredSpans(d)) === "[1,4]", "once touched, the set stays as typed, got " + ignoredSpans(d));
    fireClick(d.querySelector("#filterSubmitBtn"), w);
    assert(JSON.stringify([...T.state.nodes[node.id].ignoredColumns].sort()) === "[1,4]", "saved as shown: " + JSON.stringify(T.state.nodes[node.id].ignoredColumns));
  });

  await withApp(async (w, d, T) => {
    section("extract-popup-ignored-live-rekey d. unchanged pattern toggles as before; create mode starts empty");
    const node = await setup(w, T);
    w.openEditFilterPopup(node.id);
    await typeInto(w, d, P0, 4);
    fireClick(spans(d)[1], w);
    assert(JSON.stringify(ignoredSpans(d)) === "[1,3]", "toggle on the unchanged pattern, got " + ignoredSpans(d));
    w.closeFilterPopup();
    w.openFilterPopup();
    await typeInto(w, d, P0, 4);
    assert(ignoredSpans(d).length === 0, "a new filter's popup starts with nothing ignored, got " + ignoredSpans(d));
  });
}
