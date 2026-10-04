// GROUP 155 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 155 — Person-reported (2026-09-02): pasting extracted floats into
   Excel produced garbage because the clipboard TSV always used "." as the
   decimal point regardless of the OS/browser locale. Two fixes:
   1. Ctrl+C / copyTableSelection now re-localize
      numeric cells (via localizeNumericCell/systemDecimalSeparator) to
      whatever Intl reports as the system decimal separator BEFORE writing
      to the clipboard — the on-screen table itself is untouched.
   2. A new right-click "Export as CSV…" menu on the extraction table opens
      a small dialog (delimiter / decimal separator / include headers) and
      saves a real .csv file via buildExtractCsv + saveCsvToFile.
   ============================================================ */
group(155);
await withApp(async (w, d, T) => {
  section("155a. localizeNumericCell / buildExtractCsv: pure formatting logic");

  assert(w.localizeNumericCell("12.5", ",") === "12,5", "a plain float gets its decimal point swapped");
  assert(w.localizeNumericCell("-3.14", ",") === "-3,14", "a negative float is handled too");
  assert(w.localizeNumericCell("12.5", ".") === "12.5", "requesting '.' as separator is a no-op");
  assert(w.localizeNumericCell("main", ",") === "main", "non-numeric text passes through untouched");
  assert(w.localizeNumericCell("42", ",") === "42", "a bare integer (no decimal point) is left alone");
  assert(w.localizeNumericCell("1.2.3", ",") === "1.2.3", "not a single float (e.g. a version string) is left alone");

  assert(w.csvQuoteField("plain", ";") === "plain", "a field with no special characters is left unquoted");
  assert(w.csvQuoteField("a;b", ";") === '"a;b"', "a field containing the delimiter gets quoted");
  assert(w.csvQuoteField('say "hi"', ",") === '"say ""hi"""', "embedded quotes are doubled per RFC4180, and the field itself gets wrapped in quotes");
});

await withApp(async (w, d, T) => {
  section("155b. Ctrl+C / copyTableSelection localizes numeric cells to the (stubbed) system decimal separator");

  const log = [0, 1].map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i} score=${i}.5"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "id=[*:int] score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");
  assert(T.extractRowsData.length === 2, "sanity: extraction produced 2 rows");

  w.systemDecimalSeparator = () => ",";
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };

  w.selectCells(w.allCells());
  w.copyTableSelection();
  assert(copied.includes("0,5") && copied.includes("1,5"), "Ctrl+C path (copyTableSelection) re-localizes float cells to the stubbed comma separator, got " + JSON.stringify(copied));
  assert(!copied.includes("0.5") && !copied.includes("1.5"), "no leftover dot-decimal floats in the copied TSV");

  w.systemDecimalSeparator = () => ".";
  copied = null;
  w.copyTableSelection();
  assert(copied.includes("0.5") && copied.includes("1.5"), "a '.' system separator leaves the TSV as originally captured");
});

