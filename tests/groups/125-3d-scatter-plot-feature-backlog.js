// GROUP 125 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 125 — 3D scatter plot (FEATURE_BACKLOG.md's deferred "3D scatter",
   person-requested this session): X/Y/Z + optional color-by column
   selection, an "Equal axis scale" mode (off / all / any pair of two axes),
   manual per-axis ranges (person-requested same-session follow-up,
   analogous to 2D's X/Y range inputs), and rotate/zoom/pan mouse
   interaction on a <canvas> (no 3D library in this codebase — hand-rolled
   orthographic projection, see philogg.html's "3D scatter" comment block).
   Point -> log-entry click reuses the same jumpToFullLog the 2D scatter's
   marks already use.
   ============================================================ */
group(125);
await withApp(async (w, d, T) => {
  section("125. Plot: 3D scatter — axis selection, axis-equal modes, manual axis ranges, rotate/zoom/pan, point click");

  // Three rows with symmetric 0/50/100 ranges on all three axes, so the
  // default (axisEqual3d "off") per-axis scale is identical (1/100) on
  // X/Y/Z regardless of mode — keeps the rotate/zoom/pan/click geometry
  // below hand-computable without axis-equal padding complicating it.
  const rows = [0, 50, 100];
  const log = rows.map((v, i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${v} y=${v} z=${v}"`
  ).join("\n") + "\n";
  const f = await w.addFile("scatter3d.log", log, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", "x=[*:int] y=[*:int] z=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 3, "sanity: 3 extraction rows");

  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="3d"]'), w);
  assert(T.plotConfig.type === "3d", "chart type switches to 3d");

  /* ---------- Controls: X/Y/Z + color-by + axis-equal-mode select, no 2D-only controls ---------- */
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle"),
    zSel = d.querySelector("#plotZSelect"), colorSel = d.querySelector("#plotColorSelect"), eqSel = d.querySelector("#plotAxisEqual3d");
  assert(xSel && ySel && zSel && colorSel && eqSel, "3D controls (X/Y/Z/color-by/axis-equal-mode selects) are all present");
  assert(d.querySelector("#plotAxisEqual") === null, "the 2D single axisEqual checkbox is NOT shown for 3D (it has its own axis-equal-mode select instead)");
  assert(d.querySelector("#plotXMin") && d.querySelector("#plotYMin") && d.querySelector("#plotZMin") && d.querySelector("#plotZMax"),
    "manual X/Y/Z range inputs are offered for 3D too, analogous to 2D's X/Y range inputs");
  assert(d.querySelector("#plotYList") === null, "the multi-select Y checkbox list (line/bar-only) isn't shown for 3D");
  assert(d.querySelector("#plot3dResetBtn"), "a 'Reset view' button is offered for 3D");

  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));
  zSel.value = "2"; zSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.xCol === 0 && T.plotConfig.yCols[0] === 1 && T.plotConfig.zCol === 2, "X/Y/Z selects write plotConfig.xCol/yCols[0]/zCol");

  /* ---------- Canvas/SVG visibility, zoom bar hidden for 3D ---------- */
  assert(!d.querySelector("#plot3dCanvas").classList.contains("hidden"), "the 3D canvas is shown once type is 3d");
  assert(d.querySelector("#plotSvg").classList.contains("hidden"), "the 2D SVG chart is hidden while showing a 3D plot");
  assert(d.querySelector("#plot2dToolsGroup").classList.contains("hidden"), "the 2D zoom bar is hidden for 3D (rotate/zoom/pan happens directly on the canvas instead)");
  assert(T.plot3dLastRender, "plot3dLastRender is populated after a 3D render");
  assert(T.plotHoverPoints.length === 3, "one hover/click hit-test entry per plotted row");

  /* ---------- Axis-equal modes (asymmetric ranges, separate extraction) ---------- */
  const asymRows = [[0, 0, 0], [50, 25, 5], [100, 50, 10]]; // X range 100, Y range 50, Z range 10
  const asymLog = asymRows.map(([x, y, z], i) =>
    `2024-01-15 10:01:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y} z=${z}"`
  ).join("\n") + "\n";
  const f2 = await w.addFile("scatter3d-asym.log", asymLog, () => {});
  w.render();
  T.state.activeId = f2.id;
  const node2 = w.createFilterNode(f2.id, "text", "x=[*:int] y=[*:int] z=[*:int]");
  T.state.activeId = node2.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="3d"]'), w);
  d.querySelector("#plotXSelect").value = "0"; d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1"; d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotZSelect").value = "2"; d.querySelector("#plotZSelect").dispatchEvent(new w.Event("change", { bubbles: true }));

  const nearlyEq = (a, b) => Math.abs(a - b) < 1e-9;
  assert(T.plotConfig.axisEqual3d === "off", "axis-equal-mode defaults off");
  const offScale = T.plot3dLastRender;
  assert(nearlyEq(offScale.sx, 0.01) && nearlyEq(offScale.sy, 0.02) && nearlyEq(offScale.sz, 0.1),
    "off: each axis independently scaled to its own data range (sx=1/100, sy=1/50, sz=1/10), got " + JSON.stringify({ sx: offScale.sx, sy: offScale.sy, sz: offScale.sz }));

  const eqModeSel = d.querySelector("#plotAxisEqual3d");
  eqModeSel.value = "all"; eqModeSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const allScale = T.plot3dLastRender;
  assert(nearlyEq(allScale.sx, 0.01) && nearlyEq(allScale.sy, 0.01) && nearlyEq(allScale.sz, 0.01),
    "'all equal': every axis shares the tightest (smallest) individual scale (0.01 = 1/100, X's own), so real proportions between all three are preserved");

  eqModeSel.value = "xy"; eqModeSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const xyScale = T.plot3dLastRender;
  assert(nearlyEq(xyScale.sx, 0.01) && nearlyEq(xyScale.sy, 0.01) && nearlyEq(xyScale.sz, 0.1),
    "'X=Y equal, Z auto': X and Y share X's tighter scale (0.01), Z stays independently auto-scaled (0.1)");

  eqModeSel.value = "yz"; eqModeSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  const yzScale = T.plot3dLastRender;
  assert(nearlyEq(yzScale.sy, 0.02) && nearlyEq(yzScale.sz, 0.02) && nearlyEq(yzScale.sx, 0.01),
    "'Y=Z equal, X auto': Y and Z share Y's tighter scale (0.02), X stays independently auto-scaled (0.01)");
  eqModeSel.value = "off"; eqModeSel.dispatchEvent(new w.Event("change", { bubbles: true })); // back to independent-per-axis for the range tests below

  /* ---------- Manual axis ranges, analogous to 2D's X/Y range inputs ---------- */
  // Person-requested follow-up: an explicit min/max per axis (X/Y/Z), same
  // "auto unless overridden" shape as the 2D charts' own X/Y range inputs.
  // The auto X range here is 0..100 (sx=1/100=0.01, asserted above) —
  // overriding it to 0..50 should double the scale to 1/50=0.02.
  const xMinInput = d.querySelector("#plotXMin"), xMaxInput = d.querySelector("#plotXMax");
  xMaxInput.value = "50"; xMaxInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.xMax === "50", "typing a manual X max writes plotConfig.xMax (shared field with 2D's own X range input)");
  assert(nearlyEq(T.plot3dLastRender.sx, 0.02), "a manual X range (0..50 instead of the auto 0..100) doubles X's world scale to 1/50, got " + T.plot3dLastRender.sx);
  assert(nearlyEq(T.plot3dLastRender.sy, 0.02) && nearlyEq(T.plot3dLastRender.sz, 0.1), "Y/Z scales are unaffected by the X-only override");

  const zMinInput = d.querySelector("#plotZMin"), zMaxInput = d.querySelector("#plotZMax");
  zMinInput.value = "0"; zMinInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  zMaxInput.value = "5"; zMaxInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(nearlyEq(T.plot3dLastRender.sz, 0.2), "a manual Z range (0..5 instead of the auto 0..10) doubles Z's world scale to 1/5, got " + T.plot3dLastRender.sz);

  xMaxInput.value = ""; xMaxInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  zMinInput.value = ""; zMinInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  zMaxInput.value = ""; zMaxInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(nearlyEq(T.plot3dLastRender.sx, 0.01) && nearlyEq(T.plot3dLastRender.sz, 0.1), "clearing the manual overrides back to \"\" reverts to the auto data range");

  /* ---------- Rotate / zoom / pan / hover / click, back on the symmetric extraction ---------- */
  // Switching to a genuinely DIFFERENT extraction node (node2's asymmetric
  // one, above) and back reproduces this node's own remembered plot with no
  // re-selection needed — plotConfig lives on the node itself
  // (node.plotConfig, see "Plot config persists per extraction node" in
  // docs/extraction-and-plotting.md and Group 126's own dedicated coverage).
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  assert(T.plotConfig.type === "3d" && T.plotConfig.xCol === 0 && T.plotConfig.zCol === 2, "3D type + X/Y/Z remembered after switching back to this extraction, no re-selection needed");

  // Force an axis-aligned view (no rotation, zoom=1, no pan) so screen
  // positions are hand-computable: with rotX=rotY=0 the projection reduces
  // to sx = cx + wx*scale, sy = cy - wy*scale. Stubbed clientWidth/Height
  // are 800x400 -> cx=400, cy=200, fitScale = min(800,400)/2-40 = 160.
  T.plot3dView = { rotX: 0, rotY: 0, zoom: 1, panX: 0, panY: 0 };
  w.renderPlotChart();
  assert(T.plot3dLastRender.scale === 160, "sanity: fitScale at 800x400/zoom=1 is 160, got " + T.plot3dLastRender.scale);
  // Row 2 (x=y=z=100) sits at world (0.5,0.5,0.5) (centered/scaled by 1/100) -> screen (480, 120).
  const canvas = d.querySelector("#plot3dCanvas");
  const targetEntry = T.extractRowsData[2].entry;
  canvas.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 480, clientY: 120 }));
  assert(!d.querySelector("#plotTooltip").classList.contains("hidden"), "hovering exactly over a projected point shows the tooltip");
  assert(d.querySelector("#plotTooltip").innerHTML.includes("100"), "tooltip shows the hovered point's real underlying values, got " + d.querySelector("#plotTooltip").innerHTML);

  fireClick(canvas, w);
  assert(T.state.activeId === node.id, "clicking a 3D point reveals the entry as the corresponding Table row (revealInTableView, same as 2D scatter marks) rather than jumping to its root file");
  assert(T.fhActiveTab === "table", "the Table tab becomes active, not Filtered");
  assert(T.state.selectedId === targetEntry.id, "the clicked point's real underlying entry becomes selected");

  // Empty space (no point under the cursor) is a no-op.
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  T.plot3dView = { rotX: 0, rotY: 0, zoom: 1, panX: 0, panY: 0 };
  w.renderPlotChart();
  const beforeEmptyClick = T.state.activeId;
  canvas.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }));
  fireClick(canvas, w);
  assert(T.state.activeId === beforeEmptyClick, "clicking empty canvas space (no point under the cursor) doesn't navigate away");

  /* ---------- Wheel zoom ---------- */
  const zoomBefore = T.plot3dView.zoom;
  canvas.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 400, clientY: 200, deltaY: -100 }));
  const zoomAfterIn = T.plot3dView.zoom;
  assert(zoomAfterIn > zoomBefore, "wheel-up zooms in (zoom factor increases), got " + zoomAfterIn + " from " + zoomBefore);
  canvas.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 400, clientY: 200, deltaY: 100 }));
  assert(T.plot3dView.zoom < zoomAfterIn, "wheel-down zooms back out (zoom factor decreases again), got " + T.plot3dView.zoom + " from " + zoomAfterIn);

  /* ---------- Drag to rotate; a drag's trailing click doesn't also jump ---------- */
  T.plot3dView = { rotX: 0, rotY: 0, zoom: 1, panX: 0, panY: 0 };
  w.renderPlotChart();
  const rotBeforeActive = T.state.activeId;
  canvas.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 300, clientY: 200, button: 0 }));
  assert(canvas.classList.contains("dragging"), "a left-button drag on the canvas puts it into rotate mode (dragging cursor)");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 400, clientY: 200, button: 0 })); // +100px right
  assert(Math.abs(T.plot3dView.rotY - 0.8) < 1e-6, "dragging right rotates yaw (rotY) by dx*0.008 = 0.8, got " + T.plot3dView.rotY);
  assert(T.plot3dView.rotX === 0, "a purely horizontal drag doesn't change pitch (rotX)");
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 400, clientY: 200, button: 0 }));
  assert(!canvas.classList.contains("dragging"), "releasing the mouse ends rotate mode");
  fireClick(canvas, w);
  assert(T.state.activeId === rotBeforeActive, "the drag's trailing click is suppressed (doesn't also jump to whatever point ends up under the cursor)");

  /* ---------- Middle-drag / shift-drag to pan ---------- */
  T.plot3dView = { rotX: 0, rotY: 0, zoom: 1, panX: 0, panY: 0 };
  w.renderPlotChart();
  canvas.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: 300, clientY: 200, button: 1 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 260, clientY: 230, button: 1 })); // dx=-40, dy=+30
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: 260, clientY: 230, button: 1 }));
  assert(T.plot3dView.panX === -40 && T.plot3dView.panY === 30, "middle-click-drag pans the view by the raw pixel delta, got panX=" + T.plot3dView.panX + " panY=" + T.plot3dView.panY);

  /* ---------- Reset view ---------- */
  fireClick(d.querySelector("#plot3dResetBtn"), w);
  assert(T.plot3dView.zoom === 1 && T.plot3dView.panX === 0 && T.plot3dView.panY === 0
    && Math.abs(T.plot3dView.rotX - (-0.5)) < 1e-9 && Math.abs(T.plot3dView.rotY - 0.7) < 1e-9,
    "Reset view restores the default rotation/zoom/pan, got " + JSON.stringify(T.plot3dView));
});
