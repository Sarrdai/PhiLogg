// GROUP 106 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 106 — Person-reported follow-ups to the Bookmarks rework (this
   session): (A) a new purely-visual, full-height bookmark-icon column on
   the left of the row (col-bookmark-icon), restoring visual recognition of
   a bookmarked entry that the removed .row-bookmark-dot used to provide
   (person-reported regression: without it, a bookmarked row was
   indistinguishable from any other unless the Bookmarks node itself had a
   color); (B) the color-mark gutter (.hl-markers) now sizes itself
   (--color-mark-w CSS var) to the TRUE max number of simultaneous
   colored-filter matches any one row reaches across the whole file, cached
   by updateColorMarkGutter and recomputed alongside highlightColorMap
   rather than per row; (C) toggleBookmark/syncBookmarksFilterNode now
   recompute highlightColorMap (and the gutter width) themselves, so a
   bookmark add/remove updates the Bookmarks node's own color-mark
   immediately, with no view switch needed; (D) a note-row belonging to a
   temp-anchor row that fades out (scheduleTempAnchorFade) is now removed in
   the same step as the fading row itself, instead of being left orphaned.
   ============================================================ */
group(106);
await withApp(async (w, d, T) => {
  section("106a. New bookmark-icon column (left gutter, full height, accent-colored, both row renderers)");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const e0 = f.entries[0], e1 = f.entries[1];
  const iconInFiltered = () => d.querySelector('#tableRows [data-entry-id="' + e0.id + '"] .col-bookmark-icon');
  const iconInFull = () => d.querySelector('#highlightRows [data-entry-id="' + e0.id + '"] .col-bookmark-icon');

  assert(!iconInFiltered() && !iconInFull(), "no bookmark icon rendered for a non-bookmarked entry, in either view");

  w.toggleBookmark(e0.id);
  assert(!!iconInFiltered(), "bookmark icon appears in the Filtered/Full-shared row renderer (renderVisibleRows) exactly when state.bookmarks.has(id)");
  assert(!!iconInFull(), "...and in the Full view's own renderer (renderHighlightVisibleRows) too");
  assert(iconInFiltered().querySelector("svg"), "the icon column actually renders an icon glyph, not just an empty marker span");
  assert(!d.querySelector('#tableRows [data-entry-id="' + e1.id + '"] .col-bookmark-icon'),
    "an entry that isn't bookmarked still gets no icon, even with a bookmark elsewhere in the file");

  w.toggleBookmark(e0.id); // revert
  assert(!iconInFiltered() && !iconInFull(), "unbookmarking removes the icon from both views immediately");

  // Uses the theme's accent/highlight token, not a hardcoded color — verified
  // against the stylesheet text itself (jsdom has no real CSS cascade/paint
  // engine to resolve var() through getComputedStyle reliably, same blind
  // spot documented in tests/README.md's "Known gaps").
  assert(/\.col-bookmark-icon\{[^}]*color:var\(--accent\)/.test(html),
    "the bookmark icon column is styled with color:var(--accent) — the same token used elsewhere for selection/highlight accents — not a hardcoded color");
});

await withApp(async (w, d, T) => {
  section("106b. Color-mark column: dynamic width for the true max simultaneous-color count");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();

  const gutterW = () => parseInt(d.documentElement.style.getPropertyValue("--color-mark-w"), 10);
  assert(gutterW() === 3, "baseline: no colored filters at all -> gutter width is the single-mark default (3px)");

  // "message" matches all 20 entries; "message 1" matches 11 of them
  // (message1, message10-19) — every one of those 11 rows now has TWO
  // simultaneous color marks, the rest still have one.
  const wide = w.createFilterNode(f.id, "text", "message");
  w.setHighlightColor(wide.id, "#ff0000");
  assert(gutterW() === 3, "coloring a filter that matches every row alone (max simultaneous count 1) keeps the single-mark width");

  const narrow = w.createFilterNode(f.id, "text", "message 1");
  w.setHighlightColor(narrow.id, "#00ff00");
  assert(gutterW() === 7, "two overlapping colored filters -> max simultaneous count 2 -> gutter widens to fit both marks (2*3 + 1 gap = 7px)");
  assert(T.highlightColorMap.get(f.entries[1].id).length === 2, "sanity: entry actually carries both colors in highlightColorMap");

  // A third, narrower filter overlapping the same subset raises the true max further
  const narrowest = w.createFilterNode(f.id, "text", "message 10");
  w.setHighlightColor(narrowest.id, "#0000ff");
  assert(gutterW() === 11, "a third overlapping colored filter raises the cached max to 3 -> gutter widens again (3*3 + 2 gaps = 11px) — rescales live as filters are colored, not just once at load");

  // Removing the color that created the highest overlap shrinks the gutter back down
  w.setHighlightColor(narrowest.id, null);
  w.setHighlightColor(narrow.id, null);
  assert(gutterW() === 3, "uncoloring back down to a single colored filter shrinks the gutter back to the single-mark default");
});

