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
   ============================================================ */
group(98);
await withApp(async (w, d, T) => {
  section("98. Settings Behavior section: subsection split");
  await waitForFormatConfig(T);

  fireClick(d.querySelector("#btnSettings"), w);
  const behaviorSection = d.getElementById("settingsSectionBehavior");
  assert(behaviorSection, "the Behavior section exists");

  const subsectionTitles = [...behaviorSection.querySelectorAll(".settings-subsection-title")].map(el => el.textContent);
  assert(subsectionTitles.length === 5,
    "Behavior now has 5 subsection titles (general row stays un-headed, like Appearance's own first card), got " + JSON.stringify(subsectionTitles));
  assert(subsectionTitles[0].startsWith("Hover-to-expand panels"), "first subsection is the hover-to-expand group, got " + subsectionTitles[0]);
  assert(subsectionTitles[1].startsWith("Context view"), "second subsection is the context-view group, got " + subsectionTitles[1]);
  assert(subsectionTitles[2].startsWith("Timeline minimap"), "third subsection is the timeline-minimap group, got " + subsectionTitles[2]);
  assert(subsectionTitles[3].startsWith("Filter tree"), "fourth subsection is the filter-tree group, got " + subsectionTitles[3]);
  assert(subsectionTitles[4].startsWith("Text-match highlighting"), "fifth subsection is the text-match-highlighting group, got " + subsectionTitles[4]);

  const cards = [...behaviorSection.querySelectorAll(".settings-card")];
  assert(cards.length === 6, "Behavior is split into 6 cards (general + 5 subsections), got " + cards.length);

  const cardOf = id => d.getElementById(id).closest(".settings-card");
  assert(cardOf("settingsQuitOnLastClose") === cards[0], "the quit-on-close row sits alone in the first, un-headed card");
  [ "settingsHoverExpandSidebar", "settingsHoverExpandDetail" ]
    .forEach(id => assert(cardOf(id) === cards[1], "#" + id + " sits in the hover-to-expand card"));
  assert(cardOf("settingsContextInitialExpansion") === cards[2], "the context-view initial-expansion row sits in its own context-view card");
  assert(cardOf("settingsHideMinimapFullRangeInFullView") === cards[3], "the minimap-full-range-toggle row sits in its own timeline-minimap card");
  assert(!d.getElementById("settingsLevelFilterTreeMode"), "the level-bar tree-mode setting is gone (chips are a pure view filter)");
  assert(cardOf("settingsTempAnchorMode") === cards[4], "the temporary-anchor row sits in the filter-tree card");
  [ "settingsTextMatchHighlightScope", "settingsTextMatchHighlightRows", "settingsTextMatchHighlightDetail" ]
    .forEach(id => assert(cardOf(id) === cards[5], "#" + id + " sits in the text-match-highlighting card"));

  // Every row's control is still reachable/functional after the regrouping
  // (behavior itself is covered by GROUPs 91/92/93/94 — this just confirms
  // the move didn't detach anything from the live DOM/listeners).
  const quitCb = d.getElementById("settingsQuitOnLastClose");
  const before = pillChecked(quitCb);
  fireClick(quitCb, w);
  assert(pillChecked(quitCb) === !before, "the relocated quit-on-close toggle still toggles");
  fireClick(quitCb, w); // restore
});
