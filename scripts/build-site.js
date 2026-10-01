#!/usr/bin/env node
// Builds the homepage + hosted app into one static directory (the GitHub Pages
// artifact, see .github/workflows/pages.yml and docs/homepage.md).
//
//   node scripts/build-site.js --out <dir>
//
// Layout of <dir> (wiped first):
//   index.html, img/...   site/** as is, plus the screenshots the page shows
//   app/index.html        philogg.html with every comment stripped (the same
//                         release transformation as build-release-assets.yml)
//   app/LICENSE.md        the license, shipped beside every build
//   app/tour/...          the guided tour from the log simulator
//                         (welcome.log, welcome.session.json, demo/app.log, ...)
//   .nojekyll             tell GitHub Pages not to run Jekyll
//
// Version stamping is NOT done here: the workflow runs
// `scripts/release-version.js stamp` on its throwaway checkout first.
// Dependency-free, Node >= 18, usable as a module: { buildSite }.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { stripDocument } = require("./strip-comments.js");

const ROOT = path.join(__dirname, "..");
// docs/screenshots/<file> -> img/<file>; keep in sync with site/index.html.
const SCREENSHOTS = ["01-log-view.png", "04-link-view.png", "09-patterns.png", "03-plot.png"];

function buildSite(outDir) {
  const out = path.resolve(outDir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "app", "tour"), { recursive: true });

  fs.cpSync(path.join(ROOT, "site"), out, { recursive: true });

  fs.mkdirSync(path.join(out, "img"), { recursive: true });
  for (const f of SCREENSHOTS) fs.copyFileSync(path.join(ROOT, "docs", "screenshots", f), path.join(out, "img", f));

  const html = fs.readFileSync(path.join(ROOT, "philogg.html"), "utf8");
  fs.writeFileSync(path.join(out, "app", "index.html"), stripDocument(html));
  fs.copyFileSync(path.join(ROOT, "LICENSE.md"), path.join(out, "app", "LICENSE.md"));

  execFileSync(process.execPath, [path.join(ROOT, "tools", "log-sim", "cli.js"), "-f", "tour", "-o", path.join(out, "app", "tour") + path.sep, "-q"], { stdio: "inherit" });

  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  return out;
}

function main(argv) {
  const i = argv.indexOf("--out");
  if (i < 0 || !argv[i + 1]) {
    process.stderr.write("usage: build-site.js --out <dir>\n");
    process.exit(2);
  }
  console.log("site built into " + buildSite(argv[i + 1]));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { buildSite, SCREENSHOTS };
