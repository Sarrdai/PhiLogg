// GROUP 210 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 210 — Separately configurable syntax-highlight scheme
   (FEATURE_BACKLOG.md #67)
   Origin: this session. The eight SYNTAX_COLOR_KEYS can now be driven by a
   scheme picked independently of the app theme (#settingsSyntaxSchemeSelect):
   "Follow app theme" (default, preserves the pre-#67 behaviour), one built-in
   pendant per built-in app theme (BUILTIN_SYNTAX_SCHEMES), or a user-imported
   custom scheme (our own JSON format, customSyntaxSchemes in localStorage
   philogg-custom-syntax-schemes; the choice itself in philogg-syntax-scheme).
   applyTheme() calls applySyntaxScheme() after the theme's own colors are in
   place, so a chosen scheme overrides --syntax-* inline regardless of the
   active app theme.
   Updated this session (2026-09-14, person-reported bugfix): "Follow app
   theme" didn't visibly change when switching to/between the four Catppuccin
   flavors — only Dark/Light declare their own [data-theme] --syntax-* CSS
   block, so every other built-in theme silently cascaded to Dark's colors
   and never looked different. applySyntaxScheme() now falls back to the
   BUILTIN_SYNTAX_SCHEMES entry matching the active theme id for follow-theme
   on a built-in app theme, applied inline like a chosen scheme; a custom app
   theme (no matching id) is unaffected, still just the CSS cascade / its own
   optional syntaxColors block. 210a's old "cascades to the :root default"
   assertion for Mocha (the bug, previously asserted as correct) is replaced
   below with an assertion that every Catppuccin flavor gets its OWN pendant
   colors and that switching between two of them actually changes --syntax-*.
   ============================================================ */
group(210);
await withApp(async (w, d, T) => {
  section("210a. Default 'Follow app theme' preserves current --syntax-* behaviour");
  assert(T.syntaxSchemeChoice === "follow-theme", "the default scheme choice is 'follow-theme', got " + T.syntaxSchemeChoice);
  const select = d.querySelector("#settingsSyntaxSchemeSelect");
  assert(select, "the syntax scheme <select> exists in Settings → Appearance");
  assert([...select.options].map(o => o.value).includes("follow-theme"), "a 'Follow app theme' option is offered");
  assert(select.value === "follow-theme", "the select reflects the default choice");
  T.BUILTIN_SYNTAX_SCHEMES.forEach(s => {
    assert([...select.querySelectorAll("option")].some(o => o.value === s.id), "built-in syntax scheme " + s.id + " is offered");
  });

  // Under Classic Dark, the eight --syntax-* vars resolve to the :root
  // defaults — which the built-in "dark" scheme reproduces verbatim. (The
  // default theme is Catppuccin Mocha now, so pick Classic Dark explicitly;
  // the default's own pendant is covered by the Catppuccin loop below.)
  w.setTheme("dark");
  const csDark = w.getComputedStyle(d.documentElement);
  const darkScheme = T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "dark");
  T.SYNTAX_COLOR_KEYS.forEach(k => {
    assert(csDark.getPropertyValue("--" + k).trim() === darkScheme.colors[k],
      "follow-theme on Dark: --" + k + " resolves to the :root default (" + darkScheme.colors[k] + "), got " + csDark.getPropertyValue("--" + k));
  });

  // Switching the APP THEME with follow-theme active moves the syntax colors
  // with it: Light has its own [data-theme=light] --syntax-* block.
  w.setTheme("light");
  const csLight = w.getComputedStyle(d.documentElement);
  const lightScheme = T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "light");
  assert(csLight.getPropertyValue("--syntax-tag").trim() === lightScheme.colors["syntax-tag"],
    "follow-theme follows the app theme: Light's --syntax-tag applies, got " + csLight.getPropertyValue("--syntax-tag"));
  // A built-in theme with no CSS [data-theme] --syntax-* block of its own
  // (the four Catppuccin flavors) still gets its OWN pendant colors under
  // follow-theme, applied inline by applySyntaxScheme() from
  // BUILTIN_SYNTAX_SCHEMES — NOT a silent cascade to Dark's colors (that was
  // the bug: "Follow app theme" never visibly changed across Catppuccin
  // flavors because none of them override --syntax-* in CSS).
  ["catppuccin-latte", "catppuccin-frappe", "catppuccin-macchiato", "catppuccin-mocha"].forEach(themeId => {
    w.setTheme(themeId);
    const pendant = T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === themeId);
    const cs = w.getComputedStyle(d.documentElement);
    T.SYNTAX_COLOR_KEYS.forEach(k => {
      assert(cs.getPropertyValue("--" + k).trim() === pendant.colors[k],
        "follow-theme on " + themeId + ": --" + k + " is that flavor's own pendant (" + pendant.colors[k] + "), got " + cs.getPropertyValue("--" + k));
    });
  });
  // The actual reported symptom: switching between two Catppuccin flavors
  // with follow-theme active must visibly change the syntax colors.
  w.setTheme("catppuccin-mocha");
  const mochaTag = w.getComputedStyle(d.documentElement).getPropertyValue("--syntax-tag").trim();
  w.setTheme("catppuccin-latte");
  const latteTag = w.getComputedStyle(d.documentElement).getPropertyValue("--syntax-tag").trim();
  assert(mochaTag !== latteTag, "follow-theme: --syntax-tag actually changes when switching from Mocha to Latte (" + mochaTag + " vs " + latteTag + ")");
  assert(w.localStorage.getItem("philogg-syntax-scheme") === null || w.localStorage.getItem("philogg-syntax-scheme") === "follow-theme",
    "follow-theme is not written to localStorage unless explicitly chosen");
});

