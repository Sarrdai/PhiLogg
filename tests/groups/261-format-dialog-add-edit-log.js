// GROUP 261 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 261 — Format dialog (Add/Edit log format, by example)
   Origin: this session. The one dialog a format is defined in, on top of
   Settings: example lines are pasted/dropped/opened and immediately get an
   automatic suggestion (suggested marks + preview); a column is picked and
   its value selected inside example lines to correct it, or the regex is
   edited directly; a Regex-mode regex (plus the timestamp format) is
   derived from all marks (deriveFormatRegexFromMarks) and previewed live —
   as suggested marks on unmarked lines and as a log-view-shaped table
   whose level badges follow the (auto-filled) level list. Marked lines are
   the only learning input; a line with only suggested marks adopts them
   when first marked by hand. Save writes the format (Regex mode), an
   optional filename rule, and the examples + marks as fmt.sampleSetup so a
   later Edit reopens where it was left.
   ============================================================ */
group(261);
const FWZ_SAMPLE = [
  "2026-09-23 10:00:01.123 ERROR [main] req=abc123 Verbindung fehlgeschlagen",
  "java.io.IOException: timeout",
  "    at com.foo.Net.connect(Net.java:42)",
  "2026-09-23 10:00:02.456 INFO  [worker-1] req=def456 Neuer Versuch",
  "2026-09-23 10:00:03.789 WARN  [main] req=ghi789 Langsam: 1200ms",
];
// Selects [start, end) of one rendered wizard example line and fires the
// mouseup the wizard listens for — the same path a real mouse selection
// takes (Selection API -> offsets across the line's text nodes/mark spans).
function fwzSelectInLine(w, d, lineIdx, start, end) {
  const textEl = d.querySelector('#fwzSample .fwz-line[data-line="' + lineIdx + '"] .fwz-line-text');
  const walker = d.createTreeWalker(textEl, w.NodeFilter.SHOW_TEXT);
  const range = d.createRange();
  let pos = 0, n, startSet = false;
  while ((n = walker.nextNode())) {
    const len = n.textContent.length;
    if (!startSet && start <= pos + len) { range.setStart(n, start - pos); startSet = true; }
    if (end <= pos + len) { range.setEnd(n, end - pos); break; }
    pos += len;
  }
  const sel = w.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  d.querySelector("#fwzSample").dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
}

await withApp(async (w, d, T) => {
  section("261a. deriveFormatRegexFromMarks / detectTsFormatFromValues / fwzLabelToKey: the pure derivation");

  assert(w.detectTsFormatFromValues(["2026-09-23 10:00:01.123", "2026-09-23 10:00:02.4"]) === "yyyy-MM-dd HH:mm:ss.SSS",
    "ISO-ish date + time with a '.' fraction is detected, fraction length may vary");
  assert(w.detectTsFormatFromValues(["2026-09-23T10:00:01,123"]) === "yyyy-MM-ddTHH:mm:ss,SSS", "a 'T' separator and ',' fraction round-trip literally");
  assert(w.detectTsFormatFromValues(["23.09.2026 10:00:01"]) === "dd.MM.yyyy HH:mm:ss", "a dotted day-first date is dd.MM.yyyy");
  assert(w.detectTsFormatFromValues(["09/23/2026 10:00:01"]) === "MM/dd/yyyy HH:mm:ss", "a slashed date is month-first unless a first part is > 12");
  assert(w.detectTsFormatFromValues(["23/09/2026 10:00:01"]) === "dd/MM/yyyy HH:mm:ss", "...and day-first when one is > 12");
  assert(w.detectTsFormatFromValues(["10:00:01.123"]) === "HH:mm:ss.SSS", "a time-only value works too");
  assert(w.detectTsFormatFromValues(["2026-09-23T10:00:01.123+02:00"]) === "", "a timezone suffix isn't expressible -> '' (free-form Date.parse fallback)");
  assert(w.detectTsFormatFromValues(["Sep 23 10:00:01"]) === "", "month names aren't expressible -> ''");

  assert(w.fwzLabelToKey("Request Id", new Set()) === "requestId", "a title becomes a camelCase capture name");
  assert(w.fwzLabelToKey("Größe", new Set()) === "groesse", "umlauts are transliterated to ASCII (formatCapturedGroupNames is ASCII-only)");
  assert(w.fwzLabelToKey("Message", new Set()) === "message2", "a reserved field name is never produced");
  assert(w.fwzLabelToKey("Request Id", new Set(["requestId"])) === "requestId2", "...nor a key already taken");
  assert(w.fwzLabelToKey("123", new Set()) === "col123", "a key never starts with a digit");

  // One fully marked line is enough to generalize to the others.
  const marks = [
    { line: 0, start: 0, end: 23, key: "ts" },
    { line: 0, start: 24, end: 29, key: "level" },
    { line: 0, start: 31, end: 35, key: "thread" },
    { line: 0, start: 41, end: 47, key: "requestId" },
  ];
  const r = w.deriveFormatRegexFromMarks(FWZ_SAMPLE, marks, {});
  assert(r.source && !r.error, "a regex is derived from one marked line, got " + r.source + " / " + r.error);
  assert(r.tsFormat === "yyyy-MM-dd HH:mm:ss.SSS", "the timestamp format is detected from the marked Time value");
  assert(r.keys.join(",") === "ts,level,thread,requestId", "keys lists the marked columns in line order");
  assert(!r.warnings.length, "the regex re-splits the learning line exactly as marked (no self-check warning)");
  const re = new RegExp(r.source);
  const g3 = re.exec(FWZ_SAMPLE[3]).groups;
  assert(g3.level === "INFO" && g3.thread === "worker-1" && g3.requestId === "def456" && g3.message === "Neuer Versuch",
    "the derived regex generalizes to an unmarked line: space padding ('INFO  ') and a thread with '-' in it — got " + JSON.stringify(g3));
  assert(!re.test(FWZ_SAMPLE[1]) && !re.test(FWZ_SAMPLE[2]), "continuation (stack-trace) lines don't match, so they stay part of the previous entry");
  assert(re.exec(FWZ_SAMPLE[0]).groups.message === "Verbindung fehlgeschlagen", "with Message unmarked, the rest of the line after the last column (minus the separator) is the message");

  const withTs = w.deriveFormatRegexFromMarks(FWZ_SAMPLE, marks, { tsFormat: "yyyy-MM-dd HH:mm:ss" });
  assert(withTs.tsFormat === "yyyy-MM-dd HH:mm:ss", "a person-supplied timestamp format overrides detection");

  // Inconsistent example lines are reported, not silently merged.
  const bad = w.deriveFormatRegexFromMarks(FWZ_SAMPLE, marks.concat([{ line: 3, start: 0, end: 23, key: "ts" }]), { labels: { requestId: "Request Id" } });
  assert(!bad.source && bad.error.includes("Line 4") && bad.error.includes("Request Id"),
    "a line marking a different column set is an error naming both lines (and column titles), got: " + bad.error);

  // Message marked on some lines only: tolerated, the tail rule covers it.
  const someMsg = w.deriveFormatRegexFromMarks(FWZ_SAMPLE, marks.concat([
    { line: 0, start: 48, end: FWZ_SAMPLE[0].length, key: "message" },
    { line: 4, start: 0, end: 23, key: "ts" }, { line: 4, start: 24, end: 28, key: "level" },
    { line: 4, start: 31, end: 35, key: "thread" }, { line: 4, start: 41, end: 47, key: "requestId" },
  ]), {});
  assert(someMsg.source && !someMsg.error, "Message marked on only some learning lines is tolerated (dropped in favor of the tail rule)");

  const noMarks = w.deriveFormatRegexFromMarks(FWZ_SAMPLE, [], {});
  assert(noMarks.source === null && !noMarks.error, "no marks -> nothing derived, no error");

  const preview = w.fwzParsePreview(["orphan line"].concat(FWZ_SAMPLE), r.source, r.tsFormat);
  assert(preview.length === 4 && preview[0].unmatched === "orphan line", "the table preview reports lines before the first entry as unmatched");
  assert(preview[1].message === "Verbindung fehlgeschlagen\njava.io.IOException: timeout\n    at com.foo.Net.connect(Net.java:42)",
    "continuation lines are appended to the previous entry's message, like parseLogTextAsync");
  assert(!isNaN(preview[1].ts) && preview[1].fields.requestId === "abc123", "entries carry a parsed timestamp and the custom column's value");
});