await withApp(async (w, d, T) => {
  section("155c. Right-click on the extraction table opens 'Export as CSV…', builds and saves the configured CSV");

  const log = [0, 1].map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"id=${i} score=${i}.5"`).join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "id=[*:int] score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const menu = d.querySelector("#extractContextMenu");
  const body = d.querySelector("#extractBody");
  fireContextMenu(body, w, 100, 100);
  assert(!menu.classList.contains("hidden"), "right-click on the extraction table body opens #extractContextMenu");
  assert(menu.style.left === "100px" && menu.style.top === "100px", "menu is positioned at the click coordinates, got left=" + menu.style.left + " top=" + menu.style.top);

  // Outside click closes it again, same as the other context menus.
  fireClick(d.body, w);
  assert(menu.classList.contains("hidden"), "clicking outside the menu closes it");

  // Re-open, this time exercising the "Export as CSV…" item with a stubbed
  // comma-decimal system locale, which should default delimiter to ";".
  w.systemDecimalSeparator = () => ",";
  fireContextMenu(body, w, 50, 50);
  fireClick(d.querySelector("#ctxExportCsv"), w);
  assert(menu.classList.contains("hidden"), "picking the menu item closes the context menu");
  const dialog = d.querySelector("#csvExportDialog");
  assert(!dialog.classList.contains("hidden"), "'Export as CSV…' opens #csvExportDialog");
  assert(d.querySelector("#csvExportDecimalSelect").value === ",", "decimal separator select defaults to the (stubbed) system separator");
  assert(d.querySelector("#csvExportDelimiterSelect").value === ";", "comma-decimal locale defaults the column delimiter to semicolon (Excel convention)");
  assert(pillChecked(d.querySelector("#csvExportHeadersInput")) === true, "include-headers defaults to on");

  let saved = null;
  w.downloadBlobFallback = (blob, name) => { const e = { name, text: undefined }; saved = e; blob.text().then(t => { e.text = t; }); };
  d.querySelector("#csvExportDelimiterSelect").value = ";";
  d.querySelector("#csvExportDecimalSelect").value = ",";
  fireClick(d.querySelector("#csvExportConfirm"), w);
  await waitFor(() => saved !== null && saved.text !== undefined);
  assert(dialog.classList.contains("hidden"), "Export closes the dialog");
  assert(saved !== null, "Export triggers a file save (fallback download, since jsdom has no showSaveFilePicker)");
  const lines = saved.text.split("\r\n");
  assert(lines[0].split(";").includes("id") && lines[0].split(";").includes("score"), "exported CSV includes the header row with the configured ';' delimiter, got " + JSON.stringify(lines[0]));
  assert(lines.some(l => l.includes("0,5")) && lines.some(l => l.includes("1,5")), "exported CSV floats use the configured ',' decimal separator, got " + JSON.stringify(lines));
  assert(saved.name.endsWith(".csv"), "suggested filename ends in .csv");

  // Cancel must not export.
  fireContextMenu(body, w, 50, 50);
  fireClick(d.querySelector("#ctxExportCsv"), w);
  saved = null;
  fireClick(d.querySelector("#csvExportCancel"), w);
  assert(dialog.classList.contains("hidden"), "Cancel closes the dialog");
  assert(saved === null, "Cancel does not trigger a save");

  // Unchecking "include headers" drops the header line.
  fireContextMenu(body, w, 50, 50);
  fireClick(d.querySelector("#ctxExportCsv"), w);
  setPill(d.querySelector("#csvExportHeadersInput"), false);
  fireClick(d.querySelector("#csvExportConfirm"), w);
  await waitFor(() => saved !== null && saved.text !== undefined);
  const bodyOnlyLines = saved.text.split("\r\n");
  assert(bodyOnlyLines.length === 2, "unchecking 'include header row' exports only the 2 data rows, got " + bodyOnlyLines.length);
});

await withApp(async (w, d, T) => {
  section("155d. Settings -> Behavior -> 'Decimal separator for copy/export' overrides the auto-detected separator");

  const log = `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"score=1.5"\n`;
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  // Auto-detect (stubbed to comma) is used when nothing is stored.
  w.systemDecimalSeparator = () => ",";
  let copied = null;
  w.navigator.clipboard.writeText = text => { copied = text; return Promise.resolve(); };
  w.selectCells(w.allCells());
  w.copyTableSelection();
  assert(copied.includes("1,5"), "with no override stored, copy falls back to the auto-detected (stubbed comma) separator");

  // Explicitly pinning "." via the Settings select overrides the auto-guess.
  const select = d.querySelector("#settingsClipboardDecimalSelect");
  select.value = ".";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.localStorage.getItem("philogg-clipboard-decimal-sep") === ".", "picking 'Point (.)' persists the override to localStorage");
  copied = null;
  w.copyTableSelection();
  assert(copied.includes("1.5") && !copied.includes("1,5"), "with '.' pinned, copy ignores the (stubbed comma) auto-detection, got " + JSON.stringify(copied));

  // Switching back to "Auto" clears the override again.
  select.value = "auto";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(w.localStorage.getItem("philogg-clipboard-decimal-sep") === null, "picking 'Auto' removes the stored override");
  copied = null;
  w.copyTableSelection();
  assert(copied.includes("1,5"), "back to Auto, the stubbed system separator applies again");

  // A stored override also seeds the CSV export dialog's default.
  select.value = ",";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  w.systemDecimalSeparator = () => "."; // deliberately mismatched, to prove the override (not auto-detect) wins
  const body = d.querySelector("#extractBody");
  fireContextMenu(body, w, 50, 50);
  fireClick(d.querySelector("#ctxExportCsv"), w);
  assert(d.querySelector("#csvExportDecimalSelect").value === ",", "CSV export dialog defaults from the stored override, not the (mismatched) auto-detected separator");
  w.closeCsvExportDialog();
});

await withApp(async (w, d, T) => {
  section("155e. Ctrl+C also writes an HTML clipboard flavor with Excel's x:num on numeric cells (Chromium ClipboardItem path)");

  // Person-reported follow-up: even sending Excel's OWN confirmed decimal
  // separator still pasted wrong, because Excel's plain-text paste applies
  // its own unqueryable heuristics on top. x:num sidesteps that: Excel
  // reads the literal (always period-decimal) value from the attribute,
  // with no locale interpretation at all, then displays it in its own
  // locale — so it must NOT go through localizeNumericCell.
  const log = `2024-01-15 10:00:00,000\tINFO\t"main"\tC:\\src\\Foo.cs\tline 0\t[DoWork]\t"score=27.7120"\n`;
  const f = await w.addFile("a.log", log, () => {});
  T.state.activeId = f.id;
  w.render();
  const node = w.createFilterNode(f.id, "text", "score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  let written = null;
  w.ClipboardItem = function (items) { this.items = items; };
  w.navigator.clipboard.write = items => { written = items[0].items; return Promise.resolve(); };
  w.systemDecimalSeparator = () => ",";

  w.selectCells(w.allCells());
  w.copyTableSelection();
  assert(written, "copyTableSelection uses the ClipboardItem/clipboard.write path when it's available, instead of writeText");

  const html = await written["text/html"].text();
  assert(html.includes('x:num="27.7120"'), "the numeric cell's x:num carries the RAW, invariant (period-decimal) value regardless of the chosen/detected decimal separator, got " + html);
  assert(html.includes(">27,7120<"), "the visible <td> text still uses the localized (comma) value, for apps that read text/html but ignore x:num, got " + html);
  assert(html.includes("urn:schemas-microsoft-com:office:excel"), "the Excel MSO namespace is present, required for x:num to be honored");

  const text = await written["text/plain"].text();
  assert(text.includes("27,7120"), "the text/plain flavor (fallback for anything ignoring text/html) still carries the localized TSV, got " + JSON.stringify(text));

  // Falls back to the old writeText-only path when ClipboardItem is unavailable.
  delete w.ClipboardItem;
  let plainCopied = null;
  w.navigator.clipboard.writeText = t => { plainCopied = t; return Promise.resolve(); };
  written = null;
  w.copyTableSelection();
  assert(written === null && plainCopied && plainCopied.includes("27,7120"), "without ClipboardItem, copy falls back cleanly to the plain writeText path");
});
