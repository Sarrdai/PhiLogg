// GROUP 29 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 29 — Pin-bookmarks toggle, superseded by this session's toolbar
   reorganization (person-requested "Gesamtkonzept"). No longer a single
   #btnPinBookmarks in #viewBar — it now lives inside #filteredToolbar (the
   ONE log-display toggle that is NOT also duplicated into #contextToolbar,
   since pinning only affects the Filtered view's own result set — see
   PROJECT.md "Pin bookmarks into the Filtered View"). This group covers
   the current structural placement; functional behaviour (merge logic,
   level-filter bypass, persistence) is covered by Group 27/28.
   ============================================================ */
group(29);
await withApp(async (w, d, T) => {
  section("29. Pin-bookmarks toggle lives in #filteredToolbar, not duplicated into #contextToolbar");

  const btnPin = d.querySelector(".toggle-pin");
  assert(btnPin !== null, "sanity: .toggle-pin exists somewhere in the document");
  assert(d.querySelectorAll(".toggle-pin").length === 1, "exactly one copy exists (unlike the other five log-display toggles, which get one per log view)");
  const filteredToolbar = d.querySelector("#filteredToolbar");
  assert(filteredToolbar.contains(btnPin), ".toggle-pin lives inside #filteredToolbar");
  assert(!d.querySelector("#contextToolbar").contains(btnPin), ".toggle-pin is NOT duplicated into #contextToolbar — pinning is meaningless while looking at Context's always-whole-file result");

  // --- Visual treatment: kept its own icon-button look, NOT restyled as a level pill ---
  assert(btnPin.classList.contains("toolbar-icon-btn"), ".toggle-pin keeps its original .toolbar-icon-btn class");
  assert(!btnPin.classList.contains("level-btn"), ".toggle-pin is NOT styled like the level filter pills (different functionality, deliberately different look)");

  // --- Functional sanity from its location: click still toggles state + active class ---
  await w.addFile("a.log", makeLog(0, 5, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  w.render();
  assert(!btnPin.classList.contains("active"), "sanity: pin toggle starts inactive");
  fireClick(btnPin, w);
  assert(T.state.pinBookmarksInFilteredView === true, "click still sets state.pinBookmarksInFilteredView");
  assert(btnPin.classList.contains("active"), "pin button still shows active state after click");
  fireClick(btnPin, w); // revert
  assert(T.state.pinBookmarksInFilteredView === false, "sanity: reverted");
});

/* ============================================================
   GROUP 29b — every icon button in the app shares `.toolbar-icon-btn`'s
   28x28 shape, no id/scope-specific size override anywhere. The six
   log-display toggles moved out of #viewBar into #contextToolbar/
   #filteredToolbar this session (see the toolbar-reorganization groups
   above) briefly got a 22x22 scoped-down override there (matching those
   rows' then-30px height) — person-reported follow-up, same session:
   "the elements look far too small now, size them like the permanent
   Filter-Toolbar" — removed again, so every view toolbar (#contextToolbar/
   #filteredToolbar/#tableToolbar/#plotToolbar) now uses the full 28x28
   size, its own row height grown from 30px to 36px to fit them
   comfortably (`CONTEXT_TOOLBAR_HEIGHT` in the JS updated to match).
   jsdom has no layout engine (see "Testing approach"), so this asserts the
   cascaded width/height rather than a rendered pixel size.
   ============================================================ */
group(29);
await withApp(async (w, d) => {
  section("29b. Every icon button — header, Filter-Toolbar, and every view toolbar — shares .toolbar-icon-btn's 28x28 shape");
  const cs = w.getComputedStyle;
  ["#btnUndo", "#btnRedo", ".toggle-pin", ".toggle-notes", ".toggle-multiline", ".toggle-columns", ".toggle-textmatch", ".toggle-highlightmatch", ".toggle-filepaths"].forEach(sel => {
    const btn = d.querySelector(sel);
    assert(btn !== null, "sanity: " + sel + " exists");
    const bcs = cs(btn);
    assert(bcs.width === "28px" && bcs.height === "28px", sel + " has no size override — it shares .toolbar-icon-btn's 28x28 shape, got " + bcs.width + "x" + bcs.height);
  });
}, { toolbarLabels: "hover" });
