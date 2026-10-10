// GROUP design-polish-p6 — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP design-polish-p6 — popovers and connected segmented controls (D1, C4)
   Origin: 2026-10-10 design polish round, package P6.
   ============================================================ */
group("design-polish-p6");

await withApp(async (w, d, T) => {
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  const esc = sel => sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = sel => {
    const m = css.match(new RegExp("^\\s*" + esc(sel) + "\\s*\\{([^}]*)\\}", "m"));
    return m ? m[1] : "";
  };

  section("design-polish-p6 a. popover look");
  const sels = "#contextMenu, #treeContextMenu, #openMenu, #saveMenu, #extractContextMenu, #plotRoleMenu, #facetValueMenu, #textCopyMenu,\n  #addToSelectionMenu, #treeCtxInfoMenu, #helpMenu, #libraryMenu, #filterPopup, #findBar";
  const pop = body(sels);
  assert(/background:var\(--bg-popover\)/.test(pop), "popover fill: " + pop);
  assert(/border:1px solid var\(--hairline\)/.test(pop), "hairline border");
  assert(/border-radius:9px/.test(pop), "radius 9px");
  assert(/box-shadow:0 1px 2px rgba\(0,0,0,\.08\), 0 8px 24px rgba\(0,0,0,\.18\)/.test(pop), "two-layer shadow");
  const item = body(".ctx-item");
  assert(/min-height:30px/.test(item), "menu items 30px high");
  assert(/background:var\(--btn-hover\)/.test(body(".ctx-item:hover")), "hover is --btn-hover");
  assert(/background:var\(--hairline\)/.test(body(".ctx-sep")), "separator is a hairline");

  section("design-polish-p6 b. destructive items");
  assert(/color:var\(--level-error\)/.test(body(".ctx-item.ctx-danger, .ctx-item.ctx-danger svg")), ".ctx-danger uses --level-error");
  assert(/color-mix\(in srgb, var\(--level-error\) 12%, transparent\)/.test(body(".ctx-item.ctx-danger:hover")), "error-soft hover");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = flt.id;
  w.render();
  const row = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(row, w);
  const del = d.querySelector('#treeContextMenu .ctx-item[data-action="delete"]');
  assert(!!del && del.classList.contains("ctx-danger"), "tree menu 'Remove filter' carries ctx-danger");
  assert(d.querySelectorAll("#treeContextMenu .ctx-danger").length === 1, "only the destructive item is marked");
  w.closeTreeContextMenu();

  section("design-polish-p6 c. segmented controls");
  const connected = body(".export-seg > .assert-mode-btn, .settings-seg > .assert-mode-btn, #settingsThemeModeRow > .assert-mode-btn");
  assert(/border-radius:0/.test(connected) && /margin-left:-1px/.test(connected), "buttons share borders: " + connected);
  assert(/gap:0/.test(body("#exportDialog .export-seg")), "export rows have no gap");
  assert(d.querySelectorAll("#exportDialog .export-seg").length === 2, "Lines and Format rows are .export-seg");
  assert(d.querySelectorAll("#exportDialog .export-seg > .assert-mode-btn").length === 8, "8 segment buttons kept");
  assert(!!d.querySelector("#settingsThemeModeRow > .assert-mode-btn[data-theme-mode]"), "theme row buttons kept");

  section("design-polish-p6 d. Save file chevron");
  const save = d.getElementById("exportSaveBtn");
  assert(!save.textContent.includes("▾"), "no text triangle");
  assert(!!save.querySelector('svg use[href="#i-chev"]'), "chevron icon");
});
