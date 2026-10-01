// GROUP 147 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 147 — the auto-expansion travels with the match navigation
   (person-requested follow-up to GROUP 138: the setting only ever reacted to
   a jump coming FROM the Filtered view — double-click or Enter — while the
   Context view's own ‹ / › arrows, added in the same rework, moved the
   selection without revealing a thing. Asked for: walking match to match
   should reveal the surroundings of the match you land on and put back what
   the previous jump revealed, so the context follows the selection instead
   of piling up behind it — except where lines were revealed or hidden BY
   HAND, which keeps the state the person gave it.)
   UPDATED this session (2026-09-02) for the partial-expansion rework: the
   setting is now the DEFAULT ("Auto expand around the selected row"), and a
   jump reveals a contextExpandStep-wide window per direction rather than
   whole gaps, so the assertions read revealed RANGES instead of gap starts.
     a) an arrow jump reveals a step's worth of lines above and below the
        match it lands on, in whichever gaps that window falls.
     b) the next jump takes the previous one's window back — one window
        travels with the selection — and the newly selected row is centred on
        the REBUILT list, not on its stale pre-expansion index.
     c) walking backwards moves the same window back.
     d) lines revealed by hand are never taken back by a later jump, however
        far away they are and however many jumps happen.
     e) ...including a stretch that was auto-revealed and then touched by
        hand: the hand action is what transfers ownership, not its state.
     f) with "Collapsed" (or "Expanded") picked instead, the arrows leave
        every stretch exactly as it is — this is the setting's behaviour,
        not the nav arrows'.
   Second section (same group): picking another result with the MOUSE reads
   the same way — a plain click on a match row is a jump too — but it must
   not re-position the view the way the arrows do.
     g) a plain click on another match moves the window and the toolbar's
        "n / m" with it.
     h) the clicked row keeps its exact on-screen offset, even though what
        is taken back above it is a completely different size from what is
        revealed there — i.e. the scroll is recomputed against the NEW
        offsets, not left where it was.
     i) a click on a revealed CONTEXT row is not a jump (no result changed),
        and neither is a Ctrl+click, which is a multi-selection gesture and
        must not move the rows out from under the gesture.
   ============================================================ */
