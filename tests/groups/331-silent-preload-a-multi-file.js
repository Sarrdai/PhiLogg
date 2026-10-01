// GROUP 331 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* GROUP 331 — silent preload: a multi-file drop/open batch reads + parses
   while the merge-on-load dialog is still open (invisibly — placeholders stay
   grayed, no activeId change); the answer only decides presentation.
   Data: log-sim default-format files. */
group(331);
{
  const sims = seed => LOGSIM.generateToStrings({ format: "default", entries: 120, seed })[0];
  const mkFile = (w, sim, name) => new w.File([sim.text], name, { type: "text/plain" });

  await withApp(async (w, d, T) => {
    section("331a. parse runs during the dialog, invisibly; Merge reuses it (no second parse)");
    const sa = sims(11), sb = sims(12);
    const parseCalls = [];
    const origParse = w.parseLogTextAsync;
    w.parseLogTextAsync = function (text, node) { parseCalls.push(node.id); return origParse.apply(this, arguments); };
    const activeBefore = T.state.activeId;
    const p = w.loadFileDescriptors([
      { file: mkFile(w, sa, "pa.log"), handle: null }, { file: mkFile(w, sb, "pb.log"), handle: null },
    ]);
    const queued = T.state.rootIds.map(id => T.state.nodes[id]);
    assert(queued.length === 2 && queued.every(n => n.queued), "two queued placeholders");
    await waitFor(() => queued.every(n => n.entries.length > 0));
    await new Promise(r => setTimeout(r, 30));
    assert(!d.querySelector("#mergeLoadDialog").classList.contains("hidden"), "dialog still open");
    assert(queued.every(n => n.queued && n.entries.length > 0), "both files already parsed while still queued");
    assert(T.state.activeId === activeBefore, "state.activeId untouched during the dialog");
    assert(d.querySelectorAll(".tree-row").length === 0 && d.querySelectorAll(".tree-row-queued").length === 2, "still two grayed rows, no real row");
    const before = parseCalls.length;
    fireClick(d.querySelector("#mergeLoadDialogYes"), w);
    await p;
    w.parseLogTextAsync = origParse;
    assert(parseCalls.length === before && before === 2, "each file parsed exactly once, got " + parseCalls.length);
    const merged = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.merged);
    assert(merged && merged.entries.length === queued[0].entries.length + queued[1].entries.length, "merged node holds both files' entries");
    assert(queued.every(n => !n.queued && n.loadFraction === undefined), "sources activated and finished");
    for (let i = 1; i < merged.entries.length; i++) if (merged.entries[i].ts < merged.entries[i - 1].ts) { assert(false, "merged entries sorted by time"); break; }
  });

  await withApp(async (w, d, T) => {
    section("331b. answering No: both files become normal rows with their preloaded entries");
    const sa = sims(21), sb = sims(22);
    const p = w.loadFileDescriptors([
      { file: mkFile(w, sa, "na.log"), handle: null }, { file: mkFile(w, sb, "nb.log"), handle: null },
    ]);
    const nodes = T.state.rootIds.map(id => T.state.nodes[id]);
    await waitFor(() => nodes.every(n => n.entries.length > 0));
    fireClick(d.querySelector("#mergeLoadDialogNo"), w);
    await p;
    assert(T.state.rootIds.length === 2 && nodes.every(n => T.state.nodes[n.id] === n && !n.queued), "two ordinary loaded files, same node objects");
    assert(nodes.every(n => n.entries.length > 100), "entries complete");
    assert(d.querySelectorAll(".tree-row").length === 2 && d.querySelectorAll(".tree-row-queued").length === 0, "two real rows");
    assert(!T.state.rootIds.some(id => T.state.nodes[id].merged), "no merge");
  });

  await withApp(async (w, d, T) => {
    section("331c. a file failing during the dialog: reported after the answer, good one loads");
    const good = mkFile(w, sims(31), "good.log");
    const toasts = [];
    const origToast = w.showCopyToast;
    w.showCopyToast = function (m) { toasts.push(m); return origToast.apply(this, arguments); };
    const p = w.loadFileDescriptors([
      { name: "broken.log", openFile: async () => { throw new Error("gone"); }, handle: null },
      { file: good, handle: null },
    ]);
    await new Promise(r => setTimeout(r, 50));
    assert(toasts.length === 0, "no toast while the dialog is open");
    assert(T.state.rootIds.length === 2, "placeholder still there during the dialog");
    fireClick(d.querySelector("#mergeLoadDialogNo"), w);
    await p;
    w.showCopyToast = origToast;
    const names = T.state.rootIds.map(id => T.state.nodes[id].name);
    assert(names.join() === "good.log", "only the good file remains, got " + names.join());
    assert(toasts.length === 1 && toasts[0] === 'Couldn\'t load "broken.log" (gone)', "same toast text, got " + JSON.stringify(toasts));
    assert(T.state.nodes[T.state.rootIds[0]].entries.length > 100, "good file fully loaded");
  });

  await withApp(async (w, d, T) => {
    section("331d. Merge with the bar continuing: merge fraction counts a queued source's preload progress");
    const a = { id: "qa", type: "file", name: "qa", queued: true, entries: [], loadFraction: 0.5 };
    const b = { id: "qb", type: "file", name: "qb", queued: true, entries: [] };
    T.state.nodes.qa = a; T.state.nodes.qb = b;
    const m = { id: "qm", type: "file", name: "qm", entries: [], loadSources: [{ id: "qa", weight: 1 }, { id: "qb", weight: 1 }] };
    T.state.nodes.qm = m;
    w.updateMergeLoadFraction("qm");
    const half = m.loadFraction;
    assert(half > 0, "queued source with a fraction counts, got " + half);
    b.loadFraction = 0.5;
    w.updateMergeLoadFraction("qm");
    assert(Math.abs(m.loadFraction - 2 * half) < 1e-9, "a queued source without a fraction counted 0 before");
    w.activateQueuedFileNode(a);
    assert(a.loadFraction === 0.5, "activation keeps the fraction reached during the preload");
    delete T.state.nodes.qa; delete T.state.nodes.qb; delete T.state.nodes.qm;
  });
}
