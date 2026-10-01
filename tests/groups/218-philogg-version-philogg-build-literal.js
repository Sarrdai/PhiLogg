// GROUP 218 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 218 — PHILOGG_VERSION / PHILOGG_BUILD literal shape
   Origin: this session (2026-09-15, person-requested: real semantic
   versioning, FEATURE_BACKLOG.md #72). Companion to GROUP 65 (which checks
   the DOM-rendered values) and GROUP 146 (which checks the same
   PHILOGG_BUILD line survives comment-stripping): this group pins the
   exact literal shape in the SOURCE file that both the release workflows'
   `sed` and release-please's "generic" extra-file marker
   (`x-release-please-version`) depend on, so a future refactor can't
   silently break either replace target. Top-level `const` isn't exposed
   on the jsdom bridge (see withApp's own comment / GROUP 91's provenance
   note), so this reads philogg.html's raw text directly instead — no
   window needed, like GROUP 146.
   UPDATED same day, same session, bug found via the actual release-please
   run: the marker MUST be a trailing comment on the SAME line as the
   value — release-please's generic updater "replaces the value on that
   line only" (its own docs' wording), so a marker on the line ABOVE finds
   no version-shaped token on its own line and silently rewrites nothing.
   The first live run proved this: PHILOGG_VERSION stayed stuck at 0.1.0
   in philogg.html while the manifest/desktop files correctly advanced to
   0.2.0. Assertion below updated to match the corrected same-line form.
   ============================================================ */
group(218);
if (groupSelected()) { // no jsdom window needed, like GROUP 146
  section("218. Exact literal shape both the build sed and release-please's marker depend on");
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "philogg.html"), "utf8");

  assert(/const PHILOGG_VERSION = "\d+\.\d+\.\d+"; \/\/ x-release-please-version/.test(src),
    "philogg.html contains the exact `const PHILOGG_VERSION = \"X.Y.Z\"; // x-release-please-version` literal, marker TRAILING on the same line — release-please's generic updater only replaces the value on the marker's own line");
  assert(/const PHILOGG_BUILD = "[^"]*";/.test(src),
    "philogg.html contains the exact `const PHILOGG_BUILD = \"...\";` literal scripts/release-version.js stamps");
  assert(!/const PHILOGG_VERSION = "dev";/.test(src),
    "PHILOGG_VERSION is never left at the old placeholder literal — it is always a real, committed semver");
}
