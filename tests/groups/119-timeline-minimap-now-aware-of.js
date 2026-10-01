// GROUP 119 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 119 — Timeline minimap now aware of which fh pane (Filtered/Full) is
   actually on screen (this session, FEATURE_BACKLOG.md #8 + two same-day
   person-feedback follow-ups):
     a) Settings -> Behavior -> "Hide minimap's covered-timespan box in Full
        view" toggle (default OFF) hides #minimapFullRangeRect while the Full
        tab is active; Stacked layout and the Filtered tab are unaffected;
        showFhTab/applyFhView re-evaluate it immediately on every tab switch.
     b) #minimapRenderedRangeRect (updateMinimapRenderedRange) now sources
        from the Full view's own scroll/entries while its tab is active
        (not gated by minimapInteractive, a Filtered-view-only concept), and
        gained an explicit Link-view guard at its own top (renderHighlightView
        keeps running in the background during the Link view, so the rect
        can no longer rely on simply never being called then).
     c) The minimap's click-to-jump listener resolves against whichever pane
        is actually visible (currentHighlightViewEntries/selectHighlightEntry
        for the Full tab, currentViewEntries/selectEntry otherwise) instead
        of always jumping the Filtered view in the background.
   ============================================================ */
group(119);
await withApp(async (w, d, T) => {
  section("119a. Settings: \"Hide minimap's covered-timespan box in Full view\" toggle (default OFF) — Box #1 hides in the Full tab only, tab switches re-evaluate immediately");

  const cb = d.querySelector("#settingsHideMinimapFullRangeInFullView");
  assert(cb, "sanity: the new settings checkbox exists");
  assert(pillChecked(cb) === false, "defaults to OFF — an opt-out of existing behavior, not a bugfix");

  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  const fullRect = d.querySelector("#minimapFullRangeRect");
  assert(!fullRect.classList.contains("hidden"), "sanity: Box #1 visible in the Filtered tab (default active tab)");

  w.applyFhView("highlight");
  assert(!fullRect.classList.contains("hidden"), "toggle is off: Box #1 stays visible in the Full tab too");

  fireClick(cb, w);
  assert(fullRect.classList.contains("hidden"),
    "turning the toggle on while the Full tab is already active hides Box #1 immediately, with no extra render/scroll needed");

  w.applyFhView("filter");
  assert(!fullRect.classList.contains("hidden"), "switching to the Filtered tab shows Box #1 again");

  w.applyFhView("highlight");
  assert(fullRect.classList.contains("hidden"),
    "switching back to the Full tab hides it again — showFhTab/applyFhView re-evaluate on every tab switch");

  w.applyFhView("stacked");
  assert(!fullRect.classList.contains("hidden"),
    "Stacked layout always shows Box #1 even with the toggle on — the Filtered pane sits alongside it there, so the box stays meaningful");

  // --- Persisted flag honored on (re-)init, same path real boot uses ---
  w.localStorage.setItem("philogg-hide-minimap-full-range-in-full-view", "0");
  w.initMinimapFullRangeSetting();
  assert(pillChecked(cb) === false, "initMinimapFullRangeSetting re-applies a persisted OFF flag");
  w.applyFhView("highlight");
  assert(!fullRect.classList.contains("hidden"), "...and Box #1 stays visible in the Full tab once the persisted flag is off");

  w.localStorage.setItem("philogg-hide-minimap-full-range-in-full-view", "1");
  w.initMinimapFullRangeSetting();
  assert(pillChecked(cb) === true, "...and a persisted ON flag");
  w.updateMinimapFullRange();
  assert(fullRect.classList.contains("hidden"), "...re-hides Box #1 while the Full tab is still active");
});

