// GROUP 85 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 85 — Configurable themes: Catppuccin flavors + custom JSON
   import/export
   Origin: this session (2026-08-22). Replaces the Light/Dark button pair
   (#settingsThemeLight/#settingsThemeDark, see GROUP 3/70h/70h2's updated
   text) with a #settingsThemeSelect dropdown listing six built-in themes
   (dark, light, four Catppuccin flavors — https://catppuccin.com/palette/)
   plus any user-imported custom ones (localStorage philogg-custom-themes).
   Updated 2026-09-30 (theme mode + light/dark slots, GROUP 341): the single
   dropdown became a Light theme / Dark theme pair (both list every theme);
   the tests below drive the Dark theme slot, which is the effective one
   under the harness's stubbed OS preference (not light). A deleted active
   custom theme now falls back to ITS SLOT's default (Catppuccin Mocha
   here), not to "dark"; a stale slot id resolves to the slot default.
   ============================================================ */
group(85);
await withApp(async (w, d, T) => {
  section("85a. Built-in theme dropdowns include the four Catppuccin flavors, and picking one applies its CSS vars");
  fireClick(d.querySelector("#btnSettings"), w);
  const select = d.querySelector("#settingsThemeDarkSelect"); // the effective slot under the stubbed OS preference
  [select, d.querySelector("#settingsThemeLightSelect")].forEach(sel => {
    const optionValues = [...sel.options].map(o => o.value);
    assert(T.BUILTIN_THEMES.every(t => optionValues.includes(t.id)),
      "every BUILTIN_THEMES id has a matching <option> in #" + sel.id + ", got " + JSON.stringify(optionValues));
    ["catppuccin-latte", "catppuccin-frappe", "catppuccin-macchiato", "catppuccin-mocha"].forEach(id => {
      assert(optionValues.includes(id), "Catppuccin flavor " + id + " is offered in #" + sel.id);
    });
  });

  // Mocha is the default dark theme now, so leave it and come back to prove the pick itself applies.
  select.value = "catppuccin-macchiato";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === "catppuccin-macchiato", "picking Catppuccin Macchiato sets data-theme");
  select.value = "catppuccin-mocha";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === "catppuccin-mocha", "picking Catppuccin Mocha sets data-theme");
  const cs = w.getComputedStyle(d.documentElement);
  // --bg-app = Base per the style-guide remap (GROUP 88) — the main
  // content pane is the brightest of the "background pane" tier now,
  // not Crust (the darkest), which is what the app's own pre-existing
  // Dark/Light hierarchy would have suggested — see PROJECT.md "Theming".
  assert(cs.getPropertyValue("--bg-app").trim() === "#1e1e2e", "Mocha's --bg-app CSS var resolves via the [data-theme] block to Base, got " + cs.getPropertyValue("--bg-app"));
  assert(cs.getPropertyValue("--bg-panel").trim() === "#181825", "Mocha's --bg-panel resolves to Mantle (darker than --bg-app/Base, per the style-guide remap), got " + cs.getPropertyValue("--bg-panel"));
  assert(cs.getPropertyValue("--accent").trim() === "#94e2d5", "Mocha's --accent resolves too, got " + cs.getPropertyValue("--accent"));
  assert(w.localStorage.getItem("philogg-theme-dark") === "catppuccin-mocha", "theme choice persisted to localStorage (the Dark theme slot)");
  // Style guide: "Selection Background" = Overlay 2 @ 20-30% opacity —
  // Mocha overrides --selection-bg to reuse --level-debug (already =
  // Overlay 2, see that CSS block), NOT the accent-tinted default every
  // non-Catppuccin theme keeps (Dark's own --selection-bg stays var(--accent-soft)).
  const selectionBg = cs.getPropertyValue("--selection-bg").replace(/\s+/g, "");
  assert(selectionBg === "color-mix(insrgb,var(--level-debug)25%,transparent)",
    "Mocha's --selection-bg is the Overlay-2-based color-mix formula, got " + cs.getPropertyValue("--selection-bg"));

  select.value = "catppuccin-latte";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  const csLatte = w.getComputedStyle(d.documentElement);
  // Declared as var(--bg-app) (Latte maps --bg-app to Base, #eff1f5, per
  // the style-guide remap — GROUP 88) — per the Catppuccin style guide,
  // "On Accent" text = Base, so --level-*-on/--accent-on reference that
  // var directly rather than a hardcoded near-white. jsdom's
  // getComputedStyle doesn't resolve nested var() the way a real browser
  // does (see tests/README.md "Known gaps"), so this checks the declared
  // value, not the resolved color; Group 87's/88's Playwright-verified
  // screenshots confirm the real rendered result.
  assert(csLatte.getPropertyValue("--level-error-on").trim() === "var(--bg-app)",
    "Latte (a light-background flavor) points --level-error-on at its own Base color (--bg-app) instead of a hardcoded near-white, got " + csLatte.getPropertyValue("--level-error-on"));
});

