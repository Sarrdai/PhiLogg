// GROUP format-logfmt — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function.

/* GROUP format-logfmt — logfmt format mode (FEATURE_BACKLOG.md #82): a
   format with mode "logfmt" reads each line that starts with key=value as
   one entry; time/level/message come from configurable keys, every other
   key is a custom column. Sample data from tools/log-sim (format logfmt). */
group("format-logfmt");
const logsimLocal = ms => { const x = new Date(ms); return new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), x.getUTCHours(), x.getUTCMinutes(), x.getUTCSeconds(), x.getUTCMilliseconds()).getTime(); };
const logsimEntries = (format, n, seed) => { const g = LOGSIM.createGenerator({ format, seed }); return Array.from({ length: n }, () => g.next()); };
await withApp(async (w, d, T) => {
  section("logfmt-a. Line parser: quoted values, escapes, bare keys, non-logfmt lines");
  const p = w.parseLogfmtLine;
  const o = p('time=2026-01-01T00:00:00 msg="said \\"hi\\" \\\\ ok\\nnext" n=5 failed empty= k="a=b c"');
  assert(o.time === "2026-01-01T00:00:00" && o.msg === 'said "hi" \\ ok\nnext' && o.n === "5", "plain, quoted and escaped values: " + JSON.stringify(o));
  assert(o.failed === "true" && o.empty === "" && o.k === "a=b c", "bare key is true, empty value stays empty, '=' inside quotes");
  assert(p("k=1 k=2").k === "2", "a repeated key keeps its last value");
  assert(p("just some words") === null && p("\tat com.example.Foo(Foo.java:12)") === null, "a line without a pair is not logfmt");
  assert(p('msg="unterminated value').msg === "unterminated value", "an unterminated quote runs to the end of the line");
  const hdr = w.compileOneFormat({ mode: "logfmt", tsKey: "time" }).isHeaderLine;
  assert(hdr("level=info x=1") && !hdr("   at Foo(a=1)") && !hdr("Caused by: x=1"), "only a line STARTING with a pair is a header");
});

await withApp(async (w, d, T) => {
  section("logfmt-b. Simulator file under its exported format: entries, time, levels, columns, continuations");
  await waitForFormatConfig(T);
  const [file] = LOGSIM.generateToStrings({ format: "logfmt", entries: 400, seed: 5 });
  const gen = logsimEntries("logfmt", 400, 5);
  const parsed = await logsimRegister(w, T, "logfmt", "fmt-sim-logfmt");
  assert(parsed.logFormat.mode === "logfmt" && parsed.logFormat.tsKey === "time" && parsed.logFormat.messageKey === "msg", "export carries mode and keys");
  const f = await w.addFile(file.name, file.text, () => {});
  assert(f.formatId === "fmt-sim-logfmt" && f.entries.length === 400, "400 entries, got " + f.entries.length);
  assert(f.entries.every((e, i) => e.ts === logsimLocal(gen[i].ts) && e.level === gen[i].level), "time and level mapped from time/level");
  assert(f.entries.every((e, i) => e.message.split("\n")[0] === gen[i].msg), "msg is the message (quotes and escapes resolved)");
  const multi = f.entries.filter(e => e.message.includes("\n")).length;
  assert(multi === gen.filter(e => e.cont).length && multi > 0, "continuation lines stay with their entry (" + multi + ")");
  assert(f.entries.every(e => e.fields.thread_ && e.fields.logger && e.fields.tenant), "thread_/logger/tenant columns on every entry");
  assert(f.entries.some(e => e.fields.status) && f.entries.some(e => e.fields.duration_ms) && f.entries.some(e => e.fields.req_id), "optional keys appear where present");
  assert(f.entries.filter(e => e.level === "ERROR").every(e => e.fields.failed === "true") && f.entries.filter(e => e.level !== "ERROR").every(e => !("failed" in e.fields)), "bare key `failed` is true, a missing key adds no field");
  assert(w.nativeFormatSpec(T.state.logFormats.find(x => x.id === "fmt-sim-logfmt")) === null, "a logfmt format never goes to the native parser");
  T.state.activeId = f.id;
  w.render();
  const cell = d.querySelector('#tableBody [data-col="tenant"]');
  assert(cell && cell.textContent, "the tenant column shows in the log table");
});

await withApp(async (w, d, T) => {
  section("logfmt-c. The worker source parses a logfmt format identically");
  await waitForFormatConfig(T);
  const [file] = LOGSIM.generateToStrings({ format: "logfmt", entries: 60, seed: 9 });
  const fmt = Object.assign({ id: "fmt-lf-w", builtin: false, edited: false, createdAt: 0 }, LOGSIM.formatExport("logfmt").logFormat);
  const posted = [];
  const sandboxSelf = {};
  const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
  vm.runInContext(w.buildLogParseWorkerSrc(), ctx);
  sandboxSelf.onmessage({ data: { text: file.text, fmt } });
  const entries = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries);
  const main = w.compileOneFormat(fmt);
  const mainEntries = file.text.split("\n").filter(l => main.isHeaderLine(l)).map(l => main.parseHeader(l));
  assert(entries.length === 60 && entries.length === mainEntries.length, "60 entries from the worker, got " + entries.length);
  assert(entries.every((e, i) => e.ts === mainEntries[i].ts && e.fields.tenant === mainEntries[i].fields.tenant && e.message.split("\n")[0] === mainEntries[i].message), "worker and main thread agree");
});

