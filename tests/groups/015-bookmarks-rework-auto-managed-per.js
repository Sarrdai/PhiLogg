// GROUP 15 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 15 — Bookmarks rework: auto-managed per-file filter node
   Origin: 7ef2c2a6 (item 3), REPLACED this session (FEATURE_BACKLOG.md
   "Bookmarks rework") — the old Bookmark Manager panel (#btnBookmarks/
   #bookmarksPanel/#bookmarksList/renderBookmarksPanel/openBookmarksPanel)
   is gone entirely; bookmarks are now backed by state.bookmarks (unchanged
   as the source of truth for the row dot/pin feature) PLUS a single
   auto-managed, restricted "Bookmarks" filter node per file
   (syncBookmarksFilterNode). Covers: toggle via keyboard shortcut and
   context menu still work; the node appears the moment the first bookmark
   on a file is set and disappears only once the LAST one is cleared (not
   before); the node actually matches the bookmarked rows; it's excluded
   from the tree's normal drag/delete/reorder operations while its swatch/
   color is still separately settable (moveFilterNodeWithUndo elsewhere
   already covers the delete-blocked path via `locked`); jumpToEntry's
   root-file resolution (works from anywhere, unlike the old jumpToFullLog
   which assumed the current chain) is unaffected.
   ============================================================ */
group(15);
await withApp(async (w, d, T) => {
  section("15. Bookmarks rework");
  const fa = await w.addFile("a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("b.log", makeLog(0, 5, { msgPrefix: "other" }), () => {});
  w.render();
  T.state.activeId = fa.id;
  w.render();

  assert(!d.querySelector("#btnBookmarks"), "the old Bookmark Manager toolbar button is gone");
  assert(!d.querySelector("#bookmarksPanel"), "the old Bookmark Manager panel is gone from the DOM");

  const bookmarksNode = () => fa.children.map(id => T.state.nodes[id]).find(n => n && n.filterType === "bookmarks");

  // Keyboard shortcut "B"
  w.selectEntry(fa.entries[1].id);
  fireKeydown(d, w, "b");
  assert(T.state.bookmarks.has(fa.entries[1].id), "'B' shortcut bookmarks the selected entry");
  assert(bookmarksNode(), "the auto 'Bookmarks' filter node appears under the root the moment the first bookmark is set");
  assert(bookmarksNode().locked === true, "the auto node is marked locked");
  assert(w.getEntries(bookmarksNode().id).map(e => e.id).includes(fa.entries[1].id), "the auto node actually matches the bookmarked row");

  // Icon fix: the auto "Bookmarks" node shows the recovered bookmark/ribbon
  // icon (the old per-row marker's glyph), not the generic fallback clock
  // icon that time-range filter nodes use (changelog.d).
  {
    const bmRow = d.querySelector('.tree-row[data-node-id="' + bookmarksNode().id + '"]');
    const bmIcon = bmRow.querySelector(".tree-icon").innerHTML;
    assert(bmIcon.includes("#i-bookmark-filled"), "the 'Bookmarks' filter node renders the recovered bookmark icon, not a fallback");
    assert(!bmIcon.includes("#i-clock"), "the 'Bookmarks' filter node's icon is NOT the clock icon");

    const timeNode = w.createFilterNode(fa.id, "after", fa.entries[0].ts);
    w.render();
    const timeRow = d.querySelector('.tree-row[data-node-id="' + timeNode.id + '"]');
    const timeIcon = timeRow.querySelector(".tree-icon").innerHTML;
    // Was the generic clock icon before Group 192 (this session, 2026-09-08)
    // gave time filters their own icon per direction/range — see Group 192.
    assert(timeIcon.includes("#i-time-after"), "a time-range filter node shows the \"After\" row-action's arrow-down icon, unaffected by the Bookmarks icon change");
    w.deleteFilterNodeWithUndo(timeNode.id);
  }

  // Context-menu toggle adds a second bookmark — node must persist (not just exist for the first one)
  w.openContextMenu({ clientX: 10, clientY: 10 }, fa.entries[2]);
  assert(d.querySelector("#ctxBookmark").style.display !== "none", "bookmark menu item visible for a real, indexed entry");
  fireClick(d.querySelector("#ctxBookmark"), w);
  assert(T.state.bookmarks.has(fa.entries[2].id), "context-menu 'Bookmark this row' sets the bookmark");
  assert(bookmarksNode(), "node still present with 2 bookmarks");

  // Removing ONE of two bookmarks must NOT remove the node
  fireKeydown(d, w, "b"); // fa.entries[1] was reselected above, still selected — toggles it off
  assert(!T.state.bookmarks.has(fa.entries[1].id), "first bookmark removed");
  assert(bookmarksNode(), "node persists while at least one bookmark remains on this file");

  // Removing the LAST bookmark removes the node
  w.toggleBookmark(fa.entries[2].id);
  assert(!T.state.bookmarks.has(fa.entries[2].id), "last bookmark removed");
  assert(!bookmarksNode(), "the auto node is removed once no bookmark remains on this file");

  // Restricted: not draggable/deletable/reorderable via the normal filter-tree operations API
  w.toggleBookmark(fa.entries[0].id);
  const node = bookmarksNode();
  assert(node, "node re-created for the next check");
  const childrenBefore = fa.children.slice();
  assert(w.deleteFilterNodeWithUndo(node.id) === undefined && T.state.nodes[node.id], "deleteFilterNodeWithUndo is a no-op on a locked node — it survives");
  assert(w.moveFilterNodeWithUndo(node.id, fb.id) === false, "moveFilterNodeWithUndo refuses to move a locked node");
  assert(T.state.nodes[node.id].parentId === fa.id, "locked node's parent is unchanged after the refused move");
  assert(fa.children.join(",") === childrenBefore.join(","), "locked node's position among siblings is unchanged");

  // jumpToEntry: works from a completely different file/filter than the bookmark's own root
  w.toggleBookmark(fa.entries[2].id); // re-bookmark for this check (still real, indexed entries either way)
  T.state.activeId = fb.id;
  w.render();
  w.jumpToEntry(fa.entries[2].id);
  assert(T.state.activeId === fa.id, "jumpToEntry resolves the bookmark's OWN root file, not whatever chain was active");
  assert(T.state.selectedId === fa.entries[2].id, "jumpToEntry selects the bookmarked entry");

  // Bugfix: the node's displayed match count updates live on add/remove,
  // not just its existence (syncBookmarksFilterNode used to only invalidate
  // caches on the add/remove-node transition, leaving a stale count when
  // membership changed but the node itself persisted).
  T.state.activeId = fa.id; w.render();
  // Normalize to a known baseline: fa.entries[0] and [2] are both bookmarked
  // by this point (from the earlier "restricted"/jumpToEntry checks above) —
  // clear entries[0] so exactly one bookmark (entries[2]) remains on fa.
  if (T.state.bookmarks.has(fa.entries[0].id)) w.toggleBookmark(fa.entries[0].id);
  const node2 = bookmarksNode();
  assert(w.getEntries(node2.id).length === 1, "sanity: one bookmark before the live-count check");
  w.toggleBookmark(fa.entries[3].id); // second bookmark on the same file — node persists, membership changes
  assert(bookmarksNode().id === node2.id, "sanity: same node persisted (didn't cross the exists/doesn't-exist threshold)");
  assert(w.getEntries(node2.id).length === 2, "bookmark node's match count updates live when a bookmark is added while the node already existed");
  w.toggleBookmark(fa.entries[3].id);
  assert(w.getEntries(node2.id).length === 1, "bookmark node's match count updates live when a bookmark is removed while the node still exists");

  // Bugfix: removing the last bookmark while its filter node is the active,
  // showing Filtered view falls back to the Full log instead of leaving the
  // Filtered tab pointing at a node that's about to be deleted.
  T.state.activeId = node2.id;
  w.applyFhView("filter");
  w.toggleBookmark(fa.entries[2].id); // removes the LAST bookmark on fa -> node deleted
  assert(!bookmarksNode(), "sanity: node was actually removed");
  assert(T.fhActiveTab === "highlight", "removing the last bookmark while its node was the active, showing Filtered view switches back to Full");

  // Same removal while Stacked layout is active must NOT touch fhLayout —
  // both panels are already visible, nothing needs to change.
  w.toggleBookmark(fa.entries[2].id); // re-add
  T.state.activeId = bookmarksNode().id;
  w.applyFhView("stacked");
  w.toggleBookmark(fa.entries[2].id); // remove the last one again
  assert(T.fhLayout === "stacked", "removing the last bookmark while Stacked layout is active leaves the layout untouched");
});
