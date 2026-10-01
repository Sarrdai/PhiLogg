// GROUP 151 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 151 — the Context view's toolbar (person-requested, same round as
   the GROUP 138 rewrite): the match navigation used to float over the log
   lines as a corner chip whose corner was itself a setting. It is now a real
   toolbar row inside the table, directly under the header — in flow, so it
   takes its height out of the scroll viewport instead of covering rows — and
   it gained a separate "collapse all" button next to the expand-all one.
     a) it sits between the header and the body, is not overlaid, and the old
        floating chip (and its corner setting) are gone.
     b) shown only while the Context panel is actually on screen with a
        filter active; hidden on a file node.
     c) the buttons are the app's own icon-button shape; prev/next disable
        below two matches; the label follows the selection.
     d) expand-all/collapse-all disable when they would do nothing.
     e) showing the bar compensates the scroll position by exactly its own
        height, so the log rows don't slide down under it.
     f) the two settings: auto-expand is the stored default, and the step
        size persists and is clamped.
   ============================================================ */
group(151);
await withApp(async (w, d, T) => {
  section("151. Context view toolbar");

  const f = await w.addFile("bar.log", makeLog(0, 40, { suffix: i => (i % 20 === 0 ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f.id, "text", "hit"); // entries 0, 20
  const showContext = () => { w.render(); w.applyFhView("highlight"); };
  T.state.activeId = hitFilter.id;
  showContext();

  const bar = d.querySelector("#contextToolbar");

  // --- (a) where it lives ------------------------------------------------
  assert(bar, "the toolbar exists");
  assert(!d.querySelector("#contextNav"), "the floating corner chip it replaces is gone");
  assert(!d.querySelector("#settingsContextNavCorner"),
    "…and so is the 'which corner' setting that only existed because it floated");
  const kids = [...d.querySelector("#highlightWrap").children].map(el => el.id);
  assert(kids.indexOf("contextToolbar") === kids.indexOf("highlightHeader") - 1 &&
    kids.indexOf("highlightBody") === kids.indexOf("highlightHeader") + 1,
    "it sits directly under the filter bar, above the header, which stays directly over the scrolling body, got " + JSON.stringify(kids));
  assert(w.getComputedStyle(bar).position !== "absolute",
    "it is in normal flow — it shrinks the viewport rather than covering log rows");

  // --- (b) when it is shown ---------------------------------------------
  assert(!bar.classList.contains("hidden"), "shown while the Context view is on screen with a filter active");
  w.applyFhView("filter");
  assert(bar.classList.contains("hidden"), "hidden while the Filtered tab is the one showing");
  w.applyFhView("highlight");
  T.state.activeId = f.id;
  showContext();
  assert(bar.classList.contains("hidden"),
    "hidden on a file node — nothing there to navigate or fold, same rule the chip had");
  T.state.activeId = hitFilter.id;
  showContext();

  // --- (c) the navigation half ------------------------------------------
  const prev = d.querySelector("#ctxPrevMatch"), next = d.querySelector("#ctxNextMatch");
  assert([...bar.querySelectorAll("button")].filter(b => !b.closest("#ctxTextLayout")).every(b => b.classList.contains("toolbar-icon-btn")),
    "every button (bar the plain-text Pretty/Raw segmented toggle) uses the app's own icon-button shape (.toolbar-icon-btn), not a one-off style");
  // Every button here (person-requested, 2026-09-05: the same
  // reveal-a-label-on-hover mechanic as the Filter-Toolbar's row-actions,
  // just square-to-rectangle instead of circle-to-pill — see
  // makeToolbarBtnExpandable) carries its label text in the DOM, collapsed
  // to nothing visible via CSS max-width:0 at rest and revealed on hover —
  // so jsdom's plain .textContent is never empty here, unlike a purely
  // icon-only button with nothing but a native title tooltip.
  assert([...bar.querySelectorAll("button")].every(b => b.title && b.textContent.trim()),
    "…icon-only at rest, each carries a hover-revealed label matching its tooltip");
  assert(!prev.disabled && !next.disabled, "two matches, so both arrows are live");
  assert(d.querySelector("#contextNavLabel").textContent.trim() === "2",
    "no selection yet, so the label is the bare match count, got " +
      JSON.stringify(d.querySelector("#contextNavLabel").textContent));
  w.selectHighlightEntry(f.entries[20].id, {});
  assert(d.querySelector("#contextNavLabel").textContent.trim() === "2 / 2",
    "…and it follows the selection, got " + JSON.stringify(d.querySelector("#contextNavLabel").textContent));
  fireClick(prev, w);
  assert(T.state.selectedId === f.entries[0].id, "the ‹ button walks to the previous match");

  const single = w.createFilterNode(f.id, "text", "message 3 other"); // exactly one match
  T.state.activeId = single.id;
  showContext();
  assert(d.querySelector("#ctxPrevMatch").disabled && d.querySelector("#ctxNextMatch").disabled,
    "with a single match there is nowhere to walk, so both arrows are disabled");
  T.state.activeId = hitFilter.id;
  T.state.selectedId = null; // the switch would open the selection's window (GROUP 276)
  showContext();

  // --- (d) the fold half -------------------------------------------------
  const expandAll = () => d.querySelector("#ctxExpandAll"), collapseAll = () => d.querySelector("#ctxCollapseAll");
  assert(!expandAll().disabled && collapseAll().disabled,
    "nothing revealed yet: expand-all is live, collapse-all has nothing to do");
  fireClick(expandAll(), w);
  assert(T.currentHighlightViewEntries.length === 40 && expandAll().disabled && !collapseAll().disabled,
    "everything revealed: the two swap roles");
  fireClick(collapseAll(), w);
  assert(T.currentHighlightViewEntries.length === 2, "…and collapse-all hides it all again");

  // --- (e) showing the bar must not slide the rows --------------------------
  // The bar takes CONTEXT_TOOLBAR_HEIGHT out of the viewport from the top, so
  // without compensation every rendered row would move down by exactly that
  // much. setContextToolbarVisible gives it back on the scroll position.
  w.setAllGapsExpanded(true); // enough rows to actually be scrolled
  w.setContextToolbarVisible(false);
  w.setHighlightScroll(600);
  const before = d.querySelector("#highlightBody").scrollTop;
  w.setContextToolbarVisible(true);
  assert(d.querySelector("#highlightBody").scrollTop === before + T.CONTEXT_TOOLBAR_HEIGHT,
    "showing the bar scrolls by its own height, so each row keeps its place on screen, got " +
      d.querySelector("#highlightBody").scrollTop + " from " + before);
  w.setContextToolbarVisible(false);
  assert(d.querySelector("#highlightBody").scrollTop === before, "…and hiding it gives the scroll back");
  w.setContextToolbarVisible(true);

  // --- (f) the two settings ---------------------------------------------
  assert(d.querySelector("#settingsContextInitialExpansion").value === "aroundJump",
    "auto-expand around the selected row is the shipped default (person-requested)");
  const stepInput = d.querySelector("#settingsContextExpandStep");
  assert(stepInput.value === "10", "the step defaults to 10 lines per direction, got " + stepInput.value);
  stepInput.value = "4";
  stepInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.contextExpandStep === 4 && w.localStorage.getItem("philogg-context-expand-step") === "4",
    "a new step is applied and persisted");
  stepInput.value = "0";
  stepInput.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.contextExpandStep === 1 && stepInput.value === "1",
    "…and clamped, with the clamp reflected back into the field, got " + T.contextExpandStep);
});
