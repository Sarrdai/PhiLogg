// GROUP 284 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 284 — gzip-compressed logs (.gz): detection, name handling, and
   the load routes (drop/picker via loadFileDescriptors, ZIP entries,
   ?url=/desktop file-association via loadUrlIntoTree)
   Origin: 2026-09-25 (FEATURE_BACKLOG.md #83). A gzip stream is detected
   by its magic bytes (1f 8b), never by extension alone, and inflated via
   the native DecompressionStream("gzip") (Node's own, handed into the
   jsdom window the same way GROUP 199's ZIP tests do). The node keeps its
   real name; ".gz" is only looked through where a name is interpreted
   (format rules, folder-watch log detection). A gzip file never tails.
   ============================================================ */
group(284);
{
  const zlib = require("zlib");
  const GZ_TEXT = makeLog(0, 6, { msgPrefix: "rotated" });
  const gz = text => zlib.gzipSync(Buffer.from(text, "utf8"));
  const withGzipApis = w => { w.Response = Response; w.DecompressionStream = DecompressionStream; };

  await withApp(async (w, d, T) => {
    section("284a. isGzipBytes/stripGzipExt/isCompatibleFolderFile/fileNameGlobTest + format rules look through .gz");
    assert(w.isGzipBytes(new Uint8Array([0x1f, 0x8b, 8])) === true, "1f 8b is gzip");
    assert(w.isGzipBytes(new Uint8Array([0x1f])) === false && w.isGzipBytes(new Uint8Array([0x32, 0x30])) === false, "too short / plain text is not gzip");
    assert(w.stripGzipExt("app.log.1.GZ") === "app.log.1" && w.stripGzipExt("app.log") === "app.log", "stripGzipExt drops only a trailing .gz, case-insensitively");
    assert(w.isCompatibleFolderFile("app.log.gz") && w.isCompatibleFolderFile("app.log.1.gz") && w.isCompatibleFolderFile("APP.LOG.12.GZ"),
      "a gzipped log (with or without a logrotate counter) counts as a log file");
    assert(!w.isCompatibleFolderFile("data.gz") && !w.isCompatibleFolderFile("site.tar.gz") && !w.isCompatibleFolderFile("app.log.1"),
      "a non-log .gz is not a log file; an uncompressed rotated .log.1 is unchanged (still not listed)");
    assert(w.fileNameGlobTest("*.log", "app.log.gz") && w.fileNameGlobTest("*.gz", "app.log.gz") && w.fileNameGlobTest("*.log", "app.log.1.gz"),
      "fileNameGlobTest tries the real name, then minus .gz, then minus a rotation counter too");
    assert(!w.fileNameGlobTest("*.log", "app.log.1") && !w.fileNameGlobTest("*.log", "site.tar.gz"),
      "...but only behind a .gz: an uncompressed app.log.1 is tested as-is (unchanged), and a non-log .gz stays unmatched");
    await waitForFormatConfig(T);
    T.state.logFormats.push({ id: "fmt-gz-rule", name: "GzRule", mode: "pattern", pattern: '%d\\t%p\\t"%t"\\t%c\\t[%M]\\t"%m"%n',
      regex: "", tsFormat: "yyyy-MM-dd HH:mm:ss,SSS", builtin: false, edited: false, createdAt: Date.now() });
    T.state.formatRules.push({ id: "rule-gz", glob: "app*.log", formatId: "fmt-gz-rule", order: 0 });
    w.invalidateGlobCompileCache();
    assert(w.resolveFormatIdForFilename("app-server.log.gz") === "fmt-gz-rule" && w.resolveFormatIdForFilename("app-server.log.3.gz") === "fmt-gz-rule",
      "a format rule for *.log also resolves the (rotated) .gz of that log");
    assert(w.resolveFormatIdForFilename("other.log.gz") === "fmt-default", "...and a non-matching name still falls back to the default");
  });

  await withApp(async (w, d, T) => {
    section("284b. loadFileDescriptors (drop/picker route) inflates a gzip file, keeps its name, and never tails it");
    withGzipApis(w);
    let decompressCount = 0;
    class CountingDS extends DecompressionStream { constructor(...a) { super(...a); decompressCount++; } }
    w.DecompressionStream = CountingDS;
    const handle = { kind: "file", name: "app.log.1.gz", async getFile() { return new w.File([gz(GZ_TEXT)], "app.log.1.gz"); } };
    await w.loadFileDescriptors([{ file: await handle.getFile(), handle }]);
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(!!f && f.entries.length === 6, "all 6 entries parsed from the inflated text, got " + (f && f.entries.length));
    assert(f.entries[2].message === "rotated 2", "entry content is the decompressed text, got " + (f && f.entries[2].message));
    assert(f.name === "app.log.1.gz", "the node keeps its real on-disk name, got " + f.name);
    assert(!f.tail, "a gzip file is a static snapshot — no tail attached even though a handle was given");
    assert(decompressCount === 1, "exactly one DecompressionStream was used, got " + decompressCount);

    // Detection is by content: a ".gz" that is really plain text loads as-is...
    await w.loadFileDescriptors([{ file: new w.File([makeLog(0, 3)], "plain.log.gz"), handle: null }]);
    const plain = T.state.nodes[T.state.rootIds[1]];
    assert(plain && plain.entries.length === 3 && decompressCount === 1, "a .gz name without the gzip magic reads as plain text, no inflate attempted");
    // ...and a gzip stream without the extension is still inflated.
    await w.loadFileDescriptors([{ file: new w.File([gz(makeLog(0, 4))], "noext.log"), handle: null }]);
    const noExt = T.state.nodes[T.state.rootIds[2]];
    assert(noExt && noExt.entries.length === 4 && decompressCount === 2, "gzip magic without a .gz extension is still detected and inflated");
  });

  await withApp(async (w, d, T) => {
    section("284c. a corrupt/truncated gzip fails like any read error: toast, no stranded node");
    withGzipApis(w);
    const full = gz(GZ_TEXT);
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    await w.loadFileDescriptors([{ file: new w.File([truncated], "broken.log.gz"), handle: null }]);
    assert(T.state.rootIds.length === 0, "the queued placeholder is removed again, got " + T.state.rootIds.length + " root(s)");
    assert(d.querySelector("#copyToast").textContent.includes("broken.log.gz"), "the failure is surfaced by name, got " + d.querySelector("#copyToast").textContent);
  });

  await withApp(async (w, d, T) => {
    section("284d. a .gz log inside a ZIP is listed as a log entry and opens inflated (deflate-raw, then gzip)");
    withGzipApis(w);
    // Minimal stored-method ZIP holding one gzip entry (the entry's own
    // bytes ARE the gzip stream; the ZIP layer here adds no compression).
    const name = "rotated/app.log.2.gz";
    const data = gz(GZ_TEXT);
    const nameBuf = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const local = Buffer.concat([lh, nameBuf, data]);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(0, 42);
    const central = Buffer.concat([ch, nameBuf]);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
    const zip = await w.openZipSource(new w.File([Buffer.concat([local, central, eocd])], "logs.zip"), "logs.zip");
    assert(zip && zip.entries.length === 1 && w.isLogZipEntry(zip.entries[0]), "the .gz entry counts as a log entry (not an external/viewer file)");
    fireClick(d.querySelector("#zipList .tree-dir-row"), w); // "rotated/" starts collapsed (GROUP 317)
    const row = d.querySelector("#zipList .folder-watch-file");
    row.dispatchEvent(new w.Event("dblclick", { bubbles: true }));
    await waitFor(() => T.state.rootIds.length === 1 && T.state.nodes[T.state.rootIds[0]].entries.length === 6);
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f && f.entries.length === 6 && f.entries[5].message === "rotated 5", "the entry loads with its inflated entries, got " + (f && f.entries.length));
    assert(f.zipId === zip.id && !f.tail, "it nests under its ZIP and is static");
  });

  await withApp(async (w, d, T) => {
    section("284e. loadUrlIntoTree (?url= / desktop file association) inflates a gzip response and does not tail a philogg://local gzip");
    withGzipApis(w);
    const bytes = gz(GZ_TEXT);
    w.fetch = async () => new Response(bytes);
    await w.loadUrlIntoTree("philogg://local/7/app.log.3.gz");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f && f.entries.length === 6 && f.name === "app.log.3.gz", "the gzip response is inflated and parsed, got " + (f && f.entries.length));
    assert(f.sourceUrl === "philogg://local/7/app.log.3.gz", "sourceUrl kept (Open File Location / Copy Path)");
    assert(!f.tail, "a desktop-local gzip file gets no tail, unlike a plain .log from the same route");
    // Same route, plain text still tails (unchanged behavior).
    w.fetch = async () => new Response(makeLog(0, 2));
    await w.loadUrlIntoTree("philogg://local/8/plain.log");
    const p = T.state.nodes[T.state.rootIds[1]];
    assert(p && p.entries.length === 2 && !!p.tail, "a plain desktop-local log still tails");
  });
}
