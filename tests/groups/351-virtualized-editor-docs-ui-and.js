// GROUP 351 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 351 — Virtualized editor (docs/ui-and-views.md "Text files"
   Step 5): visible line list, windowed rendering, copy from the line model,
   reveal / find / marks on a large file
   ============================================================ */
group(351);
if (groupSelected()) {
  const sim = (format, entries, seed) => LOGSIM.generateToStrings({ format, entries, seed })[0];
  const big351 = sim("plain", 30000, 5);
  const json351 = sim("jsondoc", 600, 3);
  const byName = (T, name) => Object.values(T.state.nodes).find(n => n.type === "file" && n.name === name);
  const addText = async (w, name, text) => { await w.loadFileDescriptors([{ file: new w.File([text], name), handle: null }]); };
  const LH = 19;
  const lines = d => [...d.querySelectorAll("#textEditor .itv-line")];
  const rowOf = (d, ts) => d.querySelector('#textEditor .itv-line[data-n="' + ts + '"]');
  const scrollTo = (w, d, y) => { d.querySelector("#highlightBody").scrollTop = y; w.editorRender(false); };
  const collapseAll = (w, T) => { T.editorView.folds.forEach(f => { f.collapsed = true; }); w.rebuildEditorVisible(); w.editorRebuildTops(); w.editorRender(true); };
  const heightsOf = d => parseFloat(d.querySelector("#teTop").style.height) + parseFloat(d.querySelector("#teBottom").style.height);
  const copyText = (w, d) => {
    let got = null;
    const ev = new w.Event("copy", { bubbles: true, cancelable: true });
    ev.clipboardData = { setData(type, v) { got = v; } };
    d.dispatchEvent(ev);
    return { text: got, prevented: ev.defaultPrevented };
  };
  const search351 = async (w, d, q) => { const input = d.getElementById("findInput"); input.value = q; fireInput(input, w); await sleep(400); };
  const textNodeOf = row => { const wk = d => d.ownerDocument.createTreeWalker(row, 4); const t = wk(row).nextNode(); return t; };

  await withApp(async (w, d, T) => {
    section("351a. The visible line list: nested folds collapse/expand the list, positions map back to lines");
    await addText(w, "orders.json", json351.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    const ev = T.editorView, n = ev.n;
    assert(n > 3000 && ev.folds.length > 500 && ev.vis === null && w.editorVisibleCount() === n, "a 600-entry document: " + n + " lines, " + ev.folds.length + " folds, all visible (vis is null)");
    // Two nested folds: an entry object and a block inside it.
    const outer = ev.folds.findIndex((f, i) => f.parent >= 0 && ev.folds.some(g => g.parent === i));
    const inner = ev.folds.findIndex(g => g.parent === outer);
    const fo = ev.folds[outer], fi = ev.folds[inner];
    assert(outer >= 0 && inner >= 0 && fo.start < fi.start && fi.end < fo.end, "found a nested pair (" + fo.start + "-" + fo.end + " > " + fi.start + "-" + fi.end + ")");
    w.toggleEditorFold(inner);
    assert(ev.vis && ev.vis.length === n - (fi.end - fi.start), "collapsing the inner fold hides lines start+1..end (" + (n - ev.vis.length) + ")");
    assert(ev.vis.includes(fi.start) && !ev.vis.includes(fi.start + 1) && !ev.vis.includes(fi.end) && ev.vis.includes(fi.end + 1), "the opener stays, the body and closing line go");
    assert(w.editorPosOf(fi.start + 1) === w.editorPosOf(fi.start) && ev.vis[w.editorPosOf(fi.start + 1)] === fi.start, "a hidden line maps to its fold's opener");
    w.toggleEditorFold(outer);
    assert(ev.vis.length === n - (fo.end - fo.start), "collapsing the outer fold hides its whole range, the collapsed inner fold included (" + (n - ev.vis.length) + ")");
    w.toggleEditorFold(inner); // toggled while hidden: only its flag flips
    assert(ev.vis.length === n - (fo.end - fo.start) && !fi.collapsed, "toggling the hidden inner fold changes nothing visible");
    w.toggleEditorFold(outer);
    assert(ev.vis === null && w.editorVisibleCount() === n, "expanding the outer fold shows everything again (inner was re-opened)");
    // Every line parent chain is consistent: a line's parent fold contains it.
    let bad = 0;
    for (let i = 0; i < n; i += 7) { const g = ev.lineParent[i]; if (g >= 0 && !(ev.folds[g].start < i && i <= ev.folds[g].end)) bad++; }
    assert(bad === 0, "lineParent points at the innermost fold containing each line");
    // Rendering slices the list: hidden lines are not rows.
    collapseAll(w, T);
    assert(ev.vis.length < 10 && lines(d).length === ev.vis.length, "all collapsed: the DOM holds just the top-level rows (" + lines(d).length + ")");
  });

  await withApp(async (w, d, T) => {
    section("351b. Windowed rendering on a 30,000-line file: only about the viewport (plus a screen each side) is in the DOM; scrolling reuses rows");
    await addText(w, "big.txt", big351.text);
    const txt = byName(T, "big.txt");
    T.state.activeId = txt.id; w.render();
    const ev = T.editorView, n = ev.n, body = d.querySelector("#highlightBody");
    assert(n >= 30000, "the model has all " + n + " lines");
    let rows = lines(d);
    assert(rows.length > 40 && rows.length < 120, "only ~3 screens of rows are mounted (" + rows.length + " of " + n + ")");
    assert(Math.abs(heightsOf(d) + rows.length * LH - n * LH) < 1, "spacers + rows add up to the full content height (" + n * LH + ")");
    assert(rows[0].dataset.line === "0" && d.querySelector("#teTop").style.height === "0px", "at the top the first row is line 1 and the top spacer is empty");
    // Scroll by a few rows: the rows that stay are the same elements.
    const keep = rows[30];
    scrollTo(w, d, 40 * LH);
    rows = lines(d);
    assert(rows.includes(keep) && rows.length < 120, "a small scroll keeps the rows still in range (same elements)");
    assert(rows.every((r, i) => i === 0 || +r.dataset.line === +rows[i - 1].dataset.line + 1), "mounted rows are consecutive lines");
    // Scroll to the middle: a completely new window around line 15000.
    scrollTo(w, d, 15000 * LH);
    rows = lines(d);
    const first = +rows[0].dataset.line, last = +rows[rows.length - 1].dataset.line;
    assert(first <= 15000 && last >= 15000 + 20 && rows.length < 120 && first > 14000, "the window follows the scroll position (" + first + ".." + last + ")");
    assert(Math.abs(parseFloat(d.querySelector("#teTop").style.height) - first * LH) < 1 && Math.abs(heightsOf(d) + rows.length * LH - n * LH) < 1, "spacers follow");
    // Then the bottom.
    scrollTo(w, d, n * LH);
    rows = lines(d);
    assert(+rows[rows.length - 1].dataset.line === n - 1 && rows.length < 120, "at the end the last line is mounted (" + rows.length + " rows)");
    // The scroll listener path: a scroll event renders the window (one frame later).
    scrollTo(w, d, 0);
    body.scrollTop = 9000 * LH;
    body.dispatchEvent(new w.Event("scroll"));
    await waitFor(() => lines(d).some(r => r.dataset.line === "9000"));
    assert(lines(d).some(r => r.dataset.line === "9000"), "a scroll event renders the new window on the next frame");
  });

  await withApp(async (w, d, T) => {
    section("351c. Copy from the line model: a selection across rendered and unrendered lines, partial first/last, folded lines included");
    await addText(w, "big.txt", big351.text);
    const txt = byName(T, "big.txt");
    T.state.activeId = txt.id; w.render();
    const ev = T.editorView, es = txt.entries, sel = w.getSelection();
    const tn = line => textNodeOf(d.querySelector('#textEditor .itv-line[data-line="' + line + '"]'));
    // Anchor in line 5 (offset 3), focus in line 6 (offset 4): within the window.
    sel.setBaseAndExtent(tn(5), 3, tn(6), 4);
    let c = copyText(w, d);
    assert(c.prevented && c.text === es[5].message.slice(3) + "\n" + es[6].message.slice(0, 4), "a two-line selection copies the tail of the first and the head of the second line, got " + JSON.stringify(c.text));
    // Now scroll far away: the anchor row (selection endpoint) stays mounted, pinned.
    const anchorRow = d.querySelector('#textEditor .itv-line[data-line="5"]');
    scrollTo(w, d, 15000 * LH);
    assert(anchorRow.isConnected && anchorRow.classList.contains("itv-pinned") && anchorRow.style.position === "absolute", "a row holding a selection endpoint stays in the DOM, pinned, when it scrolls out of range");
    assert(!d.querySelector('#textEditor .itv-line[data-line="6"]') || d.querySelector('#textEditor .itv-line[data-line="6"]').classList.contains("itv-pinned"), "…while its unselected neighbours are unmounted");
    // Extend the selection to a row near line 15003 (offset 4): 15000 lines between are NOT in the DOM.
    const far = d.querySelector('#textEditor .itv-line[data-line="15003"]');
    sel.setBaseAndExtent(textNodeOf(anchorRow), 3, textNodeOf(far), 4);
    scrollTo(w, d, 15000 * LH + 40);
    c = copyText(w, d);
    const expected = [es[5].message.slice(3)].concat(es.slice(6, 15003).map(e => e.message), [es[15003].message.slice(0, 4)]).join("\n");
    assert(c.prevented && c.text === expected, "copy spans lines 6..15004 although only ~60 are rendered (" + (c.text || "").length + " chars, expected " + expected.length + ")");
    assert(c.text.split("\n").length === 15003 - 5 + 1, "one text line per file line");
    // Backwards selection (focus before anchor) gives the same text.
    sel.setBaseAndExtent(textNodeOf(far), 4, textNodeOf(anchorRow), 3);
    assert(copyText(w, d).text === expected, "a backwards selection copies the same text");
    // Dropping the selection releases the pinned row.
    sel.removeAllRanges();
    w.editorRender(true);
    assert(!anchorRow.isConnected && !d.querySelector(".itv-pinned"), "with no selection the pinned row is unmounted again");
    assert(copyText(w, d).prevented === false, "no selection: the copy event is left alone");
  });

  await withApp(async (w, d, T) => {
    section("351d. Copy: a selection across a collapsed fold includes the hidden lines in full");
    await addText(w, "orders.json", json351.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    const ev = T.editorView, es = js.entries, sel = w.getSelection();
    const f = ev.folds.find(x => x.start > 5 && x.end - x.start > 6);
    w.toggleEditorFold(ev.folds.indexOf(f));
    assert(!d.querySelector('#textEditor .itv-line[data-line="' + (f.start + 1) + '"]'), "the fold's body is not rendered");
    const a = d.querySelector('#textEditor .itv-line[data-line="' + (f.start - 1) + '"]'), b = d.querySelector('#textEditor .itv-line[data-line="' + (f.end + 1) + '"]');
    const tnode = row => { const wk = d.createTreeWalker(row, 4); let t; while ((t = wk.nextNode())) { if (!t.parentNode.closest(".itv-fold-toggle, .itv-fold-ellipsis")) return t; } };
    sel.setBaseAndExtent(tnode(a), 2, tnode(b), 5);
    const text = copyText(w, d).text;
    const exp = [es[f.start - 1].message.slice(2)].concat(es.slice(f.start, f.end + 1).map(e => e.message), [es[f.end + 1].message.slice(0, 5)]).join("\n");
    assert(text === exp && text.includes(es[f.start + 1].message.trim()), "the collapsed lines are part of the copied text (" + (f.end - f.start + 1) + " hidden/folded lines)");
    assert(!text.includes("▸") && !text.includes("lines"), "the fold toggle and the '… N lines' marker are not copied");
  });

  await withApp(async (w, d, T) => {
    section("351e. Reveal into a folded block of a large document: unfolds the chain, mounts and centres the line, others stay collapsed");
    await addText(w, "orders.json", json351.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    const ev = T.editorView;
    const f = w.createFilterNode(js.id, "text", "Position update");
    T.state.activeId = f.id; w.render(); w.applyFhView("filter");
    const results = w.getEntries(f.id);
    assert(results.length > 20, "many matches (" + results.length + ")");
    w.applyFhView("highlight");
    collapseAll(w, T);
    w.applyFhView("filter");
    const target = results[Math.floor(results.length * 0.8)], idx = js.entries.findIndex(e => e.id === target.id);
    const chain = []; for (let g = ev.lineParent[idx]; g >= 0; g = ev.folds[g].parent) chain.push(g);
    assert(chain.length >= 2 && ev.vis.length < 10, "the target (line " + target.ts + ") is hidden in " + chain.length + " nested folds");
    w.revealInHighlightView(target, null, null);
    const row = rowOf(d, target.ts);
    assert(!!row && row.classList.contains("flash"), "the line is mounted and flashes");
    assert(chain.every(g => !ev.folds[g].collapsed), "the chain is open");
    assert(ev.folds.filter(x => x.collapsed).length > ev.folds.length - chain.length - 5, "nearly every other fold is still collapsed (" + ev.folds.filter(x => x.collapsed).length + " of " + ev.folds.length + ")");
    const body = d.querySelector("#highlightBody");
    assert(Math.abs(body.scrollTop - Math.max(0, w.editorRowScrollTop(w.editorPosOf(idx)) - 200 + LH / 2)) <= 1, "centred at " + body.scrollTop);
    assert(lines(d).length < 80, "still a small window (" + lines(d).length + " rows) for " + ev.n + " lines");
  });

  await withApp(async (w, d, T) => {
    section("351f. Find: stepping into an unrendered region mounts it, marks the match, unfolds; hit and find marks appear on newly rendered rows");
    const fb = d.createElement("script");
    fb.textContent = "window.__find = { get state() { return findState; } };";
    d.body.appendChild(fb);
    await addText(w, "big.txt", big351.text);
    const txt = byName(T, "big.txt");
    const f = w.createFilterNode(txt.id, "text", "Heartbeat");
    T.state.activeId = f.id; w.render(); w.applyFhView("highlight");
    const ev = T.editorView;
    fireKeydown(d, w, "g", { ctrlKey: true });
    await search351(w, d, "Spectrum");
    const hits = w.__find.state.hits;
    assert(hits.length > 100 && w.__find.state.done, "the scan covers the whole file (" + hits.length + " hits)");
    assert(!d.querySelector("#textEditor mark.editor-find-mark") || [...d.querySelectorAll("#textEditor mark.editor-find-mark")].length < 40, "only rendered rows carry marks");
    const lastHit = hits[hits.length - 1];
    while (w.__find.state.cur !== hits.length - 1) { fireKeydown(d, w, "F3", { shiftKey: true }); if (hits.length - 1 - w.__find.state.cur > 1 && w.__find.state.cur > 3) break; } // Shift+F3 from the top wraps to the last hit
    await sleep(30);
    const row = rowOf(d, txt.entries[lastHit].ts);
    assert(!!row && row.classList.contains("find-cur") && row.querySelector("mark.editor-find-mark") && / \/ /.test(d.getElementById("findCount").textContent), "the last hit (line " + txt.entries[lastHit].ts + ", far outside the first window) is mounted, current and marked");
    const nfmt = hits.length.toLocaleString("de-DE");
    assert(d.getElementById("findCount").textContent === nfmt + " / " + nfmt, "the counter reads n / m, got " + d.getElementById("findCount").textContent);
    scrollTo(w, d, hits[Math.floor(hits.length / 2)] * LH - 100);
    const newRows = lines(d);
    const hitRows = newRows.filter(r => hits.includes(+r.dataset.line));
    assert(hitRows.length > 0 && hitRows.every(r => r.querySelector("mark.editor-find-mark")) && newRows.every(r => hits.includes(+r.dataset.line) || !r.querySelector("mark.editor-find-mark")),
      "rows scrolled into view get their find marks as they are built (" + hitRows.length + " hit rows)");
    scrollTo(w, d, 12000 * LH);
    const hl = lines(d).filter(r => ev.hitIds.has(txt.entries[+r.dataset.line].id));
    assert(hl.length > 0 && hl.every(r => r.classList.contains("hit") && r.querySelector(".text-match-mark")), "…and so do the filter's hit classes and text marks (" + hl.length + " rows)");
    d.getElementById("findCloseBtn").click();
    assert(!d.querySelector("#textEditor mark.editor-find-mark") && !d.querySelector("#textEditor .find-cur"), "closing the bar clears the marks");
    scrollTo(w, d, 20000 * LH);
    assert(!d.querySelector("#textEditor mark.editor-find-mark"), "…and rows built afterwards are not marked");
  });

  await withApp(async (w, d, T) => {
    section("351g. Wrap with the virtualized editor: heights are estimated from the character count; the scroll math stays consistent");
    await addText(w, "big.txt", sim("plain", 3000, 5).text);
    const txt = byName(T, "big.txt");
    T.state.activeId = txt.id; w.render();
    d.querySelector("#contextToolbar .toggle-wrap").click();
    const ev = T.editorView, cols = ev.cols;
    assert(cols > 10 && ev.tops && ev.tops.length === ev.n + 1, "wrap on: row tops from " + cols + " columns");
    let expectTotal = 0;
    for (const e of txt.entries) expectTotal += LH * Math.max(1, Math.ceil((e.message.length + 3 * (e.message.split("\t").length - 1)) / cols));
    assert(ev.tops[ev.n] === expectTotal && expectTotal > ev.n * LH, "the content height is the sum of the estimated row heights (" + expectTotal + ")");
    const wrapRows = lines(d);
    assert(Math.abs(heightsOf(d) + wrapRows.reduce((h, r) => h + ev.tops[+r.dataset.line + 1] - ev.tops[+r.dataset.line], 0) - expectTotal) < 1, "spacers + mounted rows' estimated heights add up to the content height");
    // Scrolling still lands on the right line.
    const y = ev.tops[1500] + 2 + 3;
    scrollTo(w, d, y);
    const anchor = w.captureEditorAnchor();
    assert(anchor.idx === 1500 && anchor.offset === ev.tops[1500] - y, "the anchor at an arbitrary scroll position maps to line 1501 (offset " + anchor.offset + ")");
    assert(lines(d).some(r => r.dataset.line === "1500"), "its row is mounted");
    // Reveal works with variable heights.
    w.revealEditorLine(2500, { center: true });
    assert(Math.abs(d.querySelector("#highlightBody").scrollTop - (2 + ev.tops[2500] - 200 + (ev.tops[2501] - ev.tops[2500]) / 2)) <= 1 && lines(d).some(r => r.dataset.line === "2500"), "reveal centres by the estimated row geometry");
  });
  await withApp(async (w, d, T) => {
    section("351h. Ctrl+A in the Context editor selects the whole file through the model; log views keep the native select-all");
    await addText(w, "orders.json", json351.text);
    await addText(w, "app.log", sim("default", 40, 2).text);
    const js = byName(T, "orders.json"), log = byName(T, "app.log");
    T.state.activeId = js.id; w.render();
    const ev = T.editorView, es = js.entries, sel = w.getSelection();
    collapseAll(w, T); // folded lines must be in the copied text too
    const down = fireKeydown(d, w, "a", { ctrlKey: true });
    assert(ev.selectAll === true && sel.anchorNode === d.querySelector("#teRows") && !sel.isCollapsed, "Ctrl+A selects the editor's rows and sets the select-all state");
    let c = copyText(w, d);
    assert(c.prevented && c.text === es.map(e => e.message).join("\n") && c.text.split("\n").length === es.length, "copy gives every line of the file (" + es.length + "), folded ones included, although only a few rows are rendered (" + lines(d).length + ")");
    // The window moves: new rows join the visual selection.
    ev.folds.forEach(f => { f.collapsed = false; }); w.rebuildEditorVisible(); w.editorRebuildTops(); w.editorRender(true);
    scrollTo(w, d, 5000 * LH);
    assert(sel.anchorNode === d.querySelector("#teRows") && sel.focusOffset === d.querySelector("#teRows").childNodes.length && ev.selectAll, "after scrolling the selection still covers the rendered rows " + [sel.anchorNode && sel.anchorNode.nodeName, sel.focusOffset, d.querySelector("#teRows").childNodes.length, ev.selectAll, ev.n].join(","));
    // A click / new selection clears the state; copy is native again.
    const row = lines(d)[3];
    sel.collapse(row.lastChild, 0);
    await sleep(30);
    assert(ev.selectAll === false && copyText(w, d).prevented === false, "a click clears select-all; copy is left alone");
    sel.setBaseAndExtent(textNodeOf(lines(d)[2]), 1, textNodeOf(lines(d)[4]), 2);
    fireKeydown(d, w, "a", { ctrlKey: true });
    sel.setBaseAndExtent(textNodeOf(lines(d)[2]), 1, textNodeOf(lines(d)[4]), 2);
    await sleep(30);
    assert(ev.selectAll === false, "a new text selection clears it");
    // Not in an input; not for other keys.
    const input = d.getElementById("filterInput");
    input.focus();
    fireKeydown(input, w, "a", { ctrlKey: true });
    assert(ev.selectAll === false, "Ctrl+A inside a text input is the input's own select-all");
    input.blur();
    // Log views: untouched (native select-all).
    T.state.activeId = log.id; w.render(); w.applyFhView("highlight");
    const logDown = new w.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true });
    d.dispatchEvent(logDown);
    assert(logDown.defaultPrevented === false && ev.selectAll === false, "a log view's Ctrl+A is not handled (native select-all)");
  });
}
