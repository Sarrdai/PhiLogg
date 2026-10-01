// GROUP 59 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 59 — Reusable filter library (FEATURE_BACKLOG.md item)
   Origin: this session. Named presets, saved via a filter node's "Save to
   library…" context menu action (#filterLibrarySaveDialog) and applied to
   ANY node — any file, not just the one it was saved from — via "Apply
   from library…" (#filterLibraryDialog). IndexedDB-backed ("filterLibrary"
   store, CACHE_DB_VERSION 3->4), file-agnostic and named on purpose (no
   content-fingerprint matching, unlike the per-file filter history).
   Applying reuses importFilterJson() unchanged, so it re-evaluates the
   filter LOGIC against whatever file it lands on, never a stale result.
   UPDATED, same session: "Add to Library" moved off #viewBar's dedicated
   #btnAddToLibrary button (removed outright, see GROUP 220/221) onto the
   Files & Filters sidebar toolbar's "Add to library…" action, targeting
   the specific selected filter node rather than always state.activeId —
   59a rewritten accordingly.
   ============================================================ */
group(59);
await withApp(async (w, d, T) => {
  section("59a. Add to library… (Files & Filters sidebar toolbar) + name dialog");
  // Needs a real (fake-indexeddb) IndexedDB — unlike state.multilineMessages
  // et al., the library has no in-memory fallback; cacheStoreOp silently
  // no-ops without one (same graceful-degradation jsdom sees in every OTHER
  // group, which is fine there since those don't assert on storage content).

  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  T.state.multiSelect = new Set([textNode.id]);
  T.state.activeId = textNode.id;
  w.render();

  // Saving lives on the sidebar toolbar's "Add to library…" action
  // (person-requested), acting on the SPECIFIC selected filter node.
  let { actions } = w.describeSidebarToolbarActions();
  assert(actions.some(a => a.action === "addToLibrary" && a.target === textNode.id),
    "'Add to library…' is offered, targeting the selected filter node");
  w.handleSidebarToolbarActionClick("addToLibrary");

  const saveDialog = d.querySelector("#filterLibrarySaveDialog");
  assert(!saveDialog.classList.contains("hidden"), "the naming dialog opens");
  const nameInput = d.querySelector("#filterLibraryNameInput");
  assert(nameInput.value === textNode.name, "name input pre-fills with the selected filter node's own name");

  nameInput.value = "My saved filter";
  fireClick(d.querySelector("#filterLibrarySaveConfirm"), w);
  assert(saveDialog.classList.contains("hidden"), "confirming closes the dialog");

  // General "Just this filter" vs "Include ancestor chain" prompt (see
  // GROUP 129) appears for EVERY save-to-library action — pick "Just this
  // filter" to proceed.
  await new Promise(r => setTimeout(r, 0));
  const scopeDialog = d.querySelector("#exportScopeDialog");
  assert(!scopeDialog.classList.contains("hidden"), "the general export-scope prompt opens as part of the actual save-to-library action");
  fireClick(d.querySelector("#exportScopeJustThis"), w);

  // saveFilterToLibrary's IndexedDB write is async — wait for the state this
  // asserts on rather than for a fixed 20ms (tests/README.md's own rule; the
  // same class of latent flake four other groups were converted for).
  await waitFor(async () => (await w.listFilterLibrary()).length === 1);
  const records = await w.listFilterLibrary();
  assert(records.length === 1 && records[0].name === "My saved filter", "one record saved under the entered name");
  assert(Array.isArray(records[0].roots) && records[0].roots.length === 1 && records[0].roots[0].filterType === "text",
    "the saved record carries serializeFilterBranch()'s own shape (roots/activeRef)");
  assert(records[0].showInToolbar === false && records[0].icon === null,
    "new records default to showInToolbar:false / icon:null (unpinned, no icon)");

  // "Add to library…" is DISABLED (the toolbar is static) when the selected node
  // is a plain file, not a filter — a file/folder has nothing to serialize
  // into a preset, same guard openFilterLibrarySaveDialog's own caller
  // (saveFilterToLibrary) applies.
  T.state.multiSelect = new Set([f.id]);
  T.state.activeId = f.id;
  w.render();
  ({ actions } = w.describeSidebarToolbarActions());
  assert(actions.find(a => a.action === "addToLibrary").disabled === true, "'Add to library…' is disabled for a plain file selection");

  // Blank name is a no-op (dialog stays open, nothing saved)
  T.state.multiSelect = new Set([textNode.id]);
  T.state.activeId = textNode.id;
  w.render();
  w.handleSidebarToolbarActionClick("addToLibrary");
  d.querySelector("#filterLibraryNameInput").value = "   ";
  fireClick(d.querySelector("#filterLibrarySaveConfirm"), w);
  assert(!d.querySelector("#filterLibrarySaveDialog").classList.contains("hidden"), "a blank/whitespace-only name does not save or close the dialog");
}, { indexedDB: new IDBFactory() });

