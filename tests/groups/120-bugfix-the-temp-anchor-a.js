// GROUP 120 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 120 — Bugfix: the temp anchor (a foreign entry stitched into the
   Filtered table for context — see spliceTempAnchor) must not skew the
   timeline minimap's time-range computation, in EITHER of its two boxes:
     a) #minimapFullRangeRect (renderTimelineMinimap): renderMainView used to
        pass the POST-splice list (currentViewEntries, anchor row included)
        into renderTimelineMinimap, so an anchor sitting far outside the
        actual filtered entries' own time span made the box balloon out to
        cover it. Fixed by capturing minimapViewEntries from
        getVisibleEntries() BEFORE spliceTempAnchor runs.
     b) #minimapRenderedRangeRect (updateMinimapRenderedRange /
        minimapRenderedSpan): this box sources from currentViewEntries
        directly (the anchor row IS genuinely rendered on screen, unlike
        (a)'s bucketing pass), so (a)'s fix alone left this second box still
        stretching out to the anchor — the person-reported follow-up this
        group's (b) covers. minimapRenderedSpan now walks its computed
        start/end index inward past any `_tempAnchor`-flagged row to the
        nearest real one before converting to a pixel span, returning null
        (box hidden) in the folded-corner case where only the anchor row is
        actually in view.
   ============================================================ */
group(120);
await withApp(async (w, d, T) => {
  section("120a. Temp anchor is excluded from the minimap's time-range bucketing (#minimapFullRangeRect)");

  // 60 entries, 1s apart: indices 0-49 -> "skip", 50-59 -> "keep". keepFilter
  // therefore only ever matches a narrow, LATE slice of the file's timeline.
  const f = await w.addFile("app.log", makeLog(0, 60, { suffix: i => (i >= 50 ? "keep" : "skip") }), () => {});
  const skipFilter = w.createFilterNode(f.id, "text", "skip"); // matches entries 0-49
  const keepFilter = w.createFilterNode(f.id, "text", "keep"); // matches entries 50-59
  d.querySelector("#settingsTempAnchorMode").value = "persistent";
  d.querySelector("#settingsTempAnchorMode").dispatchEvent(new w.Event("change", { bubbles: true }));
  w.render();

  T.state.activeId = skipFilter.id;
  w.render();
  fireClick([...d.querySelectorAll("#tableRows .log-row")][0], w); // entry index 0 (earliest in the file)
  const anchoredEntryId = T.state.selectedId;
  assert(anchoredEntryId === f.entries[0].id, "sanity: anchored entry is the file's very first (earliest) one");

  fireClick(d.querySelector('.tree-row[data-node-id="' + keepFilter.id + '"]'), w);
  assert(T.state.tempAnchor && T.state.tempAnchor.entryId === anchoredEntryId,
    "sanity: switching to keepFilter set a temp anchor pointing at the far-earlier entry 0");

  const fullRect = d.querySelector("#minimapFullRangeRect");
  const x1 = parseFloat(fullRect.getAttribute("x"));
  const expectedLeft = w.minimapBarSpan(f.entries[50].ts).left;
  assert(Math.abs(x1 - expectedLeft) < 1.5,
    "minimapFullRangeRect's left edge matches keepFilter's own earliest real entry (index 50), " +
    "not the far-earlier anchored entry 0 — got x=" + x1.toFixed(1) + ", expected ~" + expectedLeft.toFixed(1));

  // --- (b): #minimapRenderedRangeRect must not stretch to the anchor either.
  // All of keepFilter's 10 real rows (plus the anchor) fit inside the
  // (mocked 400px-tall) viewport, so the anchor row really is on-screen —
  // exactly the case this box's own fix has to handle, distinct from (a)'s
  // bucketing-pass fix above.
  w.updateMinimapRenderedRange();
  const renderedRect = d.querySelector("#minimapRenderedRangeRect");
  assert(!renderedRect.classList.contains("hidden"), "sanity: the rendered-range box is visible (real rows are on screen)");
  const rx1 = parseFloat(renderedRect.getAttribute("x"));
  assert(Math.abs(rx1 - expectedLeft) < 1.5,
    "minimapRenderedRangeRect's left edge also matches keepFilter's own earliest real entry (index 50), " +
    "not the far-earlier anchored entry 0 — got x=" + rx1.toFixed(1) + ", expected ~" + expectedLeft.toFixed(1));
});