await withApp(async (w, d, T) => {
  section("210b. A built-in syntax scheme overrides --syntax-* independently of the app theme");
  // App theme Light, syntax scheme Mocha — the syntax colors must be Mocha's,
  // not Light's, proving the two are decoupled.
  w.setTheme("light");
  const mochaScheme = T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "catppuccin-mocha");
  w.setSyntaxScheme("catppuccin-mocha");
  assert(T.syntaxSchemeChoice === "catppuccin-mocha", "the scheme choice updates");
  assert(w.localStorage.getItem("philogg-syntax-scheme") === "catppuccin-mocha", "the scheme choice persists to localStorage");
  let cs = w.getComputedStyle(d.documentElement);
  T.SYNTAX_COLOR_KEYS.forEach(k => {
    assert(cs.getPropertyValue("--" + k).trim() === mochaScheme.colors[k],
      "scheme override: --" + k + " is Mocha's (" + mochaScheme.colors[k] + ") under the Light app theme, got " + cs.getPropertyValue("--" + k));
  });
  assert(d.documentElement.getAttribute("data-theme") === "light", "the app theme is untouched by the syntax scheme choice");

  // Switching the app theme to Dark keeps the chosen syntax scheme (Mocha).
  w.setTheme("dark");
  cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--syntax-tag").trim() === mochaScheme.colors["syntax-tag"],
    "the chosen syntax scheme survives an app-theme switch, got " + cs.getPropertyValue("--syntax-tag"));

  // Back to follow-theme clears the inline override; --syntax-* resolve to
  // Dark's :root defaults again.
  w.setSyntaxScheme("follow-theme");
  cs = w.getComputedStyle(d.documentElement);
  const darkScheme = T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "dark");
  assert(cs.getPropertyValue("--syntax-tag").trim() === darkScheme.colors["syntax-tag"],
    "returning to follow-theme clears the scheme override, got " + cs.getPropertyValue("--syntax-tag"));
});

