// GROUP desktop-native-save — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP desktop-native-save — saves under the desktop wrapper go through
   window.philogg.saveFile
   Origin: 2026-10-07 (FEATURE_BACKLOG.md #102). WKWebView/WebKitGTK have no
   showSaveFilePicker and their <a download> is cancelled (macOS) or lands
   unasked in ~/Downloads (Linux), so saveFileWithFeedback prefers the
   wrapper's native save (OS dialog + write in Rust) whenever it is offered:
   "Saved <chosen name>", "Not saved" on cancel (null), red "Couldn't save"
   when the wrapper rejects — never a download. Without it the browser
   route (picker / <a download>) is unchanged (GROUP save-feedback-toasts).
   ============================================================ */
group("desktop-native-save");
await withApp(async (w, d, T) => {
  section("desktop-native-save a. the wrapper's saveFile replaces picker and download");
  const toast = d.querySelector("#copyToast");
  const downloads = [];
  w.downloadBlobFallback = (blob, name) => downloads.push(name);
  let pickerCalls = 0;
  w.showSaveFilePicker = async () => { pickerCalls++; throw new Error("must not be used"); };
  const calls = [];
  let answer = async () => "chosen.json";
  w.philogg = { saveFile: (name, bytes, opts) => { calls.push({ name, bytes, opts }); return answer(); } };
  const opts = { description: "PhiLogg filter", mime: "application/json", ext: ".json" };

  // Saved: the name the person chose, the exact bytes, suggested name + filter.
  assert(await w.saveFileWithFeedback('{"a":"ä"}', "f.json", opts) === "saved", "wrapper save -> 'saved'");
  assert(calls.length === 1 && calls[0].name === "f.json", "saveFile gets the suggested name");
  assert(calls[0].bytes instanceof w.Uint8Array || ArrayBuffer.isView(calls[0].bytes), "bytes arrive as a Uint8Array");
  assert(new TextDecoder().decode(calls[0].bytes) === '{"a":"ä"}', "bytes are the UTF-8 content");
  assert(calls[0].opts.description === "PhiLogg filter" && calls[0].opts.ext === ".json", "saveFile gets description + extension");
  assert(toast.textContent === "Saved chosen.json" && toast.dataset.kind === "ok", "toast names the chosen file, got " + toast.textContent);

  // Binary data (plot image) passes through unchanged.
  const png = new Uint8Array([137, 80, 78, 71, 0, 255, 1]);
  await w.saveFileWithFeedback(new w.Blob([png], { type: "image/png" }), "p.png", { description: "PNG image", mime: "image/png", ext: ".png" });
  assert(Array.from(calls[1].bytes).join() === Array.from(png).join(), "a Blob's bytes arrive unchanged");

  // Cancelled: null -> "Not saved".
  answer = async () => null;
  assert(await w.saveFileWithFeedback("{}", "f.json", opts) === "cancelled", "null -> 'cancelled'");
  assert(toast.textContent === "Not saved" && toast.dataset.kind === "neutral", "toast says Not saved, got " + toast.textContent);

  // Write failure in Rust (rejects with a string): red error, no download.
  answer = async () => { throw "Permission denied (os error 13)"; };
  assert(await w.saveFileWithFeedback("{}", "f.json", opts) === "failed", "rejection -> 'failed'");
  assert(toast.textContent === "Couldn't save f.json — Permission denied (os error 13)" && toast.dataset.kind === "error",
    "error toast carries the wrapper's reason, got " + toast.textContent);
  assert(downloads.length === 0 && pickerCalls === 0, "neither the picker nor a download is ever used under the wrapper");

  // A wrapper without saveFile (older build) keeps the browser route.
  w.philogg = {};
  delete w.showSaveFilePicker;
  assert(await w.saveFileWithFeedback("{}", "g.json", opts) === "downloaded", "no saveFile -> download fallback");
  assert(downloads.length === 1 && toast.textContent === "Downloaded g.json", "fallback toast unchanged");
  delete w.philogg;
});

await withApp(async (w, d, T) => {
  section("desktop-native-save b. a real save path (session export) uses the wrapper");
  const toast = d.querySelector("#copyToast");
  const saved = [];
  w.downloadBlobFallback = () => { throw new Error("no download under the wrapper"); };
  w.philogg = { saveFile: async (name, bytes) => { saved.push({ name, text: new TextDecoder().decode(bytes) }); return name; } };
  const f = await w.addFile("svc.log", makeLog(0, 12), () => {});
  T.state.activeId = f.id;
  w.render();
  w.openSessionExportDialog();
  fireClick(d.querySelector("#sessionExportConfirm"), w);
  await waitFor(() => saved.length === 1);
  assert(/^philogg-session-.*\.json$/.test(saved[0].name), "session export reaches saveFile, got " + saved[0].name);
  assert(JSON.parse(saved[0].text) && saved[0].text.includes("svc.log"), "the session JSON is what gets written");
  await waitFor(() => toast.textContent === "Saved " + saved[0].name);
  delete w.philogg;
});
