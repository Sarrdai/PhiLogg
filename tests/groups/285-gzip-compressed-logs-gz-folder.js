// GROUP 285 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 285 — gzip-compressed logs (.gz): folder watch, native listing,
   session-cache restore and the tail guard
   Origin: 2026-09-25 (FEATURE_BACKLOG.md #83). Folder watch lists a
   gzipped log (a "*.log" pattern still matches "app.log.1.gz"), opens it
   inflated, never minimap-probes it (compressed byte windows), and the
   desktop wrapper's native listing is told to let ".gz" through. The
   session cache stores the decompressed text like any file; a tail that
   a restore/rescan reattaches to the gzip source is dropped by tailTick
   the first time it sees the gzip magic.
   ============================================================ */
group(285);
{
  const zlib = require("zlib");
  const GZ_TEXT = makeLog(0, 5, { msgPrefix: "old" });
  const gzBuf = zlib.gzipSync(Buffer.from(GZ_TEXT, "utf8"));
  const withGzipApis = w => { w.Response = Response; w.DecompressionStream = DecompressionStream; };
  const bytesHandle = (w, name, buf) => ({
    kind: "file", name,
    async getFile() { return new w.File([buf], name); },
    async queryPermission() { return "granted"; },
  });

  await withApp(async (w, d, T) => {
    section("285a. folder watch lists app.log.1.gz (also under a *.log pattern), opens it inflated, static, and never probes it");
    withGzipApis(w);
    const files = {
      "app.log": Buffer.from(makeLog(100, 3)),
      "app.log.1.gz": gzBuf,
      "site.tar.gz": Buffer.from([0x1f, 0x8b, 0, 0]),
      "notes.pdf": Buffer.from("x"),
    };
    const dir = {
      kind: "directory", name: "logs",
      async *values() { for (const n of Object.keys(files)) yield bytesHandle(w, n, files[n]); },
    };
    await w.addWatchedFolder(dir);
    const folder = T.state.folders[0];
    assert(folder.files.map(f => f.name).join(",") === "app.log,app.log.1.gz",
      "the gzipped log is listed, the .tar.gz and .pdf are not, got " + folder.files.map(f => f.name).join(","));
    folder.settings = { includeSubfolders: false, showRelativePath: false, patterns: [Object.assign(w.defaultFolderPattern(), { pattern: "*.log" })] };
    await w.mergeScannedFiles(folder, await w.scanFolderHandle(dir, folder.settings));
    assert(folder.files.map(f => f.name).join(",") === "app.log,app.log.1.gz", "a *.log pattern still matches the .gz of that log");

    const rec = folder.files.find(f => f.name === "app.log.1.gz");
    assert(await w.probeFolderFileRange(folder, rec) === null, "minimap probe returns the 'no range' sentinel for a gzip file (no inflate just to probe)");
    await w.loadFolderFile(folder, rec);
    const node = T.state.nodes[rec.nodeId];
    assert(node && node.entries.length === 5 && node.entries[0].message === "old 0", "the folder file opens with its inflated entries");
    assert(node.folderId === folder.id && !node.tail, "it belongs to the folder and is not tailed");
    // A rescan's reattach (mergeScannedFiles attaches a tail to any open
    // node without one) is dropped by tailTick on its first look.
    await w.mergeScannedFiles(folder, await w.scanFolderHandle(dir, folder.settings));
    assert(!!node.tail, "precondition: the rescan reattached a tail to the open gzip node");
    await w.tailTick();
    assert(!node.tail && node.entries.length === 5, "tailTick drops the gzip tail without appending compressed bytes, got " + node.entries.length + " entries");
  });

  await withApp(async (w, d, T) => {
    section("285b. the desktop wrapper's native listing is asked for .gz too, and a listed .gz opens through philogg://local");
    withGzipApis(w);
    let askedExts = null;
    w.philogg.listFolder = async (p, exts) => {
      askedExts = exts;
      return [{ url: "philogg://local/5/app.log.1.gz", path: p + "/app.log.1.gz", name: "app.log.1.gz" }];
    };
    w.fetch = async () => new Response(gzBuf);
    await w.addWatchedFolder(w.nativeDirHandle("/var/log/app", "app"));
    assert(Array.isArray(askedExts) && askedExts.includes(".gz") && askedExts.includes(".log"), "listFolder is passed .gz alongside .log, got " + JSON.stringify(askedExts));
    const folder = T.state.folders[0];
    assert(folder.files.length === 1, "the gzip log is listed");
    await w.loadFolderFile(folder, folder.files[0]);
    const node = T.state.nodes[folder.files[0].nodeId];
    assert(node && node.entries.length === 5, "it opens inflated via the wrapper's URL, got " + (node && node.entries.length));
    assert(node.localPath === "/var/log/app/app.log.1.gz" && !node.tail, "location attached, no tail");
  }, { philogg: nativeFolderBridge({}) });

  // A philogg://local/… fetch that honours Range like protocol.rs's
  // read_local (206 + Content-Range), so urlTailHandle.getRangedFile — the
  // tail poll's and minimap probe's partial reader — really reads ranges.
  function rangedFetch(buf, log) {
    return async (url, init) => {
      if (log) log.push({ url: String(url), range: init && init.headers && init.headers.Range || null });
      const range = init && init.headers && init.headers.Range;
      const m = range && /bytes=(\d+)-(\d+)/.exec(range);
      if (!m) return new Response(buf);
      const lo = Number(m[1]), hi = Math.min(Number(m[2]), buf.length - 1);
      return new Response(buf.subarray(lo, hi + 1), { status: 206, headers: { "content-range": "bytes " + lo + "-" + hi + "/" + buf.length } });
    };
  }

  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    section("285c. session cache: a gzip file persists its decompressed content...");
    withGzipApis(w);
    await w.loadFileDescriptors([{ file: new w.File([gzBuf], "app.log.1.gz"), handle: null }]);
    const f = T.state.nodes[T.state.rootIds[0]];
    f.sourceUrl = "philogg://local/3/app.log.1.gz"; // as if opened through the desktop wrapper
    await w.persistFileNode(f);
    await w.persistMetaNow();
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    const cached = rec && (typeof rec.text === "string" ? rec.text : rec.blob ? await rec.blob.text() : "");
    assert(cached.includes("old 4") && !rec.handle, "the cached content (text or File blob) is the decompressed log, with no handle, got " + JSON.stringify(cached.slice(0, 40)));
  }, { indexedDB: factory });
  await withApp(async (w, d, T) => {
    section("285c. ...restores it identically, and the desktop-URL tail rebuilt on restore is dropped by a 2-byte Range read on the first tick");
    withGzipApis(w);
    // Every tail poll of the restored node goes through this fetch — a
    // fetch of the gzip URL proves restore DID rebuild a tail (the app's
    // own poll timer may already have run that first tick under load, so
    // the tail's presence right after restore isn't asserted directly).
    const log = [];
    w.fetch = rangedFetch(gzBuf, log);
    await T.bootRestore;
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f && f.name === "app.log.1.gz" && f.entries.length === 5, "restored with its name and all entries, got " + (f && f.entries.length));
    await w.tailTick();
    assert(log.some(r => r.url.endsWith("app.log.1.gz")), "restore rebuilt a urlTailHandle tail from the desktop sourceUrl (it was polled)");
    assert(log.every(r => r.range), "the poll only ever made Range reads, never a whole-file fetch: " + JSON.stringify(log.map(r => r.range)));
    assert(!f.tail && f.entries.length === 5, "tailTick drops it — no compressed bytes appended, got " + f.entries.length + " entries");
  }, { indexedDB: factory });

  // Desktop native parsing: parse_log_file (commands.rs) rejects a gzip file
  // before streaming anything (philogg_logparse::is_gzip) — this stub
  // mimics exactly that and records the call, so every native route is
  // shown to fall back to the JS read + inflate.
  function nativeBridge() {
    const b = nativeFolderBridge({});
    b.nativeCalls = [];
    b.parseLogFile = async (url, spec, onMessage) => {
      b.nativeCalls.push(String(url));
      await Promise.resolve();
      throw new Error("gzip-compressed file: parsed by the page");
    };
    b.openLocalPath = async p => ({ url: "philogg://local/42/" + p.split("/").pop(), path: p, name: p.split("/").pop() });
    return b;
  }
  const deskFactory = new IDBFactory();
  await withApp(async (w, d, T) => {
    section("285d. desktop native route: drop/picker (loadDesktopLocalFiles) and launch (loadUrlIntoTree) try native, fall back, inflate, no tail");
    withGzipApis(w);
    w.fetch = rangedFetch(gzBuf);
    await w.loadDesktopLocalFiles({ files: [{ url: "philogg://local/11/app.log.1.gz", path: "/var/log/app.log.1.gz", name: "app.log.1.gz" }] });
    const a = T.state.nodes[T.state.rootIds[0]];
    assert(w.philogg.nativeCalls.length === 1 && w.philogg.nativeCalls[0] === "philogg://local/11/app.log.1.gz", "the native parser was asked first, got " + JSON.stringify(w.philogg.nativeCalls));
    assert(a && a.entries.length === 5 && a.entries[4].message === "old 4", "its rejection falls back to the JS route, which inflates, got " + (a && a.entries.length));
    assert(!a.tail && a.localPath === "/var/log/app.log.1.gz", "no tail; location kept");

    await w.loadUrlIntoTree("philogg://local/12/app.log.2.gz");
    const b = T.state.nodes[T.state.rootIds[1]];
    assert(w.philogg.nativeCalls.length === 2, "the launch route asks the native parser too");
    assert(b && b.entries.length === 5 && !b.tail && b.name === "app.log.2.gz", "and falls back into the same node, inflated, untailed, got " + (b && b.entries.length));
    assert(T.state.rootIds.length === 2, "no stray node from the native attempt");

    // Session cache "path" record (desktop): re-read from disk on restore.
    await w.persistFileNode(a);
    await w.persistMetaNow();
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(a.cacheKey));
    assert(rec && rec.localPath === "/var/log/app.log.1.gz" && rec.text == null && rec.blob == null, "a desktop gzip file is cached as its path, like any desktop file");
  }, { indexedDB: deskFactory, philogg: nativeBridge() });
  await withApp(async (w, d, T) => {
    section("285e. desktop session restore re-reads a gzip path: native rejects, the fallback inflates, and no tail is attached");
    withGzipApis(w);
    w.fetch = rangedFetch(gzBuf);
    await T.bootRestore;
    const f = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "app.log.1.gz");
    assert(!!f && w.philogg.nativeCalls.length >= 1, "restore tried the native parser for the path record");
    assert(f && f.entries.length === 5 && f.entries[0].message === "old 0", "restored inflated, got " + (f && f.entries.length));
    assert(f && !f.tail && /^philogg:\/\/local\/42\//.test(f.sourceUrl), "this run's URL, and no tail for a gzip file");
  }, { indexedDB: deskFactory, philogg: nativeBridge() });
}
