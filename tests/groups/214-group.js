// GROUP 214 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

group(214);
await withApp(async (w, d, T) => {
  section("214. Level-bar redesign: circular ring/fill buttons matching the filter-creation buttons, name+count moved into the hover label");
  // Pinned to "explicit" mode so a click toggles state.levelFilter directly
  // (default "auto" mode instead edits a tree node — see Group 94) — same
  // pin Group 52 uses for the same reason.

  const f = await w.addFile("a.log", makeLog(0, 8, { levels: ["ERROR", "ERROR", "WARN", "INFO", "INFO", "INFO", "DEBUG", "DEBUG"] }), () => {});
  T.state.activeId = f.id;
  w.render();

  const errBtn = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(errBtn !== null, "sanity: the ERROR level button exists");

  // --- Shape: reuses .row-action-btn (circle + hover-hit + hover-label), NOT .toolbar-icon-btn ---
  assert(errBtn.classList.contains("row-action-btn"), "level buttons carry .row-action-btn (same circle/hover-label mechanism as Before/After/Time range/...)");
  assert(!errBtn.classList.contains("toolbar-icon-btn"), "level buttons deliberately do NOT carry .toolbar-icon-btn (would fight the always-solid .level-btn.lvl-* background on a specificity tie)");
  assert(errBtn.querySelector(".row-action-hit") !== null, "has the fixed-size .row-action-hit span");
  assert(errBtn.querySelector(".dot") === null && errBtn.querySelector(".cnt") === null,
    "no more .dot/.cnt children — the button's own ring/fill IS the content now");

  // --- Name+count moved into the hover label, matching the button's title ---
  const label = errBtn.querySelector(".row-action-label");
  assert(label !== null, "has a .row-action-label span");
  assert(label.textContent === "ERROR 2", "label reads \"{LEVEL} {count}\", got \"" + label.textContent + "\"");
  assert(errBtn.title === label.textContent, "title (accessible name) matches the hover label exactly, since the button itself has no visible text");

  // --- Unchecked = full-strength colored ring; checked = solid fill (person-requested follow-up) ---
  const css = d.querySelector("style").textContent;
  const ruleFor = sel => { const m = css.match(new RegExp(sel.replace(/[.:#()]/g, "\\$&") + "\\{[^}]*\\}")); return m && m[0]; };
  assert((ruleFor(".level-btn.lvl-error") || "").includes("box-shadow:inset 0 0 0 2px var(--level-error)"),
    ".level-btn.lvl-error sets the ring color regardless of .active, got " + ruleFor(".level-btn.lvl-error"));
  assert(!/\.level-btn\.lvl-error\{[^}]*background/.test(css),
    "unchecked .level-btn.lvl-error has no background set (transparent ring, not a dimmed fill)");
  assert((ruleFor(".level-btn.active.lvl-error") || "").includes("background:var(--level-error)"),
    ".level-btn.active.lvl-error fills the ring's own color solid once checked, got " + ruleFor(".level-btn.active.lvl-error"));
  assert((ruleFor(".level-btn") || "").includes("border:0"),
    ".level-btn has no border (ring is an inset box-shadow, see GROUP clean-circle-rings)");

  // --- Hover label picks up the level's own color instead of the neutral default (regardless of checked state) ---
  assert((ruleFor(".level-btn.lvl-error .row-action-label") || "").includes("background:var(--level-error)"),
    "the ERROR button's own .row-action-label is colored like the button, not the neutral --bg-elevated-2 default");

  assert(!errBtn.classList.contains("active"), "sanity: ERROR starts unchecked");

  // --- #levelBar drives the label reveal via plain :hover (same fix as #libraryPresetBar — the
  //     JS setupHitExpandGroups binding runs once at boot against a container that's still empty then) ---
  assert(css.includes('#levelBar .level-btn:hover:not(:disabled) .row-action-label{opacity:1'),
    "#levelBar's own :hover rule reveals the label (setupHitExpandGroups would never reach a dynamically-rebuilt container)");

  // --- Layout: #levelBar now sits BEFORE the filter-creation group (reversing the earlier right-side placement) ---
  const viewBarKids = [...d.querySelector("#viewBar").children].map(c => c.id || c.dataset.rowActions);
  assert(viewBarKids.indexOf("levelBar") < viewBarKids.indexOf("viewbar"),
    "#levelBar precedes [data-row-actions=\"viewbar\"] in DOM order, got " + viewBarKids.join(","));

  // --- Click-to-toggle behavior is unchanged: still flips state.levelFilter + re-renders with .active flipped ---
  const wasInFilter = T.state.levelFilter.has("ERROR");
  const wasActive = errBtn.classList.contains("active");
  fireClick(errBtn, w);
  assert(T.state.levelFilter.has("ERROR") !== wasInFilter, "clicking flips ERROR's membership in state.levelFilter");
  const errBtnAfter = d.querySelector('.level-btn[data-level="ERROR"]');
  assert(errBtnAfter.classList.contains("active") !== wasActive, "…and the re-rendered button's .active flips accordingly");
  fireClick(errBtnAfter, w);
  assert(T.state.levelFilter.has("ERROR") === wasInFilter, "sanity: toggled back, state.levelFilter left clean");
  assert(d.querySelector('.level-btn[data-level="ERROR"]').classList.contains("active") === wasActive, "sanity: .active toggled back too");
});
