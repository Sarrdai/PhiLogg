// GROUP row-contextmenu-select — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP row-contextmenu-select — right-click selects the row
   Origin: 2026-10-04 desktop usability test. Right-click on row B opened the
   menu while selection and detail panel stayed on row A. Now (Explorer
   convention) a right-click on a row outside state.logMultiSelect makes it
   the single selection first (selectEntry / selectHighlightEntry — no list
   expansion under the menu); inside the multi-selection nothing changes.
   ============================================================ */
group("row-contextmenu-select");
await withApp(async (w, d, T) => {
  const f = await w.addFile("a.log", makeLog(0, 12), () => {});
  T.state.activeId = f.id;
  w.render();
  const menu = d.querySelector("#contextMenu");
  const isOpen = () => !menu.classList.contains("hidden");
  const rowIn = (sel, id) => d.querySelector(sel + ' .log-row[data-entry-id="' + id + '"]');
  const rclick = el => el.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
  const detailText = () => d.querySelector("#detailPanel").textContent;
  const idOf = i => f.entries[i].id;
  const msgOf = i => f.entries[i].message;

  section("row-contextmenu-select a. Filtered row: right-click selects it, shows its detail, opens the menu");
  fireClick(rowIn("#tableRows", idOf(2)), w);
  assert(T.state.selectedId === idOf(2), "sanity: row 2 selected by a left click");
  rclick(rowIn("#tableRows", idOf(5)));
  assert(T.state.selectedId === idOf(5), "selection moved to the right-clicked row, got " + T.state.selectedId);
  assert(rowIn("#tableRows", idOf(5)).classList.contains("selected") && !rowIn("#tableRows", idOf(2)).classList.contains("selected"), "selected class follows");
  assert(detailText().includes(msgOf(5)), "detail panel shows the right-clicked entry");
  assert(isOpen(), "the context menu is open");
  // Same row again: still opens, selection unchanged.
  w.closeContextMenu();
  rclick(rowIn("#tableRows", idOf(5)));
  assert(T.state.selectedId === idOf(5) && isOpen(), "right-click on the already selected row just opens the menu");
  w.closeContextMenu();

  section("row-contextmenu-select b. Context tab row: right-click selects it via selectHighlightEntry");
  w.applyFhView("highlight");
  const hrow = id => rowIn("#highlightRows", id);
  assert(hrow(idOf(3)) && hrow(idOf(7)), "sanity: highlight rows rendered");
  rclick(hrow(idOf(3)));
  assert(T.state.selectedId === idOf(3), "Context row selected, got " + T.state.selectedId);
  assert(hrow(idOf(3)).classList.contains("selected"), "Context row carries the selected class");
  assert(detailText().includes(msgOf(3)), "detail panel shows the entry");
  assert(isOpen(), "menu open on the Context tab");
  w.closeContextMenu();
  w.applyFhView("filter");

  section("row-contextmenu-select c. Multi-selection: member keeps it, outside row replaces it");
  fireClick(rowIn("#tableRows", idOf(1)), w);
  rowIn("#tableRows", idOf(3)).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  assert(T.state.logMultiSelect.size === 3, "sanity: 3-row range selected, got " + T.state.logMultiSelect.size);
  const before = [...T.state.logMultiSelect].sort().join(",");
  const selBefore = T.state.selectedId;
  rclick(rowIn("#tableRows", idOf(2)));
  assert([...T.state.logMultiSelect].sort().join(",") === before, "right-click on a member leaves the multi-selection untouched");
  assert(T.state.selectedId === selBefore, "...and the selected id unchanged");
  assert(isOpen(), "menu open for the member");
  w.closeContextMenu();
  rclick(rowIn("#tableRows", idOf(9)));
  assert(T.state.logMultiSelect.size === 0, "right-click outside clears the multi-selection");
  assert(T.state.selectedId === idOf(9), "the outside row is now the selection");
  assert(d.querySelectorAll("#tableRows .log-row.row-multi-selected").length === 0, "no multi-selected row classes remain");
  assert(isOpen(), "menu open for the outside row");
});
