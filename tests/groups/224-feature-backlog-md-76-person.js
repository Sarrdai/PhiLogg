// GROUP 224 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 224 — FEATURE_BACKLOG.md #76 (person-reported): creating a note on a
   log entry now auto-enables the "Show Notes" toggle (.toggle-notes) when it
   was off, so the just-created note is actually visible instead of silently
   sitting hidden. setNoteAndRepaint only turns the toggle ON when a note ends
   up non-empty; it never turns it back OFF on delete, and never touches it
   when it's already on.
   ============================================================ */
group(224);
await withApp(async (w, d, T) => {
  section("224. Creating a note auto-enables Show Notes; deleting one leaves it as-is");
  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();
  const btnNotes = d.querySelector(".toggle-notes");
  assert(T.state.showNotes === false, "sanity: Show Notes off by default");

  // Creating a note while Show Notes is off turns it on, and the note-row
  // is immediately visible without a separate manual toggle click.
  w.setNoteAndRepaint(f.entries[0].id, "hello");
  assert(T.state.showNotes === true, "creating a note auto-enables Show Notes");
  assert(btnNotes.classList.contains("active"), "#btnNotes reflects the auto-enabled state");
  let noteRow = [...d.querySelectorAll("#tableRows .note-row")].find(r => r.dataset.entryId === f.entries[0].id);
  assert(noteRow && noteRow.textContent === "hello", "the just-created note is actually rendered, not hidden behind the toggle");

  // Deleting a note does NOT flip Show Notes back off — that's a separate,
  // person-controlled setting once it's on.
  fireClick(btnNotes, w);
  assert(T.state.showNotes === false, "person manually turns Show Notes back off");
  w.setNoteAndRepaint(f.entries[0].id, "");
  assert(!T.state.notes.has(f.entries[0].id), "sanity: note deleted");
  assert(T.state.showNotes === false, "deleting a note leaves Show Notes exactly as it was (does not toggle it)");

  // Creating a note again while off re-enables it.
  w.setNoteAndRepaint(f.entries[1].id, "second note");
  assert(T.state.showNotes === true, "creating another note while Show Notes is off re-enables it");

  // Editing an existing note while Show Notes is already on is a no-op on the toggle.
  w.setNoteAndRepaint(f.entries[1].id, "second note, edited");
  assert(T.state.showNotes === true, "editing a note while Show Notes is already on leaves it on (idempotent)");

  // The same auto-enable fires through the real UI path (Alt+N -> dialog -> Save), not just the direct API.
  fireClick(btnNotes, w);
  assert(T.state.showNotes === false, "reset: Show Notes off again");
  w.selectEntry(f.entries[2].id);
  fireKeydown(d, w, "n", { altKey: true });
  d.querySelector("#noteDialogInput").value = "via dialog";
  fireClick(d.querySelector("#noteDialogSave"), w);
  assert(T.state.notes.get(f.entries[2].id) === "via dialog", "sanity: note saved via the Alt+N dialog");
  assert(T.state.showNotes === true, "saving a new note through the note dialog also auto-enables Show Notes");
});
