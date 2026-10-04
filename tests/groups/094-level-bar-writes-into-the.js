// GROUP 94 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 94 — "Add to tree": the level bar's selection becomes a level node
   (FEATURE_BACKLOG.md #10)
   Origin: 2026-08-23. Updated (Runde C / C2): the level chips are a pure view
   filter (state.levelFilter — see GROUP level-bar-view-filter); the
   #btnApplyLevelToTree ("Add to tree") button, visible only while chips are
   selected, upserts a single filterType:"level" node (value = array of
   selected level names) at the current tree position and clears the
   selection. The generic `value` round trip of a level node through the
   session-cache serializer is covered here too.
   ============================================================ */
group(94);
await withApp(async (w, d, T) => {
  section("94. Add to tree creates / edits a level node");

  // 20 entries, ERROR at every 5th index (makeLog's default level rule) — 4
  // ERROR / 16 INFO, same fixture shape Group 61e already uses.
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();

  const applyBtn = d.querySelector("#btnApplyLevelToTree");
  const findLevelBtn = lvl => [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.dataset.level === lvl);

  assert(!isVisible(applyBtn, w), "#btnApplyLevelToTree is hidden while no chip is selected");
  fireClick(findLevelBtn("ERROR"), w);
  assert(f.children.length === 0, "a chip click does not touch the tree");
  assert(isVisible(applyBtn, w), "...but reveals #btnApplyLevelToTree");
  // FEATURE_BACKLOG.md #37 regression guard: the button must join the SAME
  // float:left pinned-top-left flow as #fhTabs/#levelBar (see GROUP 102).
  assert(w.getComputedStyle(applyBtn).float === "left", "#btnApplyLevelToTree floats left, same pinned-top-left mechanism as #fhTabs/#levelBar");

  const undoLenBefore = T.undoStack.length;
  fireClick(applyBtn, w);
  assert(f.children.length === 1, "Add to tree creates exactly one child node under the active file");
  const levelNode = T.state.nodes[f.children[0]];
  assert(levelNode.filterType === "level" && JSON.stringify(levelNode.value) === JSON.stringify(["ERROR"]),
    "the new node is a filterType:\"level\" node with value [\"ERROR\"]");
  assert(T.state.activeId === levelNode.id, "the new level node becomes the active node");
  assert(levelNode.name === "ERROR", "node name is the joined level list");
  const row = d.querySelector('.tree-row[data-node-id="' + levelNode.id + '"]');
  assert(w.typeTagFor(levelNode) === "LVL", "typeTagFor reports LVL for a level node");
  assert(row.querySelector(".tree-label").textContent === "ERROR", "tree row label shows the level list");
  assert(w.getEntries(levelNode.id).length === 4, "getEntries' \"level\" dispatch branch filters correctly, got " + w.getEntries(levelNode.id).length);
  assert(T.state.levelFilter.size === 0 && !findLevelBtn("ERROR").classList.contains("active"), "the chip selection is cleared after the node is created");
  assert(!isVisible(applyBtn, w), "...and the button hides again");

  // With the level node active, a new selection edits that node IN PLACE (undoably).
  fireClick(findLevelBtn("INFO"), w);
  fireClick(applyBtn, w);
  assert(f.children.length === 1 && T.state.activeId === levelNode.id, "still exactly one node — the same node was edited, not duplicated");
  assert(JSON.stringify(T.state.nodes[levelNode.id].value) === JSON.stringify(["INFO"]), "the edit replaced the node's value with the selection");
  assert(T.state.levelFilter.size === 0, "the selection is cleared again");
  w.undo();
  assert(JSON.stringify(T.state.nodes[levelNode.id].value) === JSON.stringify(["ERROR"]), "undo restores the node's previous value");
  assert(T.undoStack.length >= undoLenBefore, "sanity: undo stack in use");

  /* ---------- Persistence: a "level" node's filterType/value round-trip through the generic value field ---------- */
  const g = await w.addFile("b.log", makeLog(0, 5), () => {});
  const { roots } = w.serializeFilterTreeForCache(f);
  assert(roots.length === 1 && roots[0].filterType === "level" && JSON.stringify(roots[0].value) === JSON.stringify(["ERROR"]),
    "serializeFilterTreeForCache carries a level node's filterType/value through the existing generic `value` field — no special-casing needed");
  w.materializeCachedFilters(g, roots);
  assert(g.children.length === 1, "materializeCachedFilters recreates the level node under the new file (FILTER_TYPES includes \"level\", or this would be silently dropped)");
  const restored = T.state.nodes[g.children[0]];
  assert(restored.filterType === "level" && JSON.stringify(restored.value) === JSON.stringify(["ERROR"]),
    "restored level node's filterType/value round-trip correctly");
  assert(w.getEntries(restored.id).length === g.entries.filter(e => e.level === "ERROR").length,
    "restored level node evaluates correctly through getEntries' \"level\" dispatch branch");
});
