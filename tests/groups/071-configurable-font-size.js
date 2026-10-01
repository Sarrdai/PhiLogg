// GROUP 71 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 71 — Configurable font size
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Configurable font
   size — adjustable in Settings and via a keyboard shortcut". A whole-UI
   zoom (document.documentElement.style.zoom) rather than a font-size
   variable threaded through every hardcoded font-size in the file — see
   applyFontScale's own comment. Settings row (+/- buttons, a Reset button)
   and Ctrl+Plus/Ctrl+Minus both funnel into the same function, persisted to
   localStorage like the theme toggle.
   ============================================================ */
group(71);
await withApp(async (w, d, T) => {
  section("71. Configurable font size");

  const html = d.documentElement;
  assert(html.style.zoom === "1", "default font scale is 100% (zoom:1) at boot, got " + JSON.stringify(html.style.zoom));
  assert(d.getElementById("fontScaleValue").textContent === "100%", "Settings shows 100% by default");

  fireClick(d.getElementById("fontScaleUp"), w);
  assert(html.style.zoom === "1.1", "the + button increases zoom by one step (10%)");
  assert(d.getElementById("fontScaleValue").textContent === "110%", "...and the Settings value label updates too");
  assert(w.localStorage.getItem("philogg-font-scale") === "110", "persisted to localStorage");

  fireClick(d.getElementById("fontScaleDown"), w);
  fireClick(d.getElementById("fontScaleDown"), w);
  assert(html.style.zoom === "0.9", "the - button decreases zoom by one step");

  for (let i = 0; i < 10; i++) fireClick(d.getElementById("fontScaleDown"), w);
  assert(html.style.zoom === "0.7", "font scale clamps at the minimum (70%), got " + html.style.zoom);
  for (let i = 0; i < 20; i++) fireClick(d.getElementById("fontScaleUp"), w);
  assert(html.style.zoom === "1.6", "font scale clamps at the maximum (160%), got " + html.style.zoom);

  fireClick(d.getElementById("fontScaleReset"), w);
  assert(html.style.zoom === "1", "Reset restores 100%");

  fireKeydown(d, w, "+", { ctrlKey: true });
  assert(html.style.zoom === "1.1", "Ctrl+Plus increases font scale via keyboard");
  fireKeydown(d, w, "-", { ctrlKey: true });
  assert(html.style.zoom === "1", "Ctrl+Minus decreases font scale via keyboard, back to 100%");
});
