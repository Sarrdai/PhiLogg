// GROUP 293 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 293 — Log format JSON export/import: an Export button per
   (non-meta) format writes its definition + mapped filename globs; an
   imported file (central import, GROUP 294) opens the format wizard
   prefilled, with the file's globs as checkboxes; Save creates a NEW
   format plus the checked rules. Any other .json keeps loading as before. */
group(293);
await withApp(async (w, d, T) => {
  section("293. Log format JSON export/import (Export button, drop → prefilled format wizard, pattern choice)");
  await waitForFormatConfig(T);
  const captured = [];
  w.downloadBlobFallback = (blob, name) => { const e = { name, json: null }; captured.push(e); blob.text().then(t => { e.json = t; }); };
  const src = T.state.logFormats.find(f => f.id === "fmt-demo-app");
  T.state.formatRules.push({ id: "rule-a", order: 0, createdAt: 0, glob: "app-*.log", formatId: src.id },
                           { id: "rule-b", order: 1, createdAt: 0, glob: "shared-*.log", formatId: "fmt-default" },
                           { id: "rule-c", order: 2, createdAt: 0, glob: "shared-*.log", formatId: src.id });
  w.renderFormatList();

  // Export: one button per ordinary format, none on the meta-format.
  const rowFor = name => [...d.querySelectorAll("#formatList .filter-library-row")].find(r => r.querySelector(".filter-library-row-name").textContent.startsWith(name));
  const exportBtn = row => [...row.querySelectorAll("button")].find(b => b.textContent === "Export");
  assert(!exportBtn(rowFor("App + Syslog (meta)")), "a meta-format has no Export button");
  fireClick(exportBtn(rowFor(src.name)), w);
  await waitFor(() => captured.length === 1 && captured[0].json !== null);
  const file = JSON.parse(captured[0].json);
  assert(file.format === "philogg-log-format" && file.version === 1, "export carries the log-format file marker, got " + file.format);
  assert(captured[0].name.endsWith(".logformat.json"), "suggested file name, got " + captured[0].name);
  assert(file.logFormat.name === src.name && file.logFormat.regex === src.regex && file.logFormat.tsFormat === src.tsFormat, "export carries the definition");
  assert(!("id" in file.logFormat) && !("builtin" in file.logFormat) && !("createdAt" in file.logFormat), "...without the store-local id/builtin/createdAt");
  assert(file.fileNamePatterns.join(",") === "app-*.log,shared-*.log", "export carries the mapped globs in rule order, got " + file.fileNamePatterns);

  // Parsing: not-a-format → null (loads normally), broken → error.
  assert(w.parseLogFormatExport('{"format":"philogg-filters"}') === null, "another PhiLogg JSON is not a log-format file");
  assert(w.parseLogFormatExport("[1,2]") === null && w.parseLogFormatExport("nope") === null, "arbitrary JSON / text is not a log-format file");
  assert(w.parseLogFormatExport(JSON.stringify({ format: "philogg-log-format", version: 99, logFormat: {} })).error, "a newer version is rejected");
  assert(w.parseLogFormatExport(JSON.stringify({ format: "philogg-log-format", version: 1, logFormat: { name: "x", mode: "regex", regex: "(" } })).error, "an invalid regex is rejected");
  assert(w.parseLogFormatExport(JSON.stringify({ format: "philogg-log-format", version: 1, logFormat: { name: "x", mode: "meta" } })).error, "a meta-format is rejected");

  // Drop the exported file anywhere (as on another machine — none of its
  // globs mapped yet): routed to the format wizard, not loaded.
  T.state.formatRules.length = 0;
  const before = T.state.logFormats.length;
  const nodesBefore = Object.keys(T.state.nodes).length;
  const dlg = d.querySelector("#formatDialog");
  await w.loadFileDescriptors([{ file: new w.File([captured[0].json], captured[0].name), handle: null }]);
  await waitFor(() => isVisible(dlg, w));
  assert(isVisible(dlg, w), "a dropped log-format file opens the format wizard");
  assert(Object.keys(T.state.nodes).length === nodesBefore, "...and loads no file node");
  assert(d.querySelector("#formatEditTitle").textContent === "Import log format", "the wizard says it's an import");
  assert(d.querySelector("#formatEditName").value === src.name, "the exported name is prefilled, got " + d.querySelector("#formatEditName").value);
  assert(d.querySelector("#formatEditTsFormat").value === src.tsFormat, "...and the timestamp format");
  assert(d.querySelector("#formatEditRegex").value !== "", "...and the regex");
  assert(isVisible(d.querySelector("#formatEditImportField"), w), "the import's filename-pattern section is shown");
  const boxes = [...d.querySelectorAll("#formatEditImportRules input[type=checkbox]")];
  assert(boxes.length === 2, "one checkbox per exported glob, got " + boxes.length);
  assert(boxes.every(b => b.checked), "unmapped globs start checked, got " + boxes.map(b => b.checked));
  boxes[1].checked = false;
  d.querySelector("#formatEditName").value = "Imported app log";
  const rulesBefore = T.state.formatRules.length;
  fireClick(d.querySelector("#formatEditSave"), w);
  await waitFor(() => T.state.logFormats.length === before + 1);
  const imp = T.state.logFormats.find(f => f.name === "Imported app log");
  assert(imp && imp.id !== src.id && !imp.builtin && imp.regex === src.regex && imp.tsFormat === src.tsFormat, "Save creates a new format with the imported definition, got " + (imp && imp.regex));
  assert(T.state.logFormats.find(f => f.id === src.id).name === src.name, "the original format is untouched");
  assert(!isVisible(dlg, w), "saving closes the wizard");
  const newRules = T.state.formatRules.slice(rulesBefore);
  assert(newRules.length === 1 && newRules[0].glob === "app-*.log" && newRules[0].formatId === imp.id, "only the checked glob becomes a rule, for the new format");
  assert(newRules[0].order === 0, "the imported rule gets the next order slot");
  assert(!!rowFor("Imported app log"), "the Format Manager lists the imported format");

  // A glob another format already owns is offered unchecked; two imports
  // queue up — the second opens once the first is cancelled.
  T.state.formatRules.length = 0;
  T.state.formatRules.push({ id: "rule-x", order: 0, createdAt: 0, glob: "app-*.log", formatId: "fmt-default" });
  assert(w.importLogFormatText(captured[0].json) === true, "importLogFormatText accepts the export");
  const boxes2 = [...d.querySelectorAll("#formatEditImportRules input[type=checkbox]")];
  assert(!boxes2[0].checked && boxes2[1].checked, "an already-mapped glob starts unchecked, got " + boxes2.map(b => b.checked));
  assert(d.querySelector("#formatEditImportRules").textContent.includes("already mapped to Default"), "...with a note naming its current format");
  const second = JSON.parse(captured[0].json);
  second.logFormat.name = "Second import";
  second.fileNamePatterns = [];
  w.importLogFormatText(JSON.stringify(second));
  assert(d.querySelector("#formatEditName").value === src.name, "a second import waits while the wizard is open");
  fireClick(d.querySelector("#formatEditCancel"), w);
  assert(isVisible(dlg, w) && d.querySelector("#formatEditName").value === "Second import", "Cancel skips this file and opens the queued one");
  assert(!isVisible(d.querySelector("#formatEditImportField"), w), "a file without patterns shows no pattern section");
  fireClick(d.querySelector("#formatEditCancel"), w);
  assert(!isVisible(dlg, w), "Cancel closes the wizard without importing");
  assert(T.state.logFormats.length === before + 1, "...and creates nothing");

  // Adding a format by hand never shows the import section.
  fireClick(d.querySelector("#btnAddFormat"), w);
  assert(!isVisible(d.querySelector("#formatEditImportField"), w), "the plain Add dialog has no import section");
  fireClick(d.querySelector("#formatEditCancel"), w);

  // The old dedicated import UI is gone.
  assert(!d.querySelector("#btnImportFormat") && !d.querySelector("#logFormatImportDialog") && !d.querySelector("#logFormatFileInput"),
    "Settings → Log Formats has no Import… button / own import dialog any more");

  // Any other .json still loads as a normal file (a plain-text file node).
  await w.loadFileDescriptors([{ file: new w.File(['{"hello":1}'], "data.json"), handle: null }]);
  assert(!isVisible(dlg, w), "a plain JSON file does not open the wizard");
  assert(T.state.looseInlineViewers.size === 0 && T.state.rootIds.some(id => T.state.nodes[id].name === "data.json" && T.state.nodes[id].formatId === "fmt-plaintext"), "...it loads as a plain-text file node");
});
