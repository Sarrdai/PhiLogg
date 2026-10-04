// GROUP minimap-zoom — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP minimap-zoom — the timeline minimap zooms into a time window
   Origin: 2026-10-04 (person-requested, time-window workflow step 3). The
   minimap can show a time window instead of the whole root file: hook
   setMinimapView(from, to) / minimapViewReset() / minimapViewGoTo(depth),
   breadcrumbs + resolution hint in #timelineMinimapMeta, wheel zoom around
   the cursor (0.8 in / 1.25 out, resets past the whole file, min span 2 s),
   reset on a root-file switch. Everything built on minimapTsToX/XToTs
   (click-to-jump, drag-select, bars in both binning modes) works inside the
   zoomed view. The phone minimap is 36 px tall (was 14). jsdom has no
   layout: the stubbed minimap is 800 px wide, phone CSS is read through
   getComputedStyle.
   ============================================================ */
group("minimap-zoom");

const mzPointer = (w, type, opts) => {
  const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts });
  Object.defineProperty(ev, "pointerType", { value: "mouse" });
  Object.defineProperty(ev, "pointerId", { value: 3 });
  Object.defineProperty(ev, "isPrimary", { value: true });
  return ev;
};
const mzWheel = (w, target, deltaY, clientX) => {
  const ev = new w.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, clientX, clientY: 10 });
  target.dispatchEvent(ev);
  return ev;
};
const mzSum = a => a.reduce((x, y) => x + y, 0);

await withApp(async (w, d, T) => {
  section("minimap-zoom a. Hook zoom changes the drawn range and the x/ts mapping; crumbs lead back");
  const f = await w.addFile("a.log", makeLog(0, 120), () => {}); // 10:00:00 .. 10:01:59, one entry per second
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const e = i => f.entries[i].ts;
  const meta = d.querySelector("#timelineMinimapMeta");
  const mini = d.querySelector("#timelineMinimap");
  const crumbs = () => [...meta.querySelectorAll(".minimap-crumb")];

  assert(T.minimapView.tMin === e(0) && T.minimapView.tMax === e(119) && T.minimapView.trail.length === 0, "starts on the whole file");
  assert(crumbs().length === 0 && !mini.classList.contains("zoomed"), "no crumbs, no zoomed class while whole");
  assert(Math.abs(w.minimapTsToX(e(60)) - 800 * 60 / 119) < 0.01, "whole-file mapping: entry 60 at 60/119 of the width");
  const bgBefore = mzSum(T.minimapBars.bg);
  assert(bgBefore === 120, "whole-file background bars count all 120 entries, got " + bgBefore);

  assert(w.setMinimapView(e(20), e(60)) === true, "setMinimapView returns true when the view changed");
  assert(T.minimapView.tMin === e(20) && T.minimapView.tMax === e(60), "drawn range is the window");
  assert(w.minimapTsToX(e(20)) === 0 && Math.abs(w.minimapTsToX(e(60)) - 800) < 0.01 && Math.abs(w.minimapTsToX(e(40)) - 400) < 0.01, "ts -> x maps the window onto the full width");
  assert(Math.abs(w.minimapXToTs(0) - e(20)) < 1 && Math.abs(w.minimapXToTs(800) - e(60)) < 1 && Math.abs(w.minimapXToTs(200) - e(30)) < 1, "x -> ts is the inverse inside the window");
  assert(mzSum(T.minimapBars.bg) === 41, "background bars count only the 41 entries inside the window, got " + mzSum(T.minimapBars.bg));
  assert(mzSum(T.minimapBars.ov) === 41, "overlay bars count the view entries inside the window, got " + mzSum(T.minimapBars.ov));
  assert(mini.classList.contains("zoomed"), "zoomed class set");
  assert(crumbs().map(b => b.textContent).join("|") === "Whole file|10:00:20–10:01:00", "crumbs: " + crumbs().map(b => b.textContent).join("|"));
  assert(!crumbs()[0].disabled && crumbs()[1].disabled, "the last crumb is the current view and disabled");
  assert(/^\d+(\.\d+)? (ms|s)\/px$/.test(meta.querySelector(".minimap-res").textContent), "resolution hint, got " + meta.querySelector(".minimap-res").textContent);
  assert(meta.querySelector(".minimap-res").textContent === "50 ms/px", "40 s over 800 px = 50 ms/px, got " + meta.querySelector(".minimap-res").textContent);
  assert(meta.textContent.includes("Start") && meta.textContent.includes("Duration"), "file facts stay in the meta line");

  // A nested zoom adds a crumb; clicking a crumb goes back to it.
  w.setMinimapView(e(30), e(50));
  assert(crumbs().length === 3 && T.minimapView.trail.length === 2, "second zoom adds a crumb");
  crumbs()[1].click();
  assert(T.minimapView.trail.length === 1 && T.minimapView.tMin === e(20), "clicking the middle crumb goes back one level");
  assert(w.setMinimapView(e(20), e(60)) === false, "re-zooming into the identical view is a no-op");

  // Range rects: the filtered result lies inside the window -> shown; a view outside hides them.
  const full = () => d.querySelector("#minimapFullRangeRect");
  assert(!full().classList.contains("hidden"), "full-range rect visible inside the zoomed view");
  const flt = w.createFilterNode(f.id, "text", "message 100"); // entries 100 only: outside the window
  w.render();
  assert(T.minimapView.trail.length === 1 && full().classList.contains("hidden"), "a result outside the zoomed window hides the range rect");
  T.state.activeId = f.id; w.render();

  crumbs()[0].click();
  assert(T.minimapView.trail.length === 0 && T.minimapView.tMin === e(0) && T.minimapView.tMax === e(119), "clicking \"Whole file\" resets");
  assert(crumbs().length === 0 && !mini.classList.contains("zoomed"), "crumbs gone after reset");
  assert(mzSum(T.minimapBars.bg) === 120, "bars cover the whole file again");

  // Edge cases.
  assert(w.setMinimapView(e(40), e(40) + 500) === true && T.minimapView.tMax - T.minimapView.tMin === 2000, "a window below 2 s is widened to the 2 s minimum");
  w.minimapViewReset();
  assert(w.setMinimapView(e(0) - 5000, e(119) + 5000) === false && T.minimapView.trail.length === 0, "a window covering the whole file is not a zoom");
  assert(w.setMinimapView(e(100), e(119) + 20000) === true && T.minimapView.tMax === e(119) && T.minimapView.tMin === e(80), "a window past the end is shifted back inside the file");
  w.minimapViewReset();
});

