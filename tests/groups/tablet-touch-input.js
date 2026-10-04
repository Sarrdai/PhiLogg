// GROUP tablet-touch-input — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP tablet-touch-input — touch input plumbing (tablet UX round, step 1)
   Origin: 2026-10-03 (tablet usability test). The log minimap drag and the
   entry-detail splitter run on pointer events (mouse, touch, pen alike);
   a touch long-press on the minimap opens the time-range dialog; the
   "Add to selection ›" submenu ignores the mouseenter a tap synthesizes and
   never covers its anchor; floating toolbar labels are shifted via
   --label-dx to stay inside the screen; the tree delete x gets a 44px hit
   area on touch. jsdom has no layout: placement/clamp math is pure, CSS is
   asserted on the rule text.
   ============================================================ */
group("tablet-touch-input");

const ttPointer = (w, type, pointerType, opts) => {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  Object.defineProperty(ev, "pointerId", { value: 7 });
  Object.defineProperty(ev, "isPrimary", { value: true });
  return ev;
};
const ttSetWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const ttCssRules = d => {
  const out = [];
  const walk = rules => { for (const r of rules) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) out.push(r); } };
  for (const sheet of d.styleSheets) walk(sheet.cssRules);
  return out;
};

await withApp(async (w, d, T) => {
  section("tablet-touch-input a. Minimap drag works for mouse AND touch pointers; cancel aborts");
  const lines = [];
  for (let i = 0; i < 20; i++) lines.push(`2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"entry ${i}"`);
  const f = await w.addFile("range.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const svg = d.querySelector("#timelineMinimapSvg");
  const x1 = w.minimapTsToX(f.entries[5].ts), x2 = w.minimapTsToX(f.entries[14].ts);
  const rangeNodes = () => f.children.map(id => T.state.nodes[id]).filter(n => n.filterType === "timerange");
  const dragRect = d.querySelector("#timelineMinimapDragRect");

  for (const type of ["mouse", "touch"]) {
    const before = rangeNodes().length;
    svg.dispatchEvent(ttPointer(w, "pointerdown", type, { clientX: x1, clientY: 10 }));
    w.dispatchEvent(ttPointer(w, "pointermove", type, { clientX: (x1 + x2) / 2, clientY: 10 }));
    assert(!dragRect.classList.contains("hidden"), type + ": drag overlay shows once past the threshold");
    w.dispatchEvent(ttPointer(w, "pointerup", type, { clientX: x2, clientY: 10 }));
    svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x2, clientY: 10 }));
    assert(rangeNodes().length === before && T.minimapView.draft, type + ": the drag leaves a draft window, no filter yet");
    d.querySelector('#timelineMinimapDraftBar [data-act="filter"]').click();
    assert(rangeNodes().length === before + 1, type + ": Filter on the draft creates exactly one time-range filter");
    assert(dragRect.classList.contains("hidden"), type + ": overlay hides once the draft is filtered");
    T.state.activeId = f.id;
  }

  const before = rangeNodes().length;
  svg.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientX: x1, clientY: 10 }));
  w.dispatchEvent(ttPointer(w, "pointermove", "touch", { clientX: x2, clientY: 10 }));
  w.dispatchEvent(ttPointer(w, "pointercancel", "touch", { clientX: x2, clientY: 10 }));
  assert(dragRect.classList.contains("hidden"), "pointercancel (browser took a vertical pan) hides the overlay");
  w.dispatchEvent(ttPointer(w, "pointerup", "touch", { clientX: x2, clientY: 10 }));
  assert(rangeNodes().length === before, "...and creates no filter, not even from a stray pointerup");

  // A touch jitter below the (larger) touch threshold is still a tap, not a drag.
  svg.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientX: x1, clientY: 10 }));
  w.dispatchEvent(ttPointer(w, "pointermove", "touch", { clientX: x1 + 5, clientY: 10 }));
  assert(dragRect.classList.contains("hidden"), "5px of touch jitter does not start a drag");
  w.dispatchEvent(ttPointer(w, "pointerup", "touch", { clientX: x1 + 5, clientY: 10 }));

  const rules = ttCssRules(d);
  assert(rules.some(r => r.selectorText === "#timelineMinimapSvg" && /touch-action:\s*pan-y/.test(r.style.cssText)), "the minimap svg has touch-action:pan-y");
  assert(rules.some(r => r.selectorText === "#detailResizer" && /touch-action:\s*none/.test(r.style.cssText)), "#detailResizer has touch-action:none");
});

