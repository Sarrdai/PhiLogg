// GROUP level-count-in-circle — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP level-count-in-circle — the level-bar circles show their entry
   count on the desktop tier too (not only compact), shortened to at most 4
   characters (levelCountShort); the exact count stays in the title and the
   phone chips. "Always" labels carry the count in the pill instead.
   Origin: 2026-10-06 (person-decided, mockup variant B).
   ============================================================ */
group("level-count-in-circle");

const lcSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const lcCssRules = d => {
  const out = [];
  const walk = rules => { for (const r of rules) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) out.push(r); } };
  for (const sheet of d.styleSheets) walk(sheet.cssRules);
  return out;
};

await withApp(async (w, d, T) => {
  section("level-count-in-circle a. levelCountShort: exact below 1000, floored k/M above, never more than 4 chars");
  const s = w.levelCountShort;
  const table = [[0, "0"], [7, "7"], [163, "163"], [999, "999"], [1000, "1,0k"], [1327, "1,3k"], [1999, "1,9k"], [9999, "9,9k"],
    [10000, "10k"], [48211, "48k"], [99999, "99k"], [999999, "999k"], [1e6, "1,0M"], [1204551, "1,2M"], [9999999, "9,9M"], [1e7, "10M"], [12345678, "12M"], [999e6, "999M"]];
  table.forEach(([n, exp]) => assert(s(n) === exp, "levelCountShort(" + n + ") = " + exp + ", got " + s(n)));
  assert(table.every(([n]) => s(n).length <= 4), "every short count has at most 4 characters");
  assert(s(999999) !== "1000k", "999999 never rounds up to 1000k");
}, { toolbarLabels: "hover" });