await withApp(async (w, d, T) => {
  section("minimap-zoom b. Wheel zooms around the cursor and never scrolls the page");
  const f = await w.addFile("a.log", makeLog(0, 120), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const e = i => f.entries[i].ts;
  const svg = d.querySelector("#timelineMinimapSvg");
  const fileSpan = e(119) - e(0);

  let ev = mzWheel(w, svg, 100, 400); // zoom out at the whole file: nothing to do, but still no page scroll
  assert(ev.defaultPrevented && T.minimapView.trail.length === 0, "wheel out on the whole file does nothing but is swallowed");
  ev = mzWheel(w, svg, -100, 400);
  assert(ev.defaultPrevented, "wheel over the minimap never scrolls the page");
  const mid = e(0) + fileSpan / 2;
  assert(T.minimapView.trail.length === 1, "wheel in creates the view");
  assert(Math.abs((T.minimapView.tMax - T.minimapView.tMin) - fileSpan * 0.8) <= 1, "span scaled by 0.8, got " + (T.minimapView.tMax - T.minimapView.tMin));
  assert(Math.abs((T.minimapView.tMin + T.minimapView.tMax) / 2 - mid) <= 1, "zoom at the centre keeps the centre");
  const trailLen = T.minimapView.trail.length;
  mzWheel(w, svg, -100, 400);
  assert(T.minimapView.trail.length === trailLen, "further wheel steps replace the wheel crumb instead of stacking");

  // Cursor anchor: the ts under the cursor stays at the same x.
  w.minimapViewReset();
  const tsAt200 = w.minimapXToTs(200);
  mzWheel(w, svg, -100, 200);
  assert(Math.abs(w.minimapXToTs(200) - tsAt200) <= fileSpan / 800 + 1, "the time under the cursor stays under the cursor");
  const startBefore = T.minimapView.tMin;
  mzWheel(w, svg, -100, 0);
  assert(Math.abs(T.minimapView.tMin - startBefore) <= 1, "zooming at the left edge keeps the start");

  // Zoom out resets past the whole file.
  for (let i = 0; i < 20 && T.minimapView.trail.length; i++) mzWheel(w, svg, 100, 400);
  assert(T.minimapView.trail.length === 0 && T.minimapView.tMin === e(0) && T.minimapView.tMax === e(119), "zooming out past the whole file resets the view");

  // Minimum span 2 s.
  for (let i = 0; i < 60; i++) mzWheel(w, svg, -100, 400);
  assert(T.minimapView.tMax - T.minimapView.tMin === 2000, "wheel zoom stops at the 2 s minimum, got " + (T.minimapView.tMax - T.minimapView.tMin));
  w.minimapViewReset();
});

await withApp(async (w, d, T) => {
  section("minimap-zoom c. Click-to-jump and drag-select resolve timestamps inside the zoomed view");
  const f = await w.addFile("a.log", makeLog(0, 120), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const e = i => f.entries[i].ts;
  const svg = d.querySelector("#timelineMinimapSvg");
  w.setMinimapView(e(20), e(60));

  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 400, clientY: 10 }));
  assert(T.state.selectedId === f.entries[40].id, "click at 50% of the zoomed view jumps to entry 40, got " + T.state.selectedId);
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 0, clientY: 10 }));
  assert(T.state.selectedId === f.entries[20].id, "click at the left edge jumps to the window's first entry");

  // Selection marker: inside the window it is drawn at the zoomed x, outside it is omitted.
  const markers = () => d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line");
  assert(markers().length === 1 && Math.abs(+markers()[0].getAttribute("x") + 1 - 0) < 0.5, "marker of entry 20 sits at the left edge of the zoomed view");
  T.state.selectedId = f.entries[100].id;
  w.updateMinimapSelectionMarkers();
  assert(markers().length === 0, "a selected entry outside the window has no marker");

  const before = f.children.length;
  svg.dispatchEvent(mzPointer(w, "pointerdown", { clientX: 200, clientY: 10 }));
  w.dispatchEvent(mzPointer(w, "pointermove", { clientX: 600, clientY: 10 }));
  w.dispatchEvent(mzPointer(w, "pointerup", { clientX: 600, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 600, clientY: 10 }));
  assert(f.children.length === before && T.minimapView.draft, "drag inside the zoomed view leaves a draft");
  d.querySelector('#timelineMinimapDraftBar [data-act="filter"]').click();
  assert(f.children.length === before + 1, "Filter on a draft inside the zoomed view creates one filter");
  const node = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange");
  assert(node && node.value.from === e(30) && node.value.to === e(50), "drag 25%..75% of the 20..60 s view = 30..50 s, got " + JSON.stringify(node && node.value));
  assert(T.minimapView.trail.length === 1, "the zoom survives the render that creating the filter triggers");

  // The long-press / right-click dialog is prefilled with the zoomed timestamp.
  T.state.activeId = f.id; w.render();
  svg.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 400, clientY: 10 }));
  const dlg = d.querySelector("#timeRangeDialog");
  assert(dlg && (dlg.open || !dlg.classList.contains("hidden")), "right-click opens the time-range dialog");
  assert(d.querySelector("#timeRangeFromInput").value.startsWith("10:00:40"), "dialog prefilled with the zoomed 50% point, got " + d.querySelector("#timeRangeFromInput").value);
  d.querySelector("#timeRangeDialogCancel") && d.querySelector("#timeRangeDialogCancel").click();
});

