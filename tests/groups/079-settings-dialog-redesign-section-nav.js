// GROUP 79 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 79 — Settings dialog redesign: section nav, unified card/row grid,
   Add-vs-Edit button hierarchy, boolean rows as a switch
   Origin: this session (2026-08-22), Claude-Design handoff bundle
   ("Settings Dialog und Panel-Navigation"). See PROJECT.md for the full
   design reference. IntersectionObserver-driven active-section highlighting
   on scroll isn't exercised here (jsdom has no IntersectionObserver — see
   the guard in the app itself); only the click-wiring + default state.
   ============================================================ */
group(79);
await withApp(async (w, d, T) => {
  section("79. Settings dialog redesign: section nav + unified rows + switch + button hierarchy");
  await waitForFormatConfig(T);

  fireClick(d.querySelector("#btnSettings"), w);

  // 6 sections: GROUP 114 added "Shortcuts", a later follow-up (removing the
  // header's help/license buttons) added "License" as the last section, and
  // GROUP 230 added "IDE Integration" between Behavior and Log Formats — its
  // nav item/section stay in the DOM even without window.philogg (this
  // suite's jsdom environment has none, same as a plain browser build), just
  // hidden via .hidden (see initIdeIntegration), so it still counts here.
  // GROUP 304 added "Assistant" (the LLM assistant, desktop build only) the
  // same way — present, hidden here.
  const navItems = [...d.querySelectorAll("#settingsNav .settings-nav-item")];
  assert(navItems.length === 7, "the section nav lists exactly the seven sections, got " + navItems.length);
  const targets = navItems.map(b => b.dataset.navTarget);
  assert(targets.includes("settingsSectionAppearance") && targets.includes("settingsSectionBehavior") &&
    targets.includes("settingsSectionIde") && targets.includes("settingsSectionLlm") && targets.includes("settingsSectionFormats") &&
    targets.includes("settingsSectionShortcuts") && targets.includes("settingsSectionLicense"),
    "nav items point at Appearance/Behavior/IDE Integration/Log Formats/Shortcuts/License, got " + JSON.stringify(targets));
  assert(targets[targets.length - 1] === "settingsSectionLicense", "License is always the last section in the list");
  targets.forEach(id => assert(d.getElementById(id), "every nav target id resolves to an actual section, missing " + id));

  const appearanceNavItem = navItems.find(b => b.dataset.navTarget === "settingsSectionAppearance");
  assert(appearanceNavItem.classList.contains("active"), "Appearance is the default active nav item on open");

  // Clicking a nav item is wired (calls scrollIntoView, guarded for
  // environments without it — see the app's own comment) and doesn't throw.
  const formatsNavItem = navItems.find(b => b.dataset.navTarget === "settingsSectionFormats");
  fireClick(formatsNavItem, w);

  // Row grid: each row group sits inside one .settings-card, using CSS grid.
  const appearanceCard = d.querySelector("#settingsSectionAppearance .settings-card");
  assert(appearanceCard, "the Appearance section's rows sit inside a .settings-card");
  // Grouped since the settings-grid cleanup (Theme / Text & scale / Syntax
  // highlighting cards); the 9 rows are counted across those three.
  const appearanceRows = [...d.querySelectorAll("#settingsSectionAppearance .settings-card")].slice(0, 3).flatMap(c => [...c.querySelectorAll(".settings-row")]);
  // Theme (mode) + Light theme + Dark theme (GROUP 341) + UI font (GROUP
  // 111f) + Log font (this session) + Syntax highlighting (GROUP 210,
  // FEATURE_BACKLOG.md #67) + Accent color (hidden on a theme without a
  // highlightPalette — see GROUP 87) + UI scale + Log text size (split from
  // the old single Font size row — see GROUP 111e).
  assert(appearanceRows.length === 9, "Theme + Light theme + Dark theme + UI font + Log font + Syntax highlighting + Accent color + UI scale + Log text size are all rows inside the three group cards, got " + appearanceRows.length);
  assert(w.getComputedStyle(appearanceRows[0]).display === "grid", "a settings-row lays out via CSS grid (1fr auto), got " + w.getComputedStyle(appearanceRows[0]).display);

  // Boolean row: rendered as a .pill-toggle (docs/ui-standard.md #69) — a
  // role=switch button with aria-checked state (see GROUP 76 for its behavior).
  const quitCheckbox = d.getElementById("settingsQuitOnLastClose");
  assert(quitCheckbox.tagName === "BUTTON" && quitCheckbox.classList.contains("pill-toggle"), "the boolean setting is a .pill-toggle button");
  assert(quitCheckbox.getAttribute("role") === "switch" && quitCheckbox.hasAttribute("aria-checked"),
    "...a role=switch carrying aria-checked for the on/off state");

  // Button hierarchy: the filled accent (.btn-mini) button is reserved for
  // the primary action (Save) — list-row actions (Edit/Reset) are outline,
  // and the "Add…" affordance is a dashed outline, distinct from both.
  assert(d.querySelectorAll("#formatList .btn-mini, #formatRuleList .btn-mini").length === 0,
    "no filled accent button inside the format/rule list rows themselves");
  assert(d.querySelector("#formatList .btn-mini-outline"), "the Default format row's Edit button is outline-styled");
  assert(d.querySelector("#btnAddFormat").className === "btn-mini-dashed" && d.querySelector("#btnAddFormatRule").className === "btn-mini-dashed",
    "both Add buttons use the dashed style, distinct from Edit's outline and Save's filled accent");
  assert(d.querySelector("#formatEditSave").className === "btn-mini" && d.querySelector("#formatRuleEditSave").className === "btn-mini",
    "Save stays the one filled accent button in each inline panel");
});
