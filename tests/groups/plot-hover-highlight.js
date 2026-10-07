// GROUP plot-hover-highlight — hovering a canvas mark (line/scatter/bar) shows one
// ring/outline element in the SVG overlay (#plotHoverHi); hidden on no hit, on
// mouseleave and on every re-render. No canvas redraw on hover.
// Origin: 2026-10-07 (FEATURE_BACKLOG #115). Data: simulator "position" scenario.
group("plot-hover-highlight");
if (groupSelected()) {
  await withApp(async (w, d, T) => {
    const [file] = LOGSIM.generateToStrings({ format: "default", entries: 80, seed: 11, scenarios: "position" });
    const f = await w.addFile("phh-position.log", file.text, () => {});
    w.render();
    T.state.activeId = f.id;
    const node = w.createFilterNode(f.id, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
    T.state.activeId = node.id;
    w.render();
    w.applyFhView("table");
    w.applyFhView("plot");
    const draw = cfg => { Object.assign(T.plotConfig, cfg); w.renderPlotControls(); w.renderPlotChart(); };
    const hi = () => d.querySelector("#plotHoverHi");
    const move = (x, y) => w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));

    for (const type of ["scatter", "line"]) {
      section("plot-hover-highlight a. " + type + ": ring at the hovered point, hidden when moving off");
      draw({ type, xCol: 0, yCols: [1], colorCol: null });
      assert(!hi(), type + ": no highlight before hovering");
      const h = plotHoverOfRow(T, 5);
      move(h.px, h.py);
      const el = hi();
      assert(el && el.localName === "circle", type + ": a circle appears");
      assert(+el.getAttribute("cx") === h.px && +el.getAttribute("cy") === h.py, type + ": centered on the hit point");
      assert(+el.getAttribute("r") > (type === "line" ? 2.6 : 4), type + ": larger than the mark");
      assert(el.parentNode === d.querySelector("#plotSvg"), type + ": lives in the SVG overlay");
      const h9 = plotHoverOfRow(T, 9);
      move(h9.px, h9.py);
      assert(d.querySelectorAll("#plotHoverHi").length === 1 && +hi().getAttribute("cx") === h9.px, type + ": moves in place to the next point");
      move(2, 2);
      assert(!hi(), type + ": moving off removes it");
      move(h.px, h.py);
      assert(hi(), type + ": shown again");
      d.querySelector("#plotChartArea").dispatchEvent(new w.MouseEvent("mouseleave"));
      assert(!hi(), type + ": mouseleave removes it");
      move(h.px, h.py);
      assert(hi(), type + ": shown again before re-render");
      w.renderPlotChart();
      assert(!hi(), type + ": a re-render removes it");
    }

    section("plot-hover-highlight b. bar: outline around the hovered bar");
    draw({ type: "bar", xCol: 0, yCols: [1], colorCol: null });
    const hb = T.plotHoverPoints.find(p => p.rowIndex === 5);
    move(hb.bx + hb.bw / 2, hb.by + hb.bh / 2);
    const el = hi();
    assert(el && el.localName === "rect", "a rect appears");
    assert(+el.getAttribute("x") <= hb.bx && +el.getAttribute("y") <= hb.by &&
      +el.getAttribute("x") + +el.getAttribute("width") >= hb.bx + hb.bw && +el.getAttribute("y") + +el.getAttribute("height") >= hb.by + hb.bh, "it encloses the bar");
    assert(w.getComputedStyle(el).pointerEvents === "none", "it does not intercept pointer events");
    move(2, 2);
    assert(!hi(), "moving off removes it");
    move(hb.bx + hb.bw / 2, hb.by + hb.bh / 2);
    draw({ type: "scatter" });
    assert(!hi(), "switching the chart type (re-render) removes it");
  });
}