await withApp(async (w, d, T) => {
  section("59b. Apply from library onto a DIFFERENT file (one click, file-agnostic) + delete");

  const fa = await w.addFile("a.log", makeLog(0, 20), () => {});
  w.render();
  const textNode = w.createFilterNode(fa.id, "text", "message 1");
  w.render();
  // saveFilterToLibrary now always awaits the general export-scope prompt
  // first — click "Just this filter" once it's up.
  const savePromise59b = w.saveFilterToLibrary(textNode.id, "reusable text filter");
  await new Promise(r => setTimeout(r, 0));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await savePromise59b;

  const fb = await w.addFile("b.log", makeLog(0, 20, { msgPrefix: "message" }), () => {});
  w.render();

  // Select the SECOND file (never touched by the save above) and apply through the Library ▾ menu.
  T.state.activeId = fb.id; T.state.multiSelect = new Set([fb.id]); w.render();
  fireContextMenu(d.querySelector('.tree-row[data-node-id="' + fb.id + '"]'), w);
  assert(![...d.querySelectorAll("#treeContextMenu [data-action]")].some(el => el.dataset.action === "applyFromLibrary"),
    "the old 'Apply from library…' context-menu entry is gone (the Library ▾ menu replaced it)");
  w.closeTreeContextMenu();
  fireClick(d.querySelector("#btnLibrary"), w);
  assert(!d.querySelector("#libraryMenu").classList.contains("hidden"), "the Library ▾ menu opens");
  await waitFor(() => d.querySelectorAll("#libraryMenuList .lib-it").length === 1);
  const rows = [...d.querySelectorAll("#libraryMenuList .lib-it")];
  assert(rows[0].querySelector(".n").textContent === "reusable text filter", "the saved preset is listed");

  const before = fb.children.length;
  fireClick(rows[0], w);
  assert(d.querySelector("#libraryMenu").classList.contains("hidden"), "clicking a preset row closes the menu");
  assert(fb.children.length === before + 1, "a fresh copy of the filter is created directly under the target file");
  const appliedNode = T.state.nodes[fb.children[fb.children.length - 1]];
  assert(appliedNode.filterType === "text" && appliedNode.value === "message 1", "applied node carries the same filter definition");
  assert(appliedNode.id !== textNode.id, "it's a NEW node (fresh uid), not the original");
  // "message 1" matches entries 1, 10..19 in file b's own data (re-evaluated
  // against ITS entries, not a replayed result from file a).
  assert(w.getEntries(appliedNode.id).length === 11, "re-evaluates against the target file's OWN data, got " + w.getEntries(appliedNode.id).length);

  // --- Delete from the library (manage dialog; immediate, Undo in the toast) ---
  fireClick(d.querySelector("#btnLibrary"), w);
  fireClick(d.querySelector("#libraryMenuManage"), w);
  await waitFor(() => !!d.querySelector("#filterLibraryList .lib-del"));
  const delBtn = d.querySelector("#filterLibraryList .lib-del");
  fireClick(delBtn, w);
  await waitFor(() => !!d.querySelector("#filterLibraryList .filter-library-empty"));
  assert(d.querySelector("#filterLibraryList .filter-library-empty"), "list re-renders empty after deleting the only entry");
  const remaining = await w.listFilterLibrary();
  assert(remaining.length === 0, "record actually removed from IndexedDB");
}, { indexedDB: new IDBFactory() });

section("59c. Filter library persists across a simulated reload (separate IndexedDB store from the session cache)");
{
  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeLog(0, 10), () => {});
    w.render();
    const node = w.createFilterNode(f.id, "text", "message [*:int]");
    w.render();
    const savePromise59c = w.saveFilterToLibrary(node.id, "extract preset");
    await new Promise(r => setTimeout(r, 0));
    fireClick(d.querySelector("#exportScopeJustThis"), w);
    await savePromise59c;
    const records = await w.listFilterLibrary();
    assert(records.length === 1 && records[0].roots[0].filterType === "text", "sanity: saved before the simulated reload");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    // Filter library is independent of file/session state — no file needs
    // to be loaded, and no boot-time restore wait is needed, for it to be
    // readable (unlike the session cache's own restoreSessionFromCache).
    const records = await w.listFilterLibrary();
    assert(records.length === 1 && records[0].name === "extract preset", "library record survives across the simulated reload");
  }, { indexedDB: factory });
}
