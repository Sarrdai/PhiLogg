// GROUP 42 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 42 — Extraction table: synthetic Index + t(ms) columns
   Origin: this session (2026-08-17), person-requested, with a same-day
   correction: the elapsed-time column was originally shipped as a
   row-to-row delta ("ΔT"), which the person immediately flagged as wrong
   for plotting — *"deltaT macht so keinen Sinn für einen zeitlichen Plot.
   Der erste Eintrag müsste 0 haben, der Rest dann die bis dahin
   aufsummierten deltaT."* A per-step delta can't serve as a plot X value
   (row N's axis position would depend on every prior row's spacing, not
   its own value); the fix makes it CUMULATIVE elapsed time since the
   FIRST entry (0 on row 0, then running total) — renamed "t (ms)" to
   match, since it's no longer a delta. Every extraction table leads with
   two synthetic columns ahead of the pattern's own (INDEX_COL = -2,
   ELAPSED_COL = -1, negative so they never collide with spec.columns'
   dense 0..n-1 range): a 0-based row-order Index (also the default X axis
   for the Plot tab, since extractColumns always starts with it — see
   renderPlotControls) and t (ms), cumulative elapsed time since the first
   entry's real timestamp.
   ============================================================ */
group(42);
await withApp(async (w, d, T) => {
  section("42. Extraction table: synthetic Index + t(ms) columns");
  // Hand-built (not makeLog) for exact, easy-to-check elapsed values: 0ms, then 1500ms, then 3500ms since the first entry.
  const log =
    `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"n=5"\n` +
    `2024-01-15 10:00:01,500\tINFO\t"main"\tC:\\src\\Foo.cs\tline 1\t[DoWork]\t"n=3"\n` +
    `2024-01-15 10:00:03,500\tINFO\t"main"\tC:\\src\\Foo.cs\tline 2\t[DoWork]\t"n=9"\n`;
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  /* ---------- Column descriptors: Index/t(ms) leftmost, ahead of the pattern column ---------- */
  assert(T.extractColumns.length === 3, "3 columns: synthetic Index + t(ms), plus the one pattern column, got " + T.extractColumns.length);
  assert(T.extractColumns[0].colIndex === -2 && T.extractColumns[0].name === "Index" && T.extractColumns[0].type === "int",
    "Index is leftmost (colIndex -2), typed int");
  assert(T.extractColumns[1].colIndex === -1 && T.extractColumns[1].name === "t (ms)" && T.extractColumns[1].type === "int",
    "t (ms) is second (colIndex -1), typed int");
  assert(T.extractColumns[2].colIndex === 0, "the real extracted pattern column follows, keeping its own colIndex 0");

  /* ---------- Values: 0-based row order, CUMULATIVE elapsed ms since the first entry ---------- */
  assert(T.extractRowsData.length === 3, "sanity: one row per matching entry");
  const [r0, r1, r2] = T.extractRowsData;
  assert(r0.values[-2] === "0" && r1.values[-2] === "1" && r2.values[-2] === "2", "Index counts up 0,1,2 with row order");
  assert(r0.values[-1] === "0", "first entry's elapsed time is 0, not blank/NaN — the person's explicit correction");
  assert(r1.values[-1] === "1500", "t(ms) is elapsed time since the FIRST entry (1500ms), got " + r1.values[-1]);
  assert(r2.values[-1] === "3500", "t(ms) for the third row is CUMULATIVE (3500ms since the first entry, not the 2000ms step from row 2), got " + r2.values[-1]);
  assert(r0.values.length === 1 && r1.values.length === 1, "Index/t(ms) ride along as negative-index expandos — the dense spec.columns values array (.length) is untouched");

  /* ---------- Header DOM: no numbered pattern-chip badge for the synthetic columns ---------- */
  const ths = [...d.querySelectorAll("#extractHead th[data-col]")];
  assert(ths.length === 3 && ths[0].dataset.col === "-2" && ths[1].dataset.col === "-1" && ths[2].dataset.col === "0",
    "header renders Index, t(ms), then the pattern column left to right, got data-col=[" + ths.map(t => t.dataset.col).join(",") + "]");
  assert(ths[0].textContent.includes("Index") && ths[1].textContent.includes("t (ms)"), "header cells are labeled Index / t (ms)");
  assert(!ths[0].querySelector(".pattern-chip-num") && !ths[1].querySelector(".pattern-chip-num"),
    "synthetic columns get no numbered pattern-chip badge (they aren't placeholders in the regex pattern)");
  assert(ths[2].querySelector(".pattern-chip-num") !== null, "the real pattern column keeps its numbered badge, unaffected");

  /* ---------- Body cells render the same values ---------- */
  const firstRowTds = [...d.querySelectorAll("#extractBody tr:first-child td[data-col]")];
  assert(firstRowTds[0].textContent === "0" && firstRowTds[1].textContent === "0", "first row: Index=0, t(ms)=0, in the DOM");
  const secondRowTds = [...d.querySelectorAll("#extractBody tr:nth-child(2) td[data-col]")];
  assert(secondRowTds[0].textContent === "1" && secondRowTds[1].textContent === "1500", "second row: Index=1, t(ms)=1500, in the DOM");
  const thirdRowTds = [...d.querySelectorAll("#extractBody tr:nth-child(3) td[data-col]")];
  assert(thirdRowTds[0].textContent === "2" && thirdRowTds[1].textContent === "3500", "third row: Index=2, t(ms)=3500 (cumulative, not the 2000ms step), in the DOM");

  /* ---------- columnColor handles negative colIndex (regression: naive `i % n` goes negative in JS) ---------- */
  assert(ths[0].querySelector(".extract-sort-btn") && ths[1].querySelector(".extract-sort-btn"), "sanity: synthetic columns are still sortable, so a broken color would show up in the swatch below");

  /* ---------- Sorting: t(ms) descending reverses row order (all three values are now parseable, unlike the old blank-first-row delta) ---------- */
  const elapsedSortBtn = d.querySelector('.extract-sort-btn[data-sort-col="-1"]');
  fireClick(elapsedSortBtn, w); // 1st click: ascending — already the natural order, no visible reorder
  fireClick(elapsedSortBtn, w); // 2nd click: descending
  assert(T.extractRowsData[0].values[-1] === "3500" && T.extractRowsData[1].values[-1] === "1500" && T.extractRowsData[2].values[-1] === "0",
    "sorting by t(ms) descending reverses row order numerically, got [" + T.extractRowsData.map(r => r.values[-1]).join(",") + "]");

  /* ---------- Whole-table export (the CSV dialog's builder) includes both synthetic columns ---------- */
  const lines = w.buildExtractCsv("\t", ".", true, false).split("\r\n");
  assert(lines[0] === "Index\tt (ms)\tn", "export header includes Index/t(ms) ahead of the pattern column, got " + JSON.stringify(lines[0]));
  assert(lines.includes("2\t3500\t9"), "export body includes a cumulative (not per-step) t(ms) value, got " + JSON.stringify(lines));

  /* ---------- Plot tab: Index is the default X axis on every extraction, a real column defaults for Y ---------- */
  w.applyFhView("plot");
  assert(d.querySelector("#plotXSelect").value === "-2", "Index is the default X-axis selection for a freshly opened extraction's plot, got " + d.querySelector("#plotXSelect").value);
  const yChecked = [...d.querySelectorAll('#plotYList input[type="checkbox"]:checked')].map(cb => cb.dataset.col);
  assert(yChecked.length === 1 && yChecked[0] === "0", "Y defaults to the real extracted column, not the synthetic t(ms) one, got " + JSON.stringify(yChecked));
  const elapsedSwatch = d.querySelector('#plotYList input[data-col="-1"]').nextElementSibling;
  assert(elapsedSwatch.style.background !== "", "t(ms) still gets a valid swatch color in the Y-column list (columnColor's negative-index modulo fix)");
  w.switchExtractView("table");
});
