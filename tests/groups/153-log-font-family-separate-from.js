// GROUP 153 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 153 — Log font family, separate from UI font (person-requested,
   this session): a second curated-stack picker, same mechanism as GROUP
   111f/113's UI font, but drives its OWN --font-log custom property
   (log/text content only) instead of --font-ui (UI chrome).
   Follow-up in the same session, person-reported: the Log font picker
   originally drove --font-mono directly, which is ALSO the property a
   bunch of unrelated UI chrome uses for its own monospace look (e.g.
   .level-btn, the level-quick-filter pills) — so changing Log font
   visibly reformatted UI elements that have nothing to do with log
   content, and which one "won" looked order-dependent since both pickers
   wrote to the same property. Introduced a dedicated --font-log var, used
   ONLY by the exact selectors --log-text-scale already scopes to (table
   rows, extraction table, entry detail message, link-pair rows — see
   PROJECT.md); --font-mono reverted to fixed/non-configurable, still
   covering the UI chrome's own monospace bits. Since the two properties
   are now independent, setting order genuinely cannot matter — covered
   below.
   ============================================================ */
group(153);
await withApp(async (w, d, T) => {
  section("153a. Settings: Log font family (system stacks only, no web fonts)");

  const select = d.querySelector("#settingsLogFontSelect");
  assert(select, "the Log font select exists in Settings -> Appearance");
  assert(select.options.length >= 2, "offers a curated list of more than one font option");
  assert(select.value === "default", "defaults to the system-default monospace stack");
  assert(w.document.documentElement.style.getPropertyValue("--font-log").includes("SF Mono"),
    "default option reproduces the original --font-log stack (no visual change until touched)");
  [...select.options].forEach(opt => {
    assert(!/http|@font-face|url\(/i.test(opt.value), "font option \"" + opt.value + "\" fetches nothing external");
  });

  select.value = "courier";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.document.documentElement.style.getPropertyValue("--font-log").includes("Courier New"), "selecting \"Courier New\" applies its stack via --font-log");
  assert(w.localStorage.getItem("philogg-log-font") === "courier", "selection persists to localStorage");

  // Choosing --font-ui does not touch the UI font's own selection/setting.
  const uiSelect = d.querySelector("#settingsUiFontSelect");
  const uiValueBefore = uiSelect.value;
  const uiVarBefore = w.document.documentElement.style.getPropertyValue("--font-ui");
  select.value = "ui";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.document.documentElement.style.getPropertyValue("--font-log") === "var(--font-ui)", "\"Same as UI font\" points --font-log at --font-ui");
  assert(uiSelect.value === uiValueBefore && w.document.documentElement.style.getPropertyValue("--font-ui") === uiVarBefore,
    "the UI font selection/value is untouched by changing the Log font");

  select.value = "default";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
});

await withApp(async (w, d, T) => {
  section("153b. window.philogg.listSystemFonts (desktop build): extra fonts appended to the Log font select too, independent of the UI font select");

  const uiSelect = d.querySelector("#settingsUiFontSelect");
  const logSelect = d.querySelector("#settingsLogFontSelect");

  await w.philogg.listSystemFonts().then(() => Promise.resolve());
  await new Promise(r => setTimeout(r, 0));

  const uiGroup = uiSelect.querySelector("optgroup");
  const logGroup = logSelect.querySelector("optgroup");
  assert(uiGroup && logGroup, "a system-fonts optgroup is appended to both selects once listSystemFonts resolves");

  const firaOption = [...logSelect.options].find(o => o.textContent === "Fira Code");
  assert(firaOption, "\"Fira Code\" (reported by the stub) is offered on the Log font select");
  assert(firaOption.value === "sys:Fira Code", "its option value carries the sys: prefix + exact reported name");

  logSelect.value = firaOption.value;
  logSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.document.documentElement.style.getPropertyValue("--font-log").startsWith('"Fira Code",'),
    "selecting a system font sets --font-log to the quoted name plus the default monospace fallback stack");
  assert(w.localStorage.getItem("philogg-log-font") === "sys:Fira Code", "the sys:-prefixed id persists to localStorage under its own key");
  assert(uiSelect.value !== "sys:Fira Code", "the UI font select's own value is untouched");
}, { philogg: { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve(["Fira Code", "Iosevka", "Arial"]) } });

await withApp(async (w, d, T) => {
  section("153c. Log font is scoped to actual log content only — UI chrome's own monospace bits (e.g. .level-btn) are untouched");

  const cs = w.getComputedStyle(w.document.documentElement);
  const fontMonoBefore = cs.getPropertyValue("--font-mono");

  const logSelect = d.querySelector("#settingsLogFontSelect");
  logSelect.value = "courier";
  logSelect.dispatchEvent(new w.Event("change", { bubbles: true }));

  assert(w.document.documentElement.style.getPropertyValue("--font-mono") === "", "--font-mono is never touched by the Log font setting (no inline override set)");
  assert(cs.getPropertyValue("--font-mono") === fontMonoBefore, "--font-mono's actual value is unchanged, so UI chrome styled off it (e.g. .level-btn) keeps its own look");

  // .col-msg (an actual log-row cell) uses --font-log; .level-btn (UI
  // chrome styled with a monospace look, unrelated to log content) uses
  // the untouched --font-mono — the two must resolve to different stacks
  // once Log font diverges from the default.
  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  w.render();
  const msgCell = d.querySelector(".col-msg");
  const levelBtn = d.querySelector(".level-btn");
  assert(msgCell && levelBtn, "sanity: both a log-row message cell and a level-quick-filter button are on screen");
  assert(w.getComputedStyle(msgCell).fontFamily !== w.getComputedStyle(levelBtn).fontFamily,
    "a log-row cell (--font-log, now Courier New) and a level-filter button (--font-mono, untouched) resolve to different font stacks");

  logSelect.value = "default";
  logSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
});

await withApp(async (w, d, T) => {
  section("153d. Setting order does not matter: UI font then Log font, or Log font then UI font, land on the same end state");

  const uiSelect = d.querySelector("#settingsUiFontSelect");
  const logSelect = d.querySelector("#settingsLogFontSelect");
  const root = w.document.documentElement;

  // Order A: UI font first, then Log font.
  uiSelect.value = "georgia";
  uiSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  logSelect.value = "menlo";
  logSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  const fontUiA = root.style.getPropertyValue("--font-ui");
  const fontLogA = root.style.getPropertyValue("--font-log");

  // Reset, then Order B: Log font first, then UI font — same two choices.
  uiSelect.value = "default"; uiSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  logSelect.value = "default"; logSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  logSelect.value = "menlo";
  logSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  uiSelect.value = "georgia";
  uiSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  const fontUiB = root.style.getPropertyValue("--font-ui");
  const fontLogB = root.style.getPropertyValue("--font-log");

  assert(fontUiA === fontUiB && fontLogA === fontLogB,
    "the resulting --font-ui/--font-log values are identical regardless of which select was changed first");

  uiSelect.value = "default"; uiSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  logSelect.value = "default"; logSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
});
