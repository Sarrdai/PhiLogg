// GROUP 348 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 348 — Filtered text mode + shared text header bar
   Origin: 2026-10-01, person-requested (docs/archive/ui-concept-text-files.md, Step 2
   of docs/ui-and-views.md "Text files"). When the ACTIVE node's root is
   a plain-text file (not "every loaded file is" — a mixed session keeps the
   log table for log roots) the Filtered view becomes an editor-like listing:
   .text-row rows with no level stripe (separators as an inset shadow), TEXT_ROW_HEIGHT (19px,
   scaled by logTextScale, used by the virtualization), a right-aligned line
   number, an empty fold slot and the message (gutter widths --text-num-w /
   --text-fold-w shared with the Context editor), and a header bar ("LINE",
   file name only — the layout shows on the Pretty/Raw toggle) instead of
   the table header.
   Sample data: tools/log-sim (plain, jsondoc, xmldoc, default).
   ============================================================ */
group(348);
if (groupSelected()) {
  const PT348 = "fmt-plaintext";
  const sim = (format, entries, seed) => LOGSIM.generateToStrings({ format, entries, seed })[0];
  const txt348 = sim("plain", 120, 7);
  const json348 = sim("jsondoc", 8, 3);
  const xml348 = sim("xmldoc", 6, 3);
  const log348 = sim("default", 60, 2);
  const byName = (T, name) => Object.values(T.state.nodes).find(n => n.type === "file" && n.name === name);
  const addText = async (w, name, text) => { await w.loadFileDescriptors([{ file: new w.File([text], name), handle: null }]); };
  const filterOn = (w, T, rootId, value) => { const f = w.createFilterNode(rootId, "text", value); T.state.activeId = f.id; w.render(); return f; };

  await withApp(async (w, d, T) => {
    section("348a. A filter on a plain-text file: text-mode class, row height, gutter, header bar");
    await addText(w, "notes.txt", txt348.text);
    const root = byName(T, "notes.txt");
    const f = filterOn(w, T, root.id, "e");
    const wrap = d.querySelector("#tableWrap");
    assert(wrap.classList.contains("text-mode") && T.filteredTextMode === true, "#tableWrap carries text-mode, got " + wrap.className);
    assert(T.TEXT_ROW_HEIGHT === 19, "TEXT_ROW_HEIGHT is 19px at 100%");
    const rows = [...d.querySelectorAll("#tableRows .log-row")];
    const matches = w.getEntries(f.id).length;
    assert(rows.length > 10 && rows.every(r => r.classList.contains("text-row") && !r.classList.contains("row-grid")), "every rendered row is a .text-row, not a .row-grid log row (" + rows.length + ")");
    assert(rows.every(r => r.style.height === "19px"), "every row is TEXT_ROW_HEIGHT (19px) tall");
    assert(!d.querySelector("#tableRows .col-bar") && !d.querySelector("#tableRows .col-level") && !d.querySelector("#tableRows .col-delta"), "no level stripe, level or delta cell");
    assert(!/\blvl-/.test(rows.map(r => r.className).join(" ")), "no level tint class");
    const e0 = w.getEntries(f.id)[0];
    const r0 = rows[0];
    assert(r0.dataset.entryId === e0.id && r0.querySelector(".col-time").textContent === String(e0.ts), "number cell = the line number of the file (" + e0.ts + ")");
    assert(r0.children.length === 3 && r0.children[1].classList.contains("col-fold") && r0.children[1].textContent === "", "gutter: number, an empty fold slot, then the message");
    assert(r0.children[2].classList.contains("col-msg") && r0.children[2].classList.contains("plaintext") && r0.children[2].dataset.col === "message", "the message cell keeps the plaintext (white-space:pre) class");
    assert(d.querySelector("#tableSpacer").style.height === (matches * 19 + 22) + "px", "spacer height = rows * TEXT_ROW_HEIGHT + pad, got " + d.querySelector("#tableSpacer").style.height);
    assert(rows.length === Math.ceil(400 / 19) + 2 * T.BUFFER_ROWS || rows.length === matches, "the rendered window is sized by TEXT_ROW_HEIGHT (" + rows.length + " of " + matches + ")");
    // Header bar replaces the table header.
    const bar = d.querySelector("#tableHeader .text-header-bar");
    assert(bar && bar.querySelector(".text-hb-line").textContent === "Line", 'header bar: "Line" over the number column');
    assert(bar.querySelector(".text-hb-name").textContent === "notes.txt", "header bar: the file name, no layout suffix for a .txt, got " + bar.querySelector(".text-hb-name").textContent);
    assert(bar.children.length === 3 && bar.children[1].classList.contains("text-hb-fold"), "header bar: LINE, fold slot, name");
    assert(/#tableWrap\.text-mode #tableHeader \.row-grid\{display:none;\}/.test(html) && /#tableWrap\.text-mode #tableHeader \.text-header-bar\{display:grid;\}/.test(html), "CSS: text mode hides the log header grid and shows the bar");
    // Shared gutter widths: JS constants == CSS vars.
    const cs = d.documentElement.style;
    assert(cs.getPropertyValue("--text-num-w") === T.TEXT_NUM_W + "px" && cs.getPropertyValue("--text-fold-w") === T.TEXT_FOLD_W + "px", "--text-num-w/--text-fold-w come from TEXT_NUM_W/TEXT_FOLD_W");
    assert(/\.text-header-bar\{[^}]*grid-template-columns:var\(--text-num-w\) var\(--text-fold-w\) 1fr/.test(html) && /\.log-row\.text-row\{[^}]*grid-template-columns:var\(--text-num-w\) var\(--text-fold-w\) 1fr/.test(html), "rows and header bar use the same gutter columns");
    // Row separators (person-requested 2026-10-01): Filtered text rows get the
    // log view's separator line as a zero-specificity inset shadow (no border,
    // which would eat 1px of TEXT_ROW_HEIGHT); the Context editor lines don't.
    assert(/:where\(\.log-row\.text-row\)\{box-shadow:inset 0 -1px 0 var\(--border-soft\);\}/.test(html), "Filtered text rows: separator as a :where() inset shadow");
    assert(/\.log-row\.text-row\{[^}]*border-bottom:none/.test(html), "Filtered text rows: no border (keeps the 19px line grid)");
    assert(!/\.itv-line[^{]*\{[^}]*(border-bottom|box-shadow:inset 0 -1px)/.test(html), "Context editor lines: no separator");
    // Toolbar parity: both toolbar rows have the same fixed height.
    const tbH = id => (new RegExp("#" + id + "\\{[^}]*height:(\\d+)px").exec(html) || [])[1];
    assert(tbH("filteredToolbar") === "36" && tbH("contextToolbar") === "36", "Filtered and Context toolbar rows are both 36px, got " + tbH("filteredToolbar") + "/" + tbH("contextToolbar"));
  });

  await withApp(async (w, d, T) => {
    section("348b. Header bar shows only the file name (no layout suffix, person-requested 2026-10-01)");
    await addText(w, "orders.json", json348.text);
    await addText(w, "orders.xml", xml348.text);
    const js = byName(T, "orders.json"), xml = byName(T, "orders.xml");
    const name = () => d.querySelector("#tableHeader .text-hb-name").textContent;
    filterOn(w, T, js.id, '"');
    assert(name() === "orders.json", "pretty JSON: just the name, got " + name());
    assert(await w.setTextLayout(js.id, "raw"), "layout switched to raw");
    T.state.activeId = js.id; w.render();
    assert(name() === "orders.json", "raw JSON: just the name, got " + name());
    filterOn(w, T, xml.id, "<");
    assert(name() === "orders.xml", "XML: just the name, got " + name());
    const nameEl = d.querySelector("#tableHeader .text-hb-name");
    w.render();
    assert(d.querySelector("#tableHeader .text-hb-name") === nameEl, "the bar is only rewritten when its content changes");
    assert(typeof w.renderTextHeaderBar === "function", "renderTextHeaderBar is a reusable component (barEl, root)");
  });

  await withApp(async (w, d, T) => {
    section("348c. A log root is unchanged; a mixed session switches mode with the active node's root");
    await addText(w, "app.log", log348.text);
    await addText(w, "notes.txt", txt348.text);
    const log = byName(T, "app.log"), txt = byName(T, "notes.txt");
    assert(T.state.rootIds.length === 2 && !w.allRootsPlainText(), "mixed session: not all roots are plain text");
    const f1 = filterOn(w, T, log.id, "INFO");
    const wrap = d.querySelector("#tableWrap");
    assert(!wrap.classList.contains("text-mode") && T.filteredTextMode === false, "log root: no text mode in a mixed session");
    const lrows = [...d.querySelectorAll("#tableRows .log-row")];
    assert(lrows.length > 5 && lrows.every(r => r.classList.contains("row-grid") && !r.classList.contains("text-row") && r.style.height === "28px"), "log rows keep the row-grid markup and ROW_HEIGHT (28px)");
    assert(!!lrows[0].querySelector(".col-bar") && !!lrows[0].querySelector(".col-level .level-badge"), "log rows keep the level stripe and badge");
    assert(d.querySelector("#tableHeader .row-grid .th-sortable") && d.querySelector("#tableHeader .row-grid").textContent.includes("Level"), "the log table header (Time/Level/...) is still the header");
    assert(d.querySelector("#tableSpacer").style.height === (w.getEntries(f1.id).length * 28 + 22) + "px", "spacer uses ROW_HEIGHT for the log root");
    // Switch to the text file's filter: text mode on.
    const f2 = filterOn(w, T, txt.id, "e");
    assert(wrap.classList.contains("text-mode") && d.querySelector("#tableRows .text-row") && !d.querySelector("#tableRows .col-bar"), "active node on the text root: text mode");
    assert(d.querySelector("#tableHeader .text-hb-name").textContent === "notes.txt", "header bar names the active root");
    assert(d.querySelector("#tableSpacer").style.height === (w.getEntries(f2.id).length * 19 + 22) + "px", "spacer uses TEXT_ROW_HEIGHT");
    // Back to the log root's filter, then its file node.
    T.state.activeId = f1.id; w.render();
    assert(!wrap.classList.contains("text-mode") && d.querySelector("#tableRows .row-grid") && !d.querySelector("#tableRows .text-row"), "back on the log root: log rendering again");
    assert(!d.body.classList.contains("text-root"), "log root: Entry detail panel shown (no body.text-root)");
    T.state.activeId = txt.id; w.render();
    assert(wrap.classList.contains("text-mode") && d.querySelector("#tableRows .text-row"), "the text file node itself: text mode");
    // No Entry detail panel for plain-text files (person-requested 2026-10-01).
    assert(d.body.classList.contains("text-root"), "text root: body.text-root hides the Entry detail panel");
    assert(/body\.text-root :is\(#detailPanel, #detailResizer\)\{display:none !important;\}/.test(html), "CSS: body.text-root hides #detailPanel and #detailResizer");
    T.state.activeId = log.id; w.render();
    assert(!wrap.classList.contains("text-mode") && d.querySelector("#tableRows .row-grid"), "the log file node: log mode");
    assert(!d.body.classList.contains("text-root"), "back on the log root: Entry detail panel shown again");
  });

  await withApp(async (w, d, T) => {
    section("348d. Selection, bookmarks, notes, multiselect and the context menu keep working on text rows");
    await addText(w, "notes.txt", txt348.text);
    const root = byName(T, "notes.txt");
    const f = filterOn(w, T, root.id, "e");
    const ids = w.getEntries(f.id).map(e => e.id);
    const rowOf = id => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');
    fireClick(rowOf(ids[1]), w);
    assert(T.state.selectedId === ids[1] && rowOf(ids[1]).classList.contains("selected"), "click selects a text row");
    w.toggleBookmark(ids[1]);
    assert(!!rowOf(ids[1]).querySelector(".col-bookmark-icon"), "a bookmarked text row shows the bookmark icon");
    T.state.notes.set(ids[2], "check this line"); T.state.showNotes = true; w.render();
    assert(!!d.querySelector('#tableRows .note-row[data-entry-id="' + ids[2] + '"]'), "a note row renders under its text row");
    const spacerH = parseInt(d.querySelector("#tableSpacer").style.height, 10);
    assert(spacerH > ids.length * 19 + 22, "a note row adds its own height to the spacer (offsets path), got " + spacerH);
    const row2 = rowOf(ids[2]);
    assert(row2.style.height === "19px", "the row itself stays TEXT_ROW_HEIGHT with a note below");
    fireClick(rowOf(ids[3]), w);
    rowOf(ids[4]).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    assert(T.state.logMultiSelect.has(ids[4]) && rowOf(ids[4]).classList.contains("row-multi-selected"), "Ctrl+click multi-selects a text row");
    fireContextMenu(rowOf(ids[3]), w);
    const menu = d.querySelector("#contextMenu");
    assert(menu && !menu.classList.contains("hidden") && menu.textContent.length > 0, "the row context menu opens on a text row");
    const selEntry = T.entryIndex[T.state.selectedId];
    assert(selEntry, "a text line is selected");
    assert(d.body.classList.contains("text-root"), "no Entry detail panel on a text file (body.text-root)");
  });

  await withApp(async (w, d, T) => {
    section("348e. Virtualization and scroll math use TEXT_ROW_HEIGHT, scaled by the log text size");
    await addText(w, "notes.txt", txt348.text);
    const root = byName(T, "notes.txt");
    const f = filterOn(w, T, root.id, "e");
    const body = d.querySelector("#tableBody");
    body.scrollTop = 60 * 19;
    w.renderVisibleRows();
    const first = d.querySelector("#tableRows .log-row");
    const ents = w.getEntries(f.id);
    assert(first.dataset.entryId === ents[60 - T.BUFFER_ROWS].id, "scrolled to 60*19px: the window starts BUFFER_ROWS above entry 60");
    assert(d.querySelector("#tableRows").style.top === ((60 - T.BUFFER_ROWS) * 19) + "px", "the window's top offset is index * TEXT_ROW_HEIGHT, got " + d.querySelector("#tableRows").style.top);
    w.scrollToIndex(100);
    assert(Math.abs(body.scrollTop - (100 * 19 + 19 - 400)) <= 1, "scrollToIndex positions by TEXT_ROW_HEIGHT, got " + body.scrollTop);
    w.applyLogTextScale(150);
    assert(T.TEXT_ROW_HEIGHT === Math.round(19 * 1.5) && T.ROW_HEIGHT === 42, "TEXT_ROW_HEIGHT scales with the log text size like ROW_HEIGHT (" + T.TEXT_ROW_HEIGHT + ")");
    const sr = d.querySelector("#tableRows .log-row");
    assert(sr.style.height === T.TEXT_ROW_HEIGHT + "px" && d.documentElement.style.getPropertyValue("--text-row-h") === T.TEXT_ROW_HEIGHT + "px", "rows and --text-row-h follow the scale");
    w.applyLogTextScale(100);
  });
}
