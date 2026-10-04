// GROUP tablet-tree-select — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP tablet-tree-select — Tree select mode (tablet UX round, step 4)
   Origin: 2026-10-03 (tablet usability test). Combining filters needed
   Ctrl-click, impossible on touch. The tree context menu's "Select multiple"
   enters a select mode: a checkbox per row, a tap toggles the node (never
   activates it), the sidebar bar shows "N selected" + AND/OR/Link… (enabled
   at 2+) / Merge N files + Done. Ends on Done, Esc, a consumed bulk action
   and (compact/phone) closing the drawer. Ctrl-click is unchanged. The Link
   dialog carries one example sentence.
   ============================================================ */
group("tablet-tree-select");

const ttsOpenMenu = (w, id) => w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, id);
const ttsRow = (d, name) => {
  const rows = [...d.querySelectorAll(".tree-row")];
  return rows.find(r => [name, "\u201c" + name + "\u201d"].includes(r.querySelector(".tree-label").textContent.trim())) || rows.find(r => r.querySelector(".tree-label").textContent.includes(name));
};
const ttsBar = d => d.querySelector("#sidebarToolbar");
const ttsBtn = (d, a) => ttsBar(d).querySelector('[data-multi-action="' + a + '"]');
const ttsEnter = (w, d, id) => {
  ttsOpenMenu(w, id);
  d.querySelector('#treeContextMenu [data-action="selectMultiple"]').click();
};

await withApp(async (w, d, T) => {
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  const t3 = w.createFilterNode(f.id, "text", "message 3");
  T.state.activeId = t1.id; w.render();

  section("tablet-tree-select a. Context menu offers Select multiple; entering seeds the node, shows checkboxes + bar");
  assert(d.querySelectorAll(".tree-check").length === 0, "no checkboxes outside select mode");
  ttsOpenMenu(w, t2.id);
  assert(d.querySelector('#treeContextMenu [data-action="selectMultiple"]'), "single-node menu has Select multiple");
  d.querySelector('#treeContextMenu [data-action="selectMultiple"]').click();
  assert(d.querySelectorAll(".tree-row").length === d.querySelectorAll(".tree-check").length && d.querySelectorAll(".tree-check").length >= 4, "every row has a checkbox");
  assert(ttsRow(d, "message 2").classList.contains("multi-selected"), "long-pressed node starts checked");
  assert(!ttsRow(d, "message 1").classList.contains("multi-selected"), "the active node is not implicitly checked");
  assert(ttsBar(d).textContent.includes("1 selected"), "bar says 1 selected, got " + ttsBar(d).textContent);
  assert(ttsBtn(d, "and").disabled && ttsBtn(d, "or").disabled && ttsBtn(d, "link").disabled, "AND/OR/Link… disabled below 2");
  assert(ttsBtn(d, "done"), "Done button present");
  assert(d.querySelector("#treeContextMenu").classList.contains("hidden"), "menu closed");

  section("tablet-tree-select b. A tap toggles the node without activating it; bar enables at 2+");
  ttsRow(d, "message 3").click();
  assert(T.state.activeId === t1.id, "tap did not change the active node");
  assert(ttsRow(d, "message 3").classList.contains("multi-selected"), "tapped row is checked");
  assert(ttsBar(d).textContent.includes("2 selected"), "2 selected");
  assert(!ttsBtn(d, "and").disabled && !ttsBtn(d, "or").disabled && !ttsBtn(d, "link").disabled, "AND/OR/Link… enabled at 2");
  ttsRow(d, "message 3").click();
  assert(!ttsRow(d, "message 3").classList.contains("multi-selected") && ttsBtn(d, "and").disabled, "second tap unchecks; back to disabled");
  ttsRow(d, "message 3").click();

  section("tablet-tree-select c. Done leaves the mode and clears the selection");
  ttsBtn(d, "done").click();
  assert(d.querySelectorAll(".tree-check").length === 0, "checkboxes gone");
  assert(!ttsBar(d).querySelector('[data-multi-action="done"]') && ttsBar(d).querySelector("[data-row-action]"), "normal toolbar back");
  assert(T.state.multiSelect.size === 0 && T.state.activeId === t1.id, "selection cleared, active unchanged");
  ttsRow(d, "message 2").click();
  assert(T.state.activeId === t2.id, "a tap activates again outside select mode");

  section("tablet-tree-select d. Esc leaves the mode");
  ttsEnter(w, d, t1.id);
  assert(d.querySelectorAll(".tree-check").length > 0, "sanity: in select mode");
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(d.querySelectorAll(".tree-check").length === 0, "Esc ended select mode");

  section("tablet-tree-select e. AND consumes the selection and ends the mode");
  const before = Object.keys(T.state.nodes).length;
  ttsEnter(w, d, t1.id);
  ttsRow(d, "message 2").click();
  ttsBtn(d, "and").click();
  assert(Object.keys(T.state.nodes).length === before + 1, "an AND node was created");
  assert(d.querySelectorAll(".tree-check").length === 0, "select mode ended after the action");
  assert(T.state.multiSelect.size <= 1, "selection consumed");

  section("tablet-tree-select f. Link… opens the dialog with the picked filters as Start/End, mode ended");
  ttsEnter(w, d, t1.id);
  ttsRow(d, "message 3").click();
  ttsBtn(d, "link").click();
  const dlg = d.querySelector("#linkDialog");
  assert(!dlg.classList.contains("hidden"), "link dialog open");
  assert(dlg.querySelector("#linkDialogTitle").textContent === "Link events" && dlg.querySelectorAll("#linkSides .link-side-chip").length === 2, "link dialog: title and the two picked filters as Start/End chips");
  assert(d.querySelectorAll(".tree-check").length === 0, "select mode ended");
  w.closeLinkDialog();

  section("tablet-tree-select g. Drawer close ends the mode on compact");
  w.innerWidth = 800; w.dispatchEvent(new w.Event("resize"));
  assert(d.body.classList.contains("layout-compact"), "sanity: compact");
  w.setDrawerOpen(true);
  ttsEnter(w, d, t1.id);
  assert(d.querySelectorAll(".tree-check").length > 0, "in select mode");
  w.setDrawerOpen(false);
  assert(d.querySelectorAll(".tree-check").length === 0, "closing the drawer ended select mode");
  w.innerWidth = 1400; w.dispatchEvent(new w.Event("resize"));

  section("tablet-tree-select h. Ctrl-click multi-select unchanged (no checkboxes, active included)");
  ttsRow(d, "message 1").click();
  ttsRow(d, "message 2").dispatchEvent(new w.MouseEvent("click", { bubbles: true, ctrlKey: true }));
  assert(d.querySelectorAll(".tree-check").length === 0, "no checkboxes with Ctrl-click");
  assert(ttsBar(d).textContent.includes("2 filters"), "multi bar shows 2 filters");
});