await withApp(async (w, d, T) => {
  section("261b. Format dialog: paste, add a column, mark by selection (correcting the automatic suggestion), suggestion adoption, save, reopen");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);
  d.querySelector("#formatEditName").value = "Wizard format";
  const dlg = d.querySelector("#formatDialog");
  assert(isVisible(dlg, w), "Add format opens the format dialog");
  assert(isVisible(d.querySelector("#settingsDialog"), w), "...on top of Settings, which stays open");

  fwzPaste(w, d, FWZ_SAMPLE.join("\r\n") + "\r\n\r\n");
  assert(T.fwz.lines.length === 5, "pasted text becomes example lines (CRLF handled, blank lines dropped), got " + T.fwz.lines.length);
  assert(d.querySelectorAll("#fwzSample .fwz-line").length === 5, "...and each renders as its own line");
  const colKeys = () => [...d.querySelectorAll("#fwzColumns .fwz-col-row")].map(r => r.dataset.col).join(",");
  assert(colKeys() === "ts,level,thread,location,method,message", "the column list: Time, Level, the default middle columns, Message — got " + colKeys());

  // Remove Location/Method, add a custom column.
  const colDel = key => d.querySelector('#fwzColumns .fwz-col-row[data-col="' + key + '"] .filter-library-row-del');
  fireClick(colDel("location"), w);
  fireClick(colDel("method"), w);
  d.querySelector("#fwzColumnLabelNew").value = "Request Id";
  fireClick(d.querySelector("#fwzColumnAddBtn"), w);
  assert(colKeys() === "ts,level,thread,requestId,message", "a new custom column is added before Message, got " + colKeys());
  assert(T.fwz.activeKey === "requestId", "...and becomes the active column");
  assert(!colDel("ts") && !colDel("message"), "Time/Level/Message are fixed (not removable)");

  // Mark line 1 by selection, one column at a time. The first mark adopts
  // the automatic suggestion's marks on that line; the following ones
  // correct it (Thread instead of the suggested bracketed Method, Request
  // Id carved out of the suggested Message tail).
  const pick = key => fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="' + key + '"]'), w);
  pick("ts"); fwzSelectInLine(w, d, 0, 0, 23);
  pick("level"); fwzSelectInLine(w, d, 0, 24, 30); // includes the trailing space: trimmed
  pick("thread"); fwzSelectInLine(w, d, 0, 31, 35);
  pick("requestId"); fwzSelectInLine(w, d, 0, 41, 47);
  const lvl = T.fwz.marks.find(m => m.line === 0 && m.key === "level");
  assert(lvl && lvl.start === 24 && lvl.end === 29, "a selection is trimmed of surrounding whitespace, got " + JSON.stringify(lvl));
  assert(T.fwz.marks.length === 4, "four marks on line 1");
  assert(d.querySelectorAll('#fwzSample .fwz-line[data-line="0"] .fwz-mark:not(.fwz-suggested)').length === 4, "...rendered as solid marks");
  assert(d.querySelector("#formatEditRegex").value.includes("(?<requestId>"), "the derived regex is shown, with the custom column's group");
  assert(d.querySelector("#formatEditTsFormat").value === "yyyy-MM-dd HH:mm:ss.SSS", "the timestamp format field is filled from detection");
  assert(d.querySelectorAll('#fwzSample .fwz-line[data-line="3"] .fwz-mark.fwz-suggested').length === 5,
    "an unmarked line matching the derived regex shows suggested marks (incl. the tail Message)");
  const contMarks = [1, 2].map(i => [...d.querySelectorAll('#fwzSample .fwz-line[data-line="' + i + '"] .fwz-mark')]);
  assert(contMarks.every(ms => ms.length === 1 && ms[0].dataset.col === "message" && ms[0].classList.contains("fwz-continuation")),
    "a continuation (stack-trace) line shows one Message mark across the line — it belongs to the previous entry's message");
  assert(contMarks[1][0].textContent === FWZ_SAMPLE[2] && contMarks[1][0].title.includes("line 1"), "...covering the whole line, titled with the entry it continues");
  assert(contMarks[0][0].classList.contains("fwz-suggested"), "...and it's not a hand mark (not removable, not a learning line)");

  // Preview table: 3 entries, the stack trace inside the first one's message.
  const rows = [...d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)")];
  const head = [...d.querySelectorAll("#fwzPreview .fwz-prev-head span")].map(s => s.textContent).join(",");
  assert(head === "Time,Level,Thread,Request Id,Message", "the preview's header is shaped like the log view, got " + head);
  assert(rows.length === 3, "the preview shows 3 entries (continuation lines folded in), got " + rows.length);
  assert(rows[0].querySelector(".fwz-prev-msg").textContent.includes("java.io.IOException"), "...the stack trace sits in the first entry's message");
  const badge1 = rows[1].querySelector(".level-badge");
  assert(badge1.textContent === "INFO" && badge1.dataset.level === "INFO" && badge1.style.color === "var(--level-info)",
    "level badges resolve against the dialog's level list and are colored like the log view");

  // Correcting one column on a suggested line adopts that line's other suggestions.
  pick("thread"); fwzSelectInLine(w, d, 3, 31, 39);
  const l3 = T.fwz.marks.filter(m => m.line === 3).map(m => m.key).sort().join(",");
  assert(l3 === "level,requestId,thread,ts", "marking a suggested line adopts its other suggestions (Message excluded — tail rule), got " + l3);
  assert(!T.fwz.derived.error, "...so the two learning lines stay consistent");

  // A plain click on a solid mark removes it.
  fwzSelectInLine(w, d, 0, 0, 0); // collapse the selection
  w.getSelection().removeAllRanges();
  d.querySelector('#fwzSample .fwz-line[data-line="3"] .fwz-mark[data-col="thread"]').dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true }));
  assert(!T.fwz.marks.some(m => m.line === 3 && m.key === "thread"), "clicking a mark removes it");
  assert(T.fwz.derived.error.includes("Line 4"), "...which now makes line 4 inconsistent — reported by name");
  fireClick(d.querySelector("#formatEditSave"), w);
  assert(isVisible(d.querySelector("#formatEditError"), w) && d.querySelector("#formatEditError").textContent.includes("Line 4"),
    "...and Save is refused with that same reason while the marks are inconsistent");
  fireClick(d.querySelector('#fwzSample .fwz-line[data-line="3"] .fwz-line-clear'), w);
  assert(!T.fwz.marks.some(m => m.line === 3) && !T.fwz.derived.error, "a line's ✕ clears all its marks, back to consistent");

  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.some(f => f.name === "Wizard format"));
  const saved = T.state.logFormats.find(f => f.name === "Wizard format");
  assert(saved.mode === "regex" && saved.regex.includes("(?<requestId>"), "the saved format is a Regex-mode format with the derived regex");
  assert(saved.columnDefs.map(c => c.key + ":" + c.label).join(",") === "thread:Thread,requestId:Request Id", "...with the dialog's (marked) columns and titles");
  assert(saved.tsFormat === "yyyy-MM-dd HH:mm:ss.SSS", "...the detected timestamp format");
  assert(saved.levels.map(l => l.name).join(",") === "ERROR,WARN,INFO,DEBUG", "...the levels auto-filled from the examples (all four defaults, ERROR/INFO seen)");
  assert(saved.sampleSetup && saved.sampleSetup.lines.length === 5 && saved.sampleSetup.marks.length === 4, "...and the examples + marks stored as sampleSetup");

  // Reopen: the dialog picks up where it was left.
  w.openFormatEditDialog(saved.id);
  assert(T.fwz.lines.length === 5 && T.fwz.marks.length === 4, "reopening the dialog for a saved format restores its examples + marks");
  assert(colKeys() === "ts,level,thread,requestId,message", "...and its columns, got " + colKeys());
  assert(T.fwz.derived.source === saved.regex, "...and re-derives the same regex");

  // Esc closes only the dialog.
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(!isVisible(dlg, w) && isVisible(d.querySelector("#settingsDialog"), w), "Esc closes the format dialog but leaves Settings open");
});

