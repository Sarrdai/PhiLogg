// GROUP 320 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 320 — "Library ▾" split button + menu in #viewBar, and the "Manage
   filter library" dialog
   Origin: 2026-09-28 (filter-actions Phase C). #btnLibrary (after
   #libraryPresetBar, before the New group) opens #libraryMenu: search,
   "Applies to <target>" (single selected node, else the active node; locked
   or missing = warning + disabled rows), Pinned / More rows (click / Enter
   applies, star pins), footer "Save "<name>" to library…" + "Manage
   library…". #filterLibraryDialog lost its Apply mode: rename (double-click),
   star, export, immediate delete with an Undo toast.
   ============================================================ */
group(320);

await withApp(async (w, d, T) => {
  section("320a. #btnLibrary: placement, always present with a file (zero presets), empty menu, open/close paths");
  const bar = d.querySelector("#viewBar");
  const kids = [...bar.querySelectorAll("#libraryPresetBar, #btnLibrary, #viewbarNew")].map(c => c.id); // document order (groups are .vb-group wrappers)
  assert(kids.join() === "libraryPresetBar,btnLibrary,viewbarNew" && d.querySelector("#btnLibrary").previousElementSibling === d.querySelector("#libraryPresetBar"),
    "#btnLibrary sits directly after #libraryPresetBar and before the New group");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const btn = d.querySelector("#btnLibrary"), menu = d.querySelector("#libraryMenu");
  assert(isVisible(btn, w) && isVisible(d.querySelector("#libraryPresetSep"), w), "the button and its separator are visible with a file loaded and no presets");
  assert(btn.querySelector("svg use").getAttribute("href") === "#i-book" && btn.textContent.trim() === "" && btn.getAttribute("aria-label") === "Filter library" && btn.title === "Filter library" && btn.querySelectorAll(":scope > span").length === 2, "icon-only: book segment + chevron segment, no text, aria-label and title 'Filter library'");
  assert(menu.classList.contains("hidden") && btn.getAttribute("aria-expanded") === "false", "closed at rest");
  fireClick(btn.querySelectorAll(":scope > span")[1], w); // the chevron segment
  assert(!menu.classList.contains("hidden") && btn.getAttribute("aria-expanded") === "true", "the chevron segment opens the menu too");
  assert(d.querySelector("#libraryMenuList .lib-empty").textContent.includes("No presets yet"), "empty library: explanatory text");
  assert(!isVisible(d.querySelector("#libraryMenuSearchRow"), w), "empty library: no search box");
  assert(d.querySelector("#libraryMenuSave").classList.contains("dis") && d.querySelector("#libraryMenuManage"), "footer present (Save disabled for a file target, Manage library…)");
  fireClick(btn, w);
  assert(menu.classList.contains("hidden"), "clicking the button again closes it");
  fireClick(btn, w);
  fireClick(d.querySelector("#tree"), w);
  assert(menu.classList.contains("hidden"), "an outside click closes it");
  fireClick(btn, w);
  assert(d.activeElement === d.querySelector("#libraryMenuSearch") || !d.querySelector("#libraryMenuSearchRow").offsetParent, "the search input takes focus on open (when shown)");
  fireKeydown(d, w, "Escape");
  assert(menu.classList.contains("hidden"), "Esc closes it");
  fireClick(btn, w);
  fireClick(d.querySelector("#libraryMenuManage"), w);
  assert(menu.classList.contains("hidden") && !d.querySelector("#filterLibraryDialog").classList.contains("hidden"), "'Manage library…' closes the menu and opens the manage dialog");
  assert(d.querySelector("#filterLibraryDialog .link-dialog-title").textContent === "Manage filter library" && d.querySelector("#filterLibraryImportBtn"), "manage dialog title + Import… button");
  assert(w.eval("anyEscapeOverlayOpen()") === true, "the open dialog counts as an Escape overlay");
  w.closeFilterLibraryDialog();
  fireClick(btn, w);
  assert(w.eval("anyEscapeOverlayOpen()") === true, "the open menu counts as an Escape overlay");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("320b. menu: target resolution (selected / active / none / locked), groups, search, keyboard, apply, star");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const g = await w.addFile("b.log", makeLog(0, 30, { msgPrefix: "message" }), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  w.render();
  async function save(nodeId, name) {
    const p = w.saveFilterToLibrary(nodeId, name);
    await new Promise(r => setTimeout(r, 0));
    fireClick(d.querySelector("#exportScopeJustThis"), w);
    await p;
  }
  await save(t1.id, "Alpha one");
  await save(t2.id, "Beta two");
  await new Promise(r => setTimeout(r, 5));
  await save(t1.id, "Gamma pinned");
  const recs = await w.listFilterLibrary();
  await w.updateFilterLibraryEntry(recs.find(r => r.name === "Gamma pinned").key, { showInToolbar: true });
  const btn = d.querySelector("#btnLibrary"), menu = d.querySelector("#libraryMenu");
  const tgt = () => d.querySelector("#libraryMenuTarget");
  const names = () => [...d.querySelectorAll("#libraryMenuList .lib-it .n")].map(n => n.textContent);
  const open = () => { if (!menu.classList.contains("hidden")) fireClick(btn, w); fireClick(btn, w); };

  // Target: the single selected node (which is always the active one now).
  T.state.activeId = g.id; T.state.multiSelect = new Set([g.id]); w.render();
  open();
  assert(w.resolveLibraryTarget().id === g.id && tgt().textContent === "Applies to b.log", "the single selected node is the target, got " + tgt().textContent);
  // 2+ selected -> falls back to the active node.
  T.state.multiSelect = new Set([f.id, g.id]); T.state.activeId = f.id; w.render(); open();
  assert(w.resolveLibraryTarget().id === f.id && tgt().textContent === "Applies to a.log", "with 2+ selected the active node is the target");
  // Nothing selected -> the active node.
  T.state.multiSelect = new Set(); T.state.activeId = t2.id; w.render(); open();
  assert(w.resolveLibraryTarget().id === t2.id && tgt().textContent.startsWith("Applies to "), "with no selection the active node is the target");
  // Groups: Pinned first, then More (newest first).
  const heads = [...d.querySelectorAll("#libraryMenuList .lib-grp")].map(x => x.textContent);
  assert(heads.join(",") === "Pinned,More", "Pinned then More groups, got " + heads);
  assert(names().join("|") === "Gamma pinned|Beta two|Alpha one", "pinned first, the rest by savedAt desc, got " + names().join("|"));
  assert(d.querySelector("#libraryMenuList .lib-it .lib-star.on") && d.querySelectorAll("#libraryMenuList .lib-star").length === 3, "each row has a star, on for the pinned one");
  assert(!d.querySelector("#libraryMenuSave").classList.contains("dis") && d.querySelector("#libraryMenuSave").textContent.includes("Save " + w.nodeDisplayName(t2) + " to library…"), "footer offers Save \"<target>\" to library… for a filter target");

  // Search: case-insensitive by name.
  const search = d.querySelector("#libraryMenuSearch");
  search.value = "BETA"; search.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(names().join("|") === "Beta two" && d.querySelectorAll("#libraryMenuList .lib-grp").length === 0, "search filters by name, case-insensitive (no group heading without a pinned match)");
  search.value = "zzz"; search.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert(names().length === 0 && d.querySelector("#libraryMenuList .lib-empty").textContent.includes("zzz"), "no match: message");
  search.value = ""; search.dispatchEvent(new w.Event("input", { bubbles: true }));

  // Keyboard: Down moves the highlight, Enter applies to the target and closes.
  const kb = () => [...d.querySelectorAll("#libraryMenuList .lib-it")].findIndex(r => r.classList.contains("kb"));
  assert(kb() === 0, "first row is highlighted by default");
  search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
  assert(kb() === 1, "ArrowDown/ArrowUp move the highlight, got " + kb());
  T.state.multiSelect = new Set([g.id]); T.state.activeId = g.id; w.render(); open();
  const before = g.children.length;
  search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert(menu.classList.contains("hidden") && g.children.length === before + 1, "Enter applies the highlighted preset onto the target and closes the menu");
  const applied = T.state.nodes[g.children[g.children.length - 1]];
  assert(applied.filterType === "text" && applied.value === "message 2", "the highlighted (second) row was applied, got " + applied.value);

  // Star toggles the pin, keeps the menu open, moves the row and updates the pill bar.
  open();
  fireClick([...d.querySelectorAll("#libraryMenuList .lib-it")].find(r => r.querySelector(".n").textContent === "Alpha one").querySelector(".lib-star"), w);
  await waitFor(() => names()[0] === "Alpha one" || names().indexOf("Alpha one") < 2);
  assert(!menu.classList.contains("hidden"), "toggling a star leaves the menu open");
  await waitFor(() => d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 2);
  assert((await w.listFilterLibrary()).filter(r => r.showInToolbar).length === 2, "the pin persisted");
  assert([...d.querySelectorAll("#libraryMenuList .lib-grp")].map(x => x.textContent).join() === "Pinned,More", "row moved into Pinned");

  // Locked target: warning line, rows disabled, nothing applied.
  t1.locked = true; T.state.multiSelect = new Set([t1.id]); T.state.activeId = t1.id; w.render(); open();
  assert(tgt().classList.contains("warn") && tgt().textContent === "Select a file or filter to apply a preset", "locked target: warning line");
  assert([...d.querySelectorAll("#libraryMenuList .lib-it")].every(r => r.classList.contains("dis")), "...and disabled rows");
  const n0 = Object.keys(T.state.nodes).length;
  fireClick(d.querySelector("#libraryMenuList .lib-it"), w);
  assert(Object.keys(T.state.nodes).length === n0 && !menu.classList.contains("hidden"), "clicking a disabled row applies nothing and keeps the menu open");
  assert(d.querySelector("#libraryMenuSave").classList.contains("dis"), "Save is disabled for a locked filter");
  t1.locked = false;
  // No target at all.
  T.state.multiSelect = new Set(); T.state.activeId = null; w.render(); open();
  assert(tgt().classList.contains("warn") && w.resolveLibraryTarget().ok === false, "no target: warning line");

  // Footer Save opens the existing save dialog prefilled with the target's name.
  T.state.multiSelect = new Set([t2.id]); T.state.activeId = t2.id; w.render(); open();
  fireClick(d.querySelector("#libraryMenuSave"), w);
  assert(menu.classList.contains("hidden") && !d.querySelector("#filterLibrarySaveDialog").classList.contains("hidden")
    && d.querySelector("#filterLibraryNameInput").value === w.nodeDisplayName(t2), "footer Save opens #filterLibrarySaveDialog prefilled");
  fireClick(d.querySelector("#filterLibrarySaveCancel"), w);

  // Pill: title names preset + target, click applies to the same target.
  const pill = d.querySelector('#libraryPresetBar .row-action-btn[data-lib-key]');
  pill.dispatchEvent(new w.MouseEvent("mouseenter"));
  assert(pill.title.startsWith("Apply ") && pill.title.endsWith(" to " + w.nodeDisplayName(t2)), "pill tooltip: Apply <name> to <target>, got " + pill.title);
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("320c. manage dialog: no Apply, meta line, rename (dblclick / Enter / Esc / blur), star, delete + Undo");
  const f = await w.addFile("a.log", makeLog(0, 30), () => {});
  const t1 = w.createFilterNode(f.id, "text", "message 1");
  const t2 = w.createFilterNode(f.id, "text", "message 2");
  w.render();
  for (const [n, name] of [[t1, "First"], [t2, "Second"]]) {
    const p = w.saveFilterToLibrary(n.id, name);
    await new Promise(r => setTimeout(r, 0));
    fireClick(d.querySelector("#exportScopeJustThis"), w);
    await p;
    await new Promise(r => setTimeout(r, 5));
  }
  await w.openFilterLibraryDialog();
  await waitFor(() => d.querySelectorAll("#filterLibraryList .filter-library-row").length === 2);
  const rows = () => [...d.querySelectorAll("#filterLibraryList .filter-library-row")];
  assert(!d.querySelector("#filterLibraryList .btn-mini") && rows().every(r => !/Apply/.test(r.textContent)), "no Apply button in the manage dialog");
  assert(rows().every(r => r.querySelectorAll(".lib-star, .lib-export, .lib-del, .filter-library-row-icon").length === 4), "each row: icon, star, export, delete");
  assert(/ · 1 filter$/.test(rows()[0].querySelector(".filter-library-row-meta").textContent), "meta line: date · N filter(s), got " + rows()[0].querySelector(".filter-library-row-meta").textContent);
  assert(rows()[0].querySelector(".filter-library-row-name").textContent === "Second", "newest first");

  // Rename: double-click -> input; Enter saves.
  const startRename = i => rows()[i].querySelector(".filter-library-row-name").dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
  startRename(0);
  let input = d.querySelector("#filterLibraryList .filter-library-rename");
  assert(input && input.value === "Second" && d.activeElement === input, "double-click on the name swaps in a focused input");
  input.value = "Renamed";
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await waitFor(() => { const n = rows()[0] && rows()[0].querySelector(".filter-library-row-name"); return !d.querySelector("#filterLibraryList .filter-library-rename") && !!n && n.textContent === "Renamed"; });
  assert((await w.listFilterLibrary()).some(r => r.name === "Renamed") && w.eval("filterLibraryCache").some(r => r.name === "Renamed"), "Enter persisted the new name (and the cache)");
  // Esc cancels, and does not close the dialog.
  startRename(0);
  input = d.querySelector("#filterLibraryList .filter-library-rename");
  input.value = "Nope";
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await waitFor(() => !d.querySelector("#filterLibraryList .filter-library-rename"));
  assert(rows()[0].querySelector(".filter-library-row-name").textContent === "Renamed" && !(await w.listFilterLibrary()).some(r => r.name === "Nope"), "Esc cancels the rename");
  assert(!d.querySelector("#filterLibraryDialog").classList.contains("hidden"), "...and leaves the dialog open");
  // Blur saves; empty name is rejected.
  startRename(1);
  input = d.querySelector("#filterLibraryList .filter-library-rename");
  input.value = "Blurred";
  input.dispatchEvent(new w.Event("blur"));
  await waitFor(() => { const n = rows()[1] && rows()[1].querySelector(".filter-library-row-name"); return !!n && n.textContent === "Blurred"; });
  startRename(1);
  input = d.querySelector("#filterLibraryList .filter-library-rename");
  input.value = "   ";
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await waitFor(() => !d.querySelector("#filterLibraryList .filter-library-rename"));
  assert(rows()[1].querySelector(".filter-library-row-name").textContent === "Blurred", "a blank name keeps the old one");

  // Star = pin.
  fireClick(rows()[0].querySelector(".lib-star"), w);
  await waitFor(() => d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 1);
  await waitFor(() => rows()[0].querySelector(".lib-star").classList.contains("lib-star-on"));
  assert(rows()[0].querySelector(".lib-star use").getAttribute("href") === "#i-starf", "a pinned row shows the filled star");

  // Delete is immediate, the toast offers Undo and restores the same key.
  const gone = (await w.listFilterLibrary()).find(r => r.name === "Renamed");
  fireClick(rows()[0].querySelector(".lib-del"), w);
  await waitFor(() => rows().length === 1);
  assert(!(await w.listFilterLibrary()).some(r => r.key === gone.key), "deleted from IndexedDB with no confirm dialog");
  const toast = d.querySelector("#copyToast");
  assert(!toast.classList.contains("hidden") && toast.classList.contains("has-action") && toast.textContent.includes("Renamed"), "toast names the deleted preset");
  const undo = toast.querySelector(".toast-action");
  assert(undo && undo.textContent === "Undo", "toast carries an Undo action");
  assert(d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 0, "the deleted pinned preset's pill is gone");
  fireClick(undo, w);
  await waitFor(() => rows().length === 2);
  const back = (await w.listFilterLibrary()).find(r => r.key === gone.key);
  assert(back && back.name === "Renamed" && back.showInToolbar === true && JSON.stringify(back.roots) === JSON.stringify(gone.roots), "Undo restores the record under its original key, pin state included");
  await waitFor(() => d.querySelectorAll("#libraryPresetBar .row-action-btn[data-lib-key]").length === 1);
  await waitFor(() => toast.classList.contains("hidden"));
  assert(toast.classList.contains("hidden"), "the toast is dismissed after Undo");
  // A plain toast afterwards is a normal, click-through one again.
  w.showCopyToast("plain");
  assert(!toast.classList.contains("has-action") && !toast.querySelector(".toast-action"), "a plain toast has no action button");

  // Import… closes the dialog (the save dialog it leads to sits above it).
  w.importFromFilePicker = () => { w.__importCalled = true; };
  fireClick(d.querySelector("#filterLibraryImportBtn"), w);
  assert(d.querySelector("#filterLibraryDialog").classList.contains("hidden") && w.__importCalled === true, "Import… steps the dialog aside and calls the central import picker");
}, { indexedDB: new IDBFactory() });
