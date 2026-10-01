// GROUP 27 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 27 — Pin bookmarks into the Filtered View
   Origin: this session (2026-08-14), from FEATURE_BACKLOG.md item 1
   (person-requested, modeled on glogg/klogg's "marks" always breaking
   through the search pattern into the filtered view). See PROJECT.md "Pin
   bookmarks into the Filtered View" for the full design writeup and the
   decisions this session made on the backlog doc's open questions.
   ============================================================ */
group(27);
await withApp(async (w, d, T) => {
  section("27. Pin bookmarks into the Filtered View");
  const fa = await w.addFile("a.log", makeLog(0, 20, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 10), () => {});
  T.state.activeId = fa.id;
  w.render();

  const textNode = w.createFilterNode(fa.id, "text", "message 1"); // matches entries 1, 10..19 (10 of 20)
  T.state.activeId = textNode.id;
  w.render();
  const baselineCount = w.getVisibleEntries().length;
  assert(baselineCount === 11, "sanity: text filter substring-matches 11 of 20 entries (\"message 1\" also matches \"message 10\"..\"message 19\") before any pinning");

  // Bookmark an entry the active filter does NOT match (entry 0, "message 0").
  const outsideEntry = fa.entries[0];
  w.toggleBookmark(outsideEntry.id);
  assert(w.getVisibleEntries().length === baselineCount, "toggle off (default): bookmarked-but-non-matching entry stays excluded");

  // --- Toggle on via the toolbar button --- (.toggle-pin: this session's
  // toolbar reorganization moved it from a single #btnPinBookmarks in
  // #viewBar into #filteredToolbar; it's the only one of the six log-display
  // toggles that ISN'T also duplicated into #contextToolbar — pinning only
  // affects the Filtered view's own result set.)
  const btnPin = d.querySelector(".toggle-pin");
  assert(!btnPin.classList.contains("active"), "pin button starts inactive");
  fireClick(btnPin, w);
  assert(T.state.pinBookmarksInFilteredView === true, "click sets state.pinBookmarksInFilteredView");
  assert(btnPin.classList.contains("active"), "pin button shows active state after click");

  const visible = w.getVisibleEntries();
  assert(visible.length === baselineCount + 1, "pinned-in bookmark adds exactly one extra entry");
  assert(visible.some(e => e.id === outsideEntry.id), "the bookmarked-but-non-matching entry is now present");
  const idxOutside = visible.findIndex(e => e.id === outsideEntry.id);
  assert(idxOutside === 0, "merge respects chronological order (entry 0 sorts first)");

  // --- Level filter bypass: a pin is absolute, same as the filter tree above ---
  T.state.levelFilter.add("ERROR");
  const visibleLvl = w.getVisibleEntries();
  assert(visibleLvl.some(e => e.id === outsideEntry.id), "pinned entry (level INFO) still shown even though the level filter is set to ERROR only");
  T.state.levelFilter.clear();

  // --- Row rendering: pinned-but-non-matching gets .pinned-row, a real match doesn't ---
  // Scoped to #tableRows (Filtered view) — the same entry is also present,
  // unfiltered, in #highlightRows (Full view), which has no pinned-row
  // concept at all, so an unscoped query would ambiguously match either.
  w.render();
  const outsideRow = d.querySelector('#tableRows [data-entry-id="' + outsideEntry.id + '"]');
  assert(outsideRow && outsideRow.classList.contains("pinned-row"), "row for the pinned-but-non-matching entry gets .pinned-row");
  const matchedEntry = fa.entries[1]; // matches the "message 1" filter directly
  w.toggleBookmark(matchedEntry.id); // also bookmark a genuinely matching entry
  w.render();
  const matchedRow = d.querySelector('#tableRows [data-entry-id="' + matchedEntry.id + '"]');
  assert(matchedRow && !matchedRow.classList.contains("pinned-row"), "a bookmarked entry that already matched the filter is NOT marked .pinned-row (it's not there only because of the pin)");
  w.toggleBookmark(matchedEntry.id); // revert

  // --- Scoping: a bookmark on a DIFFERENT root file must not leak into this root's Filtered View ---
  const otherRootEntry = fb.entries[0];
  w.toggleBookmark(otherRootEntry.id);
  assert(!w.getVisibleEntries().some(e => e.id === otherRootEntry.id), "a bookmark belonging to a different root file is not pinned into this root's Filtered View");
  w.toggleBookmark(otherRootEntry.id); // revert

  // --- Toggle off restores baseline exactly ---
  fireClick(btnPin, w);
  assert(T.state.pinBookmarksInFilteredView === false, "second click turns pinning back off");
  assert(!btnPin.classList.contains("active"), "pin button loses active state");
  assert(w.getVisibleEntries().length === baselineCount, "turning the toggle off restores the unpinned result exactly");

  // --- Extract mode is untouched (getVisibleEntries is only used by the plain table path) ---
  fireClick(btnPin, w); // back on
  const extractNode = w.createFilterNode(fa.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 20, "extract table result is unaffected by the pin toggle (its own placeholder pattern matches all 20 lines regardless)");
  T.state.activeId = textNode.id;
  fireClick(btnPin, w); // back off, leave state clean for cache/export checks below
  w.toggleBookmark(outsideEntry.id); // remove the test bookmark

  // --- Persistence: session cache (IndexedDB) settings round-trip ---
  T.state.pinBookmarksInFilteredView = true;
  w.updatePinBookmarksButton();
  await w.persistMetaNow();
  const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
  assert(meta && meta.settings.pinBookmarksInFilteredView === true, "cache: pinBookmarksInFilteredView written to meta.settings");

  // --- Persistence: session export/import JSON round-trip ---
  const exportData = w.buildSessionExport([fa.id], new Set());
  assert(exportData.settings.pinBookmarksInFilteredView === true, "export: pinBookmarksInFilteredView included in the exported settings");
}, { indexedDB: new IDBFactory() });
