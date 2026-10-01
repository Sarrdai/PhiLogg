// GROUP 161 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 161 — "When switching to a filter" activation view
   Origin: this session (2026-09-03), person-reported: an extraction-capable
   node used to auto-jump to Table on EVERY activation, even the very first
   time it was ever created — which read as "the filter isn't working" until
   the tab bar was noticed. Replaced with applyActivationView(): a node
   that's never been active before always lands on Filtered regardless of
   wildcards; a previously-visited node goes by Settings -> Behavior "When
   switching to a filter" (filterActivationView) — "rememberLast" (default)
   restores whichever tab (nodeLastView) it was last left on, "alwaysFiltered"
   always lands on Filtered again. See applyActivationView()/applyFhView()'s
   own comments in philogg.html.
   ============================================================ */
group(161);
await withApp(async (w, d, T) => {
  section("161a. A brand-new extraction-capable node always lands on Filtered, regardless of the setting");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  // Default setting is "rememberLast" — still Filtered for a never-visited node.
  assert(T.filterActivationView === "rememberLast", "sanity: default setting is rememberLast");
  const node1 = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node1.id;
  w.render();
  assert(T.fhActiveTab === "filter", "first-ever activation lands on Filtered under rememberLast, not Table");

  // Even with "alwaysFiltered" selected, a never-visited node still lands on
  // Filtered — same outcome, so this isn't actually distinguishing, but
  // confirms alwaysFiltered doesn't ever accidentally pick Table for a
  // fresh node either.
  T.filterActivationView = "alwaysFiltered";
  const node2 = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node2.id;
  w.render();
  assert(T.fhActiveTab === "filter", "first-ever activation lands on Filtered under alwaysFiltered too");
});

await withApp(async (w, d, T) => {
  section("161b. rememberLast: switching away and back to a node restores its last tab (Table/Plot/Context), a plain-Filtered node stays a no-op");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const tableNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = tableNode.id;
  w.render();
  w.applyFhView("table"); // first visit, then explicitly switch to Table — recorded in nodeLastView

  const plotNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = plotNode.id;
  w.render();
  w.applyFhView("plot");

  const ctxNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = ctxNode.id;
  w.render(); // first visit -> Filtered
  w.applyFhView("highlight"); // then explicitly move to Context

  const plainNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = plainNode.id;
  w.render(); // first visit -> Filtered, never switched away — stays Filtered

  // Switch to an unrelated node first ("switching away"), then back to each.
  T.state.activeId = f.id;
  w.render();

  T.state.activeId = tableNode.id;
  w.render();
  assert(T.fhActiveTab === "table", "re-activating a node last left on Table restores Table");

  T.state.activeId = f.id;
  w.render();
  T.state.activeId = plotNode.id;
  w.render();
  assert(T.fhActiveTab === "plot", "re-activating a node last left on Plot restores Plot");

  T.state.activeId = f.id;
  w.render();
  T.state.activeId = ctxNode.id;
  w.render();
  assert(T.fhActiveTab === "highlight", "re-activating a node last left on Context restores Context");

  T.state.activeId = f.id;
  w.render();
  T.state.activeId = plainNode.id;
  w.render();
  assert(T.fhActiveTab === "filter", "re-activating a node left on plain Filtered stays on Filtered (no-op, not a regression)");
});

await withApp(async (w, d, T) => {
  section("161c. alwaysFiltered: a previously-visited node left on Table lands on Filtered on reactivation");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table"); // visited once, left on Table

  T.state.activeId = f.id;
  w.render();

  T.filterActivationView = "alwaysFiltered";
  T.state.activeId = node.id;
  w.render();
  assert(T.fhActiveTab === "filter", "alwaysFiltered overrides the remembered Table tab, lands on Filtered instead");
});

await withApp(async (w, d, T) => {
  section("161d. A node last left on Table, edited to drop its wildcards, falls back to Filtered instead of a now-invalid Table tab");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(w.nodeHasExtractableWildcards(node) === true, "sanity: the node has an extractable wildcard");

  // Edit the pattern in place to remove the wildcard entirely.
  node.value = "message";
  assert(w.nodeHasExtractableWildcards(node) === false, "sanity: the edited pattern has no wildcards left");

  T.state.activeId = f.id;
  w.render();
  T.state.activeId = node.id;
  w.render();
  assert(T.fhActiveTab === "filter", "reactivating a node remembered as Table, now wildcard-less, falls back to Filtered rather than a dead Table tab");
});

await withApp(async (w, d, T) => {
  section("161e. Settings row #settingsFilterActivationView round-trips through localStorage, defaults to rememberLast on a fresh load");

  const select = d.querySelector("#settingsFilterActivationView");
  assert(select, "sanity: the settings row exists");
  assert(select.value === "rememberLast", "defaults to 'Remember last view' with nothing stored");
  assert(w.localStorage.getItem("philogg-filter-activation-view") === null, "nothing persisted yet — setting untouched");

  select.value = "alwaysFiltered";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.filterActivationView === "alwaysFiltered", "picking 'Always Filtered' updates the in-memory setting");
  assert(w.localStorage.getItem("philogg-filter-activation-view") === "alwaysFiltered", "...and persists it to localStorage");

  select.value = "rememberLast";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.filterActivationView === "rememberLast" && w.localStorage.getItem("philogg-filter-activation-view") === "rememberLast",
    "switching back to 'Remember last view' updates and persists too");
});

await withApp(async (w, d, T) => {
  section("161f. Stacked-layout fallback: a node last recorded as 'stacked', reactivated after switching Context/Filtered display back to Separate, falls back to Filtered");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = node.id;
  w.render();

  // Enter Stacked layout while this node is active — applyFhView records
  // "stacked" into nodeLastView for it (fhActiveTab stays "highlight"/
  // "filter" under the hood, but the recorded view is "stacked" per the
  // fhLayout==="stacked" branch in applyFhView's own recording logic).
  w.applyFhView("stacked");
  assert(T.nodeLastView.get(node.id) === "stacked", "sanity: nodeLastView records 'stacked' for this node");

  // Switch away, then back to plain "Separate" layout globally (person
  // toggles Settings -> "Context/Filtered display" back to Separate).
  T.state.activeId = f.id;
  w.render();
  const layoutSelect = d.querySelector("#settingsFhLayout");
  layoutSelect.value = "tabs";
  layoutSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.fhLayout === "tabs", "sanity: back to Separate layout");

  T.state.activeId = node.id;
  w.render();
  assert(T.fhActiveTab === "filter", "a leftover 'stacked' recording falls back sanely to Filtered once Stacked layout is no longer active, instead of erroring or landing somewhere wrong");
});
