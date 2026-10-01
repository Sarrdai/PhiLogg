// GROUP 148 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 148 — A newly created node is selected EXCLUSIVELY (person-reported:
   "wenn ich einen neuen Filter anlege, ist dieser selektiert, der zuvor
   selektierte Filter/File aber auch noch"). Same root cause GROUP 112c
   fixed for a freshly LOADED file, on the other half of the problem: a
   plain (non-Ctrl) tree-row click puts the clicked id into
   state.multiSelect — it is not a Ctrl-only gesture — and node CREATION
   set state.activeId to the new node without dropping it, so the row you
   built the filter from kept its ".multi-selected" accent tint (the same
   --accent-soft background ".active" uses) right next to the new node's
   genuine ".active" row. Fixed by routing every creator through one
   activateNewNode(node) helper.
     a) creating a filter through the real UI route (the filter popup)
        leaves exactly one highlighted tree row: the new node's.
     b) the same holds for a filter built on top of another FILTER row,
        not just on a file row.
     c) the other creators go through the same helper — context node,
        selection filter, and a paste — so none of them can regress
        separately.
     d) a genuine Ctrl+click multi-selection is still untouched by
        everything else; only creating a node collapses it.
   ============================================================ */
group(148);
await withApp(async (w, d, T) => {
  section("148. A newly created filter is the only selected node");

  const f = await w.addFile("app.log", makeLog(0, 20), () => {});
  w.render();

  const treeRows = () => [...d.querySelectorAll(".tree-row")];
  const highlighted = () => treeRows().filter(r => r.classList.contains("active") || r.classList.contains("multi-selected"));

  // --- (a) the real UI route: click a file row, then add a filter ---------
  const fileRow = d.querySelector('.tree-row[data-node-id="' + f.id + '"]');
  fireClick(fileRow, w);
  assert(T.state.multiSelect.has(f.id) && T.state.multiSelect.size === 1,
    "sanity: a plain click on the file's tree row puts it in multiSelect (that is what later leaks)");

  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message 1";
  fireSubmit(d.querySelector("#filterForm"), w);
  const filterA = T.state.nodes[T.state.activeId];
  assert(filterA && filterA.type === "filter", "sanity: the popup created a filter and made it active");
  assert(T.state.multiSelect.size === 0,
    "creating a filter drops the stale multiSelect entry pointing at the row it was built from");
  assert(highlighted().length === 1 && highlighted()[0].dataset.nodeId === filterA.id,
    "exactly one tree row is highlighted, and it is the new filter's, got " +
    JSON.stringify(highlighted().map(r => r.dataset.nodeId)));

  // --- (b) same when the previous selection is a FILTER row --------------
  const filterRow = d.querySelector('.tree-row[data-node-id="' + filterA.id + '"]');
  fireClick(filterRow, w);
  assert(T.state.multiSelect.has(filterA.id), "sanity: clicking the filter's own row selects it the same way");
  const filterB = w.createFilterNode(filterA.id, "text", "message 1");
  w.render();
  assert(T.state.multiSelect.size === 0 && highlighted().length === 1 &&
    highlighted()[0].dataset.nodeId === filterB.id,
    "a filter created under another filter leaves only itself highlighted");

  // --- (c) every other creator goes through the same helper ---------------
  const creators = [
    ["context node", () => w.createContextNode(filterB.id, 1000, 1000)],
    ["selection filter", () => w.createSelectionFilterNode(f.id, [f.entries[0].id, f.entries[1].id])],
  ];
  creators.forEach(([label, make]) => {
    T.state.multiSelect = new Set([f.id]); // as a plain click would have left it
    const node = make();
    assert(node && T.state.activeId === node.id, "sanity: the " + label + " was created and activated");
    assert(T.state.multiSelect.size === 0, "a new " + label + " is selected exclusively too");
  });

  // Paste (cloneSubtree) creates a node the same way — same requirement.
  T.state.clipboard = { id: filterB.id, mode: "copy" };
  T.state.activeId = f.id;
  T.state.multiSelect = new Set([f.id]); // as a plain click on the paste target would have left it
  w.pasteClipboard();
  assert(T.state.activeId !== f.id && T.state.nodes[T.state.activeId].parentId === f.id,
    "sanity: the paste created a clone under the file and activated it");
  assert(T.state.multiSelect.size === 0,
    "a pasted filter is the only selected node too, got multiSelect size " + T.state.multiSelect.size);

  // --- (d) a real multi-selection is still a multi-selection -------------
  w.render();
  const rowF = d.querySelector('.tree-row[data-node-id="' + f.id + '"]');
  const rowA = d.querySelector('.tree-row[data-node-id="' + filterA.id + '"]');
  fireClick(rowF, w);
  rowA.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
  assert(T.state.multiSelect.size === 2,
    "sanity: Ctrl+click still builds a two-node multi-selection, got " + T.state.multiSelect.size);
  w.render();
  assert(highlighted().length === 2, "...and both rows are highlighted, as they should be");
});
