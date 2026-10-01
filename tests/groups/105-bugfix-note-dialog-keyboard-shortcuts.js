// GROUP 105 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 105 — Bugfix: Note dialog keyboard shortcuts. Person-requested
   binding (see PROJECT.md): Enter alone saves+closes, Shift+Enter inserts a
   newline (left to native textarea behavior), Delete with an empty textarea
   deletes the note, Escape cancels without saving.
   ============================================================ */
group(105);
await withApp(async (w, d, T) => {
  section("105. Note dialog: Enter saves, Shift+Enter newlines, Delete-when-empty deletes, Escape cancels");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  // Enter alone saves and closes
  w.openNoteEditor(f.entries[0].id);
  const input = d.querySelector("#noteDialogInput");
  input.value = "typed note";
  fireKeydown(input, w, "Enter");
  assert(d.querySelector("#noteDialog").classList.contains("hidden"), "Enter alone closes the dialog");
  assert(T.state.notes.get(f.entries[0].id) === "typed note", "Enter alone saves the note text");

  // Shift+Enter does NOT save/close — it's left to native textarea behavior (newline insertion)
  w.openNoteEditor(f.entries[1].id);
  const input2 = d.querySelector("#noteDialogInput");
  input2.value = "line one";
  fireKeydown(input2, w, "Enter", { shiftKey: true });
  assert(!d.querySelector("#noteDialog").classList.contains("hidden"), "Shift+Enter leaves the dialog open");
  assert(!T.state.notes.has(f.entries[1].id), "Shift+Enter does not save the note");
  w.closeNoteDialog();

  // Delete with an empty textarea deletes the note and closes
  w.openNoteEditor(f.entries[0].id); // already has "typed note" from above
  const input3 = d.querySelector("#noteDialogInput");
  assert(input3.value === "typed note", "sanity: editing the note saved earlier");
  input3.value = "";
  fireKeydown(input3, w, "Delete");
  assert(d.querySelector("#noteDialog").classList.contains("hidden"), "Delete on an empty textarea closes the dialog");
  assert(!T.state.notes.has(f.entries[0].id), "Delete on an empty textarea deletes the note");

  // Delete with non-empty textarea content is NOT intercepted (normal in-field character deletion)
  w.openNoteEditor(f.entries[2].id);
  const input4 = d.querySelector("#noteDialogInput");
  input4.value = "some text";
  fireKeydown(input4, w, "Delete");
  assert(!d.querySelector("#noteDialog").classList.contains("hidden"), "Delete with non-empty textarea does not close the dialog");
  assert(!T.state.notes.has(f.entries[2].id), "Delete with non-empty textarea does not delete the note");
  w.closeNoteDialog();

  // Escape cancels without saving
  w.openNoteEditor(f.entries[3].id);
  const input5 = d.querySelector("#noteDialogInput");
  input5.value = "should not be saved";
  fireKeydown(input5, w, "Escape");
  assert(d.querySelector("#noteDialog").classList.contains("hidden"), "Escape closes the dialog");
  assert(!T.state.notes.has(f.entries[3].id), "Escape does not save the note");
});
