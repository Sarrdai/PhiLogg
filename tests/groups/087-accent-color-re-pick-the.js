// GROUP 87 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 87 — Accent color: re-pick the app's OWN accent (buttons, the
   breadcrumb, the minimap's range highlight) from the active theme's
   own palette
   Origin: this session (2026-08-22), same-day clarification of the 86
   request — "Highlightfarbe" there meant the app's accent/selection color
   itself ("Highlightfarbe auf den Buttons oder die Markierung auf der
   Minimap für die Zeitabschnitte"), not the per-filter-node highlight
   color Group 86 covers (a different, unrelated feature that stays as-is).
   ============================================================ */
group(87);
await withApp(async (w, d, T) => {
  section("87a. Accent-color row: hidden for a theme with no highlightPalette, shown with swatches for one that has it");
  fireClick(d.querySelector("#btnSettings"), w);
  const row = d.querySelector("#settingsAccentRow");
  const picker = d.querySelector("#settingsAccentPicker");

  // The default theme is Catppuccin Mocha now (has a palette) -> the row is shown from the start.
  assert(isVisible(row, w), "the default Catppuccin Mocha (has a highlightPalette) shows the Accent color row");
  const select = d.querySelector("#settingsThemeDarkSelect"); // the effective slot under the stubbed OS preference
  select.value = "dark";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(!isVisible(row, w), "Classic Dark (no highlightPalette) hides the Accent color row");

  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(isVisible(row, w), "Catppuccin Mocha (has a highlightPalette) shows the row");
  const swatches = [...picker.querySelectorAll(".accent-swatch:not(.accent-swatch-reset)")];
  const mochaPalette = T.BUILTIN_THEMES.find(t => t.id === "catppuccin-mocha").highlightPalette;
  assert(swatches.length === mochaPalette.length && swatches.every((s, i) => s.title === mochaPalette[i]),
    "the swatches are exactly Mocha's own highlightPalette, in order, got " + swatches.length + " of " + mochaPalette.length);
  assert(picker.querySelector(".accent-swatch-reset.active"), "with no override chosen yet, the reset/'theme default' swatch is the active one");

  select.value = "light";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(!isVisible(row, w), "Classic Light (no highlightPalette either) hides the row again");
});

await withApp(async (w, d, T) => {
  section("87b. Picking an accent swatch recolors --accent/-strong/-soft/-on together, persists PER THEME, and survives switching away and back");
  fireClick(d.querySelector("#btnSettings"), w);
  const select = d.querySelector("#settingsThemeDarkSelect"); // the effective slot under the stubbed OS preference
  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));

  const csBefore = w.getComputedStyle(d.documentElement);
  const defaultAccent = csBefore.getPropertyValue("--accent").trim();
  assert(defaultAccent === "#94e2d5", "sanity: Mocha's default accent (Teal) is active before picking, got " + defaultAccent);

  // Mauve (#cba6f7) is in Mocha's highlightPalette but clearly NOT the
  // default accent — a real re-pick, not a no-op.
  const mauveSwatch = [...d.querySelectorAll("#settingsAccentPicker .accent-swatch")].find(s => s.title === "#cba6f7");
  fireClick(mauveSwatch, w);

  const cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--accent").trim() === "#cba6f7", "picking Mauve sets --accent to it, got " + cs.getPropertyValue("--accent"));
  assert(cs.getPropertyValue("--accent-strong").trim() !== "#89dceb" && cs.getPropertyValue("--accent-strong").trim() !== "#cba6f7",
    "--accent-strong is recomputed too (not left at Mocha's old Sky default, and not identical to --accent either), got " + cs.getPropertyValue("--accent-strong"));
  assert(cs.getPropertyValue("--accent-soft").trim().startsWith("rgba(203,166,247,"), "--accent-soft is recomputed from the new accent's own RGB, got " + cs.getPropertyValue("--accent-soft"));
  assert(T.accentChoices["catppuccin-mocha"] === "#cba6f7", "the pick is recorded in accentChoices for Mocha specifically");
  assert(JSON.parse(w.localStorage.getItem("philogg-accent-choice"))["catppuccin-mocha"] === "#cba6f7", "...and persisted to localStorage");
  // renderAccentPicker() rebuilds the swatch row on every applyTheme() call
  // (same "new DOM nodes, not the same element" pattern as renderVisibleRows
  // — see PROJECT.md's jsdom gotcha), so re-query rather than reuse the
  // now-stale mauveSwatch reference from before the click.
  const mauveSwatchAfter = [...d.querySelectorAll("#settingsAccentPicker .accent-swatch")].find(s => s.title === "#cba6f7");
  assert(mauveSwatchAfter.classList.contains("active"), "the picked swatch shows as active");

  // Switch to a DIFFERENT theme: that theme's own default applies, Mocha's
  // pick is untouched (per-theme, not global).
  select.value = "catppuccin-latte";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#209fb5", "Latte shows its OWN default accent, unaffected by Mocha's pick");

  // Switch back to Mocha: the pick survives.
  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#cba6f7", "switching back to Mocha restores the picked Mauve accent");

  // Reset (the ↺ swatch) clears the override and restores the theme's own default.
  fireClick(d.querySelector("#settingsAccentPicker .accent-swatch-reset"), w);
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#94e2d5", "the reset swatch restores Mocha's default Teal accent");
  assert(!("catppuccin-mocha" in T.accentChoices), "...and clears the stored override for Mocha");
});

await withApp(async (w, d, T) => {
  section("87c. A dark, low-luminance accent pick flips --accent-on to white (contrast safety net)");
  w.setTheme("catppuccin-latte");
  // Latte's Red (#d20f39) is in its highlightPalette and dark/saturated
  // enough that the default near-black --accent-on would be unreadable.
  w.setAccentChoice("catppuccin-latte", "#d20f39");
  const cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--accent").trim() === "#d20f39", "sanity: the dark Red accent is active");
  assert(cs.getPropertyValue("--accent-on").trim() === "#fff", "a low-luminance accent pick flips --accent-on to white instead of staying near-black, got " + cs.getPropertyValue("--accent-on"));
});