await withApp(async (w, d, T) => {
  section("tablet-touch-input b. Minimap long-press (touch) opens the time-range dialog once");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const svg = d.querySelector("#timelineMinimapSvg");
  const timers = [];
  let nextId = 1;
  w.setTimeout = (fn, ms) => { const t = { id: nextId++, fn, ms, cleared: false }; timers.push(t); return t.id; };
  w.clearTimeout = id => { const t = timers.find(x => x.id === id); if (t) t.cleared = true; };
  const opened = [];
  const origOpen = w.openTimeRangeDialog;
  w.openTimeRangeDialog = (...a) => { opened.push(a); };
  const x = w.minimapTsToX(f.entries[8].ts);
  const live = () => timers.filter(t => t.ms === 500 && !t.cleared);

  svg.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientX: x, clientY: 10 }));
  assert(live().length === 1, "a touch press arms a 500ms timer");
  live()[0].fn();
  assert(opened.length === 1 && opened[0][0] === "create" && opened[0][1] === f.id && opened[0][2].from === opened[0][2].to,
    "long-press opens the dialog in create mode with a zero-width range at the pressed point");
  // The browser's own contextmenu for the same press must not open it a second time.
  svg.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: 10 }));
  assert(opened.length === 1, "a following contextmenu for the same press does not open it twice");
  w.dispatchEvent(ttPointer(w, "pointerup", "touch", { clientX: x, clientY: 10 }));
  const kids = f.children.length;
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x, clientY: 10 }));
  assert(f.children.length === kids && opened.length === 1, "a trailing click after the long-press is a no-op (no jump, no filter)");

  // contextmenu arriving BEFORE our timer (Android): opens once, timer is gone.
  timers.length = 0; opened.length = 0;
  svg.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientX: x, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: 10 }));
  assert(opened.length === 1 && live().length === 0, "a browser contextmenu mid-press opens it once and disarms the timer");
  w.dispatchEvent(ttPointer(w, "pointerup", "touch", { clientX: x, clientY: 10 }));

  // Finger moves before 500ms: no long-press.
  timers.length = 0; opened.length = 0;
  svg.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientX: x, clientY: 10 }));
  w.dispatchEvent(ttPointer(w, "pointermove", "touch", { clientX: x + 30, clientY: 10 }));
  assert(live().length === 0, "moving the finger past the slop cancels the long-press timer");
  w.dispatchEvent(ttPointer(w, "pointercancel", "touch", { clientX: x + 30, clientY: 10 }));
  assert(opened.length === 0, "...and nothing opens");

  // Release before 500ms: timer cleared.
  timers.length = 0;
  svg.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientX: x, clientY: 10 }));
  w.dispatchEvent(ttPointer(w, "pointerup", "touch", { clientX: x, clientY: 10 }));
  assert(live().length === 0, "releasing early clears the timer");

  // Mouse: no timer; right-click (contextmenu) still opens.
  timers.length = 0; opened.length = 0;
  svg.dispatchEvent(ttPointer(w, "pointerdown", "mouse", { clientX: x, clientY: 10 }));
  assert(live().length === 0, "a mouse press arms no long-press timer");
  w.dispatchEvent(ttPointer(w, "pointerup", "mouse", { clientX: x, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: 10 }));
  assert(opened.length === 1, "mouse right-click still opens the dialog");

  // Withheld during a column sort.
  opened.length = 0; timers.length = 0;
  T.state.sortColumn = "message";
  w.render();
  svg.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientX: x, clientY: 10 }));
  assert(live().length === 0, "no long-press timer while the minimap is withheld by a column sort");
  w.openTimeRangeDialog = origOpen;
});

await withApp(async (w, d, T) => {
  section("tablet-touch-input c. Entry-detail splitter drags with pointer events (touch too), CSS hit area");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  const resizer = d.querySelector("#detailResizer"), panel = d.querySelector("#detailPanel");
  for (const type of ["mouse", "touch"]) {
    resizer.dispatchEvent(ttPointer(w, "pointerdown", type, { clientY: 500 }));
    const startH = panel.getBoundingClientRect().height;
    assert(resizer.classList.contains("dragging"), type + ": pointerdown starts the drag");
    w.dispatchEvent(ttPointer(w, "pointermove", type, { clientY: 450 }));
    const grownH = panel.style.height;
    assert(grownH === Math.max(80, Math.min(Math.max(150, w.innerHeight - 260), startH + 50)) + "px", type + ": dragging up by 50px resizes the panel from its start height, got " + grownH);
    w.dispatchEvent(ttPointer(w, "pointerup", type, { clientY: 450 }));
    assert(!resizer.classList.contains("dragging"), type + ": pointerup ends the drag");
    w.dispatchEvent(ttPointer(w, "pointermove", type, { clientY: 300 }));
    assert(panel.style.height === grownH, type + ": moves after the release are ignored");
  }
  panel.style.height = "200px";
  resizer.dispatchEvent(ttPointer(w, "pointerdown", "touch", { clientY: 500 }));
  w.dispatchEvent(ttPointer(w, "pointercancel", "touch", { clientY: 500 }));
  assert(!resizer.classList.contains("dragging"), "pointercancel ends the drag");
  resizer.dispatchEvent(ttPointer(w, "pointerdown", "mouse", { clientY: 500, button: 2 }));
  assert(!resizer.classList.contains("dragging"), "a right-button press does not start a drag");

  const rules = ttCssRules(d);
  assert(rules.some(r => r.selectorText === "body.layout-compact #detailResizer::before" && /height:\s*44px/.test(r.style.cssText)),
    "compact tier: #detailResizer gets a 44px tall invisible hit area");
});

