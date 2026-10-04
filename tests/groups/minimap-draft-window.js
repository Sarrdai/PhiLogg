// GROUP minimap-draft-window — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP minimap-draft-window — a minimap drag leaves a DRAFT window
   Origin: 2026-10-04 (person-requested, time-window workflow step 4). The
   drag no longer creates a filter: it leaves a draft (highlighted range,
   label `from – to · duration · N entries`, two 22 px handles that move one
   bound each and swap when crossed, an action bar Zoom / Filter (Update
   filter on a time node) / Edit… / ×). The draft is stored as timestamps,
   survives re-renders and zooms, and is discarded by ×, Esc, a plain click
   (which still jumps) and a root-file switch. jsdom has no layout: the
   minimap is 800 px wide, the bar's width is stubbed where the clamp matters.
   ============================================================ */
group("minimap-draft-window");

const dwPointer = (w, type, pointerType, opts) => {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  Object.defineProperty(ev, "pointerId", { value: 5 });
  Object.defineProperty(ev, "isPrimary", { value: true });
  return ev;
};
const dwDrag = (w, svg, x1, x2, type = "mouse") => {
  svg.dispatchEvent(dwPointer(w, "pointerdown", type, { clientX: x1, clientY: 10 }));
  w.dispatchEvent(dwPointer(w, "pointermove", type, { clientX: (x1 + x2) / 2, clientY: 10 }));
  w.dispatchEvent(dwPointer(w, "pointermove", type, { clientX: x2, clientY: 10 }));
  w.dispatchEvent(dwPointer(w, "pointerup", type, { clientX: x2, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x2, clientY: 10 })); // the trailing click a browser fires
};
const dwHandleDrag = (w, d, side, xs, type = "mouse") => {
  const h = d.querySelector('.minimap-draft-handle[data-side="' + side + '"]');
  h.dispatchEvent(dwPointer(w, "pointerdown", type, { clientX: xs[0], clientY: 10 }));
  for (const x of xs.slice(1)) w.dispatchEvent(dwPointer(w, "pointermove", type, { clientX: x, clientY: 10 }));
  w.dispatchEvent(dwPointer(w, "pointerup", type, { clientX: xs[xs.length - 1], clientY: 10 }));
};
const dwSetup = async (w, T, n = 120) => {
  const f = await w.addFile("a.log", makeLog(0, n), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  return f;
};
const cssRuleText = (d, sel) => { const r = [...d.styleSheets].flatMap(s => [...s.cssRules]).find(x => x.selectorText === sel); return r ? r.style.cssText : ""; };
const dwKids = (f, T) => f.children.map(id => T.state.nodes[id]).filter(n => n.filterType === "timerange");

await withApp(async (w, d, T) => {
  section("minimap-draft-window a. A drag leaves a draft with label, handles and action bar");
  const f = await dwSetup(w, T);
  const svg = d.querySelector("#timelineMinimapSvg");
  const rect = d.querySelector("#timelineMinimapDragRect");
  const e = i => f.entries[i].ts;
  const span = e(119) - e(0);

  dwDrag(w, svg, 200, 600);
  const dr = T.minimapView.draft;
  assert(dr && dr.from === Math.round(e(0) + span * 0.25) && dr.to === Math.round(e(0) + span * 0.75), "draft holds the dragged timestamps, got " + JSON.stringify(dr));
  assert(f.children.length === 0, "no filter node was created by the drag");
  assert(rect.classList.contains("selected") && !rect.classList.contains("hidden") && Math.abs(parseFloat(rect.style.left) - 200) < 0.5 && Math.abs(parseFloat(rect.style.width) - 400) < 0.5, "highlight rect spans the draft, got " + rect.style.left + "/" + rect.style.width);
  const label = d.querySelector("#timelineMinimapDraftLabel");
  const expN = f.entries.filter(x => x.ts >= dr.from && x.ts <= dr.to).length;
  assert(label.textContent === "10:00:29.750 – 10:01:29.250 · 59.5s · " + expN + " entries", "label text, got " + label.textContent);
  assert(w.getComputedStyle(d.querySelector("#timelineMinimapMeta .minimap-draft-text")).display === "none" && w.getComputedStyle(label).display !== "none", "desktop: floating label stays, the meta draft text is hidden");
  const handles = [...d.querySelectorAll(".minimap-draft-handle")];
  assert(handles.length === 2 && handles.every(h => !h.classList.contains("hidden")) && Math.abs(parseFloat(handles[0].style.left) - 200) < 0.5 && Math.abs(parseFloat(handles[1].style.left) - 600) < 0.5, "two handles at the bounds, got " + handles.map(h => h.style.left));
  const bar = d.querySelector("#timelineMinimapDraftBar");
  assert(!bar.classList.contains("hidden"), "action bar visible");
  assert([...bar.querySelectorAll("button")].map(b => b.textContent).join("|") === "Zoom|Filter|Edit…|×" && bar.querySelector('[data-act="discard"]').getAttribute("aria-label") === "Discard", "bar buttons");

  const css = [];
  const walk = rules => { for (const r of rules) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) css.push(r); } };
  for (const sheet of d.styleSheets) walk(sheet.cssRules);
  const rule = sel => css.find(r => r.selectorText === sel);
  assert(/width:\s*22px/.test(rule(".minimap-draft-handle").style.cssText) && /ew-resize/.test(rule(".minimap-draft-handle").style.cssText) && /touch-action:\s*none/.test(rule(".minimap-draft-handle").style.cssText), "handle: 22 px hit area, ew-resize, touch-action none");
  assert(/touch-action:\s*pan-y/.test(rule("#timelineMinimapSvg").style.cssText), "the strip keeps touch-action: pan-y");
  assert(/z-index:\s*30/.test(rule(".minimap-draft-bar").style.cssText), "bar sits above the table");

  // Bar stays inside the viewport horizontally.
  Object.defineProperty(bar, "offsetWidth", { value: 200, configurable: true });
  dwDrag(w, svg, 700, 790);
  assert(parseFloat(bar.style.left) <= 800 - 200 - 4 + 0.01, "bar clamped on the right, left=" + bar.style.left);
  dwDrag(w, svg, 2, 30);
  assert(parseFloat(bar.style.left) >= 4 - 0.01, "bar clamped on the left, left=" + bar.style.left);
});