await withApp(async (w, d, T) => {
  section("261c. Format dialog: an existing format pre-marks pasted lines; a dropped file becomes examples instead of loading; Save needs Time+Level");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  w.openFormatEditDialog("fmt-default");
  const line = '2024-01-15 10:00:00,123\tINFO\t"main"\tC:\\src\\App.cs\tline 12\t[Startup]\t"Application started"';
  fwzPaste(w, d, line);
  const sugg = [...d.querySelectorAll('#fwzSample .fwz-line[data-line="0"] .fwz-mark.fwz-suggested')].map(s => s.dataset.col).join(",");
  assert(sugg === "ts,level,thread,location,method,message", "with no marks yet, the format's current pattern pre-marks a pasted line, got " + sugg);
  assert(T.fwz.fallbackKind === "format", "...its own regex, not a fresh suggestion, since it still matches the examples");
  assert(d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)").length === 1, "...and previews it");
  assert(!/\(\\d\{4\}\)/.test(d.querySelector("#formatEditRegex").value), "the pattern's compiled regex is shown without unnamed date-part groups");

  fwzSelectInLine(w, d, 0, 0, 23);
  const keysNow = T.fwz.marks.map(m => m.key).sort().join(",");
  assert(keysNow === "level,location,message,method,thread,ts","marking a pre-marked line adopts all its suggestions first, got " + keysNow);
  fireClick(d.querySelector("#fwzClearMarks"), w);
  assert(T.fwz.marks.length === 0 && T.fwz.lines.length === 1, "Clear marks keeps the lines");
  fireClick(d.querySelector("#fwzClearAll"), w);
  assert(T.fwz.lines.length === 0 && d.querySelector("#fwzSample .fwz-empty"), "Clear all empties the examples and shows the paste/drop hint");

  // A dropped file becomes example lines; nothing is loaded into the tree.
  const rootsBefore = T.state.rootIds.length;
  const file = new w.File(["2026-01-01 00:00:00 DEBUG hello\n2026-01-01 00:00:01 INFO world\n"], "x-2026-01-01.log");
  const drop = new w.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", { value: { files: [file], items: [], types: ["Files"] } });
  w.dispatchEvent(drop);
  await waitFor(() => T.fwz.lines.length === 2);
  assert(T.fwz.lines.length === 2, "a file dropped while the wizard is open becomes example lines");
  assert(T.state.rootIds.length === rootsBefore, "...and is NOT loaded into the tree");
  assert(d.querySelector("#formatEditRuleGlob").value === "x-*.log", "...and pre-fills the filename rule field from its name, got " + d.querySelector("#formatEditRuleGlob").value);
  // Hand marks override the suggestion: Time alone, no Level.
  d.querySelector('#fwzColumns .fwz-col-row[data-col="ts"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  d.querySelector("#formatEditRegex").value = ""; // no stand-in regex, so the first mark adopts nothing
  fireInput(d.querySelector("#formatEditRegex"), w);
  fwzSelectInLine(w, d, 0, 0, 19);
  assert(d.querySelector("#fwzStatus").textContent.includes("Level is required"), "with Time but no Level marked, the status line says what's missing");
  fireClick(d.querySelector("#formatEditSave"), w);
  assert(isVisible(d.querySelector("#formatEditError"), w) && d.querySelector("#formatEditError").textContent.includes("Level is required"), "...and Save refuses with the same reason");
  fireClick(d.querySelector("#formatEditCancel"), w);
  assert(!isVisible(d.querySelector("#formatDialog"), w), "Cancel closes the dialog");
  const def = T.state.logFormats.find(f => f.id === "fmt-default");
  assert(!def.edited && def.mode === "pattern" && !def.sampleSetup, "...without touching the stored format");
  assert(!T.state.formatRules.length, "...and without adding the pre-filled rule");
});

await withApp(async (w, d, T) => {
  section("261d. Format dialog: undo/redo of marks/columns/lines (buttons + Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z); preview double-click reveals the source line");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);
  const undoBtn = d.querySelector("#fwzUndo"), redoBtn = d.querySelector("#fwzRedo");
  assert(undoBtn.disabled && redoBtn.disabled, "Undo/Redo start disabled — nothing to undo yet");

  fwzPaste(w, d, FWZ_SAMPLE.join("\n"));
  // An emptied Regex field means no stand-in regex at all — so the marks
  // below start from nothing instead of adopting the automatic suggestion.
  d.querySelector("#formatEditRegex").value = "";
  fireInput(d.querySelector("#formatEditRegex"), w);
  const pick = key => fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="' + key + '"]'), w);
  pick("ts"); fwzSelectInLine(w, d, 0, 0, 23);
  pick("level"); fwzSelectInLine(w, d, 0, 24, 29);
  pick("thread"); fwzSelectInLine(w, d, 0, 31, 35);
  const keys = () => T.fwz.marks.map(m => m.key).join(",");
  assert(keys() === "ts,level,thread" && !undoBtn.disabled, "three marks made, Undo enabled");

  // A wrong mark replaces a good one (overlap) — Undo brings the good one back.
  pick("level"); fwzSelectInLine(w, d, 0, 31, 35);
  assert(keys() === "ts,level", "a wrong mark over Thread's value replaced the Thread mark, got " + keys());
  fireClick(undoBtn, w);
  assert(keys() === "ts,level,thread" && T.fwz.marks.find(m => m.key === "level").start === 24,
    "Undo restores the previous marks exactly, got " + keys());
  assert(!redoBtn.disabled, "...and enables Redo");
  fireClick(redoBtn, w);
  assert(keys() === "ts,level", "Redo re-applies the undone mark");
  fireClick(undoBtn, w);

  // Keyboard: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, with focus outside text fields.
  d.querySelector("#fwzSample").focus();
  const key = (k, shift) => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, ctrlKey: true, shiftKey: !!shift, bubbles: true, cancelable: true }));
  key("z");
  assert(keys() === "ts,level", "Ctrl+Z undoes the last mark (Thread)");
  key("y");
  assert(keys() === "ts,level,thread", "Ctrl+Y redoes it");
  key("z"); key("z", true);
  assert(keys() === "ts,level,thread", "Ctrl+Shift+Z redoes too");

  // A new action after an undo clears the redo stack.
  key("z");
  pick("thread"); fwzSelectInLine(w, d, 0, 41, 47);
  assert(redoBtn.disabled, "a new mark after Undo clears Redo");

  // Removing a column (and its marks) is undoable too — both come back.
  fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="location"] .filter-library-row-del'), w);
  fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="thread"] .filter-library-row-del'), w);
  assert(!T.fwz.columns.some(c => c.key === "thread") && keys() === "ts,level", "removing Thread drops the column and its mark");
  fireClick(undoBtn, w);
  assert(T.fwz.columns.some(c => c.key === "thread") && keys().includes("thread"), "Undo restores the column and its mark");

  // Clear all is undoable — the examples come back.
  fireClick(d.querySelector("#fwzClearAll"), w);
  assert(T.fwz.lines.length === 0, "Clear all empties everything");
  fireClick(undoBtn, w);
  assert(T.fwz.lines.length === 5 && T.fwz.marks.length === 3, "Undo after Clear all restores lines and marks");

  // Inside a text field, Ctrl+Z stays the field's own (native) undo.
  const before = keys();
  d.querySelector("#fwzColumnLabelNew").focus();
  key("z");
  assert(keys() === before, "Ctrl+Z inside the column-title field doesn't undo wizard marks");
  d.querySelector("#fwzSample").focus();

  // Preview: each row knows its example line; double-click reveals it.
  pick("thread"); fwzSelectInLine(w, d, 0, 31, 35); // Thread back on "main" (it sat on the req value)
  const pv = w.fwzParsePreview(["orphan"].concat(FWZ_SAMPLE), T.fwz.derived.source, "");
  assert(pv[0].srcLine === 0 && pv[1].srcLine === 1 && pv[2].srcLine === 4, "preview entries carry the example line they start at (continuations folded)");
  const row = d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)")[1];
  assert(row.dataset.line === "3", "the second preview row points at example line 4 (index 3), got " + row.dataset.line);
  row.querySelector("span").dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  assert(d.querySelector('#fwzSample .fwz-line[data-line="3"]').classList.contains("fwz-line-flash"),
    "double-clicking a preview row flashes (and scrolls to) its example line");
  assert(d.querySelectorAll("#fwzSample .fwz-line-flash").length === 1, "...only that one");
});

