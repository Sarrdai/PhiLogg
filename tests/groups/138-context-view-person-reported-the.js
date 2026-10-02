// GROUP 138 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 138 — Context view (person-reported: the Full view was confusing
   because nothing in it showed that you were still standing on a filter
   node — it rendered the root file's raw entries array regardless of
   state.activeId, so a filter node and a file node looked pixel-identical).
   Reworked into the Context view: the ACTIVE NODE'S own result, with
   everything it rejected hidden between the matches.
   REWRITTEN this session for the partial-expansion rework (person-requested,
   "die visual cues sind noch zu unscheinbar"): a hidden stretch is no longer
   binary. contextExpansions is a per-gap list of revealed root-index ranges,
   so each end of a stretch opens a step at a time and independently of the
   other; matches carry the context filter's .ctx-anchor-dot instead of its
   .ctx-bracket; revealed rows lost their indent and gained a clickable
   connecting line between the two carets that cap their run; and the nav
   chip became a real toolbar row (GROUP 151).
     a) collapsed, the view holds exactly the active node's matches; the gaps
        account for every other row; a file node hides nothing.
     b) match rows carry the dot (no bracket) and are not indented; a fully
        hidden stretch renders exactly one "… N lines" filler row and no
        "Show more" (there is no open run to step from) — leading gap
        included.
     c) the offsets array and the spacer agree with the rendered heights.
     d) the "… N lines" row reveals the whole stretch; the revealed rows are
        spliced in chronologically, are NOT indented, and carry one run line
        per row with a caret cap at either end.
     e) clicking the run line collapses the whole run, from anywhere along
        it, without also selecting the row underneath (stopPropagation).
     f) an auto-expansion around a jump reveals contextExpandStep lines per
        direction and puts a "Show more (+n)" row between the run and the
        "… N lines" row it grew out of; the step row reveals exactly n more.
     g) the two ends of one stretch are operated separately: growing the top
        run leaves the bottom one alone.
     h) "Show more" only exists while more than one step is still hidden.
     i) expand-all / collapse-all from the toolbar.
     j) the level quick-filter does not leave the result set, so it never
        changes what the Context view treats as a match.
     k) jumping to a row that isn't a match reveals it — a correctness
        requirement, since it would otherwise have no row.
     l) Ctrl+Arrow walks match to match, skipping revealed context rows.
     m) switching the active node drops the previous node's expansions.
     n) a bookmark toggle rebuilds the view it now depends on.
     o) the auto-expanded window travels with the jump instead of piling up,
        and never takes back what was revealed by hand.
     p) Stacked layout seeds everything revealed the first time a node
        becomes active there, regardless of contextInitialExpansion — a
        one-time seed, not a standing override.
     q) a "Show more" click unfolds its own block AWAY from the run it
        belongs to, holding that run exactly where it is on screen — never
        re-centring on a selected row that happens to be off screen.
     r) a "… N lines" click has no run of its own to belong to, so it holds
        whichever side the SELECTION is on — the same click grows downwards
        or upwards depending on where the person is working.
   ============================================================ */
