// GROUP 222 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 222 — Sidebar toolbar click must stopPropagation (person-reported:
   "Edit filter…" did nothing)
   ============================================================ */
group(222);
await withApp(async (w, d, T) => {
  section("222. #sidebarToolbar's click listener stopPropagation()s, so opening a dialog/popup from it isn't immediately undone by the document-level 'click outside closes it' listener seeing the same bubbling click");
  // Root cause (person-reported: clicking "Edit filter…" in the sidebar
  // toolbar visibly did nothing): #sidebarToolbar's click listener called
  // handleSidebarToolbarActionClick without ev.stopPropagation() first,
  // unlike the pre-existing [data-row-actions] delegated listener (#viewBar/
  // the per-view toolbars) which already does. The same click that opened
  // #filterPopup then kept bubbling to the document-level listener
  // (`!filterPopup.contains(ev.target) && !filterPopup.classList.contains
  // ("hidden") -> closeFilterPopup()`), which saw a click outside the just-
  // opened popup and closed it again in the same tick — CLAUDE.md's
  // "stopPropagation on any click handler that opens a popup" gotcha,
  // missed for this one new listener. `handleSidebarToolbarActionClick`
  // called directly (as GROUP 220i does) can never catch this class of bug:
  // it never bubbles, so the document-level listener never runs. Only a
  // real, bubbling DOM click (`fireClick`) exercises the full path.
  const f = await w.addFile("a.log", makeLog(0, 20), () => {});
  const textNode = w.createFilterNode(f.id, "text", "message 1");
  T.state.multiSelect = new Set([textNode.id]);
  T.state.activeId = textNode.id;
  w.render();

  const editBtn = d.querySelector('#sidebarToolbar [data-row-action="edit"]');
  assert(editBtn, "sanity: the Edit filter… button is present in the sidebar toolbar for a plain text filter");
  fireClick(editBtn, w);
  const filterPopup = d.querySelector("#filterPopup");
  assert(!filterPopup.classList.contains("hidden"), "a real bubbling click on 'Edit filter…' opens #filterPopup and it STAYS open");
  assert(d.querySelector("#filterInput").value === "message 1", "...pre-filled with the correct node's existing value, i.e. actually editing that node");
  assert(d.querySelector("#filterSubmitBtn").textContent === "Save", "...in edit mode (submit button reads 'Save', not 'Add filter')");
});