await withApp(async (w, d, T) => {
  section("106c. Bugfix: bookmark add/remove updates the Bookmarks node's own color-mark immediately, no view switch needed");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const e0 = f.entries[0];
  w.toggleBookmark(e0.id); // creates the auto-managed "Bookmarks" node (syncBookmarksFilterNode)
  const bmNode = Object.values(T.state.nodes).find(n => n.filterType === "bookmarks");
  assert(bmNode, "sanity: bookmarking creates the auto-managed Bookmarks filter node");
  w.setHighlightColor(bmNode.id, "#abcdef"); // full render() here, as any color-picker action does

  const markerColor = () => {
    const el = d.querySelector('#tableRows [data-entry-id="' + e0.id + '"] .hl-marker');
    return el && el.style.background;
  };
  assert(markerColor() === "rgb(171, 205, 239)" || markerColor() === "#abcdef", "sanity: e0's row shows the Bookmarks node's color-mark once colored");

  const e1 = f.entries[1];
  // BUGFIX: toggling a SECOND bookmark must update e1's color-mark and the
  // gutter's max-count immediately — no w.render()/view-switch in between,
  // reproducing the reported bug exactly (previously highlightColorMap only
  // got recomputed inside the full render pipeline).
  w.toggleBookmark(e1.id);
  assert(!!d.querySelector('#tableRows [data-entry-id="' + e1.id + '"] .hl-marker'),
    "BUGFIX: newly bookmarking e1 shows the Bookmarks node's color-mark on its row immediately, with no separate render() call");
  assert(T.highlightColorMap.get(e1.id) && T.highlightColorMap.get(e1.id).includes("#abcdef"),
    "highlightColorMap itself is recomputed by toggleBookmark, not just the DOM");

  w.toggleBookmark(e1.id); // revert
  assert(!d.querySelector('#tableRows [data-entry-id="' + e1.id + '"] .hl-marker'),
    "...and unbookmarking removes it again immediately, same path");
});

await withApp(async (w, d, T) => {
  section("106d. Bugfix: a note under a fading temp-anchor row is removed when the fade completes, not orphaned");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const keepFilter = w.createFilterNode(f.id, "text", "message");   // matches everything
  const narrowFilter = w.createFilterNode(f.id, "text", "message 2"); // matches only entry 2
  T.state.activeId = keepFilter.id;
  const skip1Id = f.entries[1].id; // NOT matched by narrowFilter -> becomes the temp anchor when switching to it
  T.state.selectedId = skip1Id;
  w.render();

  fireClick(d.querySelector(".toggle-notes"), w); // show notes
  T.state.notes.set(skip1Id, "orphan me not");
  w.applyTempAnchorFadeSeconds(0.5);
  const modeSelect = d.querySelector("#settingsTempAnchorMode");
  modeSelect.value = "fade";
  modeSelect.dispatchEvent(new w.Event("change", { bubbles: true }));

  T.state.tempAnchor = null;
  w.render();
  fireClick(d.querySelector('.tree-row[data-node-id="' + narrowFilter.id + '"]'), w);
  const anchorRow = d.querySelector("#tableRows .log-row.temp-anchor-row");
  assert(!!anchorRow, "sanity: fade mode draws the anchor row right after the switch");
  const noteRowBefore = anchorRow.nextElementSibling;
  assert(noteRowBefore && noteRowBefore.classList.contains("note-row") && noteRowBefore.dataset.entryId === skip1Id,
    "sanity: the anchor row's note renders as its sibling note-row while the row is still shown");

  await waitFor(() => d.querySelector("#tableRows .log-row.temp-anchor-row") === null); // past the 0.5s fade duration
  assert(d.querySelector("#tableRows .log-row.temp-anchor-row") === null, "the fading anchor row is removed once its fade completes");
  assert(d.querySelector('#tableRows .note-row[data-entry-id="' + skip1Id + '"]') === null,
    "BUGFIX: its note-row is removed in the same step, not left behind orphaned under nothing");
});
