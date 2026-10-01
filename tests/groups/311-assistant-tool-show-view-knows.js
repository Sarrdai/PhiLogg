// GROUP 311 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 311 — Assistant tool show_view knows every chart type: the value
   charts (heatmap/profile over an array or a column group, radar, parallel
   with ranges), 3D and color-by, with clear errors for unknown types,
   colormaps and columns. Data: the log simulator's sensors + arrays
   scenarios. */
group(311);
await withApp(async (w, d, T) => {
  section("311a. show_view: radar, parallel (color, ranges), heatmap/profile over columns");
  const f = await llmSimFile(w, ["sensors", "arrays"], 300, 4);
  const sens = llmRun(w, "create_filter", { parentId: f.id, pattern: "Sensor [*:word] temperature=[*:float] C pressure=[*:float] bar voltage=[*:float] V" }).result;
  const cfg = () => T.state.nodes[sens.nodeId].plotConfig;

  let r = llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { type: "radar", columns: ["2", "3", "4"], row: 5 } });
  assert(!r.error && r.result.plot.type === "radar" && r.result.plot.columns.length === 3 && r.result.plot.row === 5, "radar over three columns at row 5, got " + JSON.stringify(r.result || r.error));
  assert(JSON.stringify(cfg().multiCols) === "[1,2,3]" && cfg().profileRow === 4 && T.fhActiveTab === "plot", "stored in plotConfig");
  assert(d.querySelectorAll("#plotSvg .plot-mark").length === 3, "the radar is drawn");

  r = llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { type: "parallel", columns: ["2", "3", "4"], color: "2", ranges: { "2": [85, null] } } });
  const hot = T.extractRowsData.filter(row => parseFloat(row.values[1]) >= 85).length;
  assert(!r.error && r.result.plot.rowsInRange === hot && hot > 0 && r.result.plot.rows === T.extractRowsData.length, "parallel: rows in range reported, got " + JSON.stringify(r.result || r.error));
  assert(cfg().colorCol === 1 && r.result.plot.color, "color by column 2");
  assert(T.plotParallelBrushes.get(1)[0] === 85 && T.plotParallelBrushes.get(1)[1] === Infinity, "an open range end");
  const brushRect = d.querySelector("#plotSvg .plot-pc-brush");
  assert(brushRect && +brushRect.getAttribute("height") > 1 && +brushRect.getAttribute("y") === T.plotParallelLayout.top, "the open range is drawn up to the axis' top");
  assert(d.querySelectorAll("#plotSvg .plot-pc-line:not(.plot-pc-dim)").length === hot, "only the rows in range stay lit");

  r = llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { type: "heatmap", columns: ["3"] } });
  assert(!r.error && cfg().arraySource === "columns" && cfg().xCol === -1 && r.result.plot.x, "heatmap over a column group, X defaults to time");
  r = llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { type: "3d", x: "2", y: ["3"], z: "4", color: "time", colorMap: "viridis" } });
  assert(!r.error && cfg().zCol === 3 && cfg().yCols.join() === "2" && cfg().colorCol === -1 && cfg().colorMap === "viridis", "3D with Z, color and colormap, got " + JSON.stringify(cfg()));
  r = llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { type: "line", y: ["2", "3"] } });
  assert(!r.error && cfg().yCols.join() === "1,2" && r.result.plot.y.length === 2, "line with two series");

  assert(llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { type: "pie" } }).error.includes("parallel"), "unknown type refused with the list");
  assert(llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { colorMap: "rainbow" } }).error.includes("viridis"), "unknown colormap refused with the list");
  const bad = llmRun(w, "show_view", { nodeId: sens.nodeId, view: "plot", plot: { type: "parallel", ranges: { nope: [1, 2] } } });
  assert(bad.error.includes("nope") && bad.result.columns.length === 4, "unknown range column refused with the column list");

  section("311b. show_view: heatmap/profile over an array column");
  const spec = llmRun(w, "create_filter", { parentId: f.id, pattern: "Spectrum channel=[*:word] bins=[*]" }).result;
  r = llmRun(w, "show_view", { nodeId: spec.nodeId, view: "plot", plot: { type: "heatmap", array: "2" } });
  assert(!r.error && r.result.plot.array && T.state.nodes[spec.nodeId].plotConfig.arraySource === "array" && T.state.nodes[spec.nodeId].plotConfig.arrayCol === 1, "heatmap over the bins array, got " + JSON.stringify(r.result || r.error));
  assert(d.querySelectorAll("#plotSvg .plot-heat-cell").length > 0, "cells drawn");
  r = llmRun(w, "show_view", { nodeId: spec.nodeId, view: "plot", plot: { type: "profile", row: 1 } });
  assert(!r.error && r.result.plot.row === 1 && d.querySelectorAll("#plotSvg .plot-mark").length === 16, "profile of the first spectrum: 16 bins");
});
