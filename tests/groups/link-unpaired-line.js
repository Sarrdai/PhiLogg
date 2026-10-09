// GROUP link-unpaired-line — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-unpaired-line — Link view header: "→ typically followed by …" line + Details
   Origin: 2026-10-09 (person-requested, backlog #120 part 1, analysis tools round).
   Next to the "N without end" chip the Link view names what typically follows the
   references without an end (analysisNeighbors, after, same thread, window = p90 of the
   pairs' Δt but at least 1 s, lift ≥ 2 — the computation of create_link's unpairedFollowedBy).
   "Details" lists up to 5 rows (coverage, pattern, median distance); a row click adds the
   message-pattern filter under the root file. No line when nothing is significant or there
   is nothing unpaired. Sample data: tools/log-sim (motion, basic, sensors).
   ============================================================ */
group("link-unpaired-line");

if (groupSelected()) {
  const txt = el => el.textContent.replace(/\s+/g, " ").trim();
  const isHidden = (el, w) => !isVisible(el, w);

  async function motionLink(w, d, T, scenarios, entries, seed, dir) {
    const [file] = LOGSIM.generateToStrings({ scenarios, entries, seed });
    const f = await w.addFile(file.name, file.text, () => {});
    const link = dir === "before"
      ? w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Position reached"), w.bakedTextCondition("Move requested"), "before", 1, { key: { pattern: "job=[*:word]" } })
      : w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Move requested"), w.bakedTextCondition("Position reached"), "after", 1, { key: { pattern: "job=[*:word]" } });
    T.state.activeId = link.id;
    T.state.entriesView = "filter";
    w.render();
    return { f, link };
  }

  await withApp(async (w, d, T) => {
    section("link-unpaired-line a. line + Details rows match the engine and a brute-force count");
    const { f, link } = await motionLink(w, d, T, ["motion", "sensors", "basic", "bursts"], 6000, 7);
    const un = link._linkUnmatched;
    assert(un.length > 5, "enough unpaired references: " + un.length);
    const why = d.querySelector("#linkUnWhy"), btn = d.querySelector("#linkUnWhyBtn"), det = d.querySelector("#linkUnWhyDetails");
    assert(isVisible(why, w) && isVisible(btn, w), "line and Details button shown");
    assert(btn.textContent === "Details" && btn.getAttribute("aria-expanded") === "false" && isHidden(det, w), "Details collapsed by default");
    // Expected rows straight from the engine, computed independently here.
    const pairDts = w.getEntries(link.id).map(p => p.dtMs).sort((a, b) => a - b);
    const win = Math.max(1000, Math.ceil(w.llmPercentile(pairDts, 0.9) || 0));
    const nb = w.analysisNeighbors(un, f.entries, { direction: "after", windowMs: win, sameThread: true, minLift: 2 });
    const rows = nb.rows.filter(r => r.significant).slice(0, 5);
    assert(rows.length >= 2, "several abort variants are significant: " + rows.length);
    const first = w.patternDisplayText(rows[0].patternKey);
    assert(/^Move aborted /.test(first), "top pattern is an abort: " + first);
    assert(txt(why) === "→ typically followed by " + first + " on the same thread (+" + (rows.length - 1) + " more)", "summary: " + txt(why));
    assert(why.querySelector("b .pattern-ph"), "placeholders are highlighted in the summary");
    fireClick(btn, w);
    assert(isVisible(det, w) && btn.getAttribute("aria-expanded") === "true", "Details opens");
    const detRows = [...det.querySelectorAll(".link-un-why-row")];
    assert(detRows.length === rows.length, "one row per pattern: " + detRows.length);
    detRows.forEach((r, i) => {
      assert(txt(r.querySelector(".link-un-why-n")) === rows[i].coverage, "row " + i + " coverage " + rows[i].coverage + ", got " + txt(r.querySelector(".link-un-why-n")));
      assert(txt(r.querySelector(".link-un-why-p")) === w.patternDisplayText(rows[i].patternKey), "row " + i + " pattern text");
      assert(txt(r.querySelector(".link-un-why-m")) === "median " + w.formatMs(rows[i].medianDistMs), "row " + i + " median: " + txt(r.querySelector(".link-un-why-m")));
      assert(r.querySelector(".pattern-ph"), "row " + i + " highlights placeholders");
    });
    assert(rows.every(r => r.coverage.endsWith("/" + un.length)), "coverage is out of the " + un.length + " unpaired");
    // The chip keeps cycling as before; the line stays.
    const chip = d.querySelector("#linkUnChip");
    fireClick(chip, w);
    assert(txt(chip).endsWith("inline") && isVisible(why, w), "chip click unchanged, line stays");
    fireClick(chip, w); fireClick(chip, w);
    // Details toggles closed again
    fireClick(btn, w);
    assert(isHidden(det, w) && btn.getAttribute("aria-expanded") === "false", "Details closes");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-unpaired-line b. a pattern row creates the message filter under the root file (one undo step)");
    const { f, link } = await motionLink(w, d, T, ["motion", "sensors", "basic", "bursts"], 6000, 7);
    fireClick(d.querySelector("#linkUnWhyBtn"), w);
    const row = d.querySelector(".link-un-why-row");
    const key = T.state.nodes[link.id]._unpairedWhy.rows[0].patternKey;
    const before = Object.keys(T.state.nodes).length, undoBefore = T.undoStack.length;
    fireClick(row, w);
    const added = Object.keys(T.state.nodes).length - before;
    const node = T.state.nodes[T.state.activeId];
    assert(added === 1 && node.parentId === f.id && node.filterType === "text", "one text filter node under the root file, got +" + added + " parent " + node.parentId);
    assert(node.value === w.patternFilterValue(key, T.state.nodes[link.id]._unpairedWhy.rows[0].floatMask, false) && node.columns && node.columns.join() === "message", "the pattern filter on the Message column: " + node.value);
    const expect = f.entries.filter(e => w.normalizeMessagePattern(e.message) === key).length;
    assert(w.getEntries(node.id).length === expect && expect > 0, "it matches the pattern's entries (" + expect + ")");
    assert(T.undoStack.length === undoBefore + 1, "one undo step");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-unpaired-line c. no line when nothing is unpaired or nothing stands out");
    // nothing unpaired: every Position reached has an earlier request
    const { link } = await motionLink(w, d, T, ["motion", "sensors"], 3000, 5, "before");
    assert(link._linkUnmatched.length === 0, "no unpaired references");
    assert(isHidden(d.querySelector("#linkUnWhy"), w) && isHidden(d.querySelector("#linkUnWhyBtn"), w) && d.querySelector("#linkUnWhy").textContent === "", "no line, no button");
    // unpaired but no significant follower: pair requests with a thread-less key that never matches
    const f = T.state.nodes[w.getRootFileId(link.id)];
    const none = w.createLinkNodeFromBaked(f.id, w.bakedTextCondition("Sensor T1"), w.bakedTextCondition("no such text anywhere"), "after", 1, {});
    T.state.activeId = none.id; w.render();
    assert(none._linkUnmatched.length > 0, "unpaired exist: " + none._linkUnmatched.length);
    assert(!isHidden(d.querySelector("#linkUnChip"), w), "chip still there");
    assert(isHidden(d.querySelector("#linkUnWhy"), w) && isHidden(d.querySelector("#linkUnWhyBtn"), w), "nothing significant: no line and no button");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("link-unpaired-line d. cached per link result: renders and scrolling do not recompute");
    const { link } = await motionLink(w, d, T, ["motion", "sensors", "basic", "bursts"], 6000, 7);
    let calls = 0;
    const orig = w.analysisNeighbors;
    w.analysisNeighbors = function () { calls++; return orig.apply(this, arguments); };
    const cached = T.state.nodes[link.id]._unpairedWhy;
    w.render(); w.render();
    w.renderLinkVisibleBlocks();
    d.querySelector("#linkScroll").dispatchEvent(new w.Event("scroll"));
    assert(calls === 0 && T.state.nodes[link.id]._unpairedWhy === cached, "re-render and scroll reuse the cached rows (calls: " + calls + ")");
    // a changed result (invalidated node cache) recomputes once
    w.invalidateNodeSubtreeCaches(link.id);
    w.render();
    assert(calls === 1, "invalidated result recomputes once, got " + calls);
    w.render();
    assert(calls === 1, "and is cached again");
    w.analysisNeighbors = orig;
  }, { indexedDB: new IDBFactory() });
}
