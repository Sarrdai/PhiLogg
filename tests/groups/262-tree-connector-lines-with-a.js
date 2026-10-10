// GROUP 262 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 262 — Tree connector lines with a highlighted active path
   (person-requested, 2026-09-23, screenshot): the breadcrumb bar was
   removed outright and the active filter chain is drawn in the tree
   itself instead — decorateTreeGuides() adds .tree-guide segments (rails
   at each parent's chevron x, an elbow into every child row, a stem below
   an expanded parent) and marks the ones on the root -> active path .on.
   ============================================================ */
group(262);
await withApp(async (w, d, T) => {
  section("262. Tree connector lines highlight the path to the active node");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const A = w.createFilterNode(f.id, "text", "message");
  const A1 = w.createFilterNode(A.id, "text", "1");
  const A2 = w.createFilterNode(A.id, "text", "2");
  const B = w.createFilterNode(f.id, "text", "3");
  const rowOf = n => d.querySelector('#tree .tree-row[data-node-id="' + n.id + '"]');
  const guides = n => [...rowOf(n).querySelectorAll(":scope > .tree-guide")];
  const on = n => guides(n).filter(g => g.classList.contains("on"));
  const at = (n, x) => guides(n).filter(g => g.style.left === x + "px" || g.style.left === (x - 1) + "px");

  assert(d.querySelector("#breadcrumbBar") === null && d.querySelector("#breadcrumb") === null, "the breadcrumb bar is removed");

  // Geometry (design polish B4): TREE_INDENT_STEP 18, chevron center 7 =>
  // the root's rail runs at x=15, A's children's rail at x=33.
  T.state.activeId = A1.id;
  w.render();
  assert(guides(f).length === 1 && on(f).length === 1, "the root row gets one stem, highlighted since the active node is below it");
  assert(guides(f).concat(guides(A), guides(A1), guides(A2), guides(B)).every(g => !g.classList.contains("h")), "no horizontal stubs are drawn");
  assert(on(A).length === 2, "A (on the path) highlights its upper link half and its own stem, got " + on(A).length);
  assert(at(A, 15).some(g => g.style.top === "50%" && !g.classList.contains("on")), "A's lower link half toward sibling B stays unhighlighted (the path turns into A)");
  assert(on(A1).length === 1 && at(A1, 33).filter(g => g.classList.contains("on")).length === 1, "the active row highlights its upper link half at its parent's x (33px = 8 + TREE_INDENT_STEP + TREE_CHEVRON_CENTER)");
  assert(at(A1, 15).length === 1 && !at(A1, 15)[0].classList.contains("on"), "A1 carries the root's pass-through rail (A has a later sibling), not highlighted");
  assert(on(A2).length === 0 && on(B).length === 0, "rows off the path get no highlighted segment");
  assert(at(A2, 33).length === 1, "the last child gets only an upper half (no line continues below it)");
  assert(w.getComputedStyle(guides(f)[0]).pointerEvents === "none", "guides never intercept clicks on the row");
  // Lines are integer-width borders (pixel snapping of fractional filled
  // boxes made them uneven, person-reported): 1px, the accent path 1.5px.
  const vCs = w.getComputedStyle(at(A2, 33)[0]);
  assert(vCs.borderLeftWidth === "1px", "vertical guides are a 1px left border, got " + vCs.borderLeftWidth);
  const onCs = w.getComputedStyle(on(A1)[0]);
  assert(/^1(\.5)?px$/.test(onCs.borderLeftWidth), "the accent path line is 1.5px (snapped), got " + onCs.borderLeftWidth);
  // a base height:0 on .tree-guide once beat the top:0/bottom:0 stretch,
  // collapsing every rail, stem and lower half.
  const rail = at(A1, 15)[0];
  assert(rail.style.bottom === "0px" && w.getComputedStyle(rail).height !== "0px",
    "a full-span rail has no fixed height, so top:0/bottom:0 can stretch it, got " + w.getComputedStyle(rail).height);
  T.state.multiSelect = new Set([A1.id, A2.id]);
  w.render();
  assert(rowOf(A1).classList.contains("multi-selected") && ["", "none"].includes(w.getComputedStyle(rowOf(A1)).boxShadow),
    "the active row carries no multi-select outline, got " + w.getComputedStyle(rowOf(A1)).boxShadow);
  assert(["", "none"].includes(w.getComputedStyle(rowOf(A2)).boxShadow) && w.getComputedStyle(rowOf(A2)).backgroundColor === w.getComputedStyle(rowOf(A1)).backgroundColor,
    "other selected rows look like the active one: no outline, same background (GROUP 345)");
  T.state.multiSelect = new Set([A1.id]);

  // Follow-up 3 (person-requested): the ancestors' names (file + parent
  // filters) take the path accent too; the active row and off-path rows don't.
  assert(rowOf(f).classList.contains("on-path") && rowOf(A).classList.contains("on-path"), "the file and parent filter rows are marked on-path");
  assert(!rowOf(A1).classList.contains("on-path") && !rowOf(A2).classList.contains("on-path") && !rowOf(B).classList.contains("on-path"),
    "neither the active row itself nor off-path rows are marked");
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(/\.tree-row\.on-path \.tree-label \*\{color:var\(--accent\) !important;\}/.test(css) && css.includes(".tree-row.on-path .tree-label,"),
    "on-path labels (and a level node's inline-colored words inside them) use the accent color");

  // Path through a later sibling: the root rail passes A's subtree highlighted.
  T.state.activeId = B.id;
  w.render();
  assert(at(A1, 15).every(g => g.classList.contains("on")) && at(A2, 15).every(g => g.classList.contains("on")),
    "with B active, the root rail running past A's children is highlighted");
  assert(on(A).length === 2, "A's vertical passes through highlighted but its stem is not");
  assert(on(B).length === 1, "B highlights its upper half");

  // A collapsed parent draws no stem and its children no guides at all.
  A.collapsed = true;
  w.render();
  assert(rowOf(A1) === null && guides(A).length === 2, "collapsed A: no children rendered, A has no stem (top and bottom link halves only)");

  // The whole tree is redrawn per render, so no guide ever doubles up.
  A.collapsed = false;
  w.render(); w.render();
  assert(guides(A1).length === 3, "re-rendering doesn't accumulate guides (rail + upper/lower half), got " + guides(A1).length);
});