await withApp(async (w, d, T) => {
  section("minimap-draft-window b. Handles move one bound (mouse + touch); crossing swaps");
  const f = await dwSetup(w, T);
  const svg = d.querySelector("#timelineMinimapSvg");
  const e = i => f.entries[i].ts;
  const span = e(119) - e(0);
  const tsAt = x => Math.round(e(0) + span * x / 800);

  dwDrag(w, svg, 200, 600);
  const to0 = T.minimapView.draft.to;
  dwHandleDrag(w, d, "from", [200, 250, 300]);
  assert(T.minimapView.draft.from === tsAt(300) && T.minimapView.draft.to === to0, "mouse: left handle moves only the start");
  const from1 = T.minimapView.draft.from;
  dwHandleDrag(w, d, "to", [600, 700], "touch");
  assert(T.minimapView.draft.to === tsAt(700) && T.minimapView.draft.from === from1, "touch: right handle moves only the end");
  assert(d.querySelector("#timelineMinimapDraftLabel").textContent.includes(" entries"), "label follows");
  assert(f.children.length === 0, "handle drags create no filter");

  // Crossing: drag the left handle past the right one, then keep going back.
  dwHandleDrag(w, d, "from", [300, 500, 760, 720]);
  assert(T.minimapView.draft.from === tsAt(700) && T.minimapView.draft.to === tsAt(720), "crossing swaps the bounds and the handle keeps following the pointer: " + JSON.stringify(T.minimapView.draft));
});

