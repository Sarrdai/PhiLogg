// GROUP 209 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 209 — Per-file clock offset (FEATURE_BACKLOG.md #29)
   Diagnose-before-implement note: mergeFiles reuses a source file's entry
   OBJECTS by reference, so baking an offset into a source's entry.ts also
   moves those entries inside any merged file that contains them — the merged
   file's entries array (and its _orderIndexMap) then go stale. applyClockOffset
   re-sorts every merged root file and drops its order map for exactly this.
   Also: node.clockOffset is persisted separately from the file text (which is
   rebuilt from the ORIGINAL raw lines) and re-applied on session-cache restore.
   ============================================================ */
group(209);
section("209. Per-file clock offset: difference / start-time / undo / merge / persistence");

// --- 209a: parseClockDelta forms + the context-menu item + difference mode ---
await withApp(async (w, d, T) => {
  // Signed-delta parser: ms default, unit suffixes, colon time form, signs.
  assert(w.parseClockDelta("+1500") === 1500, "parseClockDelta: bare number is milliseconds");
  assert(w.parseClockDelta("-1500") === -1500, "parseClockDelta: leading minus");
  assert(w.parseClockDelta("−2s") === -2000, "parseClockDelta: unicode minus + seconds unit");
  assert(w.parseClockDelta("500ms") === 500, "parseClockDelta: explicit ms unit");
  assert(w.parseClockDelta("3m") === 180000, "parseClockDelta: minutes unit");
  assert(w.parseClockDelta("+00:01:30.500") === 90500, "parseClockDelta: HH:MM:SS.mmm colon form");
  assert(w.parseClockDelta("-01:30") === -90000, "parseClockDelta: MM:SS colon form");
  assert(w.parseClockDelta("") === null && w.parseClockDelta("abc") === null && w.parseClockDelta("1:2:3:4") === null,
    "parseClockDelta: empty/garbage/too-many-parts return null");

  const f = await w.addFile("clock.log", makeLog(0, 5), () => {});
  w.render();
  const firstTs0 = f.entries[0].ts, lastTs0 = f.entries[4].ts;

  // Context-menu item appears only on a real file node.
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, f.id);
  assert(d.querySelector('#treeContextMenu [data-action="clockOffset"]'),
    "context menu offers 'Adjust clock…' on a file node");
  w.closeTreeContextMenu();

  // Difference mode through the real dialog: +2s applied additively.
  w.openClockOffsetDialog(f.id);
  assert(isVisible(d.querySelector("#clockOffsetDialog"), w), "clock dialog opens");
  assert(isVisible(d.querySelector("#clockDiffRow"), w) && !isVisible(d.querySelector("#clockStartRow"), w),
    "difference mode is the default: diff row shown, start row hidden");
  d.querySelector("#clockDiffInput").value = "+2s";
  d.querySelector("#clockDiffInput").dispatchEvent(new w.Event("input", { bubbles: true }));
  // Live preview shows old -> new for both first and last line.
  const previewHtml = d.querySelector("#clockOffsetPreview").innerHTML;
  assert(previewHtml.includes("clock-preview-new") && previewHtml.includes(w.formatTime(firstTs0 + 2000)),
    "preview shows the first line's new (shifted) time");
  fireClick(d.querySelector("#clockOffsetApply"), w);
  assert(!isVisible(d.querySelector("#clockOffsetDialog"), w), "dialog closes after Apply");
  assert(f.entries[0].ts === firstTs0 + 2000 && f.entries[4].ts === lastTs0 + 2000,
    "difference mode: +2s baked into every entry.ts");
  assert(f.clockOffset === 2000, "node.clockOffset accumulates the applied delta");
  // Uniform shift preserves the file's own order + order-index map.
  const oim = w.buildOrderIndexMap(f.id);
  assert(oim.get(f.entries[0].id) === 0 && oim.get(f.entries[4].id) === 4,
    "a uniform shift keeps the file's own order (and its _orderIndexMap) valid");

  // Applying a second offset accumulates on top of the first.
  w.openClockOffsetDialog(f.id);
  assert(d.querySelector("#clockOffsetCurrent").textContent.includes("+2"), "dialog shows the current cumulative offset");
  d.querySelector("#clockDiffInput").value = "-500";
  fireClick(d.querySelector("#clockOffsetApply"), w);
  assert(f.clockOffset === 1500, "a second adjustment accumulates (2000 - 500)");
  assert(f.entries[0].ts === firstTs0 + 1500, "entries reflect the accumulated offset");
});

// --- 209b: start-time mode ---
await withApp(async (w, d, T) => {
  const f = await w.addFile("clock.log", makeLog(0, 5), () => {});
  w.render();
  const span = f.entries[4].ts - f.entries[0].ts; // preserved by a uniform shift
  const desiredTs = new Date("2030-06-01T09:00:00.000").getTime();
  w.openClockOffsetDialog(f.id);
  fireClick(d.querySelector("#clockModeStart"), w);
  assert(!isVisible(d.querySelector("#clockDiffRow"), w) && isVisible(d.querySelector("#clockStartRow"), w),
    "start mode: diff row hidden, start row shown");
  d.querySelector("#clockStartInput").value = w.tsToLocalInputValue(desiredTs);
  d.querySelector("#clockStartInput").dispatchEvent(new w.Event("input", { bubbles: true }));
  fireClick(d.querySelector("#clockOffsetApply"), w);
  assert(f.entries[0].ts === desiredTs, "start mode: first line lands exactly on the desired timestamp");
  assert(f.entries[4].ts - f.entries[0].ts === span, "start mode: the shift is uniform (span preserved)");
});

