// GROUP 133 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 133 — Tree context menu "Info" submenu (person-reported: the
   node's full name/pattern used to sit inline at the top of the menu,
   unbounded — a long extraction pattern or a link's own concatenated name
   could make the whole menu, and the page along with it, far taller/wider
   than the viewport). Now a hover/click submenu trigger instead
   (openTreeCtxInfoMenu), same shape as the log-row context menu's own
   "Add to selection" submenu.
   ============================================================ */
group(133);
await withApp(async (w, d, T) => {
  section("133. Tree context menu \"Info\" submenu");

  const f = await w.addFile("133.log", makeLog(0, 10), () => {});
  const longValue = "a".repeat(300); // long enough that the old inline .ctx-meta would have blown up the menu
  const filter = w.createFilterNode(f.id, "text", longValue);
  T.state.activeId = filter.id;
  w.render();
  const row = d.querySelector('.tree-row[data-node-id="' + filter.id + '"]');
  fireContextMenu(row, w);

  const infoTrigger = d.querySelector('#treeContextMenu [data-action="info"]');
  assert(infoTrigger, "the context menu shows an \"Info\" trigger item");
  assert(!d.querySelector("#treeContextMenu .ctx-meta"), "the long name is NOT shown inline in the menu itself any more");
  assert(isVisible(d.getElementById("treeCtxInfoMenu"), w) === false, "the info submenu is closed until hovered/clicked");

  // Hover opens it.
  infoTrigger.dispatchEvent(new w.MouseEvent("mouseover", { bubbles: true, cancelable: true }));
  assert(isVisible(d.getElementById("treeCtxInfoMenu"), w) === true, "hovering the Info item opens the submenu");
  assert(d.getElementById("treeCtxInfoMenu").textContent.includes(longValue), "the submenu shows the node's full display name");

  // Clicking the trigger does the same (keeps both menus open), not closing everything.
  fireClick(infoTrigger, w);
  assert(isVisible(d.getElementById("treeContextMenu"), w) === true, "clicking \"Info\" itself does NOT close the whole context menu");
  assert(isVisible(d.getElementById("treeCtxInfoMenu"), w) === true, "...the info submenu stays open too");

  // A real action still closes everything as before.
  const renameItem = d.querySelector('#treeContextMenu [data-action="rename"]');
  fireClick(renameItem, w);
  assert(isVisible(d.getElementById("treeContextMenu"), w) === false, "clicking a real action still closes the whole context menu");
});
