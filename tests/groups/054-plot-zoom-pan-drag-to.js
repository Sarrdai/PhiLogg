// GROUP 54 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 54 — Plot zoom, pan, drag-to-zoom, and a hover tooltip
   Origin: this session (2026-08-18, person-requested): mouse-wheel zoom
   anchored at the cursor (unlimited zoom-in, zoom-out clamped to the
   current default/"home" view), middle-click-drag panning, an editable
   zoom-level readout with +/-/reset, left-click-drag rectangle zoom
   (multi-step — zooming further into an already-zoomed view), and a hover
   tooltip showing a mark's exact underlying value. All ephemeral view
   state (plotZoom, like plotConfig.xMin/normalize/etc.) — not threaded
   through any persistence carrier, so none of that is tested here.
   Uses a home domain that lands on exact round numbers (0..100 on both
   axes, verified below) specifically so the geometry assertions throughout
   this group can compare against hand-computed expected values instead of
   fuzzy ranges. Chart-area geometry (708x332 plot rect from the stubbed
   800x400 clientWidth/Height minus PLOT_MARGIN) matches Group 53.
   ============================================================ */
group(54);
await withApp(async (w, d, T) => {
  section("54. Plot: zoom / pan / drag-zoom / tooltip");
  const rows = Array.from({ length: 11 }, (_, i) => i * 10); // 0,10,...,100
  const log = rows.map((v, i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${v} y=${v}"`
  ).join("\n") + "\n";
  const f = await w.addFile("zoom.log", log, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 11, "sanity: 11 extraction rows");

  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));

  const svgEl = d.querySelector("#plotSvg");
  const home = T.plotLastRender;
  assert(home, "plotLastRender is populated after the first plot render");
  assert(Math.abs(home.xDomainMin) < 1e-6 && Math.abs(home.xDomainMax - 100) < 1e-6,
    "home X domain is exactly the data range 0..100 (niceTicks lands on round numbers here), got " + home.xDomainMin + ".." + home.xDomainMax);
  assert(Math.abs(home.yDomainMin) < 1e-6 && Math.abs(home.yDomainMax - 100) < 1e-6, "home Y domain likewise 0..100");
  assert(!d.querySelector("#plot2dToolsGroup").classList.contains("hidden"), "the zoom toolbar is visible once the plot has data");

  /* ---------- Zoom-out clamp (home span + a small buffer) / unlimited zoom-in ---------- */
  // PLOT_ZOOM_OUT_BUFFER = 0.08 (8% of the home span on EACH side) — zooming
  // out is capped there, not at the bare home span, so a mark sitting
  // exactly on the home view's edge (previously rendered only half-visible,
  // with no way to bring it fully into view) can be zoomed/panned to with a
  // little padding. The home view itself (plotZoom === null, asserted
  // above) is completely unaffected by this — only what zooming/panning OUT
  // can reach changes.
  const bufferedSpan = 100 * (1 + 2 * 0.08); // = 116
  w.zoomPlotAt(50, 50, 1.5); // factor > 1 = zoom OUT, requesting a span (150) wider than even the buffered ceiling (116)
  const afterZoomOutAttempt = T.plotLastRender;
  assert(Math.abs((afterZoomOutAttempt.xDomainMax - afterZoomOutAttempt.xDomainMin) - bufferedSpan) < 1e-6,
    "zooming OUT from the home view clamps to the home span plus the small buffer (116), never wider — 'zoom out a little past the current default view, but no further'; got span " + (afterZoomOutAttempt.xDomainMax - afterZoomOutAttempt.xDomainMin).toFixed(2));
  assert(afterZoomOutAttempt.xDomainMin > -100 && afterZoomOutAttempt.xDomainMax < 200,
    "sanity: the buffered zoom-out is still just a small pad around the home view, nowhere near doubling it, got " + afterZoomOutAttempt.xDomainMin.toFixed(2) + ".." + afterZoomOutAttempt.xDomainMax.toFixed(2));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  w.zoomPlotAt(50, 50, 0.001); // an extreme zoom-in factor
  const tinySpan = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(tinySpan < 0.5, "zooming IN has no lower limit — a single extreme-factor zoom collapses the 100-unit home span to under 0.5, got " + tinySpan.toFixed(4));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);
  assert(T.plotZoom === null, "Reset button clears plotZoom back to null (home view)");

  /* ---------- Wheel zoom, anchored at the cursor ---------- */
  // Data point (50,50) sits at pixel (58+50*7.22, 362-50*3.46) = (419, 189)
  // given the home domain/708x332 plot rect established above.
  const anchorX = 419, anchorY = 189;
  svgEl.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: anchorX, clientY: anchorY, deltaY: -100 }));
  const afterWheelIn = T.plotLastRender;
  const spanAfterWheelIn = afterWheelIn.xDomainMax - afterWheelIn.xDomainMin;
  assert(spanAfterWheelIn < 100 - 1e-6, "wheel-up (deltaY<0) over the chart zooms IN (span shrinks below the home span), got " + spanAfterWheelIn.toFixed(2));
  const dataXUnderCursor = afterWheelIn.xDomainMin + (anchorX - afterWheelIn.left) / afterWheelIn.plotW * (afterWheelIn.xDomainMax - afterWheelIn.xDomainMin);
  assert(Math.abs(dataXUnderCursor - 50) < 1, "wheel-zoom is anchored at the cursor — the data value under the mouse (50) stays under the mouse after zooming, got " + dataXUnderCursor.toFixed(2));

  svgEl.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: anchorX, clientY: anchorY, deltaY: 100 }));
  const spanAfterWheelOut = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(spanAfterWheelOut > spanAfterWheelIn, "wheel-down (deltaY>0) at the same anchor zooms back OUT (span grows again)");

  const zoomBeforeMarginWheel = T.plotZoom;
  svgEl.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 5, clientY: 5, deltaY: -100 })); // inside the left margin, left of the axis (left=58)
  assert(T.plotZoom === zoomBeforeMarginWheel, "wheel events over the chart's margin (outside the actual plot rectangle) are ignored");
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  /* ---------- Zoom-level readout: +/- buttons, editable field, reset ---------- */
  assert(d.querySelector("#plotZoomLevelInput").value === "100%", "zoom-level readout shows 100% at the home view, got " + d.querySelector("#plotZoomLevelInput").value);
  fireClick(d.querySelector("#plotZoomInBtn"), w);
  const pctAfterInBtn = parseFloat(d.querySelector("#plotZoomLevelInput").value);
  assert(pctAfterInBtn > 100, "the + button zooms in, raising the % readout above 100, got " + pctAfterInBtn);
  fireClick(d.querySelector("#plotZoomOutBtn"), w);
  fireClick(d.querySelector("#plotZoomOutBtn"), w);
  const pctAfterOutBtn = parseFloat(d.querySelector("#plotZoomLevelInput").value);
  assert(pctAfterOutBtn <= 100, "the − button zooms back out, clamped at the home view's 100%, got " + pctAfterOutBtn);

  const zoomInput = d.querySelector("#plotZoomLevelInput");
  zoomInput.value = "400";
  zoomInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  const spanAfterTyped = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(Math.abs(spanAfterTyped - 25) < 1, "typing '400' in the zoom field sets an ABSOLUTE 400% of the home span (100/4=25 data units), got " + spanAfterTyped.toFixed(2));

  fireClick(d.querySelector("#plotZoomResetBtn"), w);
  assert(d.querySelector("#plotZoomLevelInput").value === "100%", "Reset restores the 100% readout");

  /* ---------- Middle-click-drag panning ---------- */
  // At the home view (already 100%, no zoomed-in headroom), panning is still
  // possible but capped at the same small buffer zoom-out uses (8% of the
  // 100-unit home span = 8) rather than the full requested drag distance —
  // this, together with the buffered zoom-out above, is the actual fix: a
  // mark sitting exactly on the home view's edge can now be brought fully
  // into view (with a little padding) instead of staying stuck half-visible.
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 200, button: 1 })); // dragged LEFT 100px — requests an ~13.85-unit shift, more than the 8-unit buffer
  await new Promise(resolve => setTimeout(resolve, 50)); // let the rAF-batched pan render flush (same pattern as Group 47)
  const afterHomePanAttempt = T.plotLastRender;
  assert(Math.abs((afterHomePanAttempt.xDomainMax - afterHomePanAttempt.xDomainMin) - 100) < 1e-6,
    "panning changes position only, not span — still exactly the 100-unit home span, got " + (afterHomePanAttempt.xDomainMax - afterHomePanAttempt.xDomainMin).toFixed(2));
  assert(afterHomePanAttempt.xDomainMin > 0 && afterHomePanAttempt.xDomainMin <= 8 + 1e-6,
    "a pan request larger than the buffer is capped AT the buffer (8), not applied in full nor rejected outright, got xDomainMin=" + afterHomePanAttempt.xDomainMin.toFixed(3));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  // A SMALL pan request, well under the buffer, applies in full — proving
  // the buffer is a real allowance and not just a rounding artifact of the
  // clamp above.
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 371, clientY: 200, button: 1 })); // ~4-unit shift, under the 8-unit buffer
  await new Promise(resolve => setTimeout(resolve, 50));
  const smallHomePan = T.plotLastRender;
  const expectedSmallShift = 29 / 708 * 100; // (400-371)px / plotW * homeSpan ≈ 4.10
  assert(Math.abs(smallHomePan.xDomainMin - expectedSmallShift) < 0.1,
    "a pan request within the buffer applies in full (unclamped), got xDomainMin=" + smallHomePan.xDomainMin.toFixed(3) + " expected ~" + expectedSmallShift.toFixed(3));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  // Zoom in first (span 50, domain [25,75] both axes), THEN pan — now there's plenty of room to move.
  w.zoomPlotAt(50, 50, 0.5);
  const zoomedBeforePan = T.plotLastRender;
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 200, button: 1 })); // dragged LEFT 100px
  await new Promise(resolve => setTimeout(resolve, 50));
  const zoomedAfterPan = T.plotLastRender;
  assert(Math.abs((zoomedAfterPan.xDomainMax - zoomedAfterPan.xDomainMin) - (zoomedBeforePan.xDomainMax - zoomedBeforePan.xDomainMin)) < 1e-6,
    "panning changes POSITION, not zoom level — the domain span is unchanged before/after the drag");
  assert(zoomedAfterPan.xDomainMin > zoomedBeforePan.xDomainMin,
    "content follows the cursor (like dragging a map): dragging the mouse LEFT brings higher X values into view, got " + zoomedBeforePan.xDomainMin.toFixed(2) + " -> " + zoomedAfterPan.xDomainMin.toFixed(2));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));

  // Drag far the other way — panning can't push the view's low edge below the home view's own lower bound (0).
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 400, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 800, clientY: 200, button: 1 }));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(T.plotLastRender.xDomainMin >= -8 - 1e-6, "panning can't push the view's left edge past the home view's own lower bound plus its small buffer (0 - 8 = -8), got " + T.plotLastRender.xDomainMin.toFixed(3));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, button: 1 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  /* ---------- Left-click-drag rectangle zoom (multi-step) ---------- */
  const dragRectEl = d.querySelector("#plotDragRect");
  assert(dragRectEl.classList.contains("hidden"), "drag-select overlay starts hidden");
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 100, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 500, clientY: 300 }));
  assert(!dragRectEl.classList.contains("hidden"), "dragging past the threshold shows the selection-rectangle overlay");
  const activeIdBeforeDrag = T.state.activeId;
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 500, clientY: 300, button: 0 }));
  assert(dragRectEl.classList.contains("hidden"), "overlay hides again once the drag ends");

  const zoomedRect = T.plotLastRender;
  const expX0 = (200 - 72) / 708 * 100, expX1 = (500 - 72) / 708 * 100;
  const expY1 = 100 - (100 - 16) / 332 * 100, expY0 = 100 - (300 - 16) / 332 * 100; // screen Y is inverted vs. data Y
  assert(Math.abs(zoomedRect.xDomainMin - expX0) < 1 && Math.abs(zoomedRect.xDomainMax - expX1) < 1,
    "left-click-drag zooms to the dragged rectangle's exact data-space X range, got " + zoomedRect.xDomainMin.toFixed(2) + ".." + zoomedRect.xDomainMax.toFixed(2) + " expected ~" + expX0.toFixed(2) + ".." + expX1.toFixed(2));
  assert(Math.abs(zoomedRect.yDomainMin - expY0) < 1 && Math.abs(zoomedRect.yDomainMax - expY1) < 1,
    "...and the dragged rectangle's exact data-space Y range too");

  // The mouseup's trailing "click" event must NOT jump to a log entry (this
  // was a drag, not a plain click) — same suppression pattern the timeline
  // minimap's own drag-select already uses.
  svgEl.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 500, clientY: 300 }));
  assert(T.state.activeId === activeIdBeforeDrag, "the drag's trailing click doesn't jump to a log entry (suppressed, matching the minimap drag-select precedent)");

  // Multi-step: dragging again inside the now-zoomed view zooms in FURTHER.
  const spanBeforeSecondDrag = zoomedRect.xDomainMax - zoomedRect.xDomainMin;
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 300, clientY: 150, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 450, clientY: 250 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 450, clientY: 250, button: 0 }));
  const spanAfterSecondDrag = T.plotLastRender.xDomainMax - T.plotLastRender.xDomainMin;
  assert(spanAfterSecondDrag < spanBeforeSecondDrag, "a second drag-zoom, starting from an already-zoomed view, zooms in FURTHER (multi-step), got span " + spanBeforeSecondDrag.toFixed(2) + " -> " + spanAfterSecondDrag.toFixed(2));
  // Same as any real browser: this mouseup is still followed by a trailing
  // "click" — dispatch it too (and expect it suppressed, same as the first
  // drag above) so plotDragSuppressClick doesn't leak into the next,
  // genuinely-plain click further down.
  svgEl.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: 450, clientY: 250 }));
  fireClick(d.querySelector("#plotZoomResetBtn"), w);

  // A plain click (no drag) on a mark is unaffected — still selects (Group 53
  // covers this generally; this just confirms drag-to-zoom didn't regress it).
  const markRow0 = plotHoverOfRow(T, 0);
  assert(markRow0, "row 0 has a mark to click");
  const cx0 = markRow0.px, cy0 = markRow0.py;
  svgEl.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: cx0, clientY: cy0, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: cx0, clientY: cy0, button: 0 }));
  fireClickAt(svgEl, w, cx0, cy0);
  assert(T.state.activeId === node.id && T.fhActiveTab === "plot" && T.state.selectedId === T.extractRowsData[0].entry.id,
    "a plain click (no drag) on a mark still selects its log entry, unaffected by the new drag-to-zoom handling");
  fireDblClickAt(svgEl, w, cx0, cy0);
  assert(T.fhActiveTab === "table", "...and its double-click still reveals the entry as the corresponding Table row");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");

  /* ---------- Zoom resets when the axis config changes ---------- */
  w.zoomPlotAt(50, 50, 0.5);
  assert(T.plotZoom !== null, "sanity: zoomed in before the axis-config-change check");
  const xSel2 = d.querySelector("#plotXSelect");
  xSel2.value = "-1"; // switch X to the synthetic t(ms) column (ELAPSED_COL)
  xSel2.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotZoom === null, "changing the X-axis column resets plotZoom — a zoom domain computed for the old column is meaningless for the new one");
  xSel2.value = "0"; xSel2.dispatchEvent(new w.Event("change", { bubbles: true }));

  /* ---------- Hover tooltip: exact underlying value, point- and rect-based hit-testing ---------- */
  const tooltipEl = d.querySelector("#plotTooltip");
  assert(tooltipEl.classList.contains("hidden"), "tooltip starts hidden");
  const mark3 = plotHoverOfRow(T, 3);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: mark3.px, clientY: mark3.py }));
  assert(!tooltipEl.classList.contains("hidden"), "hovering directly over a point mark shows the tooltip");
  assert(tooltipEl.textContent.includes("30"), "tooltip shows the point's exact underlying value (row 3 is x=30, y=30), got: " + tooltipEl.textContent);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 5, clientY: 5 })); // back into the margin, away from any mark
  assert(tooltipEl.classList.contains("hidden"), "moving away from any mark hides the tooltip again");

  fireClick(d.querySelector('.plot-type-btn[data-type="bar"]'), w);
  const barRect3 = plotHoverOfRow(T, 3);
  assert(barRect3 && barRect3.kind === "bar" && T.plotMarkOps.some(o => o.kind === "rect" && o.rowIndex === 3), "bar chart renders a rect mark for row 3");
  const bx3 = barRect3.bx, by3 = barRect3.by, bw3 = barRect3.bw, bh3 = barRect3.bh;
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: bx3 + bw3 / 2, clientY: by3 + bh3 / 2 }));
  assert(!tooltipEl.classList.contains("hidden"), "hovering inside a bar's rect shows the tooltip too — bar hit-testing is rect-based, not nearest-point");
  assert(tooltipEl.textContent.includes("30"), "bar tooltip shows the exact underlying value, got: " + tooltipEl.textContent);

  /* ---------- Tooltip stays in-bounds and doesn't cover the cursor ---------- */
  // person-reported: a mark far right in the chart pushed the tooltip
  // partly off-screen. jsdom has no real layout engine (offsetWidth/Height
  // are always 0), so a realistic tooltip size is stubbed just for this
  // check — otherwise the flip-to-avoid-overflow logic has nothing to clamp
  // against and this couldn't actually exercise it.
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  d.querySelector("#plotXSelect").value = "0";
  d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1";
  d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));
  Object.defineProperty(tooltipEl, "offsetWidth", { value: 140, configurable: true });
  Object.defineProperty(tooltipEl, "offsetHeight", { value: 50, configurable: true });
  // Row 10 is the last row (x=100, y=100) — the chart's top-right corner
  // point, at pixel (780, 16) per the home-domain math established above.
  const markFarRight = plotHoverOfRow(T, 10);
  assert(markFarRight, "row 10's mark exists");
  const cxFar = markFarRight.px, cyFar = markFarRight.py;
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: cxFar, clientY: cyFar }));
  assert(!tooltipEl.classList.contains("hidden"), "tooltip shows for the far-right/top mark too");
  const leftPx = parseFloat(tooltipEl.style.left), topPx = parseFloat(tooltipEl.style.top);
  assert(leftPx + 140 <= 800 - 4 + 1e-6,
    "the tooltip flips to the LEFT of a mark near the right edge instead of running off-screen (800-wide chart area), got left=" + leftPx + " (would end at " + (leftPx + 140) + ")");
  assert(leftPx < cxFar, "flipped left of the cursor, so it no longer sits under/right of the mark's own pixel position");
  assert(topPx >= 4 - 1e-6 && topPx + 50 <= 400 - 4 + 1e-6, "the tooltip stays vertically within the chart area too, got top=" + topPx);
  assert(topPx > cyFar, "with no room ABOVE a mark near the top edge, the tooltip flips to BELOW it instead — never overlapping the cursor point");
  Object.defineProperty(tooltipEl, "offsetWidth", { value: 0, configurable: true });
  Object.defineProperty(tooltipEl, "offsetHeight", { value: 0, configurable: true });
});
