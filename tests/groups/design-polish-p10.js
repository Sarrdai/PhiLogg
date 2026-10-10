// GROUP design-polish-p10 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p10 — plot axes and grid (E3)
   Origin: 2026-10-10 design polish round, package P10.
   ============================================================ */
group("design-polish-p10");

await withApp(async (w, d, T) => {
  section("design-polish-p10 a. round time ticks");
  const base = new Date(2026, 9, 10, 8, 0, 0).getTime(); // local 08:00:00
  const lo = 7000, hi = 9 * 60000 + 17000; // 08:00:07 .. 08:09:17
  const r = w.niceTimeTicks(lo, hi, 6, base);
  assert(r.step === 120000 || r.step === 60000, "step is whole minutes, got " + r.step);
  assert(r.ticks.length >= 3 && r.ticks.every(t => t >= lo && t <= hi), "only ticks inside the domain: " + r.ticks.length);
  assert(r.ticks.every(t => (base + t) % r.step === 0 || new Date(base + t).getSeconds() === 0), "ticks sit on whole minutes");
  assert(w.formatPlotClockTick(r.ticks[0], lo, hi, r.step).endsWith(":00"), "first label is a whole minute: " + w.formatPlotClockTick(r.ticks[0], lo, hi, r.step));
  const dur = w.niceTimeTicks(0, 150000, 5, null);
  assert(dur.step === 30000 && dur.ticks.join() === "0,30000,60000,90000,120000,150000", "duration 0..150000ms -> 30s steps, got " + dur.ticks);
  const sub = w.niceTimeTicks(0, 1500, 5, null);
  assert(sub.step === 500 && sub.ticks.join() === "0,500,1000,1500", "sub-second domain keeps 1/2/5 ms steps: " + sub.ticks);
  const hrs = w.niceTimeTicks(0, 5 * 3600000, 5, null);
  assert(hrs.step === 3600000, "hours: " + hrs.step);
  assert(w.niceTicks(0, 87, 5).ticks.length > 0, "niceTicks stays for plain numbers");

  section("design-polish-p10 b. grid, titles, area fill");
  const [file] = LOGSIM.generateToStrings({ format: "default", scenarios: ["sensors"], entries: 60, seed: 3 });
  const f = await w.addFile(file.name, file.text, () => {});
  const node = w.createFilterNode(f.id, "text", "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="line"]'), w);
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  assert(/\.plot-grid-line\{stroke:var\(--hairline\); stroke-width:1;\}/.test(css), "grid lines use --hairline, 1px");
  assert(/\.plot-grid-line\.v\{stroke-dasharray/.test(css), "vertical grid lines are dashed");
  const hLines = d.querySelectorAll("#plotSvg .plot-grid-line:not(.v)"), vLines = d.querySelectorAll("#plotSvg .plot-grid-line.v");
  assert(hLines.length > 0 && vLines.length > 0, "both grid directions rendered");
  assert([...vLines].every(l => l.getAttribute("x1") === l.getAttribute("x2")) && [...hLines].every(l => l.getAttribute("y1") === l.getAttribute("y2")), ".v are the vertical ones");
  const titles = [...d.querySelectorAll("#plotSvg .plot-axis-title")];
  assert(titles.length >= 2 && titles.every(t => !t.textContent.includes("▾")) && !d.querySelector("#plotSvg .plot-axis-caret"), "axis titles carry no caret");
  assert(/\.plot-axis-title\{[^}]*var\(--font-ui\)/.test(css), "axis titles use the UI font");
  const xTitle = d.querySelector('#plotSvg .plot-axis-clickable[data-axis="x"]');
  fireClick(xTitle, w);
  const menu = d.querySelector("#plotRoleMenu");
  assert(menu && !menu.classList.contains("hidden"), "clicking the title text opens the axis menu");
  fireKeydown(d, w, "Escape");
  assert(T.plotMarkOps.filter(o => o.kind === "area").length === 1 && T.plotMarkOps.filter(o => o.kind === "path").length === 1, "single-series line has one area path");
  const area = T.plotMarkOps.find(o => o.kind === "area");
  assert(area.baseY === T.plotLastRender.top + T.plotLastRender.plotH, "area closes at the plot floor");

  fireClick(d.querySelector('#plotYList input[data-col="2"]'), w);
  assert(T.plotConfig.yCols.length === 2 && !T.plotMarkOps.some(o => o.kind === "area") && T.plotMarkOps.filter(o => o.kind === "path").length === 2, "two series: no area fill");
});
