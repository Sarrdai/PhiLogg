// GROUP format-time-zone — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP format-time-zone — a log format's time zone and the XXX token
   Origin: 2026-10-07 (person-requested, backlog #86). A format can declare the
   zone of timestamps that carry no offset (`timeZone`: "" = this computer,
   "UTC", "+05:30", an IANA name) and read an offset (Z, +02:00, +0200) from the
   timestamp itself with the new tsFormat token XXX, which always wins over the
   zone. JSON Lines: epoch numbers are untouched, a free-form string with an
   offset is absolute, one without is read in the zone. The format dialog gets
   a Time zone field, a status line and offset detection; the field is saved,
   exported and imported. Data: tools/log-sim (--ts-offset).
   ============================================================ */
group("format-time-zone");
{
  const HOUR = 3600000;
  // A simulator file as text, with the generated entries (naive wall-clock ms,
  // i.e. Date.UTC of the written fields) next to it.
  const simFile = (format, n, seed, extra) => {
    const opts = Object.assign({ format, entries: n, seed }, extra || {});
    return { file: LOGSIM.generateToStrings(opts)[0], gen: Array.from({ length: n }, (g => () => g.next())(LOGSIM.createGenerator(opts))) };
  };
  const localOf = ms => { const x = new Date(ms); return new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), x.getUTCHours(), x.getUTCMinutes(), x.getUTCSeconds(), x.getUTCMilliseconds()).getTime(); };
  // The Date constructor's own reading of the wall clock under process TZ `tz` —
  // the oracle for every zone-aware conversion (as in GROUP 264e).
  const localUnder = (tz, naiveList) => {
    const saved = process.env.TZ;
    process.env.TZ = tz;
    try { return naiveList.map(localOf); } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
  };
  let fileNo = 0;
  async function parseSim(w, T, name, text) {
    const f = await w.addFile(name.replace(/-1\./, "-z" + (++fileNo) + "."), text, () => {});
    const ts = f.entries.map(e => e.ts);
    const fmtId = f.formatId;
    w.deleteNode(f.id);
    return { ts, fmtId, n: ts.length };
  }
  const setZone = (T, id, tz) => {
    const fmt = T.state.logFormats.find(f => f.id === id);
    if (tz) fmt.timeZone = tz; else delete fmt.timeZone;
    w_invalidate();
  };
  let w_invalidate = () => {};

  await withApp(async (w, d, T) => {
    section("format-time-zone a. XXX reads Z, +HH:MM and +HHMM; the offset wins over the zone");
    await waitForFormatConfig(T);
    w_invalidate = () => w.invalidateFormatCompileCache();
    await logsimRegister(w, T, "syslog", "fmt-sim-syslog");
    const fmt = T.state.logFormats.find(f => f.id === "fmt-sim-syslog");
    assert(fmt.tsFormat.endsWith("XXX"), "the simulator's syslog format reads the offset, got " + fmt.tsFormat);
    for (const off of ["Z", "+05:30", "-05:00"]) {
      const { file, gen } = simFile("syslog", 300, 11, { tsOffset: off });
      assert(file.text.split("\n")[0].includes("T") && file.text.split("\n")[0].includes(off === "Z" ? "Z " : off + " "), off + ": the simulator writes the offset suffix");
      const r = await parseSim(w, T, file.name, file.text);
      assert(r.n === 300 && r.ts.every((t, i) => t === gen[i].ts), off + ": every entry is the generated instant (wall clock minus the line's offset)");
    }
    // +HHMM: the same simulator output with the colon removed.
    const hhmm = simFile("syslog", 200, 12, { tsOffset: "+05:30" });
    const r2 = await parseSim(w, T, hhmm.file.name, hhmm.file.text.replace(/([+-]\d{2}):(\d{2}) /g, "$1$2 "));
    assert(r2.n === 200 && /\+0530 /.test(hhmm.file.text.replace(/([+-]\d{2}):(\d{2}) /g, "$1$2 ")) && r2.ts.every((t, i) => t === hhmm.gen[i].ts), "+0530 is read like +05:30");
    // Different offsets in one file: each line is its own instant.
    const a = simFile("syslog", 100, 13, { tsOffset: "Z" }), b = simFile("syslog", 100, 13, { tsOffset: "-05:00" });
    const la = a.file.text.split("\n"), lb = b.file.text.split("\n");
    const mixed = la.map((l, i) => (i % 2 ? lb[i] : l)).join("\n");
    const r3 = await parseSim(w, T, a.file.name, mixed);
    assert(r3.n === 100 && r3.ts.every((t, i) => t === a.gen[i].ts), "lines with different offsets in one file all land on the same instants");
    // The offset wins over the format's own zone.
    for (const tz of ["America/New_York", "+09:00", "UTC", ""]) {
      setZone(T, "fmt-sim-syslog", tz);
      const r = await parseSim(w, T, b.file.name, b.file.text);
      assert(r.ts.every((t, i) => t === b.gen[i].ts), "timeZone '" + tz + "': the line's offset still wins");
    }
    setZone(T, "fmt-sim-syslog", "");

    section("format-time-zone b. Timestamps without an offset: local (default), UTC, fixed, IANA");
    await logsimRegister(w, T, "bracket", "fmt-sim-bracket");
    const br = simFile("bracket", 300, 14);
    let r = await parseSim(w, T, br.file.name, br.file.text);
    assert(r.ts.every((t, i) => t === localOf(br.gen[i].ts)), "no timeZone: this computer's local time, as before");
    for (const [tz, shift] of [["UTC", 0], ["-05:00", 5 * HOUR], ["+05:30", -5.5 * HOUR], ["+0200", -2 * HOUR], ["America/New_York", 5 * HOUR]]) {
      setZone(T, "fmt-sim-bracket", tz);
      r = await parseSim(w, T, br.file.name, br.file.text);
      assert(r.ts.every((t, i) => t === br.gen[i].ts + shift), "timeZone '" + tz + "': wall clock read in that zone");
    }
    // Summer time: January is UTC-5, July UTC-4 in New York.
    const jul = simFile("bracket", 100, 14, { start: "2026-07-15T08:00:00" });
    setZone(T, "fmt-sim-bracket", "America/New_York");
    r = await parseSim(w, T, jul.file.name, jul.file.text);
    assert(r.ts.every((t, i) => t === jul.gen[i].ts + 4 * HOUR), "an IANA zone follows its summer time");
    // Around a switch (spring forward gap, fall back overlap): the Date constructor is the oracle.
    for (const [tz, start] of [["America/New_York", "2026-03-08T01:59:30"], ["America/New_York", "2026-11-01T00:59:30"],
      ["Europe/Berlin", "2026-03-29T01:59:30"], ["Europe/Berlin", "2026-10-25T01:59:30"], ["Australia/Lord_Howe", "2026-10-04T01:59:30"]]) {
      const sw = simFile("bracket", 600, 15, { start, rate: 10 });
      const want = localUnder(tz, sw.gen.map(e => e.ts));
      setZone(T, "fmt-sim-bracket", tz);
      r = await parseSim(w, T, sw.file.name, sw.file.text);
      const bad = r.ts.filter((t, i) => t !== want[i]).length;
      assert(bad === 0, tz + " from " + start + ": " + bad + " of 600 entries differ from the Date constructor's reading");
    }
    // A zone is a property of the compiled format: editing it takes effect.
    setZone(T, "fmt-sim-bracket", "");
    r = await parseSim(w, T, br.file.name, br.file.text);
    assert(r.ts.every((t, i) => t === localOf(br.gen[i].ts)), "back to local time after clearing the zone");

    section("format-time-zone c. makeZoneLocalizer, nativeFormatSpec and the worker source");
    const naive = Date.UTC(2026, 0, 15, 8, 0, 0, 123);
    assert(w.makeZoneLocalizer("UTC")(naive) === naive && w.makeZoneLocalizer("+05:30")(naive) === naive - 5.5 * HOUR && w.makeZoneLocalizer("-0500")(naive) === naive + 5 * HOUR, "UTC and fixed offsets");
    assert(w.makeZoneLocalizer("America/New_York")(naive) === naive + 5 * HOUR && w.makeZoneLocalizer("")(naive) === localOf(naive), "IANA and local");
    assert(w.makeZoneLocalizer("Not/AZone")(naive) === localOf(naive), "an unknown zone degrades to local time");
    const specOf = tsFormat => w.nativeFormatSpec({ id: "n", mode: "regex", regex: "^(?<ts>\\S+) (?<level>\\w+) (?<message>.*)$", tsFormat });
    assert(specOf("yyyy-MM-ddTHH:mm:ss.SSSXXX") === null, "an XXX format is not handed to the native parser (yet)");
    assert(specOf("yyyy-MM-ddTHH:mm:ss.SSS") && specOf("yyyy-MM-ddTHH:mm:ss.SSS").dateOrder.length === 7, "a format without XXX still is");
    // Worker source: same ts as the main-thread compile, for all three parser shapes.
    await logsimRegister(w, T, "jsonl", "fmt-sim-jsonl");
    const jsonFile = simFile("jsonl", 50, 16);
    const cases = [
      [Object.assign({}, T.state.logFormats.find(f => f.id === "fmt-sim-syslog"), { timeZone: "Asia/Kolkata" }), simFile("syslog", 50, 16, { tsOffset: "+02:00" }).file.text],
      [Object.assign({}, T.state.logFormats.find(f => f.id === "fmt-sim-bracket"), { timeZone: "America/New_York" }), br.file.text],
      [Object.assign({}, T.state.logFormats.find(f => f.id === "fmt-sim-jsonl"), { timeZone: "-03:00" }), jsonFile.file.text],
    ];
    for (const [fmtDef, text] of cases) {
      const posted = [];
      const sandboxSelf = {};
      const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
      vm.runInContext(w.buildLogParseWorkerSrc(), ctx);
      sandboxSelf.onmessage({ data: { text, fmt: fmtDef } });
      const got = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries).map(e => e.ts);
      const c = w.compileOneFormat(fmtDef);
      const want = text.split("\n").filter(l => c.isHeaderLine(l)).map(l => c.parseHeader(l).ts);
      assert(got.length === want.length && got.length >= 50 && got.every((t, i) => t === want[i] && !isNaN(t)), fmtDef.name + ": the worker parses with the same zone (" + got.length + " entries)");
    }

    section("format-time-zone d. JSON Lines: epoch untouched, free-form with and without an offset");
    const jl = simFile("jsonl", 200, 17);
    const jlOff = simFile("jsonl", 200, 17, { tsOffset: "+05:30" });
    const jlZ = simFile("jsonl", 200, 17, { tsOffset: "Z" });
    const epoch = jlZ.file.text.trimEnd().split("\n").map(l => { const o = JSON.parse(l); o.ts = Date.parse(o.ts); return JSON.stringify(o); }).join("\n") + "\n";
    const epochSec = jlZ.file.text.trimEnd().split("\n").map(l => { const o = JSON.parse(l); o.ts = Math.floor(Date.parse(o.ts) / 1000); return JSON.stringify(o); }).join("\n") + "\n";
    for (const tz of ["", "UTC", "-05:00", "America/New_York"]) {
      setZone(T, "fmt-sim-jsonl", tz);
      r = await parseSim(w, T, jl.file.name, epoch);
      assert(r.ts.every((t, i) => t === jl.gen[i].ts), "timeZone '" + tz + "': epoch milliseconds are UTC already");
      r = await parseSim(w, T, jl.file.name, epochSec);
      assert(r.ts.every((t, i) => t === Math.floor(jl.gen[i].ts / 1000) * 1000), "timeZone '" + tz + "': epoch seconds too");
      r = await parseSim(w, T, jlOff.file.name, jlOff.file.text);
      assert(r.ts.every((t, i) => t === jlOff.gen[i].ts), "timeZone '" + tz + "': a string with its own offset is absolute");
      r = await parseSim(w, T, jlZ.file.name, jlZ.file.text);
      assert(r.ts.every((t, i) => t === jlZ.gen[i].ts), "timeZone '" + tz + "': a string ending in Z is absolute");
    }
    for (const [tz, want] of [["", i => localOf(jl.gen[i].ts)], ["UTC", i => jl.gen[i].ts], ["-05:00", i => jl.gen[i].ts + 5 * HOUR], ["America/New_York", i => jl.gen[i].ts + 5 * HOUR]]) {
      setZone(T, "fmt-sim-jsonl", tz);
      r = await parseSim(w, T, jl.file.name, jl.file.text);
      assert(r.ts.every((t, i) => t === want(i)), "timeZone '" + tz + "': a free-form string without an offset is read in the zone");
    }
    // An explicit tsFormat with XXX on JSON works like on a text format.
    const jsonX = Object.assign({}, T.state.logFormats.find(f => f.id === "fmt-sim-jsonl"), { tsFormat: "yyyy-MM-ddTHH:mm:ss.SSSXXX", timeZone: "UTC" });
    const cj = w.compileOneFormat(jsonX);
    assert(jlOff.file.text.split("\n").filter(Boolean).every((l, i) => cj.parseHeader(l).ts === jlOff.gen[i].ts), "JSON Lines with tsFormat ...XXX reads the offset");
  });

  await withApp(async (w, d, T) => {
    section("format-time-zone e. A natively parsed file is localized in the format's zone");
    await waitForFormatConfig(T);
    await logsimRegister(w, T, "bracket", "fmt-sim-bracket");
    const br = simFile("bracket", 120, 18);
    const fmt = T.state.logFormats.find(f => f.id === "fmt-sim-bracket");
    fmt.timeZone = "America/New_York";
    w.invalidateFormatCompileCache();
    // The batch Rust would send: naive timestamps (the wall clock as UTC).
    const naiveFmt = Object.assign({}, fmt, { timeZone: "UTC" });
    const c = w.compileOneFormat(naiveFmt);
    const naiveEntries = br.file.text.split("\n").filter(l => c.isHeaderLine(l)).map(l => c.parseHeader(l));
    const enc = w.encodeEntryBatch(naiveEntries, 0.5);
    const tail = new w.TextEncoder().encode(enc.strings);
    const bytes = new w.Uint8Array(enc.buf.byteLength + tail.length);
    bytes.set(new w.Uint8Array(enc.buf), 0);
    bytes.set(tail, enc.buf.byteLength);
    const bridge = { parseLogFile: async (url, spec, onMessage) => { bridge.spec = spec; onMessage(bytes.buffer); return { size: 1 }; } };
    w.philogg = bridge;
    const node = w.createFileNode("sim-bracket.log");
    node.formatId = "fmt-sim-bracket";
    await w.parseLocalFileNatively("philogg://local/1/sim-bracket.log", node, () => {});
    assert(bridge.spec && bridge.spec.builtin === false && node.entries.length === 120, "parsed through the native route, got " + node.entries.length);
    assert(node.entries.every((e, i) => e.ts === br.gen[i].ts + 5 * HOUR), "naive timestamps become instants in America/New_York");
  });

  await withApp(async (w, d, T) => {
    section("format-time-zone f. Format dialog: Time zone field, status line, preview, validation, save");
    await waitForFormatConfig(T);
    const change = elx => elx.dispatchEvent(new w.Event("change", { bubbles: true }));
    const status = () => d.querySelector("#fwzStatus .fwz-time-status");
    const mode = d.querySelector("#fwzTzMode"), fixed = d.querySelector("#fwzTzFixed"), named = d.querySelector("#fwzTzNamed");
    const br = simFile("bracket", 12, 19);
    w.openFormatEditDialog(null);
    assert(mode.value === "local" && !isVisible(fixed, w) && !isVisible(named, w), "a new format starts on Local time, no extra input shown");
    assert([...mode.options].map(o => o.textContent).join("|") === "Local time (this computer)|UTC|Fixed offset|Time zone", "the four choices");
    assert(d.querySelector("label[for=fwzTzMode]").textContent.startsWith("Time zone") && d.querySelector("label[for=fwzTzMode]").textContent.includes("(for times without offset)"), "label");
    assert(d.querySelector("#fwzTzMode").closest(".fwz-result") === d.querySelector("#formatEditTsFormat").closest(".fwz-result"), "next to Timestamp format");
    w.fwzAppendText(br.file.text);
    const first = br.gen[0].ts;
    assert(status() && status().textContent === br.file.text.split("\n")[0].match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/)[0] + " → " + w.formatTime(localOf(first)) + " shown in your local time · source: local time (format)",
      "status line for local time, got " + (status() && status().textContent));
    const previewTime = () => d.querySelector("#fwzPreview .fwz-prev-row:not(.fwz-prev-head) span").textContent;
    assert(previewTime() === w.formatTime(localOf(first)), "the preview's Time column is the normalized time");

    mode.value = "utc"; change(mode);
    assert(status().textContent.endsWith("source: UTC (format)") && previewTime() === w.formatTime(first), "UTC: status and preview follow, got " + status().textContent);
    mode.value = "fixed"; change(mode);
    assert(isVisible(fixed, w) && !isVisible(named, w) && fixed.placeholder === "+02:00", "Fixed offset shows its input");
    fixed.value = "+2"; fireInput(fixed, w);
    const err = d.querySelector("#fwzStatus .fwz-error");
    assert(err && err.textContent === "Fixed offset must look like +02:00 or -0500.", "an invalid offset is an inline error");
    d.querySelector("#formatEditName").value = "TZ test";
    await w.saveFormatEdit();
    assert(!d.querySelector("#formatEditError").classList.contains("hidden") && d.querySelector("#formatEditError").textContent.includes("Fixed offset must look like"), "Save is blocked with that message");
    assert(!T.state.logFormats.some(f => f.name === "TZ test"), "...and nothing was saved");
    fixed.value = "-05:00"; fireInput(fixed, w);
    assert(status().textContent.endsWith("source: UTC-05:00 (format)") && previewTime() === w.formatTime(first + 5 * HOUR), "fixed offset: status and preview, got " + status().textContent);
    mode.value = "named"; change(mode);
    assert(isVisible(named, w) && !isVisible(fixed, w) && named.getAttribute("list") === "fwzTzList", "Time zone shows its input with a datalist");
    assert(d.querySelector("#fwzTzList").options.length === 0 || [...d.querySelector("#fwzTzList").options].some(o => o.value === "America/New_York"), "datalist holds IANA names when the engine lists them");
    named.value = "Mars/Phobos"; fireInput(named, w);
    assert((d.querySelector("#fwzStatus .fwz-error") || {}).textContent === 'Unknown time zone "Mars/Phobos".', "an unknown name is an inline error");
    named.value = ""; fireInput(named, w);
    assert((d.querySelector("#fwzStatus .fwz-error") || {}).textContent === "Enter a time zone name, e.g. America/New_York.", "an empty name too");
    named.value = "America/New_York"; fireInput(named, w);
    assert(status().textContent.endsWith("source: America/New_York (format)") && previewTime() === w.formatTime(first + 5 * HOUR), "IANA: status and preview, got " + status().textContent);
    await w.saveFormatEdit();
    let saved = T.state.logFormats.find(f => f.name === "TZ test");
    assert(saved && saved.timeZone === "America/New_York", "saved with its time zone");

    w.openFormatEditDialog(saved.id);
    assert(mode.value === "named" && named.value === "America/New_York" && isVisible(named, w), "Edit reopens on the saved zone");
    mode.value = "fixed"; change(mode); fixed.value = "+0530"; fireInput(fixed, w);
    await w.saveFormatEdit();
    saved = T.state.logFormats.find(f => f.name === "TZ test");
    assert(saved.timeZone === "+05:30", "a fixed offset is stored as +HH:MM, got " + saved.timeZone);
    w.openFormatEditDialog(saved.id);
    assert(mode.value === "fixed" && fixed.value === "+05:30", "...and reopens as fixed");
    mode.value = "utc"; change(mode);
    await w.saveFormatEdit();
    assert(T.state.logFormats.find(f => f.name === "TZ test").timeZone === "UTC", "UTC saved");
    w.openFormatEditDialog(saved.id);
    mode.value = "local"; change(mode);
    await w.saveFormatEdit();
    assert(!("timeZone" in T.state.logFormats.find(f => f.name === "TZ test")), "Local time drops the field (missing = default)");

    section("format-time-zone g. Export / import carries the zone; a file under the saved format uses it");
    const fmtId = saved.id;
    T.state.logFormats.find(f => f.id === fmtId).timeZone = "Asia/Tokyo";
    const exported = w.serializeLogFormatExport(fmtId);
    assert(exported.logFormat.timeZone === "Asia/Tokyo", "the export holds timeZone");
    let parsed = w.parseLogFormatExport(JSON.stringify(exported));
    assert(parsed && !parsed.error && parsed.logFormat.timeZone === "Asia/Tokyo", "the import accepts it");
    delete exported.logFormat.timeZone;
    parsed = w.parseLogFormatExport(JSON.stringify(exported));
    assert(parsed && !("timeZone" in parsed.logFormat), "an export without it imports as the default");
    exported.logFormat.timeZone = 42;
    assert(!("timeZone" in w.parseLogFormatExport(JSON.stringify(exported)).logFormat), "a non-string value is dropped");
    exported.logFormat.timeZone = "-05:00";
    w.openFormatEditDialog(null, w.parseLogFormatExport(JSON.stringify(exported)));
    assert(mode.value === "fixed" && fixed.value === "-05:00", "importing opens the dialog with the zone filled in");
    w.closeFormatEditDialog();
  });

  await withApp(async (w, d, T) => {
    section("format-time-zone h. Dialog: offsets are detected and become XXX; the hint for a format without it");
    await waitForFormatConfig(T);
    const status = () => d.querySelector("#fwzStatus .fwz-time-status");
    const sys = simFile("syslog", 12, 20, { tsOffset: "Z" });
    w.openFormatEditDialog(null);
    w.fwzAppendText(sys.file.text);
    const tsEl = d.querySelector("#formatEditTsFormat");
    assert(tsEl.value === "yyyy-MM-ddTHH:mm:ss.SSSXXX", "the suggested timestamp format ends in XXX, got " + tsEl.value);
    assert(/\(\?<ts>[^)]*\(\?:Z\|\[\+-\]\\d\{2\}:\?\\d\{2\}\)\)/.test(d.querySelector("#formatEditRegex").value) || d.querySelector("#formatEditRegex").value.includes("Z|"), "...and the ts capture includes the offset, got " + d.querySelector("#formatEditRegex").value);
    const firstLine = sys.file.text.split("\n")[0];
    const raw = firstLine.match(/\d{4}-\d{2}-\d{2}T\S+Z/)[0];
    assert(status() && status().textContent === raw + " → " + w.formatTime(sys.gen[0].ts) + " shown in your local time · source: offset Z from the line",
      "status line names the offset from the line, got " + (status() && status().textContent));
    assert(!status().textContent.includes("add XXX"), "no hint when the format has XXX");
    // +HH:MM lines
    const plus = simFile("syslog", 12, 20, { tsOffset: "+05:30" });
    w.openFormatEditDialog(null);
    w.fwzAppendText(plus.file.text);
    assert(tsEl.value === "yyyy-MM-ddTHH:mm:ss.SSSXXX" && status().textContent.endsWith("source: offset +05:30 from the line") && status().textContent.includes("→ " + w.formatTime(plus.gen[0].ts)), "+05:30 lines: XXX and the offset in the status, got " + status().textContent);
    // The offset wins over a chosen zone, also in the status line.
    d.querySelector("#fwzTzMode").value = "utc"; d.querySelector("#fwzTzMode").dispatchEvent(new w.Event("change", { bubbles: true }));
    assert(status().textContent.endsWith("source: offset +05:30 from the line"), "an offset in the line wins over the zone setting");
    // Typing a format without XXX: the line is no longer recognized, and says why.
    tsEl.value = "yyyy-MM-ddTHH:mm:ss.SSS"; fireInput(tsEl, w);
    const warn = d.querySelector("#fwzStatus .fwz-warn");
    assert(warn && warn.textContent.includes("not recognized") && warn.textContent.endsWith("· line has an offset, add XXX to use it"), "hint to add XXX, got " + (warn && warn.textContent));
    // Re-suggest brings XXX back.
    assert(w.fwzResuggest() && tsEl.value === "yyyy-MM-ddTHH:mm:ss.SSSXXX", "Re-suggest detects the offset again, got " + tsEl.value);
    // Time zone abbreviations and a date like 10-10-2026 are not offsets.
    assert(w.detectTsFormatFromValues(["10-10-2026"]) === "MM-dd-yyyy", "a date ending in -2026 is not an offset");
    assert(w.detectTsFormatFromValues(["2026-01-15T08:00:00.127Z", "2026-01-15T08:00:01.200+02:00"]) === "yyyy-MM-ddTHH:mm:ss.SSSXXX", "Z and +HH:MM mixed in the examples");
    assert(!w.detectTsFormatFromValues(["2026-01-15 08:00:00 +0200"]).includes("XXX"), "an offset behind a space isn't the XXX token");
    // Marked columns: the ts mark that includes the offset derives XXX and a matching regex.
    const lines = sys.file.text.trimEnd().split("\n").slice(0, 6);
    const marks = [];
    lines.forEach((l, i) => {
      const s = l.indexOf("2026"), e = l.indexOf("Z ", s) + 1;
      marks.push({ line: i, start: s, end: e, key: "ts" });
      const ms = l.indexOf(" - ") + 3;
      marks.push({ line: i, start: ms, end: l.length, key: "message" });
    });
    const der = w.deriveFormatRegexFromMarks(lines, marks, {});
    assert(!der.error && der.tsFormat === "yyyy-MM-ddTHH:mm:ssXXX" || der.tsFormat === "yyyy-MM-ddTHH:mm:ss.SSSXXX", "marks including the offset derive XXX, got " + (der.error || der.tsFormat));
    const re = new RegExp(der.source);
    assert(lines.every(l => re.test(l)) && (der.source.match(/\((?!\?)/g) || []).length === 0, "the derived regex matches every example and has only named groups");
  });

  await withApp(async (w, d, T) => {
    section("format-time-zone i. Dialog, JSON Lines kind");
    await waitForFormatConfig(T);
    const change = elx => elx.dispatchEvent(new w.Event("change", { bubbles: true }));
    const status = () => d.querySelector("#fwzStatus .fwz-time-status");
    const jOff = simFile("jsonl", 10, 21, { tsOffset: "+05:30" });
    w.openFormatEditDialog(null);
    w.fwzAppendText(jOff.file.text);
    assert(d.querySelector("#formatEditModeJson").classList.contains("active") && isVisible(d.querySelector("#fwzTzMode"), w), "the Time zone field is there for JSON Lines");
    assert(status() && status().textContent.includes("source: offset +05:30 from the line") && status().textContent.includes("→ " + w.formatTime(jOff.gen[0].ts)), "free-form string with an offset, got " + (status() && status().textContent));
    const plain = simFile("jsonl", 10, 21);
    w.openFormatEditDialog(null);
    w.fwzAppendText(plain.file.text);
    assert(status().textContent.endsWith("source: local time (format)") && status().textContent.includes("→ " + w.formatTime(localOf(plain.gen[0].ts))), "without an offset: local, got " + status().textContent);
    const mode = d.querySelector("#fwzTzMode");
    mode.value = "utc"; change(mode);
    assert(status().textContent.endsWith("source: UTC (format)") && status().textContent.includes("→ " + w.formatTime(plain.gen[0].ts)), "UTC for JSON Lines, got " + status().textContent);
    d.querySelector("#formatEditName").value = "JSON TZ";
    await w.saveFormatEdit();
    const saved = T.state.logFormats.find(f => f.name === "JSON TZ");
    assert(saved && saved.mode === "json" && saved.timeZone === "UTC", "saved on a JSON format");
    // Meta formats carry no zone of their own.
    T.state.logFormats.push({ id: "meta-tz", name: "meta tz", mode: "meta", targetFormatIds: [saved.id, "fmt-default"], timeZone: "UTC", builtin: false, edited: false, createdAt: 0 });
    w.openFormatEditDialog("meta-tz");
    await w.saveFormatEdit();
    assert(!("timeZone" in T.state.logFormats.find(f => f.id === "meta-tz")), "a meta format never stores a zone");
  });
}
