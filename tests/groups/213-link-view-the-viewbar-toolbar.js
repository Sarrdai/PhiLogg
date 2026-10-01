// GROUP 213 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 213 — Link view: the viewBar toolbar's "Message"/"Extract" row-action
   buttons now target the selected PAIR, not a stale single-entry selection
   (person-reported, this session: "I select a message in the Link view —
   both parts of the link are shown selected — but clicking the 'Extract'
   filter button only extracts values from one of the two messages in the
   tuple"). Root cause: selecting a pair block in the Link view (a plain
   click, see Group 168) only ever sets linkSelectedPairIndex, never
   state.selectedId — so singleMessageActionEntry() (the toolbar's
   "Message"/"Extract" buttons, handleRowActionClick's "filterForMessage"/
   "extractMessage" cases) fell through to currentRowActionEntry(), which
   resolves state.selectedId. Whatever single real entry a PRIOR row
   dblclick had left there (possibly not even part of the currently
   selected pair) got used instead of the whole tuple — Alt+Enter and the
   brace's own right-click "Filter for this message" already special-cased
   this (Group 168) but the toolbar buttons, added after, were never taught
   the same rule. Fixed by giving singleMessageActionEntry() the identical
   Link-view pair check.
   ============================================================ */
group(213);
await withApp(async (w, d, T) => {
  section("213. Toolbar Extract/Message buttons wildcard the WHOLE selected Link pair");

  const lines = [
    `2024-01-15 10:00:00,000\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"Value A: 10"`,
    `2024-01-15 10:00:01,000\tINFO\t"main"\tFoo.cs\tline 1\t[DoWork]\t"Value B: 20"`,
    `2024-01-15 10:00:02,000\tINFO\t"main"\tFoo.cs\tline 2\t[DoWork]\t"Value A: 11"`,
    `2024-01-15 10:00:03,000\tINFO\t"main"\tFoo.cs\tline 3\t[DoWork]\t"Value B: 21"`,
  ];
  const f = await w.addFile("linked.log", lines.join("\n") + "\n", () => {});
  const refNode = w.createFilterNode(f.id, "text", "Value A");
  const targetNode = w.createFilterNode(f.id, "text", "Value B");
  const linkNode = w.createLinkNode(refNode.id, targetNode.id, "after", 1);
  T.state.activeId = linkNode.id;
  T.state.entriesView = "filter";
  T.state.focusRegion = "entries";
  w.render();

  // Simulate a stale single-entry selection left over from an earlier row
  // dblclick elsewhere (revealInHighlightView sets state.selectedId).
  T.state.selectedId = f.entries[0].id; // "Value A: 10" — the REF side only
  w.updateRowActionButtons();

  // Selecting a pair block in the Link view (Group 168): sets
  // linkSelectedPairIndex, deliberately does NOT touch state.selectedId.
  const firstRow = d.querySelector(".pair-block").querySelector(".pair-row");
  fireClick(firstRow, w);
  assert(T.linkSelectedPairIndex === 0, "sanity: the pair block is selected");
  assert(T.state.selectedId === f.entries[0].id, "sanity: the stale single-entry selection is still sitting in state.selectedId");

  const extractBtn = d.querySelector('[data-row-action="extractMessage"]');
  assert(!extractBtn.disabled, "the Extract button is enabled once a Link-view pair is selected");
  fireClick(extractBtn, w);

  const created = T.state.nodes[linkNode.children[0]];
  assert(created && created.filterType === "text", "Extract created a new text/wildcard filter node under the link");
  assert(created.value.includes("Value A") && created.value.includes("Value B"),
    "the extracted pattern covers BOTH sides of the tuple, not just the stale single entry, got \"" + created.value + "\"");
  assert(created.value.includes("[*:int]"), "numeric content on both sides was wildcarded, got \"" + created.value + "\"");
  // createFilterNode activates the new node (activateNewNode) — deleting it
  // hands state.activeId back to the link node (deleteNode's own fallback),
  // and the tree's own delete affordances always re-render right after.
  w.deleteFilterNodeWithUndo(created.id);
  w.render();

  // Same bug, same fix, for "Filter for this message" (filterForMessage).
  // The pair block selection itself (linkSelectedPairIndex) is untouched by
  // any of the above — only reset when the Link view's OWN active node
  // changes (renderLinkView), which it didn't (we're back on linkNode).
  assert(T.linkSelectedPairIndex === 0, "sanity: pair still selected after deleting the sibling extraction node");
  const filterForMsgBtn = d.querySelector('[data-row-action="filterForMessage"]');
  fireClick(filterForMsgBtn, w);
  assert(!d.querySelector("#filterPopup").classList.contains("hidden"), "\"Filter for this message\" opens the popup");
  const popupPattern = d.querySelector("#filterInput").value;
  assert(popupPattern.includes("Value A") && popupPattern.includes("Value B"),
    "\"Filter for this message\" also prefills from the WHOLE pair, got \"" + popupPattern + "\"");
  w.closeFilterPopup();

  // Regression guard for the person's follow-up report (Plot view getting
  // "stuck", not independently reproducible — but a real full-pair
  // extraction viewed on Table/Plot must still let every other navigation
  // path switch away cleanly).
  const fullPair = w.createFilterNode(linkNode.id, "text", "Value A: [*:int] ⟶ Value B: [*:int]", false, [], false, ["message"], false, false);
  T.state.activeId = fullPair.id;
  w.render();
  fireClick(d.querySelector('.view-tab[data-fh-tab="plot"]'), w);
  assert(T.fhActiveTab === "plot", "sanity: Plot tab is active for the extraction");
  const refRow = d.querySelector('.tree-row[data-node-id="' + refNode.id + '"]');
  fireClick(refRow, w);
  assert(T.state.activeId === refNode.id, "clicking a different tree node while on Plot switches the active node");
  assert(T.fhActiveTab === "filter", "…and falls back to the Filtered tab since the new node has nothing to plot");
  assert(d.querySelector("#fhSplit").style.display === "flex" && d.querySelector("#extractWrap").style.display === "none",
    "the log view (not the Plot/Table pane) is actually the one visible afterward");
});