await withApp(async (w, d, T) => {
  section("level-count-in-circle b. Rendered text on the tiers, exact count in title, phone chips exact, 'Always' hides the circle count");
  const [sim] = LOGSIM.generateToStrings({ scenarios: ["basic"], entries: 3000, seed: 7 });
  const f = await w.addFile(sim.name, sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const real = w.getLevelCounts(f.id);
  const chip = l => d.querySelector('#levelBar .level-btn[data-level="' + l + '"]');
  const cnt = l => chip(l).querySelector(".level-count");
  const shortTxt = l => chip(l).querySelector(".level-short").textContent;
  const big = Object.keys(real).filter(l => real[l] >= 1000);
  assert(big.length >= 1, "sanity: the simulator log has a level with >= 1000 entries, got " + JSON.stringify(real));

  // Real counts through the whole pipeline.
  Object.keys(real).forEach(l => {
    if (!chip(l)) return;
    assert(cnt(l).textContent === w.levelCountShort(real[l]), "desktop: " + l + " circle shows the short count, got " + cnt(l).textContent);
    assert(chip(l).title.indexOf(real[l].toLocaleString("de-DE")) >= 0, l + " title keeps the exact count: " + chip(l).title);
    assert(w.getComputedStyle(cnt(l)).display !== "none", "desktop: the " + l + " count is displayed inside the circle");
  });

  // Fixed counts (stubbed) for the renderer: every size class of the rule.
  const orig = w.getLevelCounts;
  const stub = counts => { w.getLevelCounts = () => counts; w.renderLevelBar(); };
  try {
    stub({ ERROR: 999999, WARN: 1204551, INFO: 12345678, DEBUG: 999 });
    const expB = { ERROR: "999k", WARN: "1,2M", INFO: "12M", DEBUG: "999" };
    Object.keys(expB).forEach(l => assert(chip(l) && cnt(l).textContent === expB[l], "desktop " + l + ": circle text " + expB[l] + ", got " + (chip(l) && cnt(l).textContent)));
    stub({ ERROR: 7, WARN: 163, INFO: 1327, DEBUG: 48211 });
    const exp = { ERROR: "7", WARN: "163", INFO: "1,3k", DEBUG: "48k" };
    Object.keys(exp).forEach(l => assert(chip(l) && cnt(l).textContent === exp[l], "desktop " + l + ": circle text " + exp[l] + ", got " + (chip(l) && cnt(l).textContent)));
    assert(cnt("INFO").classList.contains("level-count-long") && !cnt("WARN").classList.contains("level-count-long") && !cnt("DEBUG").classList.contains("level-count-long"), "only a 4-char count (1,3k) gets the smaller .level-count-long font, 3 chars (163, 48k) do not");
    assert(chip("INFO").title.indexOf("INFO 1.327") === 0, "title/hover label keeps the exact count (INFO 1.327), got " + chip("INFO").title);
    assert(chip("INFO").querySelector(".row-action-label").textContent.indexOf("INFO 1.327") === 0, "hover label keeps the exact count");

    lcSetWidth(w, 800);
    assert(w.getComputedStyle(cnt("INFO")).display !== "none", "compact: the count is displayed in the circle");
    assert(cnt("INFO").textContent === "1,3k", "compact: same short text as on desktop (28px and 44px read the same)");

    d.body.classList.add("level-labels-always");
    assert(w.getComputedStyle(cnt("INFO")).display === "none", "compact, 'Always' labels: no in-circle count");
    lcSetWidth(w, 1400);
    assert(w.getComputedStyle(cnt("INFO")).display === "none", "desktop, 'Always' labels: no in-circle count (the pill carries it)");
    d.body.classList.remove("level-labels-always");
    assert(w.getComputedStyle(cnt("INFO")).display !== "none", "desktop, hover labels: the count is back");

    lcSetWidth(w, 400);
    assert(w.getComputedStyle(cnt("INFO")).display === "none", "phone: no in-circle count");
    assert(shortTxt("INFO") === "I 1.327" && shortTxt("DEBUG") === "D 48.211" && shortTxt("ERROR") === "E 7",
      "phone chips keep the exact count, got " + shortTxt("INFO") + " / " + shortTxt("DEBUG") + " / " + shortTxt("ERROR"));
  } finally {
    w.getLevelCounts = orig;
    w.renderLevelBar();
    lcSetWidth(w, 1400);
  }
}, { toolbarLabels: "hover" });

await withApp(async (w, d, T) => {
  section("level-count-in-circle c. CSS: centered, 9.5px / 11px, level colours on desktop for every level, active in the -on colour");
  const rules = lcCssRules(d);
  const find = sel => rules.find(r => r.selectorText === sel);
  const base = rules.find(r => /^body:not\(\.layout-phone\):not\(\.level-labels-always\) \.level-btn \.level-count$/.test(r.selectorText));
  assert(base, "the in-circle count rule applies to every tier but the phone (and not in 'Always' mode)");
  assert(base.style.position === "absolute" && base.style.display === "flex" && base.style.alignItems === "center" && base.style.justifyContent === "center",
    "the count is absolutely positioned and centered both ways");
  assert(base.style.fontSize === "" ? /9\.5px/.test(base.style.font) : base.style.fontSize === "9.5px", "28px circles: 9.5px text");
  assert(rules.some(r => /^body\.layout-compact \.level-btn\.row-action-btn \.level-count, body\.layout-compact \.level-btn\.row-action-btn \.level-count\.level-count-long$/.test(r.selectorText) && r.style.fontSize === "11px"), "44px (coarse pointer) circles: 11px text, 4-char counts included");
  assert(rules.some(r => /\.level-count\.level-count-long$/.test(r.selectorText) && /^body:not/.test(r.selectorText) && r.style.fontSize === "8.5px"), "28px circles: a 4-char count is 8.5px so it clears the ring");
  const names = ["error", "warn", "info", "debug", "fatal", "trace", "custom-1", "custom-2", "custom-3", "custom-4", "custom-5", "custom-6", "other"];
  names.forEach(l => {
    const off = find(".level-btn.lvl-" + l + " .level-count");
    const on = find(".level-btn.active.lvl-" + l + " .level-count");
    assert(off && off.style.color, "desktop colour rule for the unchecked " + l + " count");
    assert(on && /^var\(--(level-.+-on|bg-app)\)$/.test(on.style.color), "checked " + l + " count uses the fill's on-colour, got " + (on && on.style.color));
  });
  assert(!rules.some(r => /^body\.layout-compact \.level-btn.* \.level-count$/.test(r.selectorText) && /color/.test(r.cssText)), "no compact-only colour rule is left");
});
