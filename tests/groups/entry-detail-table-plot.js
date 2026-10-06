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
   persisted as one value under philogg-lower-tab. The plot's own click
   behaviour is unchanged in this step (GROUP 159).
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
