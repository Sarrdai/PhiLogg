// GROUP save-feedback-toasts — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP save-feedback-toasts — one shared save flow with outcome toasts
   Origin: 2026-10-04 (usability round B, B4 step 1). saveFileWithFeedback
   replaces the copy-pasted save-picker blocks (session, filter, filter
   preset, Export / Share file, Table CSV, plot image, theme/syntax/log
   format): "Saved <chosen name>" (picker), "Downloaded <name>" (no/unusable
   picker), "Not saved" (cancelled), red "Couldn't save <name> — <reason>"
   when writing to an already chosen file fails (no download fallback).
   ============================================================ */
group("save-feedback-toasts");
await withApp(async (w, d, T) => {
  section("save-feedback-toasts a. outcomes of saveFileWithFeedback");
  const toast = d.querySelector("#copyToast");
  const downloads = [];
  w.downloadBlobFallback = (blob, name) => downloads.push({ blob, name });
  const opts = { description: "Test file", mime: "application/json", ext: ".json" };

  // No picker (jsdom): one download + "Downloaded <name>".
  assert(await w.saveFileWithFeedback("{}", "a.json", opts) === "downloaded", "no picker -> 'downloaded'");
  assert(downloads.length === 1 && downloads[0].name === "a.json", "exactly one <a download> fallback");
  assert(toast.textContent === "Downloaded a.json" && toast.dataset.kind === "download" && !toast.classList.contains("hidden"),
    "toast says Downloaded <name>, kind download, got " + toast.textContent);

  // Picker: toast uses the name the person chose (handle.name).
  const written = [];
  let pickerOpts = null;
  w.showSaveFilePicker = async o => {
    pickerOpts = o;
    return { name: "chosen.json", createWritable: async () => ({ write: async b => written.push(b), close: async () => {} }) };
  };
  assert(await w.saveFileWithFeedback("{}", "a.json", opts) === "saved", "picker -> 'saved'");
  assert(written.length === 1 && downloads.length === 1, "written through the picker, no download");
  assert(pickerOpts.suggestedName === "a.json" && pickerOpts.types[0].accept["application/json"][0] === ".json", "picker gets suggested name + type");
  assert(toast.textContent === "Saved chosen.json" && toast.dataset.kind === "ok", "toast uses handle.name, got " + toast.textContent);

  // Cancel: neutral "Not saved", nothing written or downloaded.
  w.showSaveFilePicker = async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; };
  assert(await w.saveFileWithFeedback("{}", "a.json", opts) === "cancelled", "AbortError -> 'cancelled'");
  assert(toast.textContent === "Not saved" && toast.dataset.kind === "neutral", "toast says Not saved, got " + toast.textContent);
  assert(downloads.length === 1 && written.length === 1, "cancel neither downloads nor writes");

  // Picker unusable -> download fallback.
  w.showSaveFilePicker = async () => { throw new Error("SecurityError"); };
  assert(await w.saveFileWithFeedback("{}", "b.json", opts) === "downloaded", "unusable picker -> 'downloaded'");
  assert(downloads.length === 2 && downloads[1].name === "b.json" && toast.textContent === "Downloaded b.json", "falls back to one download + toast");

  // Write failure after a handle was obtained: red error, NO download.
  w.showSaveFilePicker = async () => ({ name: "disk.json", createWritable: async () => ({ write: async () => { throw new Error("Disk full"); }, close: async () => {} }) });
  assert(await w.saveFileWithFeedback("{}", "c.json", opts) === "failed", "write error -> 'failed'");
  assert(toast.textContent === "Couldn't save disk.json — Disk full" && toast.dataset.kind === "error", "error toast names file and reason, got " + toast.textContent);
  assert(downloads.length === 2, "a write failure does NOT fall back to a download");
  w.showSaveFilePicker = async () => ({ name: "x.json", createWritable: async () => { const e = new Error(""); e.name = "NotAllowedError"; throw e; } });
  await w.saveFileWithFeedback("{}", "c.json", opts);
  assert(toast.textContent === "Couldn't save x.json — NotAllowedError", "reason falls back to err.name, got " + toast.textContent);
  delete w.showSaveFilePicker;

  // Toast kinds don't leak into plain toasts.
  w.showCopyToast("plain");
  assert(!toast.dataset.kind && toast.textContent === "plain", "a plain toast carries no kind");
  let undone = false;
  w.showCopyToast("with action", { label: "Undo", onClick: () => { undone = true; } });
  assert(toast.classList.contains("has-action") && toast.querySelector(".toast-action").textContent === "Undo", "action toasts still work");
  toast.querySelector(".toast-action").click();
  assert(undone, "action callback still fires");
});

