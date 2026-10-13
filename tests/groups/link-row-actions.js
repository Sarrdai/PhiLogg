// GROUP link-row-actions — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP link-row-actions — the toolbar's "Message"/"Extract" buttons follow the Link view selection
   Origin: 2026-10-13 (backlog #129). Selecting a pair (block click in List, row click in Tree, ↑/↓)
   never refreshed the row-action buttons, so "Filter for this message" and "Extract" stayed grayed
   out although singleMessageActionEntry() already resolves the selected pair. Every Link selection
   change now goes through linkSelectionChanged(). Simulator data only: `flows`, seed 7, 800 entries.
   ============================================================ */
group("link-row-actions");

if (groupSelected()) {
  const btn = (d, a) => d.querySelector('[data-row-action="' + a + '"]');
  const enabled = d => !btn(d, "filterForMessage").disabled && !btn(d, "extractMessage").disabled;
  const disabled = d => btn(d, "filterForMessage").disabled && btn(d, "extractMessage").disabled;
  const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

  await withApp(async (w, d, T) => {
    const [sim] = LOGSIM.generateToStrings({ scenarios: ["flows"], entries: 800, seed: 7 });
    const f = await w.addFile(sim.name, sim.text, () => {});
    const start = w.createFilterNode(f.id, "text", "Flow [*] started");
    const end = w.createFilterNode(f.id, "text", "Flow [*] ended");

    section("link-row-actions a. List: a block click enables Message/Extract, a second click disables them");
    const near = w.createLinkNode(start.id, end.id, "after", 1);
    T.state.activeId = near.id; T.state.entriesView = "filter"; T.state.focusRegion = "entries";
    w.render();
    assert(disabled(d), "no pair selected: both disabled");
    const block = d.querySelector("#linkBody .pair-block");
    assert(block, "pair blocks rendered");
    click(w, block);
    assert(T.linkSelectedPairIndex === 0 && enabled(d), "block selected: both enabled");
    click(w, d.querySelector('#linkBody .pair-block[data-pair-index="0"]'));
    assert(T.linkSelectedPairIndex === null && disabled(d), "deselected: both disabled again");

    section("link-row-actions b. Extract on the selected pair creates a filter of the whole pair");
    click(w, d.querySelector('#linkBody .pair-block[data-pair-index="0"]'));
    const before = Object.keys(T.state.nodes).length;
    click(w, btn(d, "extractMessage"));
    assert(Object.keys(T.state.nodes).length === before + 1, "Extract created one node");

    section("link-row-actions c. Tree: a row click and ↓ enable the buttons; a relayout clears them");
    const nested = w.createLinkNode(start.id, end.id, "after", 1, { pairing: "nested", key: { wildcards: [[0, 0]] } });
    T.state.activeId = nested.id; w.render();
    assert(T.linkTreeMode && disabled(d), "tree, nothing selected: disabled");
    click(w, d.querySelector("#linkBody .link-trow .tr-endt") || d.querySelector("#linkBody .link-trow"));
    assert(T.linkSelectedPairIndex != null && enabled(d), "tree row selected: enabled");
    click(w, d.querySelector('#linkViewSeg [data-link-view="list"]'));
    assert(T.linkSelectedPairIndex === null && disabled(d), "List toggle drops the selection: disabled");
    w.moveLinkSelection(1);
    assert(T.linkSelectedPairIndex === 0 && enabled(d), "↓ selects the first pair: enabled");
  });
}
