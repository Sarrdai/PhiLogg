// GROUP tree-label-drag — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP tree-label-drag — a filter row can be dragged by its label text
   Origin: 2026-10-09 (person-reported: drag & drop only worked on the row's
   icon/count, not when grabbing the text). The glyphs of .tree-label are
   native-selectable text, so a press there started a text selection / native
   text drag instead of treeDrag. Tree rows are now user-select:none (the
   rename input excepted). jsdom has no selection UI, so the rule itself and
   the mouse-event drag from the label element are asserted.
   ============================================================ */
group("tree-label-drag");
await withApp(async (w, d, T) => {
  section("tree-label-drag a. Tree rows are not text-selectable, the rename input is");
  const css = Array.from(d.querySelectorAll("style")).map(s => s.textContent).join("\n");
  assert(/\.tree-row\{user-select:none;/.test(css), "CSS: .tree-row is user-select:none");
  assert(/\.tree-row \.tree-rename-input\{user-select:text;/.test(css), "CSS: rename input stays selectable");

  section("tree-label-drag b. Dragging from the label text reparents the filter");
  const f = await w.addFile("a.log", makeLog(0, 6), () => {});
  const a = w.createFilterNode(f.id, "text", "alpha");
  const b = w.createFilterNode(f.id, "text", "beta");
  w.render();
  const rowOf = id => d.querySelector('#tree .tree-row[data-node-id="' + id + '"]');
  const mouse = (el, type, x, buttons) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX: x, clientY: 1 }));
  const label = rowOf(a.id).querySelector(".tree-label");
  mouse(label, "mousedown", 10, 1);
  mouse(label, "mousemove", 40, 1);
  mouse(rowOf(b.id).querySelector(".tree-label"), "mousemove", 41, 1);
  mouse(rowOf(b.id).querySelector(".tree-label"), "mouseup", 41, 0);
  assert(T.state.nodes[a.id].parentId === b.id, "alpha was dropped onto beta by dragging its label text");
});
