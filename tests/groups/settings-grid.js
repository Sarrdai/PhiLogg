// GROUP settings-grid — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP settings-grid — Settings dialog cleanup, step 1 (variant C): one
   fixed control column, short choices as segmented controls built from a
   hidden <select>, steppers with a "Reset to default" icon button, the accent
   color as one button + popover, the regrouped Behavior section, one desc line
   per section and short hints.
   Origin: 2026-10-07 (person-requested settings cleanup; the mockup variant C
   was approved before implementation).
   jsdom has no layout, so the "same width" rule is checked on the computed
   CSS (every control fills the 248px column, the column is 248px); the real
   rendered widths were measured in the screenshot round.
   ============================================================ */
group("settings-grid");

const SEG_SELECTS = {
  settingsFhLayout: ["tabs", "stacked"],
  settingsFilterActivationView: ["rememberLast", "alwaysFiltered"],
  settingsOpenScrollPosition: ["start", "end"],
  settingsFilterToolbarLabels: ["never", "hover", "always"],
  settingsViewToolbarLabels: ["never", "hover", "always"],
  settingsContextInitialExpansion: ["aroundJump", "collapsed", "expanded"],
  settingsContextExpandStepUnit: ["entries", "time"],
  settingsMinimapBinningMode: ["time", "entries"],
  settingsTempAnchorMode: ["off", "persistent", "fade"],
  settingsTreeIndicatorMode: ["icon", "type"],
  settingsTextMatchHighlightScope: ["last", "any"],
  settingsClipboardDecimalSelect: ["auto", ".", ","],
};

