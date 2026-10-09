// GROUP patterns-compare — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP patterns-compare — Patterns tab "Compare" (analysisWhatChanged) + burst action "Compare with rest"
   Origin: 2026-10-09 (person-requested, backlog #120 part 2b, analysis tools round).
   A "Compare" chip in the Patterns toolbar switches the tab to a compare table: A = the active node, B = the
   rest of its file (default) | another node | another file. Groups New in A / More frequent in A / Rarer in A /
   Gone in the engine's order, columns Count A, Count B, Expected, Factor, Level, Pattern. Row click = the
   Patterns row action under A (Gone rows: only NOT). The burst popover's "Compare with rest" opens it with A =
   the burst window only (override with x, dropped on a node switch). With Compare off the tab is unchanged.
   Plain session state, desktop/tablet only. Sample data: tools/log-sim (motion, bursts, basic; causechain, basic).
   ============================================================ */
group("patterns-compare");

if (groupSelected()) {
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const simFile = async (w, scenarios, entries, seed) => {
    const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
    return w.addFile(file.name, file.text, () => {});
  };
  const cmpRows = d => [...d.querySelectorAll("#patternsCmpBody .cmp-row")];
  const grpHeads = d => [...d.querySelectorAll("#patternsCmpBody .cmp-grp")].map(txt);
  const cell = (row, i) => txt(row.children[i]);
  const toPatterns = (w, T) => { T.state.fhActive = "patterns"; w.applyFhView("patterns"); };
  const chip = d => d.querySelector("#patternsCompareBtn");
  const pick = (w, sel, v) => { sel.value = v; sel.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const numText = n => n.toLocaleString("de-DE");

  await withApp(async (w, d, T) => {
    section("patterns-compare a. Compare off: the Patterns tab is unchanged; the chip shows the bar and the groups");
    const f = await simFile(w, ["motion", "bursts", "basic"], 8000, 7);
    const err = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
    T.state.activeId = err.id; w.render();
    toPatterns(w, T);
    assert(d.querySelector("#patternsWrap").style.display === "flex", "Patterns view shown");
    assert(chip(d) && txt(chip(d)) === "Compare" && chip(d).getAttribute("aria-pressed") === "false", "chip 'Compare', off");
    assert(!d.querySelector("#patternsWrap").classList.contains("cmp-on"), "no compare class");
    assert(isVisible(d.querySelector("#patternsHead"), w) && isVisible(d.querySelector("#patternsScroll"), w), "head and list visible");
    assert(!isVisible(d.querySelector("#patternsCmpBar"), w) && !isVisible(d.querySelector("#patternsCmpBody"), w), "bar and compare body hidden");
    assert(/entries → \d+ patterns?$/.test(txt(d.querySelector("#patternsInfo"))), "info line unchanged: " + txt(d.querySelector("#patternsInfo")));
    const plainRows = d.querySelectorAll("#patternsRows .pattern-row").length;
    const plainHead = txt(d.querySelector("#patternsHead"));
    assert(plainRows > 0 && /Count.*Max level.*Pattern.*First.*Last/.test(plainHead), "plain rows and header: " + plainRows + " / " + plainHead);

    fireClick(chip(d), w);
    assert(chip(d).getAttribute("aria-pressed") === "true", "chip pressed");
    assert(isVisible(d.querySelector("#patternsCmpBar"), w) && isVisible(d.querySelector("#patternsCmpBody"), w), "bar and compare body visible");
    assert(!isVisible(d.querySelector("#patternsHead"), w) && !isVisible(d.querySelector("#patternsScroll"), w), "plain head and list hidden");
    const aEntries = w.applyLevelFilter(w.getEntries(err.id));
    const inA = new Set(aEntries.map(e => e.id));
    const restEntries = f.entries.filter(e => !inA.has(e.id));
    const range = w.fileEntryTimeRange(f.entries);
    const spanA = aEntries[aEntries.length - 1].ts - aEntries[0].ts;
    const durB = Math.max(range.max - range.min, 1000); // no window: nothing is taken out of B's time
    const eng = w.analysisWhatChanged(aEntries, restEntries, { durationAMs: Math.max(spanA, 1000), durationBMs: durB });
    // bar
    const sel = d.querySelector("#cmpBMode");
    assert(sel.value === "rest" && txt(sel.options[0]) === "Rest of " + f.name, "B defaults to 'Rest of " + f.name + "': " + txt(sel.options[0]));
    assert(txt(sel.options[1]) === "Another node…" && txt(sel.options[2]) === "Another file…", "select options");
    assert(sel.options[2].disabled, "no other file -> 'Another file…' disabled");
    const barA = txt(d.querySelector("#cmpAText"));
    assert(barA.includes(numText(aEntries.length) + " entries") && barA.includes(w.formatMs(Math.max(spanA, 1000))), "A part: " + barA);
    assert(txt(d.querySelector("#cmpBMeta")) === numText(restEntries.length) + " entries · " + w.formatMs(durB), "B meta: " + txt(d.querySelector("#cmpBMeta")));
    // groups and rows equal the engine's
    const labels = { new: "New in A", more: "More frequent in A", rarer: "Rarer in A", gone: "Gone" };
    const wantHeads = ["new", "more", "rarer", "gone"].filter(k => eng[k].length).map(k => labels[k] + " · " + eng[k].length);
    assert(wantHeads.length >= 2, "at least two groups to look at: " + wantHeads.join(","));
    assert(JSON.stringify(grpHeads(d)) === JSON.stringify(wantHeads), "group headers " + JSON.stringify(grpHeads(d)) + " vs " + JSON.stringify(wantHeads));
    const want = ["new", "more", "rarer", "gone"].flatMap(k => eng[k].map(r => ({ k, r })));
    const rows = cmpRows(d);
    assert(rows.length === want.length, "row count " + rows.length + "/" + want.length);
    want.forEach(({ k, r }, i) => {
      const row = rows[i];
      if (cell(row, 5) !== w.patternDisplayText(r.key) || cell(row, 0) !== numText(r.countA) || cell(row, 1) !== numText(r.countB) || cell(row, 2) !== r.expected.toFixed(1))
        assert(false, "row " + i + " (" + k + "): " + cell(row, 0) + "|" + cell(row, 1) + "|" + cell(row, 2) + "|" + cell(row, 5));
    });
    assert(true, "all rows equal the engine's, in order");
    const moreRow = rows[want.findIndex(x => x.k === "more")];
    if (moreRow) {
      const r = want.find(x => x.k === "more").r;
      assert(cell(moreRow, 3) === "×" + r.factor.toFixed(1) && moreRow.querySelector(".cmp-factor.up"), "factor ×N.N with up colour: " + cell(moreRow, 3));
    }
    assert(want.every(({ k, r }, i) => k !== "new" || r.countB === 0) && want.every(({ r }) => r.countA >= 3 || r.expected >= 3), "noise limit: >= 3 in A (Gone/Rarer: expected >= 3)");
    // new rows say "new"
    const newIdx = want.findIndex(x => x.k === "new");
    if (newIdx >= 0) assert(cell(rows[newIdx], 3) === "new", "factor of a new pattern: " + cell(rows[newIdx], 3));
    // off again: back to exactly the plain view
    fireClick(chip(d), w);
    assert(chip(d).getAttribute("aria-pressed") === "false" && !isVisible(d.querySelector("#patternsCmpBar"), w), "chip off hides the bar");
    assert(d.querySelectorAll("#patternsRows .pattern-row").length === plainRows && txt(d.querySelector("#patternsHead")) === plainHead, "plain rows and header are back, unchanged");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("patterns-compare b. B = rest of the file excludes A; another node; another file");
    const f = await simFile(w, ["motion", "bursts", "basic"], 8000, 7);
    const abort = w.createFilterNode(f.id, "text", "Move aborted");
    const warns = w.createFilterNode(f.id, "level", ["WARN"]);
    T.state.activeId = abort.id; w.render();
    toPatterns(w, T);
    fireClick(chip(d), w);
    const a = w.getEntries(abort.id);
    assert(a.length >= 3, "enough aborted moves: " + a.length);
    const aIds = new Set(a.map(e => e.id));
    const rest = f.entries.filter(e => !aIds.has(e.id));
    assert(txt(d.querySelector("#cmpBMeta")).startsWith(numText(rest.length) + " entries"), "rest of file excludes A: " + txt(d.querySelector("#cmpBMeta")));
    const newRow = cmpRows(d).find(r => /^Move aborted/.test(cell(r, 5)));
    assert(!newRow || cell(newRow, 1) === "0", "'Move aborted' is not in the rest");
    // another node
    const nodeOpt = d.querySelector("#cmpBMode").options[1];
    assert(!nodeOpt.disabled, "'Another node…' enabled");
    pick(w, d.querySelector("#cmpBMode"), "node");
    const tgt = d.querySelector("#cmpBTarget");
    assert(!tgt.hidden && isVisible(tgt, w), "target select shown");
    const labels = [...tgt.options].map(o => txt(o));
    assert(labels.length === 1 && labels[0] === w.nodeDisplayName(warns) && !labels.includes(w.nodeDisplayName(abort)), "lists the other nodes only: " + labels);
    const b = w.applyLevelFilter(w.getEntries(warns.id));
    const span = b.length ? Math.max(b[b.length - 1].ts - b[0].ts, 1000) : 1000;
    assert(txt(d.querySelector("#cmpBMeta")) === numText(b.length) + " entries · " + w.formatMs(span), "B = the other node's own span: " + txt(d.querySelector("#cmpBMeta")));
    const aSpan = Math.max(a[a.length - 1].ts - a[0].ts, 1000);
    const eng = w.analysisWhatChanged(a, b, { durationAMs: aSpan, durationBMs: span });
    const total = eng.new.length + eng.more.length + eng.rarer.length + eng.gone.length;
    assert(cmpRows(d).length === total, "rows equal the engine's against the node: " + cmpRows(d).length + "/" + total);
    // another file
    const f2 = await simFile(w, ["causechain", "basic"], 3000, 3);
    T.state.activeId = abort.id; w.render();
    toPatterns(w, T);
    assert(chip(d).getAttribute("aria-pressed") === "true", "Compare stays on");
    assert(d.querySelector("#cmpBMode").value === "rest", "B back to the rest after the node switch");
    assert(!d.querySelector("#cmpBMode").options[2].disabled, "'Another file…' enabled with two files");
    pick(w, d.querySelector("#cmpBMode"), "file");
    const flabels = [...d.querySelector("#cmpBTarget").options].map(o => txt(o));
    assert(flabels.length === 1 && flabels[0] === f2.name, "lists the other file: " + flabels);
    const b2 = f2.entries, span2 = Math.max(b2[b2.length - 1].ts - b2[0].ts, 1000);
    assert(txt(d.querySelector("#cmpBMeta")) === numText(b2.length) + " entries · " + w.formatMs(span2), "B = the file's span: " + txt(d.querySelector("#cmpBMeta")));
    const eng2 = w.analysisWhatChanged(a, b2, { durationAMs: aSpan, durationBMs: span2 });
    assert(cmpRows(d).length === eng2.new.length + eng2.more.length + eng2.rarer.length + eng2.gone.length && cmpRows(d).length > 0, "rows equal the engine's against the file: " + cmpRows(d).length);
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("patterns-compare c. row click: filter under A (one undo step), Alt hides, Gone rows offer only NOT");
    const f = await simFile(w, ["motion", "bursts", "basic"], 8000, 7);
    const warns = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
    T.state.activeId = warns.id; w.render();
    toPatterns(w, T);
    fireClick(chip(d), w);
    const rows = cmpRows(d);
    assert(rows.length > 0, "rows");
    const idx = rows.findIndex(r => r.dataset.grp !== "gone");
    const key = rows[idx].querySelector(".pattern-text").getAttribute("title");
    const nodes = Object.keys(T.state.nodes).length, undoN = T.undoStack.length;
    fireClick(rows[idx], w);
    const nf = T.state.nodes[T.state.activeId];
    assert(Object.keys(T.state.nodes).length === nodes + 1 && nf.parentId === warns.id && nf.filterType === "text" && !nf.inverted, "text filter under A");
    assert(T.undoStack.length === undoN + 1, "one undo step");
    assert(nf.columns && nf.columns[0] === "message" && /\[\*\]|[A-Za-z]/.test(nf.value), "message filter: " + nf.value);
    w.undo();
    assert(Object.keys(T.state.nodes).length === nodes, "undo removes it");
    T.state.activeId = warns.id; w.render();
    toPatterns(w, T);
    // Alt = NOT, stays on Patterns, Compare stays on (A is now the child node)
    cmpRows(d)[idx].dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, altKey: true }));
    const nn = T.state.nodes[T.state.activeId];
    assert(nn.inverted && nn.parentId === warns.id, "Alt+click adds the NOT filter");
    assert(d.querySelector("#patternsWrap").style.display === "flex" && chip(d).getAttribute("aria-pressed") === "true", "stays on Patterns, Compare on");
    // Gone rows: from the plain view, compare a rarer-in-A node against its rest
    const f2 = await simFile(w, ["basic", "motion"], 6000, 4);
    const quiet = w.createFilterNode(f2.id, "text", "Heartbeat");
    T.state.activeId = quiet.id; w.render();
    toPatterns(w, T);
    const gone = cmpRows(d).filter(r => r.dataset.grp === "gone");
    assert(gone.length > 0, "Gone rows for a node that contains one pattern only: " + cmpRows(d).length);
    const g0 = gone[0];
    assert(!g0.querySelector('[data-act="extract"]') && !g0.querySelector('[data-act="jump"]') && g0.querySelector('[data-act="hide"]'), "Gone: only the NOT action");
    assert(/nothing to show/.test(g0.title), "Gone tooltip: " + g0.title);
    const n0 = Object.keys(T.state.nodes).length;
    fireClick(g0, w);
    assert(Object.keys(T.state.nodes).length === n0 && T.state.activeId === quiet.id, "show-only is disabled on a Gone row");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("patterns-compare d. burst popover 'Compare with rest': override A, B = rest, x returns, dropped on a node switch");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    T.state.activeId = f.id; w.render();
    const tl = w.analysisTimeline(f.entries);
    const b = tl.bursts[1];
    fireClick(d.querySelectorAll("#minimapBursts .minimap-burst")[1], w);
    const acts = [...d.querySelectorAll("#burstPopActions button")].map(x => x.textContent);
    assert(JSON.stringify(acts) === JSON.stringify(["Zoom", "What came before", "Compare with rest", "Time window"]), "action order: " + acts);
    fireClick(d.querySelector('#burstPopActions [data-burst-act="compare"]'), w);
    assert(d.querySelector("#burstPopover").classList.contains("hidden"), "popover closed");
    assert(d.querySelector("#patternsWrap").style.display === "flex" && chip(d).getAttribute("aria-pressed") === "true", "Patterns tab, Compare on");
    const winMs = Math.max(b.to - b.from, 1000);
    const a = f.entries.filter(e => e.ts >= b.from && e.ts <= b.to);
    const ch = d.querySelector("#cmpAChip .cmp-chip");
    assert(ch && /^Burst \d\d:\d\d:\d\d/.test(txt(ch)) && ch.querySelector("#cmpOverrideClear"), "override chip with x: " + (ch && txt(ch)));
    assert(txt(d.querySelector("#cmpAText")).includes(numText(a.length) + " entries") && txt(d.querySelector("#cmpAText")).includes(w.formatMs(winMs)), "A = the burst window: " + txt(d.querySelector("#cmpAText")));
    const aIds = new Set(a.map(e => e.id)), rest = f.entries.filter(e => !aIds.has(e.id));
    const range = w.fileEntryTimeRange(f.entries), durB = Math.max(range.max - range.min - winMs, 1000);
    assert(txt(d.querySelector("#cmpBMeta")) === numText(rest.length) + " entries · " + w.formatMs(durB), "B = rest: " + txt(d.querySelector("#cmpBMeta")));
    const eng = w.analysisWhatChanged(a, rest, { durationAMs: winMs, durationBMs: durB });
    const total = eng.new.length + eng.more.length + eng.rarer.length + eng.gone.length;
    assert(total > 0 && cmpRows(d).length === total, "rows are the engine's: " + cmpRows(d).length + "/" + total);
    // row click: time range of the burst + pattern, one undo step
    const idx = cmpRows(d).findIndex(r => r.dataset.grp !== "gone");
    const nodes = Object.keys(T.state.nodes).length, undoN = T.undoStack.length;
    fireClick(cmpRows(d)[idx], w);
    const flt = T.state.nodes[T.state.activeId], tr = T.state.nodes[flt.parentId];
    assert(Object.keys(T.state.nodes).length === nodes + 2 && tr.filterType === "timerange" && tr.parentId === f.id && tr.value.from === b.from && tr.value.to === b.to, "time range of the burst + pattern filter");
    assert(T.undoStack.length === undoN + 1, "one undo step");
    w.undo();
    assert(Object.keys(T.state.nodes).length === nodes, "undo removes both");
    // x returns to the node's own entries
    T.state.activeId = f.id; w.render();
    fireClick(d.querySelectorAll("#minimapBursts .minimap-burst")[1], w);
    fireClick(d.querySelector('#burstPopActions [data-burst-act="compare"]'), w);
    assert(d.querySelector("#cmpAChip .cmp-chip"), "override set again");
    fireClick(d.querySelector("#cmpOverrideClear"), w);
    assert(!d.querySelector("#cmpAChip .cmp-chip") && txt(d.querySelector("#cmpAText")).includes(numText(f.entries.length) + " entries"), "x returns to the node: " + txt(d.querySelector("#cmpAText")));
    // dropped on a node switch
    fireClick(d.querySelectorAll("#minimapBursts .minimap-burst")[1], w);
    fireClick(d.querySelector('#burstPopActions [data-burst-act="compare"]'), w);
    assert(d.querySelector("#cmpAChip .cmp-chip"), "override once more");
    const errs = w.createFilterNode(f.id, "level", ["ERROR"]);
    T.state.activeId = errs.id; w.render();
    toPatterns(w, T);
    assert(!d.querySelector("#cmpAChip .cmp-chip"), "dropped when the active node changes");
    T.state.activeId = f.id; w.render();
    toPatterns(w, T);
    assert(!d.querySelector("#cmpAChip .cmp-chip"), "and not back when returning to the first node");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("patterns-compare e. empty state, cache and the phone");
    const f = await simFile(w, ["basic"], 3000, 2);
    const one = w.createFilterNode(f.id, "text", "Heartbeat");
    T.state.activeId = one.id; w.render();
    toPatterns(w, T);
    fireClick(chip(d), w);
    const rowsN = cmpRows(d).length;
    if (!rowsN) assert(/^No pattern differs clearly \(needs ≥ 3 occurrences and a factor ≥ 2\)\.$/.test(txt(d.querySelector("#patternsCmpBody"))), "empty note: " + txt(d.querySelector("#patternsCmpBody")));
    // A = the whole file: the rest is empty
    T.state.activeId = f.id; w.render();
    assert(/B has no entries/.test(txt(d.querySelector("#patternsCmpBody"))), "file node: B empty note: " + txt(d.querySelector("#patternsCmpBody")));
    // cached: renders reuse the result
    T.state.activeId = one.id; w.render();
    let calls = 0;
    const orig = w.analysisWhatChanged;
    w.analysisWhatChanged = function () { calls++; return orig.apply(this, arguments); };
    w.render(); w.render();
    assert(calls === 0, "renders reuse the cached result: " + calls);
    w.analysisWhatChanged = orig;
    // not computed while Compare is off
    fireClick(chip(d), w);
    w.analysisWhatChanged = function () { calls++; return orig.apply(this, arguments); };
    T.state.activeId = f.id; w.render(); T.state.activeId = one.id; w.render();
    assert(calls === 0, "no computation with Compare off");
    w.analysisWhatChanged = orig;
    // a time-range node is a window: its length is taken out of B's time
    const r0 = w.fileEntryTimeRange(f.entries), from = r0.min + 60000, to = from + 30000;
    const tr = w.createFilterNode(f.id, "timerange", { from, to });
    T.state.activeId = tr.id; w.render(); toPatterns(w, T);
    if (chip(d).getAttribute("aria-pressed") !== "true") fireClick(chip(d), w);
    const inTr = new Set(w.getEntries(tr.id).map(e => e.id));
    assert(inTr.size > 10, "window entries: " + inTr.size);
    assert(txt(d.querySelector("#cmpAText")).includes(w.formatMs(30000)), "A duration = the window: " + txt(d.querySelector("#cmpAText")));
    assert(txt(d.querySelector("#cmpBMeta")) === numText(f.entries.length - inTr.size) + " entries · " + w.formatMs(r0.max - r0.min - 30000), "B duration = file range - window: " + txt(d.querySelector("#cmpBMeta")));
    // phone: no burst action
    const tl = w.analysisTimeline(f.entries);
    w.innerWidth = 390; w.innerHeight = 800; w.dispatchEvent(new w.Event("resize"));
    const acts = w.burstActions(tl.bursts[0] || { from: 0, to: 1, count: 1, levels: {}, topPatterns: [] }).map(a => a.id);
    assert(!acts.includes("compare") && !acts.includes("before") && acts.includes("window"), "phone: no Compare with rest in the popover: " + acts);
    w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
    assert(w.burstActions({ from: 0, to: 1, count: 1, levels: {}, topPatterns: [] }).some(a => a.id === "compare"), "desktop: offered again");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("patterns-compare f. big file: deferred 'Comparing…' step");
    const f = await simFile(w, ["motion", "bursts", "basic"], 60000, 7);
    const err = w.createFilterNode(f.id, "level", ["WARN", "ERROR"]);
    T.state.activeId = err.id; w.render();
    toPatterns(w, T);
    fireClick(chip(d), w);
    assert(f.entries.length > 50000, "above the sync limit: " + f.entries.length);
    assert(/Comparing…/.test(txt(d.querySelector("#patternsCmpBody"))), "Comparing… shown first: " + txt(d.querySelector("#patternsCmpBody")));
    await waitFor(() => cmpRows(d).length > 0, { timeout: 20000 });
    assert(cmpRows(d).length > 0 && !/Comparing…/.test(txt(d.querySelector("#patternsCmpBody"))), "result drawn after the deferred step");
  }, { indexedDB: new IDBFactory() });
}
