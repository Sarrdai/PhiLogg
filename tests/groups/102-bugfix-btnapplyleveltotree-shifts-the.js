// GROUP 102 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 102 — Bugfix: #btnApplyLevelToTree shifts the filter chain
   (FEATURE_BACKLOG.md #37)
   Origin: this session (2026-08-25), bug report with screenshots: switching
   Settings -> Behavior's level-filter-tree mode to "explicit" (Manual)
   revealed #btnApplyLevelToTree ("Add to tree") in #viewBar, and the active
   filter chain (#breadcrumb) visibly shifted/wrapped differently than while
   the button was hidden (the setting is gone since the level bar became a
   pure view filter; the button now shows while a chip is selected). Root cause: every other
   button pinned to #viewBar's top-left float line (#fhTabs,
   #btnPinBookmarks, #btnMultilineMsg, #btnColumns,
   #btnTextMatchHighlight, #levelBar — see the "Unified view bar" CSS
   comment) carries float:left plus the shared 14px/0px margin, but
   #btnApplyLevelToTree never got that rule. Toggled via display:none/""
   rather than added/removed from the DOM, so once visible it sat as an
   unfloated normal-flow block sibling of the #levelBar float and dropped
   below it, pushing #breadcrumb's line-wrap start down too. Fix: give
   #btnApplyLevelToTree the same float:left + margin as its siblings, so it
   just extends the SAME dynamic top-left line no matter how many buttons
   end up on it — scales to future buttons in that row without further
   layout work.
   UPDATED a later session (UI overhaul, person-requested: a dividing line
   between the level filter and the standard filters, uniform spacing for
   the whole row): #btnApplyLevelToTree's own margin dropped to 0 — the gap
   to the standard-filters group now comes from a `.row-action-separator`
   placed right after it, same mechanism the other group boundaries in
   #viewBar already used, rather than a bespoke blank-gap margin. The
   float:left half of this fix (staying on the line, not dropping below it)
   is unchanged and still what this group covers.
   ============================================================ */
group(102);
await withApp(async (w, d, T) => {
  section("102. #btnApplyLevelToTree joins the pinned top-left float flow");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  const applyBtn = d.querySelector("#btnApplyLevelToTree");
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  assert(isVisible(applyBtn, w), "sanity: a selected level chip reveals #btnApplyLevelToTree");

  const cs = w.getComputedStyle;
  assert(cs(applyBtn).float === "left", "#btnApplyLevelToTree floats left, joining #fhTabs/#levelBar's pinned top-left line");
  assert(cs(applyBtn).marginRight === "0px" && cs(applyBtn).marginBottom === "0px",
    "...with zero own margin (UI-overhaul session: the gap to the standard filters now comes from the .row-action-separator right after it, not a bespoke margin), so it doesn't sit any differently on the line");
});