await withApp(async (w, d, T) => {
  section("minimap-draft-window c. Zoom keeps the draft; Filter / Update filter / Edit / discard");
  const f = await dwSetup(w, T);
  const svg = d.querySelector("#timelineMinimapSvg");
  const bar = d.querySelector("#timelineMinimapDraftBar");
  const btn = act => bar.querySelector('[data-act="' + act + '"]');
  const e = i => f.entries[i].ts;

  dwDrag(w, svg, 200, 600);
  const dr = { ...T.minimapView.draft };
  btn("zoom").click();
  const pad = (dr.to - dr.from) * 0.1;
  assert(T.minimapView.trail.length === 1 && Math.abs(T.minimapView.tMin - (dr.from - pad)) <= 1 && Math.abs(T.minimapView.tMax - (dr.to + pad)) <= 1, "Zoom shows the draft +-10 %");
  assert(T.minimapView.draft && T.minimapView.draft.from === dr.from, "the draft stays after Zoom");
  const rect = d.querySelector("#timelineMinimapDragRect");
  assert(Math.abs(parseFloat(rect.style.left) - 800 * 0.1 / 1.2) < 1, "the highlight is repositioned inside the zoomed view, left=" + rect.style.left);

  btn("filter").click();
  let nodes = dwKids(f, T);
  assert(nodes.length === 1 && nodes[0].value.from === dr.from && nodes[0].value.to === dr.to && T.state.activeId === nodes[0].id, "Filter creates the node through applyTimeWindow and activates it");
  assert(T.minimapView.draft === null && bar.classList.contains("hidden") && rect.classList.contains("hidden"), "draft discarded after Filter");
  assert(T.minimapView.trail.length === 1, "the zoom stays");

  // Active node is a time node now: the button updates it.
  dwDrag(w, svg, 300, 500);
  assert(btn("filter").textContent === "Update filter", "label is Update filter on a timerange node, got " + btn("filter").textContent);
  const d2 = { ...T.minimapView.draft };
  btn("filter").click();
  nodes = dwKids(f, T);
  assert(nodes.length === 1 && nodes[0].value.from === d2.from && nodes[0].value.to === d2.to, "Update filter changes the existing node instead of nesting");

  // Edit… opens the dialog prefilled, draft gone.
  T.state.activeId = f.id; w.render();
  dwDrag(w, svg, 300, 500);
  const d3 = { ...T.minimapView.draft };
  btn("edit").click();
  assert(T.minimapView.draft === null, "draft discarded by Edit…");
  const dlg = d.querySelector("#timeRangeDialog");
  assert(dlg && (dlg.open || !dlg.classList.contains("hidden")), "Edit… opens the time-range dialog");
  assert(d.querySelector("#timeRangeFromInput").value === w.timeRangeBoundLabel(f.id, d3.from, true), "dialog prefilled with the draft start, got " + d.querySelector("#timeRangeFromInput").value);
  d.querySelector("#timeRangeDialogCancel") && d.querySelector("#timeRangeDialogCancel").click();

  // × and Esc.
  dwDrag(w, svg, 300, 500);
  btn("discard").click();
  assert(T.minimapView.draft === null && bar.classList.contains("hidden"), "x discards");
  dwDrag(w, svg, 300, 500);
  if (d.activeElement && d.activeElement.blur) d.activeElement.blur(); // the dialog's input may still hold focus
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(T.minimapView.draft === null && bar.classList.contains("hidden"), "Esc discards");
});