await withApp(async (w, d, T) => {
  section("261e. Format dialog: automatic suggestion, levels auto-filled from the examples (text + integer), level rename/merge, badge → level row");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);

  // The automatic suggestion (suggestPatternFromSample, generalized through
  // the mark derivation) is in place the moment examples arrive.
  fwzPaste(w, d, FWZ_SAMPLE.join("\n") + "\n2026-09-23 10:00:04.000 NOTICE [main] req=x1 audit\n2026-09-23 10:00:05.000 WARNING [main] req=x2 w");
  assert(T.fwz.fallbackKind === "suggestion" && !T.fwz.marks.length, "pasting examples brings an automatic suggestion, no hand marks");
  assert(d.querySelector("#fwzStatus").textContent.includes("Automatic suggestion"), "...announced in the status line");
  const entries = () => [...d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)")];
  assert(entries().length === 5, "the suggestion already splits all five entries — incl. the space-padded 'INFO  [' line — with the stack trace folded in, got " + entries().length);
  assert(d.querySelector("#formatEditTsFormat").value === "yyyy-MM-dd HH:mm:ss.SSS", "...and fills the timestamp format");

  // Text levels: defaults + every fixed level the values cascade to, plus
  // unknown values as custom levels (WARNING cascades to WARN, NOTICE is new).
  const lvlRows = () => [...d.querySelectorAll("#formatEditLevels .format-level-row")].map(r => r.dataset.level + (r.querySelector('input[type="checkbox"]').checked ? "+" : "-")).join(",");
  assert(lvlRows() === "ERROR+,WARN+,INFO+,DEBUG+,NOTICE+,TRACE-", "a new format's level list is filled from the examples, got " + lvlRows());
  const noticeBadge = entries()[3].querySelector(".level-badge");
  assert(noticeBadge.dataset.level === "NOTICE" && noticeBadge.style.color === "var(--level-custom-1)", "the NOTICE badge takes the custom level's color");
  assert(entries()[4].querySelector(".level-badge").dataset.level === "WARN", "WARNING resolves to WARN like levelBucket's cascade");

  // Clicking a badge finds its row in the level list.
  noticeBadge.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert(d.querySelector('#formatEditLevels .format-level-row[data-level="NOTICE"]').classList.contains("fwz-level-flash"), "clicking a level badge flashes that level's row");

  // A hand edit stops the auto-fill (only new values get added from then on).
  const cb = lvl => d.querySelector('#formatEditLevels .format-level-row[data-level="' + lvl + '"] input[type="checkbox"]');
  cb("DEBUG").checked = false; cb("DEBUG").dispatchEvent(new w.Event("change"));
  assert(T.fwz.levelsTouched, "unchecking a level marks the list as hand-edited");
  fwzPaste(w, d, "2026-09-23 10:00:06.000 AUDIT [main] req=x3 a");
  assert(lvlRows() === "ERROR+,WARN+,INFO+,DEBUG-,NOTICE+,TRACE-,AUDIT+", "after a hand edit, a newly seen value is only appended, nothing else changes, got " + lvlRows());
  fireClick(d.querySelector("#formatEditCancel"), w);

  // Integer levels: all-numeric values switch to Integer mode, one level
  // per code, each initially named after its own code.
  fireClick(d.querySelector("#btnAddFormat"), w);
  fwzPaste(w, d, "2026-09-23 10:00:01 3 boom\n2026-09-23 10:00:02 6 ok\n2026-09-23 10:00:03 6 ok2");
  // The plain suggestion has no level here; mark Time + Level by hand.
  const pick = key => fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="' + key + '"]'), w);
  pick("ts"); fwzSelectInLine(w, d, 0, 0, 19);
  pick("level"); fwzSelectInLine(w, d, 0, 20, 21);
  assert(d.querySelector("#formatEditLevelTypeInt").classList.contains("active"), "all-numeric level values switch the list to Integer mode");
  assert(lvlRows().startsWith("3+,6+,"), "one checked level per code, in numeric order, got " + lvlRows());
  const codeInput = lvl => d.querySelector('#formatEditLevels .format-level-row[data-level="' + lvl + '"] .format-level-value');
  const nameInput = lvl => d.querySelector('#formatEditLevels .format-level-row[data-level="' + lvl + '"] .format-level-name-input');
  assert(codeInput("3").value === "3" && nameInput("3").value === "3", "each code's level is named after the code itself (3 -> 3)");

  // Renaming "3" to a fixed name merges into that row, keeping the code.
  nameInput("3").value = "error";
  nameInput("3").dispatchEvent(new w.Event("change"));
  assert(!d.querySelector('#formatEditLevels .format-level-row[data-level="3"]'), "renaming 3 -> error merges the row away...");
  assert(cb("ERROR").checked && codeInput("ERROR").value === "3", "...into the fixed ERROR row, now checked and mapped to code 3");
  assert(entries()[0].querySelector(".level-badge").dataset.level === "ERROR", "the preview's code-3 badge now resolves to ERROR");
  // Renaming "6" to a new name just renames it.
  nameInput("6").value = "Notice";
  nameInput("6").dispatchEvent(new w.Event("change"));
  assert(nameInput("NOTICE") && codeInput("NOTICE").value === "6", "renaming 6 -> Notice renames the row (uppercased), code kept");
  nameInput("NOTICE").value = "error";
  nameInput("NOTICE").dispatchEvent(new w.Event("change"));
  assert(nameInput("NOTICE") && d.querySelector("#formatEditLevelError").textContent.includes("already"), "renaming onto a name already in use is refused");

  d.querySelector("#formatEditName").value = "Sev";
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.some(f => f.name === "Sev"));
  const sev = T.state.logFormats.find(f => f.name === "Sev");
  assert(sev.levelValueType === "int" && sev.levels.map(l => l.name + "=" + l.value).join(",") === "ERROR=3,NOTICE=6",
    "the saved format maps its codes to the renamed levels, got " + sev.levels.map(l => l.name + "=" + l.value).join(","));
  assert(w.levelBucket("3", sev.id) === "ERROR" && w.levelBucket("6", sev.id) === "NOTICE", "...which levelBucket then applies to real entries");
});

