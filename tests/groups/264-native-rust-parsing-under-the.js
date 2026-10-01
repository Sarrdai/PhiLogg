// GROUP 264 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 264 — Native (Rust) parsing under the desktop wrapper
   (2026-09-24). window.philogg.parseLogFile parses a philogg://local/…
   file in the Rust backend (desktop/src-tauri/logparse) from the spec
   nativeFormatSpec builds here. tests/fixtures/native-parse-golden.json is
   shared with that crate's own `cargo test`: this group pins the JS parser
   to it, the crate pins the Rust parser to it — so the two can't drift
   apart silently. Regenerate after a deliberate JS parsing change with
   `UPDATE_NATIVE_GOLDEN=1 TZ=UTC GROUP=264 npm test`, then make the crate
   pass again.
   ============================================================ */
group(264);
{
  const GOLDEN_PATH = path.join(__dirname, "fixtures", "native-parse-golden.json");
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const UPDATE_GOLDEN = process.env.UPDATE_NATIVE_GOLDEN === "1";

  // The wire shape Rust sends (logparse::Entry's Serialize), from a JS entry.
  // ts: naive under TZ=UTC; null for NaN and for free-form dates (Date.parse
  // stays on the JS side).
  const toWire = (e, freeDate) => {
    const o = { id: "", tsRaw: e.tsRaw, ts: freeDate || isNaN(e.ts) ? null : e.ts, level: e.level, thread: e.thread,
      location: e.location, method: e.method, message: e.message, raw: e.raw,
      fields: Object.assign({}, e.fields) };
    if (e.msgOpenQuote) o.msgOpenQuote = e.msgOpenQuote;
    return o;
  };
  const sansTs = o => JSON.stringify(Object.assign({}, o, { ts: 0 }));

  async function registerFormat(w, T, fmt) {
    if (fmt.builtin) return;
    T.state.logFormats = T.state.logFormats.filter(f => f.id !== fmt.id).concat([JSON.parse(JSON.stringify(fmt))]);
    w.invalidateFormatCompileCache();
  }
  async function caseText(w, c) {
    if (!c.base64) return c.text;
    const bytes = Buffer.from(c.base64, "base64");
    return w.readFileWithProgress(new w.File([w.Uint8Array.from(bytes)], "x.log"), () => {});
  }
  async function jsParse(w, T, c) {
    await registerFormat(w, T, c.format);
    const node = w.createFileNode(c.name + ".log");
    node.formatId = c.format.id;
    await w.parseLogTextAsync(await caseText(w, c), node, () => {});
    const entries = node.entries.slice();
    w.deleteNode(node.id);
    return entries;
  }
  // Each golden case encoded by the RUST side (logparse::batch, via its
  // `cargo test`) — decoding these with the page's decodeNativeBatch is the
  // cross-language check of the binary layout.
  const batches = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "native-batch-golden.json"), "utf8"));
  // A stand-in for inject.js's parseLogFile: a progress note, then the
  // case's binary batch (fraction 0.5), the way commands.rs streams them;
  // resolves { size }.
  function nativeStub(bridge, caseName, size, opts = {}) {
    bridge.calls = [];
    bridge.parseLogFile = async (url, spec, onMessage) => {
      bridge.calls.push({ url, spec });
      await Promise.resolve();
      if (opts.rejectBefore) throw new Error(opts.rejectBefore);
      onMessage({ type: "progress", fraction: 0.2 });
      const win = bridge.window;
      onMessage(win.Uint8Array.from(Buffer.from(batches[caseName], "base64")).buffer);
      if (opts.rejectAfter) throw new Error(opts.rejectAfter);
      return { size };
    };
  }
  function installFetch(w, text) {
    w.fetchCalls = [];
    w.fetch = async url => {
      w.fetchCalls.push(String(url));
      const buf = new w.TextEncoder().encode(text).buffer;
      return { ok: true, status: 200, arrayBuffer: async () => buf, blob: async () => new w.Blob([text]) };
    };
  }

  const bridge = { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) };

  await withApp(async (w, d, T) => {
    section("264a. nativeFormatSpec mirrors compileOneFormat; golden cases parse identically in JS");
    if (UPDATE_GOLDEN) {
      assert(new Date(2024, 0, 1).getTimezoneOffset() === 0 && new Date(2024, 6, 1).getTimezoneOffset() === 0,
        "the golden file is regenerated under TZ=UTC (naive == local)");
      for (const c of golden.cases) {
        await registerFormat(w, T, c.format);
        c.spec = w.nativeFormatSpec(c.format);
        const freeDate = !c.spec.builtin && !c.spec.dateRegex;
        c.entries = (await jsParse(w, T, c)).map(e => toWire(e, freeDate));
      }
      fs.writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 1) + "\n");
      console.log("  (rewrote " + GOLDEN_PATH + ")");
    }

    const def = w.nativeFormatSpec(T.state.logFormats.find(f => f.id === "fmt-default") || { builtin: true, edited: false });
    assert(def.builtin === true && def.regex === null, "the unedited builtin default is the native HEADER_RE/parseHeaderLine port");
    assert(w.nativeFormatSpec({ id: "m", mode: "meta", targetFormatIds: ["a", "b"] }) === null, "a meta-format is never parsed natively");
    const pat = w.nativeFormatSpec({ id: "p", mode: "pattern", pattern: "%d %p %m", tsFormat: "HH:mm" });
    assert(pat.regex === w.compileFormatPattern("%d %p %m", "HH:mm").regex.source && pat.dateRegex === "^(\\d{2}):(\\d{2})$" &&
      JSON.stringify(pat.dateOrder) === '["HH","mm"]', "a pattern format hands over the regex source this page compiles, got " + JSON.stringify(pat));
    const bad = w.nativeFormatSpec({ id: "r", mode: "regex", regex: "(" });
    assert(bad.builtin === false && bad.regex === null, "a format that fails to compile is described as such (every line its own entry)");

    const localize = w.makeNaiveTsLocalizer();
    for (const c of golden.cases) {
      await registerFormat(w, T, c.format);
      const spec = w.nativeFormatSpec(c.format);
      assert(JSON.stringify(spec) === JSON.stringify(c.spec), c.name + ": nativeFormatSpec matches the golden spec, got " + JSON.stringify(spec));
      const freeDate = !spec.builtin && !spec.dateRegex;
      const got = await jsParse(w, T, c);
      assert(got.length === c.entries.length, c.name + ": JS parses " + c.entries.length + " entries, got " + got.length);
      got.forEach((e, i) => {
        const g = c.entries[i] || {};
        assert(sansTs(toWire(e, freeDate)) === sansTs(g), c.name + " #" + i + ": JS entry matches golden, got " + sansTs(toWire(e, freeDate)));
        const want = g.ts == null ? (freeDate && g.tsRaw ? w.parseTimestampGeneric(g.tsRaw, null) : NaN) : localize(g.ts);
        assert(Object.is(e.ts, want), c.name + " #" + i + ": ts " + e.ts + " === localized golden " + want);
      });
    }
  });

  await withApp(async (w, d, T) => {
    section("264b. Entries streamed by the native parser are adopted exactly like JS-parsed ones");
    bridge.window = w;
    assert(Object.keys(batches).length === golden.cases.filter(c => c.nativeSupported !== false).length,
      "the Rust-encoded batch fixture covers every natively supported golden case");
    for (const c of golden.cases.filter(c => c.nativeSupported !== false)) {
      const jsEntries = await jsParse(w, T, c);
      nativeStub(bridge, c.name, 99);
      const node = w.createFileNode(c.name + "-native.log");
      node.formatId = c.format.id;
      const fractions = [];
      const res = await w.parseLocalFileNatively("philogg://local/1/x.log", node, f => fractions.push(f));
      assert(res.size === 99 && bridge.calls[0].url === "philogg://local/1/x.log" && JSON.stringify(bridge.calls[0].spec) === JSON.stringify(c.spec),
        c.name + ": the bridge gets the url and the golden spec; resolves with the size");
      assert(fractions.join(",") === "0.2,0.5", c.name + ": progress fractions pass through, got " + fractions.join(","));
      assert(node.entries.length === jsEntries.length, c.name + ": same entry count as JS");
      node.entries.forEach((e, i) => {
        const j = jsEntries[i];
        const keys = Object.keys(e).join(","), jkeys = Object.keys(j).join(",");
        assert(keys === jkeys, c.name + " #" + i + ": same keys in the same order (one V8 shape), got " + keys + " vs " + jkeys);
        const strip = x => JSON.stringify(Object.assign({}, x, { id: 0, ts: 0 }));
        assert(strip(e) === strip(j) && Object.is(e.ts, j.ts), c.name + " #" + i + ": adopted entry equals the JS entry, got " + strip(e) + " ts " + e.ts + " vs " + j.ts);
        assert(Object.keys(e.fields).length > 0 || e.fields === j.fields, c.name + " #" + i + ": no custom columns -> the shared EMPTY_ENTRY_FIELDS object");
          });
      assert(node.entries.every(e => /^e\d+$/.test(e.id) && e.formatId === c.format.id), c.name + ": page ids and formatId stamped");
      w.deleteNode(node.id);
    }

    // A rejection after a batch already arrived rolls it back.
    nativeStub(bridge, golden.cases[0].name, 5, { rejectAfter: "boom" });
    const node = w.createFileNode("rollback.log");
    let err = null;
    try { await w.parseLocalFileNatively("philogg://local/2/r.log", node, () => {}); } catch (e) { err = e; }
    assert(err && err.message === "boom" && node.entries.length === 0, "a failure mid-stream rejects and leaves node.entries empty again");
  }, { philogg: bridge });

  await withApp(async (w, d, T) => {
    section("264c. Desktop load routes parse natively without fetching the file; fall back when refused");
    const c = golden.cases.find(x => x.name === "builtin-crlf-trailing-newline");
    installFetch(w, c.text);
    bridge.window = w;

    nativeStub(bridge, c.name, 4321);
    await w.loadDesktopLocalFiles({ files: [{ name: "n.log", url: "philogg://local/7/n.log", path: "/tmp/n.log" }] });
    let node = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "n.log");
    assert(node && node.entries.length === c.entries.length, "a dropped/picked file lands with the native entries");
    assert(bridge.calls.length === 1 && bridge.calls[0].spec.builtin === true, "...parsed natively under the builtin spec");
    assert(!w.fetchCalls.some(u => u.endsWith("/n.log")), "...and its content was never fetched through philogg://local, got " + w.fetchCalls.join(","));
    assert(node.tail && node.tail.offset === 4321 && node.localPath === "/tmp/n.log", "tailing resumes at the byte size Rust read; the path is kept");
    assert(node.loadFraction === undefined, "the progress fill is cleared once loaded");

    nativeStub(bridge, c.name, 1, { rejectBefore: "lookaround" });
    await w.loadDesktopLocalFiles({ files: [{ name: "f.log", url: "philogg://local/8/f.log", path: "/tmp/f.log" }] });
    node = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "f.log");
    assert(node && node.entries.length === c.entries.length && w.fetchCalls.filter(u => u.endsWith("/f.log")).length === 1,
      "a refused native parse falls back to fetch + the JS parser, got " + (node && node.entries.length) + " / " + w.fetchCalls.join(","));
    assert(node.tail.offset === new w.TextEncoder().encode(c.text).byteLength, "...with the fetched byte length as the tail offset");

    nativeStub(bridge, c.name, 777);
    await w.loadUrlIntoTree("philogg://local/9/u.log");
    node = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "u.log");
    assert(node && node.entries.length === c.entries.length && !w.fetchCalls.some(u => u.endsWith("/u.log")) && node.tail.offset === 777,
      "the file-association route (loadUrlIntoTree) parses natively too");

    nativeStub(bridge, c.name, 1, { rejectBefore: "no" });
    await w.loadUrlIntoTree("philogg://local/10/v.log");
    const vs = T.state.rootIds.map(id => T.state.nodes[id]).filter(n => n.name === "v.log");
    assert(vs.length === 1 && vs[0].entries.length === c.entries.length && w.fetchCalls.filter(u => u.endsWith("/v.log")).length === 1,
      "...and falls back into the same node (no leftover empty row)");

    // A meta-format is split in JS — never handed to the native parser.
    T.state.logFormats.push({ id: "t1", name: "t1", mode: "regex", regex: "^(?<ts>\\d+) (?<message>.*)$", tsFormat: "" },
      { id: "t2", name: "t2", mode: "regex", regex: "^<(?<message>.*)>$", tsFormat: "" },
      { id: "meta1", name: "meta", mode: "meta", targetFormatIds: ["t1", "t2"] });
    T.state.formatRules.push({ glob: "*.meta.log", formatId: "meta1", order: -1 });
    w.invalidateFormatCompileCache(); w.invalidateGlobCompileCache();
    installFetch(w, "1 a\n<b>\n2 c\n");
    nativeStub(bridge, c.name, 1);
    await w.loadUrlIntoTree("philogg://local/11/m.meta.log");
    // (the other files opened above are tailing, and their polls fetch too)
    const metaFetches = w.fetchCalls.filter(u => u.endsWith("/m.meta.log")).length;
    assert(bridge.calls.length === 0 && metaFetches === 1, "a meta-format file goes through fetch + the JS split, got " + bridge.calls.length + "/" + metaFetches);
  }, { philogg: bridge });

  const crlfCase = golden.cases.find(x => x.name === "builtin-crlf-trailing-newline");
  const dirsN = { "/logs": { "a.log": crlfCase.text } };
  const folderBridge = nativeFolderBridge(dirsN);
  folderBridge.picked = { path: "/logs", name: "logs" };
  await withApp(async (w, d, T) => {
    section("264d. A natively listed folder file is parsed natively too");
    folderBridge.installFetch(w);
    folderBridge.window = w;
    let fetched = 0;
    const realFetch = w.fetch;
    w.fetch = async url => { fetched++; return realFetch(url); };
    nativeStub(folderBridge, crlfCase.name, 555);
    await w.openFolderPickerFlow();
    const folder = T.state.folders[0];
    const rec = folder.files.find(f => f.name === "a.log");
    await w.loadFolderFile(folder, rec);
    const node = T.state.nodes[rec.nodeId];
    assert(node && node.entries.length === crlfCase.entries.length && fetched === 0 && node.tail.offset === 555 && node.localPath === "/logs/a.log",
      "loadFolderFile hands the listed file to the native parser, no fetch, got " + (node && node.entries.length) + "/" + fetched);

    nativeStub(folderBridge, crlfCase.name, 1, { rejectBefore: "gone" });
    const rec2 = { name: "missing.log", handle: w.urlTailHandle("philogg://local/404/missing.log", "/logs/missing.log") };
    await w.loadFolderFile(folder, rec2);
    assert(!rec2.nodeId && d.querySelector("#copyToast").textContent.includes("moved or deleted"),
      "a file that can't be read either way gets the usual \"moved or deleted\" notice");
    const localize = w.makeNaiveTsLocalizer();
    assert(node.entries[0].ts === localize(crlfCase.entries[0].ts), "sanity: timestamps localized");
  }, { philogg: folderBridge });

  if (groupSelected()) {
    section("264e. makeNaiveTsLocalizer === new Date(y, mo, d, h, mi, s, ms) across DST gaps and overlaps");
    const saved = process.env.TZ;
    for (const tz of ["Europe/Berlin", "America/New_York", "Australia/Lord_Howe", "Asia/Kolkata", "UTC"]) {
      process.env.TZ = tz;
      const localize = (new Function("return " + PAGE_SCRIPT_MATCH[1].match(/function makeNaiveTsLocalizer\(\) \{[\s\S]*?\n\}/)[0]))()();
      let mismatches = 0, n = 0;
      for (const [y, mo] of [[2024, 2], [2024, 9], [2024, 3], [1999, 0], [2023, 9]]) {
        for (let d = 1; d <= 31; d += 3) for (let h = 0; h < 24; h++) for (const mi of [0, 15, 30, 59]) {
          const ms = (h * 7 + mi) % 1000;
          const want = new Date(y, mo, d, h, mi, 13, ms).getTime();
          const got = localize(Date.UTC(y, mo, d, h, mi, 13, ms));
          n++;
          if (want !== got) mismatches++;
        }
      }
      assert(mismatches === 0, tz + ": " + n + " wall times convert like the Date constructor, " + mismatches + " mismatches");
    }
    process.env.TZ = saved === undefined ? "" : saved;
    if (saved === undefined) delete process.env.TZ;
  }
}
