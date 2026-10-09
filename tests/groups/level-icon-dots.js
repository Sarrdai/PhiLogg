// GROUP level-icon-dots — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP level-icon-dots — the level icon is three filled dots in the
   ERROR / WARN / INFO theme colors (backlog #38, variant A), replacing the
   three bars. Shared by the tree's level node, the "Add level filter"
   button (#btnApplyLevelToTree, a round button with the shared add badge, GROUP add-badge) and the
   library icon grid.
   Origin: 2026-10-06 (person-requested, concept-mockup decision).
   ============================================================ */
group("level-icon-dots");

await withApp(async (w, d, T) => {
  section("level-icon-dots a. The symbol is three filled circles in the three level tokens");
  const sym = d.querySelector("#iconSprite #i-level");
  assert(sym, "sprite has #i-level");
  assert(!sym.querySelector("path"), "no stroked bars left in the symbol");
  const circles = [...sym.querySelectorAll("circle")];
  assert(circles.length === 3, "three circles, got " + circles.length);
  assert(circles.map(c => c.getAttribute("fill")).join("|") === "var(--level-error)|var(--level-warn)|var(--level-info)",
    "fills are the ERROR, WARN, INFO tokens in that order, got " + circles.map(c => c.getAttribute("fill")).join("|"));
  assert(circles.every(c => c.getAttribute("stroke") === "none" && c.getAttribute("r") === "2.4"), "no stroke, r=2.4 on every dot");
  assert(circles.map(c => c.getAttribute("cx") + "," + c.getAttribute("cy")).join(" ") === "8,4 4,11.5 12,11.5", "dots sit at the agreed positions");
}, { toolbarLabels: "hover" });

await withApp(async (w, d, T) => {
  section("level-icon-dots b. #btnApplyLevelToTree: the icon plus exactly one + badge; tooltip unchanged");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();
  const btn = d.querySelector("#btnApplyLevelToTree");
  assert(btn.querySelector('svg.icon use[href="#i-level"]'), "button draws the level icon");
  assert(btn.querySelectorAll(".add-badge").length === 1, "exactly one badge");
  const badge = btn.querySelector(".add-badge");
  assert(badge.querySelector("svg path") && badge.querySelector("svg").getAttribute("viewBox") === "0 0 8 8", "badge holds the 8x8 plus glyph");
  assert(btn.classList.contains("row-action-btn") && w.getComputedStyle(btn).borderRadius === "50%", "button is a round row-action circle");
  const lbl = btn.querySelector(".row-action-label");
  assert(lbl && lbl.querySelector(".hint-name").textContent === "Add level filter" && w.getComputedStyle(lbl).position === "absolute", "floating label 'Add level filter' is absolutely positioned");
  assert(btn.title === "Add level filter", "tooltip stays 'Add level filter'");
  const bcs = w.getComputedStyle(badge);
  assert(bcs.position === "absolute" && bcs.width === "11px" && bcs.height === "11px" && bcs.right === "-3px" && bcs.bottom === "-3px",
    "badge is an 11px disc on the icon's bottom-right edge, got " + [bcs.position, bcs.width, bcs.height, bcs.right, bcs.bottom].join(" "));
  assert(isVisible(btn, w) && btn.disabled, "button stays in its slot, disabled, while nothing is selected");
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  assert(isVisible(btn, w) && !btn.disabled, "...and enabled once a chip is selected");
  // Re-render of the level bar must not duplicate the badge.
  fireClick(d.querySelector('#levelBar .level-btn[data-level="INFO"]'), w);
  assert(btn.querySelectorAll(".add-badge").length === 1 && btn.querySelectorAll("svg.icon").length === 1, "still one icon and one badge after more chip clicks");
}, { toolbarLabels: "hover" });

await withApp(async (w, d, T) => {
  section("level-icon-dots c. The tree's level node shows the dots icon without a badge");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();
  fireClick(d.querySelector('#levelBar .level-btn[data-level="ERROR"]'), w);
  fireClick(d.querySelector("#btnApplyLevelToTree"), w);
  const lvl = T.state.nodes[f.children[0]];
  assert(lvl && lvl.filterType === "level", "sanity: level node created");
  const row = d.querySelector('.tree-row[data-node-id="' + lvl.id + '"]');
  assert(row, "level node has a tree row");
  const icon = row.querySelector(".tree-icon");
  assert(icon.querySelector('svg.icon use[href="#i-level"]'), "tree row draws the level icon");
  assert(!row.querySelector(".add-badge"), "no badge on the tree node");
  // Colors come from tokens, not currentColor: an active row's accent tint must not reach the dots.
  assert(!/currentColor/i.test(d.querySelector("#i-level").innerHTML), "symbol never uses currentColor");
});

await withApp(async (w, d, T) => {
  section("level-icon-dots d. The library icon grid entry and the ghost icon use the same glyph");
  const lib = w.libraryIconSvg("level");
  assert(lib.includes("#i-level") && !lib.includes("level-add-badge"), "library 'level' icon is the shared level icon (no badge), got " + lib);
  assert(w.ghostIconFor("level").includes("#i-level"), "ghost level node uses it too");
});