await withApp(async (w, d, T) => {
  section("119b. Box #2 tracks the Full view's own scroll while its tab is active (not gated by minimapInteractive), and stays hidden for the Link view regardless of last active tab");

  const f = await w.addFile("wide.log", makeLog(0, 100), () => {}); // 100 entries, 1s apart
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  const renderedRect = d.querySelector("#minimapRenderedRangeRect");
  const fullRect = d.querySelector("#minimapFullRangeRect");
  const tableBody = d.querySelector("#tableBody");
  const highlightBody = d.querySelector("#highlightBody");
  assert(!renderedRect.classList.contains("hidden"), "sanity: Box #2 visible in the Filtered tab (Group 34 covers its Filtered-view details)");

  // --- Full tab active: Box #2 now sources from highlightBody/currentHighlightViewEntries ---
  w.applyFhView("highlight");
  assert(!renderedRect.classList.contains("hidden"), "Box #2 stays visible once the Full tab is active");
  const fullX = parseFloat(fullRect.getAttribute("x")), fullW = parseFloat(fullRect.getAttribute("width"));
  assert(Math.abs(parseFloat(renderedRect.getAttribute("x")) - fullX) < 1,
    "at scrollTop 0, the Full-view rendered subset starts at the same left edge as the full range");

  highlightBody.scrollTop = 50 * 28; // ROW_HEIGHT=28, ~halfway down 100 rows
  w.updateMinimapRenderedRange();
  const midX = parseFloat(renderedRect.getAttribute("x"));
  assert(midX > fullX + fullW * 0.2,
    "scrolling the Full view's OWN container moves Box #2's left edge meaningfully to the right, got " + midX.toFixed(1));

  tableBody.scrollTop = 0; // the (currently invisible) Filtered table's own scroll must have no effect
  w.updateMinimapRenderedRange();
  assert(Math.abs(parseFloat(renderedRect.getAttribute("x")) - midX) < 1,
    "Box #2 ignores the Filtered view's own (invisible) scroll position while the Full tab is active");

  // --- No column sort exists in the Full view: an active Filtered-table sort must not block Box #2 there ---
  T.state.sortColumn = "level";
  w.render(); // recomputes minimapInteractive = false — a Filtered-view-only concept
  assert(T.fhActiveTab === "highlight", "sanity: the Full tab is still the active one (activeId didn't change, so render() didn't auto-reveal the Filtered tab)");
  assert(!d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"),
    "an active column sort does not hide Box #2 while the Full tab is active — minimapInteractive is Filtered-view-only");
  T.state.sortColumn = null;
  w.render();

  // --- Link view: Box #2 stays hidden regardless of which fh tab was last active ---
  const linkLines = [];
  for (let i = 0; i < 10; i++) {
    const label = i % 2 === 0 ? "REF" : "TARGET";
    linkLines.push(`2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${label} ${i}"`);
  }
  const fB = await w.addFile("linked.log", linkLines.join("\n") + "\n", () => {});
  const refNode = w.createFilterNode(fB.id, "text", "REF");
  const targetNode = w.createFilterNode(fB.id, "text", "TARGET");
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1);
  T.state.activeId = linkNode.id;
  w.render(); // activeId changed to a filter node — auto-reveals the Filtered tab (revealFilteredView)
  w.applyFhView("highlight"); // person explicitly switches to the Full tab afterward, same as the real UI flow
  assert(d.querySelector("#linkWrap").style.display !== "none", "sanity: the Link view is what's rendering in the (currently hidden) Filtered pane");
  assert(d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"),
    "Box #2 stays hidden for the Link view even with the Full tab active — no virtualization there regardless of last active tab");
  w.updateMinimapRenderedRange();
  assert(d.querySelector("#minimapRenderedRangeRect").classList.contains("hidden"), "...even when explicitly re-evaluated");
});

await withApp(async (w, d, T) => {
  section("119c. Click-to-jump on the minimap resolves against whichever pane is actually visible (Full tab -> Full view, Filtered tab/Stacked -> Filtered view)");

  const f = await w.addFile("wide.log", makeLog(0, 60), () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  const svg = d.querySelector("#timelineMinimapSvg");
  const highlightBody = d.querySelector("#highlightBody");

  // --- Filtered tab active: click resolves against currentViewEntries/selectEntry (unchanged behavior) ---
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: w.minimapTsToX(f.entries[10].ts), clientY: 10 }));
  assert(T.state.selectedId === f.entries[10].id, "Filtered tab active: click selects the nearest entry in the Filtered view");
  assert(T.state.entriesView === "filter", "...via selectEntry (state.entriesView === \"filter\")");

  // --- Full tab active: click must resolve against the Full view instead ---
  w.applyFhView("highlight");
  T.state.selectedId = null;
  assert(highlightBody.scrollTop === 0, "sanity: Full view starts unscrolled");
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: w.minimapTsToX(f.entries[40].ts), clientY: 10 }));
  assert(T.state.selectedId === f.entries[40].id, "Full tab active: click selects the nearest entry in the Full view's own entries");
  assert(T.state.entriesView === "highlight", "...via selectHighlightEntry, not selectEntry (state.entriesView === \"highlight\")");
  assert(highlightBody.scrollTop > 0, "...and the Full view's own container actually scrolled to bring entry 40 into view");

  // --- Stacked layout: both panes are visible, falls back to the plain Filtered-view branch ---
  w.applyFhView("stacked");
  T.state.selectedId = null;
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: w.minimapTsToX(f.entries[20].ts), clientY: 10 }));
  assert(T.state.selectedId === f.entries[20].id, "Stacked layout: click still resolves against the Filtered view — both panes visible, no ambiguity");
  assert(T.state.entriesView === "filter", "...via selectEntry, same as the Filtered-tab case above");
});
