// GROUP entry-detail-table-plot — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP entry-detail-table-plot — Entry detail on the extraction Table (and
   Plot), Statistics as a tab of the bottom panel
   Origin: 2026-10-06 (person-requested, mockup variant B). Step 1: a body
   cell/gutter click in the extraction table selects that row's entry
   (state.selectedId, the same selection the log views use) and Entry detail
   shows it — with several cells selected, the row of the last clicked cell;
   a header click leaves it alone; the table's current row (.extract-current)
   and the Filtered selection survive tab switches. The bottom panel is a
   normal panel on Table and Plot (header-only strip only on Patterns) with the
   tabs "Entry detail | Statistics | Facets" (#lowerTabStats offered on
   Table/Plot only; the old standalone #statsPanel is gone), the selected tab
   persisted as one value under philogg-lower-tab.
   Step 2 (same day): a plain click on a 2D plot mark / the 3D canvas SELECTS
   the entry (Entry detail, selection ring / canvas highlight, tab stays Plot,
   #plotSvg not rebuilt), a double-click reveals it in the Table
   (revealInTableView), drags never select.
   ============================================================ */
group("entry-detail-table-plot");

const edtpPattern = "Position update x=[*:float] y=[*:float] z=[*:float]";
const edtpMouse = (w, type, extra) => new w.MouseEvent(type, { bubbles: true, cancelable: true, ...(extra || {}) });
const edtpCell = (d, row, col) => d.querySelector('#extractBody td[data-row="' + row + '"][data-col="' + col + '"]');

async function edtpOpenTable(w, d, T, entries) {
  const [file] = LOGSIM.generateToStrings({ scenarios: ["position"], entries: entries || 12, seed: 5, start: "2026-01-15T10:00:00", rate: 1 });
  const f = await w.addFile(file.name, file.text, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", edtpPattern);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === (entries || 12), "sanity: one extraction row per entry, got " + T.extractRowsData.length);
  return { f, node };
}

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot a. a body cell click selects the row's entry and Entry detail shows it");
  await edtpOpenTable(w, d, T);
  const panel = d.querySelector("#detailPanel");
  assert(!panel.classList.contains("detail-strip-only") && !d.querySelector("#lowerTabDetail").disabled, "Table: a normal bottom panel, Entry detail enabled");
  assert(T.state.selectedId == null, "sanity: nothing selected yet");

  const colA = T.extractColumns.find(c => c.colIndex >= 0).colIndex;
  const td = edtpCell(d, 3, colA);
  const tr = td.parentElement;
  td.dispatchEvent(edtpMouse(w, "mousedown"));
  const entry3 = T.extractRowsData[3].entry;
  assert(T.state.selectedId === entry3.id, "selectedId is row 3's entry");
  assert(d.querySelector("#detailMessage").textContent === entry3.message, "Entry detail shows that entry's message");
  assert(tr.classList.contains("extract-current") && d.querySelectorAll("#extractBody tr.extract-current").length === 1, "exactly row 3 carries the current-row class");
  assert(td.classList.contains("cell-selected"), "the cell selection works as before");
  assert(td.isConnected && edtpCell(d, 3, colA) === td, "the row elements were not rebuilt (a dblclick afterwards needs them)");

  section("entry-detail-table-plot b. another row moves the current row; the gutter selects too");
  edtpCell(d, 6, colA).dispatchEvent(edtpMouse(w, "mousedown"));
  assert(T.state.selectedId === T.extractRowsData[6].entry.id && !tr.classList.contains("extract-current"), "row 6 is current, row 3 no longer");
  d.querySelector('#extractBody td.extract-gutter[data-row="8"]').dispatchEvent(edtpMouse(w, "mousedown"));
  assert(T.state.selectedId === T.extractRowsData[8].entry.id, "a gutter click selects that row's entry");

  section("entry-detail-table-plot c. multi-cell selection: the row of the last clicked cell");
  edtpCell(d, 2, colA).dispatchEvent(edtpMouse(w, "mousedown"));
  edtpCell(d, 5, colA).dispatchEvent(edtpMouse(w, "mousedown", { shiftKey: true }));
  assert(T.state.tableSelection.size > 1, "sanity: a range of cells is selected");
  assert(T.state.selectedId === T.extractRowsData[5].entry.id, "Shift+click: the shift-clicked row");
  edtpCell(d, 9, colA).dispatchEvent(edtpMouse(w, "mousedown", { ctrlKey: true }));
  assert(T.state.selectedId === T.extractRowsData[9].entry.id, "Ctrl+click: the ctrl-clicked row");
  edtpCell(d, 1, colA).dispatchEvent(edtpMouse(w, "mousedown"));
  edtpCell(d, 4, colA).dispatchEvent(edtpMouse(w, "mouseover"));
  assert(T.state.tableSelection.size > 1 && T.state.selectedId === T.extractRowsData[1].entry.id, "drag: the row the drag started on");
  w.dispatchEvent(edtpMouse(w, "mouseup"));

  section("entry-detail-table-plot d. a header click leaves the selected entry alone");
  const before = T.state.selectedId;
  d.querySelector('#extractHead th[data-col="' + colA + '"]').dispatchEvent(edtpMouse(w, "mousedown"));
  assert(T.state.selectedId === before && d.querySelectorAll("#extractBody tr.extract-current").length === 1, "selectedId and the current row are unchanged");
  assert(T.state.tableSelection.size === T.extractRowsData.length, "the column selection works as before");

  section("entry-detail-table-plot e. a double-click on the row still reveals it in Filtered");
  const trDbl = edtpCell(d, 7, colA).parentElement;
  edtpCell(d, 7, colA).dispatchEvent(edtpMouse(w, "mousedown"));
  fireDblClick(trDbl, w);
  assert(T.fhActiveTab === "filter" && T.state.selectedId === T.extractRowsData[7].entry.id, "Filtered shows with row 7's entry selected");
});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot f. the selection survives Filtered <-> Table <-> Plot");
  await edtpOpenTable(w, d, T);
  const colA = T.extractColumns.find(c => c.colIndex >= 0).colIndex;
  edtpCell(d, 4, colA).dispatchEvent(edtpMouse(w, "mousedown"));
  const id = T.extractRowsData[4].entry.id;
  const scrollBefore = d.querySelector("#extractScroll").scrollTop;

  w.applyFhView("filter");
  assert(T.state.selectedId === id, "selectedId unchanged on Filtered");
  assert(!!d.querySelector('#tableRows .log-row.selected[data-entry-id="' + id + '"]'), "the Filtered row carries the selection class");
  assert(d.querySelector("#detailMessage").textContent === T.extractRowsData[4].entry.message, "Entry detail still shows it");

  w.applyFhView("table");
  const cur = d.querySelectorAll("#extractBody tr.extract-current");
  assert(cur.length === 1 && cur[0].dataset.extractEntryId === id, "back on Table: the same row is the current row");
  assert(d.querySelector("#extractScroll").scrollTop === scrollBefore, "no scroll on the tab switch");

  w.applyFhView("plot");
  const panel = d.querySelector("#detailPanel");
  assert(T.state.selectedId === id && !panel.classList.contains("detail-strip-only") && isVisible(d.querySelector("#detailBody"), w), "Plot: a normal panel, Entry detail shows the selection");
  assert(d.querySelector("#detailMessage").textContent === T.extractRowsData[4].entry.message, "Plot: the message of the selected entry");
  w.applyFhView("table");
  assert(d.querySelectorAll("#extractBody tr.extract-current").length === 1, "Plot -> Table: the current row is still there");
});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot g. an entry selected on Filtered is the current row when Table opens");
  await edtpOpenTable(w, d, T);
  w.applyFhView("filter");
  const row = d.querySelectorAll("#tableRows .log-row")[5];
  fireClick(row, w);
  const id = row.dataset.entryId;
  assert(T.state.selectedId === id, "sanity: selected on Filtered");
  w.applyFhView("table");
  const cur = d.querySelectorAll("#extractBody tr.extract-current");
  assert(cur.length === 1 && cur[0].dataset.extractEntryId === id, "the Table shows that entry's row as current");
  assert(T.state.tableSelection == null || T.state.tableSelection.size === 0, "without touching the cell selection");
});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot h. Statistics tab: offered on Table and Plot only, falls back to Entry detail elsewhere");
  const { f, node } = await edtpOpenTable(w, d, T);
  const panel = d.querySelector("#detailPanel"), tabD = d.querySelector("#lowerTabDetail"), tabS = d.querySelector("#lowerTabStats"), tabF = d.querySelector("#lowerTabFacets");
  const body = d.querySelector("#statsPanelBody");
  assert([...d.querySelectorAll("#lowerTabs .lower-tab")].map(t => t.id).slice(0, 3).join() === "lowerTabDetail,lowerTabStats,lowerTabFacets", "tab order Entry detail | Statistics | Facets");
  assert(tabS.getAttribute("role") === "tab" && isVisible(tabS, w), "the Statistics tab is shown on Table");
  assert(!d.querySelector("#statsPanel") && !d.querySelector("#statsToggle") && !d.querySelector("#extractWrap #extractStatsContent"), "the standalone #statsPanel (and its toggle) is gone");
  assert(body.closest("#detailPanelInner") && body.contains(d.querySelector("#extractStatsContent")), "the stats chips live in the bottom panel");

  fireClick(tabS, w);
  assert(panel.classList.contains("lower-stats") && tabS.getAttribute("aria-selected") === "true" && tabD.getAttribute("aria-selected") === "false", "Statistics selected");
  assert(isVisible(body, w) && !isVisible(d.querySelector("#detailBody"), w) && !isVisible(d.querySelector("#detailMeta"), w) && !isVisible(d.querySelector("#detailViewTabs"), w), "stats body shown; detail body, meta and Raw/Parsed/Pretty hidden");
  assert(d.querySelector("#extractStatsContent").textContent.includes("x:") && d.querySelector("#extractStatsContent").textContent.includes("min"), "the stats chips are rendered");
  assert(w.localStorage.getItem("philogg-lower-tab") === "stats", "persisted under philogg-lower-tab");
  assert(w.localStorage.getItem("philogg-stats-collapsed") === null && w.localStorage.getItem("philogg-facets-open") === null, "the old keys are not written any more");

  w.applyFhView("plot");
  assert(isVisible(tabS, w) && panel.classList.contains("lower-stats") && isVisible(body, w), "Plot offers Statistics too and keeps the selected tab");
  assert(/x:/.test(d.querySelector("#extractStatsContent").textContent), "the stats chips are current on Plot");

  w.applyFhView("filter");
  assert(!isVisible(tabS, w) && !panel.classList.contains("lower-stats") && tabD.getAttribute("aria-selected") === "true", "Filtered: no Statistics tab, the panel shows Entry detail");
  assert(isVisible(d.querySelector("#detailBody"), w) && !isVisible(body, w), "Entry detail body shown, stats body hidden");
  assert(w.localStorage.getItem("philogg-lower-tab") === "stats", "the selection is remembered, not reset");
  w.applyFhView("patterns");
  assert(!isVisible(tabS, w) && panel.classList.contains("detail-strip-only"), "Patterns: no Statistics tab, the header-only strip");
  w.applyFhView("table");
  assert(panel.classList.contains("lower-stats") && isVisible(body, w), "back on Table: Statistics again");

  fireClick(tabF, w);
  assert(panel.classList.contains("lower-facets") && !panel.classList.contains("lower-stats") && w.localStorage.getItem("philogg-lower-tab") === "facets", "Facets selected on Table");
  fireClick(tabD, w);
  assert(!panel.classList.contains("lower-stats") && !panel.classList.contains("lower-facets") && isVisible(d.querySelector("#detailBody"), w) && w.localStorage.getItem("philogg-lower-tab") === "detail", "Entry detail selected on Table");

  section("entry-detail-table-plot i. the panel's own collapse applies to the Statistics tab");
  fireClick(tabS, w);
  w.toggleDetailCollapsed(true);
  assert(panel.classList.contains("collapsed") && !isVisible(body, w), "collapsed: no stats body");
  assert(isVisible(tabS, w), "the collapsed header still shows the tab");
  fireClick(tabS, w);
  assert(!panel.classList.contains("collapsed") && isVisible(body, w), "clicking the Statistics tab expands a collapsed panel");
  w.setFacetsOpen(false);
});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot j. Ctrl+I from the Statistics tab opens Facets, again returns to Entry detail");
  await edtpOpenTable(w, d, T);
  const panel = d.querySelector("#detailPanel");
  fireClick(d.querySelector("#lowerTabStats"), w);
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(panel.classList.contains("lower-facets"), "Statistics -> Facets");
  fireKeydown(d, w, "i", { ctrlKey: true });
  assert(!panel.classList.contains("lower-facets") && !panel.classList.contains("lower-stats"), "Facets -> Entry detail");
}, {});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot k. the persisted tab is restored on the next start; Statistics waits for Table/Plot");
  const f = await w.addFile("a.log", makeLog(0, 8), () => {});
  w.render();
  T.state.activeId = f.id;
  w.render();
  const panel = d.querySelector("#detailPanel");
  assert(!panel.classList.contains("lower-stats") && d.querySelector("#lowerTabStats").hidden, "a log tab with a stored 'stats' value: Entry detail, no Statistics tab");
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(panel.classList.contains("lower-stats") && isVisible(d.querySelector("#statsPanelBody"), w), "on Table the stored selection shows Statistics");
}, { beforeParse: window => { try { window.localStorage.setItem("philogg-lower-tab", "stats"); } catch {} } });