await withApp(async (w, d, T) => {
  section("210c. Importing a custom syntax scheme: validation, editor prefill, export round-trip, apply + persist, delete");
  fireClick(d.querySelector("#btnSettings"), w);
  const editor = d.querySelector("#themeEditorDialog");
  assert(d.querySelector("#customSyntaxSchemeList .filter-library-empty"), "the custom syntax scheme list starts empty");

  assert(w.importSyntaxSchemeJson("{not json") === false, "malformed JSON is not a scheme file");
  assert(w.importSyntaxSchemeJson(JSON.stringify({ name: "No tag", colors: {} })) === false, "a JSON file without the philogg-syntax-scheme format tag is not a scheme file");
  assert(w.importSyntaxSchemeJson(JSON.stringify({ format: "philogg-syntax-scheme", version: 99, colors: {} })) === true && !isVisible(editor, w),
    "a scheme file from a newer version is rejected without opening the editor");
  assert(T.customSyntaxSchemes.length === 0, "nothing added so far");

  const cs0 = w.getComputedStyle(d.documentElement);
  const colors = {};
  T.SYNTAX_COLOR_KEYS.forEach(k => { colors[k] = cs0.getPropertyValue("--" + k).trim(); });
  colors["syntax-tag"] = "#ff00aa";
  colors["syntax-string"] = "#00ffcc";
  w.importSyntaxSchemeJson(JSON.stringify({ format: "philogg-syntax-scheme", version: 1, name: "My Neon Syntax", colors }));
  assert(isVisible(editor, w), "a valid scheme file opens the editor");
  assert(d.querySelector("#themeEditorTitle").textContent === "Import syntax scheme", "...as a syntax scheme import");
  assert(d.querySelectorAll("#themeEditorGroups .te-row").length === T.SYNTAX_COLOR_KEYS.length, "...listing only the syntax colors");
  assert(!isVisible(d.querySelector("#themeEditorTextLightRow"), w), "...without the theme-only text flag");
  fireClick(d.querySelector("#themeEditorSave"), w);

  assert(T.customSyntaxSchemes.length === 1, "saving the imported scheme adds it");
  const imported = T.customSyntaxSchemes[0];
  assert(imported.name === "My Neon Syntax", "the imported scheme name is preserved");
  assert(imported.colors["syntax-tag"] === "#ff00aa", "imported colors are preserved");
  assert(JSON.parse(w.localStorage.getItem("philogg-custom-syntax-schemes"))[0].name === "My Neon Syntax", "custom schemes persist to localStorage");

  assert(T.syntaxSchemeChoice === imported.id, "saving an imported scheme switches to it immediately");
  let cs = w.getComputedStyle(d.documentElement);
  assert(cs.getPropertyValue("--syntax-tag").trim() === "#ff00aa", "the custom scheme's colors are applied inline, got " + cs.getPropertyValue("--syntax-tag"));
  assert(cs.getPropertyValue("--syntax-string").trim() === "#00ffcc", "...for every key, got " + cs.getPropertyValue("--syntax-string"));

  const select = d.querySelector("#settingsSyntaxSchemeSelect");
  assert([...select.options].some(o => o.value === imported.id && o.textContent === "My Neon Syntax"), "the imported scheme appears in the dropdown");
  assert(select.value === imported.id, "the dropdown reflects the newly-active custom scheme");
  const listRow = d.querySelector("#customSyntaxSchemeList .filter-library-row");
  assert(listRow && listRow.textContent.includes("My Neon Syntax"), "the imported scheme is listed in the card");

  // Export button on the row: the file re-imports to the same colors.
  const captured = [];
  w.downloadBlobFallback = (blob, name) => { const e = { name, json: null }; captured.push(e); blob.text().then(t => { e.json = t; }); };
  fireClick([...listRow.querySelectorAll("button")].find(b => b.textContent === "Export"), w);
  await waitFor(() => captured.length === 1 && captured[0].json !== null);
  const file = JSON.parse(captured[0].json);
  assert(file.format === "philogg-syntax-scheme" && file.name === "My Neon Syntax" && file.colors["syntax-string"] === "#00ffcc", "Export writes the scheme as a philogg-syntax-scheme file");
  assert(captured[0].name.endsWith(".syntax.json"), "suggested file name, got " + captured[0].name);

  // Deleting the active custom scheme removes it everywhere and falls back to
  // follow-theme (which restores the app theme's own --syntax-* defaults).
  d.querySelector("#customSyntaxSchemeList .filter-library-row-del").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(T.customSyntaxSchemes.length === 0, "deleting the scheme removes it from customSyntaxSchemes");
  assert(JSON.parse(w.localStorage.getItem("philogg-custom-syntax-schemes")).length === 0, "...and from localStorage");
  assert(T.syntaxSchemeChoice === "follow-theme", "deleting the ACTIVE custom scheme falls back to follow-theme");
  // (the default app theme is Catppuccin Mocha, whose own pendant follow-theme applies)
  const mochaScheme = T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "catppuccin-mocha");
  assert(w.getComputedStyle(d.documentElement).getPropertyValue("--syntax-tag").trim() === mochaScheme.colors["syntax-tag"],
    "...and the app theme's default --syntax-* colors are restored");
  assert(d.querySelector("#customSyntaxSchemeList .filter-library-empty"), "the list shows the empty state again");
});

await withApp(async (w, d, T) => {
  section("210d. A stale/deleted syntax scheme id in localStorage falls back to follow-theme on init");
  w.localStorage.setItem("philogg-syntax-scheme", "syntax:does-not-exist");
  w.initSyntaxScheme();
  assert(T.syntaxSchemeChoice === "follow-theme", "resolveSyntaxSchemeId falls back to follow-theme for an unknown id, got " + T.syntaxSchemeChoice);
});
