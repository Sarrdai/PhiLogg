#!/usr/bin/env node
// Changelog fragments: every change adds its own file under changelog.d/
// (`YYYY-MM-DD-<slug>.md`, one bullet in CHANGELOG.md's format) instead of
// editing CHANGELOG.md, so parallel branches never conflict on it (see
// changelog.d/README.md).
//
//   node scripts/changelog.js          print all fragments, newest first
//   node scripts/changelog.js --fold   move them into CHANGELOG.md (top of the
//                                      list) and delete the fragment files —
//                                      done once per release, on one branch
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FRAGMENT_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;

// Newest first: by date prefix, then by name within a day (reverse order).
function listFragments(root = ROOT) {
  const dir = path.join(root, "changelog.d");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => FRAGMENT_RE.test(f)).sort().reverse().map(f => path.join(dir, f));
}

function collect(root = ROOT) {
  return listFragments(root).map(f => fs.readFileSync(f, "utf8").trim()).filter(Boolean).join("\n\n");
}

// Inserts the collected fragments above CHANGELOG.md's first entry and removes
// the fragment files. Returns how many were folded.
function fold(root = ROOT) {
  const files = listFragments(root);
  if (!files.length) return 0;
  const changelogPath = path.join(root, "CHANGELOG.md");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const firstEntry = changelog.search(/^- \*\*/m);
  const at = firstEntry === -1 ? changelog.length : firstEntry;
  const head = changelog.slice(0, at).replace(/\s*$/, "\n\n");
  const rest = changelog.slice(at);
  fs.writeFileSync(changelogPath, head + collect(root) + "\n" + (rest ? "\n" + rest : ""));
  files.forEach(f => fs.unlinkSync(f));
  return files.length;
}

function main(argv) {
  if (argv.includes("--fold")) console.log("folded " + fold() + " fragment(s) into CHANGELOG.md");
  else process.stdout.write(collect() + "\n");
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { listFragments, collect, fold };
