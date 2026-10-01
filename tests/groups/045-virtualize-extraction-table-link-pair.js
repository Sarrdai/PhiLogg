// GROUP 45 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 45 — Virtualize extraction table / link pair view
   Origin: FEATURE_BACKLOG.md ("needed if someone extracts from a very
   large file with a loose pattern") / PROJECT.md's Known limitations note
   ("Extraction table and link pair view are not virtualized... would need
   work if someone tries to extract from an entire multi-hundred-thousand-
   line file with a very loose pattern"). Both views now only ever put the
   scrolled-into-view window (plus a buffer) into the DOM, mirroring the
   main log table's existing renderVisibleRows scheme:
     - Extraction table (renderExtractVisibleRows): fixed EXTRACT_ROW_HEIGHT
       (28px) per row, two spacer <tr>s (top/bottom, a single <td colspan>
       each) stand in for rows outside the window since a real <table> can't
       be windowed via absolute positioning the way #tableRows is.
     - Link view (renderLinkVisibleBlocks): pair-blocks vary in height with
       tuple size, so offsets are precomputed analytically
       (computeLinkBlockOffsets/linkBlockHeight) rather than divided by a
       constant, and the window is buffered in pixels (LINK_BUFFER_PX=300).
       Pair selection moved from a DOM class scan to an index
       (linkSelectedPairIndex) precisely because a virtualized block can be
       torn down and rebuilt between the click and any later read.
   ============================================================ */
group(45);
await withApp(async (w, d, T) => {
  section("45. Virtualize extraction table / link pair view");

  /* ---------- Part A: extraction table ---------- */
  const bigLog = makeLog(0, 300); // "message 0".."message 299", one per second
  const fA = await w.addFile("big.log", bigLog, () => {});
  const extractNode = w.createFilterNode(fA.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");

  assert(T.extractRowsData.length === 300, "sanity: all 300 entries matched the extraction pattern");
  // clientHeight is stubbed to 400 for every element (see withApp); at
  // scrollTop 0: maxVisible = ceil(400/28) + 15*2 = 15 + 30 = 45 rows.
  // data-row lives on each row's <td> (gutter and value cells alike), not
  // on the <tr> itself — the gutter cell is the unique one-per-row anchor.
  let rendered = [...d.querySelectorAll("#extractBody td.extract-gutter[data-row]")];
  assert(rendered.length === 45, "only the windowed subset (45 of 300 rows) is ever real DOM, got " + rendered.length);
  assert(rendered.length < T.extractRowsData.length, "virtualized: far fewer DOM rows than logical rows");
  assert(d.querySelectorAll("#extractBody tr.extract-spacer").length === 1, "only a BOTTOM spacer at scrollTop 0 (nothing scrolled past yet), got " + d.querySelectorAll("#extractBody tr.extract-spacer").length);
  const bottomSpacerPx = parseInt(d.querySelector("#extractBody tr.extract-spacer td").style.height, 10);
  assert(bottomSpacerPx === (300 - 45) * 28, "bottom spacer height accounts for exactly the un-rendered rows below, got " + bottomSpacerPx);

  // Scroll deep into the list (bypassing the scroll-event/rAF plumbing, same
  // determinism trick Group 34 uses for the main table's own virtualization).
  const extractScrollEl = d.querySelector("#extractScroll");
  extractScrollEl.scrollTop = 100 * 28; // ROW_HEIGHT=28 -> row 100 at the top
  w.renderExtractVisibleRows();
  rendered = [...d.querySelectorAll("#extractBody td.extract-gutter[data-row]")];
  assert(rendered.length === 45, "still exactly the windowed row count after scrolling, got " + rendered.length);
  assert(rendered[0].dataset.row === "85", "buffer subtracts 15 rows above scrollTop's own row (100-15=85), got " + rendered[0].dataset.row);
  const spacers = [...d.querySelectorAll("#extractBody tr.extract-spacer")];
  assert(spacers.length === 2, "both a top AND bottom spacer now exist once scrolled past the start, got " + spacers.length);
  assert(parseInt(spacers[0].querySelector("td").style.height, 10) === 85 * 28, "top spacer height matches the 85 skipped rows above the window");

  // Cell selection stays keyed to the FULL logical row/col set, not the
  // rendered DOM subset — Ctrl+click-select-all must still cover all 300
  // rows even though only 45 of them have <td> nodes right now.
  d.querySelector("#extractCorner").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true })); // cell selection is wired on mousedown, not click
  assert(T.state.tableSelection.size === 300 * T.extractColumns.length,
    "select-all selects every LOGICAL cell (300 rows), not just the rendered window, got " + T.state.tableSelection.size);
  // A cell that's actually rendered right now must show the selected style —
  // proof applyExtractSelectionClasses() re-runs on every windowed re-render,
  // not just the initial full build.
  assert(d.querySelector('#extractBody td[data-row="90"].cell-selected') !== null,
    "a currently-rendered cell within the selection gets .cell-selected applied");

  // Switching to a different extraction node resets the scroll position —
  // otherwise a much smaller result could render starting mid-air (or
  // entirely past its own end) at the old node's leftover scrollTop.
  const smallLog = makeLog(0, 3);
  const fA2 = await w.addFile("small.log", smallLog, () => {});
  const extractNode2 = w.createFilterNode(fA2.id, "text", "message [*:int]");
  T.state.activeId = extractNode2.id;
  w.render();
  w.applyFhView("table");
  assert(extractScrollEl.scrollTop === 0, "scroll resets to 0 when switching to a different extraction node, got " + extractScrollEl.scrollTop);

  /* ---------- Part B: Link pair view ---------- */
  // 50 REF/TARGET pairs (100 entries), one per second (minutes wrap once, harmless).
  const linkLines = [];
  for (let i = 0; i < 100; i++) {
    const label = i % 2 === 0 ? "REF" : "TARGET";
    const mm = String(Math.floor(i / 60)).padStart(2, "0");
    const ss = String(i % 60).padStart(2, "0");
    linkLines.push(`2024-01-15 10:${mm}:${ss},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${label} ${i}"`);
  }
  const fB = await w.addFile("linked.log", linkLines.join("\n") + "\n", () => {});
  const refNode = w.createFilterNode(fB.id, "text", "REF");
  const targetNode = w.createFilterNode(fB.id, "text", "TARGET");
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1); // 50 pairs, 2 real entries each
  T.state.activeId = linkNode.id;
  w.render();

  assert(T.linkPairsData.length === 50, "sanity: all 50 pairs computed (the FULL result, regardless of what's rendered)");
  // linkBlockHeight(2) = 2*26 (rows) + 1*16 (delta) + 2*2 (gaps) + 8 (margin) = 80px per pair.
  assert(T.linkBlockOffsets.length === 51 && T.linkBlockOffsets[50] === 50 * 80,
    "block offsets are a full prefix-sum array (51 entries), total height 50*80=4000px, got " + T.linkBlockOffsets[50]);
  let blocks = [...d.querySelectorAll("#linkBody .pair-block")];
  assert(blocks.length > 0 && blocks.length < 50, "only a windowed subset of pair-blocks is real DOM at scrollTop 0, got " + blocks.length + " of 50");

  // Select pair 0's brace while it's on screen.
  fireClick(blocks[0].querySelector(".pair-brace"), w);
  assert(T.linkSelectedPairIndex === 0, "clicking pair 0's brace selects it by index, got " + T.linkSelectedPairIndex);
  assert(d.querySelector('.pair-block[data-pair-index="0"]').classList.contains("pair-selected"), "pair 0's block gets .pair-selected");

  // Scroll far enough that pair 0's block is no longer in the rendered
  // window at all — this is exactly the scenario a DOM-class-only selection
  // (the pre-virtualization implementation) would silently lose.
  const linkScrollEl = d.querySelector("#linkScroll");
  linkScrollEl.scrollTop = 3900; // near the very end of the 4000px-tall list
  w.renderLinkVisibleBlocks();
  assert(d.querySelector('.pair-block[data-pair-index="0"]') === null, "sanity: pair 0's block is no longer real DOM once scrolled far away");
  assert(d.querySelector(".pair-selected") === null, "no stale .pair-selected left behind on an unrelated rendered block");
  assert(T.linkSelectedPairIndex === 0, "the selection itself SURVIVES — still tracked by index even though its DOM node was torn down");
  const marked = w.minimapMarkedEntries();
  assert(marked.length === 2 && marked[0].message.includes("REF 0") && marked[1].message.includes("TARGET 1"),
    "minimapMarkedEntries still resolves pair 0's two real entries correctly while its block is off-screen, got " + JSON.stringify(marked.map(e => e.message)));

  // Scroll to a specific deterministic offset (yStart = 1900-300 = 1600 =
  // exactly block 20's own start, given every block is a uniform 80px) and
  // confirm the render window actually moved to meet it.
  linkScrollEl.scrollTop = 1900;
  w.renderLinkVisibleBlocks();
  blocks = [...d.querySelectorAll("#linkBody .pair-block")];
  assert(blocks[0].dataset.pairIndex === "20", "scrolling moves the rendered window to start at block 20 (1600/80), got " + blocks[0].dataset.pairIndex);

  // Scroll back: pair 0's block re-enters the DOM with .pair-selected
  // correctly re-applied (not just "not incorrectly applied elsewhere").
  linkScrollEl.scrollTop = 0;
  w.renderLinkVisibleBlocks();
  assert(d.querySelector('.pair-block[data-pair-index="0"]').classList.contains("pair-selected"),
    "scrolling pair 0's block back into view re-applies .pair-selected from the persisted selection");

  // Switching to a DIFFERENT link node resets both the scroll position and
  // the selected-pair index — same reasoning as the extraction table above.
  const linkNode2 = w.createLinkNode(refNode.id, targetNode.id, "after", 1);
  linkScrollEl.scrollTop = 1900;
  T.state.activeId = linkNode2.id;
  w.render();
  assert(linkScrollEl.scrollTop === 0 && T.linkSelectedPairIndex === null,
    "scroll AND selected-pair index both reset when switching to a different link node");
});
