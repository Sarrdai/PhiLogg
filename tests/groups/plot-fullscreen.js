// GROUP plot-fullscreen — opening/closing the plot fullscreen redraws the plot at the
// new size right away (axes SVG + marks canvas), and the toolbar's Fullscreen button
// is released: no focus, no lingering hover card.
// Origin: 2026-10-13 (FEATURE_BACKLOG #130). Data: simulator "position" scenario.
group("plot-fullscreen");
if (groupSelected()) {
  await withApp(async (w, d, T) => {
    const [file] = LOGSIM.generateToStrings({ format: "default", entries: 80, seed: 11, scenarios: "position" });
    const f = await w.addFile("pfs-position.log", file.text, () => {});
    w.render();
    T.state.activeId = f.id;
    const node = w.createFilterNode(f.id, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
    T.state.activeId = node.id;
    w.render();
    w.applyFhView("table");
    w.applyFhView("plot");
    Object.assign(T.plotConfig, { type: "scatter", xCol: 0, yCols: [1], colorCol: null });
    w.renderPlotControls(); w.renderPlotChart();

    // jsdom has no layout: the chart area reports a size that depends on where it sits.
    const area = d.querySelector("#plotChartArea");
    const host = d.querySelector("#plotFullscreenChartHost");
    const size = () => area.parentElement === host ? { w: 1200, h: 700 } : { w: 600, h: 400 };
    Object.defineProperty(area, "clientWidth", { configurable: true, get: () => size().w });
    Object.defineProperty(area, "clientHeight", { configurable: true, get: () => size().h });
    const svg = d.querySelector("#plotSvg"); // the marks canvas is sized from the SVG's rect
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: size().w, bottom: size().h, width: size().w, height: size().h });
    w.renderPlotChart();
    const vb = () => d.querySelector("#plotSvg").getAttribute("viewBox");
    const canvasW = () => d.querySelector("#plotMarksCanvas").style.width;
    assert(vb() === "0 0 600 400" && canvasW() === "600px", "sanity: inline size drawn, got " + vb() + " / " + canvasW());

    section("plot-fullscreen a. open redraws at the fullscreen size, button released");
    const btn = d.querySelector("#plotFullscreenBtn");
    btn.classList.add("expanded"); // the hover card of the button (set by mousemove)
    btn.focus();
    assert(d.activeElement === btn, "sanity: the button has focus before the click");
    btn.click();
    assert(!d.querySelector("#plotFullscreenOverlay").classList.contains("hidden"), "overlay open");
    assert(vb() === "0 0 1200 700", "axes SVG matches the fullscreen host, got " + vb());
    assert(canvasW() === "1200px", "marks canvas matches the fullscreen host, got " + canvasW());
    assert(d.activeElement !== btn, "the Fullscreen button no longer has focus");
    assert(!btn.classList.contains("expanded"), "no hover card left on the button");

    section("plot-fullscreen b. close redraws at the inline size");
    d.querySelector("#plotFullscreenCloseBtn").click();
    assert(d.querySelector("#plotFullscreenOverlay").classList.contains("hidden"), "overlay closed");
    assert(vb() === "0 0 600 400", "axes SVG back at the inline size, got " + vb());
    assert(canvasW() === "600px", "marks canvas back at the inline size, got " + canvasW());
    assert(d.activeElement !== btn && d.activeElement !== d.querySelector("#plotFullscreenCloseBtn"), "no toolbar/close button focused after close");
  });
}
