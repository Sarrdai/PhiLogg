// GROUP 121 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 121 — Bugfix (person-reported, follow-up to Group 120): the
   minimap's selection pin (updateMinimapSelectionMarkers/
   minimapMarkedEntries) must only show while the selected entry is actually
   a member of whatever pane is presently on screen (currentViewEntries for
   the Filtered tab, currentHighlightViewEntries for the Full tab, either in
   Stacked). It used to resolve via a plain entryIndex lookup first, which
   finds ANY real entry ever selected regardless of view membership — so the
   pin kept pointing at a position nothing on screen actually marked any
   more:
     a) A faded temp anchor (spliceTempAnchor drops it from currentViewEntries
        once tempAnchorMode is "fade" and it's faded) used to leave the pin
        showing at the anchor's old position. scheduleTempAnchorFade now
        calls updateMinimapSelectionMarkers() itself right when the fade
        completes (both the animated-row branch and the "scrolled out of the
        rendered window" early-return branch), instead of waiting for some
        unrelated future render to refresh it.
     b) Switching to a Filtered-tab-only (or Full-tab-only) selection while
        the OTHER tab is the one on screen now hides the pin immediately —
        showFhTab/applyFhView's Stacked branch both call
        updateMinimapSelectionMarkers() on every tab switch, same pattern as
        their existing updateMinimapFullRange/updateMinimapRenderedRange
        calls.
   ============================================================ */
group(121);
await withApp(async (w, d, T) => {
  section("121a. The minimap's selection pin disappears when a fading temp anchor's row is actually removed");

  const f = await w.addFile("app.log", makeLog(0, 60, { suffix: i => (i >= 50 ? "keep" : "skip") }), () => {});
  const skipFilter = w.createFilterNode(f.id, "text", "skip"); // matches entries 0-49
  const keepFilter = w.createFilterNode(f.id, "text", "keep"); // matches entries 50-59
  w.applyTempAnchorFadeSeconds(0.5);
  const modeSelect = d.querySelector("#settingsTempAnchorMode");
  modeSelect.value = "fade";
  modeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));

  T.state.activeId = skipFilter.id;
  w.render();
  fireClick([...d.querySelectorAll("#tableRows .log-row")][0], w); // entry index 0
  const anchoredEntryId = T.state.selectedId;

  fireClick(d.querySelector('.tree-row[data-node-id="' + keepFilter.id + '"]'), w);
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === anchoredEntryId, "sanity: switching set a temp anchor");
  const markersEl = d.querySelector("#minimapSelectionMarkers");
  assert(markersEl.innerHTML.length > 0, "sanity: the pin is drawn right after the switch, while the anchor row is still shown");

  await waitFor(() => T.state.tempAnchor.faded === true && d.querySelector("#tableRows .log-row.temp-anchor-row") === null); // past the 0.5s fade + its 300ms removal step
  assert(T.state.tempAnchor.faded === true, "sanity: the anchor has faded");
  assert(markersEl.innerHTML === "",
    "BUGFIX: the pin is cleared the moment the faded anchor row is actually removed, not left pointing at its old position");
});

await withApp(async (w, d, T) => {
  section("121b. The minimap's selection pin is gated on which fh pane is actually on screen");

  const fileA = await w.addFile("a.log", makeLog(0, 5, { suffix: () => "match" }), () => {});
  const fileB = await w.addFile("b.log", makeLog(100, 5, { suffix: () => "other" }), () => {});
  const filterA = w.createFilterNode(fileA.id, "text", "match"); // matches all of fileA
  T.state.activeId = filterA.id;
  w.render();
  fireClick([...d.querySelectorAll("#tableRows .log-row")][0], w); // selects a fileA entry, in the Filtered pane
  assert(T.state.selectedId === fileA.entries[0].id, "sanity: selected fileA's own entry 0");

  // renderTimelineMinimap rebuilds #minimapSelectionMarkers' element identity
  // from scratch on every full render (svg.innerHTML = ...), so it's
  // re-queried after each render below rather than cached once.
  assert(d.querySelector("#minimapSelectionMarkers").innerHTML.length > 0,
    "sanity: pin shows while the Filtered tab (where the selection lives) is on screen");

  // Switch the active node to fileB — the Full tab now reflects fileB's own
  // entries, which never contain fileA's entry 0 — and reveal the Full tab.
  T.state.activeId = fileB.id;
  w.render();
  w.applyFhView("highlight");
  assert(d.querySelector("#minimapSelectionMarkers").innerHTML === "",
    "BUGFIX: the pin hides once the Full tab (showing fileB, not fileA) is what's on screen — the old fileA selection isn't a member of it");

  // Switching back to the Filtered tab doesn't resurrect it either — fileA's
  // filter node isn't the active node any more, so currentViewEntries (now
  // fileB's) doesn't contain it either.
  w.applyFhView("filter");
  assert(d.querySelector("#minimapSelectionMarkers").innerHTML === "",
    "...and the Filtered tab shows fileB's own (still-)active filter now too — same result");
});
