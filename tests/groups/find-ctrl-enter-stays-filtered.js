// GROUP find-ctrl-enter-stays-filtered — loaded by philogg.regression.test.js
// (tests/README.md → "Group files"): helpers (withApp, waitFor, assert, ...) in scope.

/* ============================================================
   GROUP find-ctrl-enter-stays-filtered — Ctrl+Enter in the find bar
   Origin: 2026-10-07, person-reported: search with Ctrl+F, step to a hit
   (it becomes the selected row), then Ctrl+Enter to add the search as a
   filter — the view jumped from Filtered to Context. addFindAsFilter
   closed the bar (focus left the input), so the same keydown reached the
   document handler's "Enter on the selected row" (revealInHighlightView).
   The find input now stops that event's propagation.
   ============================================================ */
group("find-ctrl-enter-stays-filtered");
if (groupSelected()) {
  const log = LOGSIM.generateToStrings({ format: "default", entries: 80, seed: 7 })[0];
  await withApp(async (w, d, T) => {
    section("find-ctrl-enter: Ctrl+Enter after stepping to a hit keeps the new filter's Filtered view");
    const f = await w.addFile(log.name || "app.log", log.text, () => {});
    T.state.activeId = f.id;
    w.render();
    w.applyFhView("filter");
    T.state.focusRegion = "entries";
    const input = d.getElementById("findInput");
    fireKeydown(d, w, "f", { ctrlKey: true });
    input.value = "order";
    fireInput(input, w);
    await sleep(200);
    input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    assert(T.state.selectedId, "sanity: stepping through the hits selected a row");
    const before = f.children.length;
    input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
    await sleep(50);
    assert(f.children.length === before + 1, "Ctrl+Enter added the search as a filter");
    assert(T.fhActiveTab === "filter", "the Filtered view stays shown, got " + T.fhActiveTab);
  });
}