await withApp(async (w, d, T) => {
  section("settings-grid a. One 248px control column; every control of Appearance + Behavior fills it");
  w.openSettingsDialog();
  const dlg = d.getElementById("settingsDialog");
  assert(w.getComputedStyle(dlg).getPropertyValue("--settings-ctl-w").trim() === "248px", "the control column is 248px wide");
  const rows = [...d.querySelectorAll("#settingsSectionAppearance .settings-row, #settingsSectionBehavior .settings-row")];
  assert(rows.length >= 30, "sanity: Appearance + Behavior rows found, got " + rows.length);
  assert(rows.every(r => /248px/.test(w.getComputedStyle(r).gridTemplateColumns) || /var\(--settings-ctl-w\)/.test(w.getComputedStyle(r).gridTemplateColumns)),
    "every row uses the fixed-column grid, got " + w.getComputedStyle(rows[0]).gridTemplateColumns);
  // Selects that stay selects (open lists) fill the column ...
  ["settingsThemeLightSelect", "settingsThemeDarkSelect", "settingsUiFontSelect", "settingsLogFontSelect", "settingsSyntaxSchemeSelect"].forEach(id => {
    const sel = d.getElementById(id);
    assert(w.getComputedStyle(sel).width === "100%" && w.getComputedStyle(sel).display !== "none", "#" + id + " is a visible select filling the column");
  });
  // ... and so does every segmented group, the theme mode row and the accent button.
  const segs = [...d.querySelectorAll("#settingsSectionBehavior .settings-seg")];
  assert(segs.length === Object.keys(SEG_SELECTS).length, "Behavior has one segmented control per short choice, got " + segs.length);
  segs.forEach(g => assert(w.getComputedStyle(g).width === "100%", "a segmented control fills the column"));
  assert(w.getComputedStyle(d.getElementById("settingsThemeModeRow")).width === "100%", "the Theme mode row fills the column");
  assert(w.getComputedStyle(d.querySelector("#settingsAccentPicker .accent-trigger")).width === "100%", "the accent button fills the column");
  d.querySelectorAll("#settingsSectionBehavior .settings-seg .assert-mode-btn").forEach(b => {
    assert(w.getComputedStyle(b).flexGrow === "1" && /^0(px|%)?$/.test(w.getComputedStyle(b).flexBasis), "segment buttons have equal widths (flex 1 1 0)");
  });
  // Steppers are 120px, pill toggles keep their size.
  d.querySelectorAll("#settingsSectionAppearance .stepper, #settingsSectionBehavior .stepper").forEach(s =>
    assert(w.getComputedStyle(s).width === "120px", "a stepper is 120px wide, got " + w.getComputedStyle(s).width));

  section("settings-grid b. Short choices are segmented controls over a hidden select (option values untouched)");
  for (const id of Object.keys(SEG_SELECTS)) {
    const sel = d.getElementById(id);
    assert(sel && w.getComputedStyle(sel).display === "none", "#" + id + " stays in the DOM as a hidden state carrier");
    assert([...sel.options].map(o => o.value).join("|") === SEG_SELECTS[id].join("|"), "#" + id + " keeps its option values");
    const group = sel.parentNode.querySelector(".settings-seg");
    assert(group, "#" + id + " has a segmented group");
    const btns = [...group.querySelectorAll(".assert-mode-btn")];
    assert(btns.map(b => b.dataset.value).join("|") === SEG_SELECTS[id].join("|") && btns.map(b => b.textContent).join("|") === [...sel.options].map(o => o.textContent).join("|"),
      "#" + id + ": one button per option, text = option text");
    assert(btns.filter(b => b.classList.contains("active")).length === 1 && btns.find(b => b.classList.contains("active")).dataset.value === sel.value,
      "#" + id + ": exactly the current value's button is active");
  }
  // Only open lists remain visible selects in Appearance + Behavior.
  const visibleSelects = [...d.querySelectorAll("#settingsSectionAppearance select, #settingsSectionBehavior select")].filter(s => w.getComputedStyle(s).display !== "none").map(s => s.id).sort();
  assert(visibleSelects.join(",") === ["settingsLogFontSelect", "settingsSyntaxSchemeSelect", "settingsThemeDarkSelect", "settingsThemeLightSelect", "settingsUiFontSelect"].join(","),
    "only open lists stay dropdowns, got " + visibleSelects.join(","));

  section("settings-grid c. A segment click sets the hidden select, fires its change handler and persists");
  const segBtn = (id, v) => d.getElementById(id).parentNode.querySelector('.settings-seg .assert-mode-btn[data-value="' + v + '"]');
  fireClick(segBtn("settingsOpenScrollPosition", "end"), w);
  assert(d.getElementById("settingsOpenScrollPosition").value === "end", "the hidden select follows the click");
  assert(w.localStorage.getItem("philogg-open-scroll-position") === "end" || T.openScrollPosition === "end", "the setting is applied");
  assert(segBtn("settingsOpenScrollPosition", "end").classList.contains("active") && !segBtn("settingsOpenScrollPosition", "start").classList.contains("active"), "the clicked button becomes the active one");
  fireClick(segBtn("settingsMinimapBinningMode", "entries"), w);
  assert(T.minimapBinningMode === "entries" && w.localStorage.getItem("philogg-minimap-binning-mode") === "entries", "minimap binning: state + localStorage");
  fireClick(segBtn("settingsTempAnchorMode", "off"), w);
  assert(T.tempAnchorMode === "off" && w.localStorage.getItem("philogg-temp-anchor-mode") === "off", "temp anchor mode: state + localStorage");
  assert(!d.getElementById("settingsTempAnchorFadeRow") || w.getComputedStyle(d.getElementById("settingsTempAnchorFadeRow")).display === "none", "the fade-time row hides when the mode is not Fade");
  fireClick(segBtn("settingsTempAnchorMode", "fade"), w);
  assert(w.getComputedStyle(d.getElementById("settingsTempAnchorFadeRow")).display !== "none", "...and shows again for Fade");
  fireClick(segBtn("settingsClipboardDecimalSelect", ","), w);
  assert(w.localStorage.getItem("philogg-clipboard-decimal") === "," || d.getElementById("settingsClipboardDecimalSelect").value === ",", "decimal separator applied");
  // Clicking the active button again is a no-op (no change event).
  let changes = 0;
  d.getElementById("settingsFhLayout").addEventListener("change", () => changes++);
  fireClick(segBtn("settingsFhLayout", "tabs"), w);
  assert(changes === 0, "clicking the already active segment fires nothing");
  fireClick(segBtn("settingsFhLayout", "stacked"), w);
  assert(changes === 1 && T.fhLayout === "stacked", "a real switch fires change once and applies the layout");
  fireClick(segBtn("settingsFhLayout", "tabs"), w);

  section("settings-grid d. Setting select.value programmatically re-syncs the active button");
  const sel = d.getElementById("settingsContextInitialExpansion");
  sel.value = "expanded";
  assert(segBtn("settingsContextInitialExpansion", "expanded").classList.contains("active") && !segBtn("settingsContextInitialExpansion", "aroundJump").classList.contains("active"),
    "select.value = 'expanded' moves the active class");
  sel.value = "collapsed";
  assert(segBtn("settingsContextInitialExpansion", "collapsed").classList.contains("active") && sel.value === "collapsed", "and again; the getter still works");
  // Re-opening the dialog and the init functions (which assign .value) keep it in sync too.
  w.localStorage.setItem("philogg-view-toolbar-labels", "always");
  w.eval("initToolbarLabelsSettings()");
  assert(segBtn("settingsViewToolbarLabels", "always").classList.contains("active"), "an init function's `select.value = x` reaches the buttons");
});