group(138);
await withApp(async (w, d, T) => {
  section("138. Context view: the active node's result with partially expandable gaps");

  // "hit" lands on entries 0 and 30 -> two 29-line gaps.
  const f = await w.addFile("ctx.log", makeLog(0, 60, { suffix: i => (i % 30 === 0 ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f.id, "text", "hit");     // entries 0, 30
  const otherFilter = w.createFilterNode(f.id, "text", "other"); // everything else
  // render() auto-reveals the Filtered tab on every activeId change (see
  // revealFilteredView), so every node switch below has to re-show the Context
  // panel afterwards — otherwise its toolbar stays hidden and stale.
  const showContext = () => { w.render(); w.applyFhView("highlight"); };
  // A fresh, never-revealed state for the same node: switching away and back
  // is what drops contextExpansions (see (m)).
  // Only ~25 rows around scrollTop are ever real DOM nodes (see (d)), so any
  // DOM lookup aimed at the START of the list has to re-window there first.
  const showTop = () => { w.setHighlightScroll(0); w.renderHighlightVisibleRows(); };
  const resetContext = () => {
    T.state.selectedId = null; // a selection would open its window on the switch (GROUP 276)
    T.state.activeId = otherFilter.id; showContext();
    T.state.activeId = hitFilter.id; showContext();
    showTop();
  };
  T.state.activeId = hitFilter.id;
  showContext();

  const fillers = () => [...d.querySelectorAll("#highlightRows .ctx-gap-placeholder")];
  const moreRows = () => [...d.querySelectorAll("#highlightRows .ctx-show-more")];
  const runLines = () => [...d.querySelectorAll("#highlightRows .ctx-run-line")];
  const matchRow = id => d.querySelector('#highlightRows [data-entry-id="' + id + '"]');
  const revealed = gapStart => (T.contextExpansions.get(gapStart) || []).map(r => r.from + "-" + r.to).join(",");

  assert(T.contextInitialExpansion === "aroundJump",
    "auto-expand-around-the-jump is the default now (person-requested), got " + T.contextInitialExpansion);
  assert(T.contextExpandStep === 10, "…with a default step of 10 lines per direction, got " + T.contextExpandStep);

  // --- (a) the view holds the ACTIVE NODE's result, not the whole file ----
  assert(T.contextActive === true, "a filter node is active, so the Context view is in filtered mode");
  assert(T.currentHighlightViewEntries.length === 2,
    "nothing revealed yet, so the view holds exactly the node's 2 matches, got " + T.currentHighlightViewEntries.length);
  assert(T.contextGaps.length === 2 &&
    T.contextGaps.reduce((n, g) => n + (g.end - g.start), 0) === 58,
    "the gaps account for every one of the 58 non-matching rows");

  T.state.activeId = f.id;
  showContext();
  assert(T.contextActive === false && T.currentHighlightViewEntries.length === 60 && T.contextGaps.length === 0,
    "on a file node there is no filter to be outside of: nothing is marked, nothing is hidden");
  T.state.activeId = hitFilter.id;
  showContext();

  // --- (b) row/filler rendering -------------------------------------------
  const matchRows = [...d.querySelectorAll("#highlightRows .log-row.ctx-match")];
  assert(matchRows.length === 2, "both matches render as match rows, got " + matchRows.length);
  assert(matchRows.every(r => r.querySelector(".ctx-anchor-dot")),
    "match rows carry the context filter's own reference-entry DOT (person-requested — the bracket it used to reuse said 'these rows belong together', which a scattered filter result isn't)");
  assert(matchRows.every(r => !r.querySelector(".ctx-bracket")), "…and no bracket any more");
  assert(matchRows.every(r => w.getComputedStyle(r).paddingLeft !== "24px"), "match rows are not indented");
  assert(d.querySelector("#highlightRows").classList.contains("ctx-active"),
    "#highlightRows gets its marker lane while a filter is active");
  assert(fillers().length === 2 && T.contextStrips.size === 2,
    "one filler row per fully hidden stretch, got " + fillers().length);
  assert(moreRows().length === 0,
    "no 'Show more' row while nothing is revealed — there is no open run to step away from, and clicking a match reveals a step by itself (person-requested)");
  assert(fillers().every(el => el.querySelector(".ctx-gap-icon")), "each filler shows its affordance icon");
  assert(fillers().every(el => el.textContent.includes("29")),
    "…and how many lines it stands for, got " + JSON.stringify(fillers().map(el => el.textContent)));
  assert(runLines().length === 0, "no run lines exist while nothing is revealed");

  // A leading gap (the file starting before the first match) has no row to
  // hang off and is rendered above row 0 instead, with its height in offsets[0].
  T.state.activeId = otherFilter.id;
  showContext();
  assert(T.contextStrips.has(-1), "a leading gap's fillers are keyed to -1, i.e. rendered above the first row");
  assert(T.highlightRowOffsets[0] === T.CONTEXT_STRIP_HEIGHT,
    "…and their height is folded into offsets[0], so row 0's top stays correct");
  T.state.activeId = hitFilter.id;
  showContext();

  // --- (c) virtualization math ---------------------------------------------
  // Each filler row costs one CONTEXT_STRIP_HEIGHT, and a row can now carry
  // several of them (a "Show more" step row beside its "… N lines" row), so
  // the total counts FILLERS, not keys.
  const fillerCount = () => [...T.contextStrips.values()].reduce((n, arr) => n + arr.length, 0);
  const heightsAgree = () => {
    const n = T.currentHighlightViewEntries.length;
    const expected = n * T.ROW_HEIGHT + fillerCount() * T.CONTEXT_STRIP_HEIGHT;
    return T.highlightRowOffsets[n] === expected &&
      d.querySelector("#highlightSpacer").style.height === (expected + 22) + "px";
  };
  assert(heightsAgree(), "offsets total and spacer height account for both rows and filler rows");

  // --- (d) the "… N lines" row reveals the whole stretch -------------------
  // #highlightBody's clientHeight is stubbed to 400 (see withApp) regardless of
  // how many rows the model actually holds, so the virtualized window only ever
  // materializes ~25 rows near wherever scrollTop points — model-level
  // assertions (currentHighlightViewEntries, contextRuns, contextExpansions)
  // are what's exhaustive here; DOM queries below only check whatever subset
  // is actually rendered, never a hardcoded total row count.
  fireClick(fillers()[0], w); // the WHOLE row is the click target, not just its icon
  assert(T.currentHighlightViewEntries.length === 31,
    "the '… N lines' row reveals the whole stretch in one go, got " + T.currentHighlightViewEntries.length);
  const ts = T.currentHighlightViewEntries.map(e => e.ts);
  assert(ts.every((v, i) => i === 0 || v >= ts[i - 1]), "the revealed rows are spliced in chronologically");
  const ctxRows = [...d.querySelectorAll("#highlightRows .log-row.ctx-context")];
  assert(ctxRows.length > 0 && ctxRows.every(r => w.getComputedStyle(r).paddingLeft !== "24px"),
    "revealed rows are no longer indented (person-requested — their run line lives in the marker lane instead, so no log text shifts sideways)");
  assert(ctxRows.every(r => r.querySelector(".ctx-run-line")),
    "…and every one of them carries its slice of the run's connecting line");
  assert(T.contextRuns.length === 1 && T.contextRuns[0].from === 1 && T.contextRuns[0].to === 30,
    "the model holds exactly one revealed run for that stretch");
  assert(d.querySelector("#highlightRows .ctx-run-line.ctx-run-top .ctx-run-cap"),
    "the run's first row caps the line with a caret");
  assert(heightsAgree(), "…and the offsets/spacer still agree afterwards");
  assert(fillerCount() === 1, "the revealed stretch costs no filler row any more — only the still-hidden one does");

  // --- (e) clicking the line collapses the whole run -----------------------
  // A line slice on a row in the MIDDLE of the run: collapsing has to work
  // from wherever you are reading, not only from the two capped ends.
  const middleLine = runLines().find(l => !l.classList.contains("ctx-run-top") && !l.classList.contains("ctx-run-bottom"));
  assert(middleLine, "a middle row's line slice is rendered too, not just the capped ends");
  T.state.selectedId = null;
  fireClick(middleLine, w);
  assert(T.currentHighlightViewEntries.length === 2,
    "clicking anywhere on the line collapses the entire run, got " + T.currentHighlightViewEntries.length);
  assert(T.state.selectedId === null,
    "…without also selecting the row underneath it (stopPropagation)");

  // --- (f) an auto-expansion around a jump, and the step row it produces ---
  fireClick(matchRow(f.entries[0].id), w); // a plain click on a match IS a jump
  assert(T.currentHighlightViewEntries.length === 12,
    "clicking a match auto-reveals contextExpandStep lines per direction (only one side exists at entry 0), got " +
      T.currentHighlightViewEntries.length);
  assert(revealed(1) === "1-11", "…as one revealed range in that gap, got " + revealed(1));
  assert(moreRows().length === 1, "the still-hidden remainder gets one 'Show more' step row, got " + moreRows().length);
  assert(moreRows()[0].textContent.includes("Show more (+10)"),
    "…labelled with the configured step, got " + JSON.stringify(moreRows()[0].textContent));
  const gapRowAfterStep = fillers().find(el => !el.classList.contains("ctx-show-more") && el.textContent.includes("19"));
  assert(gapRowAfterStep, "…and the '… 19 lines' row for everything still hidden sits next to it");
  fireClick(moreRows()[0], w);
  assert(revealed(1) === "1-21", "'Show more' reveals exactly one more step, got " + revealed(1));

  // --- (g) the two ends of a stretch are operated separately ---------------
  resetContext();
  fireClick(matchRow(f.entries[30].id), w); // a window that straddles two gaps
  assert(revealed(1) === "20-30" && revealed(31) === "31-41",
    "the jump reveals a step on each side of the row, in whichever gap it falls, got " + revealed(1) + " / " + revealed(31));
  const stepFillers = () => [...T.contextStrips.values()].flat().filter(x => x.kind === "more");
  assert(stepFillers().length === 2, "one step row per still-hidden stretch, got " + stepFillers().length);
  showTop();
  fireClick(moreRows()[0], w); // the FIRST one is the stretch above the run above the match
  assert(revealed(1) === "10-30", "growing the run above adds a step at its top, got " + revealed(1));
  assert(revealed(31) === "31-41",
    "…and leaves the other direction exactly as it was — both ends are separately operable (person-requested), got " + revealed(31));

  // --- (h) the step row disappears once one step covers the rest -----------
  resetContext();
  T.contextExpandStep = 25;
  fireClick(matchRow(f.entries[0].id), w); // reveals 1-26, leaving 4 hidden
  assert(revealed(1) === "1-26", "sanity: a 25-line step, got " + revealed(1));
  showTop();
  assert(moreRows().length === 0,
    "with 4 lines left and a 25-line step, the step row would do the same as the '… N lines' row — so only the latter is shown");
  T.contextExpandStep = 10;

  // --- (i) expand-all / collapse-all from the toolbar ----------------------
  resetContext();
  fireClick(d.querySelector("#ctxExpandAll"), w);
  assert(T.currentHighlightViewEntries.length === 60, "the toolbar's expand-all reveals the whole file");
  assert(T.contextGaps.every(g => revealed(g.start) === g.start + "-" + g.end), "…every gap end to end");
  fireClick(d.querySelector("#ctxCollapseAll"), w);
  assert(T.currentHighlightViewEntries.length === 2 && T.contextExpansions.size === 0,
    "…and collapse-all hides all of it again");

  // --- (j) the level quick-filter doesn't change what counts as a match ---
  T.levelFilterTreeMode = "explicit"; // the classic Set-based quick-filter (see GROUP 94)
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  assert(T.currentHighlightViewEntries.length === 2 && T.contextMatchIds.size === 2,
    "the level quick-filter narrows the Filtered view's display only — those rows never leave the result set, so the Context view is untouched");
  fireClick(errBtn, w); // reset
  // No selection: switching onto the Context tab would otherwise open the
  // window around it (GROUP 276), and (k) needs its stretch still hidden.
  T.state.selectedId = null;
  w.applyFhView("highlight");

  // --- (k) jumping to a non-match reveals it ------------------------------
  const buried = f.entries[7]; // "message 7 other" — not a match of hitFilter
  assert(!T.currentHighlightViewEntries.some(e => e.id === buried.id), "sanity: it has no row while its stretch is hidden");
  w.revealInHighlightView(buried, null, null);
  assert(T.currentHighlightViewEntries.some(e => e.id === buried.id),
    "revealing an entry that isn't a match reveals the lines around it — it would otherwise have nowhere to be scrolled to");
  assert(T.state.selectedId === buried.id, "…and it ends up selected, as before");

  // --- (l) Ctrl+Arrow walks match to match -------------------------------
  w.setAllGapsExpanded(true); // context rows everywhere, so "skipping" is meaningful
  T.state.selectedId = f.entries[0].id;
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "ArrowDown", { ctrlKey: true });
  assert(T.state.selectedId === f.entries[30].id,
    "Ctrl+ArrowDown jumps to the next MATCH, skipping the 29 revealed context rows in between");
  fireKeydown(d, w, "ArrowUp", { ctrlKey: true });
  assert(T.state.selectedId === f.entries[0].id, "…and Ctrl+ArrowUp walks back the same way");
  assert(T.currentHighlightViewEntries.length === 60,
    "walking over rows that were revealed BY HAND never takes them back — a jump only owns what it revealed itself");
  fireKeydown(d, w, "ArrowDown");
  assert(T.state.selectedId === f.entries[1].id,
    "a PLAIN ArrowDown still steps one row, context rows included — the modifier is what makes it match-to-match");

  // --- (m) switching nodes drops the previous node's expansions -----------
  assert(T.contextExpansions.size > 0, "sanity: something is revealed right now");
  resetContext();
  assert(T.contextExpansions.size === 0 && T.currentHighlightViewEntries.length === 2,
    "a different active node means different index ranges, so its expansions are dropped rather than misapplied");

  // --- (n) a bookmark toggle rebuilds the view it now depends on -----------
  // toggleBookmark deliberately repaints instead of calling render() (it must
  // not yank the reading position), so the Context view — which since the
  // rework holds the ACTIVE node's result — has to be rebuilt there too, or a
  // toggle while standing on the auto "Bookmarks" node leaves it stale.
  const bm1 = f.entries[5];
  w.toggleBookmark(bm1.id);
  const bmNode = Object.values(T.state.nodes).find(n => n.filterType === "bookmarks");
  assert(!!bmNode, "sanity: bookmarking creates the auto Bookmarks node");
  T.state.activeId = bmNode.id;
  showContext();
  assert(T.contextMatchIds.size === 1 && T.currentHighlightViewEntries.some(e => e.id === bm1.id),
    "the Bookmarks node's own single match is what the Context view shows");
  w.toggleBookmark(f.entries[9].id); // targeted repaint, no full render()
  assert(T.contextMatchIds.size === 2 && T.currentHighlightViewEntries.some(e => e.id === f.entries[9].id),
    "a bookmark toggle rebuilds the Context view immediately, instead of leaving it stale until some unrelated render");
  T.state.activeId = hitFilter.id;
  showContext();

  // --- (o) the auto window travels; hand-revealed rows are never taken back -
  resetContext();
  fireClick(matchRow(f.entries[0].id), w);
  assert(revealed(1) === "1-11" && T.contextAutoRanges.length === 1, "sanity: one auto range from the first jump");
  showTop();
  fireClick(matchRow(f.entries[30].id), w);
  assert(revealed(1) === "20-30" && revealed(31) === "31-41",
    "the next jump takes its predecessor's window back and opens its own — one window travelling, not a trail, got " +
      revealed(1) + " / " + revealed(31));
  // Now reveal something by hand in the same gap and jump again: the hand-set
  // part has to survive, which is what forgetAutoRangesForGap guarantees.
  showTop();
  fireClick(moreRows()[0], w); // hand-grow the run above the match -> 10-30
  showTop();
  fireClick(matchRow(f.entries[0].id), w);
  assert(revealed(1).split(",").includes("10-30") || revealed(1) === "1-30",
    "a stretch touched by hand keeps what the person gave it, however many jumps follow, got " + revealed(1));

  // --- (p) Stacked layout seeds everything revealed, once per node --------
  const stackedFilter = w.createFilterNode(f.id, "text", "hit"); // fresh node, never activated before
  w.applyFhView("stacked");
  T.state.activeId = stackedFilter.id;
  w.render();
  assert(T.contextGaps.length === 2 && T.contextGaps.every(g => revealed(g.start) === g.start + "-" + g.end),
    "Stacked seeds every gap fully revealed the first time a node becomes active there, regardless of contextInitialExpansion");
  w.collapseContextRun(T.contextRuns.find(r => r.gapStart === T.contextGaps[0].start)); // manually re-hide one (a click on the run's connecting line)
  T.state.selectedId = null; // landing on the Context tab opens the selection's window (GROUP 276)
  w.applyFhView("highlight"); // flip to tabs...
  w.applyFhView("stacked");   // ...and back
  assert(revealed(T.contextGaps[0].start) === "",
    "manually hiding a stretch in Stacked survives a layout flip — the expanded default is a one-time SEED, not a standing override");
  w.applyFhView("highlight");

  // --- (q) a step click unfolds away from its own run --------------------
  // Person-reported, twice. First: "Der visuelle Eindruck soll sein: 'Ich bin
  // noch an der gleichen Stelle und sehe oben/unten jetzt mehr', also ohne
  // einen zusätzlichen Sprung" — the commit path went through
  // captureViewAnchor, which prefers state.selectedId and re-centres it when
  // it is off screen, so every step click yanked the view back to the
  // selection. Both cases below deliberately leave the selection off screen,
  // which is exactly what used to trigger that.
  // Then: the first fix held the FAR side, so a block unfolded in the
  // direction opposite to the button that was clicked. A step row belongs to
  // the run it sits against; that run is what stays put, and the block grows
  // away from it — the step at the BOTTOM of a block unfolds downwards, the
  // one at its TOP unfolds upwards.
  //
  // A 200-line file with matches only at 0 and 100 gives gaps long enough
  // (99 and 99 lines) for a 10-line step to leave a real remainder on either
  // side, and puts the rows this checks well outside the stubbed 400px
  // viewport.
  const big = await w.addFile("ctxbig.log", makeLog(0, 200, { suffix: i => (i % 100 === 0 ? "hit" : "other") }), () => {});
  const bigFilter = w.createFilterNode(big.id, "text", "hit"); // entries 0 and 100
  const body = d.querySelector("#highlightBody");
  const idxOf = id => T.currentHighlightViewEntries.findIndex(e => e.id === id);
  const screenYOf = id => T.highlightRowOffsets[idxOf(id)] - body.scrollTop;
  const enterBig = () => {
    T.state.activeId = otherFilter.id; showContext();   // force a re-seed
    T.state.activeId = bigFilter.id; showContext();
    showTop();
  };

  // A step at the BOTTOM of a block (side "top": it grows the run above it):
  // that run keeps its place and the block unfolds DOWNWARDS, pushing what
  // follows further down.
  enterBig();
  fireClick(matchRow(big.entries[0].id), w);            // auto-reveals 1-11
  assert(revealed(1) === "1-11", "sanity: a step revealed below match 0, got " + revealed(1));
  w.setHighlightScroll(200);                            // match 0 (the selection) is now off screen above
  w.renderHighlightVisibleRows();
  assert(T.state.selectedId === big.entries[0].id && screenYOf(big.entries[0].id) < 0,
    "sanity: the selected row sits above the viewport, which is what used to drag the view back");
  const yRunBefore = screenYOf(big.entries[10].id);     // last row of the run the step belongs to
  const yAfterBefore = screenYOf(big.entries[100].id);  // the match below the hidden stretch
  const stepAtBottom = moreRows().find(el => el.textContent.includes("Show more"));
  assert(stepAtBottom, "sanity: the step row at the bottom of the block is on screen");
  fireClick(stepAtBottom, w);
  assert(revealed(1) === "1-21", "it grows its own run by one more step, got " + revealed(1));
  assert(screenYOf(big.entries[10].id) === yRunBefore && body.scrollTop === 200,
    "the run it belongs to does not move — the block unfolds downwards from it, got " +
      screenYOf(big.entries[10].id) + " instead of " + yRunBefore + " (scrollTop " + body.scrollTop + ")");
  assert(screenYOf(big.entries[100].id) === yAfterBefore + 10 * T.ROW_HEIGHT,
    "…and what follows the stretch is pushed down by exactly the ten revealed rows, got " +
      screenYOf(big.entries[100].id) + " instead of " + (yAfterBefore + 10 * T.ROW_HEIGHT));

  // A step at the TOP of a block (side "bottom": it grows the run below it):
  // the mirror image — that run keeps its place and the block unfolds UPWARDS.
  enterBig();
  fireClick(matchRow(big.entries[100].id), w);          // reveals 90-100 and 101-111
  assert(revealed(1) === "90-100" && revealed(101) === "101-111",
    "sanity: a step on either side of match 100, got " + revealed(1) + " / " + revealed(101));
  showTop();
  T.state.selectedId = big.entries[110].id;             // in the list, but far below the viewport
  assert(screenYOf(big.entries[110].id) > 400, "sanity: the selected row sits below the viewport");
  const yRunBefore2 = screenYOf(big.entries[90].id);    // first row of the run the step belongs to
  const stepAtTop = moreRows()[0];                      // DOM order: the step above the first gap's run
  assert(stepAtTop, "sanity: the step row at the top of the block is on screen");
  fireClick(stepAtTop, w);
  assert(revealed(1) === "80-100", "it grows its own run by one more step, got " + revealed(1));
  assert(screenYOf(big.entries[90].id) === yRunBefore2,
    "the run it belongs to does not move — the block unfolds upwards from it, got " +
      screenYOf(big.entries[90].id) + " instead of " + yRunBefore2);
  assert(body.scrollTop === 10 * T.ROW_HEIGHT,
    "…which takes scrollTop with it by exactly the ten revealed rows, got " + body.scrollTop);
  // --- (r) "… N lines" holds the side the selection is on ----------------
  // Person-requested after seeing (q) land: unlike a step row, this one is
  // the stretch BETWEEN two blocks and reveals all of it, so it has no run of
  // its own to belong to. It keeps the SELECTED row still instead — the same
  // click therefore grows downwards when the person is reading above the
  // stretch and upwards when they are reading below it.
  // The "… 89 lines" row of the stretch below match 0's revealed run.
  const revealAllRow = () =>
    fillers().find(el => !el.classList.contains("ctx-show-more") && el.textContent.includes("89"));

  // Selection ABOVE the stretch -> the rows above stay, it grows downwards.
  enterBig();
  fireClick(matchRow(big.entries[0].id), w);            // reveals 1-11; selection is match 0
  assert(T.state.selectedId === big.entries[0].id, "sanity: the selection sits above the hidden stretch");
  const lenBefore = T.currentHighlightViewEntries.length;
  const yRunAbove = screenYOf(big.entries[10].id);
  fireClick(revealAllRow(), w);
  assert(T.currentHighlightViewEntries.length === lenBefore + 89,
    "the row reveals the whole remaining stretch, got " + T.currentHighlightViewEntries.length);
  assert(screenYOf(big.entries[10].id) === yRunAbove && body.scrollTop === 0,
    "with the selection above it, the rows above stay put and it unfolds downwards, got scrollTop " + body.scrollTop);

  // Selection BELOW the stretch -> the rows below stay, it grows upwards.
  enterBig();
  fireClick(matchRow(big.entries[0].id), w);            // same starting state…
  T.state.selectedId = big.entries[100].id;             // …but reading the block on the far side now
  const yBelow = screenYOf(big.entries[100].id);
  fireClick(revealAllRow(), w);
  assert(T.currentHighlightViewEntries.length === lenBefore + 89, "sanity: the same reveal");
  assert(screenYOf(big.entries[100].id) === yBelow && body.scrollTop > 0,
    "with the selection below it, THAT row keeps its place and the stretch unfolds upwards instead, got " +
      screenYOf(big.entries[100].id) + " instead of " + yBelow + " (scrollTop " + body.scrollTop + ")");

  // No selection at all falls back to holding the row above.
  enterBig();
  fireClick(matchRow(big.entries[0].id), w);
  T.state.selectedId = null;
  const yRunAbove2 = screenYOf(big.entries[10].id);
  fireClick(revealAllRow(), w);
  assert(screenYOf(big.entries[10].id) === yRunAbove2 && body.scrollTop === 0,
    "nothing selected falls back to holding the row above — the behaviour this replaced");

  T.state.activeId = hitFilter.id;
  showContext();
});
