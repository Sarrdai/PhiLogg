// GROUP phone-undo-toast — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): runs inside its main async function, so
// every harness helper (withApp, assert, section, makeLog, fireClick, ...) is in scope.

/* ============================================================
   GROUP phone-undo-toast — Undo toast after a tree-menu removal on phone
   Origin: 2026-10-04 (usability test). Phone hides #btnUndo and has no
   keyboard, so "Remove filter"/"Remove file" in the tree context menu got an
   "Undo" toast (offerPhoneUndoToast). Desktop/compact keep the visible Undo
   button only.
   ============================================================ */
group("phone-undo-toast");

const ptWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const ptToast = d => d.querySelector("#copyToast");
const ptToastText = d => { const t = ptToast(d); return t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild.textContent : ""; };
const ptHasUndo = d => !!ptToast(d).querySelector(".toast-action") && ptToast(d).classList.contains("has-action");
const ptTreeMenuDelete = (w, d, id) => {
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {}, stopPropagation() {} }, id);
  const item = d.querySelector('#treeContextMenu [data-action="delete"]');
  assert(!!item, "tree menu offers a delete item");
  fireClick(item, w);
};

await withApp(async (w, d, T) => {
  section("phone-undo-toast a. phone: Remove filter -> toast + Undo restores the node");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const flt = w.createFilterNode(f.id, "text", "message 1");
  w.render();
  ptWidth(w, 390);
  ptTreeMenuDelete(w, d, flt.id);
  assert(!T.state.nodes[flt.id], "the filter is removed");
  assert(ptToastText(d) === "Filter removed" && ptHasUndo(d), "toast 'Filter removed' with an Undo button, got " + ptToast(d).textContent);
  fireClick(ptToast(d).querySelector(".toast-action"), w);
  assert(!!T.state.nodes[flt.id], "tapping Undo restores the node");

  section("phone-undo-toast b. stale toast does not undo a newer action");
  const f2 = w.createFilterNode(f.id, "text", "message 2");
  const f3 = w.createFilterNode(f.id, "text", "message 3");
  w.render();
  ptTreeMenuDelete(w, d, f2.id);
  const staleBtn = ptToast(d).querySelector(".toast-action");
  assert(!!staleBtn, "toast shown for f2");
  w.deleteFilterNodeWithUndo(f3.id); // another action meanwhile
  fireClick(staleBtn, w);
  assert(!T.state.nodes[f2.id] && !T.state.nodes[f3.id], "stale Undo did nothing (neither node restored)");
});

await withApp(async (w, d, T) => {
  section("phone-undo-toast c. phone: Remove file -> 'File removed'");
  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  const g = await w.addFile("b.log", makeLog(0, 10), () => {});
  w.render();
  ptWidth(w, 390);
  ptTreeMenuDelete(w, d, g.id);
  assert(!T.state.nodes[g.id], "file removed");
  assert(ptToastText(d) === "File removed" && ptHasUndo(d), "toast 'File removed' with Undo, got " + ptToast(d).textContent);
  fireClick(ptToast(d).querySelector(".toast-action"), w);
  assert(!!T.state.nodes[g.id], "Undo restores the file");
});

for (const [px, name] of [[1440, "desktop"], [820, "compact"]]) {
  await withApp(async (w, d, T) => {
    section("phone-undo-toast e. " + name + ": tree-menu delete shows no Undo toast");
    const f = await w.addFile("a.log", makeLog(0, 20), () => {});
    const flt = w.createFilterNode(f.id, "text", "message 1");
    w.render();
    ptWidth(w, px);
    ptTreeMenuDelete(w, d, flt.id);
    assert(!T.state.nodes[flt.id], name + ": filter removed");
    assert(!ptHasUndo(d), name + ": no Undo toast");
  });
}
