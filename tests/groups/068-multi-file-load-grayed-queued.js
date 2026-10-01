// GROUP 68 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 68 — Multi-file load: grayed queued placeholders + merge-on-load
   prompt
   Origin: this session (2026-08-20), person-requested (German): dropping/
   picking several log files at once used to reveal each file's tree row
   only once its own turn to load arrived — the rest of the batch was
   invisible until then. Now every file in the batch gets a grayed
   placeholder row (createQueuedFileNode/renderQueuedFileRow, CSS
   .tree-row-queued) inserted at its eventual tree position immediately,
   turning into a normal, actively-loading row (activateQueuedFileNode) one
   at a time as loadFileDescriptors works through the batch — same idea as
   folder watch's grayed .folder-watch-file rows, but living directly in the
   main tree. Second request: loading 2+ files at once now asks upfront
   (confirmMergeOnLoad, #mergeLoadDialog) whether to merge them into one
   file once loaded — Enter answers Yes (the Merge button is focused on
   open, so this is the browser's own default button-activation, no custom
   keydown code), Escape answers No via the existing global Escape handler.
   Along the way, a single file's read/parse failure inside a batch no
   longer aborts the rest of the batch (each file's load is now individually
   try/caught) — otherwise every queued placeholder after the failed one
   would stay grayed forever.
   Addendum (2026-09-04): loadFileDescriptors now runs the whole batch
   concurrently instead of one file at a time — see its own comment and
   GROUP 165. 68a's "one at a time" assertions were updated to match (every
   placeholder now flips to a real row together); everything else in this
   group (grayed-placeholder ordering, merge-on-load, per-file failure
   isolation) is unaffected.
   ============================================================ */
group(68);
await withApp(async (w, d, T) => {
  section("68a. Multi-file load: every file gets a grayed placeholder row immediately, in order, before any reading starts");
  const fa = new w.File([makeLog(0, 3)], "a.log", { type: "text/plain" });
  const fb = new w.File([makeLog(0, 3)], "b.log", { type: "text/plain" });
  const fc = new w.File([makeLog(0, 3)], "c.log", { type: "text/plain" });

  const donePromise = w.loadFileDescriptors([
    { file: fa, handle: null }, { file: fb, handle: null }, { file: fc, handle: null },
  ]);
  // Synchronous prefix of loadFileDescriptors (queued-node creation + one
  // render()) has already run by the time this line executes — the first
  // await inside it (confirmMergeOnLoad's Promise) is what actually suspends,
  // same technique Group 48b uses for the single-file loading row.
  const queuedRows = [...d.querySelectorAll(".tree-row-queued .tree-label")].map(l => l.textContent);
  assert(queuedRows.length === 3, "all 3 files get a grayed placeholder row immediately, got " + queuedRows.length);
  assert(queuedRows.join(",") === "a.log,b.log,c.log", "placeholders appear in the order the files were passed in, got " + queuedRows.join(","));
  assert(d.querySelectorAll(".tree-row").length === 0, "none of the 3 are real interactive rows yet — no reading has started");
  assert(T.state.rootIds.length === 3, "each placeholder is already a real state.nodes/rootIds entry, just flagged queued");
  assert(T.state.nodes[T.state.rootIds[0]].queued === true, "placeholder node carries the queued flag");

  const mergeDialog = d.querySelector("#mergeLoadDialog");
  assert(!mergeDialog.classList.contains("hidden"), "loading 3 files at once opens the merge-confirm dialog");
  assert(d.activeElement && d.activeElement.id === "mergeLoadDialogYes", "the Merge button is focused on open, so Enter answers Yes via default button activation");

  // Answer No (via Escape, the person-requested "Esc for No") and let the
  // batch actually start loading.
  fireKeydown(d, w, "Escape");
  assert(mergeDialog.classList.contains("hidden"), "Escape closes the merge dialog");

  await new Promise(r => setTimeout(r, 0)); // let the now-unblocked batch start
  // Files now load concurrently (2026-09-04: real off-main-thread parsing via
  // parseLogTextInWorker made running the whole batch at once worthwhile —
  // see loadFileDescriptors' own comment), so every placeholder flips to a
  // real, actively-loading row together instead of one at a time.
  const activeLabels = [...d.querySelectorAll(".tree-row .tree-label")].map(l => l.textContent).sort();
  assert(activeLabels.join(",") === "a.log,b.log,c.log", "all 3 files start loading concurrently, got " + activeLabels.join(","));
  assert(d.querySelectorAll(".tree-row-queued").length === 0, "no placeholder stays grayed once the batch starts — every file's read begins at once");
  const firstLabel = [...d.querySelectorAll(".tree-row .tree-label")].find(l => l.textContent === "a.log");
  assert(firstLabel.closest(".tree-row").querySelector(".tree-load-fill") !== null, "each now-loading row carries the usual progress fill");

  await donePromise;
  assert(T.state.rootIds.length === 3, "all 3 files ended up loaded");
  assert(d.querySelectorAll(".tree-row-queued").length === 0, "no grayed placeholders remain once the whole batch has loaded");
  assert(T.state.rootIds.every(id => !T.state.nodes[id].merged), "answering No means no merged file was created");
});

