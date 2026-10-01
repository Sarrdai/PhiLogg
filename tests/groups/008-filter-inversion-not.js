// GROUP 8 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 8 — Filter inversion (NOT)
   Origin: 62262740. NOTE: this session shipped WITHOUT a jsdom test (went
   straight from implementation to documentation) — this is the first actual
   test coverage this feature has had. Covers the generic set-difference
   semantics and both exclusions (link/extract), plus the THIRD exclusion
   (context) that was added later in 1dd227c6, and the FOURTH exclusion
   (countContext) added in the Count context session (see Group 64) — none
   were tested until now.
   ============================================================ */
group(8);
await withApp(async (w, d, T) => {
  section("8. Filter inversion (NOT)");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  w.render();

  const normal = w.createFilterNode(f.id, "text", "message 1");
  const inverted = w.createFilterNode(f.id, "text", "message 1", true);
  const normalCount = w.getEntries(normal.id).length;
  const invertedCount = w.getEntries(inverted.id).length;
  assert(normalCount + invertedCount === 10, "inverted result is the exact set-complement of the normal result within the parent");
  assert(!w.getEntries(inverted.id).some(e => e.message.includes("message 1")), "inverted filter excludes everything the normal filter would have kept");

  // NOT checkbox at creation time (filter popup)
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  d.querySelector("#filterInput").value = "message 2";
  setPill(d.querySelector("#filterInvertCheckbox"), true);
  fireSubmit(d.querySelector("#filterForm"), w);
  const created = T.state.nodes[T.state.activeId];
  assert(created.inverted === true, "NOT toggle in the filter popup sets inverted:true at creation");

  // Right-click toggle after the fact
  w.render();
  const plainNode = w.createFilterNode(f.id, "text", "message 3");
  T.state.activeId = plainNode.id;
  w.render();
  const row = [...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active"));
  fireContextMenu(row, w);
  const invertItem = [...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "invert");
  assert(invertItem, "tree context menu offers Invert (NOT) for an eligible node");
  fireClick(invertItem, w);
  assert(plainNode.inverted === true, "context-menu Invert (NOT) toggles the flag");

  // A wildcard "text" filter (extraction-capable) stays invertible — there
  // is no separate "extract" filterType to exclude anymore (this session's
  // filterType merge). NOT still means "keep what this pattern would NOT
  // match", same as any other "text" filter; it just means Table/Plot would
  // tabulate the inverted (non-wildcard-relevant) result.
  const extractNode = w.createFilterNode(f.id, "text", "message [*:int]");
  T.state.activeId = extractNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert([...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu offers Invert (NOT) for a wildcard/extraction-capable 'text' node too");

  // Exclusions: link, context
  const f2 = await w.addFile("b.log", makeLog(0, 10, { msgPrefix: "other" }), () => {});
  const linkNode = w.createLinkNode(f.id, f2.id, "before", 1);
  T.state.activeId = linkNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu omits Invert (NOT) for link nodes");

  const ctxNode = w.createContextNode(f.id, 1000, 1000);
  T.state.activeId = ctxNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu omits Invert (NOT) for context nodes (3rd exclusion, added after the original NOT session)");

  const countCtxNode = w.createCountContextNode(f.id, 2, 2);
  T.state.activeId = countCtxNode.id;
  w.render();
  fireContextMenu([...d.querySelectorAll(".tree-row")].find(r => r.classList.contains("active")), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(n => n.dataset.action === "invert"),
    "tree context menu omits Invert (NOT) for countContext nodes (4th exclusion, same reasoning as context: every window contains its own reference entry)");

  // NOT stays available while typing a wildcard pattern — "Add filter" is
  // the only outcome (this session's filterType merge, Group 41), so there
  // is nothing left to conditionally disable based on pattern content.
  T.state.activeId = f.id;
  w.render();
  w.openFilterPopup();
  const filterInput = d.querySelector("#filterInput");
  const invertCb = d.querySelector("#filterInvertCheckbox");
  setPill(invertCb, true);
  filterInput.value = "[*:int]";
  fireInput(filterInput, w);
  assert(invertCb.disabled === false, "typing a wildcard pattern leaves NOT available");
  w.closeFilterPopup();
});
