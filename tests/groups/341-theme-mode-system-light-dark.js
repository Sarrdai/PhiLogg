// GROUP 341 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 341 — Theme mode (System / Light / Dark) + light/dark theme slots:
   Catppuccin Latte/Mocha are the defaults, the app follows the OS
   light/dark setting live. Settings -> Appearance: a segmented "Theme"
   control (#settingsThemeModeRow, .assert-mode-btn per mode) plus two
   dropdowns, "Light theme" (#settingsThemeLightSelect) and "Dark theme"
   (#settingsThemeDarkSelect), both listing every theme. Persisted as
   philogg-theme-mode / -light / -dark; the old philogg-theme key is ignored.
   setTheme(id) puts the theme into the slot of the effective scheme.
   The OS preference is a controllable matchMedia stub (osStub below).
   ============================================================ */
group(341);
if (groupSelected()) {
  // A controllable prefers-color-scheme MediaQueryList: set(light) flips
  // .matches and fires the registered "change" listeners like the browser
  // does when the OS switches. legacy: true offers only addListener.
  const osStub = (initialLight, { legacy = false } = {}) => {
    const listeners = new Set();
    const mql = { media: "(prefers-color-scheme: light)", matches: !!initialLight };
    if (legacy) {
      mql.addListener = fn => listeners.add(fn);
    } else {
      mql.addEventListener = (type, fn) => { if (type === "change") listeners.add(fn); };
      mql.removeEventListener = (type, fn) => { if (type === "change") listeners.delete(fn); };
    }
    return {
      matchMedia: () => mql,
      set(light) { mql.matches = !!light; [...listeners].forEach(fn => fn({ type: "change", matches: mql.matches, media: mql.media })); },
      get listeners() { return listeners.size; },
    };
  };
  // withApp options: the stub as window.matchMedia, plus localStorage values
  // that must already exist when the page boots (FOUC script + initTheme).
  const themeApp = (os, stored = {}) => ({
    beforeParse: window => {
      window.matchMedia = os.matchMedia;
      Object.entries(stored).forEach(([k, v]) => window.localStorage.setItem(k, v));
    },
  });
  const themeOf = d => d.documentElement.getAttribute("data-theme");
  const selVal = (d, id) => d.querySelector("#" + id).value;
  const pickSel = (d, w, id, value) => {
    const sel = d.querySelector("#" + id);
    sel.value = value;
    sel.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const activeModes = d => [...d.querySelectorAll("#settingsThemeModeRow .assert-mode-btn.active")].map(b => b.dataset.themeMode);
  // A custom theme through the real import -> editor -> Save path; it lands in the effective slot.
  const addCustomTheme = (w, d, T, name) => {
    const cs0 = w.getComputedStyle(d.documentElement);
    const colors = {};
    T.THEME_COLOR_KEYS.forEach(k => { colors[k] = cs0.getPropertyValue("--" + k).trim(); });
    colors["bg-app"] = "#123456";
    w.importThemeJson(JSON.stringify({ format: "philogg-theme", version: 1, name, colors }));
    fireClick(d.querySelector("#themeEditorSave"), w);
    return T.customThemes.find(t => t.name === name);
  };

  section("341a. Defaults on empty storage: mode System, Latte/Mocha slots, the OS decides which one shows");
  {
    const os = osStub(false);
    await withApp(async (w, d, T) => {
      assert(T.themeModeChoice === "system", "the default mode is system, got " + T.themeModeChoice);
      assert(themeOf(d) === "catppuccin-mocha", "OS not light -> Catppuccin Mocha, got " + themeOf(d));
      assert(selVal(d, "settingsThemeLightSelect") === "catppuccin-latte" && selVal(d, "settingsThemeDarkSelect") === "catppuccin-mocha",
        "the slots default to Latte (light) and Mocha (dark), got " + selVal(d, "settingsThemeLightSelect") + " / " + selVal(d, "settingsThemeDarkSelect"));
      assert(JSON.stringify(activeModes(d)) === JSON.stringify(["system"]), "only the System button is active, got " + JSON.stringify(activeModes(d)));
      ["philogg-theme-mode", "philogg-theme-light", "philogg-theme-dark", "philogg-theme"].forEach(k =>
        assert(w.localStorage.getItem(k) === null, "defaults are not written to localStorage: " + k));
      assert(d.querySelector("#settingsThemeSelect") === null, "the old single #settingsThemeSelect no longer exists");
      assert(w.getComputedStyle(d.documentElement).getPropertyValue("--bg-app").trim() === "#1e1e2e", "Mocha's colors are on screen");
      assert(w.currentThemeId() === "catppuccin-mocha" && w.activeThemeId() === "catppuccin-mocha", "currentThemeId/activeThemeId agree");
    }, themeApp(os));
    const osLight = osStub(true);
    await withApp(async (w, d, T) => {
      assert(themeOf(d) === "catppuccin-latte", "OS light -> Catppuccin Latte, got " + themeOf(d));
      assert(w.getComputedStyle(d.documentElement).getPropertyValue("--bg-app").trim() === "#eff1f5", "Latte's colors are on screen");
      assert(w.effectiveScheme() === "light" && w.osPrefersLight() === true, "effectiveScheme/osPrefersLight report light");
    }, themeApp(osLight));
  }

  section("341b. Live OS following in mode System: the app switches Latte <-> Mocha without a reload");
  {
    const os = osStub(false);
    await withApp(async (w, d, T) => {
      assert(os.listeners === 1, "exactly one change listener is registered, got " + os.listeners);
      assert(themeOf(d) === "catppuccin-mocha", "sanity: starts on Mocha");
      os.set(true);
      assert(themeOf(d) === "catppuccin-latte", "the OS switching to light switches the app to Latte, got " + themeOf(d));
      assert(w.getComputedStyle(d.documentElement).getPropertyValue("--bg-app").trim() === "#eff1f5", "...and Latte's colors are applied");
      os.set(false);
      assert(themeOf(d) === "catppuccin-mocha", "...and back to Mocha, got " + themeOf(d));
      assert(w.localStorage.getItem("philogg-theme-mode") === null, "OS-driven switches persist nothing");

      // Mode Dark / Light ignore the OS.
      fireClick(d.querySelector("#settingsThemeModeDark"), w);
      os.set(true);
      assert(themeOf(d) === "catppuccin-mocha", "mode Dark ignores the OS turning light, got " + themeOf(d));
      fireClick(d.querySelector("#settingsThemeModeLight"), w);
      assert(themeOf(d) === "catppuccin-latte", "sanity: mode Light shows Latte");
      os.set(false);
      assert(themeOf(d) === "catppuccin-latte", "mode Light ignores the OS turning dark, got " + themeOf(d));

      // Back to System: the CURRENT OS preference applies immediately.
      fireClick(d.querySelector("#settingsThemeModeSystem"), w);
      assert(themeOf(d) === "catppuccin-mocha", "switching to System re-reads the OS (dark now), got " + themeOf(d));
      os.set(true);
      assert(themeOf(d) === "catppuccin-latte", "...and follows it again");
    }, themeApp(os));

    // A MediaQueryList with only the legacy addListener still works.
    const legacyOs = osStub(false, { legacy: true });
    await withApp(async (w, d, T) => {
      assert(legacyOs.listeners === 1, "the legacy addListener API is used when addEventListener is missing");
      legacyOs.set(true);
      assert(themeOf(d) === "catppuccin-latte", "a legacy MediaQueryList drives the switch too, got " + themeOf(d));
    }, themeApp(legacyOs));

    // No usable matchMedia: the OS preference is unknown -> dark, nothing throws.
    const os3 = osStub(true);
    await withApp(async (w, d, T) => {
      w.matchMedia = undefined;
      assert(w.osPrefersLight() === false && w.effectiveScheme() === "dark", "without matchMedia the effective scheme is dark");
      w.matchMedia = () => { throw new Error("boom"); };
      assert(w.osPrefersLight() === false, "a throwing matchMedia also reads as 'not light'");
      w.initTheme();
      assert(themeOf(d) === "catppuccin-mocha", "initTheme resolves to the dark slot, got " + themeOf(d));
    }, themeApp(os3));
  }

  section("341c. The segmented Theme control sets the mode, persists it and marks the active button");
  {
    const os = osStub(false);
    await withApp(async (w, d, T) => {
      fireClick(d.querySelector("#btnSettings"), w);
      const row = d.querySelector("#settingsThemeModeRow");
      assert(row.classList.contains("assert-mode-row") && row.classList.contains("settings-row-control"), "the control reuses the segmented .assert-mode-row look");
      assert([...row.querySelectorAll(".assert-mode-btn")].map(b => b.textContent).join("|") === "System|Light|Dark", "buttons read System / Light / Dark");
      assert(d.querySelector("#settingsSectionAppearance .settings-row-hint").textContent === "System follows your OS light/dark setting.",
        "the Theme row hint explains System");
      const subRows = [...d.querySelectorAll("#settingsSectionAppearance .settings-row-sub")];
      assert(subRows.length === 2 && subRows.map(r => r.querySelector(".settings-row-label").textContent).join("|") === "Light theme|Dark theme"
        && subRows.map(r => r.querySelector(".settings-row-hint").textContent).join("|") === "Used in light mode.|Used in dark mode.",
        "the two slot rows are indented sub-rows with the decided labels/hints");
      assert(subRows.every(r => w.getComputedStyle(r).paddingLeft === "34px") && w.getComputedStyle(row.closest(".settings-row")).paddingLeft === "18px",
        "sub-rows are indented (34px) relative to the Theme row (18px)");

      fireClick(d.querySelector("#settingsThemeModeLight"), w);
      assert(T.themeModeChoice === "light" && w.localStorage.getItem("philogg-theme-mode") === "light", "clicking Light sets and persists the mode");
      assert(JSON.stringify(activeModes(d)) === JSON.stringify(["light"]), "only Light is active, got " + JSON.stringify(activeModes(d)));
      assert(themeOf(d) === "catppuccin-latte", "Light shows the light slot even though the OS is dark, got " + themeOf(d));

      fireClick(d.querySelector("#settingsThemeModeDark"), w);
      assert(w.localStorage.getItem("philogg-theme-mode") === "dark" && JSON.stringify(activeModes(d)) === JSON.stringify(["dark"]), "Dark: persisted + active");
      assert(themeOf(d) === "catppuccin-mocha", "Dark shows the dark slot");

      os.set(true);
      fireClick(d.querySelector("#settingsThemeModeSystem"), w);
      assert(w.localStorage.getItem("philogg-theme-mode") === "system" && JSON.stringify(activeModes(d)) === JSON.stringify(["system"]), "System: persisted + active");
      assert(themeOf(d) === "catppuccin-latte", "System follows the (now light) OS");

      w.setThemeMode("nonsense");
      assert(T.themeModeChoice === "system" && w.localStorage.getItem("philogg-theme-mode") === "system", "an unknown mode is ignored");
    }, themeApp(os));
  }

  section("341d. The Light/Dark theme dropdowns: every theme, persisted per slot, applied only when that slot is on screen");
  {
    const os = osStub(false);
    await withApp(async (w, d, T) => {
      fireClick(d.querySelector("#btnSettings"), w);
      const names = id => [...d.querySelectorAll("#" + id + " optgroup[label='Built-in'] option")].map(o => o.textContent).join("|");
      const expected = "Catppuccin Latte|Catppuccin Frappé|Catppuccin Macchiato|Catppuccin Mocha|Classic Light|Classic Dark";
      assert(names("settingsThemeLightSelect") === expected && names("settingsThemeDarkSelect") === expected,
        "both dropdowns list all six built-ins, Catppuccin first then Classic, got " + names("settingsThemeLightSelect"));

      // OS dark: the Dark slot is on screen.
      pickSel(d, w, "settingsThemeLightSelect", "catppuccin-frappe");
      assert(w.localStorage.getItem("philogg-theme-light") === "catppuccin-frappe", "the Light slot is persisted");
      assert(themeOf(d) === "catppuccin-mocha", "changing the OFF-screen slot leaves data-theme alone, got " + themeOf(d));
      pickSel(d, w, "settingsThemeDarkSelect", "catppuccin-macchiato");
      assert(w.localStorage.getItem("philogg-theme-dark") === "catppuccin-macchiato" && themeOf(d) === "catppuccin-macchiato",
        "changing the ON-screen slot applies it, got " + themeOf(d));
      assert(w.localStorage.getItem("philogg-theme-mode") === null, "picking a slot theme never touches the mode");

      // The OS flips: the Light slot (Frappé) takes over, the selects keep their values.
      os.set(true);
      assert(themeOf(d) === "catppuccin-frappe", "the OS turning light shows the Light slot's theme, got " + themeOf(d));
      assert(selVal(d, "settingsThemeLightSelect") === "catppuccin-frappe" && selVal(d, "settingsThemeDarkSelect") === "catppuccin-macchiato",
        "both dropdowns keep showing their slot");
      pickSel(d, w, "settingsThemeDarkSelect", "light");
      assert(themeOf(d) === "catppuccin-frappe", "now the Dark slot is the off-screen one, got " + themeOf(d));
      os.set(false);
      assert(themeOf(d) === "light", "...and it applies once the OS turns dark (Classic Light in the dark slot), got " + themeOf(d));

      // A programmatic slot change refreshes the (hidden) UI too.
      w.setThemeSlot("light", "dark");
      assert(selVal(d, "settingsThemeLightSelect") === "dark", "setThemeSlot syncs the dropdown");
      w.setThemeSlot("light", "custom:unknown");
      assert(w.themeSlot("light") === "catppuccin-latte" && w.localStorage.getItem("philogg-theme-light") === "catppuccin-latte",
        "an unknown id falls back to the slot's default");
      w.setThemeSlot("sepia", "dark");
      assert(w.localStorage.getItem("philogg-theme-sepia") === null, "an unknown slot name is ignored");
    }, themeApp(os));
  }

  section("341e. setTheme(id) means 'show this theme now': it fills the slot of the effective scheme and never changes the mode");
  {
    const os = osStub(false);
    await withApp(async (w, d, T) => {
      w.setTheme("catppuccin-macchiato");
      assert(themeOf(d) === "catppuccin-macchiato", "the theme is applied, got " + themeOf(d));
      assert(w.localStorage.getItem("philogg-theme-dark") === "catppuccin-macchiato", "OS dark -> it went into the dark slot");
      assert(w.localStorage.getItem("philogg-theme-light") === null && w.themeSlot("light") === "catppuccin-latte", "the light slot is untouched");
      assert(T.themeModeChoice === "system" && w.localStorage.getItem("philogg-theme-mode") === null, "the mode is untouched");
      os.set(true);
      assert(themeOf(d) === "catppuccin-latte", "the light side still shows Latte after the OS flips");
      w.setTheme("catppuccin-frappe");
      assert(w.localStorage.getItem("philogg-theme-light") === "catppuccin-frappe" && themeOf(d) === "catppuccin-frappe", "OS light -> the light slot");
      assert(w.themeSlot("dark") === "catppuccin-macchiato", "...the dark slot keeps its pick");
      w.setTheme("does-not-exist");
      assert(themeOf(d) === "catppuccin-latte", "an unknown id resolves to the slot's default, got " + themeOf(d));
      // Mode Dark: the effective scheme is dark whatever the OS says.
      w.setThemeMode("dark");
      w.setTheme("dark");
      assert(w.localStorage.getItem("philogg-theme-dark") === "dark" && w.themeSlot("light") === "catppuccin-latte", "mode Dark -> setTheme fills the dark slot even though the OS is light");
      assert(themeOf(d) === "dark", "Classic Dark is on screen");
    }, themeApp(os));
  }

  section("341f. Custom themes: saving fills the effective slot; deleting one resets EVERY slot that holds it");
  {
    const os = osStub(false);
    await withApp(async (w, d, T) => {
      fireClick(d.querySelector("#btnSettings"), w);
      const a = addCustomTheme(w, d, T, "Slot A");
      assert(themeOf(d) === a.id && w.localStorage.getItem("philogg-theme-dark") === a.id, "the saved custom theme is active in the dark slot");
      assert(T.themeModeChoice === "system", "saving a custom theme does not change the mode");
      assert(w.getComputedStyle(d.documentElement).getPropertyValue("--bg-app").trim() === "#123456", "its colors are applied inline");
      ["settingsThemeLightSelect", "settingsThemeDarkSelect"].forEach(id => {
        assert([...d.querySelectorAll("#" + id + " optgroup[label='Custom'] option")].some(o => o.value === a.id && o.textContent === "Slot A"),
          "#" + id + " lists the custom theme under Custom");
      });
      assert(selVal(d, "settingsThemeDarkSelect") === a.id, "the dark dropdown shows it");

      // The same theme in the OFF-screen slot, too.
      pickSel(d, w, "settingsThemeLightSelect", a.id);
      assert(w.localStorage.getItem("philogg-theme-light") === a.id && themeOf(d) === a.id, "sanity: both slots hold it");
      d.querySelector("#customThemeList .filter-library-row-del").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
      assert(T.customThemes.length === 0, "the theme is deleted");
      assert(themeOf(d) === "catppuccin-mocha", "the on-screen slot falls back to its default, got " + themeOf(d));
      assert(w.localStorage.getItem("philogg-theme-dark") === "catppuccin-mocha" && w.localStorage.getItem("philogg-theme-light") === "catppuccin-latte",
        "BOTH slots are reset to their defaults (persisted)");
      assert(selVal(d, "settingsThemeLightSelect") === "catppuccin-latte" && selVal(d, "settingsThemeDarkSelect") === "catppuccin-mocha", "...and the dropdowns show them");
    }, themeApp(os));

    // A custom theme held only by the OFF-screen slot.
    const os2 = osStub(true);
    await withApp(async (w, d, T) => {
      fireClick(d.querySelector("#btnSettings"), w);
      const b = addCustomTheme(w, d, T, "Slot B"); // OS light -> lands in the light slot
      assert(w.localStorage.getItem("philogg-theme-light") === b.id && themeOf(d) === b.id, "sanity: it is in the light slot and on screen");
      os2.set(false);
      assert(themeOf(d) === "catppuccin-mocha", "the OS turned dark: the dark slot shows");
      assert(w.getComputedStyle(d.documentElement).getPropertyValue("--bg-app").trim() === "#1e1e2e", "...and no inline custom colors leak");
      d.querySelector("#customThemeList .filter-library-row-del").dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
      assert(w.localStorage.getItem("philogg-theme-light") === "catppuccin-latte" && selVal(d, "settingsThemeLightSelect") === "catppuccin-latte",
        "deleting a theme held only by the off-screen light slot resets that slot");
      assert(themeOf(d) === "catppuccin-mocha", "the on-screen theme is unaffected, got " + themeOf(d));
      os2.set(true);
      assert(themeOf(d) === "catppuccin-latte", "...and the light side now resolves to Latte, got " + themeOf(d));
    }, themeApp(os2));
  }

  section("341g. Boot from storage: persisted mode + slots, stale ids -> slot defaults, unknown mode -> System, the old key is ignored");
  {
    // A fresh stub per window: a previous window's os.set() must not leak into the next boot.
    await withApp(async (w, d, T) => {
      assert(T.themeModeChoice === "light", "a persisted mode is restored");
      assert(themeOf(d) === "catppuccin-macchiato", "mode Light + a persisted light slot shows that theme although the OS is dark, got " + themeOf(d));
      assert(JSON.stringify(activeModes(d)) === JSON.stringify(["light"]), "the Light button is active after boot");
      assert(selVal(d, "settingsThemeLightSelect") === "catppuccin-macchiato" && selVal(d, "settingsThemeDarkSelect") === "catppuccin-frappe", "the dropdowns show the persisted slots");
    }, themeApp(osStub(false), { "philogg-theme-mode": "light", "philogg-theme-light": "catppuccin-macchiato", "philogg-theme-dark": "catppuccin-frappe" }));

    const osStale = osStub(false);
    await withApp(async (w, d, T) => {
      assert(themeOf(d) === "catppuccin-mocha", "a stale dark slot id resolves to Mocha, got " + themeOf(d));
      assert(w.themeSlot("light") === "catppuccin-latte", "a stale light slot id resolves to Latte");
      assert(selVal(d, "settingsThemeLightSelect") === "catppuccin-latte" && selVal(d, "settingsThemeDarkSelect") === "catppuccin-mocha", "the dropdowns show the defaults");
      osStale.set(true);
      assert(themeOf(d) === "catppuccin-latte", "...and the light side resolves to Latte too, got " + themeOf(d));
    }, themeApp(osStale, { "philogg-theme-light": "custom:gone", "philogg-theme-dark": "custom:also-gone" }));

    await withApp(async (w, d, T) => {
      assert(T.themeModeChoice === "system", "an unknown persisted mode reads as system");
      assert(themeOf(d) === "catppuccin-mocha", "...so the OS (dark) decides, got " + themeOf(d));
    }, themeApp(osStub(false), { "philogg-theme-mode": "sepia" }));

    // The old single key is never read: no migration below 1.0.
    await withApp(async (w, d, T) => {
      assert(themeOf(d) === "catppuccin-mocha", "the old philogg-theme key (light) is ignored, got " + themeOf(d));
      assert(T.themeModeChoice === "system" && w.themeSlot("dark") === "catppuccin-mocha" && w.themeSlot("light") === "catppuccin-latte", "mode and slots are the defaults");
    }, themeApp(osStub(false), { "philogg-theme": "light" }));
  }

  section("341h. FOUC inline script resolves mode + slot the same way (before the app script runs)");
  {
    const fouc = PAGE_SCRIPT_MATCHES[0][1];
    assert(/philogg-theme-mode/.test(fouc) && !/getItem\("philogg-theme"\)/.test(fouc), "the FOUC script reads the mode key, not the old philogg-theme key");
    const run = ({ store = {}, light = false, noMatchMedia = false, throwingStorage = false } = {}) => {
      const attrs = {};
      const sandbox = {
        localStorage: { getItem: k => { if (throwingStorage) throw new Error("denied"); return k in store ? store[k] : null; } },
        document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
      };
      if (!noMatchMedia) sandbox.matchMedia = q => ({ matches: q === "(prefers-color-scheme: light)" && light });
      vm.runInNewContext(fouc, sandbox);
      return attrs["data-theme"];
    };
    assert(run() === "catppuccin-mocha", "empty storage, OS dark -> Mocha");
    assert(run({ light: true }) === "catppuccin-latte", "empty storage, OS light -> Latte");
    assert(run({ store: { "philogg-theme-mode": "light" } }) === "catppuccin-latte", "mode light beats a dark OS");
    assert(run({ store: { "philogg-theme-mode": "dark" }, light: true }) === "catppuccin-mocha", "mode dark beats a light OS");
    assert(run({ store: { "philogg-theme-mode": "system", "philogg-theme-light": "catppuccin-frappe" }, light: true }) === "catppuccin-frappe", "system + light OS -> the light slot's id");
    assert(run({ store: { "philogg-theme-dark": "catppuccin-macchiato" } }) === "catppuccin-macchiato", "system + dark OS -> the dark slot's id");
    assert(run({ store: { "philogg-theme-mode": "sepia", "philogg-theme-light": "dark" }, light: true }) === "dark", "an unknown mode reads as system");
    assert(run({ store: { "philogg-theme": "light" } }) === "catppuccin-mocha", "the old philogg-theme key is ignored");
    assert(run({ noMatchMedia: true }) === "catppuccin-mocha", "no matchMedia -> dark default");
    assert(run({ throwingStorage: true }) === "catppuccin-mocha", "unreadable storage -> dark default, no throw");
  }

  section("341i. Classic rename + order; the accent/syntax paths keep re-applying the SAME theme");
  {
    const os = osStub(false);
    await withApp(async (w, d, T) => {
      assert(T.BUILTIN_THEMES.map(t => t.name).join("|") === "Catppuccin Latte|Catppuccin Frappé|Catppuccin Macchiato|Catppuccin Mocha|Classic Light|Classic Dark",
        "built-in order: the four Catppuccin flavors, then Classic Light, Classic Dark");
      assert(T.BUILTIN_THEMES.find(t => t.name === "Classic Dark").id === "dark" && T.BUILTIN_THEMES.find(t => t.name === "Classic Light").id === "light",
        "the Classic themes keep their ids dark/light");
      assert(T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "dark").name === "Classic Dark" && T.BUILTIN_SYNTAX_SCHEMES.find(s => s.id === "light").name === "Classic Light",
        "the syntax schemes are renamed too");
      const syntaxNames = [...d.querySelectorAll("#settingsSyntaxSchemeSelect optgroup[label='Built-in'] option")].map(o => o.textContent);
      assert(syntaxNames.join("|") === "Catppuccin Latte|Catppuccin Frappé|Catppuccin Macchiato|Catppuccin Mocha|Classic Light|Classic Dark",
        "...and offered under the new names, in the same order as the theme dropdowns, got " + syntaxNames.join("|"));
      assert(T.BUILTIN_SYNTAX_SCHEMES.map(s => s.id).join() === T.BUILTIN_THEMES.map(t => t.id).join(), "BUILTIN_SYNTAX_SCHEMES follows BUILTIN_THEMES' order");

      // Slot themes other than the default must survive syntax/accent re-applies.
      w.setTheme("catppuccin-macchiato");
      w.setSyntaxScheme("catppuccin-latte");
      assert(themeOf(d) === "catppuccin-macchiato", "picking a syntax scheme does not re-resolve the theme, got " + themeOf(d));
      w.setSyntaxScheme("follow-theme");
      const swatch = [...d.querySelectorAll("#settingsAccentPicker .accent-swatch")].find(b => b.title === "#c6a0f6");
      assert(swatch && isVisible(d.querySelector("#settingsAccentRow"), w), "the Accent row acts on the active theme (Macchiato's palette)");
      fireClick(swatch, w);
      assert(themeOf(d) === "catppuccin-macchiato" && T.accentChoices["catppuccin-macchiato"] === "#c6a0f6", "picking an accent keeps the theme and records it for that theme");
      assert(w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#c6a0f6", "the accent is applied");
      os.set(true);
      assert(themeOf(d) === "catppuccin-latte" && w.getComputedStyle(d.documentElement).getPropertyValue("--accent").trim() === "#209fb5",
        "after the OS flips, Latte shows its own accent (the pick belongs to Macchiato)");
      assert(T.accentChoices["catppuccin-macchiato"] === "#c6a0f6", "...and Macchiato's pick is kept");
    }, themeApp(os));
  }
}