await withApp(async (w, d, T) => {
  section("logfmt-d. Format dialog: logfmt examples switch to logfmt, keys guessed, saved, reopened, exported");
  await waitForFormatConfig(T);
  const change = elx => elx.dispatchEvent(new w.Event("change", { bubbles: true }));
  const [file] = LOGSIM.generateToStrings({ format: "logfmt", entries: 30, seed: 5 });
  w.openFormatEditDialog(null);
  w.fwzAppendText(file.text);
  assert(d.querySelector("#formatEditModeLogfmt").classList.contains("active") && !d.querySelector("#formatEditModeJson").classList.contains("active"), "logfmt example lines switch a new format to logfmt");
  assert(isVisible(d.querySelector("#fwzJsonCols"), w) && !isVisible(d.querySelector("#fwzRegexField"), w), "the key panel replaces the regex field");
  assert(d.querySelector("#fwzJsonTsKey").value === "time" && d.querySelector("#fwzJsonLevelKey").value === "level" && d.querySelector("#fwzJsonMessageKey").value === "msg", "time/level/msg guessed");
  const keys = [...d.querySelectorAll("#fwzJsonKeys input")].map(cb => cb.dataset.path);
  assert(["thread", "logger", "tenant", "failed"].every(k => keys.includes(k)) && !keys.includes("time") && !keys.includes("msg"), "detected keys, mapped ones left out: " + keys.join(","));
  const cb = k => [...d.querySelectorAll("#fwzJsonKeys input")].find(x => x.dataset.path === k);
  cb("logger").checked = false;
  change(cb("logger"));
  const head = [...d.querySelectorAll("#fwzPreview .fwz-prev-head span")].map(x => x.textContent);
  assert(head.includes("tenant") && !head.includes("logger"), "the preview shows the picked columns: " + head.join(","));
  assert(d.querySelectorAll("#fwzPreview .fwz-prev-row:not(.fwz-prev-head)").length > 5, "the preview parses the examples");
  d.querySelector("#formatEditName").value = "My logfmt";
  await w.saveFormatEdit();
  const fmt = T.state.logFormats.find(f => f.name === "My logfmt");
  assert(fmt && fmt.mode === "logfmt" && fmt.tsKey === "time" && fmt.levelKey === "level" && fmt.messageKey === "msg" && fmt.regex === "", "saved as a logfmt format");
  assert(fmt.columnDefs.some(c => c.path === "tenant") && !fmt.columnDefs.some(c => c.path === "logger" || c.path === "time"), "checked keys became columns: " + fmt.columnDefs.map(c => c.path));
  assert(fmt.sampleSetup && fmt.sampleSetup.lines.length > 0 && fmt.levels.some(l => l.name === "ERROR"), "examples and levels saved");
  w.renderFormatList();
  assert(/logfmt/.test(d.querySelector("#formatList").textContent), "the format list labels the mode");

  w.openFormatEditDialog(fmt.id);
  assert(d.querySelector("#formatEditModeLogfmt").classList.contains("active") && d.querySelector("#fwzJsonTsKey").value === "time", "Edit reopens the logfmt kind with its keys");
  assert(!cb("logger").checked && cb("tenant").checked, "unchecked stays unchecked");
  await w.saveFormatEdit();
  const exported = w.serializeLogFormatExport(fmt.id);
  const re = w.parseLogFormatExport(JSON.stringify(exported));
  assert(re && !re.error && re.logFormat.mode === "logfmt" && re.logFormat.messageKey === "msg" && re.logFormat.columnDefs.some(c => c.path === "tenant"), "export/import round trip");

  // Switching kinds starts detection over; save needs the Time key.
  fireClick(d.querySelector("#formatEditModeJson"), w);
  assert(d.querySelector("#formatEditModeJson").classList.contains("active"), "switch to JSON Lines");
  fireClick(d.querySelector("#formatEditModeLogfmt"), w);
  assert(d.querySelector("#fwzJsonTsKey").value === "time", "switching back re-detects the keys");
});

await withApp(async (w, d, T) => {
  section("logfmt-e. A session file's per-file logFormat record restores a logfmt format");
  await waitForFormatConfig(T);
  const rec = LOGSIM.formatExport("logfmt").logFormat;
  const id = await w.ensureSessionLogFormat(JSON.parse(JSON.stringify(rec)));
  const stored = T.state.logFormats.find(f => f.id === id);
  assert(id && stored && stored.mode === "logfmt" && stored.tsKey === "time" && stored.columnDefs.length === rec.columnDefs.length, "added as a logfmt format with its keys and columns");
  assert(await w.ensureSessionLogFormat(JSON.parse(JSON.stringify(rec))) === id, "the same record is reused, not added twice");
});