await withApp(async (w, d, T) => {
  section("68b. Merge-on-load: answering Yes merges the batch into one file once loaded");
  const fa = new w.File([makeLog(0, 4)], "x.log", { type: "text/plain" });
  const fb = new w.File([makeLog(0, 4, { msgPrefix: "other" })], "y.log", { type: "text/plain" });

  const donePromise = w.loadFileDescriptors([{ file: fa, handle: null }, { file: fb, handle: null }]);
  const mergeDialog = d.querySelector("#mergeLoadDialog");
  assert(!mergeDialog.classList.contains("hidden"), "loading 2 files at once also opens the merge-confirm dialog");
  fireClick(d.querySelector("#mergeLoadDialogYes"), w);
  assert(mergeDialog.classList.contains("hidden"), "clicking Merge closes the dialog");

  await donePromise;
  assert(T.state.rootIds.length === 3, "both source files plus one new merged file are in the tree (mergeFiles keeps sources, same as the manual bulk action)");
  const merged = T.state.rootIds.map(id => T.state.nodes[id]).find(n => n.merged);
  assert(merged !== undefined, "a merged file node was created after both files finished loading");
  assert(merged.entries.length === 8, "the merged file's entries are the union of both source files, got " + merged.entries.length);
});

await withApp(async (w, d, T) => {
  section("68c. A single file loaded on its own (no batch) skips the merge dialog entirely");
  const fa = new w.File([makeLog(0, 3)], "solo.log", { type: "text/plain" });
  await w.loadFileDescriptors([{ file: fa, handle: null }]);
  assert(d.querySelector("#mergeLoadDialog").classList.contains("hidden"), "a single-file load never opens the merge dialog");
  assert(T.state.rootIds.length === 1, "the one file loaded normally");
});

await withApp(async (w, d, T) => {
  section("68d. One file failing inside a batch doesn't abort the rest");
  const good = new w.File([makeLog(0, 3)], "good.log", { type: "text/plain" });
  const bad = { name: "bad.log" }; // not a real Blob/File — FileReader.readAsText throws synchronously on it
  const donePromise = w.loadFileDescriptors([{ file: bad, handle: null }, { file: good, handle: null }]);
  fireKeydown(d, w, "Escape"); // answer the merge prompt (2 files queued) so the batch actually runs
  await donePromise;
  const names = T.state.rootIds.map(id => T.state.nodes[id].name);
  assert(names.includes("good.log"), "the good file still loaded despite the bad one failing, got " + JSON.stringify(names));
  assert(!names.includes("bad.log"), "the failed file's placeholder was removed, not left stuck");
  assert(d.querySelector("#copyToast").textContent.includes("bad.log"), "a toast reports which file failed to load");
});
