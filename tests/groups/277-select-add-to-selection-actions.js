// GROUP 277 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 277 — "Select" (Add to selection) actions use the selection
   filter's tree-node checkmark
   Origin: 2026-09-25, person-requested. The toolbar "Select" buttons and
   the context menu's "Add to selection" item drew the generic filter
   funnel; they now draw the same checkmark path as a selection filter
   (idset) node in the tree, so action and result read as one thing.
   ============================================================ */
group(277);
await withApp(async (w, d, T) => {
  section("277. Select buttons + context-menu item share the idset node's checkmark");
  const f = await w.addFile("sel.log", makeLog(0, 5), () => {});
  const idsetNode = w.createFilterNode(f.id, "idset", [f.entries[1].id]);
  const treeSym = (w.nodeIconHTML(idsetNode).match(/href="#(i-[a-z-]+)"/) || [])[1];
  const treePath = treeSym && d.querySelector("#" + treeSym + " path").getAttribute("d");
  assert(treePath, "sanity: the idset node icon references a sprite symbol with a path");
  const pathOf = el => el && el.querySelector("svg path") && el.querySelector("svg path").getAttribute("d");
  const btns = [...d.querySelectorAll('[data-row-action="addToSelection"]')];
  assert(btns.length > 0, "sanity: Select buttons are rendered");
  btns.forEach((b, i) => assert(pathOf(b) === treePath, "Select button #" + i + " draws the tree's checkmark, got " + pathOf(b)));
  assert(pathOf(d.querySelector("#ctxAddToSelection")) === treePath,
    "the context menu's Add to selection item draws the same checkmark");
});