await withApp(async (w, d, T) => {
  section("minimap-draft-window d. Click discards and still jumps; re-render keeps it; root switch drops it; phone crumb line");
  const f = await dwSetup(w, T);
  const g = await w.addFile("b.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id; w.render();
  const svg = d.querySelector("#timelineMinimapSvg");
  const e = i => f.entries[i].ts;

  dwDrag(w, svg, 200, 600);
  const dr = { ...T.minimapView.draft };
  w.renderTimelineMinimap(f.id, f.entries);
  w.render();
  assert(T.minimapView.draft && T.minimapView.draft.from === dr.from, "draft survives re-renders");
  w.setMinimapView(e(10), e(100));
  assert(T.minimapView.draft && !d.querySelector("#timelineMinimapDraftBar").classList.contains("hidden"), "draft survives a zoom");
  w.minimapViewReset();
  w.innerWidth = 1000; w.dispatchEvent(new w.Event("resize"));
  assert(T.minimapView.draft && T.minimapView.draft.from === dr.from, "draft survives a resize");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));

  // A zoom that excludes the draft hides its overlay but keeps it.
  w.setMinimapView(e(100), e(119));
  assert(T.minimapView.draft && d.querySelector("#timelineMinimapDraftBar").classList.contains("hidden"), "a zoom window outside the draft hides the overlay, the draft stays");
  w.minimapViewReset();
  assert(!d.querySelector("#timelineMinimapDraftBar").classList.contains("hidden"), "...and it is back after resetting");

  T.state.selectedId = null;
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 400, clientY: 10 }));
  assert(T.minimapView.draft === null && T.state.selectedId != null, "a plain click discards the draft and still jumps");

  dwDrag(w, svg, 200, 600);
  assert(T.minimapView.draft, "sanity: new draft");
  T.state.activeId = g.id; w.render();
  assert(T.minimapView.draft === null && d.querySelector("#timelineMinimapDraftBar").classList.contains("hidden") && d.querySelector("#timelineMinimapDragRect").classList.contains("hidden"), "switching the root file discards the draft");

  // Phone: the 24 px crumb line shows while a draft exists.
  T.state.activeId = f.id;
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  w.render();
  const meta = () => w.getComputedStyle(d.querySelector("#timelineMinimapMeta"));
  assert(meta().display === "none", "phone: meta hidden at rest");
  dwDrag(w, svg, 200, 600);
  assert(meta().display === "flex" && meta().height === "24px", "phone: crumb line shows while a draft exists");
  const cssPhone = sel => w.getComputedStyle(d.querySelector(sel));
  assert(cssPhone("#timelineMinimapDraftLabel").display === "none", "phone: no floating label over the strip");
  const txt = d.querySelector("#timelineMinimapMeta .minimap-draft-text");
  assert(txt && cssPhone("#timelineMinimapMeta .minimap-draft-text").display === "block" && cssPhone("#timelineMinimapMeta .minimap-res").display === "none", "phone: the crumb line shows the draft text instead of the resolution hint");
  const dr4 = T.minimapView.draft;
  const expN4 = f.entries.filter(x => x.ts >= dr4.from && x.ts <= dr4.to).length;
  assert(txt.textContent === "10:00:29 – 10:01:29 · 59.5s · " + expN4 + " entries", "phone: draft text with seconds precision, got " + txt.textContent);
  assert(/overflow:\s*hidden/.test(cssRuleText(d, "body.layout-phone #timelineMinimap.has-draft .minimap-draft-text")) && /ellipsis/.test(cssRuleText(d, "body.layout-phone #timelineMinimap.has-draft .minimap-draft-text")), "phone: draft text ellipsizes");
  assert(/flex:\s*0 0 auto/.test(cssRuleText(d, "body.layout-phone .minimap-crumbs")), "phone: crumbs keep priority on the left");
  dwHandleDrag(w, d, "to", [600, 700]);
  assert(txt.textContent !== "10:00:29 – 10:01:29 · 59.5s · " + expN4 + " entries", "phone: draft text follows a handle drag");
  const btnRule = [...d.styleSheets].flatMap(s => [...s.cssRules]).find(r => r.selectorText === "body.layout-phone .minimap-draft-bar button");
  assert(btnRule && /min-height:\s*40px/.test(btnRule.style.cssText), "phone: touch-sized action buttons");
  d.querySelector('[data-act="discard"]').click();
  assert(meta().display === "none", "phone: crumb line gone with the draft");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
});
