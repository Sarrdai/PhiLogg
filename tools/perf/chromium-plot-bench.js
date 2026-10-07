// 2D plot draw cost in headless Chromium. See docs/performance-testing.md →
// "Level 2e".
//
//   node tools/log-sim/cli.js -n 300000 -s position --seed 7 -o /tmp/philogg-perf/pos-300k.log
//   NODE_PATH=$(npm root -g) node tools/perf/chromium-plot-bench.js /tmp/philogg-perf/pos-300k.log [philogg.html] [runs]
//
// Loads the file, adds the position extraction (x/y/z floats), then:
// - first draw: wall time from switching to the Plot tab until the frame
//   after it is painted, and how many renderPlotChart() calls it took;
// - redraw: one renderPlotChart() plus style, layout and paint (next frame),
//   per chart type (scatter, line, bar), median of RUNS.
const { chromium } = require("playwright");
const path = require("path");

const LOG = path.resolve(process.argv[2] || "");
const HTML = path.resolve(process.argv[3] || path.join(__dirname, "..", "..", "philogg.html"));
const RUNS = +process.argv[4] || 3;
if (!process.argv[2]) { console.error("usage: node chromium-plot-bench.js <log-file> [philogg.html] [runs]"); process.exit(1); }
const PATTERN = "Position update x=[*:float] y=[*:float] z=[*:float]";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", e => console.log("pageerror", e.message));
  await page.goto("file://" + HTML);
  await page.waitForTimeout(800);
  await page.setInputFiles("#fileInput", LOG);
  await page.waitForFunction(() => {
    const f = Object.values(state.nodes).find(n => n.type === "file" && n.entries && n.entries.length > 0);
    return f && f.loadFraction === undefined;
  }, null, { timeout: 300000, polling: 100 });
  const rows = await page.evaluate(pattern => {
    const f = Object.values(state.nodes).find(n => n.type === "file");
    const node = createFilterNode(f.id, "text", pattern);
    state.activeId = node.id;
    render();
    applyFhView("table");
    window.__plotCalls = 0;
    const orig = window.renderPlotChart;
    window.renderPlotChart = function () { window.__plotCalls++; return orig.apply(this, arguments); };
    return extractRowsData.length;
  }, PATTERN);
  await page.waitForTimeout(500);

  const first = await page.evaluate(async () => {
    const paint = () => new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
    window.__plotCalls = 0;
    const t = performance.now();
    applyFhView("plot");
    await paint();
    return { ms: performance.now() - t, calls: window.__plotCalls, type: plotConfig.type, marks: typeof plotMarkOps !== "undefined" ? plotMarkOps.length : document.querySelectorAll("#plotSvg .plot-mark").length };
  });
  console.log(`${rows} rows | first draw (${first.type}) ${Math.round(first.ms)} ms, ${first.calls} renderPlotChart calls, ${first.marks} marks drawn`);

  for (const type of ["scatter", "line", "bar"]) {
    const res = await page.evaluate(async ({ type, runs }) => {
      const paint = () => new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
      plotConfig.type = type;
      plotConfig.xCol = 0; plotConfig.yCols = [1];
      renderPlotChart(); await paint();
      const times = [];
      for (let i = 0; i < runs; i++) {
        const t = performance.now();
        renderPlotChart();
        await paint();
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return { median: times[Math.floor(times.length / 2)], marks: typeof plotMarkOps !== "undefined" ? plotMarkOps.length : document.querySelectorAll("#plotSvg .plot-mark").length, nodes: document.querySelectorAll("#plotSvg *").length };
    }, { type, runs: RUNS });
    console.log(`  redraw ${type.padEnd(7)} ${Math.round(res.median)} ms (median of ${RUNS}) | ${res.marks} marks drawn, ${res.nodes} SVG elements`);
  }
  await browser.close();
})();
