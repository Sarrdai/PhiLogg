// GROUP 172 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 172 — Person-requested (2026-09-04): the "Export as CSV…" dialog
   (extraction table right-click) gets a new "Include full log entry
   column" checkbox, default off, that appends each row's original raw
   log line (r.entry.raw — timestamp, level, thread, everything, not just
   the message text the pattern matched against) as an extra, correctly
   CSV-escaped column.
   ============================================================ */
group(172);
await withApp(async (w, d, T) => {
  section("172a. 'Include full log entry column' checkbox on the CSV export dialog");

  const log = [0, 1].map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i} score=${i}.5"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "id=[*:int] score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const body = d.querySelector("#extractBody");
  fireContextMenu(body, w, 50, 50);
  fireClick(d.querySelector("#ctxExportCsv"), w);
  assert(pillChecked(d.querySelector("#csvExportFullEntryInput")) === false, "the toggle defaults to off");

  let saved = null;
  w.downloadBlobFallback = (blob, name) => { const e = { name, text: undefined }; saved = e; blob.text().then(t => { e.text = t; }); };

  // Left unchecked (default): no extra column.
  fireClick(d.querySelector("#csvExportConfirm"), w);
  await waitFor(() => saved !== null && saved.text !== undefined);
  const noEntryLines = saved.text.split("\r\n");
  assert(!noEntryLines[0].includes("Log entry"), "with the checkbox off (its default), no 'Log entry' column is appended");

  // Checked: appends the entry's full raw line (e.raw — includes the
  // timestamp/level/thread/etc. tab-separated fields, not just the matched
  // message text), quoted since the raw line contains both tabs and '"'
  // (the quoted "main"/"id=0 score=0.5" fields) which need RFC4180 escaping
  // regardless of the configured delimiter.
  fireContextMenu(body, w, 50, 50);
  fireClick(d.querySelector("#ctxExportCsv"), w);
  d.querySelector("#csvExportDelimiterSelect").value = ",";
  setPill(d.querySelector("#csvExportFullEntryInput"), true);
  fireClick(d.querySelector("#csvExportConfirm"), w);
  await waitFor(() => saved !== null && saved.text !== undefined);
  const fullEntryLines = saved.text.split("\r\n");
  assert(fullEntryLines[0].split(",").pop() === "Log entry", "header row gets an appended 'Log entry' column when the checkbox is on, got " + JSON.stringify(fullEntryLines[0]));
  assert(fullEntryLines[1].includes('2024-01-15 10:00:00,000\tINFO\t""main""') && fullEntryLines[1].includes("id=0 score=0.5"), "the appended column carries the entry's full raw line — timestamp, level, thread, everything — not just the matched message, got " + JSON.stringify(fullEntryLines[1]));
});
