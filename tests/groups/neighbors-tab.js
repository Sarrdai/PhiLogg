// GROUP neighbors-tab — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP neighbors-tab — lower-panel tab "Neighbors" (analysisNeighbors) + burst action "What came before"
   Origin: 2026-10-09 (person-requested, backlog #120 part 2a, analysis tools round).
   The tab shows which message patterns stand before / after the active filter node's entries more often
   than elsewhere: Reference selector on a link node (pairs | without end), Before | After, 1 | 5 | 30 s,
   Same thread (on), Show all (off: only lift >= 2, sorted as the engine returns them; on: the rest dimmed).
   A row click = ONE undo step: context node around the reference + the pattern filter under it. The burst
   popover's "What came before" opens the tab with the burst's first entry as an override reference (header
   chip with x), dropped on a node switch. A file node is no reference. The tab is persisted (philogg-lower-tab),
   the controls are not. Desktop/tablet only (the phone sheet does not offer it).
   Sample data: tools/log-sim (causechain, basic; motion, bursts, basic).
   ============================================================ */
group("neighbors-tab");

if (groupSelected()) {
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const simFile = async (w, scenarios, entries, seed) => {
    const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
    return w.addFile(file.name, file.text, () => {});
  };
  const rowsOf = d => [...d.querySelectorAll("#nbTable .nb-row")];
  const cell = (row, i) => txt(row.children[i]);
  const setCheck = (w, el, on) => { el.checked = on; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const btn = (d, attr, v) => d.querySelector("#nbPanelBody [" + attr + '="' + v + '"]');
  const poolRow = d => rowsOf(d).find(r => /^Connection pool exhausted/.test(cell(r, 4)));
  async function errNode(w, d, T, scenarios, entries, seed) {
    const f = await simFile(w, scenarios || ["causechain", "basic"], entries || 4000, seed || 3);
    const err = w.createFilterNode(f.id, "text", "Order processing failed");
    T.state.activeId = err.id; w.render();
    w.setLowerTab("neighbors");
    return { f, err };
  }

  await withApp(async (w, d, T) => {
    section("neighbors-tab a. the tab appears, persists; ERROR node Before 5 s shows the pool pattern with significant lift");
    const tab = d.querySelector("#lowerTabNeighbors");
    assert(tab && tab.textContent === "Neighbors" && !tab.hidden, "tab 'Neighbors' in the strip");
    const order = [...d.querySelectorAll("#lowerTabs .lower-tab")].map(b => b.id);
    assert(order.indexOf("lowerTabNeighbors") === order.indexOf("lowerTabFacets") + 1, "after Facets: " + order.join());
    const { f, err } = await errNode(w, d, T);
    assert(tab.getAttribute("aria-selected") === "true" && w.localStorage.getItem("philogg-lower-tab") === "neighbors", "selected and persisted");
    assert(d.querySelector("#detailPanel").classList.contains("lower-neighbors") && isVisible(d.querySelector("#nbPanelBody"), w), "panel body shown");
    assert(!isVisible(d.querySelector("#detailBody"), w), "entry detail hidden");
    assert(btn(d, "data-nb-dir", "before").getAttribute("aria-pressed") === "true" && btn(d, "data-nb-win", "5000").getAttribute("aria-pressed") === "true", "defaults: Before, 5 s");
    assert(d.querySelector("#nbSameThread").checked && !d.querySelector("#nbShowAll").checked, "Same thread on, Show all off");
    assert(d.querySelector("#nbRefSeg").hidden && d.querySelector("#nbRefLabel").hidden && w.getComputedStyle(d.querySelector("#nbRefSeg")).display === "none", "no Reference selector on a normal node");
    const refs = w.getEntries(err.id);
    assert(refs.length > 50, "enough errors: " + refs.length);
    const nb = w.analysisNeighbors(refs, f.entries, { direction: "before", windowMs: 5000, sameThread: true });
    const sig = nb.rows.filter(r => r.significant);
    const rows = rowsOf(d);
    assert(rows.length === sig.length && rows.length >= 1, "only significant rows: " + rows.length + " vs " + sig.length);
    const pool = poolRow(d);
    assert(pool && rows[0] === pool, "the pool warning ranks first");
    const e = sig[0];
    assert(cell(pool, 0) === e.coverage && e.lift >= 2, "coverage " + e.coverage + ", got " + cell(pool, 0));
    const [n, m] = e.coverage.split("/").map(Number);
    assert(m === refs.length && n / m > 0.7 && n / m < 0.9, "coverage about 80 % (" + e.coverage + ")");
    assert(cell(pool, 1) === (e.lift >= 100 ? "×" + Math.round(e.lift) : "×" + e.lift.toFixed(1)), "lift text " + cell(pool, 1));
    assert(cell(pool, 2) === w.formatMs(e.medianDistMs), "median " + cell(pool, 2));
    assert(cell(pool, 3) === "WARN" && pool.querySelector(".level-badge"), "level badge WARN");
    assert(pool.querySelector(".pattern-ph"), "placeholders highlighted");
    assert(pool.querySelector(".nb-cov u").style.width === Math.round(n / m * 100) + "%", "coverage bar " + pool.querySelector(".nb-cov u").style.width);
    assert(!rows.some(r => r.classList.contains("dim")), "no dimmed rows");
    assert(/^\d[\d.]* references · 5 s before · same thread$/.test(txt(d.querySelector("#nbHead"))), "header: " + txt(d.querySelector("#nbHead")));
    // persisted: reload the state
    w.setLowerTab("detail");
    assert(!isVisible(d.querySelector("#nbPanelBody"), w) && tab.getAttribute("aria-selected") === "false", "another tab hides it");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("neighbors-tab b. Same thread, Show all, window and direction change the result");
    const { f, err } = await errNode(w, d, T);
    const refs = w.getEntries(err.id);
    const liftOf = () => { const r = poolRow(d); return r ? parseFloat(cell(r, 1).replace("×", "")) : null; };
    const base = liftOf();
    assert(base !== null, "pool row with same thread");
    setCheck(w, d.querySelector("#nbSameThread"), false);
    const all = w.analysisNeighbors(refs, f.entries, { direction: "before", windowMs: 5000, sameThread: false });
    const sigAll = all.rows.filter(r => r.significant);
    assert(rowsOf(d).length === sigAll.length, "Same thread off: engine's rows " + rowsOf(d).length + "/" + sigAll.length);
    const off = liftOf();
    assert(off === null || off !== base, "lift changes without Same thread: " + base + " -> " + off);
    assert(/references · 5 s before$/.test(txt(d.querySelector("#nbHead"))), "header drops 'same thread': " + txt(d.querySelector("#nbHead")));
    setCheck(w, d.querySelector("#nbSameThread"), true);
    assert(liftOf() === base, "back to the same lift");
    // Show all adds dimmed rows
    const nSig = rowsOf(d).length;
    setCheck(w, d.querySelector("#nbShowAll"), true);
    const eng = w.analysisNeighbors(refs, f.entries, { direction: "before", windowMs: 5000, sameThread: true });
    assert(rowsOf(d).length === eng.rows.length && eng.rows.length > nSig, "Show all: " + rowsOf(d).length + " rows (was " + nSig + ")");
    const dim = rowsOf(d).filter(r => r.classList.contains("dim"));
    assert(dim.length === eng.rows.length - nSig && dim.length > 0, "the rest is dimmed: " + dim.length);
    setCheck(w, d.querySelector("#nbShowAll"), false);
    // window segments
    fireClick(btn(d, "data-nb-win", "1000"), w);
    const e1 = w.analysisNeighbors(refs, f.entries, { direction: "before", windowMs: 1000, sameThread: true }).rows.filter(r => r.significant);
    assert(btn(d, "data-nb-win", "1000").getAttribute("aria-pressed") === "true" && btn(d, "data-nb-win", "5000").getAttribute("aria-pressed") === "false", "1 s pressed");
    assert(rowsOf(d).length === e1.length && /1 s before/.test(txt(d.querySelector("#nbHead"))), "1 s window rows " + rowsOf(d).length + "/" + e1.length);
    fireClick(btn(d, "data-nb-win", "30000"), w);
    const e30 = w.analysisNeighbors(refs, f.entries, { direction: "before", windowMs: 30000, sameThread: true }).rows.filter(r => r.significant);
    assert(rowsOf(d).length === e30.length && /30 s before/.test(txt(d.querySelector("#nbHead"))), "30 s window rows " + rowsOf(d).length + "/" + e30.length);
    fireClick(btn(d, "data-nb-win", "5000"), w);
    // direction After: pool warnings do not follow the error
    fireClick(btn(d, "data-nb-dir", "after"), w);
    const ea = w.analysisNeighbors(refs, f.entries, { direction: "after", windowMs: 5000, sameThread: true }).rows.filter(r => r.significant);
    assert(rowsOf(d).length === ea.length && /5 s after/.test(txt(d.querySelector("#nbHead"))), "After rows " + rowsOf(d).length + "/" + ea.length);
    assert(!poolRow(d), "no pool row After");
    if (rowsOf(d).length) assert(/Median after/.test(txt(d.querySelector("#nbTable .nb-hrow"))), "median column says after");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("neighbors-tab c. empty states: nothing stands out (Show all button), a file node, no entries");
    const { f, err } = await errNode(w, d, T);
    // After 1 s on the errors: nothing follows them but the usual background (checked against the engine)
    fireClick(btn(d, "data-nb-dir", "after"), w);
    fireClick(btn(d, "data-nb-win", "1000"), w);
    const nb = w.analysisNeighbors(w.getEntries(err.id), f.entries, { direction: "after", windowMs: 1000, sameThread: true });
    const sigN = nb.rows.filter(r => r.significant).length;
    assert(sigN === 0 && nb.rows.length > 0, "sample precondition: rows exist but none is significant: " + sigN + "/" + nb.rows.length);
    const empty = d.querySelector("#nbTable .nb-empty");
    const n = w.getEntries(err.id).length;
    assert(empty && txt(empty).startsWith("No pattern is noticeably more frequent after these " + n.toLocaleString("de-DE") + " entries (lift ≥ 2) within 1 s on the same thread."), "empty text: " + (empty && txt(empty)));
    setCheck(w, d.querySelector("#nbSameThread"), false);
    assert(/within 1 s\.\s*(Show all)?$/.test(txt(d.querySelector("#nbTable .nb-empty"))) || !d.querySelector("#nbTable .nb-empty"), "without Same thread the sentence loses its tail (or rows appear): " + txt(d.querySelector("#nbTable")));
    setCheck(w, d.querySelector("#nbSameThread"), true);
    fireClick(d.querySelector("#nbEmptyShowAll"), w);
    assert(d.querySelector("#nbShowAll").checked && rowsOf(d).length === nb.rows.length, "the button turns Show all on: " + rowsOf(d).length);
    // a file node
    T.state.activeId = f.id; w.render();
    assert(/^Select a filter node/.test(txt(d.querySelector("#nbTable .nb-empty"))) && !rowsOf(d).length, "file node: select a filter node, got " + txt(d.querySelector("#nbTable")));
    // an empty node
    const none = w.createFilterNode(f.id, "text", "no such text anywhere");
    T.state.activeId = none.id; w.render();
    assert(txt(d.querySelector("#nbTable .nb-empty")) === "The node has no entries.", "empty node: " + txt(d.querySelector("#nbTable")));
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("neighbors-tab d. row click: context node + pattern filter, ONE undo step");
    const { f, err } = await errNode(w, d, T);
    const before = Object.keys(T.state.nodes).length, undoBefore = T.undoStack.length;
    const pool = poolRow(d);
    const key = w.analysisNeighbors(w.getEntries(err.id), f.entries, { direction: "before", windowMs: 5000, sameThread: true }).rows[0].patternKey;
    fireClick(pool, w);
    assert(Object.keys(T.state.nodes).length === before + 2, "two nodes created");
    const flt = T.state.nodes[T.state.activeId];
    const ctx = T.state.nodes[flt.parentId];
    assert(flt.filterType === "text" && flt.value === w.patternFilterValue(key, 0, false), "the pattern filter is the active node: " + flt.value);
    assert(ctx.filterType === "context" && ctx.parentId === err.id && ctx.contextBefore === 5000 && ctx.contextAfter === 0, "context node under the error node, 5 s before: " + JSON.stringify([ctx.filterType, ctx.contextBefore, ctx.contextAfter]));
    assert(flt.columns && flt.columns.join() === "message", "pattern on the Message column");
    const expect = w.getEntries(ctx.id).filter(e => w.normalizeMessagePattern(e.message) === key).length;
    assert(w.getEntries(flt.id).length === expect && expect > 0, "filter keeps the pool entries inside the context: " + expect);
    assert(T.undoStack.length === undoBefore + 1, "one undo step, got +" + (T.undoStack.length - undoBefore));
    w.undo();
    assert(Object.keys(T.state.nodes).length === before && !T.state.nodes[ctx.id] && !T.state.nodes[flt.id], "undo removes both");
    // After direction: context after
    T.state.activeId = err.id; w.render();
    fireClick(btn(d, "data-nb-dir", "after"), w);
    fireClick(btn(d, "data-nb-win", "30000"), w);
    const rows = rowsOf(d);
    if (rows.length) {
      fireClick(rows[0], w);
      const c2 = T.state.nodes[T.state.nodes[T.state.activeId].parentId];
      assert(c2.filterType === "context" && c2.contextBefore === 0 && c2.contextAfter === 30000, "After 30 s: context +30 s only");
    }
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("neighbors-tab e. link node: Reference pairs | without end, defaults, row click");
    const f = await simFile(w, ["motion", "bursts", "basic"], 6000, 7);
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id; T.state.entriesView = "filter"; w.render();
    w.setLowerTab("neighbors");
    const un = link._linkUnmatched, pairs = w.getEntries(link.id);
    assert(un.length > 5 && pairs.length > 50, "pairs and unpaired: " + pairs.length + "/" + un.length);
    assert(!d.querySelector("#nbRefSeg").hidden && w.getComputedStyle(d.querySelector("#nbRefSeg")).display !== "none", "Reference selector shown");
    assert(btn(d, "data-nb-ref", "pairs").getAttribute("aria-pressed") === "true" && btn(d, "data-nb-dir", "before").getAttribute("aria-pressed") === "true", "default: pairs, Before");
    const ep = w.analysisNeighbors(pairs, f.entries, { direction: "before", windowMs: 5000, sameThread: true }).rows.filter(r => r.significant);
    assert(rowsOf(d).length === ep.length, "pairs: engine rows " + rowsOf(d).length + "/" + ep.length);
    assert(new RegExp("^" + pairs.length.toLocaleString("de-DE").replace(/\./g, "\\.") + " references").test(txt(d.querySelector("#nbHead"))), "header counts the pairs: " + txt(d.querySelector("#nbHead")));
    fireClick(btn(d, "data-nb-ref", "noend"), w);
    assert(btn(d, "data-nb-ref", "noend").getAttribute("aria-pressed") === "true" && btn(d, "data-nb-dir", "after").getAttribute("aria-pressed") === "true", "without end: direction defaults to After");
    const eu = w.analysisNeighbors(un, f.entries, { direction: "after", windowMs: 5000, sameThread: true }).rows.filter(r => r.significant);
    assert(eu.length > 0 && rowsOf(d).length === eu.length, "without end: engine rows " + rowsOf(d).length + "/" + eu.length);
    assert(rowsOf(d).some(r => /^Move aborted/.test(cell(r, 4))), "abort variants follow the unpaired requests");
    assert(txt(d.querySelector("#nbHead")).startsWith(un.length + " references"), "header counts the unpaired: " + txt(d.querySelector("#nbHead")));
    // row click on without-end: the pattern filter only, under the root file
    const nodes = Object.keys(T.state.nodes).length, undoN = T.undoStack.length;
    fireClick(rowsOf(d)[0], w);
    const nf = T.state.nodes[T.state.activeId];
    assert(Object.keys(T.state.nodes).length === nodes + 1 && nf.parentId === f.id && nf.filterType === "text" && T.undoStack.length === undoN + 1, "one text filter under the file, one undo step");
    // back on the link: pairs row click = context node around the link node
    T.state.activeId = link.id; w.render();
    assert(btn(d, "data-nb-ref", "pairs").getAttribute("aria-pressed") === "true", "node switch resets the reference to pairs");
    setCheck(w, d.querySelector("#nbShowAll"), true); // nothing needs to stand out before a request: click a dimmed row
    const first = rowsOf(d)[0];
    assert(first, "a pairs row");
    fireClick(first, w);
    const flt = T.state.nodes[T.state.activeId], ctx = T.state.nodes[flt.parentId];
    assert(ctx.filterType === "context" && ctx.parentId === link.id && ctx.contextBefore === 5000, "context node under the link node");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("neighbors-tab f. burst popover 'What came before': override reference, x returns, dropped on a node switch, row click = time range + pattern");
    const f = await simFile(w, ["bursts", "basic", "motion"], 12000, 5);
    T.state.activeId = f.id; w.render();
    const tl = w.analysisTimeline(f.entries);
    const b = tl.bursts[1];
    fireClick(d.querySelectorAll("#minimapBursts .minimap-burst")[1], w);
    const act = d.querySelector('#burstPopActions [data-burst-act="before"]');
    assert(act && act.textContent === "What came before", "popover action present");
    fireClick(act, w);
    assert(d.querySelector("#burstPopover").classList.contains("hidden"), "popover closed");
    assert(d.querySelector("#lowerTabNeighbors").getAttribute("aria-selected") === "true", "Neighbors tab opened");
    const first = f.entries.find(e => e.ts === b.from);
    const eng = w.analysisNeighbors([first], f.entries, { direction: "before", windowMs: 5000, sameThread: true });
    const chip = d.querySelector("#nbHead .nb-override");
    assert(chip && txt(chip).startsWith("Burst ") && chip.querySelector("#nbOverrideClear"), "override chip with x: " + (chip && txt(chip)));
    assert(/^1 reference · 5 s before/.test(txt(d.querySelector("#nbHead")).replace(chip ? txt(chip) : "", "").trim()), "header: " + txt(d.querySelector("#nbHead")));
    assert(btn(d, "data-nb-dir", "before").getAttribute("aria-pressed") === "true" && btn(d, "data-nb-win", "5000").getAttribute("aria-pressed") === "true", "Before, 5 s");
    const sig = eng.rows.filter(r => r.significant);
    const rows = rowsOf(d);
    assert(rows.length === sig.length, "rows are the engine's on the single entry: " + rows.length + "/" + sig.length);
    assert(rows.every(r => /^1\/1$/.test(cell(r, 0))), "coverage 1/1");
    if (rows.length) {
      const nodes = Object.keys(T.state.nodes).length, undoN = T.undoStack.length;
      fireClick(rows[0], w);
      const flt = T.state.nodes[T.state.activeId], tr = T.state.nodes[flt.parentId];
      assert(Object.keys(T.state.nodes).length === nodes + 2 && tr.filterType === "timerange" && tr.parentId === f.id && tr.value.from === first.ts - 5000 && tr.value.to === first.ts, "time range [start-5s, start] + pattern filter");
      assert(T.undoStack.length === undoN + 1, "one undo step");
      w.undo();
      assert(Object.keys(T.state.nodes).length === nodes, "undo removes both");
    }
    // x returns to the node's own entries: a file node -> select a filter node
    T.state.activeId = f.id; w.render();
    assert(!d.querySelector("#nbHead .nb-override"), "(the earlier node switch already dropped it)");
    fireClick(d.querySelectorAll("#minimapBursts .minimap-burst")[1], w);
    fireClick(d.querySelector('#burstPopActions [data-burst-act="before"]'), w);
    fireClick(d.querySelector("#nbOverrideClear"), w);
    assert(!d.querySelector("#nbHead .nb-override") && /^Select a filter node/.test(txt(d.querySelector("#nbTable .nb-empty"))), "x drops the override");
    // override dropped on a node switch
    fireClick(d.querySelectorAll("#minimapBursts .minimap-burst")[1], w);
    fireClick(d.querySelector('#burstPopActions [data-burst-act="before"]'), w);
    assert(d.querySelector("#nbHead .nb-override"), "override set again");
    const errs = w.createFilterNode(f.id, "level", ["ERROR"]);
    T.state.activeId = errs.id; w.render();
    assert(!d.querySelector("#nbHead .nb-override"), "dropped when the active node changes");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("neighbors-tab g. computed lazily and cached per setting");
    const { f, err } = await errNode(w, d, T);
    let calls = 0;
    const orig = w.analysisNeighbors;
    w.analysisNeighbors = function () { calls++; return orig.apply(this, arguments); };
    w.render(); w.render();
    assert(calls === 0, "renders reuse the cached result: " + calls);
    fireClick(btn(d, "data-nb-dir", "after"), w);
    assert(calls === 1, "a changed setting computes once: " + calls);
    fireClick(btn(d, "data-nb-dir", "before"), w);
    assert(calls === 1, "going back hits the cache (per direction): " + calls);
    w.setLowerTab("detail");
    w.analysisNeighbors = orig;
    fireClick(d.querySelector("#lowerTabFacets"), w);
    calls = 0;
    w.analysisNeighbors = function () { calls++; return orig.apply(this, arguments); };
    w.render();
    assert(calls === 0, "no computation while another tab shows");
    w.analysisNeighbors = orig;
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("neighbors-tab h. a big file is computed in a deferred step behind 'Computing…'");
    const f = await simFile(w, ["causechain", "basic"], 60000, 3);
    const err = w.createFilterNode(f.id, "text", "Order processing failed");
    T.state.activeId = err.id; w.render();
    w.setLowerTab("neighbors");
    assert(f.entries.length > 50000, "file above the synchronous limit: " + f.entries.length);
    assert(txt(d.querySelector("#nbTable .nb-empty")) === "Computing…" && !rowsOf(d).length, "first draw: Computing…, got " + txt(d.querySelector("#nbTable")));
    w.render();
    assert(txt(d.querySelector("#nbTable .nb-empty")) === "Computing…", "a re-render while pending stays on Computing…");
    await waitFor(() => rowsOf(d).length > 0, 20000);
    assert(poolRow(d), "rows arrive: the pool pattern is there");
    let calls = 0;
    const orig = w.analysisNeighbors;
    w.analysisNeighbors = function () { calls++; return orig.apply(this, arguments); };
    w.render();
    assert(calls === 0 && rowsOf(d).length > 0, "cached afterwards");
    w.analysisNeighbors = orig;
  }, { indexedDB: new IDBFactory() });
}
