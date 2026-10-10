// GROUP design-polish-p2 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p2 — level counters and the shared level badge
   Origin: 2026-10-10 design polish round, package P2 (A1 + A2). The in-circle counts use
   the UI font, tabular digits, optical centering (text-box trim on an inner span) and a
   1.5px ring; levelCountShort drops a trailing ",0". .level-badge is one shared inline-flex
   17px badge with a 14% fill of the level color for every level.
   ============================================================ */
group("design-polish-p2");

await withApp(async (w, d, T) => {
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sheet of d.styleSheets) walk(sheet.cssRules);
  const rule = sel => rules.filter(r => r.selectorText.split(",").map(x => x.trim()).includes(sel));
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");

  section("design-polish-p2 a. levelCountShort drops a trailing ,0");
  const s = w.levelCountShort;
  [[999, "999"], [1000, "1k"], [1738, "1,7k"], [3058, "3k"], [10500, "10k"], [1050000, "1M"], [1250000, "1,2M"], [25e6, "25M"]]
    .forEach(([n, exp]) => assert(s(n) === exp, "levelCountShort(" + n + ") = " + exp + ", got " + s(n)));

  section("design-polish-p2 b. .level-count CSS: UI font, tabular digits, trimmed, 1.5px ring, no shrink");
  const base = rules.find(r => /^body:not\(\.layout-phone\):not\(\.level-labels-inline\) \.level-btn \.level-count$/.test(r.selectorText));
  assert(base && /650 10\.5px\s*\/\s*1 var\(--font-ui\)/.test(base.style.font), "font: 650 10.5px/1 var(--font-ui), got " + (base && base.style.font));
  assert(base && base.style.fontVariantNumeric === "tabular-nums", "tabular-nums");
  assert(base && !/letter-spacing:\s*-/.test(base.cssText), "no negative letter-spacing");
  assert(/\.level-btn \.level-count > span\{text-box:trim-both cap alphabetic;\}/.test(css), "inner span is trimmed to the cap height");
  assert(/@supports not \(text-box: trim-both cap alphabetic\)\{\s*\.level-btn \.level-count > span\{transform:translateY\(\.06em\);\}/.test(css), "fallback translateY for engines without text-box");
  assert(!/\.level-count[^{]*\{[^}]*8\.5px/.test(css), "no 8.5px count font remains");
  ["error", "warn", "info", "debug", "fatal", "trace", "custom-1", "custom-6"].forEach(l =>
    assert(/inset 0 0 0 1\.5px/.test(rule(".level-btn.lvl-" + l)[0].style.boxShadow), l + " ring is 1.5px"));

  section("design-polish-p2 c. .level-badge: one shared inline-flex badge, 14% fill for every level");
  const badge = rule(".level-badge")[0].style;
  assert(badge.display === "inline-flex" && badge.alignItems === "center" && badge.verticalAlign === "middle", "inline-flex, centered, vertical-align middle");
  assert(/17px/.test(badge.height) && badge.boxSizing === "border-box", "17px high (times the log text scale), border-box, got " + badge.height);
  assert(/650/.test(badge.font) && /10px/.test(badge.font) && /--font-ui/.test(badge.font), "UI font 10px weight 650, got " + badge.font);
  assert(badge.letterSpacing === ".04em" || badge.letterSpacing === "0.04em", "letter-spacing .04em");
  assert(badge.borderRadius === "4px", "4px radius");
  ["error", "warn", "info", "debug", "fatal", "trace", "custom-1", "custom-2", "custom-3", "custom-4", "custom-5", "custom-6"].forEach(l => {
    const r = rule(".lvl-" + l + " .level-badge")[0];
    assert(r && r.style.background.replace(/\s+/g, "").includes("var(--level-" + l + ")14%"), l + " badge fill is 14% of the level color, got " + (r && r.style.background));
    assert(r && /--level-/.test(r.style.color), l + " badge text uses the level color");
  });
  assert(/\.lvl-other \.level-badge\{color:var\(--text-secondary\); background:var\(--bg-elevated-2\);\}/.test(css), "OTHER stays neutral");

  section("design-polish-p2 d. Rendered: badge height and centering in a log row");
  const f = await w.addFile("a.log", makeLog(0, 6), () => {});
  T.state.activeId = f.id;
  w.render();
  const b = d.querySelector("#tableRows .log-row .level-badge");
  assert(b, "a rendered row has a badge");
  const cs = w.getComputedStyle(b);
  assert(cs.display === "inline-flex", "computed display: inline-flex, got " + cs.display);
});
