// GROUP design-polish-p3 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p3 — row tinting variant A, level stripe, selection
   Origin: 2026-10-10 design polish round, package P3 (B3). Only WARN/ERROR/FATAL rows carry
   a faint fill; every row has one flush 3px .col-bar stripe; the selected row is an accent
   fill plus a 1px outline, no 3px bar.
   ============================================================ */
group("design-polish-p3");

await withApp(async (w, d, T) => {
  const rules = [];
  const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) rules.push(r); } };
  for (const sheet of d.styleSheets) walk(sheet.cssRules);
  const rule = sel => rules.filter(r => r.selectorText.split(",").map(x => x.trim()).includes(sel));
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");

  section("design-polish-p3 a. level fills: none below WARN, 6%/7% from WARN up");
  ["info", "debug", "trace", "other", "custom-1", "custom-2", "custom-3", "custom-4", "custom-5", "custom-6"].forEach(l => {
    assert(rule(".log-row.lvl-" + l).length === 0 && rule(".log-row.lvl-" + l + ":hover").length === 0, l + " rows have no level fill rule");
  });
  const bg = sel => (rule(sel)[0] || { cssText: "" }).cssText;
  assert(/var\(--level-warn\) 6%/.test(bg(".log-row.lvl-warn")), "WARN 6%, got " + bg(".log-row.lvl-warn"));
  assert(/var\(--level-error\) 7%/.test(bg(".log-row.lvl-error")), "ERROR 7%");
  assert(/var\(--level-fatal\) 7%/.test(bg(".log-row.lvl-fatal")), "FATAL 7%");
  assert(/var\(--level-warn\) 11%/.test(bg(".log-row.lvl-warn:hover")) && /var\(--level-error\) 12%/.test(bg(".log-row.lvl-error:hover")), "hover a few % stronger");
  assert(!/level-(error|warn|info|debug|fatal|trace)-soft\)/.test(css.match(/\.log-row\.lvl-[^{]*\{[^}]*\}/g).join("")), "no -soft level fills on rows");

  section("design-polish-p3 b. .col-bar: 3px, flush, square, full height; DEBUG fainter");
  const bar = rule(".col-bar")[0].style;
  assert(bar.width === "3px" && bar.alignSelf === "stretch", "3px wide, stretches the row height");
  assert((bar.margin === "0px" || bar.margin === "0") && bar.borderRadius === "0px", "no margin, no radius, got " + bar.margin + " / " + bar.borderRadius);
  assert(rule(".lvl-debug .col-bar").some(r => r.style.opacity === "0.45"), "DEBUG stripe at .45 opacity");

  section("design-polish-p3 c. selection: accent fill + 1px outline, no 3px bar");
  assert(/--selected-row-tint:color-mix\(in srgb, var\(--accent\) 16%, var\(--bg-app\)\)/.test(css), "selected fill = 16% accent over --bg-app");
  const sel = rule(".log-row.selected")[0].cssText;
  assert(/inset 0(px)? 0(px)? 0(px)? 1px/.test(sel) && /55%/.test(sel) && !/3px/.test(sel), "1px 55% accent inset outline, got " + sel);
  assert(rule(".log-row.selected:hover").length === 1 && /selected-row-tint/.test(rule(".log-row.selected:hover")[0].cssText), "fill kept as background-image layer");

  section("design-polish-p3 d. rendered rows");
  const f = await w.addFile("a.log", makeLog(0, 40), () => {});
  w.render();
  const rows = [...d.querySelectorAll("#tableRows .log-row")];
  assert(rows.length > 5, "rows rendered");
  const infoRow = rows.find(r => r.classList.contains("lvl-info"));
  if (infoRow) assert(w.getComputedStyle(infoRow).backgroundColor === "rgba(0, 0, 0, 0)", "INFO row has no fill, got " + w.getComputedStyle(infoRow).backgroundColor);
  assert(rows.every(r => r.querySelector(":scope > .col-bar")), "every row has its stripe as a direct grid child");
});
