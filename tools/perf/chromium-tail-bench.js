// Live-tracking (tailing) and merge cost in headless Chromium. See
// docs/performance-testing.md → "Level 2d".
//
//   NODE_PATH=$(npm root -g) node tools/perf/chromium-tail-bench.js <log-file> [philogg.html] [ticks]
//
// Loads <log-file> through #fileInput, puts three filters under it (level
// ERROR, text "customer 42", text "customer 42" under the level node) with
// the text filter active, then makes it a tailed file whose handle serves the
// original File plus lines appended between ticks (20 per tick). Reports:
// - tick: median wall time of one tailTick() — poll, parse, cache
//   invalidation and the render() of the active view;
// - max stall: longest gap of a 10ms heartbeat during the ticks, and during
//   the 6s after them (the debounced session-cache write of the grown file);
// - merge: mergeFiles() of two 300,000-entry sorted, overlapping files.
const { chromium } = require("playwright");
const path = require("path");

const LOG = path.resolve(process.argv[2] || "");
const HTML = path.resolve(process.argv[3] || path.join(__dirname, "..", "..", "philogg.html"));
const TICKS = +process.argv[4] || 10;
if (!process.argv[2]) { console.error("usage: node chromium-tail-bench.js <log-file> [philogg.html] [ticks]"); process.exit(1); }

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", e => console.log("pageerror", e.message));
  await page.goto("file://" + HTML);
  await page.waitForTimeout(800);
  await page.setInputFiles("#fileInput", LOG);
  await page.waitForFunction(() => {
    const f = state.nodes[state.rootIds[0]];
    return f && f.loadFraction === undefined && f.entries.length > 0 && f._cacheBlob;
  }, null, { timeout: 300000, polling: 100 });
  await page.waitForTimeout(1500);

  const tail = await page.evaluate(async ticks => {
    const f = state.nodes[state.rootIds[0]];
    const level = applyLevelFilterUnderRootFile(f.id, "ERROR");
    const levelNode = Object.values(state.nodes).find(n => n.filterType === "level");
    createFilterNode(levelNode.id, "text", "customer 42");
    const text = createFilterNode(f.id, "text", "customer 42");
    state.activeId = text.id;
    revealFilteredView();
    render();
    const base = f._cacheBlob; // the loaded File
    let extra = "";
    // Non-enumerable so the cache record's handle field structured-clones,
    // like a real FileSystemFileHandle.
    const handle = {};
    Object.defineProperty(handle, "getFile", { value: async () => new Blob([base, extra]) });
    f.tail = { handle, offset: base.size, pending: "", failed: false, busy: false, errorCount: 0, lastGrowth: Date.now(), wasLive: true };
    let n = f.entries.length;
    const line = () => `2024-01-15 23:59:59,000\tERROR\t"worker-1"\tC:\\src\\x.cs\tline 1\t[Handle1]\t"Processed request ${n++} for customer 42 in 1 ms"\n`;
    let stall = 0, last = performance.now();
    const beat = setInterval(() => { const now = performance.now(); stall = Math.max(stall, now - last); last = now; }, 10);
    const times = [];
    for (let i = 0; i < ticks; i++) {
      for (let k = 0; k < 20; k++) extra += line();
      const t = performance.now();
      await tailTick();
      void document.body.offsetHeight;
      times.push(performance.now() - t);
      await new Promise(r => setTimeout(r, 300));
    }
    const tickStall = stall;
    stall = 0;
    await new Promise(r => setTimeout(r, 6000)); // CACHE_FILE_DEBOUNCE_MS + idle write
    clearInterval(beat);
    times.sort((a, b) => a - b);
    return { median: times[Math.floor(times.length / 2)], max: times[times.length - 1], tickStall, stall, entries: f.entries.length, shown: currentViewEntries.length };
  }, TICKS);
  console.log(`tail tick: median ${Math.round(tail.median)} ms, max ${Math.round(tail.max)} ms | max stall ${Math.round(tail.tickStall)} ms during ticks, ${Math.round(tail.stall)} ms after (cache write)` +
    ` | ${tail.entries} entries, ${tail.shown} shown`);

  const merge = await page.evaluate(async () => {
    const p = x => String(x).padStart(2, "0");
    const gen = (n, off) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const s = Math.floor(i / 4) + off;
        out.push(`2024-01-15 ${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)},000\tINFO\t"w"\tA.cs\tline 1\t[M]\t"m ${i}"`);
      }
      return out.join("\n") + "\n";
    };
    const a = await addFile("a.log", gen(300000, 0), () => {});
    const b = await addFile("b.log", gen(300000, 2), () => {});
    const t = performance.now();
    const m = await mergeFiles([a.id, b.id]);
    return { ms: performance.now() - t, entries: m.entries.length };
  });
  console.log(`merge (2 x 300k, overlapping): ${Math.round(merge.ms)} ms (${merge.entries} entries)`);
  await browser.close();
})();