await withApp(async (w, d, T) => {
  section("minimap-zoom d. Root-file switch resets; entries binning mode works zoomed");
  const f = await w.addFile("a.log", makeLog(0, 120), () => {});
  const g = await w.addFile("b.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();
  const e = i => f.entries[i].ts;
  w.setMinimapView(e(20), e(60));
  assert(T.minimapView.trail.length === 1, "sanity: zoomed on a.log");
  T.state.activeId = g.id;
  w.render();
  assert(T.minimapView.trail.length === 0 && T.minimapView.tMin === g.entries[0].ts, "switching the root file resets the view");
  T.state.activeId = f.id;
  w.render();
  assert(T.minimapView.trail.length === 0, "and switching back does not bring the old zoom back");

  T.minimapBinningMode = "entries";
  w.render();
  w.setMinimapView(e(20), e(60));
  const v = T.minimapView;
  assert(v.idxLo === 20 && v.idxN === 41, "entries mode: the drawn slice is the 41 entries of the window, got " + v.idxLo + "/" + v.idxN);
  assert(w.minimapXToTs(0) === e(20) && w.minimapXToTs(800) === e(60) && w.minimapXToTs(400) === e(40), "entries mode: x -> the real entry timestamps inside the window");
  assert(Math.abs(w.minimapTsToX(e(40)) - 400) < 0.01 && w.minimapTsToX(e(20)) === 0, "entries mode: ts -> x by index inside the window");
  assert(mzSum(T.minimapBars.bg) === 41 && mzSum(T.minimapBars.ov) === 41, "entries mode: bars count the slice, got " + mzSum(T.minimapBars.bg) + "/" + mzSum(T.minimapBars.ov));
  assert(d.querySelector("#timelineMinimapMeta .minimap-res").textContent.endsWith("entries/px"), "entries mode: the hint is in entries/px");
  d.querySelector("#timelineMinimapSvg").dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 400, clientY: 10 }));
  assert(T.state.selectedId === f.entries[40].id, "entries mode: click-to-jump inside the zoomed view");

  // A filtered view: the overlay shows only the matches inside the window.
  w.minimapViewReset();
  T.minimapBinningMode = "time";
  const flt = w.createFilterNode(f.id, "text", "message 3");
  w.render();
  const matches = w.getEntries(flt.id).filter(x => x.ts >= e(20) && x.ts <= e(60)).length;
  w.setMinimapView(e(20), e(60));
  assert(mzSum(T.minimapBars.ov) === matches && matches > 0, "filtered overlay counts only matches inside the window: " + mzSum(T.minimapBars.ov) + " vs " + matches);
  assert(mzSum(T.minimapBars.bg) === 41, "background still counts the whole window");
});

