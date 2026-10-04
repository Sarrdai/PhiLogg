// GROUP 282 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 282 — Export / Share: attachment files (.log/.csv/.tsv/.html)
   Origin: 2026-09-25 session (see GROUP 281). buildExportFileParts builds
   the full current view as chunked string parts (EXPORT_CHUNK_ENTRIES per
   part) for one Blob; saveExportFile goes through saveFileWithFeedback (showSaveFilePicker where
   present, cancel = nothing saved, no fallback, else downloadBlobFallback).
   The HTML report is standalone and inert: everything escaped, no script.
   ============================================================ */
group(282);
await withApp(async (w, d, T) => {
  section("282a. .log / .csv / .tsv content");
  const text = makeLog(0, 12) +
    '2024-01-15 10:00:12,000\tERROR\t"main"\tC:\\src\\Foo.cs\tline 12\t[DoWork]\t"quote \\" comma, tab\there <script>alert(1)</script>\nsecond line"\n';
  const f = await w.addFile("svc.log", text, () => {});
  T.state.activeId = f.id;
  const ctx = w.collectExportContext();
  assert(ctx.entries.length === 13, "sanity: 13 entries incl. the multi-line one, got " + ctx.entries.length);
  const log = w.buildExportFileParts("log", ctx).join("");
  assert(log === ctx.entries.map(e => e.raw).join("\n") + "\n", ".log = the raw lines exactly, one entry after another (continuation lines kept)");

  const csv = w.buildExportFileParts("csv", ctx).join("");
  const csvRows = csv.split("\r\n");
  assert(csvRows[0] === "Time,Level,Thread,Location,Method,Message", ".csv header = the visible log columns, got " + csvRows[0]);
  assert(csvRows[1].startsWith('"2024-01-15 10:00:00,000",ERROR,main,'),
    ".csv quotes a field containing the delimiter (the ',000' timestamp), got " + csvRows[1]);
  const last = ctx.entries[12];
  assert(csv.includes('"' + last.message.replace(/"/g, '""') + '"') && last.message.includes("\n"),
    ".csv keeps a multi-line message intact inside RFC 4180 quotes");
  assert(csv.endsWith("\r\n"), ".csv rows end with CRLF");

  const tsv = w.buildExportFileParts("tsv", ctx).join("");
  const tsvRows = tsv.split("\n").filter(Boolean);
  assert(tsvRows.length === 14 && tsvRows[0] === "Time\tLevel\tThread\tLocation\tMethod\tMessage", ".tsv: header + one line per entry");
  assert(tsvRows.every(r => r.split("\t").length === 6), ".tsv: every row has exactly 6 fields (tabs inside values replaced)");
  assert(tsvRows[13].includes("\\nsecond line"), ".tsv: a line break inside a value becomes the two characters \\n");

  // Chunking: parts, not one string per line and not one giant string.
  const big = await w.addFile("big.log", makeLog(0, 12001), () => {});
  T.state.activeId = big.id;
  const bigParts = w.buildExportFileParts("log", w.collectExportContext());
  assert(bigParts.length === 3, ".log of 12001 entries is built as ceil(12001/5000) = 3 string parts, got " + bigParts.length);
  assert(w.buildExportFileParts("csv", w.collectExportContext()).length === 4, ".csv adds the header as its own first part");

  section("282b. HTML report: standalone, complete, inert");
  T.state.activeId = f.id;
  w.toggleBookmark(ctx.entries[3].id);
  w.setNoteAndRepaint(ctx.entries[3].id, "root cause <b>here</b>");
  const rctx = w.collectExportContext();
  const html = w.buildExportFileParts("html", rctx).join("");
  assert(html.startsWith("<!DOCTYPE html>") && html.includes("<title>Log findings: svc.log</title>"), "report is a full HTML document titled after the view");
  assert(!/<script/i.test(html) && html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "log text is escaped — no <script> element anywhere in the report");
  assert(!/<link|src=|href=/i.test(html), "no external resource references");
  assert(html.includes("<li>File: svc.log — 13</li>"), "report lists the filter chain with counts");
  assert(html.includes("<h2>Bookmarks &amp; notes (1)</h2>") && html.includes("root cause &lt;b&gt;here&lt;/b&gt;"), "report lists findings with the (escaped) note");
  assert((html.match(/<div class="e /g) || []).length === 13, "report contains every matching entry");
  assert(html.includes('class="e l-error"') && html.includes('class="e l-info bm">★ '), "entries carry level classes; the bookmarked one is marked ★");
  assert(html.includes('<span class="n">Note: root cause'), "the note also appears inline under its entry");

  section("282c. saveExportFile / exportViewFile: picker, cancel, download fallback");
  const downloads = [];
  w.downloadBlobFallback = (blob, name) => downloads.push({ blob, name });
  const txt = w.createFilterNode(f.id, "text", "message 1");
  T.state.activeId = txt.id;
  assert(await w.exportViewFile("log") === true, "exportViewFile resolves true once saved");
  assert(downloads.length === 1 && downloads[0].name === "svc-message_1.log", "no picker -> download fallback, named <file stem>-<view>, got " + (downloads[0] && downloads[0].name));
  const expLog = w.buildExportFileParts("log", w.collectExportContext()).join("");
  assert(downloads[0].blob.size === Buffer.byteLength(expLog, "utf8"), "the downloaded blob is the whole .log content");
  assert(d.querySelector("#copyToast").textContent === "Downloaded svc-message_1.log", "a toast confirms the download, got " + d.querySelector("#copyToast").textContent);
  T.state.activeId = f.id;
  await w.exportViewFile("html");
  assert(downloads[1].name === "svc.html", "active = the file itself -> just the file stem, got " + downloads[1].name);

  const written = [];
  let pickerOpts = null;
  w.showSaveFilePicker = async opts => {
    pickerOpts = opts;
    return { createWritable: async () => ({ write: async b => written.push(b), close: async () => {} }) };
  };
  await w.exportViewFile("tsv");
  assert(written.length === 1 && downloads.length === 2, "with a picker, the file is written through it (no download)");
  assert(pickerOpts.suggestedName === "svc.tsv" && pickerOpts.types[0].accept["text/tab-separated-values"][0] === ".tsv", "picker gets the suggested name and type");
  w.showSaveFilePicker = async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; };
  assert(await w.exportViewFile("csv") === false && downloads.length === 2, "cancelling the picker saves nothing and does not fall back");
  assert(d.querySelector("#copyToast").textContent === "Not saved", "cancelling says so, got " + d.querySelector("#copyToast").textContent);
  w.showSaveFilePicker = async () => { throw new Error("SecurityError"); };
  await w.exportViewFile("csv");
  assert(downloads.length === 3 && downloads[2].name === "svc.csv", "an unusable picker falls back to the download");
});
