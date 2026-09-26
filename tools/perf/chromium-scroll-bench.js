// Log-view scrolling in headless Chromium (the engine family of WebView2):
// row render cost and what the viewport shows while scrolling. See
// docs/performance-testing.md → "Level 2b".
//
//   NODE_PATH=$(npm root -g) node tools/perf/chromium-scroll-bench.js <log-file> [philogg.html]
//
// Per scenario it wraps renderVisibleRows: just before a scroll render runs,
// the compositor has already been showing the OLD rows at the NEW scroll
// offset — what the person sees for that frame. "blank" counts renders where
// that state left part of the viewport without rows; "jumps" counts renders
// that changed which entry sits at the viewport top (0 = seamless; the old
// 950,000px cap bug made every render jump).
const { chromium } = require("playwright");
const path = require("path");

const LOG = path.resolve(process.argv[2] || "");
const HTML = path.resolve(process.argv[3] || path.join(__dirname, "..", "..", "philogg.html"));
if (!process.argv[2]) { console.error("usage: node chromium-scroll-bench.js <log-file> [philogg.html]"); process.exit(1); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("pageerror", e => console.log("pageerror", e.message));
  await page.goto("file://" + HTML);
  await page.waitForTimeout(800);

  const t0 = Date.now();
  await page.setInputFiles("#fileInput", LOG);
  await page.waitForFunction(() => {
    const f = Object.values(state.nodes).find(n => n.type === "file" && n.entries && n.entries.length > 0);
    return f && f.loadFraction === undefined && currentViewEntries.length === f.entries.length;
  }, null, { timeout: 300000, polling: 50 });
  await page.waitForTimeout(300);
  console.log("loaded", await page.evaluate(() => currentViewEntries.length), "entries in", Date.now() - t0, "ms");

  const cost = await page.evaluate(() => {
    const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)].toFixed(2);
    const full = [], scroll = [];
    const max = tableBody.scrollHeight - tableBody.clientHeight;
    for (let i = 0; i < 200; i++) {
      tableBody.scrollTop = Math.floor(Math.random() * max);
      const t = performance.now();
      renderVisibleRows();
      void tableRows.offsetHeight; // include style + layout
      full.push(performance.now() - t);
    }
    tableBody.scrollTop = Math.floor(max / 2);
    renderVisibleRows(true);
    for (let i = 0; i < 200; i++) {
      tableBody.scrollTop += 100;
      const t = performance.now();
      renderVisibleRows(true);
      void tableRows.offsetHeight;
      scroll.push(performance.now() - t);
    }
    return { scale: tableScrollHeightScale, viewportH: tableBody.clientHeight,
      full: { p50: pct(full, 0.5), p95: pct(full, 0.95) }, scroll100px: { p50: pct(scroll, 0.5), p95: pct(scroll, 0.95) } };
  });
  console.log("scroll scale", cost.scale, "| viewport", cost.viewportH, "px");
  console.log("full rebuild ms   p50", cost.full.p50, "p95", cost.full.p95);
  console.log("scroll render ms  p50", cost.scroll100px.p50, "p95", cost.scroll100px.p95, "(100px steps)");

  await page.evaluate(() => {
    const idx = new Map(currentViewEntries.map((e, i) => [e.id, i]));
    function topRow() {
      const S = tableBody.scrollTop, H = tableBody.clientHeight, base = tableRows.offsetTop;
      let top = null, covTop = false, covBot = false;
      for (const c of tableRows.children) {
        if (!c.dataset.entryId) continue;
        const t = base + c.offsetTop, b = t + c.offsetHeight;
        if (t <= S && b > S) { top = idx.get(c.dataset.entryId); covTop = true; }
        if (t < S + H && b >= S + H) covBot = true;
      }
      return { top, blank: !covTop || !covBot };
    }
    const orig = window.renderVisibleRows;
    window.renderVisibleRows = function () {
      if (!window.__visOn) return orig.apply(this, arguments);
      const before = topRow();
      const r = orig.apply(this, arguments);
      const after = topRow();
      const v = window.__vis; v.renders++;
      if (before.blank) v.blank++;
      else if (before.top !== after.top) { v.jumps++; v.maxJump = Math.max(v.maxJump, Math.abs(after.top - before.top)); }
      return r;
    };
  });
  async function scenario(name, fn) {
    await page.evaluate(() => { tableBody.scrollTop = Math.floor(tableBody.scrollHeight / 3); renderVisibleRows(); });
    await page.waitForTimeout(300);
    const i0 = await page.evaluate(() => Math.floor(physicalToLogicalScrollPx(tableBody.scrollTop) / ROW_HEIGHT));
    await page.evaluate(() => { window.__vis = { renders: 0, blank: 0, jumps: 0, maxJump: 0 }; window.__visOn = true; });
    await fn();
    await page.waitForTimeout(400);
    const v = await page.evaluate(() => { window.__visOn = false; return window.__vis; });
    const i1 = await page.evaluate(() => Math.floor(physicalToLogicalScrollPx(tableBody.scrollTop) / ROW_HEIGHT));
    console.log(name.padEnd(30), "rows moved", String(i1 - i0).padStart(7), "| renders", String(v.renders).padStart(3),
      "| blank", String(v.blank).padStart(3), "| jumps", String(v.jumps).padStart(3), "(max " + v.maxJump + " rows)");
  }
  await page.mouse.move(800, 500);
  await scenario("wheel 1 notch (100px)", async () => { await page.mouse.wheel(0, 100); });
  await scenario("wheel down 100px x40", async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(16); } });
  await scenario("wheel up 100px x40", async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(16); } });
  await scenario("wheel down 400px x40 (flick)", async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(16); } });
  await browser.close();
})();
