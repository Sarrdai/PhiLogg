// GROUP toolbar-always-overflow — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP toolbar-always-overflow — view toolbars scroll inside themselves
   Origin: 2026-10-03 (tablet usability test). "View Toolbar button labels:
   Always" turns the buttons into inline pills; the toolbar rows had no overflow
   handling, so the whole page scrolled sideways. Now the four toolbars get
   overflow-x:auto in the always mode only (overflow would clip the floating
   "On hover" pills). jsdom has no layout: asserted via getComputedStyle.
   ============================================================ */
group("toolbar-always-overflow");
await withApp(async (w, d, T) => {
  const ids = ["#contextToolbar", "#filteredToolbar", "#tableToolbar", "#plotToolbar"];
  const ox = sel => w.getComputedStyle(d.querySelector(sel)).overflowX;

  section("toolbar-always-overflow a. Default (on-hover) mode: overflow stays visible (floating label pills unclipped)");
  for (const s of ids) assert(ox(s) === "visible" || ox(s) === "", s + " overflow-x visible by default, got " + ox(s));
  for (const s of ids) assert(ox(s) === "visible" || ox(s) === "", s + " overflow-x visible with no always class, got " + ox(s));

  section("toolbar-always-overflow b. Always mode: each toolbar scrolls horizontally, height untouched");
  d.body.classList.add("view-toolbar-labels-always");
  for (const s of ids) {
    assert(ox(s) === "auto", s + " overflow-x auto in always mode, got " + ox(s));
    assert(w.getComputedStyle(d.querySelector(s)).height === "36px", s + " keeps its fixed 36px height");
    assert(w.getComputedStyle(d.querySelector(s)).minWidth === "0px" || w.getComputedStyle(d.querySelector(s)).minWidth === "0", s + " min-width 0");
  }
  const group = d.querySelector("#filteredToolbar .toolbar-group");
  assert(group && w.getComputedStyle(group).flexShrink === "0", "toolbar children don't shrink (they scroll instead)");
  d.body.classList.remove("view-toolbar-labels-always");
  for (const s of ids) assert(ox(s) === "visible" || ox(s) === "", s + " back to visible when the mode is left");
}, { toolbarLabels: "hover" });
