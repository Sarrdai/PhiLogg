// GROUP 272 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 272 — Tracking / folder watch / ZIP / viewer performance review
   Origin: 2026-09-25, person-requested performance review of live tracking
   (tailing), folder watch (+ settings), ZIP, text and image viewers, and
   partial/combined loading from a watched folder. Covers: per-entry filters
   extended from their old result on a tail append (only the new entries
   tested) with results identical to a cold recompute, concurrent tail polls,
   the tailed file's session-cache record as a Blob snapshot (exact restore
   offset), ranged reads of philogg://local/… files, the minimap probe
   dedupe, reused unopened sidebar rows, the text/image viewers not
   rebuilding on unrelated renders (and per-image natural size), and
   concurrent merge-source loads.
   ============================================================ */
group(272);
{
  // ASCII-only Blob-shaped view of a string with real slice(start, end).
  function textFile(w, text, blobSlices) {
    const view = (a, b) => ({
      size: b - a,
      slice(x, y) {
        const len = b - a;
        const lo = Math.max(0, Math.min(len, x == null ? 0 : x));
        const hi = Math.max(lo, Math.min(len, y == null ? len : y));
        if (blobSlices) { const sub = text.slice(a + lo, a + hi); const bl = new w.Blob([sub]); bl.text = async () => sub; return bl; }
        return view(a + lo, a + hi);
      },
      text: async () => text.slice(a, b),
    });
    return view(0, text.length);
  }
  const line = (sec, level, msg) => "2024-01-15 10:" + String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0") + ",000\t" + level + "\t\"main\"\tFoo.cs\tline 1\t[DoWork]\t\"" + msg + "\"\n";
  const idsOf = (w, id) => w.getEntries(id).map(e => e.id).join(",");

  await withApp(async (w, d, T) => {
    section("272a. A tail append extends per-entry filters from their old result; every node matches a cold recompute");
    let text = makeLog(0, 2000) + line(2000, "INFO", "pivot entry");
    const f = await w.addFile("live.log", text, () => {});
    const handle = { async getFile() { return textFile(w, text); } };
    f.tail = { handle, offset: text.length, pending: "", failed: false, busy: false };
    const txt = w.createFilterNode(f.id, "text", "needle");
    const inv = w.createFilterNode(f.id, "text", "needle"); inv.inverted = true;
    const lvl = w.createFilterNode(f.id, "level", ["ERROR", "INFO"]);
    const nested = w.createFilterNode(lvl.id, "text", "message 1");
    const tr = w.createFilterNode(f.id, "timerange", { from: null, to: null });
    const ctx = w.createFilterNode(f.id, "context", null);
    const underCtx = ctx ? w.createFilterNode(ctx.id, "text", "needle") : null;
    const nodes = [txt, inv, lvl, nested, tr, ctx, underCtx].filter(Boolean);
    w.invalidateAllCaches();
    nodes.forEach(n => w.getEntries(n.id));
    // Continuation line on the previous last entry (it now contains the
    // needle) plus fresh entries, one of them matching.
    text += "   at needle.Continuation()\n" + line(2001, "ERROR", "needle new") + line(2002, "INFO", "message 1 new");
    let calls = 0, extended = 0;
    const orig = w.textFilterMatches, origExt = w.extendCachedEntries;
    w.textFilterMatches = function () { calls++; return orig.apply(this, arguments); };
    w.extendCachedEntries = function () { extended++; return origExt.apply(this, arguments); };
    await w.tailTick(); // the active view is under f, so this also renders (reading every node)
    assert(f.entries.length === 2003, "sanity: two new entries appended (" + f.entries.length + ")");
    const warm = nodes.map(n => idsOf(w, n.id));
    assert(extended === 5, "the five per-entry filters were extended, the context filter and its child were not (" + extended + ")");
    // The text filter under the context node recomputes over the context
    // result (its chain isn't per-entry); everything else only tests the delta.
    const ctxLen = ctx ? w.getEntries(ctx.id).length : 0;
    assert(calls <= ctxLen + 20, "text filters tested only the new entries plus the pivot (" + calls + " calls, " + ctxLen + " from the context child)");
    w.textFilterMatches = orig;
    w.extendCachedEntries = origExt;
    assert(w.getEntries(txt.id).some(e => e === f.entries[2000]), "the pivot entry now matches through its continuation line");
    assert(!w.getEntries(inv.id).some(e => e === f.entries[2000]), "...and dropped out of the inverted filter");
    w.invalidateAllCaches();
    const cold = nodes.map(n => idsOf(w, n.id));
    assert(warm.every((v, i) => v === cold[i]), "every node's extended result equals a cold recompute");

    section("272b. Two ticks without a read in between, then a rotation, stay exact");
    text += line(2003, "INFO", "needle a");
    await w.tailTick();
    text += line(2004, "INFO", "needle b");
    await w.tailTick();
    const warm2 = nodes.map(n => idsOf(w, n.id));
    w.invalidateAllCaches();
    assert(warm2.every((v, i) => v === nodes.map(n => idsOf(w, n.id))[i]), "accumulated tail bases still give the cold result");
    text = line(3000, "INFO", "needle rotated") + line(3001, "WARN", "other");
    await w.tailTick();
    assert(f.entries.length === 2 && !txt._tailBase, "rotation: entries replaced, no tail base kept");
    assert(w.getEntries(txt.id).length === 1, "rotation: recomputed from the new content");
    section("272b2. Without a render in between, the old result waits as a tail base");
    T.state.activeId = null;
    text += line(3002, "INFO", "needle c");
    await w.tailTick();
    assert(txt._cache === null && txt._tailBase && txt._tailBase.stable === 1, "tail base kept (stable prefix = the one earlier match)");
    assert(w.getEntries(txt.id).length === 2, "...and extended on the next read");
  });

  await withApp(async (w, d, T) => {
    section("272c. tailTick polls every tailed file at the same time");
    const started = [];
    let release;
    const gate = new Promise(r => { release = r; });
    const mk = name => ({ async getFile() { started.push(name); await gate; return textFile(w, makeLog(0, 3)); } });
    const a = await w.addFile("a.log", makeLog(0, 3), () => {});
    const b = await w.addFile("b.log", makeLog(0, 3), () => {});
    a.tail = { handle: mk("a"), offset: makeLog(0, 3).length, pending: "", failed: false, busy: false };
    b.tail = { handle: mk("b"), offset: makeLog(0, 3).length, pending: "", failed: false, busy: false };
    const tick = w.tailTick();
    await new Promise(r => setTimeout(r, 0));
    assert(started.length === 2, "both getFile() calls are in flight before either resolves (" + started.join(",") + ")");
    release();
    await tick;
  });

  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    section("272d. A tailed file's cache record is a Blob snapshot up to the committed offset, not rebuilt text");
    await T.bootRestore;
    let text = makeLog(0, 5).replace(/\n/g, "\r\n");
    const f = await w.addFile("live.log", text, () => {});
    // Non-enumerable, so the record's handle field structured-clones like a
    // real FileSystemFileHandle does.
    const handle = {};
    Object.defineProperty(handle, "getFile", { value: async () => textFile(w, text, true), writable: true });
    f.tail = { handle, offset: text.length, pending: "", failed: false, busy: false };
    text += "2024-01-15 10:00:09,000\tINFO\t\"main\"\tFoo.cs\tline 1\t[DoWork]\t\"half";
    await w.tailTick();
    assert(f.tail.pending.length > 0, "sanity: an unterminated line is pending");
    await w.persistFileNode(f);
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec && rec.text === null && rec.blob, "the record carries a blob, no text");
    const stored = rec && rec.blob ? await rec.blob.text() : "";
    assert(stored === makeLog(0, 5).replace(/\n/g, "\r\n"), "blob = the file's bytes up to the last complete line (CRLF kept)");
    f._cacheBlob = rec.blob;
    assert(w.restoredTailOffset(f) === stored.length, "restore offset = blob size (exact, unlike rebuilt LF-only text)");
    delete f._cacheBlob;
    // A snapshot that can't be taken falls back to text.
    Object.defineProperty(handle, "getFile", { value: async () => { throw new Error("locked"); } });
    await w.persistFileNode(f);
    const rec2 = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec2 && typeof rec2.text === "string" && !rec2.blob, "unreadable handle: falls back to a text record");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    section("272e. philogg://local/… files are read by byte range: size probe, tail poll, minimap probe");
    let body = makeLog(0, 50);
    const requests = [];
    w.fetch = async (url, init) => {
      const range = init && init.headers && init.headers.Range;
      requests.push(range || "FULL");
      if (!range) return new Response(body, { status: 200 });
      const m = /bytes=(\d+)-(\d+)/.exec(range);
      const start = +m[1], end = Math.min(+m[2], body.length - 1);
      if (start >= body.length) return new Response("", { status: 416, headers: { "content-range": "bytes */" + body.length } });
      return new Response(body.slice(start, end + 1), { status: 206, headers: { "content-range": "bytes " + start + "-" + end + "/" + body.length } });
    };
    const h = w.urlTailHandle("philogg://local/1/a.log", "/x/a.log");
    const rf = await h.getRangedFile();
    assert(rf.size === body.length, "size learned from Content-Range");
    assert(await rf.slice(10, 20).text() === body.slice(10, 20), "slice reads exactly that range");
    assert(await rf.slice(5).slice(2, 4).text() === body.slice(7, 9), "nested slices compose");
    const f = await w.addFile("a.log", body, () => {});
    f.tail = { handle: h, offset: body.length, pending: "", failed: false, busy: false };
    requests.length = 0;
    body += line(100, "ERROR", "appended");
    await w.tailTick();
    assert(f.entries.length === 51, "the append was picked up");
    // A hand-attached tail (like a restore/rescan reattach) gets tailTick's
    // one-time gzip check on its first poll: a 2-byte ranged read, never a
    // full fetch (GROUP 285, "gzip-compressed logs"), and resolves the file's
    // text encoding once from a ranged head read (GROUP format-encoding).
    // Load paths mark their own fresh tails as already checked.
    assert(!requests.includes("FULL") && requests.length === 4 && requests[1] === "bytes=0-1" && requests[2].startsWith("bytes=0-"),
      "first tail poll = one size probe + the one-time 2-byte gzip check + the one-time encoding head read + one ranged read, no full fetch (" + requests.join(" | ") + ")");
    requests.length = 0;
    const rec = { name: "a.log", handle: h };
    const range = await w.probeFolderFileRange({ id: "x" }, rec);
    assert(range && range.first < range.last, "minimap probe found the time range");
    assert(!requests.includes("FULL"), "...by ranged reads only (" + requests.length + " requests)");
    // A wrapper without Range support: the full body, still usable.
    w.fetch = async () => new Response(body, { status: 200 });
    const full = await w.urlTailHandle("philogg://local/1/a.log").getRangedFile();
    assert(full.size === body.length, "no Range support: falls back to the whole file");
  });

  await withApp(async (w, d, T) => {
    section("272f. A minimap probe in flight is shared, not repeated per render");
    let reads = 0, release;
    const gate = new Promise(r => { release = r; });
    const rec = { name: "a.log", handle: { async getFile() { reads++; await gate; return textFile(w, makeLog(0, 5)); } } };
    const p1 = w.probeFolderFileRange({ id: "x" }, rec);
    const p2 = w.probeFolderFileRange({ id: "x" }, rec);
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    assert(reads === 1 && r1 && r1 === r2, "one read for two concurrent probes (" + reads + ")");
    assert(await w.probeFolderFileRange({ id: "x" }, rec) === r1 && reads === 1, "a resolved probe is cached");
  });

  await withApp(async (w, d, T) => {
    section("272g. Unopened folder and ZIP rows are reused across renders (and still open on double-click)");
    const files = { "a.log": makeLog(0, 5), "b.log": makeLog(10, 5) };
    const dir = { kind: "directory", name: "logs", async *values() {
      for (const n of Object.keys(files)) yield { kind: "file", name: n, async getFile() { const b = new w.Blob([files[n]]); b.text = async () => files[n]; Object.defineProperty(b, "name", { value: n }); return b; } };
    } };
    await w.addWatchedFolder(dir);
    const rowOf = name => [...d.querySelectorAll("#folderWatchList .folder-watch-file")].find(r => r.textContent.includes(name));
    const before = rowOf("b.log");
    w.render();
    assert(before && rowOf("b.log") === before, "same element after a render");
    T.state.zips.push({ id: "z1", name: "a.zip", entries: [{ name: "notes.txt", size: 1, extract: async () => new Uint8Array([104]) }], inlineViewers: new Map() });
    w.render();
    const zrow = [...d.querySelectorAll("#zipList .folder-watch-file")][0];
    w.render();
    assert(zrow && [...d.querySelectorAll("#zipList .folder-watch-file")][0] === zrow, "ZIP entry row reused too");
    before.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true }));
    await waitFor(() => T.state.folders[0].files.find(r => r.name === "b.log").nodeId);
    assert(T.state.folders[0].files.find(r => r.name === "b.log").nodeId, "double-click on the reused row still opens the file");
  });

  await withApp(async (w, d, T) => {
    section("272h. Image viewer: pan/zoom keeps the <image>, size is per image");
    const png = new Uint8Array([137, 80, 78, 71]);
    await w.openInlineViewer("wide.png", png, "image", null);
    const wide = T.state.inlineViewer;
    wide.naturalSize = { w: 400, h: 100 };
    w.render();
    const svg = d.querySelector("#imgViewerSvg");
    const img = svg.querySelector("image");
    assert(img && img.getAttribute("width") === "400", "wide image drawn at its own width");
    d.querySelector("#imgZoomInBtn").click();
    assert(svg.querySelector("image") === img, "zooming reuses the <image> element");
    await w.openInlineViewer("tall.png", png, "image", null);
    T.state.inlineViewer.naturalSize = { w: 50, h: 300 };
    w.render();
    const img2 = svg.querySelector("image");
    assert(img2 !== img && img2.getAttribute("width") === "50" && img2.getAttribute("height") === "300", "a second image gets its own dimensions, not the first one's");
  });

  await withApp(async (w, d, T) => {
    section("272k. Tail growth under an unchanged filter tree doesn't re-fingerprint the file for its filter-history record");
    await T.bootRestore;
    let text = makeLog(0, 50);
    const f = await w.addFile("live.log", text, () => {});
    f.tail = { handle: { async getFile() { return textFile(w, text); } }, offset: text.length, pending: "", failed: false, busy: false };
    const flt = w.createFilterNode(f.id, "text", "message 1");
    await w.persistFileHistoryNow();
    const key1 = f._historyKey;
    const rec1 = await w.cacheStoreOp("fileHistory", "readonly", st => st.get(key1));
    assert(rec1 && rec1.filters.length === 1, "first save writes the record");
    let hashes = 0;
    const orig = w.getFileFullHash;
    w.getFileFullHash = function () { hashes++; return orig.apply(this, arguments); };
    for (let i = 0; i < 3; i++) { text += line(200 + i, "INFO", "grow " + i); await w.tailTick(); await w.persistFileHistoryNow(); }
    assert(hashes === 0 && f._historyKey === key1, "three growth ticks: no re-fingerprint, record left under its key (" + hashes + ")");
    w.createFilterNode(f.id, "level", ["ERROR"]);
    await w.persistFileHistoryNow();
    w.getFileFullHash = orig;
    assert(hashes === 1 && f._historyKey !== key1, "a filter change writes a new record under the grown content's key");
    const rec2 = await w.cacheStoreOp("fileHistory", "readonly", st => st.get(f._historyKey));
    assert(rec2 && rec2.filters.length === 2 && rec2.entryCount === 53, "...with both filters and the grown entry count");
  }, { indexedDB: new IDBFactory() });

  await withApp(async (w, d, T) => {
    section("272j. A folder-minimap merge loads its sources at the same time, result in target order");
    const f1 = await w.addFile("x.log", makeLog(0, 3), () => {});
    const f2 = await w.addFile("y.log", makeLog(0, 3), () => {});
    const targets = [{ name: "x.log" }, { name: "y.log" }];
    const started = [];
    const releases = [];
    const load = rec => { started.push(rec.name); return new Promise(r => releases.push(() => { rec.nodeId = rec.name === "x.log" ? f1.id : f2.id; r(); })); };
    const shell = w.createMergeShell("x + y", undefined);
    const p = w.loadFolderMergeSources(targets, shell, load);
    await new Promise(r => setTimeout(r, 0));
    assert(started.length === 2, "both loads started before either finished");
    releases[1](); releases[0]();
    const ids = await p;
    assert(ids[0] === f1.id && ids[1] === f2.id, "ids in target order despite reverse completion");
    assert(f1.mergeSourceHidden && f2.mergeOwnerId === shell.id && shell.loadSources.length === 2, "each tagged as a hidden source of the shell");
  });
}
