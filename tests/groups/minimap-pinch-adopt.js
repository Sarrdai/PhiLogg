// GROUP minimap-pinch-adopt — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP minimap-pinch-adopt — pinch zoom on touch, and the active time node
   shown as an "adopted" draft window
   Origin: 2026-10-04 (person-requested, time-window workflow follow-up).
   (3A) Two touch pointers on the minimap strip zoom around their midpoint
   like the wheel (consecutive steps replace the top crumb, zooming out past
   the whole file resets); a second finger cancels a running draft drag /
   handle drag (previous draft restored) and lifting a finger leaves no
   draft, click or jump behind. (4A) While the active node is a time filter
   (timerange or legacy after/before) the minimap shows its window with
   handles but no action bar; an open bound has no handle there; moving a
   handle makes it a normal draft whose "Update filter" changes the node
   (undoable); x / Esc fall back to the adopted window; a node switch drops
   an unsaved moved draft and the adopted window follows the active node.
   Synthetic PointerEvents with distinct pointerIds stand in for fingers.
   ============================================================ */
group("minimap-pinch-adopt");

const paPtr = (w, type, pointerType, id, x, extra = {}) => {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 10, ...extra });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  Object.defineProperty(ev, "pointerId", { value: id });
  Object.defineProperty(ev, "isPrimary", { value: id === 1 });
  return ev;
};
const paSetup = async (w, T) => {
  const f = await w.addFile("a.log", makeLog(0, 120), () => {}); // 10:00:00 .. 10:01:59
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  return f;
};

await withApp(async (w, d, T) => {
  section("minimap-pinch-adopt a. Pinch zooms around the midpoint, replaces the crumb, resets past the whole file");
  const f = await paSetup(w, T);
  const svg = d.querySelector("#timelineMinimapSvg");
  const e = i => f.entries[i].ts;
  const span = e(119) - e(0);

  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 1, 300));
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 2, 500));
  assert(T.minimapView.trail.length === 0, "nothing zooms before the fingers move");
  const anchorBefore = w.minimapXToTs(500);
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 2, 700)); // distance 200 -> 400, midpoint 500
  const v = T.minimapView;
  assert(v.trail.length === 1 && Math.abs((v.tMax - v.tMin) - span * 0.5) <= 2, "spreading the fingers halves the window, span " + (v.tMax - v.tMin));
  assert(Math.abs(w.minimapXToTs(500) - anchorBefore) <= span / 800 + 1, "the time under the midpoint stays under it");
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 2, 800));
  assert(T.minimapView.trail.length === 1, "further pinch steps replace the top crumb");
  assert(d.querySelectorAll("#timelineMinimapMeta .minimap-crumb").length === 2, "one crumb besides Whole file");
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 2, 600)); // fingers together -> zoom out
  assert((T.minimapView.tMax - T.minimapView.tMin) > span * 0.5 * 0.6, "pinching in zooms out again");
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 2, 301));
  assert(T.minimapView.trail.length === 0, "zooming out past the whole file resets");
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 2, 301));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 1, 300));
  T.state.selectedId = null;
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 300, clientY: 10 }));
  assert(T.state.selectedId === null, "no jump after a pinch");
  assert(f.children.length === 0 && !T.minimapView.draft, "no filter and no draft after a pinch");

  // Minimum span.
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 1, 399));
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 2, 401));
  for (let i = 0; i < 40; i++) w.dispatchEvent(paPtr(w, "pointermove", "touch", 2, 401 + (i + 1) * 15));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 2, 900));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 1, 399));
  assert(T.minimapView.tMax - T.minimapView.tMin === 2000, "pinch zoom stops at the 2 s minimum, got " + (T.minimapView.tMax - T.minimapView.tMin));
  w.minimapViewReset();

  // Mouse pointers never pinch.
  svg.dispatchEvent(paPtr(w, "pointerdown", "mouse", 1, 300));
  svg.dispatchEvent(paPtr(w, "pointerdown", "mouse", 2, 500));
  w.dispatchEvent(paPtr(w, "pointermove", "mouse", 2, 700));
  w.dispatchEvent(paPtr(w, "pointerup", "mouse", 2, 700));
  w.dispatchEvent(paPtr(w, "pointerup", "mouse", 1, 300));
  assert(T.minimapView.trail.length === 0, "two mouse pointers do not pinch");
});

