// GROUP 34 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 34 — Minimap: full-range vs rendered-subset rects, selected-entry
   markers, and the minimap now showing during the Link view (this session,
   person-reported: the range indicator only ever showed what's scrolled
   into view, never the Filtered view's whole matched span). See
   updateMinimapFullRange/updateMinimapRenderedRange/
   updateMinimapSelectionMarkers/minimapMarkedEntries in philogg.html.
   ============================================================ */
group(34);
await withApp(async (w, d, T) => {
  section("34. Minimap: full-range vs rendered-subset rects, selection markers, Link view");

  // --- Part A: full range vs rendered (scrolled-into-view) subset ---
  const fA = await w.addFile("wide.log", makeLog(0, 100), () => {}); // 100 entries, 1s apart
  T.state.activeId = fA.id;
  T.state.sortColumn = null;
  w.render();

  const fullRect = d.querySelector("#minimapFullRangeRect");
  const renderedRect = d.querySelector("#minimapRenderedRangeRect");
  assert(!fullRect.classList.contains("hidden") && !renderedRect.classList.contains("hidden"),
    "both range rects are visible for a plain unfiltered file");
  const fullX = parseFloat(fullRect.getAttribute("x")), fullW = parseFloat(fullRect.getAttribute("width"));
  const renderedWInit = parseFloat(renderedRect.getAttribute("width"));
  assert(fullW > renderedWInit + 5,
    "full-range rect is visibly wider than the rendered subset when only the top of a 100-row list is on screen, full=" + fullW.toFixed(1) + " rendered=" + renderedWInit.toFixed(1));
  assert(Math.abs(parseFloat(renderedRect.getAttribute("x")) - fullX) < 1,
    "at scrollTop 0, the rendered subset starts at the same left edge as the full range");

  // Scroll roughly to the middle and recompute the rendered subset directly
  // (bypassing the scroll-event/rAF plumbing for a deterministic test).
  d.querySelector("#tableBody").scrollTop = 50 * 28; // ROW_HEIGHT=28, ~halfway down 100 rows
  w.updateMinimapRenderedRange();
  const renderedXMid = parseFloat(renderedRect.getAttribute("x"));
  assert(renderedXMid > fullX + fullW * 0.2,
    "scrolling down moves the rendered subset's left edge meaningfully to the right, got " + renderedXMid.toFixed(1) + " (full range x=" + fullX.toFixed(1) + " width=" + fullW.toFixed(1) + ")");
  assert(renderedXMid + parseFloat(renderedRect.getAttribute("width")) <= fullX + fullW + 1,
    "rendered subset stays within the full range's bounds");

  // --- Part B: selected-entry marker ---
  w.selectEntry(fA.entries[50].id);
  let markerLines = [...d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line")];
  assert(markerLines.length === 1, "selecting a single entry draws exactly one marker, got " + markerLines.length);
  assert(Math.abs(parseFloat(markerLines[0].getAttribute("x")) + 1 - w.minimapTsToX(fA.entries[50].ts)) < 0.2,
    "marker sits at the selected entry's own timestamp position");

  w.selectEntry(fA.entries[10].id);
  markerLines = [...d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line")];
  assert(markerLines.length === 1 && Math.abs(parseFloat(markerLines[0].getAttribute("x")) + 1 - w.minimapTsToX(fA.entries[10].ts)) < 0.2,
    "selecting a different entry moves the marker");

  T.state.selectedId = null;
  w.updateMinimapSelectionMarkers();
  assert(d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line").length === 0, "clearing the selection clears the marker");

  // --- Part C: Link view — minimap now visible, brace selection marks BOTH real entries ---
  const linkLines = [];
  for (let i = 0; i < 10; i++) {
    const label = i % 2 === 0 ? "REF" : "TARGET";
    linkLines.push(`2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${label} ${i}"`);
  }
  const fB = await w.addFile("linked.log", linkLines.join("\n") + "\n", () => {});
  const refNode = w.createFilterNode(fB.id, "text", "REF");       // entries 0,2,4,6,8
  const targetNode = w.createFilterNode(fB.id, "text", "TARGET"); // entries 1,3,5,7,9
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1); // REF n -> 1st TARGET after it
  T.state.activeId = linkNode.id;
  w.render();

  assert(!d.querySelector("#timelineMinimap").classList.contains("hidden"), "the minimap is now shown while the Link view is active");
  const linkFullRect = d.querySelector("#minimapFullRangeRect");
  assert(linkFullRect && !linkFullRect.classList.contains("hidden"), "full-range rect renders for the Link view too");
  assert(d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"),
    "rendered-subset rect stays hidden in the Link view (no virtualization to distinguish a subset from)");

  const firstBrace = d.querySelector(".pair-brace");
  assert(firstBrace, "sanity: at least one pair rendered in the Link view");
  fireClick(firstBrace, w);
  assert(firstBrace.closest(".pair-block").classList.contains("pair-selected"), "clicking a brace selects its pair");
  let pairMarkers = [...d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line")];
  assert(pairMarkers.length === 2, "selecting a pair's brace marks BOTH of its real entries, got " + pairMarkers.length);
  const expectedXs = [w.minimapTsToX(fB.entries[0].ts), w.minimapTsToX(fB.entries[1].ts)].sort((a, b) => a - b); // REF 0 -> TARGET 1
  const actualXs = pairMarkers.map(m => parseFloat(m.getAttribute("x")) + 1).sort((a, b) => a - b);
  assert(Math.abs(actualXs[0] - expectedXs[0]) < 0.2 && Math.abs(actualXs[1] - expectedXs[1]) < 0.2,
    "the two markers sit at the pair's two real entries' own timestamps");

  fireClick(firstBrace, w); // click again: deselect
  assert(!firstBrace.closest(".pair-block").classList.contains("pair-selected"), "clicking the same brace again deselects the pair");
  assert(d.querySelectorAll("#minimapSelectionMarkers .minimap-marker-line").length === 0, "deselecting the pair clears its markers (no other selection underneath)");

  // Re-select the brace, then navigate away — a stale .pair-selected left
  // behind in the now-hidden Link view must NOT keep marking its old
  // entries once a different (non-link) node is active.
  fireClick(firstBrace, w);
  assert(firstBrace.closest(".pair-block").classList.contains("pair-selected"), "sanity: brace re-selected");
  T.state.activeId = refNode.id;
  w.render();
  assert(w.minimapMarkedEntries().length === 0, "a stale Link-view brace selection is ignored once a different, non-link node is active");
});
