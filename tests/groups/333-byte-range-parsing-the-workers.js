// GROUP 333 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 333 — byte-range parsing: the workers read the Blob themselves
   (findHeaderLineStartInBlob / parseBlobRangeEntries) instead of receiving
   text pieces, so the main thread never reads or copies the file text. The
   pieces must parse to exactly the plain loop's entries (stack traces,
   CRLF, BOM, multi-byte characters at a boundary, no header, preamble).
   Data: log-sim default format (stacktrace, basic, embedded scenarios). */
group(333);
{
  const noId = entries => JSON.stringify(entries.map(e => { const { id, ...rest } = e; return rest; }));
  const bytesOf = text => new Uint8Array(Buffer.from(text, "utf8"));
  const mkBlob = u8 => ({
    size: u8.length,
    slice(a, b) {
      const part = u8.slice(a, b);
      return { size: part.length, slice: (x, y) => mkBlob(part).slice(x, y), arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) };
    },
  });
  async function reference(w, text) {
    const node = w.createFileNode("ref.log");
    node.formatId = "fmt-default";
    await w.parseLogTextAsync(text, node, () => {}); // jsdom: no Worker, the plain loop
    const entries = node.entries.slice();
    w.deleteNode(node.id);
    return entries;
  }
  async function rangeParse(w, u8, ranges) {
    const compiled = w.getCompiledFormat("fmt-default"), blob = mkBlob(u8), out = [];
    for (const [a, b] of ranges) await w.parseBlobRangeEntries(blob, u8.length, a, b, compiled, "fmt-default", es => out.push(...es), () => {});
    return out;
  }
  const evenRanges = (size, n) => Array.from({ length: n }, (_, i) => [Math.floor(size * i / n), Math.floor(size * (i + 1) / n)]);
  const sim = (entries, seed) => LOGSIM.generateToStrings({ format: "default", scenarios: ["stacktrace", "basic", "embedded"], entries, seed })[0].text;

  await withApp(async (w, d, T) => {
    section("333a. Pieces parse to exactly the plain loop's entries: LF, CRLF, BOM, multi-byte at a boundary, preamble");
    const base = sim(150, 3);
    assert(/\n\s+at /.test(base) || base.split("\n").length > 160, "sanity: the sample has continuation lines");
    // Multi-byte characters (2, 3 and 4 byte) inside messages, preamble lines before the first header.
    const multi = "preamble line one\n\npreamble two\n" + base.replace(/\bINFO\b/g, "INFO").replace(/(\t")([A-Za-z])/g, (m, q, c, off) => off % 3 === 0 ? q + "é€\u{1F600}" + c : m);
    const variants = {
      "LF": base,
      "CRLF": base.replace(/\n/g, "\r\n"),
      "BOM": "﻿" + base,
      "multi-byte + preamble": multi,
      "no trailing newline": base.replace(/\n$/, ""),
    };
    for (const [name, text] of Object.entries(variants)) {
      const u8 = bytesOf(text);
      const ref = await reference(w, text.replace(/^﻿/, ""));
      assert(ref.length > 50, name + ": sanity, reference has entries (" + ref.length + ")");
      for (const n of [1, 2, 3, 5, 9]) {
        const got = await rangeParse(w, u8, evenRanges(u8.length, n));
        assert(got.length === ref.length && noId(got) === noId(ref), name + ": " + n + " pieces == plain loop (" + got.length + " vs " + ref.length + ")");
      }
    }
    // Every byte position as the single cut, including inside multi-byte characters and between \r and \n.
    const u8 = bytesOf(multi.replace(/\n/g, "\r\n"));
    const ref = await reference(w, multi.replace(/\n/g, "\r\n"));
    let bad = 0;
    for (let k = 0; k <= u8.length; k += 5) {
      const got = await rangeParse(w, u8, [[0, k], [k, u8.length]]);
      if (noId(got) !== noId(ref)) { bad++; if (bad < 3) console.log("  cut at", k); }
    }
    assert(bad === 0, "a cut at every 5th byte (mid multi-byte, mid CRLF) never splits or duplicates an entry, bad: " + bad);
  });

  await withApp(async (w, d, T) => {
    section("333b. Ranges without a header line; neighbours agree on the boundary");
    const none = "just\nsome\ncontinuation\nlines\n".repeat(50);
    const u8n = bytesOf(none);
    assert((await rangeParse(w, u8n, evenRanges(u8n.length, 4))).length === 0, "no header anywhere: no entries, no crash");
    const base = sim(60, 5);
    const one = base.split("\n").filter(l => /^\d{4}-/.test(l))[0];
    const text = one + "\n" + "  continuation of the only header\n".repeat(400);
    const u8 = bytesOf(text);
    const got = await rangeParse(w, u8, evenRanges(u8.length, 5));
    const ref = await reference(w, text);
    assert(got.length === 1 && noId(got) === noId(ref), "one header, long continuation: the single entry is neither split nor duplicated");
    const isHeader = w.getCompiledFormat("fmt-default").isHeaderLine, u8b = bytesOf(base), blob = mkBlob(u8b);
    for (const pos of [1, 17, 500, 1234, u8b.length - 3]) {
      const s1 = await w.findHeaderLineStartInBlob(blob, u8b.length, pos, isHeader);
      assert(s1 >= pos && (s1 === u8b.length || (u8b[s1 - 1] === 10 && isHeader(Buffer.from(u8b.slice(s1, u8b.indexOf(10, s1) < 0 ? undefined : u8b.indexOf(10, s1))).toString("utf8").replace(/\r$/, "")))),
        "boundary for " + pos + " is a header-line start at or after it, got " + s1);
    }
    assert(await w.findHeaderLineStartInBlob(blob, u8b.length, 0, isHeader) === 0 && await w.findHeaderLineStartInBlob(blob, u8b.length, u8b.length + 5, isHeader) === u8b.length, "0 stays 0, past the end is the end");
  });

  await withApp(async (w, d, T) => {
    section("333c. End to end with workers: the main thread posts the Blob, never reads the text; a worker failure falls back to the text route");
    Object.defineProperty(w.navigator, "hardwareConcurrency", { value: 4, configurable: true });
    const src = w.buildLogParseWorkerSrc();
    const made = [];
    let failing = false;
    w.URL.createObjectURL = () => "blob:fake-worker";
    w.Worker = class {
      constructor() {
        made.push(this);
        this.terminated = false;
        this.out = [];
        this.self = {};
        vm.runInContext(src, vm.createContext({ self: this.self, postMessage: m => this.out.push(m), TextDecoder: w.TextDecoder }));
      }
      postMessage(data) {
        this.received = data;
        setTimeout(async () => {
          this.self.onmessage({ data });
          for (let i = 0; i < 4000 && !this.out.some(m => m.type === "done" || m.type === "error"); i++) await sleep(1);
          if (failing) { this.onerror(new Error("worker crashed")); return; }
          for (const m of this.out) { if (this.terminated) return; this.onmessage({ data: m }); await Promise.resolve(); }
        }, 0);
      }
      terminate() { this.terminated = true; }
    };
    let text = "";
    for (let seed = 1; text.length < 4.5e6; seed++) text += sim(6000, seed);
    const u8 = bytesOf(text);
    const file = new w.File([u8], "big.log");
    const ref = await reference(w, text);
    let textReads = 0;
    const origRead = w.readFileWithProgress;
    w.readFileWithProgress = function () { textReads++; return origRead.apply(this, arguments); };

    made.length = 0; // the reference parse above used the fake workers in text mode
    let node = w.createFileNode("blob.log");
    const res = await w.readParseFileNode(node, "blob.log", file, null);
    assert(made.length === 4, "4 workers on 4 cores, got " + made.length);
    assert(made.every(wk => wk.received && wk.received.blob && wk.received.text === undefined && typeof wk.received.a === "number"), "every worker got the Blob and a byte range, no text");
    assert(textReads === 0, "the main thread never read the text");
    assert(node.entries.length === ref.length && noId(node.entries) === noId(ref), "entries identical to the plain loop, in order (" + node.entries.length + ")");
    assert(res.size === file.size && res.file === file, "result carries the file and its size");
    const nums = node.entries.map(e => +e.id.replace(/\D/g, ""));
    assert(nums.every((v, i) => i === 0 || v > nums[i - 1]) && node.entries.every(e => T.entryIndex[e.id] === e), "ids ascend, entries registered");
    w.deleteNode(node.id);

    made.length = 0; failing = true;
    node = w.createFileNode("fail.log");
    await w.readParseFileNode(node, "fail.log", file, null);
    assert(textReads === 1, "a failing worker falls back to the text route (one read), got " + textReads);
    assert(node.entries.length === ref.length && noId(node.entries) === noId(ref), "...with identical entries and no leftovers from the failed attempt");
    failing = false; w.deleteNode(node.id);

    w.readFileWithProgress = origRead;
  });

  await withApp(async (w, d, T) => {
    section("333d. Eligibility: UTF-16 and non-Blob sources keep the text route");
    w.Worker = class {};
    const u16 = new w.File([new Uint8Array([0xFF, 0xFE, 0x41, 0x00])], "u16.log");
    assert(await w.canParseBlobInWorker(mkBlob(bytesOf("2024\n")), "fmt-default") === true, "a UTF-8 blob qualifies");
    assert(await w.canParseBlobInWorker(mkBlob(new Uint8Array([0xFF, 0xFE, 0x41, 0x00])), "fmt-default") === false, "a UTF-16 BOM does not");
    assert(await w.canParseBlobInWorker(mkBlob(new Uint8Array(0)), "fmt-default") === false, "an empty file does not");
    assert(await w.canParseBlobInWorker({ size: 5 }, "fmt-default") === false, "a non-Blob does not");
    delete w.Worker;
  });
}
