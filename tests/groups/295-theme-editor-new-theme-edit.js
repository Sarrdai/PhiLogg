// GROUP 295 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 295 — Theme editor: "+ New theme…"/"Edit" on a custom theme and
   the same for syntax schemes open #themeEditorDialog (color groups + live
   preview); soft variants derive from their base color unless Auto is
   unchecked; colors come from the picker's plain mode or a typed value. */
group(295);
await withApp(async (w, d, T) => {
  section("295a. Theme editor: new theme from the active colors, Auto soft variants, plain color picker, preview, save, edit + rename");
  w.setTheme("dark"); // Classic Dark: the default theme is Catppuccin Mocha now, the asserted values below are Classic Dark's
  fireClick(d.querySelector("#btnSettings"), w);
  const editor = d.querySelector("#themeEditorDialog");
  const row = key => d.querySelector('#themeEditorGroups .te-row[data-key="' + key + '"]');
  const val = key => row(key).querySelector(".te-value");
  const auto = key => row(key).querySelector(".te-auto-cb");
  const prev = key => d.querySelector("#themeEditorPreview").style.getPropertyValue("--" + key);
  const type = (key, v) => { val(key).value = v; fireInput(val(key), w); };

  fireClick(d.querySelector("#btnThemeNew"), w);
  assert(isVisible(editor, w) && d.querySelector("#themeEditorTitle").textContent === "New theme", "+ New theme… opens the editor");
  assert(val("bg-app").value === "#10131a" && val("accent").value === "#4fc7c3", "a new theme starts from the active (Dark) colors, got " + val("bg-app").value);
  assert(T.THEME_COLOR_KEYS.every(k => row(k)), "every theme color has a row");
  assert(["accent-soft", "level-error-soft", "level-info-soft", "level-trace-soft", "border-soft"].every(k => auto(k) && auto(k).checked),
    "Dark's soft variants match their derivation, so they start as Auto");
  assert(val("level-error-soft").disabled && row("level-error-soft").querySelector(".te-swatch").disabled, "an Auto row can't be edited");
  assert(prev("bg-app") === "#10131a", "the preview gets the colors as CSS vars");

  // A base color change re-derives its soft variant, row and preview.
  type("level-error", "#00ff00");
  assert(val("level-error-soft").value === "rgba(0,255,0,.14)", "the ERROR background follows ERROR, got " + val("level-error-soft").value);
  assert(prev("level-error-soft") === "rgba(0,255,0,.14)" && prev("level-error") === "#00ff00", "...in the preview too");
  type("level-warn", "not a color");
  assert(val("level-warn").classList.contains("te-invalid"), "an invalid typed color is marked");
  assert(prev("level-warn") === "#e8a94a", "...and not applied");

  // Auto off: an explicit override, kept from the derived value on.
  auto("accent-soft").checked = false;
  auto("accent-soft").dispatchEvent(new w.Event("change"));
  assert(!val("accent-soft").disabled && val("accent-soft").value === "rgba(79,199,195,.14)", "unchecking Auto starts the override from the derived value");
  type("accent-soft", "#123456");
  type("accent", "#ff0000");
  assert(val("accent-soft").value === "#123456", "an override doesn't follow its base color");

  // The plain color picker: no Free/Theme toggle, no Clear, generic presets.
  w.setColorPickerMode("theme");
  fireClick(row("bg-panel").querySelector(".te-swatch"), w);
  const picker = d.querySelector("#colorPickerPopup");
  assert(isVisible(picker, w) && picker.classList.contains("cp-plain"), "a swatch opens the color picker in plain mode");
  assert(!isVisible(picker.querySelector(".cp-clear"), w) && !isVisible(picker.querySelector(".cp-mode-row"), w), "...without Clear and the Free/Theme toggle");
  assert(isVisible(picker.querySelector("#cpWheelWrap"), w), "...with the hue wheel even in Theme mode");
  assert(picker.querySelectorAll(".cp-preset").length === T.HIGHLIGHT_PRESETS.length, "...and the generic presets, not the theme palette");
  fireClick(picker.querySelector(".cp-preset"), w);
  assert(val("bg-panel").value === T.HIGHLIGHT_PRESETS[0] && !isVisible(picker, w), "a preset sets the color and closes the picker");
  fireClick(row("bg-panel").querySelector(".te-swatch"), w);
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(!isVisible(picker, w) && isVisible(editor, w), "Esc closes the picker first, the editor stays");
  fireClick(row("bg-panel").querySelector(".te-swatch"), w);
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(!isVisible(picker, w), "clicking elsewhere closes the picker");
  assert(!picker.classList.contains("cp-plain"), "...and drops plain mode for the next (filter node) open");
  assert(isVisible(editor, w) && isVisible(d.querySelector("#themeEditorError"), w) && T.customThemes.length === 0, "Save without a name shows an error");

  d.querySelector("#themeEditorName").value = "Ocean";
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(!isVisible(editor, w) && T.customThemes.length === 1, "Save with a name adds the theme");
  const t = T.customThemes[0];
  assert(t.name === "Ocean" && t.colors["level-error"] === "#00ff00" && t.colors["level-error-soft"] === "rgba(0,255,0,.14)", "derived soft colors are stored");
  assert(t.colors["accent-soft"] === "#123456" && t.colors["accent"] === "#ff0000", "overrides are stored");
  assert(t.colors["level-warn"] === "#e8a94a", "the invalid typed value never replaced the color");
  assert(!t.syntaxColors, "a new theme from a built-in carries no syntax colors unless included");
  assert(d.documentElement.getAttribute("data-theme") === t.id, "a new theme is switched to");

  // Edit + rename: same id, soft override remembered.
  const listRow = d.querySelector("#customThemeList .filter-library-row");
  fireClick([...listRow.querySelectorAll("button")].find(b => b.textContent === "Edit"), w);
  assert(isVisible(editor, w) && d.querySelector("#themeEditorTitle").textContent === "Edit theme" && d.querySelector("#themeEditorName").value === "Ocean", "Edit opens the theme");
  assert(!auto("accent-soft").checked && auto("level-error-soft").checked, "the override stays an override, the derived one stays Auto");
  d.querySelector("#themeEditorName").value = "Deep Ocean";
  d.querySelector("#themeEditorIncludeSyntax").checked = true;
  d.querySelector("#themeEditorIncludeSyntax").dispatchEvent(new w.Event("change"));
  type("syntax-tag", "#abcdef");
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(T.customThemes.length === 1 && T.customThemes[0].id === t.id && T.customThemes[0].name === "Deep Ocean", "saving an edit replaces the theme under its id (rename)");
  assert(T.customThemes[0].syntaxColors["syntax-tag"] === "#abcdef", "included syntax colors are stored");
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--syntax-tag").trim() === "#abcdef", "the edited active theme is re-applied");
  assert(d.querySelector("#settingsThemeDarkSelect").selectedOptions[0].textContent === "Deep Ocean", "the effective slot's dropdown shows the new name");
});