await withApp(async (w, d, T) => {
  section("minimap-pinch-adopt b. A second finger cancels a running draft drag / handle drag");
  const f = await paSetup(w, T);
  const svg = d.querySelector("#timelineMinimapSvg");
  const rect = d.querySelector("#timelineMinimapDragRect");

  // Draft drag in progress.
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 1, 200));
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 1, 400));
  assert(!rect.classList.contains("hidden"), "sanity: drag overlay is up");
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 2, 600));
  assert(rect.classList.contains("hidden"), "the second finger takes the drag overlay down");
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 1, 450));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 2, 600));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 1, 450));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 450, clientY: 10 }));
  assert(!T.minimapView.draft && f.children.length === 0 && T.state.selectedId == null, "no draft, filter or jump comes out of the cancelled drag");

  // Existing draft + new drag cancelled -> the previous draft comes back.
  svg.dispatchEvent(paPtr(w, "pointerdown", "mouse", 1, 200));
  w.dispatchEvent(paPtr(w, "pointermove", "mouse", 1, 600));
  w.dispatchEvent(paPtr(w, "pointerup", "mouse", 1, 600));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 600, clientY: 10 }));
  const prev = { ...T.minimapView.draft };
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 1, 100));
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 1, 150));
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 2, 300));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 2, 300));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 1, 150));
  assert(T.minimapView.draft && T.minimapView.draft.from === prev.from && T.minimapView.draft.to === prev.to, "the previous draft is back");
  assert(d.querySelector("#timelineMinimapDraftBar").classList.contains("hidden") === false, "...with its action bar");

  // Handle drag in progress.
  const handle = d.querySelector('.minimap-draft-handle[data-side="from"]');
  handle.dispatchEvent(paPtr(w, "pointerdown", "touch", 1, 200));
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 1, 260));
  assert(T.minimapView.draft.from !== prev.from, "sanity: the handle moved the start");
  svg.dispatchEvent(paPtr(w, "pointerdown", "touch", 2, 700));
  assert(T.minimapView.draft.from === prev.from && T.minimapView.draft.to === prev.to, "a second finger undoes the running handle move");
  w.dispatchEvent(paPtr(w, "pointermove", "touch", 1, 300));
  assert(T.minimapView.draft.from === prev.from, "the first finger no longer drags the handle");
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 2, 700));
  w.dispatchEvent(paPtr(w, "pointerup", "touch", 1, 300));
});

await withApp(async (w, d, T) => {
  section("minimap-pinch-adopt c. The active time node is shown as an adopted window (handles, no bar)");
  const f = await paSetup(w, T);
  const e = i => f.entries[i].ts;
  const span = e(119) - e(0);
  const rect = d.querySelector("#timelineMinimapDragRect");
  const bar = d.querySelector("#timelineMinimapDraftBar");
  const hd = side => d.querySelector('.minimap-draft-handle[data-side="' + side + '"]');
  const shown = el => !el.classList.contains("hidden");
  const px = ts => 800 * (ts - e(0)) / span;

  assert(!shown(hd("from")) && !shown(hd("to")) && !rect.classList.contains("selected"), "no node window while the file is active");
  const node = w.createFilterNode(f.id, "timerange", { from: e(20), to: e(60) });
  w.render();
  assert(T.state.activeId === node.id && rect.classList.contains("selected") && shown(rect), "activating a timerange node adopts its window");
  assert(shown(hd("from")) && shown(hd("to")) && !shown(bar), "both handles, no action bar");
  assert(Math.abs(parseFloat(rect.style.left) - px(e(20))) < 1 && Math.abs(parseFloat(rect.style.width) - (px(e(60)) - px(e(20)))) < 1, "rect sits on the node's bounds");
  assert(d.querySelector("#timelineMinimapDraftLabel").textContent.startsWith("10:00:20.000 – 10:01:00.000") && !T.minimapView.draft, "label shows the window, no user draft exists");

  // Plain click: jumps, the adopted window stays.
  const svg = d.querySelector("#timelineMinimapSvg");
  T.state.selectedId = null;
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 400, clientY: 10 }));
  assert(T.state.selectedId != null && shown(hd("from")), "click on the strip still jumps and the adopted window stays");

  // Open bounds.
  const nFrom = w.createFilterNode(f.id, "timerange", { from: e(20), to: null });
  w.render();
  assert(shown(hd("from")) && !shown(hd("to")) && Math.abs(parseFloat(rect.style.left) + parseFloat(rect.style.width) - 800) < 1, "from-only: one handle, the window runs to the file end");
  assert(d.querySelector("#timelineMinimapDraftLabel").textContent.startsWith("from 10:00:20"), "from-only label, got " + d.querySelector("#timelineMinimapDraftLabel").textContent);
  const nTo = w.createFilterNode(f.id, "timerange", { from: null, to: e(60) });
  w.render();
  assert(!shown(hd("from")) && shown(hd("to")) && parseFloat(rect.style.left) < 1, "until-only: one handle at the end, the window starts at the file start");
  const nLegacy = w.createFilterNode(f.id, "after", e(30));
  w.render();
  assert(shown(rect) && shown(hd("from")) && !shown(hd("to")) && !shown(bar), "a legacy after node is adopted too");

  // Phone crumb text for the adopted window.
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize")); w.render();
  assert(d.querySelector("#timelineMinimapMeta .minimap-draft-text").textContent.startsWith("from 10:00:30") && w.getComputedStyle(d.querySelector("#timelineMinimapMeta")).display === "flex", "phone: the crumb line shows the adopted window");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize")); w.render();

  // Node switch: follows / disappears.
  T.state.activeId = node.id; w.render();
  assert(Math.abs(parseFloat(rect.style.left) - px(e(20))) < 1 && Math.abs(parseFloat(rect.style.width) - (px(e(60)) - px(e(20)))) < 1, "switching to another time node moves the adopted window");
  T.state.activeId = f.id; w.render();
  assert(!shown(rect) && !shown(hd("from")), "switching to a non-time node removes it");
});

