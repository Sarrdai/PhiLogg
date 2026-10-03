// GROUP find-bar-phone-layout — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP find-bar-phone-layout — the find bar as a two-row grid on the phone tier
   Origin: 2026-10-03. jsdom has no layout, so the layout is asserted on the CSS
   rules themselves (grid areas, sizes, scoping); the real geometry was checked
   in Chromium via tools/log-sim/screenshot.js at 375 and 320 px.
   ============================================================ */
group("find-bar-phone-layout");

await withApp(async (w, d, T) => {
  const rules = [];
  const walk = (list, coarse) => {
    for (const r of list) {
      if (r.media) walk(r.cssRules, coarse || /pointer:\s*coarse/.test(r.media.mediaText || r.conditionText || ""));
      else if (r.selectorText) rules.push({ sel: r.selectorText, css: r.cssText.replace(/\s+/g, " "), coarse });
    }
  };
  for (const sheet of d.styleSheets) walk(sheet.cssRules, false);
  const find = (sel, coarse) => rules.filter(r => r.coarse === coarse && r.sel.split(",").map(x => x.trim()).includes(sel));
  const has = (sel, decl, coarse = false) => find(sel, coarse).some(r => r.css.replace(/\s/g, "").includes(decl));

  section("find-bar-phone-layout a. Phone: full-width two-row grid");
  assert(has("body.layout-phone #findBar", "left:8px") && has("body.layout-phone #findBar", "right:8px") && has("body.layout-phone #findBar", "max-width:none"),
    "bar spans the full #fhSplit width");
  assert(has("body.layout-phone #findBar", "display:grid"), "bar is a grid");
  const grid = find("body.layout-phone #findBar", false).map(r => r.css).join(" ");
  const iInput = grid.search(/"input input/), iCase = grid.search(/"case/);
  assert(iInput > 0 && iCase > iInput, "row 1 (input...) is declared before row 2 (case...)");
  assert(/"input input input input input count close"/.test(grid), "row 1 = input, count, close");
  assert(/"case\s+regex\s+gap\s+prev\s+next\s+add\s+add"/.test(grid), "row 2 = Aa, .*, gap, prev, next, add as filter");
  assert(/minmax\(0,\s*1fr\)/.test(grid), "a flexible 1fr track takes the free width");
  [["#findInput", "input"], ["#findCount", "count"], ["#findCloseBtn", "close"], ["#findCaseBtn", "case"], ["#findRegexBtn", "regex"],
   ["#findPrevBtn", "prev"], ["#findNextBtn", "next"], ["#findAddFilterBtn", "add"]].forEach(([id, area]) =>
    assert(has("body.layout-phone " + id, "grid-area:" + area), id + " sits in area " + area));
  assert(has("body.layout-phone #findInput", "min-width:0") && has("body.layout-phone #findInput", "width:auto"), "input may shrink (320px safe)");
  assert(has("body.layout-phone #findCount", "min-width:0"), "count min-width shrinks on phone");

  section("find-bar-phone-layout b. Phone: 40px controls, 16px input, coarse bumps to 44");
  assert(has("body.layout-phone #findInput", "height:40px") && has("body.layout-phone #findInput", "font-size:16px"), "input 40px tall, 16px font (no iOS zoom)");
  assert(has("body.layout-phone #findBar .find-opt", "height:40px") && has("body.layout-phone #findBar .find-opt", "min-width:40px"), "Aa / .* 40x40");
  assert(has("body.layout-phone #findBar .find-nav-btn", "width:40px") && has("body.layout-phone #findBar .find-nav-btn", "height:40px"), "prev / next 40x40");
  assert(has("body.layout-phone #findCloseBtn", "height:40px") && has("body.layout-phone #findAddFilterBtn", "height:40px"), "close + add-as-filter 40 tall");
  assert(has("body.layout-phone #findInput", "height:44px", true) && has("body.layout-phone #findAddFilterBtn", "height:44px", true)
    && has("body.layout-phone #findBar .find-opt", "height:44px", true) && has("body.layout-phone #findBar .find-nav-btn", "height:44px", true)
    && has("body.layout-phone #findCloseBtn", "height:44px", true), "coarse pointer: 44px tall");
  assert(has("body.layout-phone #findBar .find-nav-btn", "width:44px", true) && has("body.layout-phone #findCloseBtn", "width:44px", true), "coarse pointer: 44px wide");

  section("find-bar-phone-layout c. Phone: recent-filters dropdown under the bar");
  assert(has("body.layout-phone #findBar .recent-dd .rd-row", "min-height:40px") && has("body.layout-phone #findBar .recent-dd .rd-row", "min-height:44px", true), "rows 40 / 44 coarse");
  assert(has("body.layout-phone #findBar .recent-dd .rd-x", "opacity:1") && has("body.layout-phone #findBar .recent-dd .rd-x", "width:32px"), "remove x always visible, 32px wide");
  assert(has("body.layout-phone #findBar .recent-dd .rd-hint", "display:none"), "keyboard hint hidden");

  section("find-bar-phone-layout d. Desktop and compact untouched");
  const phoneOnly = rules.filter(r => /#find/.test(r.sel) && r.css.includes("grid-area"));
  assert(phoneOnly.length >= 8 && phoneOnly.every(r => r.sel.split(",").every(s => /^body\.layout-phone\s/.test(s.trim()))), "every grid-area rule is phone-scoped");
  const base = find("#findBar", false).map(r => r.css).join(" ");
  assert(/display:\s*flex/.test(base) && !/grid/.test(base), "base #findBar stays a single flex row");
  const coarseFind = rules.filter(r => r.coarse && /find/.test(r.sel));
  assert(coarseFind.length > 0 && coarseFind.every(r => r.sel.split(",").every(s => /^body\.layout-phone\s/.test(s.trim()))), "coarse find-bar rules are phone-scoped");

  section("find-bar-phone-layout e. The bar still opens and closes on phone");
  w.innerWidth = 375; w.dispatchEvent(new w.Event("resize"));
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id; w.render();
  w.openFindBar();
  assert(!d.getElementById("findBar").classList.contains("hidden"), "find bar opens on phone");
  w.closeFindBar();
  assert(d.getElementById("findBar").classList.contains("hidden"), "find bar closes on phone");
});