await withApp(async (w, d, T) => {
  section("261f. Format dialog: a hand-typed regex (suggested marks, undo, invalid regex), the optional filename rule, and an existing Pattern-mode format saved as Regex");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);
  fwzPaste(w, d, FWZ_SAMPLE.join("\n"));
  const pick = key => fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="' + key + '"]'), w);
  pick("ts"); fwzSelectInLine(w, d, 0, 0, 23);
  const marksBefore = T.fwz.marks.length;
  assert(marksBefore > 0, "sanity: some marks exist before typing a regex");

  // Typing a regex replaces the marks; its groups show as suggested marks.
  const rx = d.querySelector("#formatEditRegex");
  rx.dispatchEvent(new w.Event("focus"));
  rx.value = "^(?<ts>\\S+ \\S+) (?<level>\\w+)\\s+\\[(?<thread>[^\\]]+)\\] req=(?<req>\\S+) (?<message>.*)$";
  fireInput(rx, w);
  rx.value += ""; fireInput(rx, w); // a second keystroke in the same edit session
  assert(T.fwz.marks.length === 0 && T.fwz.fallbackKind === "manual", "a typed regex replaces the marks and becomes the stand-in");
  assert(T.fwz.columns.some(c => c.key === "req" && c.kind === "custom"), "its new custom group (req) is added as a column");
  const sugg = [...d.querySelectorAll('#fwzSample .fwz-line[data-line="3"] .fwz-mark.fwz-suggested')].map(s => s.dataset.col).join(",");
  assert(sugg === "ts,level,thread,req,message", "every matching line shows the typed regex's groups as suggested marks, got " + sugg);
  fireClick(d.querySelector("#fwzUndo"), w);
  assert(T.fwz.marks.length === marksBefore && T.fwz.manualSrc == null, "one Undo reverts the whole typing session — the marks are back");
  fireClick(d.querySelector("#fwzRedo"), w);
  assert(T.fwz.fallbackKind === "manual" && T.fwz.marks.length === 0, "Redo re-applies it");

  // An invalid regex is reported and blocks Save.
  rx.dispatchEvent(new w.Event("focus"));
  rx.value = "^(?<ts>[";
  fireInput(rx, w);
  assert(d.querySelector("#fwzStatus .fwz-error") && d.querySelector("#fwzStatus").textContent.includes("Invalid regex"), "an invalid typed regex shows an error in the status line");
  d.querySelector("#formatEditName").value = "Typed";
  fireClick(d.querySelector("#formatEditSave"), w);
  assert(d.querySelector("#formatEditError").textContent.includes("Invalid regex") && !T.state.logFormats.some(f => f.name === "Typed"), "...and Save refuses it");
  rx.value = "^(?<ts>\\S+ \\S+) (?<level>\\w+)\\s+(?<message>.*)$";
  fireInput(rx, w);

  // The optional rule field adds a rule on save (appended last).
  T.state.formatRules.push({ id: "rule-x", glob: "other-*.log", formatId: "fmt-demo-app", order: 7, createdAt: 0 });
  d.querySelector("#formatEditRuleGlob").value = "typed-*.log";
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.some(f => f.name === "Typed"));
  const typed = T.state.logFormats.find(f => f.name === "Typed");
  const rule = T.state.formatRules.find(r => r.glob === "typed-*.log");
  assert(rule && rule.formatId === typed.id && rule.order === 8, "saving with the rule field filled adds a filename rule for this format, after all existing ones");
  assert(d.querySelector("#formatRuleList").textContent.includes("typed-*.log"), "...shown in Settings' rule list right away");
  assert(w.resolveFormatIdForFilename("typed-1.log") === typed.id, "...and used for matching files");

  // Reopening shows the rules already pointing at this format; saving
  // again with the same glob doesn't duplicate it.
  w.openFormatEditDialog(typed.id);
  assert(d.querySelector("#formatEditRuleInfo").textContent.includes("typed-*.log"), "the dialog lists the rules already using this format");
  d.querySelector("#formatEditRuleGlob").value = "typed-*.log";
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => !isVisible(d.querySelector("#formatDialog"), w));
  assert(T.state.formatRules.filter(r => r.glob === "typed-*.log").length === 1, "the same glob for the same format isn't added twice");

  // An existing Pattern-mode format opens as its compiled regex and saves as Regex mode.
  T.state.logFormats.push({
    id: "fmt-pat", name: "Pattern fmt", mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%m%n', regex: "",
    tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", levels: ["ERROR", "INFO"], builtin: false, edited: false, createdAt: 1,
  });
  w.openFormatEditDialog("fmt-pat");
  assert(d.querySelector("#formatEditRegex").value.startsWith("^(?<ts>(?:\\d{4})"), "a Pattern-mode format opens with its compiled regex in the Regex field");
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.find(f => f.id === "fmt-pat").mode === "regex");
  const pat2 = T.state.logFormats.find(f => f.id === "fmt-pat");
  w.invalidateFormatCompileCache();
  const e = w.getCompiledFormat("fmt-pat").parseHeader('2024-01-15 10:00:00,123\tERROR\t"main"\tboom');
  assert(pat2.regex && pat2.pattern === "" && e.level === "ERROR" && e.thread === "main" && e.message === "boom" && !isNaN(e.ts),
    "saved as Regex mode with the compiled pattern, and still parses its own lines the same way");
});

