// GROUP link-tree-view - loaded by philogg.regression.test.js
// (tests/README.md -> "Group files").

/* ============================================================
   GROUP link-tree-view - Link view: Tree layout for nested links
   Origin: 2026-10-10 (person-requested, step 1: tree model, rendering, toolbar).
   A nested link (linkPairing "nested", single step) starts in a Tree: one row per pair, nested by time
   containment, expandable/collapsible, with Start / End / Δt and a share-of-parent bar; a List | Tree toggle
   switches to the pair blocks. Simulator data only: scenario `flows`, seed 7, 800 entries (175 pairs,
   5 starts without end, 33 roots, depth 3; PickPart R-00004 contains Inspect R-00005 which contains
   Inspect R-00006 which contains PlacePart R-00007 and Retry R-00008).
     a  default Tree + header/toggle/buttons for nested, none of it for a nearest link
     b  tree shape from the data
     c  collapse / "N nested" pill / Collapse all / Expand all and their disabled reasons
     d  Sort Δt: siblings per parent, tree kept
     e  "N without end" chip: leaves inline, "only" is the flat list
     f  selection survives collapses; collapsing its ancestor selects the ancestor
     g  double-click End cell / row, right-click, Start/End cell texts
     h  List toggle, node switch resets view and collapsed set
     i  share-of-parent bar geometry
     j  keyboard: -> / <- expand, collapse, first child, parent (also with Sort by Δt), scrolling, list mode untouched
     k  narrow panel (<= 520px) and phone layout: no Start column, no share bar, tighter indentation
   ============================================================ */
group("link-tree-view");

