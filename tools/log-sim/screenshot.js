#!/usr/bin/env node
// Opens philogg.html in headless Chromium with simulator output loaded and
// takes a screenshot — the building block for README/docs screenshots and
// for eyeballing a change against realistic data. Formats from
// *.logformat.json files are registered directly (with their filename
// rules), skipping the import wizard.
//
//   node tools/log-sim/screenshot.js [--out shot.png] [--size 1440x900]
//        [--theme dark|light] [--eval "<js run in the page before the shot>"]
//        [--wait <ms>] <log files and *.logformat.json files...>
//
// Needs Playwright (preinstalled globally in the cloud container: run with
// NODE_PATH="$(npm root -g)").
"use strict";
const path = require("path");
const { chromium } = require("playwright");

async function main() {
  const args = process.argv.slice(2);
  const opt = { out: "philogg-shot.png", size: "1440x900", theme: null, eval: null, wait: 500 };
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const m = /^--(out|size|theme|eval|wait)$/.exec(args[i]);
    if (m) opt[m[1]] = args[++i];
    else files.push(path.resolve(args[i]));
  }
  const formats = files.filter(f => f.endsWith(".logformat.json"));
  // *.zip files open as archive containers (#zipInput), not as logs.
  const zips = files.filter(f => /\.zip$/i.test(f));
  const logs = files.filter(f => !f.endsWith(".logformat.json") && !/\.zip$/i.test(f));
  if (!logs.length && !zips.length) throw new Error("no log files given");
  const [width, height] = opt.size.split("x").map(Number);

  const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: "/opt/pw-browsers/chromium" });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("file://" + path.resolve(__dirname, "..", "..", "philogg.html"));
    await page.waitForFunction(() => state.logFormats.length > 0);
    for (const f of formats) {
      const text = require("fs").readFileSync(f, "utf8");
      await page.evaluate(text => {
        const parsed = parseLogFormatExport(text);
        if (!parsed || parsed.error) throw new Error("bad format file: " + (parsed && parsed.error));
        const id = "fmt-sim-" + state.logFormats.length;
        state.logFormats.push(Object.assign({ id, builtin: false, edited: false, createdAt: 0 }, parsed.logFormat));
        parsed.fileNamePatterns.forEach(glob => state.formatRules.unshift({ id: "rule-" + id + "-" + glob, glob, formatId: id, order: -1, createdAt: 0 }));
      }, text);
    }
    if (opt.theme) await page.evaluate(t => applyTheme(t), opt.theme);
    for (let i = 0; i < zips.length; i++) {
      await page.setInputFiles("#zipInput", zips[i]);
      await page.waitForFunction(n => state.zips.length >= n, i + 1, { timeout: 60000 });
    }
    if (logs.length) await page.setInputFiles("#fileInput", logs);
    // Several files at once raise the "Merge these files?" prompt; keep them
    // as separate files (a merge would leave fewer files than the wait below expects).
    if (logs.length > 1) await page.click("#mergeLoadDialogNo");
    // A file is parsed once its row's progress bar is gone (loadFraction is
    // deleted at the end of the load) and it is no longer a queued placeholder.
    await page.waitForFunction(n => state.rootIds.map(id => state.nodes[id])
      .filter(f => f.type === "file" && f.loadFraction === undefined && !f.queued && f.entries && f.entries.length).length >= n,
    logs.length, { timeout: 120000 });
    if (opt.eval) await page.evaluate(opt.eval);
    await page.waitForTimeout(+opt.wait);
    await page.screenshot({ path: opt.out });
  } finally {
    await browser.close();
  }
  process.stderr.write("screenshot: " + opt.out + (errors.length ? "\npage errors:\n  " + errors.join("\n  ") : "") + "\n");
}

main().catch(err => { process.stderr.write("screenshot: " + err.message + "\n"); process.exitCode = 1; });