await withApp(async (w, d, T) => {
  section("295b. Theme editor: syntax scheme mode, import of a partial theme, light-background derivation");
  w.setTheme("dark"); // Classic Dark: the default theme is Catppuccin Mocha now, the asserted values below are Classic Dark's
  fireClick(d.querySelector("#btnSettings"), w);
  const editor = d.querySelector("#themeEditorDialog");
  const val = key => d.querySelector('#themeEditorGroups .te-row[data-key="' + key + '"] .te-value');

  fireClick(d.querySelector("#btnSyntaxNew"), w);
  assert(isVisible(editor, w) && d.querySelector("#themeEditorTitle").textContent === "New syntax scheme", "+ New scheme… opens the editor in syntax mode");
  assert(d.querySelectorAll("#themeEditorGroups .te-row").length === T.SYNTAX_COLOR_KEYS.length, "only the syntax colors are listed");
  val("syntax-number").value = "#112233";
  fireInput(val("syntax-number"), w);
  d.querySelector("#themeEditorName").value = "Mono";
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(T.customSyntaxSchemes.length === 1 && T.customSyntaxSchemes[0].colors["syntax-number"] === "#112233", "the scheme is saved");
  assert(T.syntaxSchemeChoice === T.customSyntaxSchemes[0].id, "...and switched to");
  const sRow = d.querySelector("#customSyntaxSchemeList .filter-library-row");
  fireClick([...sRow.querySelectorAll("button")].find(b => b.textContent === "Edit"), w);
  assert(d.querySelector("#themeEditorTitle").textContent === "Edit syntax scheme" && val("syntax-number").value === "#112233", "Edit reopens the scheme");
  d.querySelector("#themeEditorName").value = "Mono 2";
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(T.customSyntaxSchemes.length === 1 && T.customSyntaxSchemes[0].name === "Mono 2", "renaming keeps one scheme");

  // A partial theme file: the missing colors come from the active ones, a
  // missing soft key is derived (light background → the light alpha).
  w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 1, name: "Partial", colors: { "bg-app": "#fafafa", "level-error": "#cc0000" } }));
  assert(isVisible(editor, w) && val("bg-app").value === "#fafafa", "the file's colors are prefilled");
  assert(val("text-primary").value === "#e7eaf1", "missing colors come from the active theme, got " + val("text-primary").value);
  assert(val("level-error-soft").value === "rgba(204,0,0,.12)", "a missing soft color is derived (light alpha on a light background), got " + val("level-error-soft").value);
  fireClick(d.querySelector("#themeEditorSave"), w);
  assert(T.customThemes.length === 1 && T.customThemes[0].name === "Partial", "Save adds the imported theme under its own name");
});