await withApp(async (w, d, T) => {
  section("minimap-zoom e. Phone: 36 px bars, meta hidden at rest, 24 px crumb line while zoomed");
  const f = await w.addFile("a.log", makeLog(0, 120), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  w.render();
  const css = sel => w.getComputedStyle(d.querySelector(sel));
  assert(css("#timelineMinimap").height === "36px", "phone minimap is 36 px tall, got " + css("#timelineMinimap").height);
  assert(css("#timelineMinimapSvg").flexBasis === "36px", "bars 36 px, got " + css("#timelineMinimapSvg").flexBasis);
  assert(css("#timelineMinimapMeta").display === "none", "meta hidden at rest");
  w.setMinimapView(f.entries[20].ts, f.entries[60].ts);
  assert(css("#timelineMinimapMeta").display === "flex" && css("#timelineMinimapMeta").height === "24px", "crumb line shows while zoomed, 24 px");
  assert(css("#timelineMinimap .minimap-meta-rest").display === "none", "the file facts stay hidden on the phone");
  assert(d.querySelectorAll("#timelineMinimapMeta .minimap-crumb").length === 2, "crumbs present on the phone");
  const resEl = d.querySelector("#timelineMinimapMeta .minimap-res");
  assert(resEl && resEl.nextElementSibling.classList.contains("minimap-meta-rest") && !/·/.test(d.querySelector(".minimap-crumbs").parentElement.childNodes[1].textContent || ""), "separators are CSS-generated: no literal dot text between the crumb line and the hidden rest");
  w.minimapViewReset();
  assert(css("#timelineMinimapMeta").display === "none" && css("#timelineMinimap").height === "36px", "back to the plain 36 px strip after reset");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
});