await withApp(async (w, d, T) => {
  section("minimap-pinch-adopt d. Moving an adopted handle makes a normal draft; Update filter, x, Esc, node switch");
  const f = await paSetup(w, T);
  const e = i => f.entries[i].ts;
  const span = e(119) - e(0);
  const tsAt = x => Math.round(e(0) + span * x / 800);
  const px = ts => 800 * (ts - e(0)) / span;
  const rect = d.querySelector("#timelineMinimapDragRect");
  const bar = d.querySelector("#timelineMinimapDraftBar");
  const btn = act => bar.querySelector('[data-act="' + act + '"]');
  const hd = side => d.querySelector('.minimap-draft-handle[data-side="' + side + '"]');
  const shown = el => !el.classList.contains("hidden");
  const move = (side, xs, type = "mouse") => {
    hd(side).dispatchEvent(paPtr(w, "pointerdown", type, 1, xs[0]));
    for (const x of xs.slice(1)) w.dispatchEvent(paPtr(w, "pointermove", type, 1, x));
    w.dispatchEvent(paPtr(w, "pointerup", type, 1, xs[xs.length - 1]));
  };
  const node = w.createFilterNode(f.id, "timerange", { from: e(20), to: e(60) });
  w.render();
  const origFrom = node.value.from, origTo = node.value.to;
  const x20 = px(e(20));

  move("from", [x20, x20 + 40, 300]);
  assert(T.minimapView.draft && T.minimapView.draft.from === tsAt(300) && T.minimapView.draft.to === origTo, "moving the handle creates a draft with the new start only");
  assert(shown(bar) && btn("filter").textContent === "Update filter", "the action bar appears, Filter reads Update filter");
  assert(node.value.from === origFrom, "the node is untouched until Update filter");

  // x returns to the adopted window of the node.
  btn("discard").click();
  assert(!T.minimapView.draft && !shown(bar) && shown(rect) && Math.abs(parseFloat(hd("from").style.left) - x20) < 1, "x falls back to the node's own window, not to nothing");
  // Esc likewise.
  move("to", [px(origTo), 650]);
  assert(T.minimapView.draft && shown(bar), "sanity: moved the end handle");
  if (d.activeElement && d.activeElement.blur) d.activeElement.blur();
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(!T.minimapView.draft && !shown(bar) && shown(rect), "Esc falls back to the adopted window");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(shown(rect) && T.state.activeId === node.id, "a further Esc leaves the adopted window alone");

  // A new drag elsewhere replaces it with a fresh draft; x goes back to the adopted window again.
  const svg = d.querySelector("#timelineMinimapSvg");
  svg.dispatchEvent(paPtr(w, "pointerdown", "mouse", 1, 500));
  w.dispatchEvent(paPtr(w, "pointermove", "mouse", 1, 700));
  w.dispatchEvent(paPtr(w, "pointerup", "mouse", 1, 700));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 700, clientY: 10 }));
  assert(T.minimapView.draft && T.minimapView.draft.from === tsAt(500) && shown(bar), "a new drag replaces the adopted window with a fresh draft");
  btn("discard").click();
  assert(!T.minimapView.draft && Math.abs(parseFloat(rect.style.left) - x20) < 1, "x on that draft brings the adopted window back");

  // Update filter: the node changes, undo restores, the adopted window shows the new bounds.
  move("from", [x20, 300]);
  const newFrom = T.minimapView.draft.from;
  const kids = f.children.length;
  btn("filter").click();
  assert(node.value.from === newFrom && node.value.to === origTo && f.children.length === kids, "Update filter changes the active node in place");
  assert(!T.minimapView.draft && !shown(bar) && Math.abs(parseFloat(hd("from").style.left) - px(newFrom)) < 1, "the adopted window now shows the new bounds");
  w.undo();
  assert(node.value.from === origFrom && Math.abs(parseFloat(hd("from").style.left) - x20) < 1, "undo restores the node and the adopted window");

  // Open bound: moving the only handle keeps the other side open.
  const open = w.createFilterNode(f.id, "timerange", { from: e(20), to: null });
  w.render();
  move("from", [x20, 200]);
  assert(T.minimapView.draft && T.minimapView.draft.to === null && T.minimapView.draft.from === tsAt(200), "open bound stays open while the handle moves");
  btn("filter").click();
  assert(open.value.from === tsAt(200) && open.value.to === null, "Update filter keeps the open bound");

  // Node switch drops an unsaved moved draft.
  move("from", [px(open.value.from), 100]);
  assert(T.minimapView.draft, "sanity: moved draft");
  T.state.activeId = node.id; w.render();
  assert(!T.minimapView.draft && !shown(bar) && Math.abs(parseFloat(rect.style.left) - x20) < 1, "an unsaved moved draft is discarded on node switch, the adopted window follows");
});
