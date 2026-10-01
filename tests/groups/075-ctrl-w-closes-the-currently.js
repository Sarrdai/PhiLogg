// GROUP 75 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 75 — Ctrl+W closes the currently open file
   Origin: this session (2026-08-21), FEATURE_BACKLOG.md "Ctrl+W closes the
   currently open file". Same close path the tree row's own ✕ button uses
   (deleteFilterNodeWithUndo via getRootFileId), so it's undo-able and works
   regardless of which node in the file's chain happens to be active.
   ============================================================ */
group(75);
await withApp(async (w, d, T) => {
  section("75. Ctrl+W closes the currently open file (desktop build; the browser build uses Alt+W, GROUP 323)");
  w.philogg = {}; // desktop build: Ctrl+W is the closeFile default (evaluated at call time)

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  const filterA = w.createFilterNode(f.id, "text", "message");
  T.state.activeId = filterA.id; // active node is a child filter, not the file itself
  w.render();

  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(!T.state.nodes[f.id], "Ctrl+W removes the active node's root FILE, even though a child filter was active");
  assert(!T.state.nodes[filterA.id], "...and its filter children go with it");
  assert(T.state.rootIds.length === 0, "no files remain");

  T.state.activeId = null;
  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(T.state.rootIds.length === 0, "Ctrl+W with nothing open is a harmless no-op");

  const f2 = await w.addFile("b.log", makeLog(0, 3), () => {});
  T.state.activeId = f2.id;
  w.render();
  fireKeydown(d, w, "w", { ctrlKey: true });
  assert(T.state.rootIds.length === 0, "sanity: b.log closed");
  w.undo();
  assert(T.state.nodes[f2.id], "Ctrl+W's close goes through the same undo-able deleteFilterNodeWithUndo path as the ✕ button");
});
