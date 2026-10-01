// GROUP 69 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 69 — mergeFiles follows the same "create the row first, stream
   progress onto it" pattern as loading a file
   Origin: this session (2026-08-20), person-requested follow-up ("Für ein
   File Merge folge der gleichen Logik. Lege den Eintrag zuerst an und Zeige
   den Fortschritt des Merge an diesem Eintrag."): mergeFiles used to build
   the whole merged entries array synchronously in one blocking call before
   the node ever appeared in the tree. It's now async: the merged node is
   inserted into state.nodes/rootIds immediately (empty, loadFraction 0,
   already the active/interactive row via flushLoadRender — mirrors
   createFileNode), then filled in over chunks (MERGE_CHUNK_ENTRIES) with
   node.loadFraction/scheduleLoadRender driving the same .tree-load-fill
   progress bar a real file load uses, before a final chronological sort and
   flushLoadRender clear the fill. Both existing direct mergeFiles() callers
   in this suite (Groups 10 and 30c) were updated to await it; Group 68b
   already covers the merge-on-load dialog's own path through the new async
   mergeFiles indirectly (loadFileDescriptors awaits it internally).
   ============================================================ */
group(69);
await withApp(async (w, d, T) => {
  section("69. mergeFiles: the merged row exists (grayed-progress, not grayed-placeholder) the instant merging starts, and stays correct once it finishes");
  // fb's timestamps (baseSec 0) start earlier than fa's (baseSec 3) but the
  // ranges OVERLAP (3-7 vs 0-4) — this exercises the full async copy+sort
  // path (see GROUP 203 for the quick/concat path taken when ranges are
  // disjoint instead), proving the final sort actually reorders, not just
  // concatenates in call order.
  const fa = await w.addFile("late.log", makeLog(3, 5), () => {});
  const fb = await w.addFile("early.log", makeLog(0, 5, { msgPrefix: "early" }), () => {});

  const before = new Set(T.state.rootIds);
  const donePromise = w.mergeFiles([fa.id, fb.id]);
  // Synchronous prefix (node creation -> flushLoadRender) has already run by
  // the time this line executes — the first await inside the copy loop is
  // what actually suspends, same technique Group 48b uses for a real load.
  const newId = T.state.rootIds.find(id => !before.has(id));
  assert(newId, "the merged file is already a real root node the instant merging starts, before any chunk has finished copying");
  const node = T.state.nodes[newId];
  assert(node.merged === true, "the new node is flagged merged from creation, same as before this change");
  assert(typeof node.loadFraction === "number", "the merged node carries a loadFraction while it's still being built");

  let label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "late.log + early.log");
  assert(label !== undefined, "the merged file's row renders in the tree immediately, not just once merging finishes");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") !== null, "the row carries the usual progress-fill bar while merging, same as a plain file load");
  assert(d.querySelectorAll(".tree-row-queued").length === 0, "the merge uses the loading-progress row, not the grayed queued-placeholder row multi-file loads use");

  await donePromise;
  assert(typeof node.loadFraction !== "number", "loadFraction is cleared off the node once merging finishes");
  assert(node.entries.length === 10, "merged entries combine both source files, got " + node.entries.length);
  for (let i = 1; i < node.entries.length; i++) {
    assert(node.entries[i].ts >= node.entries[i - 1].ts, "merged entries end up in chronological order (entry " + i + ")");
  }
  assert(node.entries[0].message.includes("early"), "the earlier-timestamped source file's entries sort to the front, not just appear in call order");
  // flushLoadRender's final render() rebuilds #tree from scratch (renderTree
  // tears down and recreates every row) — re-query instead of reusing the
  // pre-await `label`, which is now a detached, stale DOM node.
  label = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "late.log + early.log");
  assert(label !== undefined, "the merged file still renders as a normal real tree row once merging finishes");
  assert(label.closest(".tree-row").querySelector(".tree-load-fill") === null, "the progress fill is gone once merging finishes");
});
