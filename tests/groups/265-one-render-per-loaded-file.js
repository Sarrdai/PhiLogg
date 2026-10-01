// GROUP 265 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 265 — One render per loaded file; per-pass level memo
   (2026-09-24). loadOneFileIntoTree no longer renders itself (it used to
   flushLoadRender() and then its caller rendered again — two full renders
   per file, each hundreds of ms on a large one): the caller renders once,
   after the tail/history setup. The O(n) level loops (minimap overlay,
   level counts, level filters) resolve each (format, level) pair once per
   pass via makeLevelBucketer instead of per entry.
   ============================================================ */
group(265);
{
  // Counts render() calls that happen once the file named `name` holds all
  // `count` of its entries — i.e. renders of the finished load.
  function countFinishedRenders(w, T, name, count) {
    const orig = w.render;
    const counter = { n: 0, restore() { w.render = orig; } };
    w.render = function () {
      const done = T.state.rootIds.map(id => T.state.nodes[id]).some(n => n && n.name === name && n.entries.length === count);
      if (done) counter.n++;
      return orig.apply(this, arguments);
    };
    return counter;
  }

  await withApp(async (w, d, T) => {
    section("265a. A dropped/picked file renders exactly once after it's loaded");
    const c1 = countFinishedRenders(w, T, "one.log", 30);
    await w.loadFiles([new w.File([makeLog(0, 30)], "one.log")]);
    c1.restore();
    const one = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "one.log");
    assert(one && one.entries.length === 30 && T.state.activeId === one.id, "sanity: the file loaded and is active");
    assert(c1.n === 1, "one render once the file is loaded, got " + c1.n);
    assert(d.querySelector('.tree-row[data-node-id="' + one.id + '"] .tree-load-fill') === null ||
      !d.querySelector('.tree-row[data-node-id="' + one.id + '"]').classList.contains("loading"),
      "...and that render shows it as loaded");
    assert(Number(d.querySelector('.tree-row[data-node-id="' + one.id + '"] .tree-count').textContent.replace(/\D/g, "")) === 30,
      "...with its entry count");

    // A two-file batch (merge declined): each file still shows up as soon
    // as it's done; a failing third one still gets its placeholder removed.
    const p = w.loadFileDescriptors([
      { file: new w.File([makeLog(0, 5)], "a.log"), handle: null },
      { file: new w.File([makeLog(100, 7)], "b.log"), handle: null },
      { name: "broken.log", openFile: async () => { throw new Error("gone"); }, handle: null },
    ]);
    await waitFor(() => !d.querySelector("#mergeLoadDialog").classList.contains("hidden"));
    fireClick(d.querySelector("#mergeLoadDialogNo"), w);
    await p;
    const names = T.state.rootIds.map(id => T.state.nodes[id]).map(n => n.name);
    assert(names.includes("a.log") && names.includes("b.log") && !names.includes("broken.log"), "batch: both good files loaded, the broken one's placeholder is gone, got " + names.join(","));
    assert(!d.querySelector(".tree-row.queued") && [...d.querySelectorAll(".tree-row")].every(r => !/broken\.log/.test(r.textContent)),
      "...and the rendered tree agrees (no stale placeholder row)");
  });

  const bridge = { getPathForFile: () => null, revealPath: () => {}, revealLocalUrl: () => {}, listSystemFonts: () => Promise.resolve([]) };
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "native-parse-golden.json"), "utf8"));
  const batches = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "native-batch-golden.json"), "utf8"));
  const crlf = golden.cases.find(c => c.name === "builtin-crlf-trailing-newline");
  await withApp(async (w, d, T) => {
    section("265b. The desktop routes (drop, file association) render once too");
    bridge.parseLogFile = async (url, spec, onMessage) => {
      onMessage(w.Uint8Array.from(Buffer.from(batches[crlf.name], "base64")).buffer);
      return { size: 10 };
    };
    w.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) });
    let c = countFinishedRenders(w, T, "d.log", crlf.entries.length);
    await w.loadDesktopLocalFiles({ files: [{ name: "d.log", url: "philogg://local/1/d.log", path: "/x/d.log" }] });
    c.restore();
    assert(c.n === 1, "drop/dialog route: one render once loaded, got " + c.n);
    c = countFinishedRenders(w, T, "u.log", crlf.entries.length);
    await w.loadUrlIntoTree("philogg://local/2/u.log");
    c.restore();
    assert(c.n === 1, "file-association route: one render once loaded, got " + c.n);
    const u = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.name === "u.log");
    assert(u && u.tail && u.loadFraction === undefined, "...with the tail already in place when it renders");
  }, { philogg: bridge });

  await withApp(async (w, d, T) => {
    section("265c. makeLevelBucketer === levelBucket; memoized minimap overlay unchanged");
    T.state.logFormats.push({ id: "sev", name: "sev", mode: "regex", regex: "^(?<level>\\d) (?<message>.*)$", tsFormat: "",
      levelValueType: "int", levels: [{ value: "3", name: "ERROR", color: null }, { value: "6", name: "NOTICE", color: "#123456" }] },
      { id: "cust", name: "cust", mode: "regex", regex: "^(?<level>\\S+) (?<message>.*)$", tsFormat: "", levels: ["FATAL", "ERROR", "NOTICE", "INFO"] });
    w.invalidateFormatCompileCache();
    const bucketOf = w.makeLevelBucketer();
    const cases = [];
    for (const fid of ["fmt-default", "sev", "cust", undefined]) {
      for (const lvl of ["ERROR", "error", " Warn ", "WARNING", "INFO", "debug", "TRACE", "FATAL", "NOTICE", "3", "6", "7", "", null, undefined, "weird"]) {
        cases.push([lvl, fid]);
      }
    }
    // twice, so the second round is served from the memo
    const mismatches = cases.concat(cases).filter(([l, f]) => bucketOf(l, f) !== w.levelBucket(l, f));
    assert(mismatches.length === 0, "memoized buckets equal levelBucket for every (level, format), mismatches: " + JSON.stringify(mismatches));

    const f = await w.addFile("lv.log", makeLog(0, 200, { levels: ["INFO", "ERROR", "DEBUG", "WARN", "TRACE"] }));
    T.state.activeId = f.id;
    w.render();
    const ov = [...d.querySelectorAll("#timelineMinimap .minimap-ov-bar")].map(r => r.getAttribute("class"));
    // The same overlay, computed the old way (levelBucket per entry).
    const counts = w.getLevelCounts(f.id);
    assert(counts.ERROR === 40 && counts.INFO === 40 && counts.TRACE === 40, "level counts through the memo, got " + JSON.stringify(counts));
    assert(ov.length > 0 && ov.every(c => /minimap-lvl-(error|warn|info|debug|trace)/.test(c)), "overlay bars carry level classes");
    // Every entry's level still reaches levelBucket — but only once per
    // distinct (format, level) pair per pass, not once per entry.
    const orig = w.levelBucket;
    let calls = 0;
    w.levelBucket = function () { calls++; return orig.apply(this, arguments); };
    f._levelCounts = null;
    w.invalidateCachesForRoots([f.id]);
    w.render();
    w.levelBucket = orig;
    // The visible rows still call it once each (levelClass, O(rows on
    // screen)); per-entry passes over all 200 (minimap + counts) would be
    // 400 more.
    assert(calls > 0 && calls < 150, "a full render of 200 entries resolves levels per distinct pair, not per entry: " + calls + " levelBucket calls");
    const ov2 = [...d.querySelectorAll("#timelineMinimap .minimap-ov-bar")].map(r => r.getAttribute("class"));
    assert(JSON.stringify(ov2) === JSON.stringify(ov), "the overlay is identical across renders");
  });
}
