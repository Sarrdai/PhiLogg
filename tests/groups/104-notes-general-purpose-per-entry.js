// GROUP 104 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 104 — Notes: general-purpose per-entry notes (FEATURE_BACKLOG.md
   "Bookmarks rework", this session). Covers: Alt+N add/edit; the log-row
   context menu's "Add note"/"Edit note"; double-click an existing note-row
   to edit; a note renders as its own sub-row below its entry (own class,
   no level marker) and in the Entry Detail panel; the Show/Hide Notes
   toggle; state.notes persists through buildCacheMeta (same ordinal-anchor
   scheme as bookmarks, but a fully separate array/store).
   ============================================================ */
group(104);
await withApp(async (w, d, T) => {
  section("104. Notes: add/edit via Alt+N and context menu, rendering, toggle, persistence");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(T.state.showNotes === false, "sanity: notes hidden by default, before any note exists");

  // Alt+N on a selected entry with no note yet -> opens empty, Add-mode dialog
  w.selectEntry(f.entries[1].id);
  fireKeydown(d, w, "n", { altKey: true });
  assert(!d.querySelector("#noteDialog").classList.contains("hidden"), "Alt+N opens the note dialog");
  assert(d.querySelector("#noteDialogTitle").textContent === "Add note", "empty note -> dialog titled 'Add note'");
  assert(d.querySelector("#noteDialogInput").value === "", "dialog starts empty for a new note");
  d.querySelector("#noteDialogInput").value = "line one\nline two";
  fireClick(d.querySelector("#noteDialogSave"), w);
  assert(d.querySelector("#noteDialog").classList.contains("hidden"), "Save closes the dialog");
  assert(T.state.notes.get(f.entries[1].id) === "line one\nline two", "note text saved to state.notes, newlines preserved");
  assert(T.state.showNotes === true, "creating the first note auto-enables Show Notes (FEATURE_BACKLOG.md #76, see Group 224)");

  // Alt+N again on the SAME entry -> now prefilled, Edit-mode dialog (no separate F2 binding)
  fireKeydown(d, w, "n", { altKey: true });
  assert(d.querySelector("#noteDialogTitle").textContent === "Edit note", "existing note -> dialog titled 'Edit note'");
  assert(d.querySelector("#noteDialogInput").value === "line one\nline two", "dialog prefilled with the existing note text");
  fireClick(d.querySelector("#noteDialogCancel"), w);
  assert(T.state.notes.get(f.entries[1].id) === "line one\nline two", "Cancel leaves the note untouched");

  // Context menu: "Add note"/"Edit note" label swap, same pattern as the bookmark item
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[2]);
  assert(d.querySelector("#ctxNoteLabel").textContent === "Add note", "context menu offers 'Add note' for an entry with none");
  fireClick(d.querySelector("#ctxNote"), w);
  d.querySelector("#noteDialogInput").value = "via context menu";
  fireClick(d.querySelector("#noteDialogSave"), w);
  assert(T.state.notes.get(f.entries[2].id) === "via context menu", "context-menu 'Add note' opens the same editor and saves");
  w.openContextMenu({ clientX: 10, clientY: 10 }, f.entries[2]);
  assert(d.querySelector("#ctxNoteLabel").textContent === "Edit note", "context menu now offers 'Edit note' for the same entry");
  w.closeContextMenu();

  // Deleting a note via the dialog's Delete button
  w.openNoteEditor(f.entries[2].id);
  assert(!d.querySelector("#noteDialogDelete").style.display.includes("none"), "Delete button shown when editing an existing note");
  fireClick(d.querySelector("#noteDialogDelete"), w);
  assert(!T.state.notes.has(f.entries[2].id), "Delete button removes the note");

  // Rendering: a note-row appears below its entry's row now that Show Notes
  // was auto-enabled by creating the first note above.
  const btnNotes = d.querySelector(".toggle-notes");
  assert(btnNotes.classList.contains("active"), "#btnNotes already reflects the auto-enabled state");
  let noteRow = [...d.querySelectorAll("#tableRows .note-row")].find(r => r.dataset.entryId === f.entries[1].id);
  assert(noteRow && noteRow.textContent === "line one\nline two", "note-row renders below its entry with the full note text");
  assert(!noteRow.className.includes("row-grid") && !noteRow.querySelector(".col-bar"), "note-row is a plain block, not part of .row-grid, no level marker");

  // Toggling Show/Hide Notes off hides the note-rows again
  fireClick(btnNotes, w);
  assert(T.state.showNotes === false, "clicking #btnNotes again turns notes off");
  assert(d.querySelectorAll("#tableRows .note-row").length === 0, "no note-rows rendered while Show Notes is off");
  fireClick(btnNotes, w); // back on for the rest of this group

  // Double-click an existing note-row opens it for editing
  noteRow = [...d.querySelectorAll("#tableRows .note-row")].find(r => r.dataset.entryId === f.entries[1].id);
  noteRow.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  assert(!d.querySelector("#noteDialog").classList.contains("hidden"), "double-clicking a note-row opens the note editor");
  assert(d.querySelector("#noteDialogInput").value === "line one\nline two", "...prefilled with that row's note");
  w.closeNoteDialog();

  // Entry Detail panel shows the full note text for the selected entry
  w.selectEntry(f.entries[1].id);
  assert(d.querySelector("#detailNote").style.display !== "none" && d.querySelector("#detailNote").textContent === "line one\nline two",
    "Entry Detail panel shows the selected entry's full note");
  w.selectEntry(f.entries[0].id);
  assert(d.querySelector("#detailNote").style.display === "none", "Entry Detail panel hides the note block for an entry with none");

  // Persistence: buildCacheMeta stores notes as { file, ordinal, text }, separately from bookmarks
  const meta = w.buildCacheMeta();
  assert(Array.isArray(meta.notes) && meta.notes.length === 1 && meta.notes[0].ordinal === 1 && meta.notes[0].text === "line one\nline two",
    "buildCacheMeta persists state.notes as ordinal-anchored records, independent of state.bookmarks");
  assert(meta.settings.showNotes === true, "buildCacheMeta persists the Show/Hide Notes toggle");
});
