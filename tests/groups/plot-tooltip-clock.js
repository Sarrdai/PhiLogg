// GROUP plot-tooltip-clock — the plot hover tooltip (2D and 3D) shows the time
// column ("t (ms)") as clock time, like the X axis, not as raw milliseconds.
// Origin: 2026-10-05 (person-reported: tooltip said "t (ms): 798474").
group("plot-tooltip-clock");

const clockOf = (ms, withDate) => {
  const x = new Date(ms), p2 = n => String(n).padStart(2, "0");
  const t = p2(x.getHours()) + ":" + p2(x.getMinutes()) + ":" + p2(x.getSeconds()) + "." + String(x.getMilliseconds()).padStart(3, "0");
  return withDate ? x.getFullYear() + "-" + p2(x.getMonth() + 1) + "-" + p2(x.getDate()) + " " + t : t;
};

async function openPositionPlot(w, d, T, start, type) {
  const [file] = LOGSIM.generateToStrings({ scenarios: ["position"], entries: 8, seed: 3, start, rate: 1 });
  const f = await w.addFile(file.name, file.text, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 8, "sanity: 8 extraction rows, got " + T.extractRowsData.length);
  w.applyFhView("plot");
  if (type) fireClick(d.querySelector('.plot-type-btn[data-type="' + type + '"]'), w);
  return f;
}

await withApp(async (w, d, T) => {
  section("plot-tooltip-clock: 2D scatter, X = time column, no midnight crossing");
  const f = await openPositionPlot(w, d, T, "2026-01-15T10:00:00");
  const tip = d.querySelector("#plotTooltip");
  const mark = plotHoverOfRow(T, 3);
  assert(mark, "row 3 has a mark");
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: mark.px, clientY: mark.py }));
  assert(!tip.classList.contains("hidden"), "tooltip shown");
  const expected = clockOf(f.entries[0].ts + Number(T.extractRowsData[3].values[-1]));
  assert(tip.textContent.includes("Time: " + expected), "tooltip shows 'Time: " + expected + "', got: " + tip.textContent);
  assert(!tip.textContent.includes("t (ms)"), "no raw 't (ms)' label, got: " + tip.textContent);
  assert(!/\d{4}-\d{2}-\d{2}/.test(tip.textContent), "no date when the span stays within one day, got: " + tip.textContent);
});

await withApp(async (w, d, T) => {
  section("plot-tooltip-clock: span crossing midnight prepends the date");
  const f = await openPositionPlot(w, d, T, "2026-01-15T23:59:57");
  const tip = d.querySelector("#plotTooltip");
  const last = plotHoverOfRow(T, 7);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: last.px, clientY: last.py }));
  const expected = clockOf(f.entries[0].ts + Number(T.extractRowsData[7].values[-1]), true);
  assert(expected.startsWith("2026-01-16 00:"), "sanity: last row is after midnight, got " + expected);
  assert(tip.textContent.includes("Time: " + expected), "tooltip shows 'Time: " + expected + "', got: " + tip.textContent);
});

await withApp(async (w, d, T) => {
  section("plot-tooltip-clock: 3D tooltip too; other columns unchanged");
  const f = await openPositionPlot(w, d, T, "2026-01-15T10:00:00", "3d");
  const sel = (id, v) => { const e = d.querySelector(id); e.value = v; e.dispatchEvent(new w.Event("change", { bubbles: true })); };
  sel("#plotXSelect", "-1"); sel("#plotYSelectSingle", "0"); sel("#plotZSelect", "1");
  const tip = d.querySelector("#plotTooltip");
  const p = T.plotHoverPoints[2];
  assert(p, "3D hover point for row 2");
  d.querySelector("#plot3dCanvas").dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: p.px, clientY: p.py }));
  assert(!tip.classList.contains("hidden"), "3D tooltip shown");
  const row = T.extractRowsData[p.rowIndex];
  const expected = clockOf(f.entries[0].ts + Number(row.values[-1]));
  assert(tip.textContent.includes("Time: " + expected), "3D tooltip shows clock time " + expected + ", got: " + tip.textContent);
  assert(tip.textContent.includes(String(row.values[0])), "the y column keeps its raw value, got: " + tip.textContent);
});

await withApp(async (w, d, T) => {
  section("plot-tooltip-clock: plain text keeps the raw line number");
  const [file] = LOGSIM.generateToStrings({ format: "plain", scenarios: ["position"], entries: 8, seed: 3 });
  await T.bootRestore;
  await w.loadFileDescriptors([{ name: file.name, file: new w.File([file.text], file.name, { type: "text/plain" }) }]);
  const f = T.state.nodes[T.state.rootIds[0]];
  assert(f.formatId === "fmt-plaintext" && f.entries.length === 8, "sanity: a plain-text file node with 8 lines");
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", "Position update x=[*:float] y=[*:float] z=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  w.applyFhView("plot");
  assert(T.extractTimeBase == null, "sanity: no time base for plain text");
  const mark = plotHoverOfRow(T, 2);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: mark.px, clientY: mark.py }));
  const tip = d.querySelector("#plotTooltip");
  assert(!tip.classList.contains("hidden") && tip.textContent.includes("Line: " + T.extractRowsData[2].values[-1]) && !tip.textContent.includes("Time:"),
    "plain text tooltip keeps 'Line: <n>', got: " + tip.textContent);
});
