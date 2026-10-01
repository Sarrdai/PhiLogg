// GROUP 88 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 88 — Catppuccin background hierarchy remapped to match the
   official style guide's "Background Pane"/"Secondary Panes" roles
   Origin: this session (2026-08-22), person-directed after a style-guide
   compliance audit flagged the ORIGINAL mapping (kept for consistency
   with this app's own pre-existing Dark/Light hierarchy — main pane
   darkest, panel brighter) as inverted relative to the guide's intent
   (main pane = Base, a brighter tone; secondary/chrome panes = the
   darker Crust/Mantle). Asked, and told to remap instead of leaving it —
   see PROJECT.md "Theming" -> "Catppuccin style-guide compliance" for
   the full token-role table (--bg-app=Base, --bg-panel=Mantle,
   --bg-elevated=Surface0, --bg-elevated-2=Surface1, --border-soft=
   Surface2, --border=Overlay0 — same role mapping for all four flavors,
   including Latte, where Base happens to be the brightest token instead
   of a dark-flavor middle tone).
   ============================================================ */
group(88);
await withApp(async (w, d, T) => {
  section("88. Background/border hierarchy: --bg-app (main pane) resolves to Base, brighter than --bg-panel (Mantle) — same role mapping across all four flavors, including inverted-brightness Latte");
  const mochaExpected = { "bg-app": "#1e1e2e", "bg-panel": "#181825", "bg-elevated": "#313244", "bg-elevated-2": "#45475a", "border-soft": "#585b70", "border": "#6c7086" };
  const macchiatoExpected = { "bg-app": "#24273a", "bg-panel": "#1e2030", "bg-elevated": "#363a4f", "bg-elevated-2": "#494d64", "border-soft": "#5b6078", "border": "#6e738d" };
  const frappeExpected = { "bg-app": "#303446", "bg-panel": "#292c3c", "bg-elevated": "#414559", "bg-elevated-2": "#51576d", "border-soft": "#626880", "border": "#737994" };
  const latteExpected = { "bg-app": "#eff1f5", "bg-panel": "#e6e9ef", "bg-elevated": "#ccd0da", "bg-elevated-2": "#bcc0cc", "border-soft": "#acb0be", "border": "#9ca0b0" };

  [
    ["catppuccin-mocha", mochaExpected],
    ["catppuccin-macchiato", macchiatoExpected],
    ["catppuccin-frappe", frappeExpected],
    ["catppuccin-latte", latteExpected],
  ].forEach(([themeId, expected]) => {
    w.setTheme(themeId);
    const cs = w.getComputedStyle(d.documentElement);
    Object.entries(expected).forEach(([key, hex]) => {
      assert(cs.getPropertyValue("--" + key).trim() === hex, themeId + "'s --" + key + " is " + hex + " per the guide's role mapping, got " + cs.getPropertyValue("--" + key));
    });
  });

  // "On Accent" text = Base = --bg-app in this remap, for every flavor
  // uniformly (previously --bg-elevated for the dark flavors / --bg-panel
  // for Latte, back when those vars held Base — see 85a's own comment).
  ["catppuccin-mocha", "catppuccin-macchiato", "catppuccin-frappe", "catppuccin-latte"].forEach(themeId => {
    w.setTheme(themeId);
    const cs = w.getComputedStyle(d.documentElement);
    assert(cs.getPropertyValue("--accent-on").trim() === "var(--bg-app)", themeId + "'s --accent-on points at --bg-app (Base), got " + cs.getPropertyValue("--accent-on"));
  });
});
