// GROUP export-save-filter-hint — the disabled "Save filter…" in Export / Share
// states its reason as visible text (a title is invisible on touch).
// Origin: 2026-10-05 (usability round: reason only as tooltip).
group("export-save-filter-hint");

await withApp(async (w, d, T) => {
  section("export-save-filter-hint: visible only while the button is disabled, in every layout");
  const f = await w.addFile("app.log", LOGSIM.generateToStrings({ entries: 40, seed: 5 })[0].text, () => {});
  const flt = w.createFilterNode(f.id, "text", "INFO");
  w.render();
  const hint = () => d.querySelector("#exportSaveFilterHint");
  const shown = () => !hint().classList.contains("hidden") && w.getComputedStyle(hint()).display !== "none";
  const bFilt = () => d.querySelector("#exportSaveFilter");

  T.state.activeId = f.id;
  assert(w.openExportDialog() === true, "dialog opens with a file active");
  assert(bFilt().disabled && bFilt().title === "Select a filter first", "button disabled, title kept");
  assert(shown() && hint().textContent === "Save filter needs a filter selected in the tree.", "hint visible with a file node active, got: " + hint().textContent);
  assert(d.querySelector("#exportWorkRow").contains(hint()), "the hint sits in the Session & filters row");
  w.closeExportDialog && w.closeExportDialog();

  T.state.activeId = flt.id;
  w.openExportDialog();
  assert(!bFilt().disabled && !shown(), "hint hidden with a filter node active");
  w.closeExportDialog && w.closeExportDialog();

  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  assert(d.body.classList.contains("layout-phone"), "sanity: phone layout");
  T.state.activeId = f.id;
  w.openExportDialog();
  assert(bFilt().disabled && shown(), "phone layout: hint visible while disabled");
  T.state.activeId = flt.id;
  w.openExportDialog();
  assert(!shown(), "phone layout: hint hidden with a filter active");
});
