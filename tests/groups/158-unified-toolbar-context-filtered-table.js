// GROUP 158 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 158 — Unified toolbar: Context/Filtered/Table/Plot as one tab
   group (docs/archive/ui-implementation-plan.md, this session). #fhTabs now renders
   Context|Filtered|Table|Plot ("Getrennt", default) or Stacked|Table|Plot
   ("Gestapelt") depending on the new Settings -> Behavior "Context/Filtered
   display" option; Table/Plot stay in the DOM and visible but carry
   `disabled` whenever the active node has no extractable wildcards
   (nodeHasExtractableWildcards). #contextToolbar (match nav +
   expand/collapse-all) still shows only for the Context tab, not
   Filtered/Stacked. (158d, which covered old pre-rework "extract"-type
   session exports loading unchanged, was retired the same session the
   dedicated "extract" filterType itself was — see Group 159's header for
   the filterType-merge follow-up and why that compatibility requirement no
   longer applies.)
   ============================================================ */
group(158);
await withApp(async (w, d, T) => {
  section("158a. Table/Plot tabs: always present, DISABLED without wildcards, enabled once the node has them");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const plain = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = plain.id;
  w.render();

  // Person-requested (this session): Table/Plot stay in #fhTabs but render
  // DISABLED when the active node has nothing to tabulate/plot — so the filter
  // buttons to their right don't jump sideways as tabs appear/disappear
  // (reverses the earlier "omit entirely" decision — see renderViewTabs).
  let tableTab = () => [...d.querySelectorAll("#fhTabs .view-tab")].find(b => b.dataset.fhTab === "table");
  let plotTab = () => [...d.querySelectorAll("#fhTabs .view-tab")].find(b => b.dataset.fhTab === "plot");
  assert(tableTab() && plotTab(), "Table/Plot tabs are present in the DOM even for a plain text filter node");
  assert(tableTab().disabled && plotTab().disabled, "...but rendered disabled (no [*:...]/[*] wildcards to tabulate/plot)");
  assert(w.nodeHasExtractableWildcards(plain) === false, "sanity: nodeHasExtractableWildcards agrees");

  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  assert(w.nodeHasExtractableWildcards(extractNode) === true, "an extract node with a real [*:int] wildcard is capable");
  T.state.activeId = extractNode.id;
  w.render();
  // A never-before-activated node lands on Filtered by default now
  // (applyActivationView) — explicitly switch to Table for the rest of
  // this test, which is about the tab-visibility/table-content checks
  // below, not about the activation-view default itself (see Group 161).
  w.applyFhView("table");
  assert(T.fhActiveTab === "table", "sanity: the Table tab is showing (explicit switch)");
  assert(tableTab() && !tableTab().disabled, "Table tab is now enabled once the active node has wildcards");
  assert(plotTab() && !plotTab().disabled, "Plot tab is enabled too");
  assert(d.querySelector("#extractHead th"), "the extraction table itself actually rendered/populated");

  // A bare "extract" pattern with no wildcards at all compiles to nothing
  // (compileExtractPattern returns null with zero columns) — Table/Plot go
  // disabled again and the node falls back to the Filtered tab instead of
  // landing on a dead Table tab.
  const emptyExtract = w.createFilterNode(f.id, "text", "just plain text, no wildcards");
  T.state.activeId = emptyExtract.id;
  w.render();
  assert(T.fhActiveTab === "filter", "an extract node with no wildcards does NOT auto-jump to Table (nothing to show there)");
  assert(tableTab() && tableTab().disabled, "Table tab is present but disabled again for a wildcard-less extract pattern");
});

await withApp(async (w, d, T) => {
  section("158b. Settings 'Context/Filtered display' switches Context|Filtered|Table|Plot <-> Stacked|Table|Plot");

  const select = d.querySelector("#settingsFhLayout");
  assert(select, "sanity: the new settings row exists");
  assert(select.value === "tabs", "defaults to 'Separate' (tabs layout)");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  let tabs = [...d.querySelectorAll("#fhTabs .view-tab")].map(b => b.dataset.fhTab);
  assert(tabs.includes("highlight") && tabs.includes("filter") && !tabs.includes("stacked"),
    "'Separate': Context|Filtered|Table|Plot, no Stacked tab");

  select.value = "stacked";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.fhLayout === "stacked", "picking 'Stacked' in Settings sets fhLayout — the ONLY way it changes now (no more clicking a 'Stacked' tab to set it)");
  tabs = [...d.querySelectorAll("#fhTabs .view-tab")].map(b => b.dataset.fhTab);
  assert(tabs.includes("stacked") && !tabs.includes("highlight") && !tabs.includes("filter"),
    "'Gestapelt': Stacked|Table|Plot, Context/Filtered collapse into the one Stacked tab");
  assert(d.querySelector("#fhSplit").classList.contains("fh-layout-stacked"), "the stacked layout class is actually applied");

  select.value = "tabs";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.fhLayout === "tabs", "switching back to 'Separate' restores fhLayout");
  tabs = [...d.querySelectorAll("#fhTabs .view-tab")].map(b => b.dataset.fhTab);
  assert(tabs.includes("highlight") && tabs.includes("filter") && !tabs.includes("stacked"), "...and the tab group again");
});

await withApp(async (w, d, T) => {
  section("158c. Context slot shows the match navigator, Filtered/Stacked don't");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const node = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = node.id;
  w.render();

  assert(T.fhActiveTab === "filter", "sanity: starts on Filtered");
  assert(d.querySelector("#contextToolbar").classList.contains("hidden"), "no match navigator while on the Filtered tab");

  w.applyFhView("highlight");
  assert(!d.querySelector("#contextToolbar").classList.contains("hidden"), "the match navigator shows on the Context tab");

  // Stacked shows the Context pane alongside Filtered, so its own match
  // navigator (which lives inside #highlightWrap, not a separately-toggled
  // slot — see "Entscheidungen bei der Umsetzung") stays visible there too;
  // it only hides while the Filtered-ONLY tab is what's on screen, per
  // precisiation 1.
  w.applyFhView("stacked");
  assert(!d.querySelector("#contextToolbar").classList.contains("hidden"), "Stacked still shows the match navigator — its Context pane is genuinely on screen");
});

await withApp(async (w, d, T) => {
  section("158d. filterType merge follow-up: creating via the popup unlocks Table/Plot for the SAME node");

  // End-to-end (not the direct-API sanity Group 41 already covers): typing
  // a wildcard pattern and clicking the popup's one and only "Add filter"
  // button produces a "text" node whose Table/Plot tabs come up enabled
  // immediately, with no separate "extract" node/type anywhere.
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message [*:int]";
  fireInput(d.querySelector("#filterInput"), w);
  fireSubmit(d.querySelector("#filterForm"), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.filterType === "text", "the popup only ever creates 'text' nodes now");
  // A brand-new node lands on Filtered by default (applyActivationView) —
  // explicitly switch to Table, which is what this test is actually about
  // (Table/Plot enabled + real rows), not the activation-view default.
  w.applyFhView("table");
  const tabs = [...d.querySelectorAll("#fhTabs .view-tab")];
  assert(!!tabs.find(b => b.dataset.fhTab === "table") && !!tabs.find(b => b.dataset.fhTab === "plot"),
    "Table/Plot tabs exist for this same 'text' node");
  assert(d.querySelectorAll("#extractBody tr").length > 0, "and the extraction table actually rendered real rows");
});
