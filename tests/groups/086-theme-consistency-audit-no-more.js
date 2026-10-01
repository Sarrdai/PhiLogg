// GROUP 86 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 86 — Theme consistency audit: no more hardcoded UI colors, and a
   theme-aware "Theme" mode for the highlight-color picker
   Origin: this session (2026-08-22), person-requested follow-up ("Prüfe
   noch mal auf der Website, welche Farbe für was verwendet wird und ob Du
   das konsequent umgesetzt hast"). An audit of the stylesheet found ~18
   buttons/badges/rows still hardcoding the DARK theme's own hex values
   (scrollbar thumb, toolbar button hover borders, the brand mark, Save/
   active-chip text, breadcrumb/level-pill/level-badge/log-row-hover tints)
   instead of the CSS vars every other rule already used — fixed via new
   --accent-on/--border-hover vars and color-mix(var(--x), transparent) for
   the alpha-tinted ones, so every one of those now tracks whichever theme
   is active instead of only ever matching Dark. Separately, the per-filter-
   node highlight-color picker (#colorPickerPopup, unrelated to app theming
   before this session) gained a "Theme" mode: its curated preset row can
   now show the ACTIVE theme's own highlightPalette (the 14 named
   Catppuccin accent colors per flavor) instead of the theme-independent
   generic HIGHLIGHT_PRESETS, so a chosen highlight color is guaranteed to
   belong to the current theme when that mode is on.
   ============================================================ */
group(86);
await withApp(async (w, d, T) => {
  section("86a. Stylesheet audit: the specific hardcoded hex values found in the audit are gone from the button/badge/row rules that used to hardcode them");
  const css = d.querySelector("style").textContent;
  // Each of these literals used to appear in a rule OUTSIDE the :root/
  // [data-theme] variable-definition blocks — i.e. hardcoded into a
  // component rule instead of using var(). They may still legitimately
  // appear INSIDE a :root[data-theme=...] block itself (that's the var's
  // own definition, not a violation) — this check targets the specific
  // component selectors the audit found, not the raw strings globally.
  const violations = [
    { selector: "::-webkit-scrollbar-thumb", bad: "#2a3142" },
    { selector: ".brand-mark", bad: "#2f8f8c" },
    { selector: ".brand-mark", bad: "#0b1016" },
    { selector: ".toolbar-badge", bad: "#08201f" },
    { selector: ".level-btn.lvl-error", bad: "rgba(241,101,101,.35)" },
    { selector: ".lvl-error .level-badge", bad: "rgba(241,101,101,.28)" },
    { selector: ".log-row.lvl-error:hover", bad: "rgba(241,101,101,.20)" },
    { selector: ".token-chip", bad: "rgba(79,199,195,.35)" },
  ];
  violations.forEach(v => {
    const ruleMatch = css.match(new RegExp(v.selector.replace(/[.:]/g, "\\$&") + "\\{[^}]*\\}"));
    assert(ruleMatch && !ruleMatch[0].includes(v.bad), v.selector + " no longer hardcodes " + v.bad + ", got " + (ruleMatch ? ruleMatch[0] : "(rule not found)"));
  });
  assert(css.includes("--accent-on:"), "a themeable --accent-on var exists for text-on-accent surfaces");
  assert(css.includes("--border-hover:"), "a themeable --border-hover var exists for hover-state borders");
  assert(css.includes("color-mix(in srgb"), "the previously-hardcoded alpha-tinted rules now use color-mix() against a themed var");
});

await withApp(async (w, d, T) => {
  section("86b. Highlight-color picker: Free (default) vs Theme mode");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const node = w.createFilterNode(f.id, "text", "msg");
  w.render();

  assert(T.colorPickerMode === "free", "sanity: Free is the default picker mode, unchanged prior behavior");
  const swatch = d.querySelector('[data-node-id="' + node.id + '"] .tree-swatch');
  fireClick(swatch, w);
  assert(isVisible(d.querySelector("#cpWheelWrap"), w), "Free mode: the hue wheel is visible");
  let presetTitles = [...d.querySelectorAll(".cp-preset")].map(b => b.title);
  assert(JSON.stringify(presetTitles) === JSON.stringify(T.HIGHLIGHT_PRESETS), "Free mode: presets are the generic HIGHLIGHT_PRESETS, got " + JSON.stringify(presetTitles));
  w.closeColorPicker();

  // Switch to a Catppuccin flavor, then to Theme mode.
  w.setTheme("catppuccin-mocha");
  fireClick(swatch, w);
  fireClick(d.querySelector("#cpModeTheme"), w);
  assert(T.colorPickerMode === "theme", "clicking Theme switches the mode");
  assert(w.localStorage.getItem("philogg-cp-mode") === "theme", "the mode choice persists to localStorage");
  assert(!isVisible(d.querySelector("#cpWheelWrap"), w), "Theme mode: the hue wheel is hidden");
  const mochaTheme = T.BUILTIN_THEMES.find(t => t.id === "catppuccin-mocha");
  presetTitles = [...d.querySelectorAll(".cp-preset")].map(b => b.title);
  assert(JSON.stringify(presetTitles) === JSON.stringify(mochaTheme.highlightPalette), "Theme mode: presets are Catppuccin Mocha's own highlightPalette (14 named accent colors), got " + presetTitles.length + " colors");

  // Picking one of the theme swatches sets the node's highlightColor and
  // closes the popup, same interaction as a Free-mode preset click.
  const firstSwatch = d.querySelector(".cp-preset");
  const pickedColor = firstSwatch.title;
  fireClick(firstSwatch, w);
  assert(T.state.nodes[node.id].highlightColor === pickedColor, "clicking a theme swatch sets the node's highlightColor to that swatch's color");
  assert(d.querySelector("#colorPickerPopup").classList.contains("hidden"), "picking a swatch closes the popup");

  // A theme with no highlightPalette (Dark) falls back to the generic set
  // while still in Theme mode — never an empty preset row.
  w.setTheme("dark");
  fireClick(swatch, w);
  presetTitles = [...d.querySelectorAll(".cp-preset")].map(b => b.title);
  assert(JSON.stringify(presetTitles) === JSON.stringify(T.HIGHLIGHT_PRESETS), "Theme mode on Dark (no highlightPalette) falls back to the generic HIGHLIGHT_PRESETS, got " + presetTitles.length + " colors");

  // Switching back to Free restores the wheel and generic presets, and
  // also persists.
  fireClick(d.querySelector("#cpModeFree"), w);
  assert(T.colorPickerMode === "free" && w.localStorage.getItem("philogg-cp-mode") === "free", "clicking Free switches back and persists");
  assert(isVisible(d.querySelector("#cpWheelWrap"), w), "Free mode: the hue wheel is visible again");
});

await withApp(async (w, d, T) => {
  section("86c. Highlight-color picker mode is restored on init, same as the theme choice itself");
  w.localStorage.setItem("philogg-cp-mode", "theme");
  w.setColorPickerMode(w.localStorage.getItem("philogg-cp-mode"));
  assert(T.colorPickerMode === "theme", "setColorPickerMode re-applies a persisted mode, same pattern initTheme() uses for the theme itself");
  assert(d.querySelector("#cpModeTheme").classList.contains("active") && !d.querySelector("#cpModeFree").classList.contains("active"),
    "the Theme button reflects the restored mode");
});
