// GROUP design-polish-p9 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p9 — number formats (A3) and extraction table (E2)
   Origin: 2026-10-10 design polish round, package P9.
   ============================================================ */
group("design-polish-p9");

await withApp(async (w, d, T) => {
  section("design-polish-p9 a. formatters");
  assert(w.formatCount(6000) === "6.000" && w.formatCount(12) === "12" && w.formatCount(1234567) === "1.234.567", "formatCount: German grouping");
  const ax = (v, ms) => w.formatAxisNumber(v, ms);
  assert(ax(100000) === "100k", "100000 -> 100k, got " + ax(100000));
  assert(ax(1500000) === "1,5M", "1500000 -> 1,5M, got " + ax(1500000));
  assert(ax(3000) === "3k" && ax(12500) === "12,5k" && ax(-250000) === "-250k", "small integers use k as well: " + [ax(3000), ax(12500), ax(-250000)]);
  assert(ax(12) === "12" && ax(999) === "999" && ax(0) === "0", "integers below 1000 stay plain");
  assert(ax(0.25) === "0.25" && ax(2.5) === "2.5", "decimals stay decimal, got " + ax(0.25));
  assert(ax(2e9) === "2G", "integers from 1e9 use G (2e9 -> 2G), got " + ax(2e9));
  assert(!/e\+/.test(ax(100000)) && !/e\+/.test(ax(750000000)), "no exponent notation for ordinary integers");
  assert(ax(60000, true) === "1m" && ax(150000, true) === "2m 30s" && ax(45000, true) === "45s" && ax(500, true) === "500ms",
    "durations: " + [ax(60000, true), ax(150000, true), ax(45000, true), ax(500, true)]);
  assert(w.formatPlotValue(1500000) === "1.500.000" && w.formatPlotValue(0.25) === "0.25", "tooltips/stats keep exact values: " + w.formatPlotValue(1500000));
  assert(ax(3600000, true) === "1h" && ax(5400000, true) === "1h 30m" && ax(2500, true) === "2,5s" && ax(0, true) === "0", "hours, fractional seconds, zero");

  section("design-polish-p9 b. export dialog shows grouped counts");
  const big = makeLog(0, 1200);
  const f = await w.addFile("big.log", big, () => {});
  T.state.activeId = f.id;
  w.render();
  fireClick(d.querySelector("#btnExport"), w);
  const sum = d.querySelector("#exportSummary").textContent;
  assert(sum.startsWith("1.200 of 1.200 entries"), "summary: " + sum);
  assert(d.querySelector("#exportNAll").textContent === "(1.200)", "All button: " + d.querySelector("#exportNAll").textContent);
  assert(w.buildTicketSnippet(w.collectExportContext(), "markdown", { mode: "first", n: 2 }).includes("(1.200 entries)"), "ticket header groups the count too");
  fireKeydown(d, w, "Escape");

  section("design-polish-p9 c. extraction table: alignment, header order, content-width columns");
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  assert(/#extractTable \.extract-col-int[^{]*\{[^}]*text-align:right[^}]*tabular-nums/.test(css), "numeric cells: right + tabular-nums rule outranking th/td left");
  assert(/#extractTable\{[^}]*width:auto/.test(css), "table is not stretched to the panel width");
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const mm = String(Math.floor(i * 10 / 60)).padStart(2, "0"), ss = String(i * 10 % 60).padStart(2, "0");
    lines.push(`2024-01-15 10:${mm}:${ss},000\tINFO\t"main"\tC:\\src\\Foo.cs\trun\t[DoWork]\t"dur=${i * 4000}ms n=${i * 40000}"`);
  }
  const g = await w.addFile("p9.log", lines.join("\n") + "\n", () => {});
  const node = w.createFilterNode(g.id, "text", "dur=[*:int]ms n=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  await waitFor(() => d.querySelector('#extractHead th[data-col="0"]'), { timeout: 3000 });
  const ths = [...d.querySelectorAll("#extractHead th[data-col]")];
  const durTh = ths.find(t => t.dataset.col === "0");
  assert(durTh && durTh.classList.contains("extract-col-int") && w.getComputedStyle(durTh).textAlign === "right", "numeric header cell right-aligned");
  const kids = [...durTh.children].map(c => c.className.split(" ")[0]);
  const ti = kids.indexOf("extract-col-type"), si = kids.indexOf("extract-sort-btn");
  assert(ti >= 0 && si === ti + 1, "type chip, then the sort arrow right after it: " + kids);
  const td = d.querySelector('#extractBody td[data-col="0"]');
  assert(td && w.getComputedStyle(td).textAlign === "right" && /tabular/.test(w.getComputedStyle(td).fontVariantNumeric || "tabular-nums"), "numeric body cell right-aligned");

  section("design-polish-p9 d. plot labels: duration axis and compact SI");
  w.applyFhView("plot");
  const labels = () => [...d.querySelectorAll("#plotSvg .plot-tick-label")].map(t => t.textContent);
  assert(w.plotColIsMs(0) && !w.plotColIsMs(1), "unit ms column is a duration, the plain int is not");
  T.plotConfig.yCols = [0]; T.plotConfig.xCol = -1;
  w.renderPlotChart();
  let L = labels();
  assert(L.some(t => /^\d+m( \d+s)?$/.test(t) || /^\d+s$/.test(t)), "ms axes read as durations: " + L);
  assert(!L.some(t => /e\+/.test(t)), "no exponent labels: " + L);
  T.plotConfig.yCols = [1];
  w.renderPlotChart();
  L = labels();
  assert(L.some(t => /^\d+(,\d)?k$|^\d+(,\d)?M$/.test(t)), "plain int axis uses k/M: " + L);
  assert(!L.some(t => /e\+|\dm\b|\ds$/.test(t.replace(/^\d+(,\d+)?M$/, ""))), "no exponent or duration labels on the plain axis: " + L);
});
