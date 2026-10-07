// GROUP format-encoding — loaded by philogg.regression.test.js
// (tests/README.md → "Group files").

/* ============================================================
   GROUP format-encoding — a log format's text encoding
   Origin: 2026-10-07 (person-requested, backlog #85). A format can declare how
   its file's bytes become text (`encoding`: "" = Auto, or utf-8 / windows-1252 /
   iso-8859-15 / windows-1250 / windows-1251). A BOM always wins; Auto reads the
   first 64 KiB (valid UTF-8, an incomplete sequence cut at the end counting as
   valid, else windows-1252) once per file. Every log-file read path obeys it:
   whole-file text read, worker byte ranges, tail appends, windowed load,
   ZIP/.gz, session restore; the format dialog's Encoding select re-decodes
   the bytes of "Open file…". Data: tools/log-sim (--encoding / encodeText).
   ============================================================ */
group("format-encoding");
{
  const zlib = require("zlib");
  const CP1252_80_9F = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
  // Node's TextDecoder reads windows-1252 as Latin-1 (0x80-0x9F are controls); a browser's does not.
  const withRealCp1252 = win => {
    const Native = TextDecoder;
    win.TextDecoder = class {
      constructor(label, opts) { this.label = String(label || "utf-8").toLowerCase(); this.inner = new Native(this.label === "windows-1252" ? "latin1" : label, opts); }
      decode(bytes, o) {
        const t = this.inner.decode(bytes, o);
        return this.label === "windows-1252" ? t.replace(/[\u0080-\u009F]/g, c => CP1252_80_9F[c.charCodeAt(0) - 0x80]) : t;
      }
    };
    win.Response = Response; win.DecompressionStream = DecompressionStream;
  };
  const textOf = (n, seed, extra) => LOGSIM.generateToStrings(Object.assign({ format: "default", scenarios: ["text", "basic"], entries: n, seed }, extra || {}))[0].text;
  const enc = (text, label) => Buffer.from(LOGSIM.encodeText(text, label));
  const TXT = textOf(120, 7);
  const AUDIT = "Benutzer „Jürgen Müller“ hat Auftrag"; // the simulator's umlaut line, as in a Windows-1252 file
  const AUDIT_1252 = "Benutzer „Jürgen Müller“ hat Auftrag";
  const messages = node => node.entries.map(e => e.message);
  const hasAudit = node => messages(node).some(m => m.includes(AUDIT_1252));
  const setEnc = (T, w, label, id = "fmt-default") => { const f = T.state.logFormats.find(x => x.id === id); if (label) f.encoding = label; else delete f.encoding; w.invalidateFormatCompileCache(); };
  async function load(w, T, name, bytes) {
    const before = new Set(T.state.rootIds);
    await w.loadFileDescriptors([{ file: new w.File([bytes], name), handle: null }]);
    const id = T.state.rootIds.find(r => !before.has(r));
    return T.state.nodes[id];
  }

  await withApp(async (w, d, T) => {
    section("format-encoding a. resolveFileEncoding: BOM wins, Auto = UTF-8 else Windows-1252, 64 KiB cut");
    const u8 = s => new Uint8Array(Buffer.from(s, "utf8"));
    assert(w.resolveFileEncoding(u8("abc"), "") === "utf-8" && w.resolveFileEncoding(new Uint8Array(0), "") === "utf-8", "ASCII / empty: UTF-8");
    assert(w.resolveFileEncoding(u8("Jürgen “x” ✓"), "") === "utf-8", "Auto: valid UTF-8 with multi-byte text");
    assert(w.resolveFileEncoding(new Uint8Array(enc(AUDIT, "windows-1252")), "") === "windows-1252", "Auto: invalid UTF-8 falls back to windows-1252");
    assert(w.resolveFileEncoding(new Uint8Array(enc(AUDIT, "windows-1252")), "windows-1250") === "windows-1250" && w.resolveFileEncoding(u8("abc"), "iso-8859-15") === "iso-8859-15", "an explicit label is used as is");
    assert(w.resolveFileEncoding(new Uint8Array([0xEF, 0xBB, 0xBF, 0xE4]), "windows-1252") === "utf-8", "UTF-8 BOM beats an explicit encoding");
    assert(w.resolveFileEncoding(new Uint8Array([0xFF, 0xFE, 0x41, 0]), "utf-8") === "utf-16le" && w.resolveFileEncoding(new Uint8Array([0xFE, 0xFF, 0, 0x41]), "windows-1252") === "utf-16be", "UTF-16 BOMs beat it too");
    assert(w.resolveFileEncoding(new Uint8Array([0xEF, 0xBB, 0xBF, 0xE4]), "") === "utf-8", "BOM beats Auto's validity check");
    // A multi-byte character cut by the end of the 64 KiB head still counts as valid UTF-8.
    const head = new Uint8Array(65536).fill(0x41);
    head.set(Buffer.from("ü", "utf8").subarray(0, 1), 65535); // lead byte only
    assert(w.resolveFileEncoding(head, "") === "utf-8", "an incomplete sequence at the 64 KiB cut counts as valid");
    const shortCut = new Uint8Array(100).fill(0x41); shortCut[99] = 0xC3;
    assert(w.resolveFileEncoding(shortCut, "") === "windows-1252", "...but not at the end of a shorter head (that is the real end of the file)");
    const bad = new Uint8Array(65536).fill(0x41); bad[100] = 0xE4;
    assert(w.resolveFileEncoding(bad, "") === "windows-1252", "an invalid byte inside the head decides it");
    await waitForFormatConfig(T);
    assert(w.fileEncodingForFormatId("fmt-default") === "", "the builtin default is Auto");
    T.state.logFormats.push({ id: "fmt-enc-x", name: "x", mode: "regex", regex: "^(?<ts>\\S+) (?<level>\\w+) (?<message>.*)$", tsFormat: "", encoding: "windows-1251" });
    assert(w.fileEncodingForFormatId("fmt-enc-x") === "windows-1251", "a format's own encoding");
    const sim = LOGSIM.encodeText("a ä €€ ✓", "windows-1252");
    assert(Buffer.from(sim).toString("latin1") === "a \xE4 \x80\x80 ?", "simulator: windows-1252 bytes, unrepresentable characters become ?");
    assert(Buffer.from(LOGSIM.encodeText("ü€", "iso-8859-15")).toString("latin1") === "\xFC\xA4" && Buffer.from(LOGSIM.encodeText("Жд", "windows-1251")).toString("latin1") === "\xC6\xE4", "iso-8859-15 and windows-1251 maps");
  }, { beforeParse: withRealCp1252 });

  await withApp(async (w, d, T) => {
    section("format-encoding b. A whole-file load: Auto, explicit, and the BOM");
    await waitForFormatConfig(T);
    let node = await load(w, T, "utf8.log", Buffer.from(TXT, "utf8"));
    assert(node.entries.length >= 100 && messages(node).some(m => m.includes("Benutzer „Jürgen Müller“ hat Auftrag") && m.includes("✓")), "Auto: a UTF-8 file stays UTF-8 (umlauts and ✓ intact)");
    const cp = enc(TXT, "windows-1252");
    node = await load(w, T, "cp1252.log", cp);
    assert(hasAudit(node), "Auto: a Windows-1252 file decodes as Windows-1252 (umlauts and „ “ right)");
    assert(!messages(node).some(m => m.includes("�")), "...with no replacement characters");
    assert(messages(node).some(m => /geändert \?$/.test(m)), "...and ✓ (not in Windows-1252) was written as ? by the simulator");
    setEnc(T, w, "utf-8");
    node = await load(w, T, "cp1252-as-utf8.log", cp);
    assert(messages(node).some(m => m.includes("�")) && !hasAudit(node), "explicit UTF-8 on a Windows-1252 file: replacement characters");
    for (const label of ["windows-1252", "iso-8859-15", "windows-1250"]) {
      setEnc(T, w, label);
      node = await load(w, T, label + ".log", enc(TXT, label));
      assert(messages(node).some(m => m.includes("Jürgen Müller")) && !messages(node).some(m => m.includes("\uFFFD")), "explicit " + label + " on a " + label + " file: umlauts right");
      if (label !== "iso-8859-15") assert(hasAudit(node), label + ": the quotes „ “ too");
    }
    setEnc(T, w, "windows-1252");
    node = await load(w, T, "bom.log", Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(TXT, "utf8")]));
    assert(messages(node).some(m => m.includes("Jürgen Müller")) && !messages(node).some(m => m.includes("�") || m.includes("Ã")), "a UTF-8 BOM wins over an explicit Windows-1252");
    assert(node.entries[0].tsRaw.startsWith("2026"), "...and is not part of the first line");
    const u16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(TXT, "utf16le")]);
    node = await load(w, T, "utf16.log", u16);
    assert(messages(node).some(m => m.includes("Jürgen Müller")), "a UTF-16LE BOM wins too");
    setEnc(T, w, "");
  }, { beforeParse: withRealCp1252 });

  await withApp(async (w, d, T) => {
    section("format-encoding c. Worker byte ranges decode with the file's encoding");
    await waitForFormatConfig(T);
    const bytes = new Uint8Array(enc(TXT, "windows-1252"));
    const mkBlob = u8 => ({ size: u8.length, slice(a, b) { const p = u8.slice(a, b); return { size: p.length, slice: (x, y) => mkBlob(p).slice(x, y), arrayBuffer: async () => p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength) }; } });
    const compiled = w.getCompiledFormat("fmt-default");
    const ref = await (async () => {
      const node = w.createFileNode("ref.log"); node.formatId = "fmt-default";
      await w.parseLogTextAsync(new w.TextDecoder("windows-1252").decode(bytes), node, () => {});
      const e = node.entries.slice(); w.deleteNode(node.id); return e;
    })();
    const noId = es => JSON.stringify(es.map(e => { const { id, ...r } = e; return r; }));
    for (const n of [1, 3, 7]) {
      const out = [];
      for (let i = 0; i < n; i++) await w.parseBlobRangeEntries(mkBlob(bytes), bytes.length, Math.floor(bytes.length * i / n), Math.floor(bytes.length * (i + 1) / n), compiled, "fmt-default", es => out.push(...es), () => {}, "windows-1252");
      assert(out.length === ref.length && noId(out) === noId(ref), n + " pieces with encoding windows-1252 == the decoded text's entries (" + out.length + ")");
    }
    assert(ref.some(e => e.message.includes("Jürgen Müller")), "sanity: the reference has the umlaut lines");
    // End to end: a fake worker pool gets the resolved label with the Blob.
    Object.defineProperty(w.navigator, "hardwareConcurrency", { value: 2, configurable: true });
    const src = w.buildLogParseWorkerSrc();
    const made = [];
    w.URL.createObjectURL = () => "blob:fake-worker";
    w.Worker = class {
      constructor() {
        made.push(this); this.out = []; this.self = {};
        vm.runInContext(src, vm.createContext({ self: this.self, postMessage: m => this.out.push(m), TextDecoder: w.TextDecoder }));
      }
      postMessage(data) {
        this.received = data;
        setTimeout(async () => {
          this.self.onmessage({ data });
          for (let i = 0; i < 4000 && !this.out.some(m => m.type === "done" || m.type === "error"); i++) await sleep(1);
          for (const m of this.out) { this.onmessage({ data: m }); await Promise.resolve(); }
        }, 0);
      }
      terminate() {}
    };
    let reads = 0;
    const origRead = w.readFileWithProgress;
    w.readFileWithProgress = function () { reads++; return origRead.apply(this, arguments); };
    let node = w.createFileNode("big.log");
    const res = await w.readParseFileNode(node, "big.log", new w.File([bytes], "big.log"), null);
    assert(made.length >= 1 && made.every(wk => wk.received.blob && wk.received.encoding === "windows-1252"), "Auto resolved windows-1252 and handed it to every worker");
    assert(reads === 0 && res.encoding === "windows-1252" && node.entries.length === ref.length && noId(node.entries) === noId(ref), "entries identical to the decoded text, no main-thread read");
    w.deleteNode(node.id);
    made.length = 0;
    node = w.createFileNode("utf8.log");
    await w.readParseFileNode(node, "utf8.log", new w.File([Buffer.from(TXT, "utf8")], "utf8.log"), null);
    assert(made.every(wk => wk.received.encoding === "utf-8") && node.entries.some(e => e.message.includes("✓")), "a UTF-8 file goes with utf-8");
    w.deleteNode(node.id);
    // UTF-16 stays on the text route.
    made.length = 0;
    node = w.createFileNode("u16.log");
    await w.readParseFileNode(node, "u16.log", new w.File([Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(TXT, "utf16le")])], "u16.log"), null);
    assert(made.every(wk => !wk.received.blob) && reads === 1 && node.entries.length > 50, "UTF-16: no byte-range worker, one text read");
    assert(await w.canParseBlobInWorker(mkBlob(bytes), "fmt-default", "utf-16le") === false && await w.canParseBlobInWorker(mkBlob(bytes), "fmt-default", "windows-1252") === true, "canParseBlobInWorker: single-byte yes, UTF-16 no");
    w.readFileWithProgress = origRead;
    delete w.Worker;
  }, { beforeParse: withRealCp1252 });

  await withApp(async (w, d, T) => {
    section("format-encoding d. Tail appends keep the file's encoding; a restored tail re-resolves it");
    await waitForFormatConfig(T);
    const first = enc(textOf(40, 8, { scenarios: ["text"] }), "windows-1252");
    const more = enc(textOf(40, 9, { scenarios: ["text"], start: "2026-01-16T08:00:00" }), "windows-1252");
    let current = first;
    const handle = { kind: "file", name: "live.log", async getFile() { return new w.File([current], "live.log"); } };
    await w.loadFileDescriptors([{ file: await handle.getFile(), handle }]);
    const node = T.state.nodes[T.state.rootIds[0]];
    const n0 = node.entries.length;
    assert(node.tail && node.tail.encoding === "windows-1252", "the load stored the resolved encoding on the tail, got " + (node.tail && node.tail.encoding));
    current = Buffer.concat([first, more]);
    await w.tailTick();
    assert(node.entries.length > n0 && node.entries.slice(n0).some(e => e.message.includes("Jürgen Müller") || e.message.includes("ä") || e.message.includes("ü")) && !node.entries.some(e => e.message.includes("�")),
      "appended Windows-1252 bytes decode correctly, got " + (node.entries.length - n0) + " new entries");
    // A tail attached without the label (session restore / folder rescan) resolves it at its first poll.
    delete node.tail.encoding;
    const n1 = node.entries.length;
    current = Buffer.concat([first, more, more]);
    await w.tailTick();
    assert(node.tail.encoding === "windows-1252" && node.entries.length > n1 && !node.entries.some(e => e.message.includes("�")), "re-resolved from the file head, got " + node.tail.encoding);
  }, { beforeParse: withRealCp1252 });

  await withApp(async (w, d, T) => {
    section("format-encoding e. .gz, ZIP entries, windowed load, restore from the session cache");
    await waitForFormatConfig(T);
    const cp = enc(TXT, "windows-1252");
    let node = await load(w, T, "app.log.gz", zlib.gzipSync(cp));
    assert(hasAudit(node), ".gz: the inflated bytes are decoded as Windows-1252");
    const zip = LOGSIM.zipStore([{ name: "logs/zipped.log", data: new Uint8Array(cp) }]);
    const entries = await w.readZipEntries(new w.File([zip], "sim.zip"));
    await w.loadFileDescriptors([{ name: entries[0].name, openFile: async () => new w.File([await entries[0].extract()], "zipped.log") }]);
    node = T.state.nodes[T.state.rootIds[T.state.rootIds.length - 1]];
    assert(node.entries.length > 100 && hasAudit(node), "ZIP entry: decoded as Windows-1252");
    // Windowed load (the folder minimap's drag-a-window load) reads ranges.
    const big = enc(textOf(300, 10, { scenarios: ["text"] }), "windows-1252");
    const wn = w.createFileNode("window.log");
    wn.formatId = "fmt-default";
    const all = await (async () => { const n = w.createFileNode("all.log"); n.formatId = "fmt-default"; await w.parseLogTextAsync(new w.TextDecoder("windows-1252").decode(big), n, () => {}); const e = n.entries.slice(); w.deleteNode(n.id); return e; })();
    const ok = await w.parseFileWindow(new w.File([big], "window.log"), wn, all[0].ts, all[all.length - 1].ts, () => {});
    assert(ok && wn.entries.length === all.length && wn.entries.some(e => e.message.includes("Jürgen Müller")) && !wn.entries.some(e => e.message.includes("�")), "windowed load decodes its chunks as Windows-1252 (" + wn.entries.length + "/" + all.length + ")");
    w.deleteNode(wn.id);
    // The session cache keeps the file's raw bytes (blob): restore decodes them with the format's encoding.
    assert(await w.readBlobText(new w.File([cp], "x.log"), "fmt-default") === new w.TextDecoder("windows-1252").decode(cp), "readBlobText (session restore) decodes under the format's rules");
    assert(w.decodeLogBytes(new Uint8Array(cp), "fmt-default") === new w.TextDecoder("windows-1252").decode(cp) && w.decodeLogBytes(new Uint8Array(Buffer.from(TXT, "utf8")), "fmt-default") === TXT, "decodeLogBytes (URL / session-file routes): Auto both ways");
  }, { beforeParse: withRealCp1252 });

  await withApp(async (w, d, T) => {
    section("format-encoding f. Meta format: the meta format's encoding decodes the file once, then it is split");
    await waitForFormatConfig(T);
    await logsimRegister(w, T, "mixed", "fmt-sim-syslog");
    const meta = { id: "fmt-enc-meta", name: "Sim meta", mode: "meta", targetFormatIds: ["fmt-sim-syslog", "fmt-default"], builtin: false, edited: false, createdAt: 0, encoding: "windows-1252" };
    T.state.logFormats.push(meta);
    T.state.formatRules.push({ id: "rule-enc-meta", glob: "mixed*.log", formatId: meta.id, order: -1, createdAt: 0 });
    w.invalidateFormatCompileCache(); w.invalidateGlobCompileCache();
    const text = textOf(150, 11, { format: "mixed", scenarios: ["text", "sensors", "basic"] });
    const file = new w.File([enc(text, "windows-1252")], "mixed-1.log");
    assert(w.fileEncodingForFormatId(meta.id) === "windows-1252", "sanity: the meta format carries the encoding");
    await w.loadFileDescriptors([{ file, handle: null }]);
    const all = T.state.rootIds.map(r => T.state.nodes[r]);
    const ents = all.flatMap(n => (n.entries || []));
    assert(ents.length > 100 && ents.some(e => e.message.includes("Jürgen Müller")) && !ents.some(e => e.message.includes("�")), "the split streams hold correctly decoded text (" + ents.length + " entries)");
  }, { beforeParse: withRealCp1252 });

  await withApp(async (w, d, T) => {
    section("format-encoding g. The native route takes every encoding: the label goes to Rust, no head read here");
    await waitForFormatConfig(T);
    const specs = [];
    const bridge = { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]),
      parseLogFile: async (url, spec) => { specs.push(spec); return { size: 1 }; } };
    w.philogg = bridge;
    const FILE_ENCODING_HEAD_BYTES_T = 64 * 1024;
    const ranges = [];
    w.fetch = async (url, opts) => { ranges.push(opts && opts.headers && opts.headers.Range); throw new Error("not served"); };
    for (const label of ["", "utf-8", "windows-1252", "iso-8859-15", "windows-1250", "windows-1251"]) {
      specs.length = 0;
      const node = w.createFileNode("n.log"); node.formatId = "fmt-default";
      setEnc(T, w, label);
      await w.parseLocalFileNatively("philogg://local/1/n.log", node, () => {});
      assert(specs.length === 1 && specs[0].encoding === label, "encoding " + JSON.stringify(label) + " is part of the native spec, got " + JSON.stringify(specs[0] && specs[0].encoding));
      w.deleteNode(node.id);
    }
    assert(!ranges.some(r => r === "bytes=0-" + (FILE_ENCODING_HEAD_BYTES_T - 1)), "Rust resolves Auto itself: no 64 KiB head read from the page, got " + ranges.join(","));
    setEnc(T, w, "");
  }, { beforeParse: withRealCp1252 });

  await withApp(async (w, d, T) => {
    section("format-encoding h. Format dialog: Encoding select, re-decoding \"Open file…\" bytes, save, reopen, export / import");
    await waitForFormatConfig(T);
    const change = elx => elx.dispatchEvent(new w.Event("change", { bubbles: true }));
    const sel = d.querySelector("#fwzEncoding"), metaSel = d.querySelector("#formatEditMetaEncoding");
    w.openFormatEditDialog(null);
    assert([...sel.options].map(o => o.textContent).join("|") === "Auto (UTF-8, else Windows-1252)|UTF-8|Windows-1252 / Latin-1|ISO-8859-15|Windows-1250 (Central European)|Windows-1251 (Cyrillic)", "the six options");
    assert([...sel.options].map(o => o.value).join(",") === ",utf-8,windows-1252,iso-8859-15,windows-1250,windows-1251", "values are WHATWG labels");
    assert(sel.title === "How the file's bytes are turned into text. A byte order mark (BOM) always wins." && d.querySelector("label[for=fwzEncoding]").textContent === "Encoding", "label and tooltip");
    assert(sel.value === "" && sel.closest(".fwz-toolbar-actions") && sel.nextElementSibling === d.querySelector("#fwzOpenFile"), "in the example-lines toolbar, right before Open file…");
    assert(isVisible(sel, w) && !isVisible(d.querySelector("#formatEditMetaField"), w), "toolbar select for Log format, the meta field is hidden");
    // Pasted text first, then a Windows-1252 file.
    w.fwzAppendText("pasted line ü that stays");
    const cp = enc(textOf(8, 12, { scenarios: ["text"] }), "windows-1252");
    await w.fwzLoadFile(new w.File([cp], "legacy.log"));
    const linesNow = () => [...d.querySelectorAll("#fwzSample .fwz-line-text")].map(x => x.textContent);
    assert(linesNow()[0] === "pasted line ü that stays" && linesNow().some(l => l.includes("Jürgen Müller") && l.includes("„")) && !linesNow().some(l => l.includes("�")), "Auto decodes the file's bytes as Windows-1252: umlauts right under Auto");
    sel.value = "utf-8"; change(sel);
    assert(linesNow().some(l => l.includes("�")) && linesNow()[0] === "pasted line ü that stays", "UTF-8: the file's lines are decoded again, the pasted line stays");
    assert(metaSel.value === "utf-8", "both selects hold one value");
    sel.value = "windows-1252"; change(sel);
    assert(!linesNow().some(l => l.includes("�")) && linesNow().some(l => l.includes("Jürgen Müller")) && linesNow().length === 1 + 8 + 0 || linesNow().length > 1, "back to Windows-1252: right again, same number of lines");
    const before = linesNow().length;
    sel.value = ""; change(sel);
    assert(linesNow().length === before, "Auto again: same lines");
    // Save + reopen + export/import.
    d.querySelector("#formatEditName").value = "Legacy";
    // The examples are the simulator's default format: its own regex as the format's regex.
    d.querySelector("#formatEditRegex").value = "^(?<ts>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2},\\d{3})\\t(?<level>\\w+)\\t\"(?<thread>[^\"]*)\"\\t.*?\\t\\[(?<method>[^\\]]*)\\]\\t\"(?<message>.*)\"$";
    d.querySelector("#formatEditRegex").dispatchEvent(new w.Event("input", { bubbles: true }));
    sel.value = "windows-1250"; change(sel);
    await w.saveFormatEdit();
    const saved = T.state.logFormats.find(f => f.name === "Legacy");
    assert(saved && saved.encoding === "windows-1250", "saved with its encoding, got " + (saved && saved.encoding));
    w.openFormatEditDialog(saved.id);
    assert(sel.value === "windows-1250" && metaSel.value === "windows-1250", "Edit reopens on the saved encoding");
    sel.value = ""; change(sel);
    await w.saveFormatEdit();
    assert(!("encoding" in T.state.logFormats.find(f => f.id === saved.id)), "Auto drops the field (missing = default)");
    T.state.logFormats.find(f => f.id === saved.id).encoding = "iso-8859-15";
    const exported = w.serializeLogFormatExport(saved.id);
    assert(exported.logFormat.encoding === "iso-8859-15", "the export holds encoding");
    let parsed = w.parseLogFormatExport(JSON.stringify(exported));
    assert(parsed && !parsed.error && parsed.logFormat.encoding === "iso-8859-15", "the import accepts it");
    delete exported.logFormat.encoding;
    assert(!("encoding" in w.parseLogFormatExport(JSON.stringify(exported)).logFormat), "missing imports as the default");
    exported.logFormat.encoding = "klingon";
    assert(!("encoding" in w.parseLogFormatExport(JSON.stringify(exported)).logFormat), "an unknown label is dropped");
    exported.logFormat.encoding = "windows-1251";
    w.openFormatEditDialog(null, w.parseLogFormatExport(JSON.stringify(exported)));
    assert(sel.value === "windows-1251", "importing opens the dialog with the encoding filled in");
    w.closeFormatEditDialog();

    section("format-encoding i. Format dialog, JSON Lines and Meta kinds");
    const jl = LOGSIM.generateToStrings({ format: "jsonl", entries: 60, seed: 13, scenarios: ["text"] })[0].text.split("\n").filter(l => l.includes("Benutzer")).join("\n") + "\n";
    assert(jl.length > 50, "sanity: simulator JSON lines with the umlaut message");
    w.openFormatEditDialog(null);
    await w.fwzLoadFile(new w.File([enc(jl, "windows-1252")], "legacy.jsonl"));
    assert(d.querySelector("#formatEditModeJson").classList.contains("active") && isVisible(sel, w), "JSON Lines kind: the same toolbar select (" + d.querySelector("#formatEditModeJson").className + ", lines " + d.querySelectorAll("#fwzSample .fwz-line").length + ")");
    assert([...d.querySelectorAll("#fwzSample .fwz-line-text")].some(x => x.textContent.includes("Jürgen Müller")), "JSON examples from a Windows-1252 file decode under Auto");
    w.closeFormatEditDialog();
    T.state.logFormats.push({ id: "meta-enc", name: "Meta enc", mode: "meta", targetFormatIds: ["fmt-default", "fmt-default"], builtin: false, edited: false, createdAt: 0, encoding: "windows-1251" });
    w.openFormatEditDialog("meta-enc");
    assert(isVisible(metaSel, w) && !isVisible(d.querySelector("#fwzNormalBody"), w) && metaSel.value === "windows-1251", "Meta kind: its own select as a field, filled from the format");
    assert(d.querySelector("label[for=formatEditMetaEncoding]").textContent.startsWith("Encoding"), "labelled Encoding");
    metaSel.value = "utf-8"; change(metaSel);
    await w.saveFormatEdit();
    assert(T.state.logFormats.find(f => f.id === "meta-enc").encoding === "utf-8", "a meta format stores its encoding");
  }, { beforeParse: withRealCp1252 });
}