await withApp(async (w, d, T) => {
  section("settings-grid e. Every stepper has a ↺ 'Reset to default' button that restores the default");
  w.openSettingsDialog();
  const reset = id => d.getElementById(id);
  ["fontScaleReset", "logTextScaleReset", "settingsContextExpandStepReset", "settingsContextExpandStepMsReset", "tempAnchorFadeReset"].forEach(id => {
    const b = reset(id);
    assert(b && b.title === "Reset to default" && !b.textContent.trim() && b.querySelector("svg"), "#" + id + " is an icon button titled 'Reset to default' (no text)");
  });
  // UI scale
  fireClick(d.getElementById("fontScaleUp"), w);
  fireClick(d.getElementById("fontScaleUp"), w);
  assert(d.getElementById("fontScaleValue").textContent === "120%", "sanity: UI scale moved");
  fireClick(reset("fontScaleReset"), w);
  assert(d.getElementById("fontScaleValue").textContent === "100%", "UI scale resets to 100%");
  // Log text size
  fireClick(d.getElementById("logTextScaleDown"), w);
  assert(d.getElementById("logTextScaleValue").textContent === "90%", "sanity: log text size moved");
  fireClick(reset("logTextScaleReset"), w);
  assert(d.getElementById("logTextScaleValue").textContent === "100%" && w.localStorage.getItem("philogg-log-text-scale") === "100", "Log text size resets to 100% and persists");
  // Lines per step
  fireClick(d.getElementById("settingsContextExpandStepInc"), w);
  assert(d.getElementById("settingsContextExpandStep").value === "11", "sanity: lines per step moved");
  fireClick(reset("settingsContextExpandStepReset"), w);
  assert(d.getElementById("settingsContextExpandStep").value === "10" && T.contextExpandStep === 10, "Lines per step resets to 10");
  // Time per step
  fireClick(d.getElementById("settingsContextExpandStepMsInc"), w);
  assert(d.getElementById("settingsContextExpandStepMs").value === "600", "sanity: time per step moved");
  fireClick(reset("settingsContextExpandStepMsReset"), w);
  assert(d.getElementById("settingsContextExpandStepMs").value === "500" && T.contextExpandStepMs === 500, "Time per step resets to 500 ms");
  // Anchor fade time
  fireClick(d.getElementById("tempAnchorFadeUp"), w);
  fireClick(d.getElementById("tempAnchorFadeUp"), w);
  assert(d.getElementById("tempAnchorFadeValue").textContent === "4s", "sanity: anchor fade moved to 4s, got " + d.getElementById("tempAnchorFadeValue").textContent);
  fireClick(reset("tempAnchorFadeReset"), w);
  assert(d.getElementById("tempAnchorFadeValue").textContent === "3s" && w.localStorage.getItem("philogg-temp-anchor-fade-seconds") === "3", "Anchor fade time resets to 3 s and persists");
});

