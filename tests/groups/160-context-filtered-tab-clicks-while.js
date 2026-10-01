// GROUP 160 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 160 — Context/Filtered tab clicks while stuck on Table/Plot
   ============================================================
   Origin: this session, person-reported regression in the filterType-merge
   work above. A new wildcard filter defaults to the Table tab
   (extractCapable auto-jump, renderMainView's own existing behavior) — from
   there, clicking "Context" or "Filtered" updated the tab pill correctly
   but left the extraction table on screen: applyFhView()'s final "else"
   branch (view === "highlight"/"filter") only ever called showFhTab(),
   which just toggles panel visibility WITHIN #fhSplit and never switches
   the content COMPONENT (#extractWrap vs #fhSplit) — nothing reached that
   branch FROM Table/Plot before Table/Plot existed as tabs, so it was never
   taught to handle it. Group 159's own assertions above already caught this
   for the double-click/mark-click path (revealInFilteredView) and got a
   local fix there; this is the SAME root cause reached by a plain tab
   click instead, now fixed once in applyFhView() itself so every caller
   benefits (revealInFilteredView's own duplicate fix was removed as
   redundant).
   ============================================================ */
group(160);
await withApp(async (w, d, T) => {
  section("160a. Clicking Context while on Table switches the content component, not just the tab pill");

  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i}"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "id=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.fhActiveTab === "table", "sanity: the Table tab is showing (explicit switch)");
  assert(d.querySelector("#extractWrap").style.display === "flex", "sanity: the extraction table is the visible content component");

  fireClick(d.querySelector('#fhTabs .view-tab[data-fh-tab="highlight"]'), w);

  assert(T.fhActiveTab === "highlight", "fhActiveTab switches to Context");
  assert(d.querySelector('#fhTabs .view-tab.active').dataset.fhTab === "highlight", "the Context tab pill is the one marked active");
  assert(d.querySelector("#extractWrap").style.display === "none", "the extraction table is no longer the visible content component");
  assert(d.querySelector("#fhSplit").style.display === "flex", "the Context/Filtered pane (#fhSplit) is now the visible content component");
});

await withApp(async (w, d, T) => {
  section("160b. Clicking Filtered while on Plot switches the content component, not just the tab pill");

  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i}"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "id=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot"); // real path a Plot tab click takes — sets fhActiveTab AND switchExtractView, unlike calling switchExtractView() directly
  assert(T.fhActiveTab === "plot", "sanity: switched to Plot");
  assert(d.querySelector("#extractWrap").style.display === "flex", "sanity: the plot is the visible content component");

  fireClick(d.querySelector('#fhTabs .view-tab[data-fh-tab="filter"]'), w);

  assert(T.fhActiveTab === "filter", "fhActiveTab switches to Filtered");
  assert(d.querySelector('#fhTabs .view-tab.active').dataset.fhTab === "filter", "the Filtered tab pill is the one marked active");
  assert(d.querySelector("#extractWrap").style.display === "none", "the plot is no longer the visible content component");
  assert(d.querySelector("#fhSplit").style.display === "flex", "the Context/Filtered pane (#fhSplit) is now the visible content component");
});
