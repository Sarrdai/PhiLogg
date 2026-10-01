// GROUP 96 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 96 — Rename / label filter nodes (FEATURE_BACKLOG.md #12)
   Origin: this session (2026-08-23, person-requested, F2 repurposed as the
   rename shortcut, Edit moved to Ctrl+E — see GROUP 18/32/46's updated F2
   references). A node.label overrides node.name for DISPLAY only (tree row,
   breadcrumb, child-nav flyout, context menu header, link dialog, ...);
   node.name itself is untouched, still what Edit/Save-to-file/library
   default to. Covers the inline F2/Enter/Escape rename UI, the context
   menu's "Rename…" item, undo/redo (reuses withFieldEditUndo, same as the
   invert toggle), the "level" node label-coloring interaction (GROUP 95 —
   a custom label must override the per-word coloring), and every
   persistence carrier CLAUDE.md's "Known gotchas" list calls out
   (cloneSubtree, snapshotSubtree/restoreSubtree,
   serializeFilterBranch/importFilterJson,
   serializeFilterTreeForCache/materializeCachedFilters).
   ============================================================ */
group(96);
await withApp(async (w, d, T) => {
  section("96. Rename / label filter nodes");
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const node = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = node.id;
  w.render();
  const rowFor = id => d.querySelector('.tree-row[data-node-id="' + id + '"]');

  /* ---------- nodeDisplayName: falls back to node.name, prefers node.label ---------- */
  assert(w.nodeDisplayName(node) === node.name, "no label yet — nodeDisplayName falls back to node.name");
  assert(rowFor(node.id).querySelector(".tree-label").textContent === node.name, "tree row shows the raw auto-derived name before any rename");

  /* ---------- F2 starts an inline rename: label swaps for a text input ---------- */
  T.state.focusRegion = "tree"; // F2 renames the tree node only with tree focus
  fireKeydown(d, w, "F2");
  let row = rowFor(node.id);
  let input = row.querySelector(".tree-rename-input");
  assert(input, "F2 replaces the row's .tree-label content with a .tree-rename-input");
  assert(input.value === "", "input starts empty — no label set yet");
  assert(input.placeholder === node.name, "input's placeholder shows the raw value as a hint while renaming");
  assert(!d.querySelector("#filterPopup") || d.querySelector("#filterPopup").classList.contains("hidden"),
    "F2 does NOT open the Edit popup anymore (that moved to Ctrl+E, see GROUP 18)");

  /* ---------- Enter commits the rename, undoably ---------- */
  const undoLenBeforeRename = T.undoStack.length;
  input.value = "Step 1: baseline";
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert(node.label === "Step 1: baseline", "Enter commits the typed value into node.label, got " + JSON.stringify(node.label));
  assert(node.value === "message 1" && node.name === "“message 1”", "the filter's actual value/name are untouched by a rename");
  assert(T.undoStack.length === undoLenBeforeRename + 1 && T.undoStack[T.undoStack.length - 1].kind === "edit",
    "rename pushes a real, undoable \"edit\" action — same mechanism as invert/value-edit");
  row = rowFor(node.id);
  assert(!row.querySelector(".tree-rename-input"), "input is gone after commit — back to a plain label");
  assert(row.querySelector(".tree-label").textContent === "Step 1: baseline", "tree row now shows the custom label instead of the raw value");
  assert(row.querySelector(".tree-label").title.includes("Step 1: baseline") && row.querySelector(".tree-label").title.includes(node.name),
    "row title shows BOTH the label and the raw value in brackets, for discoverability");
  assert(w.nodeDisplayName(node) === "Step 1: baseline", "nodeDisplayName now prefers the label");

  /* ---------- Undo/redo ---------- */
  w.undo();
  assert(!node.label, "undo clears the label back to unset");
  assert(rowFor(node.id).querySelector(".tree-label").textContent === node.name, "tree row reverts to the raw value after undo");
  w.redo();
  assert(node.label === "Step 1: baseline", "redo re-applies the rename");

  /* ---------- Re-opening rename prefills the CURRENT label, not empty ---------- */
  fireKeydown(d, w, "F2");
  input = rowFor(node.id).querySelector(".tree-rename-input");
  assert(input.value === "Step 1: baseline", "input prefills with the node's current label");

  /* ---------- Escape cancels without touching the label or the undo stack ---------- */
  const undoLenBeforeEscape = T.undoStack.length;
  input.value = "abandoned edit";
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(!rowFor(node.id).querySelector(".tree-rename-input"), "Escape closes the rename input");
  assert(node.label === "Step 1: baseline", "Escape leaves the label exactly as it was — the typed text is discarded");
  assert(T.undoStack.length === undoLenBeforeEscape, "Escape does not push an undo action");

  /* ---------- Committing an empty value clears the label (reverts to the raw name) ---------- */
  fireKeydown(d, w, "F2");
  input = rowFor(node.id).querySelector(".tree-rename-input");
  input.value = "   "; // whitespace-only — trimmed to empty
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert(!node.label, "committing a blank/whitespace-only value clears node.label entirely");
  assert(rowFor(node.id).querySelector(".tree-label").textContent === node.name, "tree row shows the raw value again");

  /* ---------- Re-committing the SAME label is a no-op (no undo spam) ---------- */
  w.renameFilterNodeWithUndo(node.id, "repeat me");
  const undoLenAfterFirst = T.undoStack.length;
  w.renameFilterNodeWithUndo(node.id, "repeat me");
  assert(T.undoStack.length === undoLenAfterFirst, "renaming to the label it already has pushes no new undo action");

  /* ---------- Context menu offers "Rename…" (unconditionally, unlike "Edit filter…") ---------- */
  fireContextMenu(rowFor(node.id), w);
  let items = [...d.querySelectorAll("#treeContextMenu [data-action]")];
  assert(items.some(n => n.dataset.action === "rename" && n.textContent.includes("Rename")), "context menu offers \"Rename…\" for a text filter");
  const linkNode = w.createFilterNode(f.id, "after", f.entries[5].ts); // stand-in "not text/extract" type
  linkNode.filterType = "and"; // and/or nodes get no "Edit filter…" item at all — Rename should still be offered
  w.render();
  fireContextMenu(rowFor(linkNode.id), w);
  items = [...d.querySelectorAll("#treeContextMenu [data-action]")];
  assert(items.some(n => n.dataset.action === "rename"), "\"Rename…\" is offered even for a filterType with no \"Edit filter…\" item");
  assert(!items.some(n => n.dataset.action === "edit"), "sanity: this filterType indeed has no \"Edit filter…\" item");
  w.closeTreeContextMenu();
  w.deleteFilterNodeWithUndo(linkNode.id);

  fireContextMenu(rowFor(node.id), w);
  fireClick([...d.querySelectorAll("#treeContextMenu [data-action]")].find(n => n.dataset.action === "rename"), w);
  assert(rowFor(node.id).querySelector(".tree-rename-input"), "context menu's \"Rename…\" action starts the same inline rename as F2");
  rowFor(node.id).querySelector(".tree-rename-input").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  w.renameFilterNodeWithUndo(node.id, ""); // clean up back to no label for the sections below
  T.resetUndoRedo();

  /* ---------- Interaction with GROUP 95: a label overrides "level" node per-word coloring ---------- */
  const levelNode = w.createFilterNode(f.id, "level", ["ERROR", "INFO"]);
  w.render();
  let levelLabel = rowFor(levelNode.id).querySelector(".tree-label");
  assert(levelLabel.querySelectorAll("span").length === 2, "sanity: an unlabeled \"level\" node still gets GROUP 95's per-word colored spans");
  w.renameFilterNodeWithUndo(levelNode.id, "Problems");
  w.render();
  levelLabel = rowFor(levelNode.id).querySelector(".tree-label");
  assert(levelLabel.querySelectorAll("span").length === 0 && levelLabel.textContent === "Problems",
    "once labeled, the per-word coloring is gone — plain text label like every other filter type");
  w.renameFilterNodeWithUndo(levelNode.id, "");
  w.render();
  assert(rowFor(levelNode.id).querySelector(".tree-label").querySelectorAll("span").length === 2,
    "clearing the label brings the per-word coloring back");
  w.deleteFilterNodeWithUndo(levelNode.id);

  /* ---------- Persistence carriers (CLAUDE.md "Known gotchas") ---------- */
  w.renameFilterNodeWithUndo(node.id, "Step 1: baseline");

  // cloneSubtree (Ctrl+C/Ctrl+V under the hood)
  const clone = w.cloneSubtree(node.id, f.id);
  assert(clone.label === "Step 1: baseline", "cloneSubtree carries the label over to the copy");

  // snapshotSubtree / restoreSubtree (delete + undo)
  const undoLenBeforeDelete = T.undoStack.length;
  w.deleteFilterNodeWithUndo(node.id);
  assert(T.undoStack.length === undoLenBeforeDelete + 1, "sanity: delete pushed an undo action");
  w.undo();
  assert(T.state.nodes[node.id].label === "Step 1: baseline", "snapshotSubtree/restoreSubtree round-trip the label through a delete+undo");

  // serializeFilterBranch / importFilterJson (Save filter.../Load filter... JSON files)
  const branch = w.serializeFilterBranch(node.id);
  assert(branch.roots[0].label === "Step 1: baseline", "serializeFilterBranch includes the label in the saved JSON shape");
  const h = await w.addFile("c.log", makeLog(0, 5), () => {});
  // loadFilterTargetId is a top-level `let` importFilterJson reads — reach it
  // via the shared lexical scope, same technique GROUP 10/32 use.
  const setLoadTarget = d.createElement("script");
  setLoadTarget.textContent = `loadFilterTargetId = ${JSON.stringify(h.id)};`;
  d.body.appendChild(setLoadTarget);
  const importJson = JSON.stringify({ format: "philogg-filters", version: 2, activeRef: branch.activeRef, roots: branch.roots });
  w.importFilterJson(importJson);
  const importedNode = h.children.map(id => T.state.nodes[id]).find(n => n.label === "Step 1: baseline");
  assert(importedNode, "importFilterJson recreates the node with its label intact");

  // serializeFilterTreeForCache / materializeCachedFilters (session cache)
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(f);
  const cacheNodeOut = cacheRoots.find(r => r.label === "Step 1: baseline");
  assert(cacheNodeOut, "serializeFilterTreeForCache includes the label");
  const k = await w.addFile("d.log", makeLog(0, 5), () => {});
  w.materializeCachedFilters(k, [cacheNodeOut]);
  const materializedNode = T.state.nodes[k.children[0]];
  assert(materializedNode.label === "Step 1: baseline", "materializeCachedFilters restores the label from the session cache");
});
