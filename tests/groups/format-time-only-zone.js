// GROUP format-time-only-zone — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP format-time-only-zone — a time-only tsFormat with a format time zone
   Origin: 2026-10-07 (backlog #116). A tsFormat without date tokens
   (HH:mm:ss.SSS) is a time of day on the 1970-01-01 placeholder date. A format
   time zone east or west of the viewer used to shift that instant across
   midnight, so formatTime showed a date. The shifted time of day now stays on
   the placeholder date (modulo 24 h) on every parse path (main thread, worker,
   native batch). Data: tools/log-sim bracket format with the date cut off.
   ============================================================ */
group("format-time-only-zone");
{
  const HOUR = 3600000;
  const sim = n => {
    const opts = { format: "bracket", entries: n, seed: 21, start: "2026-01-15T00:30:00", rate: 4 };
    const gen = Array.from({ length: n }, (g => () => g.next())(LOGSIM.createGenerator(opts)));
    // the simulator's lines with the date cut off: "[HH:mm:ss.SSS] LEVEL ..."
    const file = LOGSIM.generateToStrings(opts)[0];
    return { name: file.name, text: file.text.replace(/^\[\d{4}-\d{2}-\d{2} /gm, "["), gen };
  };
  const timeOnlyFormat = base => Object.assign({}, base, {
    regex: "^\\[(?<ts>\\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\] (?<level>[A-Z]+) \\((?<thread>[^)]*)\\) (?<message>.*)$",
    tsFormat: "HH:mm:ss.SSS",
  });
  // The expected shown time for naive wall clock `ms` shifted by `shiftMs`: its
  // local time of day (no date), what the viewer sees.
  // shiftMs null = read in this computer's zone: the time of day as written.
  const todLocal = (ms, shiftMs) => {
    const tod = ((ms % 86400000) + 86400000) % 86400000;
    const x = shiftMs === null ? new Date(1970, 0, 1, 0, 0, 0, tod) : new Date(tod + shiftMs);
    const p = (n, l) => String(n).padStart(l || 2, "0");
    return p(x.getHours()) + ":" + p(x.getMinutes()) + ":" + p(x.getSeconds()) + "." + p(x.getMilliseconds(), 3);
  };

  await withApp(async (w, d, T) => {
    section("format-time-only-zone a. no zone, UTC, east and west: formatTime never shows a date");
    await waitForFormatConfig(T);
    await logsimRegister(w, T, "bracket", "fmt-sim-bracket");
    const fmt = T.state.logFormats.find(f => f.id === "fmt-sim-bracket");
    Object.assign(fmt, timeOnlyFormat(fmt));
    const { name, text, gen } = sim(400);
    assert(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] /.test(text), "the sample lines carry a time only");
    let n = 0;
    for (const [tz, shift] of [["", null], ["UTC", 0], ["+09:00", -9 * HOUR], ["-05:00", 5 * HOUR], ["Asia/Kolkata", -5.5 * HOUR], ["America/New_York", 5 * HOUR]]) {
      if (tz) fmt.timeZone = tz; else delete fmt.timeZone;
      w.invalidateFormatCompileCache();
      const f = await w.addFile(name.replace(/-1\./, "-to" + (++n) + "."), text, () => {});
      const shown = f.entries.map(e => w.formatTime(e.ts));
      w.deleteNode(f.id);
      assert(f.entries.length === 400, "timeZone '" + tz + "': all entries parsed, got " + f.entries.length);
      assert(shown.every(s => /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(s)), "timeZone '" + tz + "': no date shown, e.g. " + shown.find(s => !/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(s)));
      const want = gen.map(e => todLocal(e.ts, shift));
      assert(shown.every((s, i) => s === want[i]), "timeZone '" + tz + "': the shifted time of day, first " + shown[0] + " want " + want[0]);
      // Order inside the file is only monotonic until the wrap at midnight; the
      // ts values must all be on the placeholder date.
      assert(f.entries.every(e => { const x = new Date(e.ts); return x.getFullYear() === 1970 && x.getMonth() === 0 && x.getDate() === 1; }), "timeZone '" + tz + "': every ts is on 1970-01-01");
    }

    section("format-time-only-zone b. the worker source and the native route agree");
    fmt.timeZone = "+09:00";
    w.invalidateFormatCompileCache();
    const posted = [], sandboxSelf = {};
    const ctx = vm.createContext({ self: sandboxSelf, postMessage: msg => posted.push(msg) });
    vm.runInContext(w.buildLogParseWorkerSrc(), ctx);
    sandboxSelf.onmessage({ data: { text, fmt: Object.assign({}, fmt) } });
    const got = posted.filter(m => m.type === "batch").flatMap(m => w.decodeNativeBatch(m.buf, m.strings).entries).map(e => e.ts);
    assert(got.length === 400 && got.every((t, i) => w.formatTime(t) === todLocal(gen[i].ts, -9 * HOUR)), "the worker keeps the shifted time of day, got " + got.length);

    const c = w.compileOneFormat(Object.assign({}, fmt, { timeZone: "UTC" }));
    const naiveEntries = text.split("\n").filter(l => c.isHeaderLine(l)).map(l => c.parseHeader(l));
    const enc = w.encodeEntryBatch(naiveEntries, 0.5);
    const tail = new w.TextEncoder().encode(enc.strings);
    const bytes = new w.Uint8Array(enc.buf.byteLength + tail.length);
    bytes.set(new w.Uint8Array(enc.buf), 0);
    bytes.set(tail, enc.buf.byteLength);
    w.philogg = { parseLogFile: async (url, spec, onMessage) => { onMessage(bytes.buffer); return { size: 1 }; } };
    const node = w.createFileNode("sim-bracket.log");
    node.formatId = "fmt-sim-bracket";
    await w.parseLocalFileNatively("philogg://local/1/sim-bracket.log", node, () => {});
    assert(node.entries.length === 400 && node.entries.every((e, i) => w.formatTime(e.ts) === todLocal(gen[i].ts, -9 * HOUR)), "the native route keeps the shifted time of day without a date");
  });
}