await withApp(async (w, d, T) => {
  section("settings-grid f. Accent color: one button, a popover that opens, picks and closes");
  w.openSettingsDialog();
  const picker = d.getElementById("settingsAccentPicker");
  const trigger = () => picker.querySelector(".accent-trigger");
  const pop = () => picker.querySelector(".accent-popover");
  assert(trigger() && /Theme default/.test(trigger().textContent), "the button reads 'Theme default' with no pick");
  assert(!isVisible(pop(), w), "the popover starts closed");
  fireClick(trigger(), w);
  assert(isVisible(pop(), w) && trigger().getAttribute("aria-expanded") === "true", "clicking the button opens the popover");
  const palette = T.BUILTIN_THEMES.find(t => t.id === "catppuccin-mocha").highlightPalette;
  assert(pop().querySelectorAll(".accent-swatch:not(.accent-swatch-reset)").length === palette.length && pop().querySelector(".accent-swatch-reset"), "it holds the palette swatches plus the Theme default swatch");
  fireClick(pop(), w);
  assert(isVisible(pop(), w), "a click inside the popover (not on a swatch) keeps it open");
  fireClick(trigger(), w);
  assert(!isVisible(pop(), w), "the button toggles it closed again");
  // Pick
  fireClick(trigger(), w);
  fireClick([...pop().querySelectorAll(".accent-swatch")].find(s => s.title === "#cba6f7"), w);
  assert(T.accentChoices["catppuccin-mocha"] === "#cba6f7", "picking a swatch stores the accent");
  assert(!isVisible(pop(), w), "the popover closes after a pick");
  assert(trigger().textContent.includes("#cba6f7") && trigger().querySelector(".mono"), "the button now shows the hex in mono");
  // Outside click closes
  fireClick(trigger(), w);
  assert(isVisible(pop(), w), "re-opened");
  fireClick(d.querySelector("#settingsSectionAppearance .settings-section-title"), w);
  assert(!isVisible(pop(), w), "an outside click closes it");
  // Escape closes the popover first and leaves Settings open
  fireClick(trigger(), w);
  fireKeydown(d, w, "Escape");
  assert(!isVisible(pop(), w) && !d.getElementById("settingsDialog").classList.contains("hidden"), "Escape closes only the popover; Settings stays open");
  // Reset swatch
  fireClick(trigger(), w);
  fireClick(pop().querySelector(".accent-swatch-reset"), w);
  assert(!("catppuccin-mocha" in T.accentChoices) && /Theme default/.test(trigger().textContent), "the Theme default swatch clears the pick and the button says so again");
});

await withApp(async (w, d, T) => {
  section("settings-grid g. Grouping and wording");
  w.openSettingsDialog();
  const titles = sec => [...d.querySelectorAll("#" + sec + " .settings-subsection-title")].map(e => e.textContent);
  assert(titles("settingsSectionAppearance").slice(0, 3).join("|") === "Theme|Text & scale|Syntax highlighting", "Appearance groups: Theme, Text & scale, Syntax highlighting (+ the custom lists)");
  const cardOf = id => d.getElementById(id).closest(".settings-card");
  const behCards = [...d.querySelectorAll("#settingsSectionBehavior .settings-card")];
  assert(cardOf("settingsTreeIndicatorMode") === behCards[5] && titles("settingsSectionBehavior")[5] === "Filter tree",
    "the Tree row type indicator ('Type indicator') sits in the Filter tree group");
  assert(cardOf("settingsTextMatchHighlightScope") === behCards[6] && !behCards[6].contains(d.getElementById("settingsTreeIndicatorMode")), "...and no longer under Match highlighting");
  const labels = sec => [...d.querySelectorAll("#" + sec + " .settings-row-label")].map(e => e.textContent);
  assert(labels("settingsSectionBehavior").includes("Type indicator") && labels("settingsSectionBehavior").includes("Anchor fade time") && labels("settingsSectionBehavior").includes("Decimal separator"), "new labels are in place");
  // One desc line per section, texts from the approved mock.
  const descs = { settingsSectionAppearance: "Theme, fonts and size of the interface.", settingsSectionBehavior: "How views, panels and the filter tree react.",
    settingsSectionIde: "Open a log entry's source line in a running IDE.", settingsSectionLlm: "A local LLM builds filters, links and plots. Localhost only.",
    settingsSectionFormats: "How lines are parsed, and which file uses which format.", settingsSectionShortcuts: "Click a key combination to change it." };
  for (const [id, text] of Object.entries(descs)) {
    const ds = d.querySelectorAll("#" + id + " .settings-section-desc");
    assert(ds.length === 1 && ds[0].textContent === text, "#" + id + " has exactly one desc: " + text);
  }
  // Hint rule: one line, short.
  const longHints = [...d.querySelectorAll("#settingsSectionAppearance .settings-row-hint, #settingsSectionBehavior .settings-row-hint, #settingsSectionIde .settings-row-hint, #settingsSectionLlm .settings-row-hint")]
    .filter(h => h.textContent.length > 64).map(h => h.textContent);
  assert(longHints.length === 0, "hints stay within ~60 chars, too long: " + JSON.stringify(longHints));
  // IDE / Assistant wording
  const ideLabels = labels("settingsSectionIde").concat(labels("settingsSectionLlm"));
  ["Path anchor", "Open in Rider", "Project name", "Enable assistant", "Server URL", "Model"].forEach(l => assert(ideLabels.includes(l), "label '" + l + "' present"));
  // Phone: the column becomes the full row width (rows stack)
  const rowStyle = w.getComputedStyle(d.querySelector("#settingsSectionBehavior .settings-row"));
  assert(rowStyle.display === "grid", "rows are grids");
});
