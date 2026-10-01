// GROUP 191 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 191 — "Notes" overview: second auto-managed filter node below
   "Bookmarks" (syncNotesFilterNode). Covers: appears/disappears with the
   note count like Bookmarks does; placed directly after the Bookmarks node
   when one exists, at the top otherwise; matches exactly the entries with a
   note; restricted (locked) like Bookmarks; selecting it force-enables Show
   Notes and leaving it restores whatever Show Notes was set to before.
   ============================================================ */
group(191);
await withApp(async (w, d, T) => {
  section("191. Notes overview: auto-managed 'Notes' filter node");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 5, { msgPrefix: "other" }), () => {});
  T.state.activeId = fa.id;
  w.render();

  const notesNode = () => fa.children.map(id => T.state.nodes[id]).find(n => n && n.filterType === "notes");
  const bookmarksNode = () => fa.children.map(id => T.state.nodes[id]).find(n => n && n.filterType === "bookmarks");

  assert(!notesNode(), "sanity: no 'Notes' node before any note exists");

  // Appears the moment the first note is added, with no bookmark present yet
  // -> unshifted to the top, same top-level placement Bookmarks itself uses.
  w.setNoteAndRepaint(fa.entries[1].id, "first note");
  assert(notesNode(), "the auto 'Notes' filter node appears the moment the first note is set");
  assert(notesNode().locked === true, "the auto 'Notes' node is marked locked");
  assert(fa.children[0] === notesNode().id, "with no Bookmarks node present, 'Notes' sits at the very top");
  assert(w.getEntries(notesNode().id).map(e => e.id).includes(fa.entries[1].id), "the auto 'Notes' node actually matches the noted row");

  // Now bookmark a different entry -> "Notes" must end up directly BELOW
  // "Bookmarks", not above/instead of it.
  w.toggleBookmark(fa.entries[0].id);
  assert(bookmarksNode(), "sanity: Bookmarks node created");
  const bmIdx = fa.children.indexOf(bookmarksNode().id);
  const notesIdx = fa.children.indexOf(notesNode().id);
  assert(bmIdx === 0, "'Bookmarks' takes the top slot");
  assert(notesIdx === bmIdx + 1, "'Notes' sits directly below 'Bookmarks'");

  // Restricted: not draggable/deletable/reorderable via the normal filter-tree operations API
  const node = notesNode();
  const childrenBefore = fa.children.slice();
  assert(w.deleteFilterNodeWithUndo(node.id) === undefined && T.state.nodes[node.id], "deleteFilterNodeWithUndo is a no-op on a locked 'Notes' node — it survives");
  assert(w.moveFilterNodeWithUndo(node.id, fb.id) === false, "moveFilterNodeWithUndo refuses to move a locked 'Notes' node");
  assert(T.state.nodes[node.id].parentId === fa.id, "locked 'Notes' node's parent is unchanged after the refused move");
  assert(fa.children.join(",") === childrenBefore.join(","), "locked 'Notes' node's position among siblings is unchanged");

  // Adding a second note keeps the same node, just extends its match set.
  w.setNoteAndRepaint(fa.entries[2].id, "second note");
  assert(notesNode().id === node.id, "same 'Notes' node persists across a second note");
  assert(w.getEntries(node.id).length === 2, "'Notes' node's match count updates live as notes are added");

  // Removing one of two notes must NOT remove the node.
  w.setNoteAndRepaint(fa.entries[1].id, "");
  assert(!T.state.notes.has(fa.entries[1].id), "first note removed");
  assert(notesNode(), "'Notes' node persists while at least one note remains on this file");
  assert(w.getEntries(notesNode().id).length === 1, "'Notes' node's match count updates live as notes are removed");

  // Removing the LAST note removes the node.
  w.setNoteAndRepaint(fa.entries[2].id, "");
  assert(!T.state.notes.has(fa.entries[2].id), "last note removed");
  assert(!notesNode(), "the auto 'Notes' node is removed once no note remains on this file");

  // Selecting the "Notes" node force-enables Show Notes even if it was off;
  // leaving it restores whatever Show Notes was set to before.
  w.setNoteAndRepaint(fa.entries[3].id, "third note");
  assert(T.state.showNotes === true, "creating a note auto-enables Show Notes (FEATURE_BACKLOG.md #76, see Group 224) — already true here from the very first note set above");
  const btnNotes = d.querySelector(".toggle-notes");
  fireClick(btnNotes, w); // person turns Show Notes back off after seeing the note, to set up the "was off" case below
  T.state.activeId = fa.id;
  assert(T.state.showNotes === false, "sanity: Show Notes is off before standing on the 'Notes' node");
  T.state.activeId = notesNode().id;
  w.render();
  assert(T.state.showNotes === true, "standing on the 'Notes' node force-enables Show Notes");
  T.state.activeId = fa.id;
  w.render();
  assert(T.state.showNotes === false, "leaving the 'Notes' node restores Show Notes to what it was before (off)");

  // Same round trip, but Show Notes was already ON before entering — must
  // stay ON, not get toggled off by mistake, either while active or after leaving.
  fireClick(btnNotes, w);
  assert(T.state.showNotes === true, "sanity: Show Notes turned on manually");
  T.state.activeId = notesNode().id;
  w.render();
  assert(T.state.showNotes === true, "Show Notes stays on while standing on the 'Notes' node if it was already on");
  T.state.activeId = fa.id;
  w.render();
  assert(T.state.showNotes === true, "leaving the 'Notes' node restores Show Notes to what it was before (on)");

  // The auto "Notes" node is excluded from filter-tree persistence, same as Bookmarks.
  const { roots: cacheRoots } = w.serializeFilterTreeForCache(fa);
  assert(!cacheRoots.some(sn => sn.filterType === "notes"), "the auto 'Notes' node is excluded from serializeFilterTreeForCache, same as Bookmarks");
});