async function edtpOpenPlot(w, d, T, type, entries) {
  const [file] = LOGSIM.generateToStrings({ scenarios: ["position", "basic"], entries: entries || 40, seed: 5, start: "2026-01-15T10:00:00", rate: 1 });
  const f = await w.addFile(file.name, file.text, () => {});
  w.render();
  T.state.activeId = f.id;
  const node = w.createFilterNode(f.id, "text", edtpPattern);
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="' + type + '"]'), w);
  return { f, node };
}
const edtpSel = (d, w, id, v) => { const e = d.querySelector(id); e.value = v; e.dispatchEvent(new w.Event("change", { bubbles: true })); };

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot l. 2D scatter: click selects + rings the mark, no tab switch, no rebuild; double-click reveals in Table");
  await edtpOpenPlot(w, d, T, "scatter");
  edtpSel(d, w, "#plotXSelect", "0"); edtpSel(d, w, "#plotYSelectSingle", "1");
  const svg = d.querySelector("#plotSvg");
  assert(T.plotSelRingOps.length === 0 && !svg.querySelector("#plotSelRing"), "no ring while nothing is selected");
  const markOf = r => plotHitXY(plotHoverOfRow(T, r));
  const mark = plotHoverOfRow(T, 3);
  assert(mark, "row 3 has a mark");
  assert(svg.querySelectorAll(".plot-mark").length === 0, "the marks are canvas ops, not SVG elements");
  const entry = T.extractRowsData[3].entry;
  const clickRow = r => { const p = markOf(r); fireClickAt(svg, w, p.x, p.y); };
  clickRow(3);
  assert(T.fhActiveTab === "plot" && T.state.selectedId === entry.id, "selected, still on Plot");
  assert(d.querySelector("#detailMessage").textContent === entry.message && !d.querySelector("#detailPanel").classList.contains("detail-strip-only"), "Entry detail shows the entry");
  const ring = T.plotSelRingOps[0];
  assert(T.plotSelRingOps.length === 1 && ring.kind === "ring" && ring.x === mark.px && ring.y === mark.py && ring.r > 4, "a ring op around the clicked mark");
  assert(d.querySelector("#plotMarksCanvas") && !d.querySelector("#plotMarksCanvas").classList.contains("hidden"), "the marks canvas is shown");

  clickRow(5);
  assert(T.plotSelRingOps.length === 1 && T.plotSelRingOps[0].x === plotHoverOfRow(T, 5).px, "the ring moves to the next clicked mark");

  w.renderPlotChart();
  assert(T.plotSelRingOps.length === 1 && T.plotSelRingOps[0].x === plotHoverOfRow(T, 5).px, "the ring is drawn again after a re-render (zoom, pan, ...)");
  w.applyFhView("table");
  assert(d.querySelectorAll("#extractBody tr.extract-current").length === 1 && d.querySelector("#extractBody tr.extract-current").dataset.extractEntryId === T.extractRowsData[5].entry.id, "Table shows the plot-selected entry as its current row");
  w.applyFhView("plot");
  assert(T.plotSelRingOps.length === 1, "Table -> Plot: the ring is there");

  fireDblClickAt(svg, w, markOf(2).x, markOf(2).y);
  assert(T.fhActiveTab === "table" && T.state.selectedId === T.extractRowsData[2].entry.id, "double-click: Table with row 2 selected");
  assert(d.querySelector('#extractBody td.cell-selected[data-row="2"]') && d.querySelector("#extractBody tr.extract-current"), "...its cells selected and the current row marked");
});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot m. the ring disappears when the selection is not plotted; a drag never selects");
  const { f } = await edtpOpenPlot(w, d, T, "scatter");
  edtpSel(d, w, "#plotXSelect", "0"); edtpSel(d, w, "#plotYSelectSingle", "1");
  const svg = d.querySelector("#plotSvg");
  fireClickAt(svg, w, plotHoverOfRow(T, 1).px, plotHoverOfRow(T, 1).py);
  assert(T.plotSelRingOps.length === 1, "sanity: ring shown");
  const other = f.entries.find(e => !/^Position update/.test(e.message));
  assert(other, "sanity: the file has an entry the pattern does not match");
  w.selectEntry(other.id);
  assert(T.state.selectedId === other.id && T.plotSelRingOps.length === 0, "selecting an entry that is not plotted removes the ring");
  w.applyFhView("filter"); w.applyFhView("plot");
  assert(T.plotSelRingOps.length === 0, "...and it stays gone after a tab switch");

  const m = plotHoverOfRow(T, 4);
  const before = T.state.selectedId;
  const cx = m.px, cy = m.py;
  svg.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, clientX: cx - 40, clientY: cy - 40, button: 0 }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: cx + 40, clientY: cy + 40 }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: cx + 40, clientY: cy + 40, button: 0 }));
  const trailing = plotHoverOfRow(T, 4);
  assert(T.plotZoom && trailing, "sanity: the zoomed view still shows mark 4 (the drag's trailing click lands on it)");
  fireClickAt(svg, w, trailing.px, trailing.py);
  assert(T.state.selectedId === before, "the click ending a rectangle drag does not select");
  fireClickAt(svg, w, trailing.px, trailing.py);
  assert(T.state.selectedId === T.extractRowsData[4].entry.id, "...while the next plain click on that mark does");
});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot n. bar and line charts: ring on the bar (rect) and on the point");
  await edtpOpenPlot(w, d, T, "bar");
  const svg = d.querySelector("#plotSvg");
  const bar = plotHoverOfRow(T, 2);
  assert(bar && bar.kind === "bar", "row 2 has a bar");
  fireClickAt(svg, w, bar.bx + bar.bw / 2, bar.by + bar.bh / 2);
  const rr = T.plotSelRingOps[0];
  assert(rr && rr.kind === "rectStroke" && rr.w > bar.bw && rr.h > bar.bh && T.fhActiveTab === "plot", "a larger rect around the bar, tab stays Plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="line"]'), w);
  assert(T.plotSelRingOps.length === 1 && T.plotSelRingOps[0].kind === "ring" && T.state.selectedId === T.extractRowsData[2].entry.id, "switching the chart type keeps the selection: ring on the line's point");
});

