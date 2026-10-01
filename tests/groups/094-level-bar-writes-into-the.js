// GROUP 94 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 94 — Level bar writes into the filter tree (FEATURE_BACKLOG.md #10)
   Origin: this session (2026-08-23), person-requested design: two modes
   picked in Settings -> Behavior (#settingsLevelFilterTreeMode), default
   "auto" — the level bar upserts a single filterType:"level" node (value =
   array of active level names) at the current tree position instead of the
   old tree-independent state.levelFilter Set. "explicit" keeps the original
   Set-based quick-filter (still exercised by Groups 4/13/33/52/61a/b/d/e,
   all pinned to "explicit" mode now that it's no longer the default) plus a
   new #btnApplyLevelToTree ("Add to tree") button, shown only in that mode,
   that pushes the current selection into the tree on demand.
   ============================================================ */
group(94);
await withApp(async (w, d, T) => {
  section("94. Level bar writes into the filter tree");

  // 20 entries, ERROR at every 5th index (makeLog's default level rule) — 4
  // ERROR / 16 INFO, same fixture shape Group 61e already uses.
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  T.state.activeId = f.id;
  w.render();

  const select = d.querySelector("#settingsLevelFilterTreeMode");
  const applyBtn = d.querySelector("#btnApplyLevelToTree");
  const findLevelBtn = lvl => [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes(lvl));

  /* ---------- Defaults: "auto" mode, Apply button hidden ---------- */
  assert(T.levelFilterTreeMode === "auto", "level-filter-tree mode defaults to auto");
  assert(select.value === "auto", "settings dropdown reflects the auto default");
  assert(!isVisible(applyBtn, w), "#btnApplyLevelToTree stays hidden in auto mode — the level bar already writes into the tree");

  /* ---------- Auto mode: clicking a level creates a "level" node under the active node ---------- */
  fireClick(findLevelBtn("ERROR"), w);
  assert(f.children.length === 1, "auto mode: clicking ERROR creates exactly one child node under the active file");
  const levelNode = T.state.nodes[f.children[0]];
  assert(levelNode.filterType === "level" && JSON.stringify(levelNode.value) === JSON.stringify(["ERROR"]),
    "the new node is a filterType:\"level\" node with value [\"ERROR\"]");
  assert(T.state.activeId === levelNode.id, "the new level node becomes the active node");
  assert(levelNode.name === "ERROR", "node name is the joined level list");
  const row = d.querySelector('.tree-row[data-node-id="' + levelNode.id + '"]');
  assert(w.typeTagFor(levelNode) === "LVL", "typeTagFor still reports LVL for a level node (the separate .tree-type-tag badge itself is gone — see Group 132, the type shows once, at the icon's own position, per the Settings -> Behavior indicator mode)");
  assert(row.querySelector(".tree-label").textContent === "ERROR", "tree row label shows the level list");
  assert(w.getEntries(levelNode.id).length === 4, "getEntries' new \"level\" dispatch branch filters correctly, got " + w.getEntries(levelNode.id).length);
  assert(T.currentViewEntries.length === 4, "Filtered view narrows to the 4 ERROR entries");

  /* ---------- Clicking a second level while the level node is active updates it IN PLACE (no duplicate node) ---------- */
  fireClick(findLevelBtn("INFO"), w);
  assert(f.children.length === 1 && T.state.activeId === levelNode.id, "still exactly one node — the same node was edited, not duplicated");
  assert(JSON.stringify(T.state.nodes[levelNode.id].value) === JSON.stringify(["ERROR", "INFO"]),
    "second click adds INFO to the same node's value, in canonical LEVELS order");
  assert(w.getEntries(levelNode.id).length === 20, "sanity: ERROR+INFO covers every entry in this fixture");

  /* ---------- Toggling levels back off shrinks the node; the LAST one deletes it (undoably) ---------- */
  fireClick(findLevelBtn("ERROR"), w);
  assert(JSON.stringify(T.state.nodes[levelNode.id].value) === JSON.stringify(["INFO"]), "removing ERROR leaves just INFO on the same node");
  const undoLenBefore = T.undoStack.length;
  fireClick(findLevelBtn("INFO"), w);
  assert(!T.state.nodes[levelNode.id], "removing the last active level deletes the node entirely");
  assert(f.children.length === 0, "the file has no children left");
  assert(T.state.activeId === f.id, "active node reverts to the parent (deleteNode's own behavior)");
  assert(T.undoStack.length === undoLenBefore + 1 && T.undoStack[T.undoStack.length - 1].kind === "delete",
    "the auto-delete goes through deleteFilterNodeWithUndo — a real, undoable action");
  w.undo();
  assert(T.state.nodes[levelNode.id] && JSON.stringify(T.state.nodes[levelNode.id].value) === JSON.stringify(["INFO"]),
    "undo restores the node with its pre-delete value, same id");
  assert(f.children.includes(levelNode.id), "...and re-attached under the file");
  // Clean up for the sections below.
  w.deleteFilterNodeWithUndo(levelNode.id);
  T.state.activeId = f.id;
  w.render();

  /* ---------- Explicit mode: level bar reverts to the classic Set, plus the Apply button ---------- */
  select.value = "explicit";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.levelFilterTreeMode === "explicit", "settings dropdown switches the mode");
  assert(w.localStorage.getItem("philogg-level-filter-tree-mode") === "explicit", "mode choice persisted");
  assert(isVisible(applyBtn, w), "#btnApplyLevelToTree becomes visible in explicit mode");
  assert(applyBtn.disabled, "...but stays disabled while nothing is selected on the level bar");
  // FEATURE_BACKLOG.md #37 regression guard: #btnApplyLevelToTree must join
  // the SAME float:left pinned-top-left flow as #fhTabs/#levelBar/the other
  // toolbar-icon-btns in #viewBar (see the layout mechanism guard in GROUP
  // "view bar" above). It's toggled via display:none/"" rather than
  // removed/re-added, so an unfloated button here drops below the #levelBar
  // float as a normal-flow block, shoving #breadcrumb's wrap start down
  // with it the moment Manual mode reveals it — exactly the reported
  // "extra button shifts the filter chain" bug.
  assert(w.getComputedStyle(applyBtn).float === "left", "#btnApplyLevelToTree floats left, same pinned-top-left mechanism as #fhTabs/#levelBar, so revealing it doesn't shift #breadcrumb");

  fireClick(findLevelBtn("ERROR"), w);
  assert(T.state.levelFilter.has("ERROR"), "explicit mode: clicking a level toggles the classic state.levelFilter Set");
  assert(f.children.length === 0, "...and does NOT touch the filter tree");
  assert(!applyBtn.disabled, "Apply button enables once a level is selected");

  fireClick(applyBtn, w);
  assert(f.children.length === 1, "Apply button pushes the current selection into the tree as a node");
  const appliedNode = T.state.nodes[f.children[0]];
  assert(appliedNode.filterType === "level" && JSON.stringify(appliedNode.value) === JSON.stringify(["ERROR"]),
    "the applied node carries the current level-bar selection");
  assert(T.state.activeId === appliedNode.id, "the applied node becomes active");

  fireClick(applyBtn, w); // active node IS the level node already — must update in place, not duplicate
  assert(f.children.length === 1, "re-clicking Apply on an already-applied selection updates the existing node instead of creating a second one");

  /* ---------- Switching mode clears the (now stale/invisible) global quick-filter ---------- */
  select.value = "auto";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.levelFilter.size === 0, "switching mode clears state.levelFilter so it can't silently bleed into the other mode");
  assert(!isVisible(applyBtn, w), "Apply button hides again in auto mode");

  /* ---------- Persistence: a "level" node's filterType/value round-trip through the generic value field ---------- */
  // f still has the one level node from the explicit-mode Apply above
  // (mode switches never touch the tree itself, only the level bar's
  // client-side behavior) — serialize it and materialize it under a second,
  // unrelated file, mirroring how the session cache persists/restores a
  // filter tree (see serializeFilterTreeForCache/materializeCachedFilters).
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
