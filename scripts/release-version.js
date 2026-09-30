#!/usr/bin/env node
// Version helpers for the release workflows (.github/workflows/).
//
//   node scripts/release-version.js next-beta
//     Prints the next beta version, e.g. "0.2.0-beta.3": the version the next
//     stable release will get, plus "-beta.N". Reads the last stable version
//     from .release-please-manifest.json and the commits since its tag.
//
//   node scripts/release-version.js stamp <version> <build>
//     Writes <version> into every file release-please keeps in sync
//     (philogg.html, desktop/package.json, desktop/src-tauri/tauri.conf.json,
//     desktop/src-tauri/Cargo.toml) and <build> (short SHA) into
//     PHILOGG_BUILD. Used on the checked-out copy only, never committed.
//
// Dependency-free on purpose (same as strip-comments.js): a release job must
// not need an npm install to run it.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

// Same bump rule release-please applies with bump-minor-pre-major (see
// release-please-config.json): below 1.0.0 a feat or a breaking change bumps
// MINOR, anything else PATCH. From 1.0.0 on a breaking change bumps MAJOR.
function nextStableVersion(base, commitMessages) {
  const [major, minor, patch] = base.split(".").map(Number);
  const breaking = commitMessages.some(m => /^\w+(\([^)]*\))?!:/.test(m) || /^BREAKING[ -]CHANGE:/m.test(m));
  const feat = commitMessages.some(m => /^feat(\([^)]*\))?!?:/.test(m));
  if (breaking && major >= 1) return `${major + 1}.0.0`;
  if (breaking || feat) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Beta numbers count per target version: the first beta of 0.2.0 is
// 0.2.0-beta.1, whatever betas 0.1.1 had. Max + 1 rather than count + 1, so
// a deleted beta never makes a number come back.
function nextBetaVersion(base, commitMessages, existingTags) {
  const next = nextStableVersion(base, commitMessages);
  const prefix = `v${next}-beta.`;
  const used = existingTags
    .filter(t => t.startsWith(prefix))
    .map(t => Number(t.slice(prefix.length)))
    .filter(Number.isInteger);
  return `${next}-beta.${used.length ? Math.max(...used) + 1 : 1}`;
}

function replaceOnce(text, re, replacement, what) {
  if (!re.test(text)) throw new Error(`stamp: ${what} not found`);
  return text.replace(re, replacement);
}

// Pure text transforms, one per file; the regexes match the exact shapes
// GROUP 218 pins in philogg.html.
const STAMPERS = {
  "philogg.html": (t, v, b) => {
    t = replaceOnce(t, /const PHILOGG_VERSION = "[^"]*"; \/\/ x-release-please-version/,
      `const PHILOGG_VERSION = "${v}"; // x-release-please-version`, "PHILOGG_VERSION");
    return replaceOnce(t, /const PHILOGG_BUILD = "[^"]*";/, `const PHILOGG_BUILD = "${b}";`, "PHILOGG_BUILD");
  },
  "desktop/package.json": (t, v) => replaceOnce(t, /^(  "version": )"[^"]*"/m, `$1"${v}"`, "package.json version"),
  "desktop/src-tauri/tauri.conf.json": (t, v) => replaceOnce(t, /^(  "version": )"[^"]*"/m, `$1"${v}"`, "tauri.conf.json version"),
  // First `version =` line is [package]'s; dependency versions sit in inline tables.
  "desktop/src-tauri/Cargo.toml": (t, v) => replaceOnce(t, /^version = "[^"]*"/m, `version = "${v}"`, "Cargo.toml version"),
};

function stamp(root, version, build) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) throw new Error(`stamp: not a version: ${version}`);
  for (const [file, fn] of Object.entries(STAMPERS)) {
    const p = path.join(root, file);
    fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"), version, build));
  }
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "next-beta") {
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, ".release-please-manifest.json"), "utf8"))["."];
    // %B plus a NUL separator: whole messages, so BREAKING CHANGE footers count too.
    const messages = git("log", `v${base}..HEAD`, "--format=%B%x00").split("\0").map(s => s.trim()).filter(Boolean);
    const tags = git("tag", "--list", "v*-beta.*").split("\n").filter(Boolean);
    process.stdout.write(nextBetaVersion(base, messages, tags) + "\n");
  } else if (cmd === "stamp" && rest.length === 2) {
    stamp(ROOT, rest[0], rest[1]);
  } else {
    process.stderr.write("usage: release-version.js next-beta | stamp <version> <build>\n");
    process.exitCode = 2;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { nextStableVersion, nextBetaVersion, STAMPERS };
