// Wildcard-pattern filter cost in headless Chromium (FEATURE_BACKLOG.md #101).
// See docs/performance-testing.md → "Level 2c".
//
//   NODE_PATH=$(npm root -g) node tools/perf/chromium-wildcard-bench.js <log-file> [philogg.html] [entries]
//   PATTERN=1 ... runs only the second pattern (an old page can hang on it)
//
// Loads the file like chromium-load-bench.js, then per pattern times a text
// filter carrying it over the first `entries` entries (default: all) — the
// same textFilterMatches call getEntries and the popup's live match make.
const { chromium } = require("playwright");
const path = require("path");

const LOG = path.resolve(process.argv[2] || "");
const HTML = path.resolve(process.argv[3] || path.join(__dirname, "..", "..", "philogg.html"));
const LIMIT = +process.argv[4] || 0;
if (!process.argv[2]) { console.error("usage: node chromium-wildcard-bench.js <log-file> [philogg.html] [entries]"); process.exit(1); }
const ALL_PATTERNS = [
  "Request [*] from [*] to [*] at [*] by [*] in [*] x [*] NOMATCH",
  "[*] [*] [*] [*] [*] [*] [*] NOMATCH",
  "Request [*] [*] completed in [*:int]ms status=[*:int]",
];
const PATTERNS = process.env.PATTERN ? [ALL_PATTERNS[+process.env.PATTERN]] : ALL_PATTERNS;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("pageerror", e.message));
  await page.goto("file://" + HTML);
  await page.waitForTimeout(800);
  await page.setInputFiles("#fileInput", LOG);
  await page.waitForFunction(() => {
    const f = Object.values(state.nodes).find(n => n.type === "file" && n.entries && n.entries.length > 0);
    return f && f.loadFraction === undefined;
  }, null, { timeout: 300000, polling: 100 });
  for (const p of PATTERNS) {
    const r = await page.evaluate(([p, limit]) => {
      const f = Object.values(state.nodes).find(n => n.type === "file");
      const entries = limit ? f.entries.slice(0, limit) : f.entries;
      const spec = textFilterMatchSpec({ type: "filter", filterType: "text", value: p });
      const t = performance.now();
      let hits = 0;
      for (const e of entries) if (textFilterMatches(e, p, false, null, spec.wildcardRegex, spec.wildcardColumns)) hits++;
      return { ms: performance.now() - t, n: entries.length, hits };
    }, [p, LIMIT]);
    console.log(`${p.padEnd(66)} ${Math.round(r.ms)} ms over ${r.n} entries (${r.hits} hits)`);
  }
  await browser.close();
})();
