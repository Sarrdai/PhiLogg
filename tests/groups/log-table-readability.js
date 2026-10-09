// GROUP log-table-readability — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP log-table-readability — Round I, package I2a
   Origin: 2026-10-09 (desktop usability test, person-decided mockup I2 A).
   Location truncates in the middle (file name stays visible), the selected
   row and the current find hit get strong styles, rows taller than one line
   align their other cells to the first message line, the default column
   widths leave more room to Message. Word-boundary wrap was NOT adopted:
   section c measures in real Chromium why (and that break-all's count never
   under-allocates a row).
   ============================================================ */
group("log-table-readability");
const [LTR_SIM] = LOGSIM.generateToStrings({ entries: 300, seed: 7 });

await withApp(async (w, d, T) => {
  section("log-table-readability a. Location cell: head shrinks, tail (file name + line) stays");
  const f = await w.addFile("a.log", LTR_SIM.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const cells = [...d.querySelectorAll("#tableRows .log-row .col-location")];
  assert(cells.length > 5, "rows with a location rendered");
  const split = cells.filter(c => c.classList.contains("loc-split"));
  assert(split.length === cells.length, "every path-like location is split, got " + split.length + "/" + cells.length);
  const c0 = split[0], val = c0.getAttribute("title");
  assert(c0.querySelector(".loc-head") && c0.querySelector(".loc-tail"), "head and tail spans exist");
  assert(c0.textContent === val, "text content is the unchanged value (copy/selection), got " + c0.textContent);
  assert(/^[^\\/]*$/.test(c0.querySelector(".loc-tail").textContent), "tail holds no path separator (it starts at the file name)");
  assert(/[\\/]$/.test(c0.querySelector(".loc-head").textContent), "head ends at the last separator");
  assert(/\.cs/.test(c0.querySelector(".loc-tail").textContent), "the file name is in the tail");
  assert(/\.loc-split\{display:flex/.test(PAGE_CSS) && /\.loc-head\{[^}]*text-overflow:ellipsis/.test(PAGE_CSS), "CSS gives the head the ellipsis, the tail none");
  assert(w.middleCellHtml("location", "Repository", "Repository").indexOf("loc-split") === -1, "a value without a separator stays a plain cell");
  assert(w.middleCellHtml("location", "a\\b", "a<mark>\\</mark>b").indexOf("loc-split") === -1, "a marked cell (html has tags) stays plain");
  assert(w.middleCellHtml("thread", "x\\y", "x\\y").indexOf("loc-split") === -1, "other columns are untouched");
});

await withApp(async (w, d, T) => {
  section("log-table-readability b. Default widths, selected row, current find hit, tall rows");
  assert(T.state.columnWidths.location === 190 && T.state.columnWidths.method === 110 && T.state.columnWidths.delta === 56, "Message-friendly default widths");
  assert(/\.log-row\.selected\{box-shadow:inset 3px 0 0 var\(--accent\)/.test(PAGE_CSS), "selected row: 3px accent bar");
  assert(/\.log-row\.selected, \.log-row\.selected:hover\{background-image:linear-gradient\(var\(--selected-row-tint\)/.test(PAGE_CSS), "selected row: accent tint that survives hover");
  assert(/\.log-row\.selected mark\.find-match-mark\{\s*background:var\(--accent\); color:var\(--accent-on\)/.test(PAGE_CSS), "current find hit: solid accent fill with --accent-on text");
  assert(/mark\.find-match-mark\{[^}]*box-shadow:inset 0 -2px 0 var\(--accent\)/.test(PAGE_CSS), "other find hits: underline, not the filter mark's outline");

  const f = await w.addFile("a.log", makeLog(0, 6, { suffix: i => i === 2 ? "y ".repeat(200) : "" }), () => {});
  T.state.activeId = f.id;
  Object.defineProperty(d.querySelector("#tableBody"), "clientWidth", { value: 1000, configurable: true });
  T.state.wrapMessages = true;
  w.render();
  const rows = [...d.querySelectorAll("#tableRows .log-row")];
  const tall = rows.filter(r => r.classList.contains("row-tall"));
  assert(tall.length === 1 && parseFloat(tall[0].style.height) > 28, "only the wrapped row is .row-tall, got " + tall.length);
  assert(rows.filter(r => !r.classList.contains("row-tall")).every(r => parseFloat(r.style.height) === 28), "one-line rows keep the plain height and the centered cells");
  assert(/\.log-row\.row-tall > \.col-time[^{]*\{align-self:start/.test(PAGE_CSS), "tall rows align time/level/thread cells to the top");
  T.state.wrapMessages = false;
  w.render();
  assert(!d.querySelector("#tableRows .row-tall"), "wrap off: no tall rows");
});

// ---- c. Real Chromium (Playwright): the wrapped line count the virtualization
// uses against the browser's real layout. Skipped when Playwright or its
// browser is not installed (the jsdom suite has no layout engine).
section("log-table-readability c. Predicted vs real wrapped line count in Chromium (skipped without Playwright)");
await (async () => {
  let chromium = null;
  try { chromium = require("playwright").chromium; } catch (e) {
    try { chromium = require(require("child_process").execSync("npm root -g", { encoding: "utf8" }).trim() + "/playwright").chromium; } catch (e2) { /* none */ }
  }
  let browser = null;
  if (chromium) {
    for (const opts of [{}, { executablePath: "/opt/pw-browsers/chromium" }]) { try { browser = await chromium.launch(opts); break; } catch (e) { /* try next */ } }
  }
  if (!browser) { console.log("  (skipped: no Playwright/Chromium)"); return; }
  const file = path.join(require("os").tmpdir(), "philogg-ltr-" + process.pid + ".log");
  fs.writeFileSync(file, LTR_SIM.text);
  const tot = { n: 0, exact: 0, under: 0 };
  try {
    for (const width of [900, 1440, 1900]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.addInitScript(() => { try { localStorage.setItem("philogg-where-is-what-seen", "1"); } catch (e) {} });
      await page.goto("file://" + HTML_PATH);
      await page.waitForFunction(() => state.logFormats.length > 0);
      await page.setInputFiles("#fileInput", file);
      await page.waitForFunction(() => state.rootIds.length && state.nodes[state.rootIds[0]].loadFraction === undefined && state.nodes[state.rootIds[0]].entries.length);
      await page.evaluate(() => { state.wrapMessages = true; state.multilineMessages = true; updateWrapMsgButton(); updateMultilineMsgButton(); render(); });
      const res = await page.waitForFunction(() => tableWrapCols > 10 && tableRows.querySelector(".log-row")).then(() => page.evaluate(async () => {
        const out = [], seen = new Set();
        for (let y = 0; y < tableBody.scrollHeight; y += tableBody.clientHeight * 0.8) {
          tableBody.scrollTop = y; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          // Under load (SHARDS=8) the scroll render can lag behind: wait until the rendered rows
          // actually cover the viewport, else the rows scrolled past are never sampled (793 < 800 once).
          for (let i = 0; i < 120; i++) {
            const rs = tableRows.querySelectorAll(".log-row"), vb = tableBody.getBoundingClientRect();
            if (rs.length && rs[0].getBoundingClientRect().top <= vb.top + 1 && rs[rs.length - 1].getBoundingClientRect().bottom >= vb.bottom - 1) break;
            if (tableBody.scrollTop + tableBody.clientHeight >= tableBody.scrollHeight - 1 && rs.length) break;
            await new Promise(r => requestAnimationFrame(r));
          }
          for (const row of tableRows.querySelectorAll(".log-row")) {
            const e = currentViewEntries[+row.dataset.viewIdx], m = row.querySelector(".col-msg");
            if (!e || !m || seen.has(e.id)) continue; seen.add(e.id);
            out.push([Math.round(m.getBoundingClientRect().height / 15), messageWrapLines(e.message, tableWrapCols)]);
          }
        }
        return out;
      }));
      for (const [real, pred] of res) { tot.n++; if (real === pred) tot.exact++; else if (pred < real) tot.under++; }
      await page.close();
    }
  } finally { await browser.close(); fs.unlinkSync(file); }
  console.log("  wrapped line count over " + tot.n + " rows: " + (100 * tot.exact / tot.n).toFixed(2) + "% exact, " + tot.under + " under-allocated");
  // 3 widths x 300 entries = 900 possible; a few lines of slack for rows a scroll step skipped.
  assert(tot.n >= 0.85 * 3 * 300, "enough rows measured (>= 765 of 900), got " + tot.n);
  assert(tot.under === 0, "no row is ever allocated fewer lines than the browser renders (text would be clipped), got " + tot.under);
  assert(tot.exact / tot.n >= 0.95, "predicted == real for at least 95% of rows (the rest are one spare line), got " + (100 * tot.exact / tot.n).toFixed(2) + "%");
})();
