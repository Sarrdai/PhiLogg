// GROUP export-share-your-work — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP export-share-your-work — saving session / filter from Export / Share
   Origin: 2026-10-04 (usability round B, B4 step 2). Export / Share has a
   "Session & filters" bar ([Save session…] [Save filter…]); on the phone the
   drawer's #btnSave opens a small "Save your work" menu instead of the session
   dialog; desktop and tablet keep #btnSave -> session dialog.
   ============================================================ */
group("export-share-your-work");
await withApp(async (w, d, T) => {
  const f = await w.addFile("svc.log", makeLog(0, 12), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = f.id;
  w.render();
  const hidden = id => d.querySelector(id).classList.contains("hidden");
  const saves = [];
  w.saveFileWithFeedback = async (data, name, o) => { saves.push({ name, o }); return "downloaded"; };

  section("export-share-your-work a. bar in Export / Share");
  assert(w.openExportDialog() === true, "dialog opens");
  const row = d.querySelector("#exportWorkRow");
  assert(row && row.textContent.includes("Session & filters") && row.textContent.includes("For a colleague to open in PhiLogg"), "bar with title + hint");
  const rowsIn = [...d.querySelectorAll("#exportDialog .settings-row")];
  assert(rowsIn[0] === row, "the bar comes first, before Lines");
  const bSess = d.querySelector("#exportSaveSession"), bFilt = d.querySelector("#exportSaveFilter");
  assert(bSess.textContent === "Save session…" && bFilt.textContent === "Save filter…", "two buttons");
  assert(bFilt.disabled && bFilt.title === "Select a filter first", "Save filter… disabled with a reason while a file is active");
  fireClick(bSess, w);
  assert(hidden("#exportDialog") && !hidden("#sessionExportDialog"), "Save session… closes Export / Share and opens the session dialog");
  fireClick(d.querySelector("#sessionExportCancel"), w);

  T.state.activeId = flt.id;
  w.openExportDialog();
  assert(!bFilt.disabled && bFilt.title === "", "Save filter… enabled when a filter is active");
  fireClick(bFilt, w);
  assert(hidden("#exportDialog"), "Save filter… closes Export / Share");
  await waitFor(() => !hidden("#exportScopeDialog"));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await waitFor(() => saves.length === 1);
  assert(saves[0].o.description === "PhiLogg filter" && saves[0].name.endsWith(".json"), "it saves the active filter, got " + saves[0].name);

  section("export-share-your-work b. desktop #btnSave opens the session dialog directly");
  T.state.activeId = f.id;
  fireClick(d.querySelector("#btnSave"), w);
  assert(!hidden("#sessionExportDialog") && hidden("#saveMenu"), "no menu on desktop");
  fireClick(d.querySelector("#sessionExportCancel"), w);

  section("export-share-your-work c. phone #btnSave opens the Save your work menu");
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  assert(d.body.classList.contains("layout-phone"), "sanity: phone layout");
  fireClick(d.querySelector("#btnSave"), w);
  const menu = d.querySelector("#saveMenu");
  assert(!hidden("#saveMenu") && hidden("#sessionExportDialog"), "menu opens, not the dialog");
  assert(menu.textContent.includes("Save your work"), "menu has its title");
  const itemF = d.querySelector("#saveMenuFilter");
  assert(itemF.classList.contains("disabled") && !hidden("#saveMenuHint") && d.querySelector("#saveMenuHint").textContent === "Select a filter first",
    "no active filter: the entry is disabled and a visible reason is shown");
  fireClick(itemF, w);
  assert(!hidden("#saveMenu") && saves.length === 1, "clicking the disabled entry does nothing");
  fireClick(d.body, w);
  assert(hidden("#saveMenu"), "a click outside closes the menu");
  fireClick(d.querySelector("#btnSave"), w);
  fireClick(menu.querySelector('[data-action="session"]'), w);
  assert(hidden("#saveMenu") && !hidden("#sessionExportDialog"), "Save session… closes the menu and opens the session dialog");
  fireClick(d.querySelector("#sessionExportCancel"), w);

  T.state.activeId = flt.id;
  fireClick(d.querySelector("#btnSave"), w);
  assert(!itemF.classList.contains("disabled") && hidden("#saveMenuHint"), "active filter: entry enabled, no hint");
  fireClick(itemF, w);
  await waitFor(() => !hidden("#exportScopeDialog"));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await waitFor(() => saves.length === 2);
  assert(hidden("#saveMenu") && saves[1].o.description === "PhiLogg filter", "Save active filter… closes the menu and saves the filter");
});
