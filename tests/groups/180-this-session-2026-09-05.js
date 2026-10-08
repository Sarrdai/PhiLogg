// GROUP 180 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 180 — this session (2026-09-05), person-requested: the log views'
   own toolbars (Context/Filtered/Table/Plot) get the same reveal-a-label-
   on-hover mechanic as the Filter-Toolbar's row-actions, but expanding into
   a rounded RECTANGLE (the toolbar's normal 7px corner radius) instead of
   a pill — "gleiches Konzept, nur Rechteck statt Pille in den View
   Toolbars, Pille bleibt bei den Filtern". Applies to every plain
   .toolbar-icon-btn in those four toolbars (display toggles, Context's
   nav buttons, Export as CSV, Save as image, Fullscreen) via
   makeToolbarBtnExpandable() — the Statistics panel's own header toggle
   moved out of these toolbars entirely, this session, see Group 162 — and to
   the duplicated
   Bookmark/Add note/Add to selection copies via buildRowActionsHtml's new
   "rect" shape argument (`.row-action-btn.rect`) — the Filter-Toolbar's
   own row-actions (`[data-row-actions="viewbar"]`/`"plot-viewbar"`) keep
   the original circle/pill shape, untouched.
   ============================================================ */
group(180);
await withApp(async (w, d, T) => {
  section("180a. Plain view-toolbar buttons (toggles, nav, stats, export, save, fullscreen) get a hover label that expands into a rectangle, not a pill");

  const log = [0, 1, 2].map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"score=${i}.5"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "score=[*:float]");
  T.state.activeId = node.id;
  w.render();

  const notesBtn = d.querySelector("#contextToolbar .toggle-notes");
  assert(notesBtn.querySelector(".tb-hit") !== null, "wrapped in a .tb-hit span");
  const label = notesBtn.querySelector(".tb-label");
  assert(label !== null && label.querySelector(".hint-name").textContent === notesBtn.title, "carries a .tb-label matching its title exactly");
  assert(!notesBtn.classList.contains("row-action-btn"), "sanity: not a row-action-btn (different mechanism, same idea)");

  assert(!notesBtn.classList.contains("expanded"), "sanity: starts collapsed");
  const notesHit = notesBtn.querySelector(".tb-hit");
  notesHit.getBoundingClientRect = () => ({ top: 0, left: 0, right: 28, bottom: 28, width: 28, height: 28, x: 0, y: 0 });
  const notesGroup = notesBtn.parentElement;
  notesGroup.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: false, clientX: 10, clientY: 10 }));
  assert(notesBtn.classList.contains("expanded"), "moving into .tb-hit's (collapsed-state) rect expands the button");
  notesGroup.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: false, clientX: 500, clientY: 500 }));
  assert(!notesBtn.classList.contains("expanded"), "moving off .tb-hit's rect collapses it again");
  notesGroup.dispatchEvent(new w.MouseEvent("mouseleave", { bubbles: false }));

  // Applied consistently across all four toolbars' plain buttons, not just
  // one — spot-check one from each.
  w.applyFhView("table");
  assert(d.querySelector("#tableExportCsvBtn").querySelector(".tb-hit") !== null, "#tableExportCsvBtn is wrapped too");
  w.applyFhView("plot");
  w.render();
  assert(d.querySelector("#plotSaveImageBtn").querySelector(".tb-hit") !== null, "#plotSaveImageBtn is wrapped too");
  assert(d.querySelector("#plotFullscreenBtn").querySelector(".tb-hit") !== null, "#plotFullscreenBtn is wrapped too");
});

await withApp(async (w, d, T) => {
  section("180b. Bookmark/Add note/Add to selection (duplicated into the log views) carry .rect, not the Filter-Toolbar's circle/pill shape");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  ["bookmark", "note", "addToSelection"].forEach(action => {
    const btn = d.querySelector('#contextToolbar [data-row-action="' + action + '"]');
    assert(btn.classList.contains("row-action-btn") && btn.classList.contains("rect"),
      action + " carries both .row-action-btn (shared mechanism) and .rect (square/rectangle, not circle/pill)");
  });

  // The Filter-Toolbar's own row-actions are untouched — still the
  // original circle/pill shape, no .rect.
  ["filterAfter", "filterBefore", "filterForMessage", "timeRangeFromSelection"].forEach(action => {
    const btn = d.querySelector('[data-row-actions="viewbar"] [data-row-action="' + action + '"]');
    assert(btn.classList.contains("row-action-btn") && !btn.classList.contains("rect"),
      action + " keeps the circle/pill shape in the Filter-Toolbar (no .rect)");
  });
});
