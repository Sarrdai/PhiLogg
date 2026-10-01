// GROUP 168 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 168 — Link view: row click selects the whole block (not just the
   brace), Up/Down arrows move that block selection, and Alt+Enter wildcard-
   filters the whole pair (person-reported, this session: "Alt+Enter on a
   Link filter entry only wildcards the second half of the tuple, same
   click/row also only jumps a single line — I want single-click/Up-Down to
   act on the whole block like clicking the brace does, and Alt+Enter to
   match right-click brace -> 'Filter for this message'"). Double-click on a
   row is UNCHANGED (still jumps to that single line via
   revealInHighlightView, buildPairRow's own dblclick).
   ============================================================ */
group(168);
await withApp(async (w, d, T) => {
  section("168. Link view: row click / Up-Down / Alt+Enter act on the whole block");

  const lines = [];
  for (let i = 0; i < 6; i++) {
    const label = i % 2 === 0 ? "REF" : "TARGET";
    lines.push(`2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${label} ${i}"`);
  }
  const f = await w.addFile("linked.log", lines.join("\n") + "\n", () => {});
  const refNode = w.createFilterNode(f.id, "text", "REF");       // entries 0,2,4
  const targetNode = w.createFilterNode(f.id, "text", "TARGET"); // entries 1,3,5
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1);
  T.state.activeId = linkNode.id;
  T.state.entriesView = "filter";
  T.state.focusRegion = "entries";
  w.render();

  // --- Row click selects the whole block, same as clicking the brace ---
  const firstBlock = d.querySelector(".pair-block");
  const firstRow = firstBlock.querySelector(".pair-row");
  assert(firstRow, "sanity: at least one row rendered in the first block");
  fireClick(firstRow, w);
  assert(T.linkSelectedPairIndex === 0, "clicking a ROW selects its whole pair by index, got " + T.linkSelectedPairIndex);
  assert(firstBlock.classList.contains("pair-selected"), "the block renders as selected after a row click");

  // Clicking the same row again toggles it back off, same as the brace's
  // existing toggle behavior (GROUP 22/23 coverage).
  fireClick(firstRow, w);
  assert(T.linkSelectedPairIndex === null, "clicking the same row again deselects the pair");

  fireClick(firstRow, w);
  assert(T.linkSelectedPairIndex === 0, "sanity: re-selected via row click");

  // --- Double-click on a row is untouched: jumps to that single line ---
  fireDblClick(firstRow, w);
  assert(T.state.entriesView === "highlight", "double-click on a row still reveals the Highlight view for that single entry");
  T.state.entriesView = "filter";
  T.state.focusRegion = "entries";
  w.render();
  // revealInHighlightView -> applySelection() clears linkSelectedPairIndex
  // (a real single-entry selection supersedes the stale block selection —
  // see applySelection's own comment), so re-select the block via a row
  // click before exercising Up/Down navigation from a known index.
  fireClick(d.querySelector(".pair-block").querySelector(".pair-row"), w);
  assert(T.linkSelectedPairIndex === 0, "sanity: block 0 re-selected after the dblclick jump");

  // --- Up/Down arrows move the block selection, not a no-op anymore ---
  fireKeydown(d, w, "ArrowDown");
  assert(T.linkSelectedPairIndex === 1, "ArrowDown moves the Link view's block selection forward, got " + T.linkSelectedPairIndex);
  fireKeydown(d, w, "ArrowDown");
  assert(T.linkSelectedPairIndex === 2, "ArrowDown again moves to the last pair");
  fireKeydown(d, w, "ArrowDown");
  assert(T.linkSelectedPairIndex === 2, "ArrowDown at the last pair stays clamped, doesn't overshoot");
  fireKeydown(d, w, "ArrowUp");
  assert(T.linkSelectedPairIndex === 1, "ArrowUp moves it back");

  // --- Alt+Enter wildcard-filters the WHOLE selected pair, matching what
  //     right-click brace -> "Filter for this message" produces ---
  fireKeydown(d, w, "ArrowUp"); // back to pair 0 (REF 0 -> TARGET 1)
  assert(T.linkSelectedPairIndex === 0, "sanity: block selection back on pair 0");
  fireKeydown(d, w, "Enter", { altKey: true });
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "Alt+Enter opens the filter popup from the Link view");
  const altEnterPattern = d.querySelector("#filterInput").value;
  w.closeFilterPopup();
  d.querySelector("#filterInput").blur();

  const pair0 = T.linkPairsData[0].pair;
  w.openContextMenu({ clientX: 10, clientY: 10 }, pair0);
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  const braceContextPattern = d.querySelector("#filterInput").value;
  w.closeFilterPopup();
  d.querySelector("#filterInput").blur();

  assert(altEnterPattern === braceContextPattern,
    "Alt+Enter produces the exact same pattern as right-click brace -> 'Filter for this message', got \"" +
    altEnterPattern + "\" vs \"" + braceContextPattern + "\"");
  // pair0.message is the already-combined "REF 0 ⟶ TARGET 1" text (see
  // buildPairEntry/PAIR_SEPARATOR) — the wildcard pattern must derive from
  // that combined message, not from just one real entry's own message, to
  // prove it covers the WHOLE tuple.
  assert(altEnterPattern.includes("REF") && altEnterPattern.includes("TARGET"),
    "the Alt+Enter pattern covers the WHOLE tuple (both sides), not just one, got \"" + altEnterPattern + "\"");
});