await withApp(async (w, d, T) => {
  section("entry-detail-table-plot o. 3D: click selects the nearest point, double-click reveals, drags and empty space do not select");
  await edtpOpenPlot(w, d, T, "3d", 12);
  edtpSel(d, w, "#plotXSelect", "0"); edtpSel(d, w, "#plotYSelectSingle", "1"); edtpSel(d, w, "#plotZSelect", "2");
  const canvas = d.querySelector("#plot3dCanvas");
  assert(T.plotHoverPoints.length > 3, "sanity: 3D points projected");
  const p = T.plotHoverPoints[2];
  const at = (type, x, y) => canvas.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  at("click", p.px + 2, p.py + 2); // no mousemove first: the click itself hit-tests
  assert(T.fhActiveTab === "plot" && T.state.selectedId === T.extractRowsData[p.rowIndex].entry.id, "click selects the nearest point's entry, tab stays Plot");
  assert(T.plotHoverPoints.filter(h => h.selected).length >= 1 && T.plotHoverPoints.find(h => h.selected).rowIndex === p.rowIndex, "the point is highlighted on the canvas (flagged selected)");
  assert(d.querySelector("#detailMessage").textContent === T.extractRowsData[p.rowIndex].entry.message, "Entry detail shows it");

  const sel = T.state.selectedId;
  at("click", -500, -500);
  assert(T.state.selectedId === sel, "a click on empty canvas space keeps the selection");
  // A rotate drag followed by its trailing click at another point does not select.
  const q = T.plotHoverPoints.find(h => h.rowIndex !== p.rowIndex);
  at("mousedown", q.px, q.py);
  w.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: q.px + 30, clientY: q.py }));
  w.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, clientX: q.px + 30, clientY: q.py, button: 0 }));
  const q2 = T.plotHoverPoints.find(h => h.rowIndex === q.rowIndex);
  at("click", q2.px, q2.py);
  assert(T.state.selectedId === sel, "the click ending a rotate drag does not select");

  at("dblclick", p.px, p.py);
  assert(T.fhActiveTab === "table" && T.state.selectedId === T.extractRowsData[p.rowIndex].entry.id, "double-click reveals the entry in the Table");
});
