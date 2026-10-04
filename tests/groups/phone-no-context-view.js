// GROUP phone-no-context-view — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-no-context-view — the Context view can never be entered on phone
   Origin: 2026-10-04 (phone usability test). Phone shows only Filtered;
   phoneEnforceTab ran only at the end of render(), but a card dblclick / Enter
   reach revealInHighlightView -> showFhTab directly. Now revealInHighlightView
   returns on phone and applyFhView coerces every view to "filter" there.
   Data: log-sim "basic" scenario.
   ============================================================ */
group("phone-no-context-view");

await withApp(async (w, d, T) => {
  const sim = LOGSIM.generateToStrings({ format: "default", scenarios: ["basic"], entries: 300, seed: 41 })[0];
  const f = await w.addFile("a.log", sim.text, () => {});
  T.state.activeId = f.id;
  w.render();
  const card = id => d.querySelector('#tableRows .log-row[data-entry-id="' + id + '"]');
  const onFiltered = () => T.fhActiveTab === "filter" && T.fhLayout === "tabs" && T.state.entriesView === "filter" &&
    !d.getElementById("highlightWrap").classList.contains("fh-active");

  section("phone-no-context-view a. Desktop: dblclick still reveals Context");
  w.innerWidth = 1440; w.dispatchEvent(new w.Event("resize"));
  w.applyFhView("filter");
  const e0 = T.currentViewEntries[3];
  fireDblClick(card(e0.id), w);
  assert(T.fhActiveTab === "highlight", "desktop dblclick switches to the Context tab, got " + T.fhActiveTab);
  w.applyFhView("filter");

  section("phone-no-context-view b. Phone: card dblclick stays on Filtered");
  w.innerWidth = 390; w.dispatchEvent(new w.Event("resize"));
  assert(onFiltered(), "sanity: phone starts on Filtered");
  const e1 = T.currentViewEntries[5];
  fireClick(card(e1.id), w);
  fireDblClick(card(e1.id), w);
  assert(onFiltered(), "dblclick on a card leaves Filtered, no Context pane, got tab " + T.fhActiveTab + " view " + T.state.entriesView);

  section("phone-no-context-view c. Phone: Enter on a selected row stays on Filtered");
  w.selectEntry(e1.id);
  T.state.focusRegion = "entries";
  fireKeydown(d, w, "Enter");
  assert(onFiltered(), "Enter does not reveal Context on phone, got tab " + T.fhActiveTab);
  assert(T.state.selectedId === e1.id, "selection untouched");

  section("phone-no-context-view d. Phone: applyFhView coerces every view to Filtered");
  for (const v of ["highlight", "stacked", "table", "plot", "patterns"]) {
    w.applyFhView(v);
    assert(onFiltered(), "applyFhView(\"" + v + "\") ends on Filtered, got tab " + T.fhActiveTab + " layout " + T.fhLayout);
  }
});
