// GROUP viewbar-touch-scroll — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP viewbar-touch-scroll — #viewBar is one scrolling row on tablet touch
   Origin: 2026-10-04 (tablet retest). The floated children wrapped onto a 2nd line at 820px
   (the "+" alone). Inside @media (pointer:coarse) the compact tier makes it a nowrap,
   horizontally scrollable flex row; desktop/phone rules are untouched. jsdom has no layout:
   asserted on the CSS rules, like responsive-touch.
   ============================================================ */
group("viewbar-touch-scroll");

await withApp(async (w, d, T) => {
  const coarse = [], plain = [];
  const walk = (rules, inCoarse) => {
    for (const r of rules) {
      if (r.media) walk(r.cssRules, inCoarse || /pointer:\s*coarse/.test(r.media.mediaText || r.conditionText || ""));
      else if (r.selectorText) (inCoarse ? coarse : plain).push(r);
    }
  };
  for (const sheet of d.styleSheets) walk(sheet.cssRules, false);
  const find = (list, sel) => list.filter(r => r.selectorText.split(",").map(x => x.trim()).includes(sel));
  const decl = (list, sel, prop) => find(list, sel).map(r => r.style.getPropertyValue(prop)).filter(Boolean).pop();

  section("viewbar-touch-scroll a. Compact + coarse: nowrap, scrollable flex row");
  assert(decl(coarse, "body.layout-compact #viewBar", "display") === "flex", "display:flex");
  assert(decl(coarse, "body.layout-compact #viewBar", "flex-wrap") === "nowrap", "flex-wrap:nowrap");
  assert(decl(coarse, "body.layout-compact #viewBar", "overflow-x") === "auto", "overflow-x:auto");
  assert(decl(coarse, "body.layout-compact #viewBar > *", "flex") === "0 0 auto", "children do not shrink");
  assert(decl(coarse, "body.layout-compact #viewBar > *", "float") === "none", "floats off");
  assert(decl(coarse, "body.layout-compact #viewBar > #btnFacets", "margin-left") === "auto", "Facets stays right-aligned");

  section("viewbar-touch-scroll b. Desktop and phone rules unchanged");
  assert(decl(plain, "#viewBar", "display") === "flow-root", "desktop: flow-root");
  assert(decl(plain, "body.layout-phone #viewBar", "flex-wrap") === "wrap", "phone: wrap (own rule)");
  assert(!plain.some(r => /layout-compact #viewBar/.test(r.selectorText)), "no un-media'd compact #viewBar rule (mouse windows keep floats)");
});
