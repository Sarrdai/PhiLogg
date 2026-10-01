// GROUP 249 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 249 — Refinement: a nested Sources row (opts.mergeSourceColor) has
   no delete (✕) button and ignores middle-click delete — only deletable
   together with its owning merge (see deleteNode's cascade, Group 250). A
   bulk-merge-visible source's own top-level row is unaffected and keeps
   both delete affordances.
   ============================================================ */
group(249);
await withApp(async (w, d, T) => {
  section("249. Nested Sources rows have no ✕/middle-click delete; the same source's top-level row (bulk-merge case) still does");
  const fa = await w.addFile("a.log", makeLog(0, 2), () => {});
  const fb = await w.addFile("b.log", makeLog(100, 2, { msgPrefix: "later" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  T.state.activeId = merged.id;
  const sourcesNode = T.state.nodes[merged.children[0]];
  sourcesNode.collapsed = false; // Refinement 4 collapses it by default — expand to see nested rows
  w.render();

  const faRows = () => [...d.querySelectorAll('.tree-row[data-node-id="' + fa.id + '"]')];
  assert(faRows().length === 2, "sanity: fa renders twice — top-level (bulk-merge original) + nested under Sources");
  const [topRow, nestedRow] = faRows();
  assert(topRow.querySelector(".tree-del"), "the top-level (unnested) fa row still has its own ✕");
  assert(!nestedRow.querySelector(".tree-del"), "the nested fa row has NO ✕ button");

  nestedRow.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
  assert(T.state.nodes[fa.id], "middle-clicking the nested row does NOT delete fa");
  topRow.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
  assert(!T.state.nodes[fa.id], "middle-clicking the TOP-LEVEL row still deletes fa — its own delete affordance is unaffected");
});