await withApp(async (w, d, T) => {
  section("85b. Importing a custom theme JSON: validation, editor prefill, storage, activation, dropdown + list rendering");
  fireClick(d.querySelector("#btnSettings"), w);
  const editor = d.querySelector("#themeEditorDialog");

  assert(d.querySelector("#customThemeList .filter-library-empty"), "custom theme list starts empty");

  // Not a theme file at all -> false, so the central import can report it.
  assert(w.importThemeJson("{not json") === false, "malformed JSON is not a theme file");
  assert(w.importThemeJson(JSON.stringify({ name: "No tag", colors: {} })) === false, "a JSON file without the philogg-theme format tag is not a theme file");
  // A theme file that can't be used -> handled (toast), no editor.
  assert(w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 99, name: "Future", colors: {} })) === true && !isVisible(editor, w),
    "a theme file from a newer version is rejected without opening the editor");
  assert(w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 1, name: "No colors" })) === true && !isVisible(editor, w),
    "a theme file without colors is rejected without opening the editor");
  assert(T.customThemes.length === 0, "nothing added so far");

  // A full, valid theme file: opens the theme editor prefilled; Save adds it.
  const cs0 = w.getComputedStyle(d.documentElement);
  const colors = {};
  T.THEME_COLOR_KEYS.forEach(k => { colors[k] = cs0.getPropertyValue("--" + k).trim(); });
  colors["bg-app"] = "#120018";
  colors["accent"] = "#bb33ff";
  assert(w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 1, name: "My Purple Night", activeTextLight: true, colors })) === true, "a valid theme file is accepted");
  assert(isVisible(editor, w), "...and opens the theme editor");
  assert(d.querySelector("#themeEditorTitle").textContent === "Import theme", "the editor says it's an import, got " + d.querySelector("#themeEditorTitle").textContent);
  assert(d.querySelector("#themeEditorName").value === "My Purple Night" && d.querySelector("#themeEditorTextLight").checked, "the editor is prefilled with the file's name and flags");
  assert(T.customThemes.length === 0, "nothing is stored before Save");
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(!isVisible(editor, w), "Save closes the editor");

  assert(T.customThemes.length === 1, "saving the imported theme adds it to customThemes");
  const imported = T.customThemes[0];
  assert(imported.name === "My Purple Night", "the imported theme's name is preserved");
  assert(imported.colors["bg-app"] === "#120018" && imported.colors["accent"] === "#bb33ff", "imported colors are preserved");
  assert(JSON.parse(w.localStorage.getItem("philogg-custom-themes"))[0].name === "My Purple Night", "custom themes persist to localStorage");

  assert(d.documentElement.getAttribute("data-theme") === imported.id, "saving an imported theme switches to it immediately");
  const cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--bg-app").trim() === "#120018", "the custom theme's colors are applied as inline CSS vars, got " + cs.getPropertyValue("--bg-app"));
  assert(cs.getPropertyValue("--level-error-on").trim() === "#fff", "activeTextLight:true applies white active-button text");

  const select = d.querySelector("#settingsThemeDarkSelect"); // the effective slot under the stubbed OS preference
  [select, d.querySelector("#settingsThemeLightSelect")].forEach(sel => {
    assert([...sel.options].some(o => o.value === imported.id && o.textContent === "My Purple Night"),
      "the imported theme appears as an option in #" + sel.id);
  });
  assert(select.value === imported.id, "the effective slot's dropdown reflects the newly-active custom theme");
  assert(w.localStorage.getItem("philogg-theme-dark") === imported.id && w.themeMode() === "system",
    "saving the imported theme fills the effective slot and does not switch the mode");

  const listRow = d.querySelector("#customThemeList .filter-library-row");
  assert(listRow && listRow.textContent.includes("My Purple Night"), "the imported theme is listed in the Custom themes card");

  // Switching away and back via inline-style clearing: a built-in theme
  // picked afterwards must not leak the custom theme's inline overrides.
  select.value = "dark";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  const csDark = w.getComputedStyle(d.documentElement);
  assert(csDark.getPropertyValue("--bg-app").trim() === "#10131a", "switching back to Dark clears the custom theme's inline var overrides, got " + csDark.getPropertyValue("--bg-app"));

  // Deleting a custom theme: removes it everywhere, and falls back to its
  // slot's default (Mocha for the Dark theme slot) if it was the active theme.
  select.value = imported.id;
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.documentElement.getAttribute("data-theme") === imported.id, "sanity: custom theme active again before deleting it");
  d.querySelector("#customThemeList .filter-library-row-del").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(T.customThemes.length === 0, "deleting the custom theme removes it from customThemes");
  assert(JSON.parse(w.localStorage.getItem("philogg-custom-themes")).length === 0, "...and from localStorage");
  assert(d.documentElement.getAttribute("data-theme") === "catppuccin-mocha", "deleting the ACTIVE custom theme falls back to its slot's default (Mocha)");
  assert(w.localStorage.getItem("philogg-theme-dark") === "catppuccin-mocha" && select.value === "catppuccin-mocha",
    "...the slot is reset (persisted + dropdown) too");
  assert(d.querySelector("#customThemeList .filter-library-empty"), "the list shows the empty state again");
});

await withApp(async (w, d, T) => {
  section("85c. A stale/deleted custom theme id in a slot falls back to that slot's default on boot instead of leaving data-theme dangling");
  w.localStorage.setItem("philogg-theme-dark", "custom:does-not-exist");
  w.initTheme();
  assert(d.documentElement.getAttribute("data-theme") === "catppuccin-mocha", "resolveThemeId falls back to the slot default (Mocha) for an unknown theme id, got " + d.documentElement.getAttribute("data-theme"));
});
