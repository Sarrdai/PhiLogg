// GROUP 62 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 62 — Bugfix: tailing no longer closes an open Plot dropdown
   Origin: this session (person-reported bug, German: "während ein Log im
   Training [Tailing] ist, kann ich die Plots nicht korrekt Bedienen. wenn
   ich das dropdown zur Auswahl einer Datenspalte für z. B die x Werte
   öffne, schließt es sich kurz darauf von selbst"). Root cause:
   renderExtractTable() unconditionally called renderPlotControls() whenever
   the Plot tab was open, and renderPlotControls() unconditionally did
   `plotControls.innerHTML = html` — destroying and recreating #plotXSelect/
   #plotYSelectSingle/etc. every single call, including the ones
   onTailChange() triggers via a plain render() on every tail poll tick
   while a file is being actively written to. A native <select> element
   getting torn down and recreated closes it immediately if it happened to
   be open — exactly the reported symptom. But tailing only ever appends ROW
   data (extractRowsData); it never touches the pattern/columns/plotConfig
   the controls' HTML is actually built from, so the rebuild was pure waste
   even before considering the dropdown-closing side effect. Fixed with a
   simple content-diff guard (`lastPlotControlsHtml`, reset by
   loadPlotConfigForNode() so a genuine node switch always forces a real rebuild):
   since the generated `html` string is a pure function of
   extractColumns/plotConfig, an unchanged string means the rebuild would
   have been a no-op, so it's skipped entirely (DOM identity preserved,
   whatever was open stays open) — same fix shape as every other "known
   gotcha" DOM-identity bug in this codebase (see CLAUDE.md).
   ============================================================ */
group(62);
await withApp(async (w, d, T) => {
  section("62. Bugfix: a tail-triggered re-render while the Plot tab is open no longer tears down (and closes) the axis dropdowns");

  function fakeHandle(initialText) {
    let text = initialText;
    return {
      _setText(t) { text = t; },
      async getFile() {
        const blob = new w.Blob([text]);
        blob.slice = (start) => {
          const sliced = text.slice(start);
          const b = new w.Blob([sliced]);
          b.text = async () => sliced;
          return b;
        };
        return blob;
      },
    };
  }

  const rows = [[0, 0], [10, 10], [20, 20]];
  const log = rows.map(([x, y], i) =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y}"\n`
  ).join("");
  const handle = fakeHandle(log);
  const f = await w.addFile("live.log", log, () => {});
  f.tail = { handle, offset: log.length, pending: "", failed: false, busy: false };
  w.render();

  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 3, "sanity: one extraction row per entry before tailing");

  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSelBefore = d.querySelector("#plotXSelect");
  const ySelBefore = d.querySelector("#plotYSelectSingle");
  assert(xSelBefore && ySelBefore, "sanity: both axis dropdowns rendered");

  // Simulate the dropdown being open: jsdom has no real popup state to
  // assert against directly (no layout/hit-testing — see tests/README.md's
  // "Known gaps"), so DOM node IDENTITY is the correct, general proxy here:
  // a real browser closes an open <select> the instant its element is
  // removed from the document, which `innerHTML = ...` always does. Proving
  // the SAME node survives a tail tick is exactly the condition under which
  // a real dropdown would have stayed open too.
  const appended = `2024-01-15 10:00:03,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 3\t[DoWork]\t"x=30 y=30"\n`;
  handle._setText(log + appended);
  await w.tailTick(); // -> onTailChange() -> render() -> renderExtractTable() -> renderPlotControls()

  assert(T.extractRowsData.length === 4, "sanity: the tail tick actually added a new extraction row (not a no-op tick)");
  assert(d.querySelector("#plotXSelect") === xSelBefore, "X-axis dropdown is the SAME DOM node after a tail tick (not torn down and recreated)");
  assert(d.querySelector("#plotYSelectSingle") === ySelBefore, "Y-axis dropdown is the SAME DOM node after a tail tick");
  assert(d.querySelectorAll("#plotSvg circle.plot-mark").length === 4, "the chart itself DID update to reflect the new tailed row — only the CONTROLS were left untouched, not the data");

  // A second, back-to-back tick with genuinely no new content (the common
  // steady-state case between bursts of log activity) must be just as inert.
  await w.tailTick();
  assert(d.querySelector("#plotXSelect") === xSelBefore, "an empty tail tick (nothing new to append) is also a no-op for the dropdowns");

  // Sanity check the guard isn't overzealous: an actual config change (chart
  // type line -> bar, which drops the Y-axis dropdown entirely for the
  // checkbox list layout) still rebuilds the controls for real.
  fireClick(d.querySelector('.plot-type-btn[data-type="bar"]'), w);
  assert(d.querySelector("#plotXSelect") !== xSelBefore, "a REAL control change (chart type) still rebuilds the DOM — the guard only skips genuinely identical rebuilds");
  assert(d.querySelector("#plotYSelectSingle") === null, "bar chart type actually took effect (no scatter-only Y-select left behind)");
});
