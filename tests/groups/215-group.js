// GROUP 215 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(215);
await withApp(async (w, d, T) => {
  section("215. Toggle buttons (Notes/Multiline/Wrap/Columns/TextMatch/HighlightMatch/FilePaths/Pin): ghost button, accent-soft fill when active");

  await w.addFile("a.log", makeLog(0, 5, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  w.render();

  const toggles = [...d.querySelectorAll(".icon-toggle")];
  assert(toggles.length === 16,
    "exactly 16 .icon-toggle instances (7 log-display toggles x2 toolbars + toggle-pin + the Filtered toolbar's Collapse repeats), got " + toggles.length);
  toggles.forEach(t => assert(t.classList.contains("toolbar-icon-btn"), t.className + " still carries the base .toolbar-icon-btn class (28x28 footprint, flex-centering)"));

  // A plain (non-toggle) .toolbar-icon-btn in the same toolbar area must NOT get the class.
  const applyLevelBtn = d.querySelector("#btnApplyLevelToTree");
  assert(applyLevelBtn && applyLevelBtn.classList.contains("toolbar-icon-btn") && !applyLevelBtn.classList.contains("icon-toggle"),
    "a plain action button (#btnApplyLevelToTree) is untouched — .icon-toggle is scoped to genuine on/off toggles only");

  // --- CSS: no chrome at rest/active, accent-strong icon color when active, status-bar bar ---
  const css = d.querySelector("style").textContent;
  const ruleFor = sel => { const m = css.match(new RegExp(sel.replace(/[.:]/g, "\\$&") + "\\{[^}]*\\}")); return m && m[0]; };
  // P4 (design polish): ghost look, accent-soft fill when active, no status-bar LED any more.
  assert(!/\.icon-toggle(\.active)?::after/.test(css), "no status-bar ::after rule remains");
  const active = css.match(/\.toolbar-icon-btn\.active, \.toolbar-icon-btn\.active:hover\{[^}]*\}/);
  assert(active && active[0].includes("var(--accent-soft)") && active[0].includes("color:var(--accent-strong)"),
    "an active toggle is accent-soft with an accent-strong icon, got " + (active && active[0]));

  // --- Functional: click still toggles .active (unchanged click wiring) ---
  const notesBtn = d.querySelector(".toggle-notes");
  const wasActive = notesBtn.classList.contains("active");
  fireClick(notesBtn, w);
  assert(notesBtn.classList.contains("active") !== wasActive, "clicking a toggle still flips its .active class");
  fireClick(notesBtn, w);
  assert(notesBtn.classList.contains("active") === wasActive, "sanity: toggled back, state left clean");
});