if (groupSelected()) {
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const runOf = it => /run=(R-\d+)/.exec(it.pair.first.message)[1];
  const rowsDom = d => [...d.querySelectorAll("#linkBody .link-trow")];
  const rowOfRun = (d, T, run) => rowsDom(d).find(r => runOf(T.linkPairsData[+r.dataset.pairIndex]) === run);
  const chevronOf = row => row.querySelector(".tree-chevron");
  // parent key per row key, derived from the flat row order and the depths
  const parentMap = rows => {
    const m = new Map(), path = [];
    for (const it of rows) {
      path.length = it.depth;
      m.set(it.key, it.depth ? path[it.depth - 1] : null);
      path[it.depth] = it.key;
    }
    return m;
  };
  async function flowsLink(w, d, T) {
    const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 800, seed: 7 });
    const f = await w.addFile(sim.name, sim.text, () => {});
    const start = w.createFilterNode(f.id, "text", "Flow [*] started");
    const end = w.createFilterNode(f.id, "text", "Flow [*] ended");
    const link = w.createLinkNode(start.id, end.id, "after", 1, { pairing: "nested", key: { wildcards: [[0, 0]] } });
    T.state.activeId = link.id;
    T.state.entriesView = "filter";
    T.state.focusRegion = "entries";
    w.render();
    return { f, start, end, link };
  }
  const sel = T => (T.linkSelectedPairIndex == null ? null : T.linkPairsData[T.linkSelectedPairIndex]);

  await withApp(async (w, d, T) => {
    section("link-tree-view a. nested link: Tree by default with header, toggle, expand/collapse; nearest link: none of it");
    const { f, start, end, link } = await flowsLink(w, d, T);
    assert(w.getEntries(link.id).length === 175 && link._linkUnmatched.length === 5, "sanity: 175 pairs, 5 without end");
    assert(T.linkTreeMode === true && T.linkViewMode === "tree", "a nested link starts in Tree");
    assert(rowsDom(d).length > 10 && !d.querySelector("#linkBody .pair-block"), "tree rows are rendered, no pair blocks");
    assert(isVisible(d.querySelector("#linkTreeHead"), w), "column header visible");
    assert([...d.querySelectorAll("#linkTreeHead > span")].map(txt).join(" · ") === "Pair · Start · End · Δt · Share of parent", "column header texts");
    const seg = d.querySelector("#linkViewSeg");
    assert(isVisible(seg, w) && txt(d.querySelector("#linkViewLab")) === "View", "View toggle with its group label");
    const segBtn = k => seg.querySelector('[data-link-view="' + k + '"]');
    assert(txt(segBtn("list")) === "List" && txt(segBtn("tree")) === "Tree" && segBtn("tree").getAttribute("aria-pressed") === "true" && segBtn("list").getAttribute("aria-pressed") === "false", "List | Tree, Tree pressed");
    const ex = d.querySelector("#linkExpandAll"), co = d.querySelector("#linkCollapseAll");
    assert(isVisible(ex, w) && isVisible(co, w) && ex.title.startsWith("Expand all") && co.title.startsWith("Collapse all"), "expand/collapse buttons visible with their titles");
    assert(ex.querySelector("svg") && co.querySelector("svg"), "buttons carry the expand-all / collapse-all icons");
    assert(txt(d.querySelector("#linkHintText")) === "Click a pair to select · click \u25B8 to expand · double-click a row to jump to its start, the End time to its end", "tree hint (mouse): " + txt(d.querySelector("#linkHintText")));
    // a nearest link: blocks, none of the tree controls
    const near = w.createLinkNode(start.id, end.id, "after", 1);
    T.state.activeId = near.id; w.render();
    assert(T.linkTreeMode === false && d.querySelector("#linkBody .pair-block") && !d.querySelector("#linkBody .link-trow"), "nearest link: blocks, no tree rows");
    assert(!isVisible(d.querySelector("#linkTreeHead"), w) && !isVisible(seg, w) && !isVisible(d.querySelector("#linkViewLab"), w), "nearest link: no header, no toggle");
    assert(!isVisible(ex, w) && !isVisible(co, w), "nearest link: no expand/collapse buttons");
    assert(txt(d.querySelector("#linkHintText")).includes("right-click for actions"), "nearest link: today's hint");
    // touch hint in tree mode
    T.state.activeId = link.id;
    w.matchMedia = q => ({ matches: /pointer:\s*coarse/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.render();
    assert(txt(d.querySelector("#linkHintText")) === "Tap a pair to select · tap \u25B8 to expand · double-tap to jump to it", "tree hint (touch): " + txt(d.querySelector("#linkHintText")));
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view b. tree shape: 33 roots, depth 3, R-00004 > R-00005 > R-00006 > (R-00007, R-00008), all expanded");
    await flowsLink(w, d, T);
    const rows = T.linkPairsData;
    assert(rows.length === 175 && rows.every(it => it.tree !== false), "all 175 pairs are rows (everything expanded)");
    assert(rows.filter(it => it.depth === 0).length === 33, "33 roots, got " + rows.filter(it => it.depth === 0).length);
    // reference: a root is a pair that no other pair contains
    const ps = rows.map(it => it.pair);
    const contained = p => ps.some((o, j) => o !== p && p.tsMin >= o.tsMin && p.tsMax <= o.tsMax && !(p.tsMin === o.tsMin && p.tsMax === o.tsMax && j > ps.indexOf(p)));
    assert(ps.filter(p => !contained(p)).length === 33, "reference count of pairs contained in no other pair: 33");
    assert(Math.max(...rows.map(it => it.depth)) === 3, "max depth 3");
    const parents = parentMap(rows);
    const keyOf = run => rows.find(it => runOf(it) === run).key;
    assert(parents.get(keyOf("R-00005")) === keyOf("R-00004"), "R-00004 contains R-00005");
    assert(parents.get(keyOf("R-00006")) === keyOf("R-00005"), "R-00005 contains R-00006");
    assert(parents.get(keyOf("R-00007")) === keyOf("R-00006") && parents.get(keyOf("R-00008")) === keyOf("R-00006"), "R-00006 has the children R-00007 and R-00008");
    assert(parents.get(keyOf("R-00004")) === null, "R-00004 is a root");
    // time containment is the rule: every child lies inside its parent, rows are in start order per level
    const byKey = new Map(rows.map(it => [it.key, it]));
    assert(rows.every(it => { const p = parents.get(it.key); if (!p) return true; const pi = byKey.get(p); return it.pair.tsMin >= pi.pair.tsMin && it.pair.tsMax <= pi.pair.tsMax; }), "every child lies inside its parent's span");
    assert(rows.every((it, i) => i === 0 || rows[i - 1].pair.tsMin <= it.pair.tsMin), "pre-order = start order");
    // the pair of equal start: the key is the start entry id and the item shape is kept for the other readers
    assert(rows.every(it => it.key === it.pair.first.id && it.realEntries.length === 2), "key = start entry id, realEntries = [start, end]");
    // hasKids / descendants agree with the flat order
    const r4 = rows.find(it => runOf(it) === "R-00004");
    const i4 = rows.indexOf(r4);
    let n = 0; while (rows[i4 + 1 + n] && rows[i4 + 1 + n].depth > r4.depth) n++;
    assert(r4.hasKids && r4.descendants === n && n >= 4, "R-00004: descendants == the rows below it (" + n + ")");
    // DOM: indent per depth, chevron only on pairs with children, one guide per ancestor level
    const dom = rowsDom(d);
    assert(dom.every(r => { const it = T.linkPairsData[+r.dataset.pairIndex]; return +r.style.getPropertyValue("--d") === it.depth && r.querySelectorAll(".tr-guide").length === it.depth && !!chevronOf(r) === it.hasKids; }), "rendered rows: --d, guides per depth, chevron iff children");
    assert(T.linkBlockOffsets[rows.length] === 175 * T.linkBlockOffsets[1] && T.linkBlockOffsets[1] > 0, "tree rows: uniform row height, no block margin (" + T.linkBlockOffsets[1] + "px each)");
    assert(dom.every(r => parseInt(r.style.height, 10) === T.linkBlockOffsets[1]), "rendered rows carry exactly that height");
    assert(!d.querySelector("#linkBody .pair-row"), "tree rows are not .pair-row (pair pick mode is not offered on them)");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view c. collapse / pill / Collapse all / Expand all");
    await flowsLink(w, d, T);
    const ex = d.querySelector("#linkExpandAll"), co = d.querySelector("#linkCollapseAll");
    assert(ex.disabled && ex.getAttribute("data-disabled-reason") === "nothing left to expand" && !co.disabled, "all expanded: Expand all disabled with its reason, Collapse all enabled");
    const before = T.linkPairsData.length;
    const r4 = T.linkPairsData.find(it => runOf(it) === "R-00004");
    const desc = r4.descendants;
    fireClick(chevronOf(rowOfRun(d, T, "R-00004")), w);
    assert(T.linkPairsData.length === before - desc, "collapsing R-00004 removes its " + desc + " descendants (" + T.linkPairsData.length + ")");
    assert(!T.linkPairsData.some(it => ["R-00005", "R-00006", "R-00007", "R-00008"].includes(runOf(it))), "R-00005..R-00008 are gone");
    const row4 = rowOfRun(d, T, "R-00004");
    assert(chevronOf(row4).title === "Expand" && !chevronOf(row4).classList.contains("expanded"), "chevron: Expand, rotated");
    const pill = row4.querySelector(".tr-nested");
    assert(pill && txt(pill) === desc + " nested", "pill says '" + desc + " nested': " + (pill && txt(pill)));
    assert(!ex.disabled && T.linkTreeCollapsed.size === 1, "Expand all enabled now");
    fireClick(pill, w);
    assert(T.linkPairsData.length === before && !rowOfRun(d, T, "R-00004").querySelector(".tr-nested"), "pill click expands again");
    // Collapse all
    fireClick(co, w);
    assert(T.linkPairsData.length === 33 && T.linkPairsData.every(it => it.depth === 0), "Collapse all: the 33 roots, got " + T.linkPairsData.length);
    assert(co.disabled && co.getAttribute("data-disabled-reason") === "nothing expanded" && !ex.disabled, "Collapse all disabled with its reason, Expand all enabled");
    assert(T.linkPairsData.filter(it => it.hasKids).every(it => it.collapsed), "every parent shows collapsed");
    const r4row = rowOfRun(d, T, "R-00004");
    assert(txt(r4row.querySelector(".tr-nested")) === desc + " nested", "roots count ALL descendants in the pill");
    // a nested pair can be opened one level at a time: expand R-00004 only
    fireClick(r4row.querySelector(".tr-nested"), w);
    const kids4 = T.linkPairsData.filter((it, i, a) => it.depth === 1 && a.slice(0, i).reverse().find(x => x.depth === 0).key === r4.key);
    assert(kids4.length >= 1 && kids4.some(it => runOf(it) === "R-00005"), "expanding R-00004 shows its direct children (R-00005 among them)");
    assert(T.linkPairsData.find(it => runOf(it) === "R-00005").collapsed, "its children stay collapsed");
    fireClick(ex, w);
    assert(T.linkPairsData.length === 175 && T.linkTreeCollapsed.size === 0, "Expand all: 175 rows");
    assert(ex.disabled && !co.disabled, "buttons back to the initial state");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view c2. collapse keeps the scroll position");
    await flowsLink(w, d, T);
    const sc = d.querySelector("#linkScroll");
    sc.scrollTop = 26 * 20;
    w.renderLinkVisibleBlocks();
    const row = rowsDom(d).find(r => chevronOf(r));
    fireClick(chevronOf(row), w);
    assert(sc.scrollTop === 26 * 20, "scrollTop untouched by a toggle, got " + sc.scrollTop);
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view d. Sort Δt: siblings per parent, the tree stays");
    await flowsLink(w, d, T);
    const timeRows = T.linkPairsData.slice();
    const timeParents = parentMap(timeRows);
    fireClick(d.querySelector('#linkSortSeg [data-link-sort="dt"]'), w);
    const rows = T.linkPairsData;
    assert(rows.length === 175 && T.linkTreeMode, "still the tree with all rows");
    const parents = parentMap(rows);
    assert([...timeParents].every(([k, p]) => parents.get(k) === p) && parents.size === timeParents.size, "parent/child relations unchanged");
    // siblings under the same parent are in descending Δt
    const byParent = new Map();
    for (const it of rows) { const p = parents.get(it.key); if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(it); }
    assert([...byParent.values()].every(sib => sib.every((it, i) => i === 0 || sib[i - 1].pair.dtMs >= it.pair.dtMs)), "each parent's children are in descending Δt");
    const roots = byParent.get(null);
    assert(roots.length === 33 && roots[0].pair.dtMs === Math.max(...roots.map(r => r.pair.dtMs)), "roots: the slowest first");
    assert(rows.some((it, i) => i && it.depth > 0 && rows[i - 1].pair.tsMin > it.pair.tsMin), "sanity: the order differs from the time order somewhere below a root");
    // children still directly follow their parent (pre-order)
    assert(rows.every((it, i) => it.depth === 0 || rows[i - 1].depth >= it.depth - 1), "pre-order: a row is never deeper than its predecessor + 1");
    fireClick(d.querySelector('#linkSortSeg [data-link-sort="time"]'), w);
    assert(T.linkPairsData.map(it => it.key).join() === timeRows.map(it => it.key).join(), "Time restores the original order");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view e. 'without end' chip: leaves inline, 'only' = flat list");
    const { link } = await flowsLink(w, d, T);
    const chip = d.querySelector("#linkUnChip");
    assert(!T.linkPairsData.some(it => it.unmatched), "chip off: no starts without end in the tree");
    fireClick(chip, w);
    const rows = T.linkPairsData;
    assert(T.linkTreeMode && rows.length === 180 && rows.filter(it => it.unmatched).length === 5, "inline: 175 + 5 rows");
    const parents = parentMap(rows);
    assert(rows.every(it => !it.hasKids || !it.unmatched) && rows.filter(it => it.unmatched).every(it => !it.hasKids && !it.collapsed), "a start without end is a leaf, never a parent");
    const kidsOf = new Set([...parents.values()]);
    assert(!rows.some(it => it.unmatched && kidsOf.has(it.key)), "no row hangs below a start without end");
    // inside the tree at its time position: its parent (if any) contains its start
    const byKey = new Map(rows.map(it => [it.key, it]));
    assert(rows.filter(it => it.unmatched).every(it => { const p = parents.get(it.key); return !p || (byKey.get(p).pair.tsMin <= it.pair.ts && it.pair.ts <= byKey.get(p).pair.tsMax); }), "each lies inside its parent's span");
    // the starts without end sit further down: scroll the first one into the rendered window
    const firstOpen = rows.findIndex(it => it.unmatched);
    d.querySelector("#linkScroll").scrollTop = firstOpen * T.linkBlockOffsets[1];
    w.renderLinkVisibleBlocks();
    const dom = rowsDom(d);
    const open = dom.find(r => r.classList.contains("tr-open"));
    assert(open, "an unmatched row is rendered in the first window");
    assert(txt(open.querySelector(".tr-endt")) === "\u2014" && txt(open.querySelector(".tr-dt")) === "\u2014" && open.querySelector(".tr-dt").classList.contains("miss"), "End and Δt are '—' in the warn colour");
    assert(txt(open.querySelector(".tr-miss")) === "\u00B7 " + w.linkMissingText || /^· no .+ found$/.test(txt(open.querySelector(".tr-miss"))), "text '· no … found': " + txt(open.querySelector(".tr-miss")));
    assert(open.querySelector(".tr-bar i.open") && !chevronOf(open) && open.querySelector(".tr-dot"), "dashed bar, hollow dot slot, no chevron");
    assert(+parseFloat(open.querySelector(".tr-bar i").style.left) + parseFloat(open.querySelector(".tr-bar i").style.width) > 99.8, "the dashed bar runs to the end of the parent's span");
    // Sort Δt with the chip on: within one parent the starts without end come first, then the pairs by Δt
    fireClick(d.querySelector('#linkSortSeg [data-link-sort="dt"]'), w);
    const dtRows = T.linkPairsData, dtParents = parentMap(dtRows);
    const sibs = new Map();
    for (const it of dtRows) { const p = dtParents.get(it.key); if (!sibs.has(p)) sibs.set(p, []); sibs.get(p).push(it); }
    assert(dtRows.length === 180 && [...sibs.values()].every(sib => sib.every((it, i) => i === 0 || sib[i - 1].unmatched || (!it.unmatched && sib[i - 1].pair.dtMs >= it.pair.dtMs))), "Δt + inline: unmatched first per level, then descending Δt");
    fireClick(d.querySelector('#linkSortSeg [data-link-sort="time"]'), w);
    // collapse all keeps the unmatched roots as rows
    fireClick(d.querySelector("#linkCollapseAll"), w);
    assert(T.linkPairsData.filter(it => it.unmatched).length >= 1 && T.linkPairsData.length < 180 && T.linkPairsData.filter(it => !it.unmatched && it.depth === 0).length === 33, "Collapse all with the chip on: the roots and the unmatched ones left");
    fireClick(d.querySelector("#linkExpandAll"), w);
    // only: flat list as today
    fireClick(chip, w);
    assert(T.linkTreeMode === false && T.linkPairsData.length === 5 && T.linkPairsData.every(it => it.unmatched), "'only': the 5 unmatched, List rendering");
    assert(d.querySelectorAll("#linkBody .pair-block").length === 5 && !d.querySelector("#linkBody .link-trow"), "'only' renders pair blocks");
    assert(!isVisible(d.querySelector("#linkTreeHead"), w) && !isVisible(d.querySelector("#linkExpandAll"), w), "no column header and no expand/collapse buttons then");
    assert(isVisible(d.querySelector("#linkViewSeg"), w) && d.querySelector('#linkViewSeg [data-link-view="tree"]').getAttribute("aria-pressed") === "true", "the toggle stays and still says Tree");
    fireClick(chip, w);
    assert(T.linkTreeMode === true && T.linkPairsData.length === 175, "chip off: the tree is back");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view f. selection by key: survives a collapse elsewhere, collapsing its ancestor selects the ancestor");
    await flowsLink(w, d, T);
    fireClick(rowOfRun(d, T, "R-00008"), w);
    assert(sel(T) && runOf(sel(T)) === "R-00008" && rowOfRun(d, T, "R-00008").classList.contains("pair-selected"), "click selects R-00008");
    assert(w.minimapMarkedEntries().length === 2 && w.minimapMarkedEntries()[0] === sel(T).pair.first, "the minimap marks its start and end entry");
    const idxBefore = T.linkSelectedPairIndex;
    // scrolls the row of `key` into the rendered window and returns its element
    const domRowOf = key => {
      d.querySelector("#linkScroll").scrollTop = T.linkPairsData.findIndex(x => x.key === key) * T.linkBlockOffsets[1];
      w.renderLinkVisibleBlocks();
      return rowsDom(d).find(r => r.dataset.key === key);
    };
    // collapse an unrelated root below the selection: the selection stays where it is
    const below = T.linkPairsData.find((it, i) => i > idxBefore && it.depth === 0 && it.hasKids);
    assert(below, "sanity: a collapsible root below the selection");
    fireClick(chevronOf(domRowOf(below.key)), w);
    assert(T.linkTreeCollapsed.has(below.key) && sel(T) && runOf(sel(T)) === "R-00008" && T.linkSelectedPairIndex === idxBefore, "selection survives a collapse below it");
    // collapse a root ABOVE the selection: the index moves up, the selection stays
    const above = T.linkPairsData.find((it, i) => i < idxBefore && it.depth === 0 && it.hasKids && runOf(it) !== "R-00004");
    assert(above, "sanity: a collapsible root above the selection");
    fireClick(chevronOf(domRowOf(above.key)), w);
    assert(sel(T) && runOf(sel(T)) === "R-00008" && T.linkSelectedPairIndex < idxBefore, "index re-derived from the key after a collapse above it");
    // collapse its ancestor R-00005: the selection moves to R-00005
    fireClick(chevronOf(rowOfRun(d, T, "R-00005")), w);
    assert(sel(T) && runOf(sel(T)) === "R-00005", "collapsing an ancestor selects the ancestor, got " + (sel(T) && runOf(sel(T))));
    assert(rowOfRun(d, T, "R-00005").classList.contains("pair-selected"), "the ancestor's row is shown selected");
    assert(w.minimapMarkedEntries()[0] === sel(T).pair.first, "minimap follows");
    // Collapse all: the selection climbs to its root
    fireClick(d.querySelector("#linkCollapseAll"), w);
    assert(sel(T) && runOf(sel(T)) === "R-00004", "Collapse all: the selection becomes its root R-00004, got " + (sel(T) && runOf(sel(T))));
    // Up/Down move over the visible rows
    w.moveLinkSelection(1);
    assert(sel(T).depth === 0 && runOf(sel(T)) !== "R-00004", "Down moves to the next visible row");
    // the sort change keeps the selection by key too
    const k = sel(T).key;
    fireClick(d.querySelector("#linkExpandAll"), w);
    assert(sel(T) && sel(T).key === k, "Expand all keeps the selection");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view g. Start/End cells, double-click End -> end entry, double-click row -> start entry, right-click");
    await flowsLink(w, d, T);
    const row = rowOfRun(d, T, "R-00005");
    const it = T.linkPairsData[+row.dataset.pairIndex];
    const tod = e => w.formatTime(e.ts).replace(/^\d{4}-\d\d-\d\d /, "");
    assert(txt(row.querySelector(".tr-startt")) === tod(it.pair.first) && txt(row.querySelector(".tr-endt")) === tod(it.pair.second), "Start/End cells: time of day without the date");
    assert(/^\d\d:\d\d:\d\d\.\d{3}$/.test(txt(row.querySelector(".tr-startt"))), "format hh:mm:ss.mmm");
    assert(row.title === w.formatTime(it.pair.first.ts) + " \u2192 " + w.formatTime(it.pair.second.ts), "the row title carries the full timestamps: " + row.title);
    assert(txt(row.querySelector(".tr-dt")) === w.formatMs(it.pair.dtMs), "Δt cell");
    assert(txt(row.querySelector(".tr-msg")) === it.pair.first.message + " \u27F6 " + it.pair.second.message, "message: start ⟶ end");
    // End cell
    fireClick(row.querySelector(".tr-endt"), w);
    fireDblClick(row.querySelector(".tr-endt"), w);
    assert(T.state.entriesView === "highlight" && T.state.selectedId === it.pair.second.id, "double-click on End reveals the end entry in the Context view");
    T.state.entriesView = "filter"; T.state.focusRegion = "entries"; w.render();
    const row2 = rowOfRun(d, T, "R-00005");
    fireClick(row2.querySelector(".tr-msg"), w);
    fireDblClick(row2.querySelector(".tr-msg"), w);
    assert(T.state.entriesView === "highlight" && T.state.selectedId === it.pair.first.id, "double-click on the message reveals the start entry");
    T.state.entriesView = "filter"; T.state.focusRegion = "entries"; w.render();
    const row3 = rowOfRun(d, T, "R-00005");
    fireDblClick(row3.querySelector(".tr-startt"), w);
    assert(T.state.selectedId === it.pair.first.id, "double-click on Start reveals the start entry");
    T.state.entriesView = "filter"; w.render();
    // a chevron double-click does not jump
    const selBefore = T.state.selectedId;
    const row4 = rowOfRun(d, T, "R-00004");
    fireDblClick(chevronOf(row4), w);
    assert(T.state.entriesView === "filter" && T.state.selectedId === selBefore, "double-click on a chevron does not reveal");
    // right-click: the combined pair entry
    fireContextMenu(rowOfRun(d, T, "R-00005").querySelector(".tr-msg"), w);
    const menu = d.querySelector("#contextMenu");
    assert(!menu.classList.contains("hidden") && /\d\d:\d\d:\d\d/.test(txt(menu.querySelector(".ctx-meta"))), "right-click opens the context menu");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view h. List toggle; node switch resets the view and the collapsed set");
    const { f, start, end, link } = await flowsLink(w, d, T);
    const segBtn = k => d.querySelector('#linkViewSeg [data-link-view="' + k + '"]');
    fireClick(chevronOf(rowOfRun(d, T, "R-00004")), w);
    const collapsedRows = T.linkPairsData.length;
    assert(T.linkTreeCollapsed.size === 1 && collapsedRows < 175, "sanity: one collapsed pair");
    fireClick(segBtn("list"), w);
    assert(T.linkViewMode === "list" && T.linkTreeMode === false && segBtn("list").getAttribute("aria-pressed") === "true", "List selected");
    assert(T.linkPairsData.length === 175 && d.querySelectorAll("#linkBody .pair-block").length > 5 && !d.querySelector("#linkBody .link-trow"), "List: today's pair blocks, all 175 pairs");
    assert(T.linkPairsData.every((x, i, a) => i === 0 || a[i - 1].pair.ts <= x.pair.ts), "List: time order as before");
    assert(!isVisible(d.querySelector("#linkTreeHead"), w) && !isVisible(d.querySelector("#linkExpandAll"), w) && !isVisible(d.querySelector("#linkCollapseAll"), w), "List: no header, no expand/collapse buttons");
    assert(isVisible(d.querySelector("#linkViewSeg"), w), "List: the toggle stays");
    assert(txt(d.querySelector("#linkHintText")).includes("right-click for actions"), "List: today's hint");
    fireClick(segBtn("tree"), w);
    assert(T.linkTreeMode && T.linkPairsData.length === collapsedRows, "back in Tree: the collapsed pair is still collapsed (display state kept while the node stays active)");
    // switching the active node resets the mode and the collapsed set
    fireClick(segBtn("list"), w);
    const near = w.createLinkNode(start.id, end.id, "after", 1);
    T.state.activeId = near.id; w.render();
    T.state.activeId = link.id; w.render();
    assert(T.linkViewMode === "tree" && T.linkTreeMode === true && T.linkTreeCollapsed.size === 0 && T.linkPairsData.length === 175, "node switch: back to Tree, nothing collapsed");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view i. share-of-parent bar geometry");
    await flowsLink(w, d, T);
    const rows = T.linkPairsData;
    const parents = parentMap(rows);
    const byKey = new Map(rows.map(it => [it.key, it]));
    const bar = run => { const r = rowOfRun(d, T, run); const i = r.querySelector(".tr-bar i"); return { title: r.querySelector(".tr-bar").title, left: parseFloat(i.style.left), width: parseFloat(i.style.width), cls: i.className }; };
    const check = (run) => {
      const it = rows.find(x => runOf(x) === run), p = byKey.get(parents.get(it.key));
      const span = p.pair.tsMax - p.pair.tsMin;
      const b = bar(run);
      const wantW = Math.max(1.5, it.pair.dtMs / span * 100), wantL = (it.pair.tsMin - p.pair.tsMin) / span * 100;
      assert(Math.abs(b.width - wantW) <= 0.5 && Math.abs(b.left - wantL) <= 0.5, run + ": mark left/width " + b.left + "/" + b.width + " vs " + wantL.toFixed(1) + "/" + wantW.toFixed(1));
      assert(b.title === Math.round(it.pair.dtMs / span * 100) + " % of the enclosing pair", run + ": title " + b.title);
    };
    ["R-00002", "R-00005", "R-00006", "R-00007", "R-00008"].forEach(check);
    const root = bar("R-00004");
    assert(root.title === "top level" && root.left === 0 && root.width === 100, "a root fills the whole track, title 'top level'");
    // the mark never leaves the track, and is at least 1.5 % wide
    const all = rowsDom(d).map(r => r.querySelector(".tr-bar i")).map(i => ({ l: parseFloat(i.style.left), w: parseFloat(i.style.width) }));
    assert(all.every(m => m.l >= 0 && m.w >= 1.5 && m.l + m.w <= 100.05), "marks stay inside the track and are at least 1.5% wide");
    // colour comes from the end entry's level
    const lvl = rowOfRun(d, T, "R-00005").className;
    assert(/lvl-[a-z0-9-]+/.test(lvl), "the row carries the end entry's level class: " + lvl);
  }, { indexedDB: new IDBFactory() });

  const key = (w, d, k, o) => { const ev = new w.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, o)); d.dispatchEvent(ev); return ev; };

  await withApp(async (w, d, T) => {
    section("link-tree-view j. keyboard: -> / <- in the tree");
    await flowsLink(w, d, T);
    const cur = () => runOf(sel(T));
    fireClick(rowOfRun(d, T, "R-00005"), w);
    assert(key(w, d, "ArrowRight").defaultPrevented && cur() === "R-00006", "-> on an expanded pair moves to its first child");
    key(w, d, "ArrowRight");
    assert(cur() === "R-00007", "-> again: its first child R-00007");
    assert(key(w, d, "ArrowRight").defaultPrevented && cur() === "R-00007", "-> on a leaf does nothing (the key is still consumed)");
    key(w, d, "ArrowLeft");
    assert(cur() === "R-00006" && T.linkTreeCollapsed.size === 0, "<- on a leaf moves to its parent");
    key(w, d, "ArrowLeft");
    assert(cur() === "R-00006" && T.linkTreeCollapsed.size === 1 && sel(T).collapsed, "<- on an expanded pair collapses it, the selection stays");
    assert(!T.linkPairsData.some(it => runOf(it) === "R-00007"), "its children are gone");
    key(w, d, "ArrowLeft");
    assert(cur() === "R-00005", "<- on a collapsed pair moves to its parent");
    key(w, d, "ArrowRight"); // R-00006 (collapsed)
    assert(cur() === "R-00006", "-> on R-00005 selects its first child");
    key(w, d, "ArrowRight");
    assert(cur() === "R-00006" && !sel(T).collapsed && T.linkPairsData.some(it => runOf(it) === "R-00007"), "-> on a collapsed pair expands it, the selection stays");
    key(w, d, "ArrowRight");
    assert(cur() === "R-00007", "-> then moves to the first child");
    // a root: <- collapses, <- again does nothing, -> expands
    fireClick(rowOfRun(d, T, "R-00004"), w);
    key(w, d, "ArrowLeft");
    assert(cur() === "R-00004" && sel(T).collapsed, "root: <- collapses");
    key(w, d, "ArrowLeft");
    assert(cur() === "R-00004" && sel(T).collapsed, "root: <- on a collapsed root does nothing");
    key(w, d, "ArrowRight");
    assert(cur() === "R-00004" && !sel(T).collapsed, "root: -> expands");
    // modifiers keep their own meaning
    const prevented = key(w, d, "ArrowRight", { shiftKey: true }).defaultPrevented;
    assert(!prevented && cur() === "R-00004", "Shift+-> is not taken");
    // the selected row is scrolled into view: parent above the viewport
    fireClick(rowOfRun(d, T, "R-00007"), w);
    const sc = d.querySelector("#linkScroll");
    sc.scrollTop = T.linkBlockOffsets[1] * 100;
    key(w, d, "ArrowLeft");
    assert(cur() === "R-00006" && sc.scrollTop === T.linkBlockOffsets[T.linkSelectedPairIndex], "<- scrolls the parent into view (" + cur() + ", " + sc.scrollTop + " vs " + T.linkBlockOffsets[T.linkSelectedPairIndex] + ")");
    sc.scrollTop = 0; w.renderLinkVisibleBlocks();
    // with Sort by Δt the first child is the first one shown (the slowest)
    fireClick(d.querySelector('#linkSortSeg [data-link-sort="dt"]'), w);
    fireClick(rowOfRun(d, T, "R-00006"), w);
    key(w, d, "ArrowRight");
    assert(cur() === "R-00008", "Sort Δt: -> goes to the slowest child R-00008 (266ms before 141ms)");
    // nothing selected: the keys do nothing
    fireClick(d.querySelector('#linkSortSeg [data-link-sort="time"]'), w); // a relayout drops the selection
    assert(T.linkSelectedPairIndex === null && key(w, d, "ArrowRight").defaultPrevented && T.linkSelectedPairIndex === null, "no selection: nothing moves");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view j2. -> / <- are not taken in List mode");
    await flowsLink(w, d, T);
    fireClick(d.querySelector('#linkViewSeg [data-link-view="list"]'), w);
    fireClick(d.querySelector("#linkBody .pair-block"), w);
    assert(T.linkSelectedPairIndex === 0, "sanity: a block is selected");
    assert(!key(w, d, "ArrowRight").defaultPrevented && !key(w, d, "ArrowLeft").defaultPrevented, "List mode: the keys are left alone");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-tree-view k. narrow panel / phone layout: no Start column, no share bar, tighter indentation");
    await flowsLink(w, d, T);
    const wrap = d.querySelector("#linkWrap");
    const widthOf = v => Object.defineProperty(wrap, "clientWidth", { configurable: true, get: () => v });
    const hidden = sel2 => [...d.querySelectorAll(sel2)].length > 0 && [...d.querySelectorAll(sel2)].every(e => !isVisible(e, w));
    const shown = sel2 => [...d.querySelectorAll(sel2)].length > 0 && [...d.querySelectorAll(sel2)].every(e => isVisible(e, w));
    widthOf(900); w.updateLinkNarrow();
    assert(!wrap.classList.contains("link-narrow") && shown("#linkBody .tr-c-start") && shown("#linkBody .tr-c-share") && shown("#linkTreeHead .tr-c-start"), "900px: Start column and share bar shown");
    widthOf(520); w.updateLinkNarrow();
    assert(wrap.classList.contains("link-narrow"), "520px counts as narrow");
    assert(hidden("#linkBody .tr-c-start") && hidden("#linkBody .tr-c-share") && hidden("#linkTreeHead .tr-c-start") && hidden("#linkTreeHead .tr-c-share"), "narrow: Start and share are hidden in the rows and in the header");
    assert(shown("#linkBody .tr-endt") && shown("#linkBody .tr-dt") && [...d.querySelectorAll("#linkTreeHead > span")].filter(e => isVisible(e, w)).length === 3, "narrow: Pair, End and Δt stay");
    const css = [...d.querySelectorAll("style")].map(e => e.textContent).join("").replace(/\s+/g, "");
    assert(css.includes("#linkWrap.link-narrow,body.layout-phone#linkWrap{--link-indent:12px;"), "narrow/phone CSS sets the indentation to 12px");
    widthOf(521); w.updateLinkNarrow();
    assert(!wrap.classList.contains("link-narrow") && shown("#linkBody .tr-c-share"), "521px: back to the full layout");
    widthOf(0); w.updateLinkNarrow();
    assert(!wrap.classList.contains("link-narrow"), "an unmeasured panel is not narrow");
    // phone layout, whatever the width
    d.body.classList.add("layout-phone");
    assert(hidden("#linkBody .tr-c-start") && hidden("#linkBody .tr-c-share") && hidden("#linkTreeHead .tr-c-share"), "phone layout: Start and share hidden");
    d.body.classList.remove("layout-phone");
    assert(shown("#linkBody .tr-c-share"), "sanity: shown again");
  }, { indexedDB: new IDBFactory() });
}
