// GROUP 349 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 349 — Editor as the Context view of a plain-text root
   (docs/ui-and-views.md "Text files"; virtualized,
   so the DOM holds only the rows near the viewport — the assertions walk the
   line model (T.editorView) and scroll the window where they need more)
   ============================================================ */
group(349);
if (groupSelected()) {
  const sim = (format, entries, seed) => LOGSIM.generateToStrings({ format, entries, seed })[0];
  const txt349 = sim("plain", 150, 7);
  const json349 = sim("jsondoc", 12, 3);
  const xml349 = sim("xmldoc", 8, 3);
  const log349 = sim("default", 60, 2);
  const byName = (T, name) => Object.values(T.state.nodes).find(n => n.type === "file" && n.name === name);
  const addText = async (w, name, text) => { await w.loadFileDescriptors([{ file: new w.File([text], name), handle: null }]); };
  const LH = 19;
  const lines = d => [...d.querySelectorAll("#textEditor .itv-line")];
  const rowOf = (d, ts) => d.querySelector('#textEditor .itv-line[data-n="' + ts + '"]');
  const filterOn = (w, T, rootId, value) => { const f = w.createFilterNode(rootId, "text", value); T.state.activeId = f.id; w.render(); return f; };
  const collapseAll = (w, T) => { T.editorView.folds.forEach(f => { f.collapsed = true; }); w.rebuildEditorVisible(); w.editorRebuildTops(); w.editorRender(true); };
  const scrollTo = (w, d, y) => { d.querySelector("#highlightBody").scrollTop = y; w.editorRender(false); };
  // Visits the editor window at every viewport-sized step through the file.
  const walkWindows = (w, d, fn) => {
    const total = w.editorTopOfPos(w.editorVisibleCount()) + 22;
    for (let y = 0; y < total; y += 380) { scrollTo(w, d, y); fn(); }
    scrollTo(w, d, 0);
  };

  await withApp(async (w, d, T) => {
    section("349a. A .txt/.json/.xml root renders the editor as its Context view: the file's lines (windowed), folds and syntax colours for JSON/XML");
    await addText(w, "notes.txt", txt349.text);
    const txt = byName(T, "notes.txt");
    T.state.activeId = txt.id; w.render();
    assert(T.fhActiveTab === "highlight", "a plain-text file node with no remembered view lands on Context, got " + T.fhActiveTab);
    const wrap = d.querySelector("#highlightWrap");
    assert(wrap.classList.contains("text-mode"), "#highlightWrap carries text-mode");
    const ev = T.editorView;
    assert(ev.n === txt.entries.length && ev.n > 100 && ev.vis === null, "the model holds every file line (" + ev.n + ")");
    const rows = lines(d);
    assert(rows.length > 20 && rows.length < ev.n, "only a window of the lines is in the DOM (" + rows.length + " of " + ev.n + ")");
    walkWindows(w, d, () => {
      assert(lines(d).every(l => l.dataset.n === String(txt.entries[+l.dataset.line].ts) && l.textContent === (txt.entries[+l.dataset.line].message || "")),
        "every rendered row shows its line: number (data-n = entry ts) and the text verbatim");
    });
    assert(ev.folds.length === 0 && !d.querySelector("#textEditor .itv-fold-toggle"), "a .txt has no folds");
    assert(!d.querySelector("#highlightBody .log-row"), "no log rows in the Context body of a text root");
    const bar = d.querySelector("#highlightHeader .text-header-bar");
    assert(bar && bar.querySelector(".text-hb-name").textContent === "notes.txt", "the shared header bar names the file under the toolbar");
    assert(/\.itv-line\{[^}]*padding-left:var\(--text-gutter-w\)[^}]*height:var\(--text-row-h\)/.test(html) && /\.itv-line::before\{[^}]*width:var\(--text-num-w\)/.test(html) &&
      /\.itv-fold-toggle\{[^}]*left:var\(--text-num-w\)[^}]*width:var\(--text-fold-w\)/.test(html), "editor lines/numbers/fold toggles use the --text-* gutter variables that Filtered's rows use");

    await addText(w, "orders.json", json349.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    assert(T.fhActiveTab === "highlight" && ev.n === js.entries.length && js.textLayout === "pretty", "pretty JSON: the whole pretty-printed text, " + ev.n + " lines");
    assert(ev.folds.length > 5, "the fold list has the file's blocks (" + ev.folds.length + ")");
    const open = lines(d).filter(l => l.querySelector(".itv-fold-toggle"));
    assert(open.length > 2 && lines(d).every(l => !!l.querySelector(".itv-fold-toggle") === (ev.foldIdAt[+l.dataset.line] >= 0)), "exactly the fold-opening lines carry the toggle (" + open.length + " in the window)");
    assert(!!d.querySelector("#textEditor .tok-key") && !!d.querySelector("#textEditor .tok-string"), "JSON tokens are highlighted");
    assert(d.querySelector("#highlightHeader .text-hb-name").textContent === "orders.json", "header bar: file name");
    const tgRow = open[1], line0 = +tgRow.dataset.line, fi = ev.foldIdAt[line0];
    tgRow.querySelector(".itv-fold-toggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    assert(ev.folds[fi].collapsed && ev.vis !== null, "clicking a toggle collapses its fold in the model");
    const rowAfter = rowOf(d, js.entries[line0].ts);
    assert(rowAfter.classList.contains("collapsed") && rowAfter.querySelector(".itv-fold-toggle").textContent === "▸", "…the row shows the folded glyph and the ellipsis marker");
    assert(!rowOf(d, js.entries[line0 + 1].ts), "…and the lines the fold hides are gone from the DOM");
    rowAfter.querySelector(".itv-fold-toggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    assert(!ev.folds[fi].collapsed && ev.vis === null && !!rowOf(d, js.entries[line0 + 1].ts), "…and expands it again");

    await addText(w, "orders.xml", xml349.text);
    const xml = byName(T, "orders.xml");
    T.state.activeId = xml.id; w.render();
    assert(T.editorView.n === xml.entries.length && T.editorView.folds.length >= 1 && !!d.querySelector("#textEditor .tok-tag"), "XML: the <log> element folds, tags are coloured");
    assert(d.querySelector("#highlightHeader .text-hb-name").textContent === "orders.xml", "header bar: the XML name has no layout suffix");

    await addText(w, "app.log", log349.text);
    const log = byName(T, "app.log");
    T.state.activeId = log.id; w.render();
    assert(!d.querySelector("#highlightWrap").classList.contains("text-mode") && T.editorView.key === null && !d.querySelector("#textEditor .itv-line"), "a log root: no editor, Context stays the log view");
  });

  await withApp(async (w, d, T) => {
    section("349b. A filter node: result lines get the hit class, text matches are marked; both update in place");
    await addText(w, "notes.txt", txt349.text);
    const txt = byName(T, "notes.txt");
    const f1 = filterOn(w, T, txt.id, "Heartbeat");
    assert(T.fhActiveTab === "filter", "a filter node keeps landing on Filtered");
    w.applyFhView("highlight");
    const ids1 = new Set(w.getEntries(f1.id).map(e => e.id));
    const hitsSeen = () => { const seen = new Set(); walkWindows(w, d, () => { for (const l of lines(d)) if (l.classList.contains("hit")) seen.add(+l.dataset.line); }); return seen; };
    const seen1 = hitsSeen();
    assert(ids1.size > 3 && T.editorView.hitIds.size === ids1.size && seen1.size === ids1.size, "every result line is a .hit once rendered (" + seen1.size + " of " + ids1.size + ")");
    assert([...seen1].every(i => ids1.has(txt.entries[i].id)), "only result lines are hits");
    let marks = 0, stray = 0;
    walkWindows(w, d, () => {
      for (const l of lines(d)) {
        const ms = [...l.querySelectorAll(".text-match-mark")];
        if (l.classList.contains("hit")) marks += ms.filter(m => m.textContent === "Heartbeat").length; else stray += ms.length;
      }
    });
    assert(marks >= ids1.size && stray === 0, "the filter's text matches are marked in the hit lines (" + marks + "), none elsewhere");
    // Another node: hits/marks move; the mounted rows stay the same elements.
    const first = lines(d)[0], editor = d.querySelector("#textEditor");
    const f2 = filterOn(w, T, txt.id, "Sensor");
    w.applyFhView("highlight");
    const ids2 = new Set(w.getEntries(f2.id).map(e => e.id));
    assert(lines(d)[0] === first && [...d.querySelectorAll("#textEditor .text-match-mark")].every(m => m.textContent === "Sensor"), "same row elements (updated in place); the old marks are gone");
    const seen2 = hitsSeen();
    assert(ids2.size > 1 && seen2.size === ids2.size && [...seen2].every(i => ids2.has(txt.entries[i].id)), "switching to another filter re-marks the hits (" + seen2.size + ")");
    const first2 = lines(d)[0];
    T.state.activeId = txt.id; w.render();
    assert(lines(d)[0] === first2, "the file node: the same rows");
    assert(hitsSeen().size === 0 && !d.querySelector("#textEditor .text-match-mark"), "the file node itself: no hits, no marks");
    assert(d.querySelector("#textEditor") === editor, "the editor element itself never changes");
    const f3 = filterOn(w, T, txt.id, "Heartbeat");
    const f4 = w.createFilterNode(f3.id, "text", "e");
    T.state.activeId = f4.id; w.render(); w.applyFhView("highlight");
    const ids4 = new Set(w.getEntries(f4.id).map(e => e.id));
    assert(hitsSeen().size === ids4.size && ids4.size > 0, "a nested filter node marks its own (narrower) result (" + ids4.size + ")");
  });

  await withApp(async (w, d, T) => {
    section("349c. DOM identity: unrelated renders keep the rows (folds survive); layout/entries changes rebuild the model");
    await addText(w, "orders.json", json349.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    const editor = d.querySelector("#textEditor"), ev = T.editorView;
    const rows = lines(d);
    const tg = d.querySelectorAll("#textEditor .itv-fold-toggle")[2];
    tg.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    assert(ev.folds.filter(f => f.collapsed).length === 1, "one fold collapsed");
    const rows1 = lines(d);
    w.render(); w.render();
    w.selectEntry(js.entries[3].id);
    T.state.showNotes = !T.state.showNotes; w.render();
    w.renderHighlightView();
    const rows2 = lines(d);
    assert(rows2.length === rows1.length && rows2.every((l, i) => l === rows1[i]), "every mounted row survived unrelated renders (same identity)");
    assert(ev.folds.filter(f => f.collapsed).length === 1, "the collapsed fold stayed collapsed");
    const f = filterOn(w, T, js.id, "msg");
    w.applyFhView("highlight");
    T.state.activeId = js.id; w.render();
    assert(lines(d).every((l, i) => l === rows1[i]), "activating filters and going back keeps the rows");
    const key0 = ev.key;
    assert(await w.setTextLayout(js.id, "raw"), "switch to raw");
    T.state.activeId = js.id; w.render();
    assert(T.editorView.key !== key0 && T.editorView.n === 1 && lines(d).length === 1 && lines(d)[0] !== rows[0], "a layout change rebuilds the model (raw: one line)");
    assert(await w.setTextLayout(js.id, "pretty"), "back to pretty");
    assert(T.editorView.n === js.entries.length && T.editorView.n > 20 && lines(d)[0] !== rows[0] && T.editorView.folds.every(f => !f.collapsed), "…and back to the pretty lines (new model, folds reset)");
    assert(d.querySelector("#textEditor") === editor, "the editor element itself never changes");
  });

  await withApp(async (w, d, T) => {
    section("349d. Start tab: file node -> Context; filter nodes -> Filtered; remembered view and 'always Filtered' keep working; logs unchanged");
    await addText(w, "notes.txt", txt349.text);
    await addText(w, "app.log", log349.text);
    const txt = byName(T, "notes.txt"), log = byName(T, "app.log");
    T.state.activeId = txt.id; w.render();
    assert(T.fhActiveTab === "highlight", "text file node: Context");
    const f = filterOn(w, T, txt.id, "e");
    assert(T.fhActiveTab === "filter", "its filter node: Filtered");
    T.state.activeId = txt.id; w.render();
    w.applyFhView("filter");
    T.state.activeId = log.id; w.render();
    T.state.activeId = txt.id; w.render();
    assert(T.fhActiveTab === "filter", "a remembered Filtered view on the file node is restored, got " + T.fhActiveTab);
    w.applyFhView("highlight");
    T.state.activeId = log.id; w.render();
    T.state.activeId = txt.id; w.render();
    assert(T.fhActiveTab === "highlight", "…and a remembered Context view too");
    await addText(w, "b.txt", txt349.text);
    const b = byName(T, "b.txt");
    T.filterActivationView = "alwaysFiltered";
    T.state.activeId = log.id; w.render();
    T.state.activeId = b.id; w.render();
    await addText(w, "c.txt", txt349.text);
    const c = byName(T, "c.txt");
    T.state.activeId = c.id; w.render();
    w.applyFhView("filter");
    T.state.activeId = log.id; w.render();
    T.state.activeId = c.id; w.render();
    assert(T.fhActiveTab === "filter", "'always Filtered' lands a file node on Filtered, got " + T.fhActiveTab);
    T.filterActivationView = "rememberLast";
  });

  await withApp(async (w, d, T) => {
    section("349e. Reveal from Filtered: centred, flashed, unfolds only the folds that hide the line; Stacked scrolls the editor");
    await addText(w, "orders.json", json349.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    const f = filterOn(w, T, js.id, "msg");
    const results = w.getEntries(f.id);
    assert(results.length >= 6, "the filter has several results (" + results.length + ")");
    w.applyFhView("highlight");
    const ev = T.editorView;
    collapseAll(w, T);
    assert(ev.folds.filter(x => x.collapsed).length >= 2 && ev.vis !== null && ev.vis.length < 5, "all folds collapsed: the visible line list is just the top level (" + ev.vis.length + ")");
    w.applyFhView("filter");
    const target = results[results.length - 2], idx = js.entries.findIndex(e => e.id === target.id);
    const chain = []; for (let g = ev.lineParent[idx]; g >= 0; g = ev.folds[g].parent) chain.push(g);
    assert(chain.length >= 2 && chain.every(g => ev.folds[g].collapsed), "the target line sits inside nested collapsed folds (" + chain.length + ")");
    const others = ev.folds.filter((x, i) => !chain.includes(i) && x.collapsed);
    w.revealInHighlightView(target, null, null);
    assert(T.fhActiveTab === "highlight", "reveal switches to Context");
    assert(chain.every(g => !ev.folds[g].collapsed), "every fold above the line is open");
    assert(others.length > 2 && others.every(x => x.collapsed), "unrelated folds stay collapsed (" + others.length + ")");
    const body = d.querySelector("#highlightBody");
    const el0 = rowOf(d, target.ts);
    assert(!!el0, "the revealed line is mounted");
    const expected = Math.max(0, w.editorRowScrollTop(w.editorPosOf(idx)) - 400 / 2 + LH / 2);
    assert(Math.abs(body.scrollTop - expected) <= 1, "the line is centred in the viewport: scrollTop " + body.scrollTop + " vs " + expected);
    assert(el0.classList.contains("flash"), "the line flashes");
    assert(T.state.selectedId === target.id, "and becomes the selected entry");
    const opening = ev.folds.find(x => x.collapsed);
    assert(!!opening && !!rowOf(d, js.entries[opening.start].ts) === (ev.vis.includes(opening.start)), "folds that do not hide the line are still collapsed");

    w.applyFhView("stacked");
    scrollTo(w, d, 0);
    const other = results[results.length - 1], oi = js.entries.findIndex(e => e.id === other.id);
    w.revealInHighlightView(other, null, null);
    assert(T.fhLayout === "stacked" && body.scrollTop > 0 && !!rowOf(d, other.ts) && ev.vis.includes(oi), "Stacked: the editor scrolled to the revealed line (" + body.scrollTop + ")");
    assert(T.state.selectedId === other.id, "Stacked: the line is selected");
  });

  await withApp(async (w, d, T) => {
    section("349f. Tab switch keeps the top visible line at the same offset (file node both ways; filter node falls back to the selection, then the next hit)");
    await addText(w, "notes.txt", txt349.text);
    const txt = byName(T, "notes.txt");
    T.state.activeId = txt.id; w.render();
    const body = d.querySelector("#highlightBody"), tbody = d.querySelector("#tableBody");
    scrollTo(w, d, 40 * LH + 5);
    w.applyFhView("filter");
    assert(tbody.scrollTop === 40 * LH + 5, "Context -> Filtered on the file node: the same top line at the same offset, got " + tbody.scrollTop);
    tbody.scrollTop = 70 * LH + 3;
    w.renderVisibleRows();
    w.applyFhView("highlight");
    assert(body.scrollTop === 70 * LH + 3, "Filtered -> Context: back at that line, got " + body.scrollTop);
    const f = filterOn(w, T, txt.id, "Heartbeat");
    const res = w.getEntries(f.id);
    w.applyFhView("highlight");
    const k = res.findIndex((e, i) => i > 0 && i < res.length - 5 && res[i + 1].ts - e.ts > 1);
    assert(k >= 0, "two consecutive hits with a gap between them");
    const ts0 = res[k].ts; // the editor line ts0 + 1 (index ts0) is no hit
    T.state.selectedId = null;
    scrollTo(w, d, 2 + ts0 * LH);
    w.applyFhView("filter");
    assert(tbody.scrollTop === (k + 1) * LH + 2, "top line is no hit, nothing selected: the next hit below becomes the top row (row " + (k + 1) + "), got " + tbody.scrollTop);
    w.applyFhView("highlight");
    scrollTo(w, d, 2 + ts0 * LH);
    w.selectEntry(res[k + 3].id);
    scrollTo(w, d, 2 + ts0 * LH);
    w.applyFhView("filter");
    assert(tbody.scrollTop === (k + 3) * LH + 2, "the selected line (row " + (k + 3) + ") is the anchor when the top line is no hit, got " + tbody.scrollTop);
    tbody.scrollTop = 4 * LH + 2; w.renderVisibleRows();
    w.applyFhView("highlight");
    assert(body.scrollTop === (res[4].ts - 1) * LH + 2, "Filtered -> Context: the top hit row's line (" + res[4].ts + ") at the same offset, got " + body.scrollTop);
  });

  await withApp(async (w, d, T) => {
    section("349g. Pretty/Raw toggle in the Context toolbar (JSON only)");
    await addText(w, "orders.json", json349.text);
    await addText(w, "notes.txt", txt349.text);
    const js = byName(T, "orders.json"), txt = byName(T, "notes.txt");
    T.state.activeId = js.id; w.render();
    const group = d.querySelector("#ctxTextLayout").parentElement;
    const pretty = d.querySelector("#ctxLayoutPretty"), raw = d.querySelector("#ctxLayoutRaw");
    assert(group.style.display !== "none" && pretty.classList.contains("active") && !raw.classList.contains("active"), "a JSON root shows Pretty active");
    assert(!d.querySelector("#contextToolbar").classList.contains("hidden"), "the Context toolbar is shown on a file node of a text root");
    scrollTo(w, d, 30 * LH);
    raw.click();
    await waitFor(() => js.textLayout === "raw" && T.editorView.n === 1);
    assert(js.textLayout === "raw" && raw.classList.contains("active") && !pretty.classList.contains("active"), "Raw click: layout raw, button state follows");
    assert(d.querySelector("#highlightHeader .text-hb-name").textContent === "orders.json", "header bar: still just the file name");
    assert(lines(d).length === 1, "raw JSON is one line");
    pretty.click();
    await waitFor(() => js.textLayout === "pretty" && T.editorView.n > 20);
    assert(pretty.classList.contains("active") && T.editorView.n === js.entries.length, "Pretty click: back to the pretty lines");
    T.state.activeId = txt.id; w.render();
    assert(group.style.display === "none", "a .txt root hides the layout toggle");
    assert(d.querySelectorAll("#contextToolbar [data-log-only]").length >= 9 && /\[data-log-only\]\{[^}]*display:none/.test(html), "log-only Context controls (gap/expand/navigation) are hidden for text roots");
  });

  await withApp(async (w, d, T) => {
    section("349h. The Wrap toggle (state.wrapTextView) applies to the Context editor AND Filtered text rows, not to log wrapping");
    await addText(w, "notes.txt", txt349.text);
    const txt = byName(T, "notes.txt");
    T.state.activeId = txt.id; w.render();
    const editor = d.querySelector("#textEditor"), ev = T.editorView, key0 = ev.key;
    const btn = d.querySelector("#contextToolbar .toggle-wrap");
    assert(btn && !btn.classList.contains("active") && !T.state.wrapTextView && ev.tops === null && ev.cols === 0, "Wrap starts off (fixed-height rows)");
    btn.click();
    assert(T.state.wrapTextView === true && btn.classList.contains("active") && d.body.classList.contains("textview-wrap"), "the toggle sets state.wrapTextView and the body class");
    assert(T.state.wrapMessages === false, "the log message wrap is untouched");
    assert(ev.key === key0 && d.querySelector("#textEditor") === editor, "the model is not rebuilt");
    assert(ev.cols > 10 && ev.tops && ev.tops.length === ev.n + 1, "…but the rows get wrap-aware heights (" + ev.cols + " columns)");
    const longLine = txt.entries.findIndex(e => e.message.length > ev.cols + 5);
    assert(longLine >= 0 && ev.tops[longLine + 1] - ev.tops[longLine] >= 2 * LH, "a line longer than the columns is two or more rows tall");
    assert(ev.tops[ev.n] > ev.n * LH, "the content height grows with the wrapped lines");
    assert(/\.textview-wrap \.itv-line\{[^}]*white-space:pre-wrap/.test(html), "CSS: wrapped editor lines are pre-wrap");
    assert(/\.textview-wrap #tableWrap\.text-mode \.log-row\.text-row[^{]*\{[^}]*height:auto/.test(html) || /\.textview-wrap[^{]*\.text-row[^{]*\{[^}]*white-space:pre-wrap/.test(html), "CSS: wrapped Filtered text rows are pre-wrap too");
    filterOn(w, T, txt.id, "e");
    assert(T.state.wrapTextView === true && d.body.classList.contains("textview-wrap"), "still wrapping in Filtered");
    const fbtn = d.querySelector("#filteredToolbar .toggle-wrap");
    assert(fbtn && fbtn.classList.contains("active"), "the Filtered toolbar's Wrap button shows the same state");
    fbtn.click();
    assert(T.state.wrapTextView === false && !d.body.classList.contains("textview-wrap"), "toggling it in Filtered turns the editor wrap off as well");
    w.applyFhView("highlight");
    assert(T.editorView.tops === null && T.editorView.cols === 0, "back to fixed-height rows in the editor");
    await addText(w, "app.log", log349.text);
    T.state.activeId = byName(T, "app.log").id; w.render();
    d.querySelector("#filteredToolbar .toggle-wrap").click();
    assert(T.state.wrapMessages === true && T.state.wrapTextView === false, "on a log root the button toggles the log message wrap");
  });

  await withApp(async (w, d, T) => {
    section("349i. Nav history anchors the editor by line number; a minimap click (selectHighlightEntry) scrolls the editor");
    await addText(w, "notes.txt", txt349.text);
    const txt = byName(T, "notes.txt");
    T.state.activeId = txt.id; w.render();
    const body = d.querySelector("#highlightBody");
    scrollTo(w, d, 50 * LH + 4);
    const wp = w.captureNavWaypoint();
    assert(wp.contextAnchor && wp.contextAnchor.line === txt.entries[50].ts && wp.contextAnchor.offset === -4 && wp.contextAnchor.id === txt.entries[50].id, "the waypoint anchors the top editor line by its line number, got " + JSON.stringify(wp.contextAnchor));
    scrollTo(w, d, 0);
    w.applyNavWaypoint(wp);
    assert(body.scrollTop === 50 * LH + 4, "applying the waypoint scrolls the editor back, got " + body.scrollTop);
    scrollTo(w, d, 0);
    const e = txt.entries[120];
    w.selectHighlightEntry(e.id, { scroll: true, center: true, index: 120 });
    assert(Math.abs(body.scrollTop - (2 + 120 * LH - 200 + LH / 2)) <= 1 && T.state.selectedId === e.id && !!rowOf(d, e.ts), "selectHighlightEntry (minimap click/drag) centres the line in the editor, got " + body.scrollTop);
  });
}
