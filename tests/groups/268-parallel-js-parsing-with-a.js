// GROUP 268 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 268 — Parallel JS parsing with a binary worker transport
   Origin: 2026-09-24, load/filter performance session. parseLogTextAsync's
   worker path cuts the text at header lines (splitTextAtHeaderLines) into
   one piece per core, and each worker sends its entries back as binary
   batches (encodeEntryBatch: the native parser's batch.rs layout, string
   section kept a JS string) that the page's decodeNativeBatch reads —
   instead of structured-cloned entry objects. Ids are assigned on the main
   thread in file order; worker ts are already local. The output must stay
   byte-identical to the main-thread parse (and so to the golden fixture).
   jsdom has no Worker: a fake one runs the real worker source in a vm.
   ============================================================ */
group(268);
{
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "native-parse-golden.json"), "utf8"));
  const noId = entries => JSON.stringify(entries.map(e => { const { id, ...rest } = e; return rest; }));
  async function mainThreadParse(w, T, text, formatId) {
    const node = w.createFileNode("ref.log");
    node.formatId = formatId;
    await w.parseLogTextAsync(text, node, () => {}); // jsdom: no Worker, the main-thread loop
    const entries = node.entries.slice();
    w.deleteNode(node.id);
    return entries;
  }
  function useFormat(w, T, fmt) {
    if (fmt.builtin) return;
    T.state.logFormats = T.state.logFormats.filter(f => f.id !== fmt.id).concat([JSON.parse(JSON.stringify(fmt))]);
    w.invalidateFormatCompileCache();
  }
  // Runs the real worker source in a vm; each worker's messages are
  // delivered in order, after a per-worker delay (worker 0 slowest), so
  // later pieces finish first and have to wait for earlier ones.
  function installFakeWorker(w, opts = {}) {
    const src = w.buildLogParseWorkerSrc();
    const made = [];
    w.URL.createObjectURL = () => "blob:fake-worker";
    w.Worker = class {
      constructor() {
        const index = made.length;
        made.push(this);
        this.terminated = false;
        const out = [];
        const self = {};
        vm.runInContext(src, vm.createContext({ self, postMessage: msg => out.push(msg) }));
        this.run = data => {
          self.onmessage({ data });
          const deliver = async () => {
            await sleep(opts.delay ? opts.delay(index) : (made.length - index) * 5);
            for (const msg of out) {
              if (this.terminated) return;
              if (opts.failAt && opts.failAt(index, msg)) { this.onerror(new Error("worker crashed")); return; }
              this.onmessage({ data: msg });
              await Promise.resolve();
            }
          };
          deliver();
        };
      }
      postMessage(data) { setTimeout(() => this.run(data), 0); }
      terminate() { this.terminated = true; }
    };
    return made;
  }
  // ~6 MB with stack traces, blank lines, CRLF and non-ASCII: 4+ pieces.
  function bigText() {
    const out = ["preamble dropped before the first header"];
    for (let i = 0; i < 48000; i++) {
      const sec = i % 86400;
      const ts = "2024-01-15 " + String(Math.floor(sec / 3600)).padStart(2, "0") + ":" + String(Math.floor(sec / 60) % 60).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0") + "," + String(i % 1000).padStart(3, "0");
      out.push(ts + "\t" + ["INFO", "WARN", "ERROR", "DEBUG"][i % 4] + "\t\"w" + (i % 7) + "\"\tC:\\src\\M" + (i % 9) + ".cs\tline " + i + "\t[Do" + (i % 5) + "]\t\"r\u00e9quest " + i + " \u{1F600} padding padding padding padding\"" + (i % 3 === 0 ? "\r" : ""));
      for (let k = 0; k < i % 3; k++) out.push("   at Frame" + k + "() in C:\\x.cs:line " + k);
      if (i % 11 === 0) out.push("");
    }
    return out.join("\n") + "\n";
  }

  await withApp(async (w, d, T) => {
    section("268a. encodeEntryBatch -> decodeNativeBatch round-trips every golden case exactly (fields, open quotes, NaN ts, non-ASCII, lone surrogates)");
    await T.bootRestore;
    for (const c of golden.cases) {
      if (c.base64 || c.format.mode === "meta") continue;
      useFormat(w, T, c.format);
      const entries = await mainThreadParse(w, T, c.text, c.format.id);
      const batch = w.encodeEntryBatch(entries, 0.25);
      const back = w.decodeNativeBatch(batch.buf, batch.strings);
      assert(back.fraction === 0.25, c.name + ": fraction carried");
      const expected = entries.map(e => { const { formatId, ...rest } = e; return rest; });
      assert(noId(back.entries) === noId(expected), c.name + ": decoded entries identical to the parsed ones, key order included");
      assert(back.entries.every((e, i) => Object.keys(expected[i].fields).length || e.fields === expected[i].fields), c.name + ": a field-less entry shares the page's EMPTY_ENTRY_FIELDS");
    }
    const odd = await mainThreadParse(w, T, "2024-01-15 10:00:00,000\tINFO\t\"a\"\tb\tline 1\t[m]\t\"lone \uD800 high, lone \uDC00 low\"\n", "fmt-default");
    const oddBatch = w.encodeEntryBatch(odd, 1);
    assert(w.decodeNativeBatch(oddBatch.buf, oddBatch.strings).entries[0].message === odd[0].message, "lone surrogates survive unchanged (no UTF-8 round trip)");
    const nan = [Object.assign({}, odd[0], { ts: NaN })];
    const nanBatch = w.encodeEntryBatch(nan, 1);
    assert(Number.isNaN(w.decodeNativeBatch(nanBatch.buf, nanBatch.strings).entries[0].ts), "NaN ts carried as NaN");
  });

  await withApp(async (w, d, T) => {
    section("268b. splitTextAtHeaderLines cuts only before header lines; the pieces parse to exactly the whole text's entries");
    const text = bigText();
    const isHeader = w.getCompiledFormat("fmt-default").isHeaderLine;
    const whole = await mainThreadParse(w, T, text, "fmt-default");
    for (const n of [1, 2, 4, 7]) {
      const pieces = w.splitTextAtHeaderLines(text, isHeader, n);
      assert(pieces.length === n, n + " pieces requested, got " + pieces.length);
      assert(pieces[0][0] === 0 && pieces[pieces.length - 1][1] === text.length, n + ": the pieces cover the text");
      assert(pieces.slice(1).every(([a]) => isHeader(text.slice(a, text.indexOf("\n", a)).replace(/\r$/, ""))), n + ": every later piece starts with a header line");
      let parts = [];
      for (const [a, b] of pieces) parts = parts.concat(await mainThreadParse(w, T, text.slice(a, b), "fmt-default"));
      assert(noId(parts) === noId(whole), n + ": pieces parsed one by one == the whole text parsed (" + parts.length + " vs " + whole.length + ")");
    }
    const noHeaders = "x\n".repeat(1000);
    assert(w.splitTextAtHeaderLines(noHeaders, isHeader, 4).length === 1, "no header line to cut before: one piece");
    const crlfEdge = "2024-01-15 10:00:00,000\tINFO\t\"a\"\tb\tline 1\t[m]\t\"one\"\r\n  cont\r\r\n2024-01-15 10:00:01,000\tINFO\t\"a\"\tb\tline 2\t[m]\t\"two\"\r\n";
    const cp = w.splitTextAtHeaderLines(crlfEdge, isHeader, 2);
    assert(cp.length === 2 && crlfEdge.slice(cp[0][0], cp[0][1]).endsWith("cont\r"), "a cut drops only the previous line's \\r\\n, not a \\r that belongs to the line");
  });

  await withApp(async (w, d, T) => {
    section("268c. The parallel worker parse: one worker per piece, file order kept although later pieces finish first, ids assigned in order, output identical");
    Object.defineProperty(w.navigator, "hardwareConcurrency", { value: 4, configurable: true });
    const text = bigText();
    const reference = await mainThreadParse(w, T, text, "fmt-default");
    const made = installFakeWorker(w);
    const node = w.createFileNode("par.log");
    node.formatId = "fmt-default";
    const progress = [];
    await w.parseLogTextAsync(text, node, (done, total) => progress.push(done / total));
    assert(made.length === 4, "4 workers for a ~" + Math.round(text.length / 1e6) + " MB text on 4 cores, got " + made.length);
    assert(made.every(wk => wk.terminated), "every worker terminated once done");
    assert(node.entries.length === reference.length && noId(node.entries) === noId(reference), "entries identical to the main-thread parse, in file order (" + node.entries.length + ")");
    const nums = node.entries.map(e => +e.id.replace(/\D/g, ""));
    assert(nums.every((v, i) => i === 0 || v > nums[i - 1]), "ids ascend in file order");
    assert(node.entries.every(e => T.entryIndex[e.id] === e && e.formatId === "fmt-default"), "every entry registered and stamped with its formatId");
    assert(progress.length > 4 && progress.every((v, i) => i === 0 || v >= progress[i - 1]) && progress[progress.length - 1] === 1, "progress reported, monotonic, ending at 1");

    section("268d. A worker failing mid-parse rolls back what was appended; the main-thread fallback then parses the file once");
    installFakeWorker(w, { delay: i => i * 5, failAt: (i, msg) => i === 2 && msg.type === "batch" });
    const node2 = w.createFileNode("fail.log");
    node2.formatId = "fmt-default";
    const before = Object.keys(T.entryIndex).length;
    await w.parseLogTextAsync(text, node2, () => {});
    assert(node2.entries.length === reference.length && noId(node2.entries) === noId(reference), "no duplicated or missing entries after the fallback (" + node2.entries.length + ")");
    assert(Object.keys(T.entryIndex).length === before + reference.length, "entryIndex holds each entry once");
  });

  await withApp(async (w, d, T) => {
    section("268f. The drain adopts queued batches a few at a time, yielding through queueTask (a message), never setTimeout — hidden windows throttle timers");
    Object.defineProperty(w.navigator, "hardwareConcurrency", { value: 4, configurable: true });
    const text = bigText();
    const reference = await mainThreadParse(w, T, text, "fmt-default");
    // Worker 0 is by far the slowest: every later piece's batches queue up
    // behind it and are adopted in one go once it is done.
    installFakeWorker(w, { delay: i => (i === 0 ? 60 : 0) });
    let pageTimeouts = 0;
    const origSetTimeout = w.setTimeout;
    // Only the parse's own timers — a render (createFileNode's) schedules its debounced persists too.
    w.setTimeout = function () { if (/parseLogTextInWorker|drain/.test(new Error().stack)) pageTimeouts++; return origSetTimeout.apply(this, arguments); };
    const node = w.createFileNode("drain.log");
    node.formatId = "fmt-default";
    await w.parseLogTextAsync(text, node, () => {});
    w.setTimeout = origSetTimeout;
    assert(noId(node.entries) === noId(reference), "entries identical (" + node.entries.length + ")");
    assert(pageTimeouts === 0, "no setTimeout during the parallel parse (" + pageTimeouts + ")");
  }, { beforeParse: window => {
    // jsdom has no MessageChannel: a stand-in delivering each message as a
    // task of its own (setImmediate — not the page's timers).
    window.MessageChannel = class {
      constructor() {
        this.port1 = { onmessage: null };
        this.port2 = { postMessage: data => setImmediate(() => this.port1.onmessage && this.port1.onmessage({ data })) };
      }
    };
  } });

  await withApp(async (w, d, T) => {
    section("268e. A custom regex format with custom columns and a quoted multi-line message parses identically through the workers");
    // The boot-time format-config load (loadFormatConfig) would replace
    // state.logFormats under the test otherwise.
    await waitFor(() => T.state.logFormats.some(f => f.id === "fmt-default"));
    const c = golden.cases.find(x => !x.base64 && x.format.mode === "regex" && x.entries.some(e => e.msgOpenQuote || Object.keys(e.fields).length));
    assert(!!c, "the golden fixture has such a case");
    if (c) {
      useFormat(w, T, c.format);
      const text = Array.from({ length: 3000 }, () => c.text).join("\n");
      const reference = await mainThreadParse(w, T, text, c.format.id);
      Object.defineProperty(w.navigator, "hardwareConcurrency", { value: 3, configurable: true });
      installFakeWorker(w);
      const node = w.createFileNode("custom.log");
      node.formatId = c.format.id;
      await w.parseLogTextAsync(text, node, () => {});
      assert(noId(node.entries) === noId(reference), c.name + " x3000: identical through the workers (" + node.entries.length + ")");
    }
  });
}