await withApp(async (w, d, T) => {
  section("save-feedback-toasts b. every save path goes through the helper");
  const toast = d.querySelector("#copyToast");
  const calls = [];
  w.downloadBlobFallback = () => {};
  const orig = w.saveFileWithFeedback;
  w.saveFileWithFeedback = (data, name, o) => { calls.push({ data, name, o }); return orig(data, name, o); };
  const last = () => calls[calls.length - 1];

  const f = await w.addFile("svc.log", makeLog(0, 12), () => {});
  T.state.activeId = f.id;
  w.render();

  // Session export.
  w.openSessionExportDialog();
  fireClick(d.querySelector("#sessionExportConfirm"), w);
  await waitFor(() => calls.length === 1);
  assert(/^philogg-session-.*\.json$/.test(last().name) && last().o.description === "PhiLogg session", "session export uses the helper, got " + last().name);
  await waitFor(() => toast.textContent === "Downloaded " + last().name);
  assert(toast.textContent !== "Session exported", "no separate 'Session exported' toast any more");

  // Export / Share file.
  assert(await w.exportViewFile("log") === true, "exportViewFile resolves true when downloaded");
  assert(last().name === "svc.log" && toast.textContent === "Downloaded svc.log", "Export / Share file uses the helper, got " + toast.textContent);
  w.showSaveFilePicker = async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; };
  assert(await w.exportViewFile("csv") === false, "exportViewFile resolves false on cancel");
  assert(toast.textContent === "Not saved", "cancelled Export / Share file says Not saved");
  w.showSaveFilePicker = async () => ({ name: "d.csv", createWritable: async () => ({ write: async () => { throw new Error("boom"); }, close: async () => {} }) });
  assert(await w.exportViewFile("csv") === false, "exportViewFile resolves false on a write failure");
  delete w.showSaveFilePicker;

  // Filter file.
  const flt = w.createFilterNode(f.id, "text", "message 1");
  const before = calls.length;
  const p = w.saveFilterToFile(flt.id);
  await waitFor(() => !d.querySelector("#exportScopeDialog").classList.contains("hidden"));
  fireClick(d.querySelector("#exportScopeJustThis"), w);
  await p;
  assert(calls.length === before + 1 && last().name.endsWith(".json") && last().o.description === "PhiLogg filter", "saveFilterToFile uses the helper");
  assert(/^Downloaded .*\.json$/.test(toast.textContent), "filter save toast is the helper's, got " + toast.textContent);

  // Filter preset, theme, syntax scheme, log format all funnel through saveJsonExportFile.
  const n0 = calls.length;
  await w.exportFilterLibraryEntry({ id: "p1", name: "Hot", icon: null, roots: [], activeRef: null, created: 1 });
  assert(calls.length === n0 + 1 && last().name === "Hot.filterpreset.json", "filter preset export uses the helper, got " + last().name);
  await w.saveJsonExportFile("{}", "t.theme.json", "PhiLogg theme");
  assert(last().name === "t.theme.json" && toast.textContent === "Downloaded t.theme.json", "saveJsonExportFile (theme / syntax / log format) uses the helper");

  // Table CSV.
  await w.saveCsvToFile("a;b\r\n");
  assert(last().name === "philogg-export.csv" && last().o.mime === "text/csv" && toast.textContent === "Downloaded philogg-export.csv", "Table CSV uses the helper, got " + toast.textContent);

  // Plot image: PNG data URL -> Blob -> helper; picker where available.
  const rows = Array.from({ length: 11 }, (_, i) => i * 10);
  const g = await w.addFile("plot.log", rows.map((v, i) =>
    `2024-01-15 10:00:${String(i).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"x=${v} y=${v}"`).join("\n") + "\n", () => {});
  T.state.activeId = g.id;
  const node = w.createFilterNode(g.id, "text", "x=[*:int] y=[*:int]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("plot");
  fireClick(d.querySelector('.plot-type-btn[data-type="scatter"]'), w);
  const xSel = d.querySelector("#plotXSelect"), ySel = d.querySelector("#plotYSelectSingle");
  xSel.value = "0"; xSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  ySel.value = "1"; ySel.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.plotLastRender, "sanity: a plot is rendered");
  const written = [];
  w.showSaveFilePicker = async () => ({ name: "my.png", createWritable: async () => ({ write: async b => written.push(b), close: async () => {} }) });
  w.svgToPngDataUrl = async () => "data:image/png;base64,iVBORw0KGgo=";
  const n1 = calls.length;
  fireClick(d.querySelector("#plotSaveImageBtn"), w);
  await waitFor(() => calls.length === n1 + 1 && toast.textContent === "Saved my.png");
  assert(/^plot-\d+\.png$/.test(last().name) && last().data instanceof w.Blob && last().data.type === "image/png" && last().data.size === 8,
    "plot image goes through the helper as an 8-byte PNG blob, got " + last().name);
  assert(written.length === 1, "the plot image is written through the picker");
  // Render failure keeps its own toast and saves nothing.
  w.svgToPngDataUrl = async () => { throw new Error("nope"); };
  const n2 = calls.length;
  fireClick(d.querySelector("#plotSaveImageBtn"), w);
  await waitFor(() => toast.textContent === "Could not save the plot image.");
  assert(calls.length === n2, "a render failure never reaches the save helper");
});
