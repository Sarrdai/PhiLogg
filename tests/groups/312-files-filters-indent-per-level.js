// GROUP 312 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 312 — Files & Filters indent per level reduced to TREE_INDENT_STEP
   (10px, was 18px) and a chevron column narrowed to its glyph (10px, was
   16px): the connector lines carry the hierarchy, so the wide step only
   wasted horizontal space, and leaf elbows crossing the empty chevron
   column looked too long (person-reported). Real rows, queued
   placeholder rows and filter-history ghost rows all use the same step, and
   every child's elbow keeps a visible length. */
group(312);
await withApp(async (w, d, T) => {
  section("312. Tree indent per level is TREE_INDENT_STEP (10px), narrow chevron column");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const A = w.createFilterNode(f.id, "text", "message");
  const A1 = w.createFilterNode(A.id, "text", "1");
  const A1a = w.createFilterNode(A1.id, "text", "1");
  T.state.activeId = A1a.id;
  w.render();
  const rowOf = n => d.querySelector('#tree .tree-row[data-node-id="' + n.id + '"]');
  assert(w.eval("TREE_INDENT_STEP") === 10, "indent step constant is 10px");
  assert([f, A, A1, A1a].map(n => rowOf(n).style.paddingLeft).join() === "8px,18px,28px,38px",
    "rows indent 10px per level, got " + [f, A, A1, A1a].map(n => rowOf(n).style.paddingLeft).join());
  [A, A1, A1a].forEach(n => {
    const h = rowOf(n).querySelector(":scope > .tree-guide.h");
    assert(h && parseFloat(h.style.width) >= 5, "elbow into " + n.id + " stays visible, got " + (h && h.style.width));
  });
  // Follow-up (person-reported): the chevron column is only as wide as its
  // glyph, so a leaf's elbow (which crosses the empty column up to the
  // swatch) stays short and a chevron has no wide blank to its right.
  const leafH = rowOf(A1a).querySelector(":scope > .tree-guide.h");
  assert(parseFloat(leafH.style.width) <= 20, "a leaf's elbow stays short, got " + leafH.style.width);
  // Follow-up 2 (person-reported): the leaf elbow touched the swatch — it
  // now stops the same gap short of it as a chevron row's elbow does of
  // its chevron glyph.
  const gap = w.eval("TREE_ELBOW_GAP");
  assert(gap >= 2 && parseFloat(leafH.style.left) + parseFloat(leafH.style.width) === 38 + w.eval("TREE_CHEVRON_END") - gap,
    "a leaf's elbow stops TREE_ELBOW_GAP before its swatch, got end " + (parseFloat(leafH.style.left) + parseFloat(leafH.style.width)));
  const chevH = rowOf(A1).querySelector(":scope > .tree-guide.h");
  assert(parseFloat(chevH.style.left) + parseFloat(chevH.style.width) === 28 + w.eval("TREE_CHEVRON_GLYPH_START") - gap,
    "a chevron row's elbow stops the same gap before the chevron glyph");
  const css = [...d.querySelectorAll("style")].map(x => x.textContent).join("\n");
  assert(css.includes(".tree-chevron-slot{flex:0 0 auto; width:10px; height:16px; margin-right:-3px;"), "chevron slot is 10px wide and pulls the swatch closer");
  const q = w.renderQueuedFileRow({ id: "q", name: "q.log" }, 2).querySelector(".tree-row-queued");
  assert(q.style.paddingLeft === "28px", "queued placeholder row uses the same step, got " + q.style.paddingLeft);
  const g = w.renderGhostRow({ filterType: "text", value: "x", children: [] }, 2);
  assert(g.style.paddingLeft === "20px", "filter-history ghost rows use the same step, got " + g.style.paddingLeft);
});
