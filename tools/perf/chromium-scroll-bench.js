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

  // The same measurements for both log views. `cfg` names the view's globals:
  // Filtered = #tableBody/renderVisibleRows, Context = #highlightBody/
  // renderHighlightVisibleRows (the Context view has no scroll compression, so
  // its offsets come from highlightRowOffsets).
  const VIEWS = [
    { name: "Filtered", body: "tableBody", rows: "tableRows", render: "renderVisibleRows", entries: "currentViewEntries", setup: "" },
    { name: "Context", body: "highlightBody", rows: "highlightRows", render: "renderHighlightVisibleRows", entries: "currentHighlightViewEntries",
      setup: "applyFhView('highlight'); renderHighlightVisibleRows();" },
  ];
  for (const cfg of VIEWS) {
    console.log("\n=== " + cfg.name + " view ===");
    if (cfg.setup) { await page.evaluate(cfg.setup); await page.waitForTimeout(500); }
    const cost = await page.evaluate(cfg => {
      const body = window[cfg.body] || eval(cfg.body), rows = eval(cfg.rows), render = eval(cfg.render);
      const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)].toFixed(2);
      const full = [], scroll = [];
      const max = body.scrollHeight - body.clientHeight;
      for (let i = 0; i < 200; i++) {
        body.scrollTop = Math.floor(Math.random() * max);
        const t = performance.now();
        render();
        void rows.offsetHeight; // include style + layout
        full.push(performance.now() - t);
      }
      body.scrollTop = Math.floor(max / 2);
      render(true);
      for (let i = 0; i < 200; i++) {
        body.scrollTop += 100;
        const t = performance.now();
        render(true);
        void rows.offsetHeight;
        scroll.push(performance.now() - t);
      }
      return { scale: cfg.name === "Filtered" ? tableScrollHeightScale : 1, viewportH: body.clientHeight,
        full: { p50: pct(full, 0.5), p95: pct(full, 0.95) }, scroll100px: { p50: pct(scroll, 0.5), p95: pct(scroll, 0.95) } };
    }, cfg);
    console.log("scroll scale", cost.scale, "| viewport", cost.viewportH, "px");
    console.log("full rebuild ms   p50", cost.full.p50, "p95", cost.full.p95);
    console.log("scroll render ms  p50", cost.scroll100px.p50, "p95", cost.scroll100px.p95, "(100px steps; the old Context view rebuilds on every one)");

    await page.evaluate(cfg => {
      const body = eval(cfg.body), rows = eval(cfg.rows);
      function topRow() {
        const S = body.scrollTop, H = body.clientHeight, base = rows.offsetTop;
        let top = null, covTop = false, covBot = false;
        for (const c of rows.children) {
          if (!c.dataset.viewIdx || !c.classList.contains("log-row")) continue;
          const t = base + c.offsetTop, b = t + c.offsetHeight;
          if (t <= S && b > S) { top = Number(c.dataset.viewIdx); covTop = true; }
          if (t < S + H && b >= S + H) covBot = true;
        }
        return { top, blank: !covTop || !covBot };
      }
      const orig = window[cfg.render];
      window[cfg.render] = function () {
        if (!window.__visOn) return orig.apply(this, arguments);
        const before = topRow();
        const r = orig.apply(this, arguments);
        const after = topRow();
        const v = window.__vis; v.renders++;
        if (before.blank) v.blank++;
        else if (before.top !== after.top) { v.jumps++; v.maxJump = Math.max(v.maxJump, Math.abs(after.top - before.top)); }
        return r;
      };
    }, cfg);
    const topIdx = () => page.evaluate(cfg => {
      const body = eval(cfg.body);
      return cfg.name === "Filtered" ? Math.floor(physicalToLogicalScrollPx(body.scrollTop) / ROW_HEIGHT) : Math.floor(body.scrollTop / ROW_HEIGHT);
    }, cfg);
    async function scenario(name, fn) {
      await page.evaluate(cfg => { const body = eval(cfg.body); body.scrollTop = Math.floor(body.scrollHeight / 3); eval(cfg.render)(); }, cfg);
      await page.waitForTimeout(300);
      const i0 = await topIdx();
      await page.evaluate(() => { window.__vis = { renders: 0, blank: 0, jumps: 0, maxJump: 0 }; window.__visOn = true; });
      await fn();
      await page.waitForTimeout(400);
      const v = await page.evaluate(() => { window.__visOn = false; return window.__vis; });
      const i1 = await topIdx();
      console.log(name.padEnd(30), "rows moved", String(i1 - i0).padStart(7), "| renders", String(v.renders).padStart(3),
        "| blank", String(v.blank).padStart(3), "| jumps", String(v.jumps).padStart(3), "(max " + v.maxJump + " rows)");
    }
    const box = await page.evaluate(cfg => { const r = eval(cfg.body).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, cfg);
    await page.mouse.move(box.x, box.y);
    await scenario("wheel 1 notch (100px)", async () => { await page.mouse.wheel(0, 100); });
    await scenario("wheel down 100px x40", async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(16); } });
    await scenario("wheel up 100px x40", async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(16); } });
    await scenario("wheel down 400px x40 (flick)", async () => { for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(16); } });
  }
  await browser.close();
})();
