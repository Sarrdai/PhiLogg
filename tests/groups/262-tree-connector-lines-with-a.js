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
  // Elbows start 1px left of their rail (square corner), so match both.
  const at = (n, x) => guides(n).filter(g => g.style.left === x + "px" || g.style.left === (x - 1) + "px");

  assert(d.querySelector("#breadcrumbBar") === null && d.querySelector("#breadcrumb") === null, "the breadcrumb bar is removed");

  T.state.activeId = A1.id;
  w.render();
  assert(guides(f).length === 1 && on(f).length === 1, "the root row gets one stem, highlighted since the active node is below it");
  assert(on(A).length === 3 && on(A).some(g => g.classList.contains("h")), "A (on the path) highlights its upper link half, its elbow and its own stem, got " + on(A).length);
  assert(at(A, 13).some(g => g.style.top === "50%" && !g.classList.contains("on")), "A's lower link half toward sibling B stays unhighlighted (the path turns into A)");
  assert(on(A1).length === 2 && at(A1, 23).filter(g => g.classList.contains("on")).length === 2, "the active row itself highlights its upper link half and its elbow at its parent's x (23px = 8 + TREE_INDENT_STEP + TREE_CHEVRON_CENTER)");
  assert(at(A1, 13).length === 1 && !at(A1, 13)[0].classList.contains("on"), "A1 carries the root's pass-through rail (A has a later sibling), not highlighted");
  assert(on(A2).length === 0 && on(B).length === 0, "rows off the path get no highlighted segment");
  assert(at(A2, 23).length === 2, "the last child gets only an upper half + elbow (no line continues below it)");
  assert(w.getComputedStyle(guides(f)[0]).pointerEvents === "none", "guides never intercept clicks on the row");
  // Follow-up (person-reported): 1.5px filled boxes rendered at uneven
  // thickness (pixel snapping of a fractional width) — lines are integer
  // 2px borders now; and the multi-select outline no longer frames the
  // active row, where it cut across the lines.
  const vCs = w.getComputedStyle(at(A1, 23).find(g => g.classList.contains("v")));
  const hCs = w.getComputedStyle(at(A1, 23).find(g => g.classList.contains("h")));
  assert(vCs.borderLeftWidth === "2px", "vertical guides are a 2px left border, got " + vCs.borderLeftWidth);
  assert(hCs.borderTopWidth === "2px", "elbows are a 2px top border, got " + hCs.borderTopWidth);
  // Follow-up 2 (person-reported): a base height:0 on .tree-guide beat the
  // top:0/bottom:0 stretch, collapsing every rail, stem and lower half.
  const rail = at(A1, 13)[0];
  assert(rail.style.bottom === "0px" && w.getComputedStyle(rail).height !== "0px",
    "a full-span rail has no fixed height, so top:0/bottom:0 can stretch it, got " + w.getComputedStyle(rail).height);
  assert(w.getComputedStyle(at(A1, 23).find(g => g.classList.contains("h"))).height === "0px", "elbows are still zero-height (just their border)");
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
  assert(at(A1, 13).every(g => g.classList.contains("on")) && at(A2, 13).every(g => g.classList.contains("on")),
    "with B active, the root rail running past A's children is highlighted");
  assert(on(A).length === 2 && !on(A).some(g => g.classList.contains("h")), "A's vertical passes through highlighted but its elbow and stem are not");
  assert(on(B).length === 2, "B highlights its upper half and elbow");

  // A collapsed parent draws no stem and its children no guides at all.
  A.collapsed = true;
  w.render();
  assert(rowOf(A1) === null && guides(A).length === 3, "collapsed A: no children rendered, A has no stem (top, bottom, elbow only)");

  // The whole tree is redrawn per render, so no guide ever doubles up.
  A.collapsed = false;
  w.render(); w.render();
  assert(guides(A1).length === 4, "re-rendering doesn't accumulate guides (rail + upper/lower half + elbow), got " + guides(A1).length);
});
