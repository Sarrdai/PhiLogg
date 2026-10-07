// GROUP 229 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 229 — Selectable colormaps for the "color by value" scatter/3D
   dimension, and 3D's colorbar now matches 2D's full-plot-height one
   (person-requested, 2026-09-16: "Die colormap der 2D Plots erstreckt sich
   über die gesamte Fensterhöhe. Beim 3D Plot ist die Leiste deutlich
   kleiner. Gleiche die Darstellung in 3D an die der 2D Plots an. Zusätzlich
   für weitere colormaps ein zwischen denen man wählen kann. Die aktuelle
   weil die Default Einstellung bleiben"). `plotColorScale(t, mapId)` now
   reads its stops from `PLOT_COLOR_MAPS` (unchanged pre-existing
   blue->yellow->red kept as the "default" entry, so `plotConfig.colorMap`
   defaults to it and nothing visually changes for a plot that never opens
   the new picker); a `#plotColorMapSelect` dropdown (shared markup for
   scatter and 3D) writes `plotConfig.colorMap`, threaded through
   `defaultPlotConfig`/`sanitizePlotConfig` like every other plotConfig
   field (no separate persistence-carrier work needed — see
   docs/extraction-and-plotting.md's "Plot config persists per extraction
   node"). renderPlot3D's legend strip lost its `Math.min(140, ...)` cap
   (now `Math.max(20, cssH - 32)`, the same "span the chart area's height"
   shape 2D's own `legendH = plotH` already had) and its canvas gradient
   grew from 3 hardcoded stops to 10, so a longer colormap (Viridis/Turbo)
   reads correctly across the whole strip, not just at 0/50/100%.
   ============================================================ */
group(229);
await withApp(async (w, d, T) => {
  section("229a. 2D scatter: Colormap picker present, defaults to \"default\", changes legend + mark colors");

  const rows2d = [[0, 0, 0], [10, 10, 50], [20, 20, 100]]; // x, y, c(color-by)
  const log2d = rows2d.map(([x, y, c], i) =>
    `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y} c=${c}"`
  ).join("\n") + "\n";
  const f2d = await w.addFile("colormap2d.log", log2d, () => {});
  w.render();
  T.state.activeId = f2d.id;
  const node2d = w.createFilterNode(f2d.id, "text", "x=[*:int] y=[*:int] c=[*:int]");
  T.state.activeId = node2d.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  d.querySelector("#plotXSelect").value = "0"; d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1"; d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.colorCol === null, "sanity: \"Color by\" starts at None");
  assert(d.querySelector("#plotColorMapSelect") === null, "the Colormap picker is NOT shown while \"Color by\" is None (person-requested, 2026-09-16)");

  d.querySelector("#plotColorSelect").value = "2"; d.querySelector("#plotColorSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.colorCol === 2, "sanity: color-by column set to the c=... extraction");

  const cmSel = d.querySelector("#plotColorMapSelect");
  assert(cmSel, "a #plotColorMapSelect dropdown is offered once a color-by column is chosen");
  const mapIds = Object.keys(T.PLOT_COLOR_MAPS);
  assert(mapIds.length >= 2, "sanity: more than just the default colormap exists to choose from");
  assert([...cmSel.options].map(o => o.value).join(",") === mapIds.join(","), "the select offers exactly PLOT_COLOR_MAPS' own keys, in order");
  assert(T.plotConfig.colorMap === "default" && cmSel.value === "default", "colorMap defaults to \"default\" (the pre-existing blue->yellow->red scale) — unchanged behavior for a plot that never touches the picker");

  // Legend: 24 gradient-strip <rect>s at legendX = left(72) + plotW(800-72-88=640) + 24 = 736
  // (hasColorScale widens the right margin to 88, same geometry Group 53/54 rely on).
  const legendRects = () => [...d.querySelectorAll('#plotSvg rect')].filter(r => r.getAttribute("x") === "736");
  assert(legendRects().length === 24, "24-stop gradient legend strip, got " + legendRects().length);
  // First stop (i=0, nearest the top/max end): fill = plotColorScale(midpoint of [0, 1/24], colorMap).
  const expectedTopFill = mapId => w.plotColorScale((0 / 24 + 1 / 24) / 2, mapId);
  assert(legendRects()[0].getAttribute("fill") === expectedTopFill("default"), "legend's top stop uses plotColorScale(...,\"default\") when no colormap is chosen, got " + legendRects()[0].getAttribute("fill"));

  // Legend spans the FULL plot height (top=16, plotH=400-16-52=332) — this
  // was already true for 2D before this session; asserted here as the
  // reference 3D is now made to match (229b below).
  const legendTexts = [...d.querySelectorAll('#plotSvg text.plot-tick-label')].filter(t => t.getAttribute("x") === (736 + 16) + "");
  assert(legendTexts.some(t => t.getAttribute("y") === "20"), "legend's max-value label sits at y = top(16) + 4 = 20");
  assert(legendTexts.some(t => t.getAttribute("y") === "348"), "legend's min-value label sits at y = top(16) + plotH(332) = 348 — i.e. the legend spans the full plot height, not a capped fraction of it");

  // A mark's own fill also follows the colormap: row 2 (c=100, the max) sits at t=1.
  const markRow2 = T.plotMarkOps.find(o => o.kind === "circle" && o.rowIndex === 2);
  assert(markRow2.fill === w.plotColorScale(1, "default"), "the max-value point's fill is plotColorScale(1, \"default\")");

  // Switching the colormap re-renders both the legend and the marks with the new scale.
  cmSel.value = "viridis"; cmSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.colorMap === "viridis", "changing the select writes plotConfig.colorMap");
  const newTopFill = legendRects()[0].getAttribute("fill");
  assert(newTopFill === expectedTopFill("viridis") && newTopFill !== expectedTopFill("default"), "legend's top stop now follows the chosen colormap (viridis), and differs from the default scale's own color, got " + newTopFill);
  const newMarkRow2 = T.plotMarkOps.find(o => o.kind === "circle" && o.rowIndex === 2).fill;
  assert(newMarkRow2 === w.plotColorScale(1, "viridis") && newMarkRow2 !== w.plotColorScale(1, "default"), "the max-value point's fill also switched to viridis");

  // Reverting "Color by" back to None hides the picker again — the chosen
  // colormap itself is left untouched underneath (matches every other
  // plotConfig field, e.g. colorCol's own value stays remembered too).
  d.querySelector("#plotColorSelect").value = ""; d.querySelector("#plotColorSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.colorCol === null, "sanity: Color by reset to None");
  assert(d.querySelector("#plotColorMapSelect") === null, "the Colormap picker disappears again once Color by is reset to None");
  assert(T.plotConfig.colorMap === "viridis", "the underlying colorMap choice itself isn't reset just because the picker is hidden");
});

await withApp(async (w, d, T) => {
  section("229b. 3D scatter: same Colormap picker, and the colorbar's height now matches 2D's (no more 140px cap)");

  const rows3d = [[0, 0, 0, 0], [10, 10, 10, 50], [20, 20, 20, 100]]; // x, y, z, c(color-by)
  const log3d = rows3d.map(([x, y, z, c], i) =>
    `2024-01-15 10:01:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${x} y=${y} z=${z} c=${c}"`
  ).join("\n") + "\n";
  const f3d = await w.addFile("colormap3d.log", log3d, () => {});
  w.render();
  T.state.activeId = f3d.id;
  const node3d = w.createFilterNode(f3d.id, "text", "x=[*:int] y=[*:int] z=[*:int] c=[*:int]");
  T.state.activeId = node3d.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="3d"]'), w);
  d.querySelector("#plotXSelect").value = "0"; d.querySelector("#plotXSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotYSelectSingle").value = "1"; d.querySelector("#plotYSelectSingle").dispatchEvent(new w.Event("change", { bubbles: true }));
  d.querySelector("#plotZSelect").value = "2"; d.querySelector("#plotZSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(d.querySelector("#plotColorMapSelect") === null, "same for 3D: the Colormap picker is hidden while Color by is None");

  d.querySelector("#plotColorSelect").value = "3"; d.querySelector("#plotColorSelect").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.colorCol === 3, "sanity: color-by column set to the c=... extraction");

  const cmSel3d = d.querySelector("#plotColorMapSelect");
  assert(cmSel3d, "the same #plotColorMapSelect dropdown is offered for 3D once a color-by column is chosen");
  assert(cmSel3d.value === "default", "defaults to \"default\" here too");

  // #plot3dCanvas draws via a real 2d canvas context; jsdom has no canvas
  // backend so renderPlot3D() normally falls back to its own no-op stub
  // (see the "jsdom/no-canvas-package robustness" note in
  // docs/extraction-and-plotting.md). Installing a small recording mock in
  // its place lets this test see exactly what renderPlot3D() actually draws
  // the colorbar with, the same technique Group 125 would need if it had
  // touched pixel output instead of pure projection math.
  const canvas = d.querySelector("#plot3dCanvas");
  function installMockCtx() {
    const calls = { fillRect: [] };
    const gradStops = [];
    const fillStyles = [];
    let fs = null;
    const ctx = {
      clearRect() {}, fillRect(...a) { calls.fillRect.push(a); }, strokeRect() {},
      fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      arc() {}, fill() { fillStyles.push(fs); }, setTransform() {},
      createLinearGradient() { return { addColorStop(offset, color) { gradStops.push([offset, color]); } }; },
      get fillStyle() { return fs; }, set fillStyle(v) { fs = v; },
      set strokeStyle(v) {}, set lineWidth(v) {}, set font(v) {},
    };
    canvas.getContext = () => ctx;
    return { calls, gradStops, fillStyles };
  }

  let rec = installMockCtx();
  w.renderPlotChart();
  const cssH = 400; // plotChartArea.clientHeight stub, see withApp
  assert(rec.calls.fillRect.length === 1, "exactly one fillRect call — the colorbar strip — got " + rec.calls.fillRect.length);
  const [legendX, legendTop, legendW, legendH] = rec.calls.fillRect[0];
  assert(legendTop === 16 && legendW === 14, "sanity: colorbar's top margin (16) and stroke width (14) unchanged");
  assert(legendH === Math.max(20, cssH - 32), "colorbar height now spans the full chart height minus margins (cssH-32=" + (cssH - 32) + "), not the old 140px cap, got " + legendH);
  assert(legendH > 140, "sanity: the fixed regression this group exists for — colorbar height is no longer capped at 140px, got " + legendH);

  assert(rec.gradStops.length === 11, "gradient now has 11 stops (0..1 in 0.1 steps), up from the old hardcoded 3, got " + rec.gradStops.length);
  assert(rec.gradStops[0][1] === w.plotColorScale(1, "default"), "gradient's top stop (offset 0, colorHi end) uses plotColorScale(1, \"default\")");
  assert(rec.gradStops[10][1] === w.plotColorScale(0, "default"), "gradient's bottom stop (offset 1, colorLo end) uses plotColorScale(0, \"default\")");
  assert(rec.fillStyles.includes(w.plotColorScale(1, "default")), "the max-value point (c=100, t=1) is drawn with plotColorScale(1, \"default\") too");

  // Switching the colormap changes what both the colorbar gradient and the points are drawn with.
  cmSel3d.value = "turbo"; cmSel3d.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotConfig.colorMap === "turbo", "changing the select writes plotConfig.colorMap for 3D too");
  rec = installMockCtx();
  w.renderPlotChart();
  assert(rec.gradStops[0][1] === w.plotColorScale(1, "turbo") && rec.gradStops[0][1] !== w.plotColorScale(1, "default"), "gradient's top stop now follows the chosen colormap (turbo), and differs from default's own color, got " + rec.gradStops[0][1]);
  assert(rec.fillStyles.includes(w.plotColorScale(1, "turbo")), "the max-value point also switched to turbo");
  const [, , , legendHAfter] = rec.calls.fillRect[0];
  assert(legendHAfter === legendH, "the colorbar height itself is unaffected by which colormap is picked");
});
