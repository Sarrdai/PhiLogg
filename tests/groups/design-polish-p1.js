// GROUP design-polish-p1 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p1 — --hairline separator token and quiet column dividers
   Origin: 2026-10-10 design polish round, package P1 (B2 + B1). Pure separators use
   --hairline (derived from --border-soft and --bg-app; 45% dark, 55% light themes);
   --border stays for control outlines. .col-resize-handle is an invisible 8px hit area
   with a 1px ::before line; hover/drag makes it a 2px accent line.
   ============================================================ */
group("design-polish-p1");

await withApp(async (w, d, T) => {
  const rules = [];
  for (const sheet of d.styleSheets) for (const r of sheet.cssRules) if (r.selectorText) rules.push(r);
  const rule = sel => rules.filter(r => r.selectorText.split(",").map(x => x.trim()).includes(sel));
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");

  section("design-polish-p1 a. --hairline is defined once in :root and differs between dark and light");
  const rootRule = rule(":root")[0];
  const dark = rootRule && rootRule.style.getPropertyValue("--hairline");
  assert(/color-mix\(in srgb,\s*var\(--border-soft\) 45%,\s*var\(--bg-app\)\)/.test(dark || ""), "dark default: 45% mix, got " + dark);
  const lightRule = rule(':root[data-theme="light"]').find(r => r.style.getPropertyValue("--hairline"));
  const latteRule = rule(':root[data-theme="catppuccin-latte"]').find(r => r.style.getPropertyValue("--hairline"));
  assert(lightRule && /55%/.test(lightRule.style.getPropertyValue("--hairline")), "light theme: 55% mix");
  assert(latteRule && /55%/.test(latteRule.style.getPropertyValue("--hairline")), "catppuccin-latte: 55% mix");
  assert((css.match(/--hairline:color-mix/g) || []).length === 3, "defined three times (dark default + light and latte blocks)");
  assert(!T.THEME_COLOR_KEYS || !T.THEME_COLOR_KEYS.includes("hairline"), "not a required theme color key");

  section("design-polish-p1 b. .col-resize-handle: no resting fill, 1px hairline line, 2px accent on hover/drag");
  const handle = rule(".col-resize-handle")[0].style;
  assert(!handle.background && !handle.backgroundColor, "no background at rest");
  assert(handle.width === "8px" && /translateX\(-4px\)/.test(handle.transform) && handle.cursor === "col-resize", "8px hit area kept");
  const line = rule(".col-resize-handle::before")[0];
  assert(line && line.style.width === "1px" && /--hairline/.test(line.style.background), "::before is a 1px hairline line");
  assert(line.style.top === "8px" && line.style.bottom === "8px", "inset 8px top and bottom");
  const hov = rule(".col-resize-handle:hover::before").find(r => r.selectorText.includes(".dragging::before"));
  assert(hov && hov.style.width === "2px" && /--accent/.test(hov.style.background), "hover/dragging: 2px accent");
  assert(/body\.layout-phone \.col-resize-handle\{display:none !important;\}/.test(css), "phone layout still hides the handles");

  section("design-polish-p1 c. Pure separators use --hairline, control outlines keep --border");
  const bd = (sel, prop) => (rule(sel)[0] || { style: { getPropertyValue: () => "" } }).style.getPropertyValue(prop);
  assert(/--hairline/.test(bd(".log-row", "border-bottom")), "log row separator");
  assert(/--hairline/.test(bd("#sidebarResizer", "border-right")), "sidebar edge");
  assert(/--hairline/.test(bd(".ctx-sep", "background")), "menu separator");
  assert(/--hairline/.test(bd(".tree-guide", "border")), "tree guide color");
  assert(/--border\b(?!-)/.test(bd(".seg-toggle", "border")), "segmented control outline keeps --border");
});
