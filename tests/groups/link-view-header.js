// GROUP link-view-header — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-view-header — Link view: counts/stats, "N without end" chip, Sort, hint, unmatched blocks
   Origin: 2026-10-04 (link usability round B, step 4). Header: "192 pairs", chip "13 without end"
   cycling off -> inline -> only these (hidden at 0), "median … · max …" over the shown pairs, Sort
   Time | Δt ↓, device hint by pointer type. Unmatched references render as dashed blocks with a
   "no “…” found" line whose height is part of the virtualization offsets; selection, Up/Down,
   Alt+Enter, the minimap markers and the "Pair with…" pick keep working on them.
   ============================================================ */
group("link-view-header");

if (groupSelected()) {
  const TOUR = require(path.join(__dirname, "..", "tools", "log-sim", "tour.js"));
  const tourLog = TOUR.demoLog();
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const chip = d => d.querySelector("#linkUnChip");
  const blocksDom = d => [...d.querySelectorAll("#linkBody .pair-block")];

  async function jobLink(w, d, T) {
    const f = await w.addFile("app.log", tourLog, () => {});
    const link = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id;
    T.state.entriesView = "filter";
    w.render();
    return { f, link };
  }

  await withApp(async (w, d, T) => {
    section("link-view-header a. header: counts, chip cycle, stats, hint");
    const { link } = await jobLink(w, d, T);
    assert(txt(d.querySelector("#linkInfo")) === "192 pairs", "pair count, got " + txt(d.querySelector("#linkInfo")));
    assert(!chip(d).classList.contains("hidden") && txt(chip(d)) === "13 without end" && chip(d).getAttribute("aria-pressed") === "false", "chip: 13 without end, off");
    assert(/^median \S+ · max 3\.9s$/.test(txt(d.querySelector("#linkStats"))), "stats over the shown pairs: " + txt(d.querySelector("#linkStats")));
    assert(T.linkPairsData.length === 192 && !T.linkPairsData.some(x => x.unmatched), "off: only the 192 pairs");
    assert(txt(d.querySelector("#linkHintText")) === "Click a pair to select · right-click for actions · double-click a row to jump to it", "mouse hint: " + txt(d.querySelector("#linkHintText")));
    fireClick(chip(d), w);
    assert(txt(chip(d)) === "13 without end · inline" && chip(d).getAttribute("aria-pressed") === "true", "inline");
    assert(T.linkPairsData.length === 205 && T.linkPairsData.filter(x => x.unmatched).length === 13, "inline: 192 + 13 blocks");
    assert(T.linkPairsData.every((x, i, a) => i === 0 || a[i - 1].pair.ts <= x.pair.ts), "inline blocks sit in time order");
    assert(txt(d.querySelector("#linkInfo")) === "192 pairs" && /max 3\.9s/.test(txt(d.querySelector("#linkStats"))), "count and stats stay about the pairs");
    fireClick(chip(d), w);
    assert(txt(chip(d)) === "only 13 without end" && T.linkPairsData.length === 13 && T.linkPairsData.every(x => x.unmatched), "only: 13 unmatched blocks");
    assert(txt(d.querySelector("#linkStats")) === "", "no pairs shown: no stats");
    fireClick(chip(d), w);
    assert(txt(chip(d)) === "13 without end" && T.linkPairsData.length === 192, "third click: back to off");
    // child filters / export still see pairs only
    assert(w.getEntries(link.id).length === 192, "the node's result is unchanged by the view state");
    const ext = w.createFilterNode(link.id, "text", "Move requested axis=[*:int]");
    assert(w.getEntries(ext.id).length === 192, "a child filter sees the 192 pairs");
    // view state resets when the active link node changes
    fireClick(chip(d), w);
    const other = w.createLinkNodeFromBaked(w.getRootFileId(link.id), w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { column: "thread" } });
    T.state.activeId = other.id; w.render();
    T.state.activeId = link.id; w.render();
    assert(txt(chip(d)) === "13 without end" && T.linkPairsData.length === 192, "chip state resets when the active node changed");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-view-header b. chip hidden at 0 unmatched; touch hint wording");
    const f = await w.addFile("link.log", linkKeyLog(), () => {});
    const l = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("move requested"), w.bakedTextCondition("position reached"), "after", 1, {});
    T.state.activeId = l.id; T.state.entriesView = "filter"; w.render();
    assert(chip(d).classList.contains("hidden"), "0 without end: chip hidden");
    w.matchMedia = q => ({ matches: /pointer:\s*coarse/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.render();
    const hint = txt(d.querySelector("#linkHintText"));
    assert(hint === "Tap a pair to select · long-press for actions · double-tap a row to jump to it", "touch hint: " + hint);
  });

  await withApp(async (w, d, T) => {
    section("link-view-header c. Sort: Time | Δt ↓ (unmatched first in inline mode)");
    await jobLink(w, d, T);
    const sortBtn = k => d.querySelector('#linkSortSeg [data-link-sort="' + k + '"]');
    assert(sortBtn("time").getAttribute("aria-pressed") === "true", "Time is the default sort");
    fireClick(sortBtn("dt"), w);
    assert(sortBtn("dt").getAttribute("aria-pressed") === "true" && T.linkPairsData[0].pair.dtMs === 3930, "Δt ↓: the slowest pair (3.9 s) first");
    assert(T.linkPairsData.every((x, i, a) => i === 0 || a[i - 1].pair.dtMs >= x.pair.dtMs), "descending by Δt");
    fireClick(chip(d), w);
    assert(T.linkPairsData.slice(0, 13).every(x => x.unmatched) && !T.linkPairsData[13].unmatched && T.linkPairsData[13].pair.dtMs === 3930, "inline + Δt: the 13 without end first, then the pairs by Δt");
    fireClick(sortBtn("time"), w);
    assert(T.linkPairsData.every((x, i, a) => i === 0 || a[i - 1].pair.ts <= x.pair.ts), "back to time order");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-view-header d. unmatched blocks: dashed rail, 'no … found' line, exact heights");
    await jobLink(w, d, T);
    fireClick(chip(d), w);
    fireClick(chip(d), w); // only unmatched
    const blocks = blocksDom(d);
    assert(blocks.length > 0 && blocks.every(b => b.classList.contains("pair-unmatched") && b.querySelector(".pair-missing")), "unmatched blocks carry the class and the missing line");
    assert(txt(blocks[0].querySelector(".pair-missing")) === "no “Position reached” found", "line: " + txt(blocks[0].querySelector(".pair-missing")));
    assert(blocks[0].querySelectorAll(".pair-row").length === 1 && blocks[0].querySelector(".pair-row").textContent.includes("Move requested"), "the block shows the real start entry");
    // heights: offsets == what the block's gutter cells add up to (every cell has a fixed inline height) + margin
    const css = [...d.querySelectorAll("style")].map(s => s.textContent).join("").replace(/\s+/g, "");
    assert(css.includes(".pair-block{--pair-dt-w:calc(62px*var(--log-text-scale));--pair-ring:var(--bg-app);display:flex;align-items:stretch;margin-bottom:8px;border-radius:6px;}"), "CSS margin 8px matches the constant");
    const domHeight = b => [...b.querySelector(".pair-gutter").children].reduce((s, c) => s + parseInt(c.style.height, 10), 0) + 8;
    const ok = T.linkPairsData.every((it, i) => i >= blocks.length || domHeight(blocks[i]) === T.linkBlockOffsets[i + 1] - T.linkBlockOffsets[i]);
    assert(ok, "rendered block heights equal the offsets (unmatched: 26 + 26 + 8 = 60px)");
    assert(T.linkBlockOffsets[1] === 60 && T.linkBlockOffsets[13] === 13 * 60, "13 unmatched blocks: 60px each");
    assert(w.linkBlockHeight(2, false) === 60 && w.linkBlockHeight(2, true) === 86 && w.linkBlockHeight(1, true) === 60, "linkBlockHeight(n, unmatched)");
    // inline: mixed offsets (only -> off -> inline)
    fireClick(chip(d), w); fireClick(chip(d), w);
    const exp = T.linkPairsData.reduce((s, it) => s + w.linkBlockHeight(it.realEntries.length, it.unmatched), 0);
    assert(T.linkBlockOffsets[T.linkPairsData.length] === exp && exp === 192 * 60 + 13 * 60, "mixed total height = 192*60 + 13*60, got " + exp);
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-view-header e. selection, Up/Down, Alt+Enter, minimap, pick mode with unmatched blocks");
    const { f, link } = await jobLink(w, d, T);
    fireClick(chip(d), w);
    fireClick(chip(d), w); // only unmatched
    let blocks = blocksDom(d);
    fireClick(blocks[0].querySelector(".pair-gutter"), w);
    assert(T.linkSelectedPairIndex === 0 && blocks[0].classList.contains("pair-selected"), "an unmatched block can be selected");
    assert(w.minimapMarkedEntries().length === 1 && w.minimapMarkedEntries()[0].message.includes("Move requested"), "the minimap marks its start entry");
    w.moveLinkSelection(1);
    assert(T.linkSelectedPairIndex === 1, "Down moves to the next unmatched block");
    w.moveLinkSelection(-1); w.moveLinkSelection(-1);
    assert(T.linkSelectedPairIndex === 0, "Up clamps at the first block");
    const target = w.singleMessageActionEntry();
    assert(target && target === T.linkPairsData[0].pair && target.message.includes("Move requested"), "singleMessageActionEntry yields the reference entry");
    T.state.focusRegion = "entries";
    d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true }));
    assert(!d.querySelector("#filterPopup").classList.contains("hidden") && d.querySelector("#filterInput").value.startsWith("Move requested"), "Alt+Enter opens the filter popup for the reference message");
    w.closeFilterPopup();
    // pick mode: "Pair with…" start on the unmatched start entry, pick a row in the same view
    const startEntry = T.linkPairsData[0].realEntries[0];
    w.startPairPick(startEntry);
    blocks = blocksDom(d);
    fireClick(blocks[1].querySelector(".pair-row"), w);
    assert(/^Δt \+/.test(txt(d.querySelector("#pairPickBanner"))) || /^Δt -/.test(txt(d.querySelector("#pairPickBanner"))), "pick intercepts rows of unmatched blocks: " + txt(d.querySelector("#pairPickBanner")));
    w.cancelPairPick();
    // level filter applies to the unmatched list like to the pairs
    assert(T.linkPairsData.length === 13, "13 unmatched shown");
  }, { indexedDB: new IDBFactory() });
}
