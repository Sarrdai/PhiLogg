// File load and filter cost in headless Chromium (the engine family of
// WebView2). See docs/performance-testing.md → "Level 2c".
//
//   NODE_PATH=$(npm root -g) node tools/perf/chromium-load-bench.js <log-file> [philogg.html] [runs]
//
// Per run, in a fresh browser context (so the session cache starts empty):
// - load: wall time from setInputFiles on #fileInput until the render() that
//   shows the fully loaded file has returned;
// - stall: the longest gap between two ticks of a 10ms setTimeout heartbeat
//   during that load — the longest the page was unresponsive;
// - heap: used JS heap after a forced GC, once loaded;
// - level / text: creating a level filter (ERROR, under the file) or a text
//   filter ("customer 42") plus its render(), style and layout included.
const { chromium } = require("playwright");
const path = require("path");

const LOG = path.resolve(process.argv[2] || "");
const HTML = path.resolve(process.argv[3] || path.join(__dirname, "..", "..", "philogg.html"));
const RUNS = +process.argv[4] || 3;
if (!process.argv[2]) { console.error("usage: node chromium-load-bench.js <log-file> [philogg.html] [runs]"); process.exit(1); }

async function run(browser, i) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", e => console.log("pageerror", e.message));
  await page.goto("file://" + HTML);
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    // Every render() end is timestamped; the load is done at the first render
    // after which the file is complete and the view shows all of it.
    window.__renders = [];
    const orig = window.render;
    window.render = function () {
      const r = orig.apply(this, arguments);
      const f = Object.values(state.nodes).find(n => n.type === "file" && n.entries && n.entries.length > 0);
      window.__renders.push({ t: Date.now(), done: !!f && f.loadFraction === undefined && currentViewEntries.length === f.entries.length });
      return r;
    };
    window.__stall = 0;
    let last = performance.now();
    window.__beat = setInterval(() => {
      const now = performance.now();
      window.__stall = Math.max(window.__stall, now - last);
      last = now;
    }, 10);
  });
  const t0 = Date.now();
  await page.setInputFiles("#fileInput", LOG);
  await page.waitForFunction(() => window.__renders.some(r => r.done), null, { timeout: 300000, polling: 50 });
  await page.waitForTimeout(1500); // idle work after the render (cache write etc.) shows up in the stall
  const load = await page.evaluate(() => {
    clearInterval(window.__beat);
    const done = window.__renders.find(r => r.done);
    return { end: done.t, renders: window.__renders.length, stall: window.__stall, entries: currentViewEntries.length };
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = await cdp.send("Runtime.getHeapUsage");

  const filters = await page.evaluate(() => {
    const rootId = state.rootIds[0];
    const timed = fn => { const t = performance.now(); fn(); void document.body.offsetHeight; return performance.now() - t; };
    const level = timed(() => toggleLevelFromMinimap(rootId, "ERROR"));
    const levelCount = currentViewEntries.length;
    state.activeId = rootId; render();
    const text = timed(() => { createFilterNode(rootId, "text", "customer 42"); revealFilteredView(); render(); });
    return { level, levelCount, text, textCount: currentViewEntries.length };
  });
  await context.close();
  console.log(`run ${i}: load ${load.end - t0} ms (${load.renders} renders, ${load.entries} entries)` +
    ` | max stall ${Math.round(load.stall)} ms | heap ${Math.round(heap.usedSize / 1048576)} MB` +
    ` | level filter ${Math.round(filters.level)} ms (${filters.levelCount})` +
    ` | text filter ${Math.round(filters.text)} ms (${filters.textCount})`);
}

(async () => {
  const browser = await chromium.launch();
  for (let i = 1; i <= RUNS; i++) await run(browser, i);
  await browser.close();
})();
