// GROUP 65 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 65 — License section (Settings) + version display
   Origin: this session (2026-08-20), person-requested: a proprietary
   license (no redistribution, no modification, rights holder Philipp
   Klein). Originally a popup behind a dedicated header button, same
   pattern as the old #shortcutsPanel (Group 26) — both header buttons
   (#btnShortcuts/#btnLicense) and their popups were removed in a later
   session (FEATURE_BACKLOG.md #48 follow-up): License is now its own
   Settings section (GROUP 115 covers Settings' own section list/order),
   reached only through Settings, with no direct header shortcut to it.
   UPDATED this session (2026-09-15, person-requested: real semantic
   versioning, FEATURE_BACKLOG.md #72): the single "version" constant
   split in two. `PHILOGG_VERSION` is now a real, committed semver (e.g.
   "0.1.0"), bumped only by a merged release-please PR — shown next to the
   product name, no "v" prefix, and repeated in the License section. The
   short commit hash moved to its own `PHILOGG_BUILD` constant, shown only
   in the License section (never the toolbar) — it still defaults to the
   literal "dev" in source control and is stamped to a real short SHA only
   by the release build (.github/workflows/build-release-assets.yml, used
   by the stable and beta release workflows — see GROUP 340), in a
   build artifact never committed back. This suite runs against the
   literal source file, so PHILOGG_VERSION is whatever real version is
   currently committed and PHILOGG_BUILD always reads "dev".
   ============================================================ */
group(65);
await withApp(async (w, d, T) => {
  section("65. License section (Settings) + version display");

  assert(!d.querySelector("#btnShortcuts"), "the header help button is gone (FEATURE_BACKLOG.md #48 follow-up)");
  assert(!d.querySelector("#btnLicense"), "the header license button is gone (moved into Settings)");

  // --- Version display: real committed semver, no "v" prefix ---
  const brandVersion = d.querySelector("#brandVersion").textContent;
  assert(/^\d+\.\d+\.\d+$/.test(brandVersion), "brand-name version tag shows PHILOGG_VERSION verbatim as a bare semver (no \"v\" prefix), got " + JSON.stringify(brandVersion));

  w.openSettingsDialog();
  const licenseSection = d.querySelector("#settingsSectionLicense");
  assert(licenseSection, "a dedicated License section exists in Settings");
  assert(d.querySelector("#licenseVersion").textContent === "Version: " + brandVersion, "the section's own version line shows the same PHILOGG_VERSION as the toolbar");
  assert(d.querySelector("#licenseBuild").textContent === "Build: dev", "the section's build line shows PHILOGG_BUILD, unstamped source -> literal \"dev\"");
  const licenseText = licenseSection.textContent;
  assert(licenseText.includes("Philipp Klein"), "License section names the rights holder");
  assert(licenseText.includes("philogg@kleinphilipp.de"), "License section shows the contact address");
  assert(licenseText.includes("PolyForm Noncommercial License 1.0.0"), "License section names the license (terms and third-party notices: GROUP 271)");
});
