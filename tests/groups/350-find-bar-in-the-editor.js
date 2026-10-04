// GROUP 350 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 350 — Find bar in the editor (docs/ui-and-views.md "Text files"
   Step 4; marks apply to the rendered rows since Step 5) + Context/Filtered
   vertical parity (CSS)
   ============================================================ */
group(350);
if (groupSelected()) {
  const sim = (format, entries, seed) => LOGSIM.generateToStrings({ format, entries, seed })[0];
  const txt350 = sim("plain", 150, 7);
  const json350 = sim("jsondoc", 12, 3);
  const byName = (T, name) => Object.values(T.state.nodes).find(n => n.type === "file" && n.name === name);
  const addText = async (w, name, text) => { await w.loadFileDescriptors([{ file: new w.File([text], name), handle: null }]); };
  const LH = 19;
  const lines = d => [...d.querySelectorAll("#textEditor .itv-line")];
  const search = async (w, d, q) => { const input = d.getElementById("findInput"); input.value = q; fireInput(input, w); await sleep(220); };
  const count = d => d.getElementById("findCount").textContent;
  const marks = d => [...d.querySelectorAll("#textEditor mark.editor-find-mark")];
  const collapseAll = (w, T) => { T.editorView.folds.forEach(f => { f.collapsed = true; }); w.rebuildEditorVisible(); w.editorRebuildTops(); w.editorRender(true); };
  // Matches of `re` (global) in the rendered rows' lines — what the marks must cover.
  const expectedMarks = (T, d, re) => lines(d).reduce((n, l) => n + ((T.editorView.entries[+l.dataset.line].message.match(re) || []).length), 0);

  await withApp(async (w, d, T) => {
    section("350a. Ctrl+G in the editor: counts, marks every rendered match in place, steps with F3/Shift+F3, unfolds only the hiding folds");
    const fb = d.createElement("script");
    fb.textContent = "window.__find = { get state() { return findState; } };";
    d.body.appendChild(fb);
    await addText(w, "orders.json", json350.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    collapseAll(w, T);
    const ev = T.editorView, editor = d.querySelector("#textEditor"), key0 = ev.key;
    const collapsed0 = ev.folds.filter(f => f.collapsed).length;
    assert(collapsed0 > 5, "folds collapsed first (" + collapsed0 + ")");
    fireKeydown(d, w, "f", { ctrlKey: true });
    assert(isVisible(d.getElementById("findBar"), w), "Ctrl+G opens the find bar in the Context editor");
    await search(w, d, "0.1");
    const expectLines = js.entries.map((e, i) => i).filter(i => js.entries[i].message.includes("0.1"));
    assert(expectLines.length >= 3, "the fixture has several lines containing 0.1 (" + expectLines.length + ")");
    assert(w.__find.state.hits.length === expectLines.length && w.__find.state.hits.every((h, i) => h === expectLines[i]), "the scan finds every line of the file, rendered or not");
    assert(count(d) === "1 / " + expectLines.length, "the counter reads n / m over the file's lines, got " + count(d));
    assert(marks(d).length === expectedMarks(T, d, /0\.1/g) && marks(d).length >= 1 && marks(d).every(m => m.textContent === "0.1"), "every match in the rendered rows is marked in place (" + marks(d).length + ")");
    assert(ev.key === key0 && T.editorView.entries === ev.entries && d.querySelector("#textEditor") === editor, "no editor rebuild");
    const cur = () => d.querySelector("#textEditor .find-cur");
    const e0 = js.entries[expectLines[0]];
    assert(cur() && cur().dataset.n === String(e0.ts), "the current hit's line is .find-cur (line " + e0.ts + ")");
    const chain = []; for (let g = ev.lineParent[expectLines[0]]; g >= 0; g = ev.folds[g].parent) chain.push(g);
    assert(chain.every(g => !ev.folds[g].collapsed), "the folds above the current match are open");
    const collapsed1 = ev.folds.filter(f => f.collapsed).length;
    assert(collapsed1 > 0 && collapsed0 - collapsed1 <= chain.length, "other folds stay collapsed (" + collapsed1 + " of " + collapsed0 + ")");
    const body = d.querySelector("#highlightBody");
    assert(Math.abs(body.scrollTop - Math.max(0, w.editorRowScrollTop(w.editorPosOf(expectLines[0])) - 200 + LH / 2)) <= 1, "scrolled so the match is centred, got " + body.scrollTop);
    assert(T.state.selectedId === e0.id, "the hit's entry is the selected entry");
    const nLast = expectLines.length;
    fireKeydown(d, w, "F3");
    assert(count(d) === "2 / " + nLast && cur().dataset.n === String(js.entries[expectLines[1]].ts), "F3: next hit, got " + count(d));
    fireKeydown(d, w, "F3", { shiftKey: true });
    fireKeydown(d, w, "F3", { shiftKey: true });
    assert(count(d) === nLast + " / " + nLast && cur().dataset.n === String(js.entries[expectLines[nLast - 1]].ts), "Shift+F3 from the first hit wraps to the last, got " + count(d));
    assert(!!ev.vis && ev.vis.includes(expectLines[nLast - 1]), "the last hit is visible too (unfolded)");
    d.getElementById("findNextBtn").click();
    assert(count(d) === "1 / " + nLast, "the bar's Next button steps and wraps, got " + count(d));
    d.getElementById("findPrevBtn").click();
    assert(count(d) === nLast + " / " + nLast, "the Prev button steps back");
    assert(ev.key === key0, "still the same model after all the steps");
  });

  await withApp(async (w, d, T) => {
    section("350b. Marks are removed on close and leave the line's original nodes (selection/copy stay correct)");
    await addText(w, "orders.json", json350.text);
    const js = byName(T, "orders.json");
    T.state.activeId = js.id; w.render();
    const hitEntry = js.entries.find(e => e.message.includes("msg"));
    const hitLine = d.querySelector('#textEditor .itv-line[data-n="' + hitEntry.ts + '"]');
    const otherEntry = js.entries.find(e => !e.message.includes("msg") && e.message.trim().length > 6);
    const otherLine = d.querySelector('#textEditor .itv-line[data-n="' + otherEntry.ts + '"]');
    const html0 = hitLine.innerHTML, other0 = otherLine.innerHTML;
    const otherNodes = [...otherLine.childNodes];
    const text0 = d.querySelector("#teRows").textContent;
    fireKeydown(d, w, "f", { ctrlKey: true });
    await search(w, d, "msg");
    assert(marks(d).length >= 3 && hitLine.querySelector("mark.editor-find-mark"), "the matches are marked (" + marks(d).length + ")");
    assert(hitLine.textContent === hitEntry.message && d.querySelector("#teRows").textContent === text0, "marking never changes the text");
    assert([...otherLine.childNodes].every((n, i) => n === otherNodes[i]) && otherLine.innerHTML === other0, "a line without a hit is untouched (same nodes)");
    d.getElementById("findCloseBtn").click();
    assert(marks(d).length === 0 && !d.querySelector("#textEditor .find-cur"), "closing the bar removes every mark and the current-line class");
    assert(hitLine.innerHTML === html0, "the hit line's markup is exactly what it was before the search (marks unwrapped, text nodes merged back)");
    assert(!isVisible(d.getElementById("findBar"), w), "bar hidden");
    fireKeydown(d, w, "f", { ctrlKey: true });
    await search(w, d, "zzzzqq");
    assert(count(d) === "No results" && marks(d).length === 0, "no results: no marks");
    await search(w, d, "msg");
    assert(marks(d).length >= 3, "a new query marks again");
    await search(w, d, "");
    assert(marks(d).length === 0, "clearing the query clears the marks");
    await search(w, d, "msg");
    const sel = w.getSelection(), range = d.createRange();
    range.selectNodeContents(otherLine); sel.removeAllRanges(); sel.addRange(range);
    const selText = sel.toString();
    await search(w, d, "msg ");
    await search(w, d, "msg");
    assert(marks(d).length >= 3 && sel.rangeCount === 1 && sel.toString() === selText && selText.length > 0 && sel.getRangeAt(0).commonAncestorContainer === otherLine,
      "a selection in an unmarked line is untouched while marks come and go");
    const hitText = hitLine.querySelector("mark.editor-find-mark").previousSibling || hitLine.firstChild;
    const r2 = d.createRange(); r2.setStart(hitLine, 0); r2.setEnd(hitLine, hitLine.childNodes.length);
    sel.removeAllRanges(); sel.addRange(r2);
    const sel2 = sel.toString();
    d.getElementById("findCloseBtn").click();
    assert(r2.toString() === sel2 && hitLine.innerHTML === html0 && hitText !== null, "a live Range over the line still covers the same text after the marks are unwrapped (got " + JSON.stringify(r2.toString()) + ")");
  });

  await withApp(async (w, d, T) => {
    section("350c. Case and regex options work in the editor like for logs");
    await addText(w, "notes.txt", txt350.text);
    const txt = byName(T, "notes.txt");
    T.state.activeId = txt.id; w.render();
    fireKeydown(d, w, "f", { ctrlKey: true });
    await search(w, d, "heartbeat");
    const ci = txt.entries.filter(e => /heartbeat/i.test(e.message)).length;
    assert(ci > 3 && count(d) === "1 / " + ci && marks(d).length === expectedMarks(T, d, /heartbeat/gi) && marks(d).length > 0, "case-insensitive by default (" + ci + ")");
    d.getElementById("findCaseBtn").click(); await sleep(220);
    assert(count(d) === "No results" && marks(d).length === 0, "Aa: 'heartbeat' no longer matches 'Heartbeat'");
    d.getElementById("findCaseBtn").click(); await sleep(220);
    d.getElementById("findRegexBtn").click();
    await search(w, d, "Heartbeat|Retrying");
    const re = txt.entries.filter(e => /Heartbeat|Retrying/.test(e.message)).length;
    assert(new RegExp("^\\d+ / " + re + "$").test(count(d)) && marks(d).length === expectedMarks(T, d, /Heartbeat|Retrying/g), "regex alternation (" + re + ") got " + count(d) + " / " + marks(d).length);
    await search(w, d, "(");
    assert(/Invalid/.test(count(d)) && marks(d).length === 0, "an invalid regex shows the error and marks nothing, got " + count(d));
    d.getElementById("findRegexBtn").click();
    await search(w, d, "axis=[*:int] target");
    const wc = txt.entries.filter(e => /axis=\d+ target/.test(e.message)).length;
    assert(wc > 2 && new RegExp("^\\d+ / " + wc + "$").test(count(d)) && marks(d).length === expectedMarks(T, d, /axis=\d+ target/g), "a [*:int] wildcard pattern matches like the filter (" + wc + ") got " + count(d) + " / " + marks(d).length);
  });

  await withApp(async (w, d, T) => {
    section("350d. On a filter node the whole file is searched; Add as filter creates a node under the active node; Filtered/log find unchanged");
    await addText(w, "notes.txt", txt350.text);
    await addText(w, "app.log", sim("default", 40, 2).text);
    const txt = byName(T, "notes.txt"), log = byName(T, "app.log");
    const f = w.createFilterNode(txt.id, "text", "Heartbeat");
    T.state.activeId = f.id; w.render(); w.applyFhView("highlight");
    fireKeydown(d, w, "f", { ctrlKey: true });
    await search(w, d, "Sensor");
    const n = txt.entries.filter(e => /sensor/i.test(e.message)).length;
    assert(count(d) === "1 / " + n && marks(d).length === expectedMarks(T, d, /sensor/gi), "Context on a filter node searches the whole file, not only the result lines (" + n + ")");
    assert(T.editorView.hitIds.size === w.getEntries(f.id).length, "the filter's own hit lines are unchanged");
    const nodes0 = Object.keys(T.state.nodes).length;
    d.getElementById("findAddFilterBtn").click();
    const added = Object.values(T.state.nodes).find(x => x.type === "filter" && x.filterType === "text" && x.value === "Sensor");
    assert(added && added.parentId === f.id && Object.keys(T.state.nodes).length === nodes0 + 1, "Add as filter creates a text filter under the active node");
    assert(!isVisible(d.getElementById("findBar"), w) && marks(d).length === 0 && T.state.activeId === added.id, "the bar closes, the marks go, the new node is active");
    assert(T.fhActiveTab === "filter", "its result lives in Filtered");
    T.state.activeId = txt.id; w.render(); w.applyFhView("filter");
    fireKeydown(d, w, "f", { ctrlKey: true });
    await search(w, d, "Sensor");
    assert(d.querySelectorAll("#tableRows mark.find-match-mark").length > 0 && marks(d).length === 0, "in Filtered the rows are marked (unchanged behaviour), the editor is not");
    assert(/\/ /.test(count(d)), "Filtered counter works, got " + count(d));
    w.applyFhView("highlight");
    assert(marks(d).length === expectedMarks(T, d, /sensor/gi) && marks(d).length > 0, "switching to Context with the bar open marks the editor rows (" + marks(d).length + ")");
    w.applyFhView("filter");
    d.getElementById("findCloseBtn").click();
    T.state.activeId = log.id; w.render();
    fireKeydown(d, w, "f", { ctrlKey: true });
    await search(w, d, "INFO");
    assert(marks(d).length === 0 && d.querySelectorAll("#tableRows mark.find-match-mark, #highlightRows mark.find-match-mark").length > 0, "log roots keep marking their rows");
  });

  await withApp(async (w, d, T) => {
    section("350e. Vertical/horizontal parity of Context and Filtered lines (CSS: same top padding, gutter columns, line height)");
    const pad = sel => (new RegExp(sel.replace(/[.#]/g, "\\$&") + "[^{]*\\{[^}]*padding:([^;}]+)").exec(html) || [])[1];
    assert(pad("#textEditor") === "2px 16px 20px var(--rows-pad-left)" && /#tableRows, #highlightRows\{[^}]*padding:2px 16px 20px var\(--rows-pad-left\)/.test(html),
      "#textEditor and #tableRows share the padding box (2px top, same left inset), got " + pad("#textEditor"));
    assert(/#textEditor\{[^}]*--rows-pad-left: ?calc\(26px \+ \(var\(--color-mark-w\) - 3px\)\)/.test(html), "…and the same --rows-pad-left formula");
    assert(/\.log-row\.text-row\{[^}]*height:var\(--text-row-h\)|\.log-row\.text-row\{[^}]*grid-template-columns:var\(--text-num-w\) var\(--text-fold-w\) 1fr/.test(html) &&
      /\.itv-line\{[^}]*height:var\(--text-row-h\)[^}]*\}/.test(html), "line height is --text-row-h in both");
    assert(/#teRows\{|#teTop, #teBottom, #teRows\{display:block;\}/.test(html), "the editor's row container and spacers are plain blocks");
    assert(/mark.find-match-mark \*[^{]*\{color:var\(--text-primary\)/.test(html.replace(/\s+/g, " ")) , "marked text keeps the normal text colour over the token colours");
  });
}
