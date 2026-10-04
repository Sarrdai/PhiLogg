// GROUP 221 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 221 — Sidebar toolbar visibility, the setupHitExpandGroups re-bind
   guard, and the AND/OR/Link removal from the tree context menu
   (FEATURE_BACKLOG.md #77)
   Origin: this session. setupHitExpandGroups() used to be called exactly
   once per container at boot by every existing caller (#viewBar/the per-
   view toolbars); the new sidebar toolbar rebuilds its whole button set on
   every render() and must call it again each time. Without an idempotency
   guard that would attach a SECOND, stacking mousemove/mouseleave listener
   onto the same container on every render. Group 221b is the regression
   guard for that leak; 221a covers the toolbar's own hasFiles-driven
   visibility; 221c proves AND/OR/Link actually stopped rendering in the
   tree's own bulk-action context menu (not just that the new toolbar has
   them — see GROUP 220f/c for that half).
   UPDATED, same-day later session (project-owner review): 221d unit-tests
   the new pure clampLabelOffset(rect, viewportWidth) function extracted for
   the edge-of-viewport floating-label clamp inside setupHitExpandGroups —
   the actual real-DOM measuring (getBoundingClientRect()/window.innerWidth)
   is deliberately NOT tested here, same "no layout engine under jsdom" gap
   as every other layout-dependent fix (see tests/README.md).
   ============================================================ */
group(221);

await withApp(async (w, d, T) => {
  section("221a. #sidebarToolbar visibility: hidden with zero files loaded, visible otherwise");
  assert(T.state.rootIds.length === 0, "sanity: nothing loaded yet");
  w.render();
  assert(isVisible(d.querySelector("#sidebarToolbar"), w) === false, "#sidebarToolbar is hidden with zero files loaded");
  await w.addFile("a.log", makeLog(0, 5), () => {});
  assert(isVisible(d.querySelector("#sidebarToolbar"), w) === true, "#sidebarToolbar becomes visible once a file is loaded");
});

await withApp(async (w, d, T) => {
  section("221b. setupHitExpandGroups: the idempotency guard prevents a stacking mousemove listener on a repeatedly-rebuilt container, and #viewBar's own hover-label mechanic still works");

  // Spy installed BEFORE the first file loads (and therefore before
  // #sidebarToolbar's very first bind), so the count below covers that
  // first real bind too, not just the later, expected-to-be-skipped ones.
  let mousemoveBinds = 0;
  const origAdd = w.EventTarget.prototype.addEventListener;
  w.EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (this.id === "sidebarToolbar" && type === "mousemove") mousemoveBinds++;
    return origAdd.call(this, type, ...rest);
  };

  // Loading a file's own render() already rebuilds #sidebarToolbar's button
  // set once (0 -> 1 files); a few explicit renders on top force several
  // more rebuilds without changing anything else about the selection.
  await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();
  w.render();
  w.render();
  assert(mousemoveBinds === 1, "a container whose button set is rebuilt on every render still gets exactly ONE mousemove listener, not one per render — got " + mousemoveBinds);

  w.EventTarget.prototype.addEventListener = origAdd;

  // #viewBar's own plain hover-label mechanic (bound once at boot, long
  // before this session's guard existed) must still work correctly.
  const viewBarGroup = d.querySelector('#viewBar [data-row-actions="viewbar"]');
  const firstHit = viewBarGroup.querySelector(".row-action-hit");
  const firstBtn = firstHit.closest(".row-action-btn");
  assert(!firstBtn.classList.contains("expanded"), "sanity: not expanded before any hover");
  viewBarGroup.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }));
  assert(firstBtn.classList.contains("expanded"), "#viewBar's own hover-expand still works after the guard was added");
  viewBarGroup.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));
  assert(!firstBtn.classList.contains("expanded"), "...and still collapses back on mouseleave");
});

await withApp(async (w, d, T) => {
  section("221c. openTreeContextMenu: AND/OR/Link removed from the 2+ multi-select bulk menu (moved exclusively to the sidebar toolbar); Merge unaffected");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  T.state.multiSelect = new Set([t1.id, t2.id]);
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, t1.id);
  const items = [...d.querySelectorAll("#treeContextMenu [data-action]")].map(n => n.dataset.action);
  assert(!items.includes("and") && !items.includes("or") && !items.includes("link"),
    "the 2+ filter bulk-action context menu no longer offers AND/OR/Link, got " + items.join(","));

  const fb = await w.addFile("b.log", makeLog(30, 5), () => {});
  T.state.multiSelect = new Set([f.id, fb.id]);
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, f.id);
  const items2 = [...d.querySelectorAll("#treeContextMenu [data-action]")].map(n => n.dataset.action);
  assert(items2.includes("merge"), "Merge stays offered for a 2+ file bulk selection — not part of the AND/OR/Link exclusion");

  // The toolbar's multi mode (GROUP 319) is the one place offering
  // AND/OR/Link for the same 2-filter selection.
  T.state.multiSelect = new Set([t1.id, t2.id]); T.state.activeId = t1.id;
  w.render();
  const barNames = [...d.querySelectorAll("#sidebarToolbar [data-multi-action]")].map(b => b.dataset.multiAction);
  assert(barNames.includes("and") && barNames.includes("or") && barNames.includes("link"),
    "the toolbar's multi mode is the sole place AND/OR/Link are offered for a 2+ filter selection");
});

await withApp(async (w, d, T) => {
  section("221d. clampLabelOffset(rect, viewportWidth): pure edge-clamp math for the floating .row-action-label");
  const VW = 400; // a narrow-ish viewport, close to #sidebarToolbar's own real-world column width

  // Fits comfortably within the viewport -> no correction needed.
  assert(w.clampLabelOffset({ left: 100, right: 200 }, VW) === 0, "a label fully inside the viewport gets a 0 shift");

  // Sits exactly at the margin boundary -> still 0 (not overflowing).
  assert(w.clampLabelOffset({ left: 8, right: 200 }, VW) === 0, "a label sitting exactly at the left margin needs no shift");
  assert(w.clampLabelOffset({ left: 200, right: VW - 8 }, VW) === 0, "a label sitting exactly at the right margin needs no shift");

  // Overflowing the LEFT edge (e.g. a button near #sidebarToolbar's own left
  // edge) -> positive shift (move right) that lands the label's left edge
  // exactly on the 8px margin.
  const leftShift = w.clampLabelOffset({ left: -20, right: 80 }, VW);
  assert(leftShift === 28, "a label overflowing the left edge by 20px shifts right by exactly enough to sit at the 8px margin (28px), got " + leftShift);

  // Overflowing the RIGHT edge (any toolbar's rightmost button) -> negative
  // shift (move left) that lands the label's right edge exactly on the 8px
  // margin from the right.
  const rightShift = w.clampLabelOffset({ left: 350, right: 430 }, VW);
  assert(rightShift === -38, "a label overflowing the right edge by 30px (past VW-8=392) shifts left by exactly enough to sit at the margin (-38px), got " + rightShift);

  // A label wider than the viewport itself overflows both sides at once —
  // the function still returns a single well-defined shift (left-edge rule
  // wins since it's checked first), rather than throwing or returning NaN.
  const bothShift = w.clampLabelOffset({ left: -50, right: 500 }, VW);
  assert(Number.isFinite(bothShift) && bothShift === 58, "a label wider than the viewport still gets a finite, well-defined shift (left-edge rule), got " + bothShift);
});