await withApp(async (w, d, T) => {
  section("tablet-touch-input d. \"Add to selection ›\": touch opens on tap only, never covers its anchor");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[2]);
  const anchor = d.querySelector("#ctxAddToSelection"), sub = d.querySelector("#addToSelectionMenu");

  anchor.dispatchEvent(ttPointer(w, "pointerdown", "touch", {}));
  anchor.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(sub.classList.contains("hidden"), "touch: the mouseenter a tap synthesizes does not open the submenu");
  anchor.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert(!sub.classList.contains("hidden"), "touch: the tap's click opens it");
  sub.classList.add("hidden");

  anchor.dispatchEvent(ttPointer(w, "pointerenter", "mouse", {}));
  anchor.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: false }));
  assert(!sub.classList.contains("hidden"), "mouse: hovering still opens it");

  const P = w.placeSubmenuBesideAnchor;
  const anchorRect = { left: 400, right: 660, top: 300, bottom: 330 };
  let p = P(anchorRect, 260, 100, 1024, 768);
  assert(p.left === 660 && p.top === 300, "room on the right: placed right of the anchor");
  p = P({ left: 700, right: 1000, top: 300, bottom: 330 }, 260, 100, 1024, 768);
  assert(p.left === 440 && p.top === 300, "no room on the right: placed left of the anchor, got " + JSON.stringify(p));
  p = P({ left: 100, right: 300, top: 300, bottom: 330 }, 260, 100, 380, 768);
  assert(p.top === 330 && p.left >= 4 && p.left + 260 <= 376, "no room on either side: placed below the anchor, got " + JSON.stringify(p));
  p = P({ left: 100, right: 300, top: 700, bottom: 730 }, 260, 100, 380, 768);
  assert(p.top === 600, "no room below either: placed above the anchor, got " + JSON.stringify(p));
  p = P(anchorRect, 260, 100, 1024, 320);
  assert(p.top + 100 <= 316 && p.left === 660, "vertically clamped into the viewport");
});

await withApp(async (w, d, T) => {
  section("tablet-touch-input e. Floating labels stay inside the screen (--label-dx), 8px margin");
  assert(w.clampLabelOffset({ left: 4, right: 100 }, 400) === 4 && w.clampLabelOffset({ left: 8, right: 392 }, 400) === 0,
    "the screen-edge margin is 8px");
  const rules = ttCssRules(d);
  const usesVar = sel => rules.some(r => r.selectorText.includes(sel) && /--label-dx/.test(r.style.cssText));
  assert(usesVar(".row-action-label") && usesVar(".tb-label"), "both label kinds add var(--label-dx) to their centering transform");

  const group = d.querySelector('#viewBar [data-row-actions="viewbar"]');
  const hit = group.querySelector(".row-action-hit");
  const btn = hit.closest(".row-action-btn");
  const label = btn.querySelector(".row-action-label");
  const def = (el, name, val) => Object.defineProperty(el, name, { configurable: true, value: val });
  // Fake layout: a 100px wide label under a button whose centre sits at x=20 (label would start at -30).
  def(label, "offsetWidth", 100);
  def(btn, "getBoundingClientRect", () => ({ left: 10, right: 30, top: 0, bottom: 20, width: 20, height: 20 }));
  def(hit, "getBoundingClientRect", () => ({ left: 10, right: 30, top: 0, bottom: 20, width: 20, height: 20 }));
  group.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 15, clientY: 10 }));
  assert(btn.classList.contains("expanded"), "sanity: hovered button expanded");
  const dx1 = label.style.getPropertyValue("--label-dx");
  assert(dx1 === "38px", "label shifted right so its left edge sits at 8px, got " + JSON.stringify(dx1));
  group.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 16, clientY: 10 }));
  assert(label.style.getPropertyValue("--label-dx") === "38px", "re-measuring on the next move is idempotent");
  group.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));
  assert(label.style.getPropertyValue("--label-dx") === "", "the offset is cleared when the label collapses");
});

await withApp(async (w, d, T) => {
  section("tablet-touch-input f. Tree delete x: 44px hit area on touch rows that show it");
  const rules = ttCssRules(d);
  const find = (sel, re) => rules.some(r => r.selectorText.split(",").map(s => s.trim()).includes(sel) && re.test(r.style.cssText));
  assert(find("body.layout-compact .tree-row.active .tree-del", /width:\s*44px/) && find("body.layout-compact .tree-row.active .tree-del", /height:\s*44px/),
    "active tree row: the x itself is 44x44 in compact");
  assert(find("body.layout-compact .tree-row:not(.active):hover .tree-del::before", /inset:\s*-12px/),
    "a hovered (non-active) tree row's x gets a 44px ::before hit area");
  assert(find("body.layout-compact .folder-watch-file .tree-del::before", /inset:\s*-12px/) && find("body.layout-compact .folder-watch-file .tree-del", /opacity:\s*1/),
    "opened folder-watch/ZIP entry rows show their x with the same hit area");
  assert(find("body.layout-phone .tree-del", /display:\s*none/), "phone still hides it (unchanged)");
});
