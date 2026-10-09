// GROUP phone-undo-toast-paths — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP phone-undo-toast-paths — every user delete path offers the Undo toast on phone
   Origin: 2026-10-04 (tablet retest). Besides the tree menu's Remove (GROUP phone-undo-toast),
   the tree row's ✕ button, middle-click, the Delete key and Ctrl+W now call
   offerUndoToast too (a narrow mouse/keyboard window reaches them with no Undo button).
   Since 2026-10-09 (Round I, I6) the desktop width shows the toast as well.
   ============================================================ */
group("phone-undo-toast-paths");

const putWidth = (w, px) => { w.innerWidth = px; w.dispatchEvent(new w.Event("resize")); };
const putToast = d => d.querySelector("#copyToast");
const putText = d => { const t = putToast(d); return t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild.textContent : ""; };
const putHasUndo = d => !!putToast(d).querySelector(".toast-action") && putToast(d).classList.contains("has-action");

for (const [px, shown] of [[390, true], [1440, true]]) {
  const tag = (shown ? "phone" : "desktop") + ": ";
  await withApp(async (w, d, T) => {
    section("phone-undo-toast-paths a. " + tag + "tree row ✕ button");
    w.philogg = {};
    const f = await w.addFile("a.log", makeLog(0, 20), () => {});
    const flt = w.createFilterNode(f.id, "text", "message 1");
    w.render();
    putWidth(w, px);
    const row = d.querySelector('#tree .tree-row[data-id="' + flt.id + '"]') || [...d.querySelectorAll("#tree .tree-row")].find(r => r.querySelector(".tree-del") && /message 1/.test(r.textContent));
    fireClick(row.querySelector(".tree-del"), w);
    assert(!T.state.nodes[flt.id], tag + "filter removed");
    if (shown) {
      assert(putText(d) === "Filter removed" && putHasUndo(d), tag + "toast with Undo, got " + putToast(d).textContent);
      fireClick(putToast(d).querySelector(".toast-action"), w);
      assert(!!T.state.nodes[flt.id], "Undo restores");
    } else assert(!putHasUndo(d), tag + "no toast");

    section("phone-undo-toast-paths a2. " + tag + "tree row middle-click");
    const mc = w.createFilterNode(f.id, "text", "message 3");
    w.render();
    const mrow = [...d.querySelectorAll("#tree .tree-row")].find(r => /message 3/.test(r.textContent));
    mrow.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
    assert(!T.state.nodes[mc.id], tag + "filter removed by middle-click");
    assert(shown ? putText(d) === "Filter removed" && putHasUndo(d) : !putHasUndo(d), tag + "toast " + (shown ? "shown" : "absent"));

    section("phone-undo-toast-paths b. " + tag + "Delete key (tree focus)");
    const g = w.createFilterNode(f.id, "text", "message 2");
    T.state.activeId = g.id; T.state.focusRegion = "tree";
    w.render();
    fireKeydown(d, w, "Delete");
    assert(!T.state.nodes[g.id], tag + "filter removed by Delete");
    assert(shown ? putText(d) === "Filter removed" && putHasUndo(d) : !putHasUndo(d), tag + "toast " + (shown ? "shown" : "absent"));

    section("phone-undo-toast-paths c. " + tag + "Ctrl+W closes the file");
    T.state.activeId = f.id;
    w.render();
    fireKeydown(d, w, "w", { ctrlKey: true });
    assert(!T.state.nodes[f.id], tag + "file closed");
    assert(shown ? putText(d) === "File removed" && putHasUndo(d) : !putHasUndo(d), tag + "toast " + (shown ? "shown" : "absent"));
  });
}
