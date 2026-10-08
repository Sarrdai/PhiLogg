// GROUP 98 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 98 — Settings "Behavior" section split into subsections
   (FEATURE_BACKLOG.md #30). Appearance/Log Formats already grouped their
   rows into more than one .settings-card (see GROUP 79); Behavior was the
   one section still a single flat card of 9 unrelated rows. Split into:
   a standalone general row, "Hover-to-expand panels" (4 rows), "Filter
   tree" (1 row), and "Text-match highlighting" (3 rows) — same markup
   pattern (.settings-subsection-title + .settings-card) already used by
   Appearance's "Custom themes" and Log Formats' "Filename rules". Pure
   markup regrouping: no ids changed, so every other group's
   #settingsHoverExpandSidebar/#settingsTempAnchorMode/etc. selectors
   still resolve — this group only asserts the new grouping itself.

   Updated this session (FEATURE_BACKLOG.md #8): a new "Timeline minimap"
   subsection (1 row, #settingsHideMinimapFullRangeInFullView) was inserted
   between "Hover-to-expand panels" and "Filter tree" — same markup pattern,
   pushing every subsequent subsection/card index down by one.

   Superseded 2026-10-07 (settings-grid cleanup): Behavior is now nine groups
   (Views ... Desktop app); the assertions below pin that grouping instead.
   ============================================================ */
group(98);
await withApp(async (w, d, T) => {
  section("98. Settings Behavior section: subsection split");
  await waitForFormatConfig(T);

  fireClick(d.querySelector("#btnSettings"), w);
  const behaviorSection = d.getElementById("settingsSectionBehavior");
  assert(behaviorSection, "the Behavior section exists");

  // Regrouped by the settings-grid cleanup (variant C): nine groups, in this order.
  const subsectionTitles = [...behaviorSection.querySelectorAll(".settings-subsection-title")].map(el => el.textContent);
  const expectedTitles = ["Views", "Toolbars", "Panels", "Context view", "Timeline minimap", "Filter tree", "Match highlighting", "Copy & export", "Desktop app"];
  assert(JSON.stringify(subsectionTitles) === JSON.stringify(expectedTitles),
    "Behavior has the nine groups in order, got " + JSON.stringify(subsectionTitles));

  const cards = [...behaviorSection.querySelectorAll(".settings-card")];
  assert(cards.length === 9, "Behavior is split into 9 cards, one per group, got " + cards.length);

  const cardOf = id => d.getElementById(id).closest(".settings-card");
  const groupOf = {
    0: ["settingsFhLayout", "settingsFilterActivationView", "settingsOpenScrollPosition"],
    1: ["settingsSidebarToolbarLabels", "settingsLevelLabels", "settingsFilterToolbarLabels", "settingsViewToolbarLabels"],
    2: ["settingsHoverExpandSidebar", "settingsHoverExpandDetail"],
    3: ["settingsContextInitialExpansion", "settingsContextExpandStepUnit", "settingsContextExpandStep", "settingsContextExpandStepMs"],
    4: ["settingsHideMinimapFullRangeInFullView", "settingsMinimapBinningMode"],
    5: ["settingsTempAnchorMode", "settingsTempAnchorAcrossFiles", "tempAnchorFadeValue", "settingsShowSources", "settingsTreeIndicatorMode"],
    6: ["settingsTextMatchHighlightScope", "settingsTextMatchHighlightRows", "settingsTextMatchHighlightDetail"],
    7: ["settingsClipboardDecimalSelect"],
    8: ["settingsQuitOnLastClose", "settingsCloseToTray"],
  };
  Object.keys(groupOf).forEach(i => groupOf[i].forEach(id =>
    assert(cardOf(id) === cards[i], "#" + id + " sits in the \"" + expectedTitles[i] + "\" card")));
  assert(!d.getElementById("settingsLevelFilterTreeMode"), "the level-bar tree-mode setting is gone (chips are a pure view filter)");

  // Every row's control is still reachable/functional after the regrouping
  // (behavior itself is covered by GROUPs 91/92/93/94 — this just confirms
  // the move didn't detach anything from the live DOM/listeners).
  const quitCb = d.getElementById("settingsQuitOnLastClose");
  const before = pillChecked(quitCb);
  fireClick(quitCb, w);
  assert(pillChecked(quitCb) === !before, "the relocated quit-on-close toggle still toggles");
  fireClick(quitCb, w); // restore
});
