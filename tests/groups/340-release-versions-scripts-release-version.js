// GROUP 340 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 340 — Release versions (scripts/release-version.js): the next beta
   version follows release-please's bump rule (feat/breaking -> MINOR below
   1.0.0, else PATCH) plus "-beta.N" counted per target version; the stamp
   rewrites the version in all four files release-please keeps in sync and
   the build hash. The workflows wire it up: beta-release.yml is main-only
   and publishes a pre-release, both release workflows share
   build-release-assets.yml, and the old tester workflow is gone. Each
   desktop file (installer, portable zip, ...) is its own unzipped artifact.
   ============================================================ */
group(340);
if (groupSelected()) {
  section("340. Release versions: next beta + stamp");
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..");
  const rv = require("../scripts/release-version.js");

  assert(rv.nextStableVersion("0.1.0", ["fix: a", "docs: b"]) === "0.1.1", "fix only -> patch");
  assert(rv.nextStableVersion("0.1.0", ["fix: a", "feat(ui): b"]) === "0.2.0", "feat (with scope) -> minor");
  assert(rv.nextStableVersion("0.1.3", ["refactor!: a"]) === "0.2.0", "breaking below 1.0.0 -> minor (bump-minor-pre-major)");
  assert(rv.nextStableVersion("0.1.0", ["chore: a\n\nBREAKING CHANGE: b"]) === "0.2.0", "BREAKING CHANGE footer counts");
  assert(rv.nextStableVersion("1.2.3", ["feat!: a"]) === "2.0.0", "breaking from 1.0.0 on -> major");
  assert(rv.nextStableVersion("0.1.0", ["Merge feature: x"]) === "0.1.1", "a non-conventional subject never bumps minor");

  assert(rv.nextBetaVersion("0.1.0", ["feat: a"], []) === "0.2.0-beta.1", "first beta of a version is beta.1");
  assert(rv.nextBetaVersion("0.1.0", ["feat: a"], ["v0.2.0-beta.1", "v0.2.0-beta.2", "v0.1.1-beta.7", "v0.1.0"]) === "0.2.0-beta.3",
    "counts only the target version's betas");
  assert(rv.nextBetaVersion("0.1.0", ["feat: a"], ["v0.2.0-beta.1", "v0.2.0-beta.4"]) === "0.2.0-beta.5", "max + 1, a deleted beta never comes back");
  assert(rv.nextBetaVersion("0.1.0", ["feat: a"], ["v0.2.0-beta.10", "v0.2.0-beta.9"]) === "0.2.0-beta.11", "numeric, not lexical, order");

  const html = fs.readFileSync(path.join(root, "philogg.html"), "utf8");
  const stamped = rv.STAMPERS["philogg.html"](html, "0.2.0-beta.3", "abc1234");
  assert(stamped.includes('const PHILOGG_VERSION = "0.2.0-beta.3"; // x-release-please-version') && stamped.includes('const PHILOGG_BUILD = "abc1234";'),
    "philogg.html: version (marker kept for release-please) and build hash");
  assert(stamped.length === html.length + "0.2.0-beta.3".length + "abc1234".length - JSON.parse(fs.readFileSync(path.join(root, ".release-please-manifest.json"), "utf8"))["."].length - "dev".length,
    "nothing else in philogg.html changes");
  for (const f of ["desktop/package.json", "desktop/src-tauri/tauri.conf.json"]) {
    const out = rv.STAMPERS[f](fs.readFileSync(path.join(root, f), "utf8"), "0.2.0-beta.3");
    assert(JSON.parse(out).version === "0.2.0-beta.3", f + ": top-level version stamped");
  }
  const cargo = rv.STAMPERS["desktop/src-tauri/Cargo.toml"](fs.readFileSync(path.join(root, "desktop/src-tauri/Cargo.toml"), "utf8"), "0.2.0-beta.3");
  assert(/^\[package\]\nname = "philogg-desktop"\nversion = "0.2.0-beta.3"$/m.test(cargo), "Cargo.toml: [package] version stamped");
  const extra = JSON.parse(fs.readFileSync(path.join(root, "release-please-config.json"), "utf8")).packages["."]["extra-files"].map(e => e.path);
  assert(extra.every(p => rv.STAMPERS[p]) && Object.keys(rv.STAMPERS).every(p => extra.includes(p)),
    "the stamp covers exactly release-please's extra-files");
  let threw = false;
  try { rv.STAMPERS["philogg.html"]("no version here", "1.0.0", "x"); } catch (e) { threw = true; }
  assert(threw, "a missing target fails the build instead of shipping an unstamped file");

  section("340b. Workflows: beta from main only, shared build, no tester workflow");
  const wf = f => fs.readFileSync(path.join(root, ".github/workflows", f), "utf8");
  assert(!fs.existsSync(path.join(root, ".github/workflows/build-tester-files.yml")), "Build Tester Files is gone");
  const beta = wf("beta-release.yml");
  assert(/if: github\.ref != 'refs\/heads\/main'/.test(beta), "beta refuses to run outside main");
  assert(/release-version\.js next-beta/.test(beta) && /--prerelease/.test(beta), "beta computes its version and publishes a pre-release");
  assert(/fetch-depth: 0/.test(beta), "beta checks out full history + tags for the version");
  for (const f of ["beta-release.yml", "release-please.yml"]) {
    assert(/uses: \.\/\.github\/workflows\/build-release-assets\.yml/.test(wf(f)), f + " uses the shared build");
  }
  const build = wf("build-release-assets.yml");
  assert((build.match(/release-version\.js stamp "\$VERSION"/g) || []).length === 2, "both build jobs stamp the version");
  assert(/7z a -tzip "\.\.\/\$\{STAGE\}\.zip" \./.test(build), "portable build is zipped once");
  const rawUploads = build.match(/uses: actions\/upload-artifact@v7\n\s+if: steps\.(installer|portable)\.outputs\.file != ''\n\s+with:\n\s+path: \$\{\{ steps\.\1\.outputs\.file \}\}\n\s+archive: false/g) || [];
  assert(rawUploads.length === 2, "installer and portable zip are separate, unzipped artifacts");
  for (const f of ["beta-release.yml", "release-please.yml"]) {
    assert(/pattern: release-html\n\s+path: dist\n\s+merge-multiple: true\n/.test(wf(f)) &&
      /pattern: PhiLogg-\*\n\s+path: dist\n\s+merge-multiple: true\n\s+skip-decompress: true/.test(wf(f)),
      f + ": HTML artifact unpacked, desktop files kept as-is (portable zip stays a zip)");
  }

  section("340c. Variant selection: checkboxes on beta, everything on stable");
  const variants = ["html", "windows", "windows_portable", "mac", "linux"];
  for (const v of variants) {
    assert(new RegExp("\\n      " + v + ":\\n        type: boolean\\n        default: true").test(build), "shared build: input " + v + " defaults to true");
    assert(new RegExp("\\n      " + v + ":\\n        description: [^\\n]+\\n        type: boolean").test(beta), "beta: checkbox " + v);
    assert(beta.includes(v + ": ${{ inputs." + v + " }}"), "beta passes " + v + " to the build");
  }
  const rp = wf("release-please.yml");
  assert(!variants.some(v => rp.includes(v + ": ${{")), "stable passes no selection, so the build's defaults (all variants) apply");
  assert(/if: inputs\.html/.test(build) && /WINDOWS: \$\{\{ inputs\.windows \|\| inputs\.windows_portable \}\}/.test(build),
    "HTML job and the Windows runner follow the selection (portable alone still needs the Windows runner)");
  assert(/"macos-latest"/.test(build) && /"ubuntu-22\.04"/.test(build), "macOS and Linux runners are part of the matrix");
}
