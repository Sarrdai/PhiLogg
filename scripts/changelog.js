#!/usr/bin/env node
// The changelog is one file per change in changelog.d/
// (`YYYY-MM-DD-<slug>.md`, one entry each), so parallel branches never
// conflict on a shared file (see changelog.d/README.md). This prints them as
// one history, newest first.
//
//   node scripts/changelog.js               the whole history
//   node scripts/changelog.js 2026-09-01    only entries from that date on
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FRAGMENT_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/;

// Newest first: by date prefix, then by name within a day, both descending
// (converted entries carry a running number after the date, so a day's
// entries keep their original order).
function listFragments(root = ROOT, since = "") {
  const dir = path.join(root, "changelog.d");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => FRAGMENT_RE.test(f) && f.slice(0, 10) >= since)
    .sort().reverse()
    .map(f => path.join(dir, f));
}

function collect(root = ROOT, since = "") {
  return listFragments(root, since).map(f => fs.readFileSync(f, "utf8").trim()).filter(Boolean).join("\n\n");
}

function main(argv) {
  process.stdout.write(collect(ROOT, argv[0] || "") + "\n");
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { listFragments, collect };