await withApp(async (w, d, T) => {
  section("tablet-tree-select i. Files: Merge N files after selecting two files");
  const a = await w.addFile("a.log", makeLog(0, 8), () => {});
  const b = await w.addFile("b.log", makeLog(30, 8), () => {});
  ttsEnter(w, d, a.id);
  ttsRow(d, "b.log").click();
  assert(ttsBar(d).textContent.includes("2 selected") && ttsBtn(d, "merge") && ttsBtn(d, "merge").textContent.includes("Merge 2 files"), "Merge 2 files offered, got " + ttsBar(d).textContent);
  assert(!ttsBtn(d, "and"), "no AND for files");
  ttsBtn(d, "done").click();
});

await withApp(async (w, d, T) => {
  section("tablet-tree-select j. Popups opened from the drawer paint above it on compact and phone, desktop unchanged");
  const z = id => parseInt(w.getComputedStyle(d.querySelector(id)).zIndex, 10);
  const ids = ["#treeContextMenu", "#libraryMenu", "#filterPopup", "#treeCtxInfoMenu", "#addToSelectionMenu", "#colorPickerPopup"];
  for (const width of [1400, 800, 400]) {
    w.innerWidth = width; w.dispatchEvent(new w.Event("resize"));
    const drawerZ = z("#sidebar");
    if (width === 1400) {
      assert(z("#treeContextMenu") === 50, "desktop: tree context menu keeps z-index 50, got " + z("#treeContextMenu"));
      continue;
    }
    assert(drawerZ === 60, "drawer z-index 60 at " + width + ", got " + drawerZ);
    for (const id of ids) assert(z(id) > drawerZ, id + " above the drawer at " + width + " (z " + z(id) + ")");
    assert(z("#treeCtxInfoMenu") > z("#treeContextMenu") && z("#colorPickerPopup") > z("#filterPopup"), "submenus/pickers above their parents at " + width);
  }
});