// --- 209c: undo / redo round-trips the timestamp shift exactly ---
await withApp(async (w, d, T) => {
  const f = await w.addFile("clock.log", makeLog(0, 5), () => {});
  w.render();
  const before = f.entries.map(e => e.ts);
  assert(w.applyClockOffset(f.id, 3600000), "applyClockOffset returns true for a real file");
  assert(f.entries[0].ts === before[0] + 3600000, "apply shifted ts");
  assert(f.clockOffset === 3600000, "clockOffset set");
  w.undo();
  assert(f.entries.every((e, i) => e.ts === before[i]), "undo restores every entry.ts exactly");
  assert((f.clockOffset || 0) === 0, "undo restores clockOffset to 0");
  w.redo();
  assert(f.entries.every((e, i) => e.ts === before[i] + 3600000), "redo re-applies the shift exactly");
  assert(f.clockOffset === 3600000, "redo restores clockOffset");
});

// --- 209d: a merged view stays correctly sorted after an offset on one source ---
await withApp(async (w, d, T) => {
  // Two sources over the SAME timestamp window -> merge takes the copy+sort
  // (overlapping) path and interleaves them by ts.
  const fa = await w.addFile("src-a.log", makeLog(0, 5), () => {});
  const fb = await w.addFile("src-b.log", makeLog(0, 5, { msgPrefix: "other" }), () => {});
  const merged = await w.mergeFiles([fa.id, fb.id]);
  assert(merged.entries.length === 10, "merged file has both sources' entries");
  const sorted = arr => arr.every((e, i) => i === 0 || arr[i - 1].ts <= e.ts);
  assert(sorted(merged.entries), "merged file is sorted by ts before any offset");

  // Merged files are refused (their entries are shared references).
  assert(w.applyClockOffset(merged.id, 1000) === false, "applyClockOffset refuses a merged file");
  w.openTreeContextMenu({ clientX: 10, clientY: 10, preventDefault() {} }, merged.id);
  assert(!d.querySelector('#treeContextMenu [data-action="clockOffset"]'),
    "context menu hides 'Adjust clock…' on a merged file");
  w.closeTreeContextMenu();

  // Shift source A an hour into the future — A's entries now sort AFTER all of
  // B's. The merged view must re-sort to stay chronological.
  assert(w.applyClockOffset(fa.id, 3600000), "offset applied to source A");
  assert(sorted(merged.entries), "merged file re-sorted correctly after the source offset");
  // All B entries (msgPrefix 'other') now come before all shifted A entries.
  const firstA = merged.entries.findIndex(e => e.message.startsWith("message"));
  const lastB = merged.entries.map(e => e.message.startsWith("other")).lastIndexOf(true);
  assert(lastB < firstA, "shifted source-A entries now sort after every source-B entry");
  // The merged file's order-index map reflects the new order (was invalidated).
  const moim = w.buildOrderIndexMap(merged.id);
  assert(moim.get(merged.entries[0].id) === 0 && moim.get(merged.entries[9].id) === 9,
    "merged file's _orderIndexMap re-derived after the re-sort");
});

// --- 209e: node.clockOffset survives the session cache round-trip ---
{
  const factory = new IDBFactory();
  let firstTsAfter = null;
  await withApp(async (w, d, T) => {
    const f = await w.addFile("clock.log", makeLog(0, 8), () => {});
    w.applyClockOffset(f.id, 5000);
    firstTsAfter = f.entries[0].ts;
    await w.persistFileNode(f);
    await w.persistMetaNow();
    const rec = await w.cacheStoreOp("files", "readonly", s => s.get(f.cacheKey));
    assert(rec && rec.clockOffset === 5000, "cache: clockOffset persisted on the file record");
    // Text is rebuilt from the ORIGINAL raw lines (offset NOT baked into raw).
    assert(!rec.text.includes(w.formatTime(f.entries[0].ts)), "cache: file text keeps the original raw timestamps");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    await T.bootRestore;
    assert(T.state.rootIds.length === 1, "restore: file came back");
    const f = T.state.nodes[T.state.rootIds[0]];
    assert(f.clockOffset === 5000, "restore: clockOffset came back on the file node");
    assert(f.entries[0].ts === firstTsAfter, "restore: the offset was re-applied to the re-parsed entries (ts matches pre-reload)");
  }, { indexedDB: factory });
}

// --- 209f: the applied offset travels with session export/import ---
{
  let exportedJson = null, expFirst = null, expLast = null;
  await withApp(async (w, d, T) => {
    const f = await w.addFile("clock.log", makeLog(0, 8), () => {});
    w.applyClockOffset(f.id, 7000);
    expFirst = f.entries[0].ts;
    expLast = f.entries[f.entries.length - 1].ts;
    exportedJson = JSON.stringify(w.buildSessionExport([f.id], new Set()));
    assert(JSON.parse(exportedJson).files[0].clockOffset === 7000, "export: clockOffset written into the file record");
  });

  await withApp(async (w, d, T) => {
    // Byte-identical content (original raw timestamps) → tier-1 fullHash match,
    // even though this copy carries no offset of its own yet.
    const f = await w.addFile("their-copy.log", makeLog(0, 8), () => {});
    w.render();
    assert((f.clockOffset || 0) === 0, "import: the importer's own copy starts with no offset");
    w.importSessionJson(exportedJson);
    await sleep(80);
    assert(d.querySelector("#sessionMatchDialog").classList.contains("hidden"),
      "import: byte-identical content auto-matches (fullHash is offset-independent)");
    assert(f.clockOffset === 7000, "import: the exported clockOffset is re-applied to the matched file");
    assert(f.entries[0].ts === expFirst && f.entries[f.entries.length - 1].ts === expLast,
      "import: first + last timestamps match what was exported");
  });
}
