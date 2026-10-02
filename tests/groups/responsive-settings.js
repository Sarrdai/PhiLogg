// GROUP responsive-settings — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP responsive-settings — Settings dialog on the phone tier
   Origin: 2026-10-02 (responsive layout correction). Phone: no Shortcuts
   (no keyboard), no theme/scheme/format editors (lists stay read-only),
   active-section fallback to Appearance; compact + desktop unchanged.
   Layout (stacked rows, full-screen card) is verified with screenshots —
   jsdom has no layout; here only display toggles via getComputedStyle.
   ============================================================ */
group("responsive-settings");

const setWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const shown = (d, w, sel) => { const e = d.querySelector(sel); return !!e && w.getComputedStyle(e).display !== "none"; };

await withApp(async (w, d, T) => {
  section("responsive-settings a. Phone hides Shortcuts + editor entry points; preferences stay");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  setWidth(w, 1440);
  w.openSettingsDialog();
  ["#settingsNavItemShortcuts", "#settingsSectionShortcuts", "#settingsCustomThemesTitle", "#btnThemeNew", "#btnSyntaxNew", "#btnAddFormat", "#btnAddFormatRule", "#settingsNav .settings-nav-footnote"]
    .forEach(sel => assert(shown(d, w, sel), "desktop: " + sel + " visible"));
  setWidth(w, 820);
  ["#settingsNavItemShortcuts", "#btnThemeNew", "#btnAddFormat", "#settingsNav .settings-nav-footnote"]
    .forEach(sel => assert(shown(d, w, sel), "compact: " + sel + " visible"));

  setWidth(w, 390);
  ["#settingsNavItemShortcuts", "#settingsSectionShortcuts", "#settingsCustomThemesTitle", "#customThemeListCard",
    "#settingsCustomSyntaxTitle", "#customSyntaxSchemeListCard", "#btnAddFormat", "#btnAddFormatRule", "#settingsNav .settings-nav-footnote"]
    .forEach(sel => assert(!shown(d, w, sel), "phone: " + sel + " hidden"));
  ["#settingsSectionAppearance", "#settingsSectionBehavior", "#settingsSectionFormats", "#settingsSectionLicense", "#settingsThemeLightSelect",
    "#settingsUiFontSelect", "#fontScaleUp", "#settingsOpenScrollPosition", '[data-nav-target="settingsSectionLicense"]']
    .forEach(sel => assert(shown(d, w, sel), "phone: " + sel + " stays usable"));
  const editBtns = [...d.querySelectorAll("#formatListCard .filter-library-row > button")];
  assert(editBtns.length > 0 && editBtns.every(b => w.getComputedStyle(b).display === "none"), "phone: format list row buttons (Edit/Export/Reset/Delete) hidden");

  setWidth(w, 1440);
  ["#settingsNavItemShortcuts", "#btnThemeNew", "#btnAddFormat"].forEach(sel => assert(shown(d, w, sel), "back on desktop: " + sel + " visible again"));
});

await withApp(async (w, d, T) => {
  section("responsive-settings b. Active Shortcuts item falls back to Appearance on phone");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  setWidth(w, 1440);
  w.openSettingsDialog();
  d.querySelector("#settingsNavItemShortcuts").click();
  assert(d.querySelector("#settingsNavItemShortcuts").classList.contains("active"), "sanity: Shortcuts is the active nav item on desktop");
  setWidth(w, 390);
  const active = [...d.querySelectorAll(".settings-nav-item.active")].map(b => b.dataset.navTarget);
  assert(active.join() === "settingsSectionAppearance", "shrinking to phone moves the active item to Appearance, got " + active.join());
  d.querySelector("#settingsClose").click();
  setWidth(w, 1440);
  d.querySelector("#settingsNavItemShortcuts").click();
  setWidth(w, 390);
  w.openSettingsDialog();
  assert(d.querySelector('[data-nav-target="settingsSectionAppearance"]').classList.contains("active")
    && !d.querySelector("#settingsNavItemShortcuts").classList.contains("active"), "opening Settings on phone never shows Shortcuts active");
});
