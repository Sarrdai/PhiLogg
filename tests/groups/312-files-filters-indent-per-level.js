// GROUP 312 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 312 — Files & Filters indent per level is TREE_INDENT_STEP (18px
   since design polish B4; was 10px between the elbows era and 18px before)
   with the chevron in its own 14px column. Real rows, queued placeholder
   rows and filter-history ghost rows all use the same step. */
group(312);
await withApp(async (w, d, T) => {
  section("312. Tree indent per level is TREE_INDENT_STEP (18px), 14px chevron column");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const A = w.createFilterNode(f.id, "text", "message");
  const A1 = w.createFilterNode(A.id, "text", "1");
  const A1a = w.createFilterNode(A1.id, "text", "1");
  T.state.activeId = A1a.id;
  w.render();
  const rowOf = n => d.querySelector('#tree .tree-row[data-node-id="' + n.id + '"]');
  assert(w.eval("TREE_INDENT_STEP") === 18, "indent step constant is 18px");
  assert([f, A, A1, A1a].map(n => rowOf(n).style.paddingLeft).join() === "8px,26px,44px,62px",
    "rows indent 18px per level, got " + [f, A, A1, A1a].map(n => rowOf(n).style.paddingLeft).join());
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(css.includes(".tree-chevron-slot{flex:0 0 auto; width:14px; height:16px; margin-right:-3px;"), "chevron slot is 14px wide and pulls the swatch closer");
  const q = w.renderQueuedFileRow({ id: "q", name: "q.log" }, 2).querySelector(".tree-row-queued");
  assert(q.style.paddingLeft === "44px", "queued placeholder row uses the same step, got " + q.style.paddingLeft);
  const g = w.renderGhostRow({ filterType: "text", value: "x", children: [] }, 2);
  assert(g.style.paddingLeft === "36px", "filter-history ghost rows use the same step, got " + g.style.paddingLeft);
});