await withApp(async (w, d, T) => {
  section("261g. Format dialog: editing keeps the format's own regex for new examples (no automatic suggestion); Re-suggest asks first, replaces, and is undoable");
  await waitForFormatConfig(T);
  w.openSettingsDialog();
  T.state.logFormats.push({
    id: "fmt-own", name: "Own", mode: "regex", regex: "^(?<ts>\\S+) (?<level>\\w+) (?<message>.*)$",
    pattern: "", tsFormat: "", levels: ["ERROR", "INFO"], builtin: false, edited: false, createdAt: 1,
  });
  w.openFormatEditDialog("fmt-own");
  const rx = () => d.querySelector("#formatEditRegex").value;
  const ownSrc = "^(?<ts>\\S+) (?<level>\\w+) (?<message>.*)$";
  assert(d.querySelector("#fwzResuggest").disabled, "Re-suggest is disabled while there are no examples");

  // Examples the format's regex doesn't match: it still stays the regex —
  // no silent switch to an automatic suggestion in edit mode.
  fwzPaste(w, d, FWZ_SAMPLE.join("\n"));
  assert(T.fwz.fallbackKind === "format" && rx() === ownSrc, "in edit mode, pasted examples are shown against the format's own regex, got " + T.fwz.fallbackKind + " / " + rx());
  assert(d.querySelector("#fwzStatus").textContent.includes("matches none of the example lines"), "...with a warning when it matches none of them");
  assert(d.querySelector("#formatEditTsFormat").value === "", "...and the format's own timestamp format is left alone");

  // Re-suggest asks first; "Keep current" changes nothing.
  const confirmBar = d.querySelector("#fwzResuggestConfirm");
  assert(!isVisible(confirmBar, w), "no confirmation shown up front");
  fireClick(d.querySelector("#fwzResuggest"), w);
  assert(isVisible(confirmBar, w) && confirmBar.textContent.includes("discards"), "Re-suggest shows a warning that the current settings get discarded");
  fireClick(d.querySelector("#fwzResuggestNo"), w);
  assert(!isVisible(confirmBar, w) && T.fwz.fallbackKind === "format" && rx() === ownSrc, "'Keep current' dismisses it without changing anything");

  // Some hand marks, then Re-suggest for real.
  const pick = key => fireClick(d.querySelector('#fwzColumns .fwz-col-row[data-col="' + key + '"]'), w);
  pick("thread"); fwzSelectInLine(w, d, 0, 31, 35);
  const marksBefore = JSON.stringify(T.fwz.marks);
  assert(T.fwz.marks.length > 0, "sanity: hand marks exist");
  fireClick(d.querySelector("#fwzResuggest"), w);
  fireClick(d.querySelector("#fwzResuggestYes"), w);
  assert(!isVisible(confirmBar, w), "confirming closes the warning");
  assert(T.fwz.marks.length === 0 && T.fwz.fallbackKind === "suggestion", "Re-suggest drops the marks and uses a fresh automatic suggestion, even when editing");
  assert(rx() !== ownSrc && rx().includes("(?<ts>") && d.querySelector("#formatEditTsFormat").value === "yyyy-MM-dd HH:mm:ss.SSS",
    "...with the suggestion's regex and timestamp format");
  assert(d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)").length === 3, "...and the preview follows it");

  // Undo reverts it completely.
  fireClick(d.querySelector("#fwzUndo"), w);
  assert(JSON.stringify(T.fwz.marks) === marksBefore && !T.fwz.forceSuggestion, "one Undo brings back the marks from before Re-suggest");
  assert(d.querySelector("#formatEditTsFormat").value === "", "...and the previous timestamp format");
  fireClick(d.querySelector("#fwzClearMarks"), w);
  assert(T.fwz.fallbackKind === "format" && rx() === ownSrc, "...so without marks, the format's own regex is the stand-in again");
  fireClick(d.querySelector("#formatEditCancel"), w);

  // A new format still gets the automatic suggestion right away.
  fireClick(d.querySelector("#btnAddFormat"), w);
  fwzPaste(w, d, FWZ_SAMPLE.join("\n"));
  assert(T.fwz.fallbackKind === "suggestion" && rx().includes("(?<level>"), "a NEW format gets the automatic suggestion immediately");
});

