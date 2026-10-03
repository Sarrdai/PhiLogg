// GROUP context-menu-pointerdown-dismiss — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP context-menu-pointerdown-dismiss — context menus close on any outside press
   Origin: 2026-10-03 (tablet usability test). The row context menu only closed
   from the document click handler, which never sees clicks on controls that
   stopPropagation() (#btnFacets, facet values, ...). A capture-phase
   pointerdown on document now closes #contextMenu (+ "Add to selection"),
   #treeContextMenu and #extractContextMenu when the press is outside them.
   ============================================================ */
group("context-menu-pointerdown-dismiss");
await withApp(async (w, d, T) => {
  const f = await w.addFile("a.log", makeLog(0, 6), () => {});
  T.state.activeId = f.id;
  w.render();
  const menu = d.querySelector("#contextMenu");
  const pdown = (el) => el.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  const hidden = () => menu.classList.contains("hidden");
  const row = () => d.querySelector("#tableRows [data-entry-id]");

  section("context-menu-pointerdown-dismiss a. Opening survives its own press (right-click: pointerdown, then contextmenu)");
  pdown(row());
  fireContextMenu(row(), w);
  assert(!hidden(), "the row context menu is open after pointerdown + contextmenu");

  section("context-menu-pointerdown-dismiss b. A press inside the menu keeps it open");
  pdown(d.querySelector("#ctxMeta"));
  assert(!hidden(), "pointerdown on a menu item does not close it");
  d.querySelector("#addToSelectionMenu").classList.remove("hidden");
  pdown(d.querySelector("#addToSelectionMenu"));
  assert(!hidden() && !d.querySelector("#addToSelectionMenu").classList.contains("hidden"), "...nor does a press inside the 'Add to selection' submenu");
  d.querySelector("#addToSelectionMenu").classList.add("hidden");

  section("context-menu-pointerdown-dismiss c. A press on a stopPropagation'ed control closes it (#btnFacets)");
  const btn = d.querySelector("#btnFacets");
  let docClicks = 0;
  const countClick = () => { docClicks++; };
  d.addEventListener("click", countClick);
  btn.addEventListener("click", ev => ev.stopPropagation()); // like the real opener, registered after ours: still stops it
  pdown(btn);
  fireClick(btn, w);
  d.removeEventListener("click", countClick);
  assert(hidden(), "pointerdown on #btnFacets closes the menu even though its click never reaches document");

  section("context-menu-pointerdown-dismiss d. Tap into the facets panel / empty list area also closes it; submenu goes with it");
  fireContextMenu(row(), w);
  assert(!hidden(), "reopened");
  d.querySelector("#addToSelectionMenu").classList.remove("hidden");
  pdown(d.querySelector("#facetPanelBody") || d.body);
  assert(hidden() && d.querySelector("#addToSelectionMenu").classList.contains("hidden"), "outside press closes the menu and its submenu");


  section("context-menu-pointerdown-dismiss e. The tree context menu follows the same rule");
  const tm = d.querySelector("#treeContextMenu");
  tm.classList.remove("hidden"); // shown directly: opening it goes through openTreeContextMenu, not under test here
  assert(!tm.classList.contains("hidden"), "tree context menu open");
  pdown(tm);
  assert(!tm.classList.contains("hidden"), "press inside keeps it open");
  pdown(btn);
  assert(tm.classList.contains("hidden"), "press outside closes it");
});
