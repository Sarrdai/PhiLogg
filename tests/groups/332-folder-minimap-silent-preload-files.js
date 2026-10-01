// GROUP 332 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 332 — folder-minimap silent preload: files selected in the minimap
   (bars, or a dragged window) are read+parsed in the background as hidden
   nodes (state.nodes only); the diff rules, the priority rules and the
   adoption by the load/merge actions. */
group(332);
{
  function preloadHandle(w, text, counter) {
    return {
      async getFile() {
        counter.n++;
        const blob = new w.Blob([text]);
        Object.defineProperty(blob, "size", { get: () => text.length, configurable: true });
        blob.text = async () => text;
        blob.slice = (start, end) => { const sl = text.slice(start, end === undefined ? text.length : end); const b = new w.Blob([sl]); b.text = async () => sl; return b; };
        return blob;
      },
    };
  }
  const t10 = (s) => new Date(2024, 0, 15, 10, 0, s, 0).getTime();
  function bigLog(n) { // > WINDOWED_LOAD_MIN_FILE_SIZE, one entry per second from 10:00:00
    const filler = "X".repeat(14000), lines = [];
    for (let i = 0; i < n; i++) lines.push(`2024-01-15 10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"message ${i} ${filler}"`);
    return lines.join("\n") + "\n";
  }
  function setup(w, T, files, id) {
    const counters = files.map(() => ({ n: 0 }));
    const recs = files.map((f, i) => ({ name: f.name, relPath: f.name, nodeId: null, handle: preloadHandle(w, f.text, counters[i]), _range: f.range }));
    const folder = { id, name: id, files: recs, inlineViewers: new Map() };
    T.state.folders.push(folder);
    w.selectFolderContainer(folder.id);
    return { folder, recs, counters };
  }
  const job = (T, folder, rec) => T.folderPreloads.get(folder.id + "|" + rec.relPath);
  const clickBar = (w, d, name) => fireClick(d.querySelector('.fm-bar[data-key="' + name + '"]'), w);

  await withApp(async (w, d, T) => {
    section("332a. Selected bars preload hidden, one at a time; nothing visible changes");
    const { folder, recs } = setup(w, T, [
      { name: "a.log", text: makeLog(0, 3), range: { first: t10(0), last: t10(2) } },
      { name: "b.log", text: makeLog(2, 3, { msgPrefix: "b" }), range: { first: t10(2), last: t10(4) } },
    ], "pre-a");
    const activeBefore = T.state.activeId, rootsBefore = T.state.rootIds.slice();
    w.renderFolderMinimap(folder);
    clickBar(w, d, "a.log"); clickBar(w, d, "b.log");
    assert(T.folderPreloads.size === 2, "two jobs after clicking two bars, got " + T.folderPreloads.size);
    const ja = job(T, folder, recs[0]), jb = job(T, folder, recs[1]);
    assert(ja.started && !jb.started, "one speculative job at a time: the first runs, the second waits");
    assert(T.state.nodes[ja.node.id] === ja.node && !T.state.rootIds.includes(ja.node.id) && ja.node.preload, "a job's node lives in state.nodes only");
    await ja.promise;
    await waitFor(() => jb.started);
    await jb.promise;
    assert(ja.node.entries.length === 3 && jb.node.entries.length === 3, "both parsed fully in the background");
    assert(T.state.activeId === activeBefore && T.state.rootIds.join() === rootsBefore.join(), "activeId and the tree are untouched");
    assert(T.state.folderView === folder.id, "the minimap stays shown");
    assert(d.querySelectorAll(".tree-row").length === 0, "no row rendered for a preload");
    assert(!recs[0].nodeId && !recs[1].nodeId, "the recs are not opened");

    section("332b. Deselecting a bar aborts only its job; the other job keeps running (same object)");
    clickBar(w, d, "a.log");
    assert(!job(T, folder, recs[0]) && T.state.nodes[ja.node.id] === undefined, "job A gone, its node deleted");
    assert(job(T, folder, recs[1]) === jb && T.state.nodes[jb.node.id] === jb.node, "job B untouched");

    section("332f. Leaving the minimap aborts every job");
    await w.addFile("other.log", makeLog(0, 1), () => {});
    assert(T.folderPreloads.size === 0 && T.state.nodes[jb.node.id] === undefined, "opening a real file discards the remaining preloads");
  });

  await withApp(async (w, d, T) => {
    section("332c. A dragged window preloads a slice of a big file; a new window restarts only that job");
    const big = bigLog(600);
    const { folder, recs } = setup(w, T, [
      { name: "big.log", text: big, range: { first: t10(0), last: t10(599) } },
      { name: "s.log", text: makeLog(0, 3), range: { first: t10(0), last: t10(2) } },
    ], "pre-c");
    w.renderFolderMinimap(folder);
    T.fmSelectedRecKeys = new Set(); T.fmSelectedWindow = { from: t10(0), to: t10(9) };
    w.renderFolderMinimap(folder);
    const jbig = job(T, folder, recs[0]);
    assert(jbig && jbig.started, "the big file's job runs");
    const out = await jbig.promise;
    assert(jbig.effective === "window" && out.ok && jbig.node.entries.length > 0 && jbig.node.entries.length < 100, "a slice job: only the window was parsed, got " + jbig.node.entries.length);
    await waitFor(() => job(T, folder, recs[1]) && job(T, folder, recs[1]).started);
    const jsmall = job(T, folder, recs[1]);
    await jsmall.promise;
    assert(jsmall.effective === "full" && jsmall.node.entries.length === 3, "a small file is preloaded in full even under a window");
    T.fmSelectedWindow = { from: t10(0), to: t10(20) };
    w.renderFolderMinimap(folder);
    const jbig2 = job(T, folder, recs[0]);
    assert(jbig2 !== jbig && T.state.nodes[jbig.node.id] === undefined, "changing the window restarts the slice job");
    assert(job(T, folder, recs[1]) === jsmall, "the full job of the small file stays");
    await jbig2.promise;
  });

  await withApp(async (w, d, T) => {
    section("332d. Merge (full) adopts finished preloads: no second read, same result");
    const { folder, recs, counters } = setup(w, T, [
      { name: "a.log", text: makeLog(0, 3), range: { first: t10(0), last: t10(2) } },
      { name: "b.log", text: makeLog(2, 3, { msgPrefix: "b" }), range: { first: t10(2), last: t10(4) } },
    ], "pre-d");
    w.renderFolderMinimap(folder);
    clickBar(w, d, "a.log"); clickBar(w, d, "b.log");
    const ja = job(T, folder, recs[0]), jb = job(T, folder, recs[1]);
    await ja.promise; await waitFor(() => jb.started); await jb.promise;
    await w.folderMinimapMergeFull(folder);
    assert(counters[0].n === 1 && counters[1].n === 1, "each file was read exactly once, got " + counters.map(c => c.n));
    const merged = T.state.nodes[T.state.activeId];
    assert(merged && merged.merged && merged.entries.length === 6, "merged node with both files' entries");
    assert(T.state.nodes[ja.node.id] === ja.node && recs[0].nodeId === ja.node.id && !ja.node.preload, "the preloaded node itself became the file");
    assert(T.folderPreloads.size === 0, "no jobs left");
  });

  await withApp(async (w, d, T) => {
    section("332d2. An in-flight job is adopted with its current fraction (progress bar continues)");
    const { folder, recs, counters } = setup(w, T, [
      { name: "a.log", text: makeLog(0, 300), range: { first: t10(0), last: t10(2) } },
    ], "pre-d2");
    w.renderFolderMinimap(folder);
    clickBar(w, d, "a.log");
    const ja = job(T, folder, recs[0]);
    assert(ja.started, "job started");
    ja.node.loadFraction = 0.6; // pretend mid-way
    const p = w.folderMinimapLoadIndividually(folder);
    assert(T.state.rootIds.includes(ja.node.id) && !ja.node.preload && ja.node.loadFraction === 0.6, "adopted at once as a real row, keeping fraction 0.6");
    assert(d.querySelector('.tree-row[data-node-id="' + ja.node.id + '"]'), "row rendered");
    await p;
    assert(recs[0].nodeId === ja.node.id && ja.node.entries.length === 300 && ja.node.loadFraction === undefined, "finished normally");
    assert(counters[0].n === 1, "read once");
  });

  await withApp(async (w, d, T) => {
    section("332e. Merge (window) adopts exact-window slice jobs; the slice node is partial");
    const big = bigLog(600);
    const { folder, recs, counters } = setup(w, T, [
      { name: "big.log", text: big, range: { first: t10(0), last: t10(599) } },
      { name: "s.log", text: makeLog(0, 3), range: { first: t10(0), last: t10(2) } },
    ], "pre-e");
    w.renderFolderMinimap(folder);
    T.fmSelectedRecKeys = new Set(); T.fmSelectedWindow = { from: t10(0), to: t10(9) };
    w.renderFolderMinimap(folder);
    const jbig = job(T, folder, recs[0]);
    await jbig.promise; await waitFor(() => job(T, folder, recs[1]).started);
    await job(T, folder, recs[1]).promise;
    await w.folderMinimapMergeWindow(folder);
    assert(counters[0].n === 1 && counters[1].n === 1, "no second read, got " + counters.map(c => c.n));
    assert(T.state.nodes[jbig.node.id] === jbig.node && jbig.node.partial && jbig.node.partial.from === t10(0) && jbig.node.partial.to === t10(9), "the slice node became the partial file");
    const merged = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.merged);
    assert(merged && merged.partial, "the merge carries the partial flag");
  });

  await withApp(async (w, d, T) => {
    section("332g. Priority: waits for foreground loads; the throttle only touches speculative parses");
    const calls = [];
    const orig = w.parseLogTextAsync;
    w.parseLogTextAsync = function (text, node, cb, opts) { calls.push({ preload: !!node.preload, opts }); return orig.apply(this, arguments); };
    const { folder, recs } = setup(w, T, [
      { name: "a.log", text: makeLog(0, 3), range: { first: t10(0), last: t10(2) } },
      { name: "b.log", text: makeLog(2, 3, { msgPrefix: "b" }), range: { first: t10(2), last: t10(4) } },
    ], "pre-g");
    T.foregroundLoads = 1; // a foreground load is "running"
    w.renderFolderMinimap(folder);
    clickBar(w, d, "a.log"); clickBar(w, d, "b.log");
    assert(T.folderPreloads.size === 2 && [...T.folderPreloads.values()].every(j => !j.started), "no job starts while a foreground load runs");
    T.foregroundLoads = 0;
    w.syncFolderPreloads();
    assert(job(T, folder, recs[0]).started && !job(T, folder, recs[1]).started, "released: exactly one job starts");
    await job(T, folder, recs[0]).promise;
    await w.loadFiles([new w.File([makeLog(0, 3)], "n.log")]);
    w.parseLogTextAsync = orig;
    const pre = calls.filter(c => c.preload), normal = calls.filter(c => !c.preload);
    assert(pre.length >= 1 && pre.every(c => c.opts && c.opts.maxWorkers >= 1 && c.opts.drainBatches), "speculative parses get maxWorkers + drainBatches");
    assert(normal.length >= 1 && normal.every(c => c.opts === undefined), "normal loads pass no throttle");
    assert(w.parallelParseWorkerCount(64 << 20) >= w.parallelParseWorkerCount(64 << 20, 1) && w.parallelParseWorkerCount(64 << 20, 1) === 1, "parallelParseWorkerCount only caps when asked");
  });

  await withApp(async (w, d, T) => {
    section("332h. Already-open files, inline-viewable files and meta-format files get no job");
    await waitForFormatConfig(T);
    T.state.logFormats.push({ id: "t1", name: "t1", mode: "regex", regex: "^(?<ts>\\d+) (?<message>.*)$", tsFormat: "" },
      { id: "meta1", name: "meta", mode: "meta", targetFormatIds: ["t1"] });
    T.state.formatRules.push({ glob: "*.meta.log", formatId: "meta1", order: -1 });
    w.invalidateFormatCompileCache(); w.invalidateGlobCompileCache();
    const open = await w.addFile("open.log", makeLog(0, 2), () => {});
    const { folder, recs } = setup(w, T, [
      { name: "open.log", text: makeLog(0, 2), range: { first: t10(0), last: t10(1) } },
      { name: "pic.png", text: "x", range: { first: t10(0), last: t10(1) } },
      { name: "m.meta.log", text: "1 a\n", range: { first: t10(0), last: t10(1) } },
      { name: "ok.log", text: makeLog(0, 2), range: { first: t10(0), last: t10(1) } },
    ], "pre-h");
    recs[0].nodeId = open.id;
    w.selectFolderContainer(folder.id);
    w.renderFolderMinimap(folder);
    T.fmSelectedRecKeys = new Set(recs.map(r => r.relPath)); T.fmSelectedWindow = null;
    w.renderFolderMinimap(folder);
    assert([...T.folderPreloads.keys()].join() === folder.id + "|ok.log", "only the plain closed log file preloads, got " + [...T.folderPreloads.keys()]);
  });
}