await withApp(async (w, d, T) => {
  section("261h. Default-format-shaped examples (person-reported): the suggestion claims the path as Location and generalizes; a multi-line quoted message still starts its own entry");
  await waitForFormatConfig(T);
  const L = [
    '2026-07-01 20:06:02,889\tDEBUG\t"(1) "\tC:\\git\\nexis\\Code\\Projects\\Yxlon.Ui.OperatorSettings\\ViewModels\\TestProceduresViewModel.cs\tline 30\t[RefreshTestProcedures]\t"Refreshing test procedures list."',
    '2026-07-01 20:06:02,889\tDEBUG\t"(1) "\tC:\\git\\nexis\\Code\\Projects\\Yxlon.Ui.OperatorSettings\\ViewModels\\TestProceduresViewModel.cs\tline 32\t[SelectedTestProcedure]\t"Setting selected test procedure to \'Evaluate',
    'Evaluate with DirectInspect"',
    '2026-07-01 20:06:02,890\tINFO\t"(12) "\tC:\\git\\nexis\\Code\\Projects\\Yxlon.Ui.TaskControls\\ViewModels\\DetailsEditViewModel.cs\tline 487\t[Other]\t"x"',
  ];

  const sug = w.suggestPatternFromSample(L[0]);
  assert(sug.fields.map(f => f.field).join(",") === "ts,level,thread,location,method,message",
    "the suggestion claims ts/level/thread/LOCATION/method/message on a default-format line, got " + sug.fields.map(f => f.field).join(","));
  assert(sug.pattern.startsWith('%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"'), "...its pattern keeps the path out of the literal text and closes the message's quote, got " + sug.pattern);

  const s = w.fwzSuggestFromLines(L);
  const re = new RegExp(s.regex.source);
  assert(!s.regex.source.includes("TestProceduresViewModel"), "the suggestion regex doesn't pin one line's file path, got " + s.regex.source);
  const prev = w.fwzParsePreview(L, s.regex.source, s.tsFormat);
  assert(prev.length === 3 && prev.every(e => e.unmatched == null), "the suggestion matches all three entries' header lines, got " + prev.length);
  assert(prev[0].thread === "(1)" && prev[0].method === "RefreshTestProcedures" && prev[0].message === "Refreshing test procedures list.",
    "...splitting them like the default format, got " + JSON.stringify([prev[0].thread, prev[0].method, prev[0].message]));
  // The continuation line that closes the quote loses it — the opening
  // quote is literal in the regex (never part of the message), so keeping
  // the closing one would leave the message lopsided.
  assert(prev[1].method === "SelectedTestProcedure" && prev[1].message === "Setting selected test procedure to 'Evaluate\nEvaluate with DirectInspect",
    "a message whose closing quote is on a continuation line starts its own entry, and the closing quote is dropped, got " + JSON.stringify(prev[1].message));
  assert(prev[1].raw.endsWith('DirectInspect"'), "...while the entry's raw text keeps the line verbatim");
  assert(w.messageWrapQuote(s.regex.source) === '"', "the suggestion's regex is recognized as a quote-wrapped message");
  assert(re.test(L[1]), "(the multi-line entry's header line matches)");

  // Hand marks like the person's: Message marked WITH its quotes excluded.
  const l0 = L[0], pos = t => l0.indexOf(t);
  const marks = [
    { line: 0, start: 0, end: 23, key: "ts" }, { line: 0, start: 24, end: 29, key: "level" },
    { line: 0, start: pos("(1) "), end: pos("(1) ") + 4, key: "thread" },
    { line: 0, start: pos("C:"), end: pos("\t[Refresh"), key: "location" },
    { line: 0, start: pos("RefreshTest"), end: pos(']\t"'), key: "method" },
    { line: 0, start: pos("Refreshing"), end: l0.length - 1, key: "message" },
  ];
  const dr = w.deriveFormatRegexFromMarks(L, marks, {});
  assert(dr.source && !dr.error && dr.source.endsWith('(?:")?$'), "text after a marked Message at the line end becomes optional, got " + dr.source);
  const prev2 = w.fwzParsePreview(L, dr.source, dr.tsFormat);
  assert(prev2.length === 3 && prev2[1].method === "SelectedTestProcedure", "with the hand marks, the unterminated multi-line message's line starts its own entry too, got " + prev2.length);
  assert(prev2[0].message === "Refreshing test procedures list.", "...and a normal line's message still excludes the closing quote");
  assert(prev2[1].message.endsWith("DirectInspect"), "...and the multi-line one drops its closing quote too");

  // In the dialog: the continuation line of the quoted multi-line message
  // is marked as Message — without its closing quote.
  w.openSettingsDialog();
  fireClick(d.querySelector("#btnAddFormat"), w);
  fwzPaste(w, d, L.join("\n"));
  const cont = [...d.querySelectorAll('#fwzSample .fwz-line[data-line="2"] .fwz-mark')];
  assert(cont.length === 1 && cont[0].dataset.col === "message" && cont[0].textContent === "Evaluate with DirectInspect",
    "the continuation line's Message mark covers it up to, not including, the closing quote, got " + JSON.stringify(cont.map(c => c.textContent)));
  assert(d.querySelector('#fwzSample .fwz-line[data-line="2"] .fwz-line-text').textContent === L[2], "...the quote itself still shows, unmarked");
  fireClick(d.querySelector("#formatEditCancel"), w);

  // Same in real parsing: main-thread loop (jsdom has no Worker), tailing,
  // and the worker source (sandboxed, like GROUP 165).
  T.state.logFormats.push({
    id: "fmt-261h", name: "Quoted", mode: "regex", regex: dr.source, pattern: "", tsFormat: dr.tsFormat,
    levels: ["ERROR", "WARN", "INFO", "DEBUG"], builtin: false, edited: false, createdAt: 1,
  });
  w.invalidateFormatCompileCache();
  const node = await w.addFile("quoted.log", L.slice(0, 3).join("\n") + "\n", () => {}, "fmt-261h");
  const parsed = node.entries;
  assert(parsed.length === 2 && parsed[1].message === "Setting selected test procedure to 'Evaluate\nEvaluate with DirectInspect",
    "a real parse drops the closing quote of a multi-line message, got " + JSON.stringify(parsed.map(e => e.message)));

  const posted = [];
  const sandboxSelf = {};
  const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
  vm.runInContext(w.buildLogParseWorkerSrc(), ctx);
  sandboxSelf.onmessage({ data: { text: L.join("\n") + "\n", fmt: T.state.logFormats.find(f => f.id === "fmt-261h") } });
  const wEntries = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries);
  assert(wEntries.length === 3 && wEntries[1].message.endsWith("DirectInspect") && wEntries[0].message === "Refreshing test procedures list.",
    "the worker parser does the same, got " + JSON.stringify(wEntries.map(e => e.message)));
});
