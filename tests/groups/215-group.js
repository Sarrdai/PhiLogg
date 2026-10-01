// GROUP 215 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(215);
await withApp(async (w, d, T) => {
  section("215. Toggle buttons (Notes/Multiline/Wrap/Columns/TextMatch/HighlightMatch/FilePaths/Pin): no button chrome, accent icon + status-bar LED");

  await w.addFile("a.log", makeLog(0, 5, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  w.render();

  const toggles = [...d.querySelectorAll(".icon-toggle")];
  assert(toggles.length === 16,
    "exactly 16 .icon-toggle instances (7 log-display toggles x2 toolbars + toggle-pin + #btnFacets), got " + toggles.length);
  toggles.forEach(t => assert(t.classList.contains("toolbar-icon-btn"), t.className + " still carries the base .toolbar-icon-btn class (28x28 footprint, flex-centering)"));

  // A plain (non-toggle) .toolbar-icon-btn in the same toolbar area must NOT get the class.
  const applyLevelBtn = d.querySelector("#btnApplyLevelToTree");
  assert(applyLevelBtn && applyLevelBtn.classList.contains("toolbar-icon-btn") && !applyLevelBtn.classList.contains("icon-toggle"),
    "a plain action button (#btnApplyLevelToTree) is untouched — .icon-toggle is scoped to genuine on/off toggles only");

  // --- CSS: no chrome at rest/active, accent-strong icon color when active, status-bar bar ---
  const css = d.querySelector("style").textContent;
  const ruleFor = sel => { const m = css.match(new RegExp(sel.replace(/[.:]/g, "\\$&") + "\\{[^}]*\\}")); return m && m[0]; };
  const base = ruleFor(".toolbar-icon-btn.icon-toggle");
  assert(base && base.includes("background:none") && base.includes("border:none"), ".icon-toggle has no background/border at rest, got " + base);
  const active = ruleFor(".toolbar-icon-btn.icon-toggle.active");
  assert(active && active.includes("color:var(--accent-strong)") && active.includes("background:none"),
    ".icon-toggle.active stays chrome-free but recolors the icon to --accent-strong, got " + active);
  const hover = ruleFor(".toolbar-icon-btn.icon-toggle:hover");
  assert(hover && !hover.includes("color"), ".icon-toggle:hover deliberately sets no color (avoids a hovered ACTIVE toggle losing its accent color), got " + hover);
  const barRest = css.match(/\.toolbar-icon-btn\.icon-toggle::after\{[^}]*\}/);
  assert(barRest && barRest[0].includes("background:transparent"), "the status-bar ::after is transparent at rest, got " + (barRest && barRest[0]));
  assert(css.includes(".toolbar-icon-btn.icon-toggle.active::after{background:var(--accent-strong);}"),
    "the status-bar ::after turns var(--accent-strong) once .active");

  // --- Functional: click still toggles .active (unchanged click wiring) ---
  const notesBtn = d.querySelector(".toggle-notes");
  const wasActive = notesBtn.classList.contains("active");
  fireClick(notesBtn, w);
  assert(notesBtn.classList.contains("active") !== wasActive, "clicking a toggle still flips its .active class");
  fireClick(notesBtn, w);
  assert(notesBtn.classList.contains("active") === wasActive, "sanity: toggled back, state left clean");
});