group(147);
await withApp(async (w, d, T) => {
  section("147. Context view: the auto-expansion follows the nav arrows");

  // "hit" every 10th line -> matches 0,10,20,30,40,50 and one gap between
  // each pair (plus the trailing one), i.e. gap.start 1,11,21,31,41,51 —
  // every one of them 9 lines long, i.e. shorter than the 10-line step, so a
  // window that reaches a gap at all reveals it end to end.
  const f = await w.addFile("ctxjump.log", makeLog(0, 60, { suffix: i => (i % 10 === 0 ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f.id, "text", "hit");
  // render() auto-reveals the Filtered tab on every activeId change, so the
  // Context panel has to be re-shown after each node switch (see GROUP 138).
  const showContext = () => { w.render(); w.applyFhView("highlight"); };
  T.state.activeId = hitFilter.id;
  showContext();

  const openRanges = () => [...T.contextExpansions.keys()].sort((a, b) => a - b)
    .map(k => T.contextExpansions.get(k).map(r => r.from + "-" + r.to).join(",")).join("|");
  const rowFor = id => d.querySelector('#highlightRows [data-entry-id="' + id + '"]');
  assert(T.contextInitialExpansion === "aroundJump", "sanity: the auto-expand default is what this group is about");
  assert(T.contextGaps.map(g => g.start).join(",") === "1,11,21,31,41,51",
    "fixture sanity: six matches, six gaps, got " + T.contextGaps.map(g => g.start).join(","));
  assert(T.contextExpansions.size === 0,
    "auto-expand still SEEDS with nothing revealed — it is a reaction to jumps, not an initial state of its own");

  // --- (a) an arrow jump reveals a window around the match it lands on ----
  T.state.selectedId = f.entries[0].id;
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "ArrowDown", { ctrlKey: true }); // the real shortcut, not just the toolbar's handler
  assert(T.state.selectedId === f.entries[10].id, "sanity: Ctrl+ArrowDown moved to the next match");
  assert(openRanges() === "1-10|11-20",
    "landing on a match reveals a step above and a step below it, got " + openRanges());
  assert(T.currentHighlightViewEntries.some(e => e.id === f.entries[5].id),
    "…so the lines around the new match really are in the view now");

  // --- (b) the next jump moves that window along instead of piling up -----
  fireKeydown(d, w, "ArrowDown", { ctrlKey: true });
  assert(T.state.selectedId === f.entries[20].id, "sanity: on to the match after that");
  assert(openRanges() === "11-20|21-30",
    "the previous jump's leading window is taken back — one window travels with the selection, got " + openRanges());
  assert(!T.currentHighlightViewEntries.some(e => e.id === f.entries[5].id),
    "…and the rows it had revealed are gone from the view again");
  const selEl = rowFor(f.entries[20].id);
  assert(selEl && selEl.classList.contains("selected"),
    "the newly selected match is inside the rendered window — i.e. the view was centred on its index in the REBUILT list, not on the stale pre-expansion one");

  // --- (c) walking backwards moves the same window back -------------------
  w.moveContextMatchSelection(-1);
  assert(T.state.selectedId === f.entries[10].id, "sanity: back one match");
  assert(openRanges() === "1-10|11-20", "walking back reveals above and takes back below, got " + openRanges());

  // --- (d) a hand-revealed stretch is never the jump's to take back -------
  w.setGapOpen(51, true); // far away from anything the jumps below touch
  w.moveContextMatchSelection(1); // -> 20
  w.moveContextMatchSelection(1); // -> 30
  assert(T.state.selectedId === f.entries[30].id, "sanity: two matches further on");
  assert(T.contextExpansions.has(51),
    "lines revealed by hand survive every later jump — the jump machinery only takes back what it revealed itself");
  assert(openRanges() === "21-30|31-40|51-60", "…alongside the current jump's own window, got " + openRanges());

  // --- (e) hiding and re-revealing an AUTO stretch by hand claims it ------
  w.setGapOpen(21, false); // 21 is the current jump's own gap
  w.setGapOpen(21, true);  // …re-revealed by hand, which is what transfers ownership
  w.moveContextMatchSelection(1); // -> 40, whose own window is 31 + 41
  assert(T.state.selectedId === f.entries[40].id, "sanity: on to the next match");
  assert(T.contextExpansions.has(21),
    "a stretch re-revealed by hand keeps that state even though the jump that revealed it is long past");
  assert(openRanges() === "21-30|31-40|41-50|51-60", "…and the jump's own window moved on regardless, got " + openRanges());

  // --- (f) with the setting off, the arrows leave everything alone --------
  T.contextInitialExpansion = "collapsed";
  // A change of FILTER node is what re-seeds the expansions (a file node
  // leaves buildContextView before the seeding step — see GROUP 138m).
  T.state.activeId = w.createFilterNode(f.id, "text", "other").id;
  showContext();
  T.state.activeId = hitFilter.id;
  showContext();
  assert(T.contextExpansions.size === 0, "sanity: re-seeded with nothing revealed");
  T.state.selectedId = f.entries[0].id;
  w.moveContextMatchSelection(1);
  assert(T.state.selectedId === f.entries[10].id && T.contextExpansions.size === 0,
    "with \"Collapsed\" picked, walking to the next match neither reveals nor hides anything");
});

await withApp(async (w, d, T) => {
  section("147. …and so is picking another result with the mouse, without moving it on screen");

  // Deliberately UNEVEN gaps: matches at 0, 5, 40, 45 leave gaps of 4, 34, 4
  // and 14 lines. What is taken back above the clicked row is then nowhere
  // near the height of what is revealed there, which is exactly the case a
  // "keep scrollTop" implementation gets wrong.
  const hits = new Set([0, 5, 40, 45]);
  const f = await w.addFile("ctxclick.log", makeLog(0, 60, { suffix: i => (hits.has(i) ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f.id, "text", "hit");
  const highlightBody = d.querySelector("#highlightBody");
  T.state.activeId = hitFilter.id;
  w.render();
  w.applyFhView("highlight");

  const openRanges = () => [...T.contextExpansions.keys()].sort((a, b) => a - b)
    .map(k => T.contextExpansions.get(k).map(r => r.from + "-" + r.to).join(",")).join("|");
  const idxOf = id => T.currentHighlightViewEntries.findIndex(e => e.id === id);
  const navLabel = () => d.querySelector("#contextNavLabel").textContent;
  assert(T.contextGaps.map(g => g.start + "-" + g.end).join(",") === "1-5,6-40,41-45,46-60",
    "fixture sanity: four matches, four gaps of very different sizes, got " + T.contextGaps.map(g => g.start + "-" + g.end).join(","));

  // Stand on match 5 first, so there is a previous jump to undo.
  T.state.selectedId = f.entries[0].id;
  w.moveContextMatchSelection(1);
  assert(T.state.selectedId === f.entries[5].id && openRanges() === "1-5|6-16",
    "sanity: arrow-jumped to match 5, a step revealed on either side of it, got " + openRanges());

  // Put match 45's row 140px below the top of the viewport — both in the
  // model (scrollTop) and in the geometry stub the capture reads, so the two
  // agree the way they do in a real browser.
  const targetId = f.entries[45].id;
  const oldIdx = idxOf(targetId);
  const scrollBefore = T.highlightRowOffsets[oldIdx] - 140;
  w.setHighlightScroll(scrollBefore);
  w.renderHighlightVisibleRows();
  const rowEl = d.querySelector('#highlightRows [data-entry-id="' + targetId + '"]');
  assert(rowEl, "sanity: match 45's row is inside the virtualized window");
  rowEl.getBoundingClientRect = () => ({ top: 140, left: 0, right: 800, bottom: 168, width: 800, height: 28, x: 0, y: 140 });

  // --- (g) a plain click on it is a jump, same as an arrow would have been -
  fireClick(rowEl, w);
  assert(T.state.selectedId === targetId, "the clicked match is selected");
  assert(openRanges() === "35-40|41-45|46-56",
    "clicking another result reveals ITS window and takes the previous jump's back, exactly like the arrows, got " + openRanges());
  assert(navLabel().replace(/\s/g, "") === "4/4",
    "…and the toolbar's position readout jumps to the clicked result, got " + JSON.stringify(navLabel()));

  // --- (h) …and the clicked row does not move on screen --------------------
  const newIdx = idxOf(targetId);
  assert(newIdx !== oldIdx, "sanity: the rebuild really did change the row's index (" + oldIdx + " -> " + newIdx + ")");
  assert(T.highlightRowOffsets[newIdx] - highlightBody.scrollTop === 140,
    "the clicked row stays at the same 140px on-screen offset, got " +
    (T.highlightRowOffsets[newIdx] - highlightBody.scrollTop));
  assert(T.highlightRowOffsets[newIdx] - scrollBefore !== 140,
    "…which took real work: 11 revealed lines were taken back above it and a different number opened, so leaving scrollTop alone would have moved it");

  // --- (i) a context row and a Ctrl+click are not jumps --------------------
  const beforeCtx = openRanges();
  const ctxRow = [...d.querySelectorAll("#highlightRows .log-row.ctx-context")][0];
  assert(ctxRow, "sanity: revealed context rows are on screen");
  fireClick(ctxRow, w);
  assert(T.state.selectedId === ctxRow.dataset.entryId, "a revealed context row still selects normally");
  assert(openRanges() === beforeCtx,
    "…but it is not a move to another result, so nothing is revealed or hidden, got " + openRanges());

  const otherMatchRow = d.querySelector('#highlightRows [data-entry-id="' + f.entries[40].id + '"]');
  assert(otherMatchRow, "sanity: match 40's row is on screen too");
  otherMatchRow.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  assert(T.state.logMultiSelect.has(f.entries[40].id), "sanity: Ctrl+click multi-selected it");
  assert(openRanges() === beforeCtx,
    "a Ctrl+click is a multi-selection gesture — the rows must not move out from under it, got " + openRanges());
});
