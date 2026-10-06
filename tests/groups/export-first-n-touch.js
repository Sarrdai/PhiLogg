// GROUP export-first-n-touch — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP export-first-n-touch — the export dialog's "First [N]" segment on touch
   Origin: 2026-10-06 (phone usability round, step A4). The generic coarse 44px
   dialog-input rule made #exportFirstN stick out of its 30px segment. Under
   pointer:coarse (phone + compact) the segment buttons are 44px and the input
   a 32px field fully inside. jsdom has no layout: asserted on the CSSOM.
   ============================================================ */
group("export-first-n-touch");

await withApp(async (w, d) => {
  section("export-first-n-touch a. Coarse rules");
  const rules = [];
  const walk = (list, coarse) => { for (const r of list) { if (r.media) walk(r.cssRules, coarse || /pointer:\s*coarse/.test(r.media.mediaText || "")); else if (r.selectorText) rules.push({ sels: r.selectorText.split(",").map(x => x.trim()), css: r.style.cssText.replace(/\s/g, ""), coarse }); } };
  for (const sh of d.styleSheets) walk(sh.cssRules, false);
  const has = (sel, decl, coarse) => rules.some(r => r.coarse === coarse && r.sels.includes(sel) && r.css.includes(decl));
  ["body.layout-phone", "body.layout-compact"].forEach(t => {
    assert(has(t + " #exportDialog .export-seg .assert-mode-btn", "height:44px", true), t + ": segment buttons 44px under coarse");
    assert(has(t + " #exportDialog #exportFirstN", "height:32px", true) && has(t + " #exportDialog #exportFirstN", "min-height:0", true), t + ": First-N input 32px, min-height reset");
  });
  assert(has("body.layout-phone #exportDialog #exportFirstN", "font-size:16px", true), "phone: 16px input font (no iOS zoom)");
  assert(rules.filter(r => r.sels.some(s => /exportFirstN|export-seg/.test(s) && /44px/.test(r.css))).every(r => r.coarse && r.sels.every(s => /^body\.layout-(phone|compact)\s/.test(s))), "44px export rules only in the coarse block, tier-scoped");
  assert(has("#exportFirstN", "height:20px", false) && has("#exportDialog .export-seg .assert-mode-btn", "height:30px", false), "desktop sizes unchanged");
});
