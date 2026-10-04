// GROUP 40 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 40 — Filter popup section reorg + "Filter for this ___" context
   menu (this session, person-requested)
   Origin: this session, two related requests. (1) The filter popup's
   layout, restructured into explicit sections: input+wildcard chips
   together, a settings row (case-sensitive/NOT), the live pattern
   preview, the column-restriction ("Applies to") chips, and a final
   footer row with the match count left-aligned and the action buttons
   right-aligned. (Originally shipped this same session with an "Extract
   values" checkbox in that footer, immediately superseded — see Group
   41 — by two separate buttons, Extract and Add filter, so the specific
   footer-actions assertions below point at the CURRENT #filterExtractBtn/
   #filterSubmitBtn pair, not the short-lived checkbox.) (2) The row
   context menu's "Extract numbers from this message" (#ctxExtractNumbers)
   was renamed to "Filter for this ___" (#ctxFilterForColumn), where "___"
   is whichever column the right-click actually landed on
   (resolveContextFilterColumn walks up from ev.target to the clicked
   .col-* span, falling back to "message" for anything else — row
   background, a link-view pair's brace). It does not decide text-vs-
   extraction itself: any numeric content still becomes a [*:...]
   wildcard pattern (reusing buildNumericExtractPattern unchanged), but
   whether that builds an extraction table is entirely up to which button
   gets clicked afterward (see Group 41) — so the same right-click can
   produce either a wildcard filter or an extraction, decided after the
   fact. A column with no numeric content (most Method/Thread values)
   falls back to its exact literal text instead of the old "No numeric
   values found" no-op toast, making the action useful there too. Also
   fixed in the same pass: two spots that set #filterInput's .value
   directly (insertTokenAtCursor — a token chip click — and this
   context-menu action) already called evaluateLiveMatch() but NOT
   updateExtractAvailability() (updateInvertAvailability() at the time),
   so the Extract button/checkbox could get stuck disabled after a
   wildcard was inserted any way other than typing it.
   ============================================================ */
group(40);
await withApp(async (w, d, T) => {
  section("40. Filter popup section reorg + 'Filter for this ___' context menu");

  // --- Section structure ---
  const inputSection = d.querySelector(".filter-input-section");
  assert(inputSection.contains(d.querySelector("#filterInput")) && inputSection.contains(d.querySelector("#filterTokenChips")),
    "the input and the [float]/[int]/... wildcard chips are grouped together in one input section");
  assert(d.querySelector("#filterTokenChips .filter-section-label").textContent === "Insert", "the wildcard-insert chips carry an 'Insert' caption");

  const settingsRow = d.querySelector(".filter-settings-row");
  assert(settingsRow.contains(d.querySelector("#filterCaseCheckbox")) && settingsRow.contains(d.querySelector("#filterInvertCheckbox")),
    "case-sensitive and NOT live together in the settings row");

  assert(d.querySelector("#filterColumnChips .filter-section-label").textContent === "Search in", "the column-restriction chips carry a 'Search in' caption");

  const footerRow = d.querySelector(".filter-footer-row");
  const footerActions = d.querySelector(".filter-footer-actions");
  assert(footerRow.children.length === 1 && footerRow.lastElementChild === footerActions, "the footer holds only the action buttons (the match count moved up into #filterResults)");
  const actionChildren = [...footerActions.children];
  // The separate "Extract" button is gone (this session's filterType merge,
  // docs/archive/ui-implementation-plan.md's follow-up note) — "Add filter" is the
  // footer's only action button now.
  assert(actionChildren.length === 2 && actionChildren[0] === d.querySelector("#filterLinkEventsBtn") && actionChildren[1] === d.querySelector("#filterSubmitBtn"),
    "Add filter is the footer's only action button, bottom-right, preceded by the small 'Link two events…' link");

  const formChildren = [...d.querySelector("#filterForm").children];
  const idx = el => formChildren.indexOf(el);
  assert(idx(inputSection) < idx(settingsRow) && idx(settingsRow) < idx(d.querySelector("#filterColumnChips")) &&
    idx(d.querySelector("#filterColumnChips")) < idx(d.querySelector("#filterPatternPreview")) &&
    idx(d.querySelector("#filterPatternPreview")) < idx(d.querySelector("#filterResults")) &&
    idx(d.querySelector("#filterResults")) < idx(footerRow),
    "sections appear top-to-bottom: input, syntax, search in, preview, results, footer");

  // --- Bugfix (historical, kept as a plain sanity check now that Extract's
  // own disabled-state is gone): a direct .value write (token chip click)
  // must also refresh the live-match preview, not leave it stale ---
  const bf = await w.addFile("bugfix.log", makeLog(0, 3), () => {});
  w.render();
  T.state.activeId = bf.id;
  w.openFilterPopup();
  fireClick(d.querySelector('.token-chip[data-token="float"]'), w);
  assert(d.querySelector("#filterInput").value.includes("[*:float]"), "sanity: the token chip inserted its placeholder");
  w.closeFilterPopup();

  // --- "Filter for this ___" context menu ---
  assert(d.querySelector("#ctxExtractNumbers") === null, "the old 'Extract numbers from this message' menu item is gone");
  const line = `2024-01-15 10:00:00,000\tINFO\t"pool 3"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"processed 42 items"\n`;
  const cf = await w.addFile("cols.log", line, () => {});
  w.render();
  T.state.activeId = cf.id;
  const activeCol = key => d.querySelector('.column-chip[data-col="' + key + '"]').classList.contains("active");

  // Default (row background, no specific column under the pointer) -> "message"
  fireContextMenu(d.querySelector(".log-row"), w, 50, 50);
  assert(d.querySelector("#ctxFilterForColumnLabel").textContent === "Filter for this Message", "right-clicking the row background defaults to the Message column");
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "processed [*:int] items", "numeric message content becomes a wildcard pattern, same as the old 'Extract numbers' action");
  assert(activeCol("message"), "the Message column chip is pre-selected to match what was right-clicked");
  w.closeFilterPopup();

  // A column with no numeric content falls back to its exact literal text
  fireContextMenu(d.querySelector(".col-method"), w, 60, 60);
  assert(d.querySelector("#ctxFilterForColumnLabel").textContent === "Filter for this Method", "right-clicking the Method cell labels the action for that column");
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "DoWork", "no numeric content in 'DoWork' -> falls back to the exact literal method text instead of a no-op");
  assert(activeCol("method"), "the Method column chip is pre-selected");
  w.closeFilterPopup();

  // A non-message column WITH numeric content also becomes a wildcard pattern
  fireContextMenu(d.querySelector(".col-thread"), w, 70, 70);
  assert(d.querySelector("#ctxFilterForColumnLabel").textContent === "Filter for this Thread", "right-clicking the Thread cell labels the action for that column");
  fireClick(d.querySelector("#ctxFilterForColumn"), w);
  assert(d.querySelector("#filterInput").value === "pool [*:int]", "numeric content in a non-message column ('pool 3') also becomes a wildcard pattern");
  assert(activeCol("thread"), "the Thread column chip is pre-selected");

  // End-to-end: "Add filter" is the only outcome now (the separate
  // "Extract" button/filterType was retired this session — see Group 41) —
  // it creates a "text" node restricted to the right-clicked column, ALSO
  // extraction-capable since its value has a wildcard.
  fireSubmit(d.querySelector("#filterForm"), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "text" && created.value === "pool [*:int]" && JSON.stringify(created.columns) === JSON.stringify(["thread"]),
    "end-to-end: 'Filter for this Thread' + 'Add filter' creates a 'text' filter restricted to the thread column, matched via the wildcard shape");
  assert(w.getEntries(created.id).length === 1, "the created filter actually matches the entry whose thread is 'pool 3'");
});
