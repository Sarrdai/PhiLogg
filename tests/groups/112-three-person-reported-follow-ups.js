// GROUP 112 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 112 — Three person-reported follow-ups to GROUP 111's own
   settings work (this session): Log text size not rescaling ROW_HEIGHT
   (rows overflowed/clipped at larger scales), "On open, scroll log to"
   End firing before a large file finished loading, and a stale
   state.multiSelect entry leaving a second file's sidebar row showing
   the SAME highlight as the newly active file's row.
   ============================================================ */
group(112);
await withApp(async (w, d, T) => {
  section("112a. Bugfix: Log text size rescales ROW_HEIGHT (and EXTRACT_ROW_HEIGHT/LINK_PAIR_ROW_HEIGHT), not just font-size");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  w.render();
  const rowBefore = d.querySelector(".log-row");
  assert(rowBefore && rowBefore.style.height === "28px", "sanity: a row is 28px tall at 100% log text size");

  const logUp = d.querySelector("#logTextScaleUp");
  // 100% -> 110% -> 120% -> ... -> 160% (six clicks of the default 10% step).
  for (let i = 0; i < 6; i++) fireClick(logUp, w);
  assert(d.querySelector("#logTextScaleValue").textContent === "160%", "sanity: Log text size is now 160%");

  const rowAfter = d.querySelector(".log-row");
  assert(rowAfter.style.height === "45px", "row height rescaled proportionally with Log text size (28 * 1.6 = 44.8, rounded to 45), got " + rowAfter.style.height);

  // The extraction table and link/pair views use the same --log-text-scale
  // var in their CSS (#extractTable, .pair-row-time/.pair-row-msg — see
  // :root) — their own fixed-pixel row heights must rescale in lockstep.
  assert(T.EXTRACT_ROW_HEIGHT === 45, "EXTRACT_ROW_HEIGHT rescaled the same way, got " + T.EXTRACT_ROW_HEIGHT);
  assert(T.LINK_PAIR_ROW_HEIGHT === 42, "LINK_PAIR_ROW_HEIGHT rescaled the same way (26 * 1.6 = 41.6, rounded to 42), got " + T.LINK_PAIR_ROW_HEIGHT);

  // Resetting back to 100% restores the original heights exactly (no
  // rounding drift left over from the round trip).
  fireClick(d.querySelector("#logTextScaleReset"), w);
  assert(d.querySelector(".log-row").style.height === "28px", "resetting Log text size back to 100% restores the original 28px row height");
  assert(T.EXTRACT_ROW_HEIGHT === 28 && T.LINK_PAIR_ROW_HEIGHT === 26, "EXTRACT_ROW_HEIGHT/LINK_PAIR_ROW_HEIGHT also reset to their base values");
});

await withApp(async (w, d, T) => {
  section("112b. Bugfix: \"On open, scroll log to\" End keeps trailing the bottom through every load tick, not just the first one");

  const select = d.querySelector("#settingsOpenScrollPosition");
  select.value = "end";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));

  const tableBody = d.querySelector("#tableBody");
  Object.defineProperty(tableBody, "scrollHeight", { value: 3000, configurable: true });

  // Simulate a large file: the real row (createFileNode) exists and is
  // active, entries have streamed in from an early parse chunk, but the
  // node is still mid-load (loadFraction a number, not yet deleted — see
  // loadOneFileIntoTree's `finally`). Before the fix, renderTable()
  // consumed and deleted the one-shot _openScrollToEnd flag on this very
  // first non-empty render, landing at whatever "end" existed at that
  // instant instead of the file's true end.
  const node = w.createFileNode("big.log");
  assert(node._openScrollToEnd === true, "sanity: the one-shot flag was set at file creation (\"End\" is selected)");
  await w.parseLogTextAsync(makeLog(0, 20), node, () => {});
  node.loadFraction = 0.4; // still loading — a later chunk hasn't landed yet
  w.renderTable();
  assert(tableBody.scrollTop === tableBody.scrollHeight, "mid-load: still trails to the (partial) bottom on this tick");
  assert(node._openScrollToEnd === true, "mid-load: the flag is NOT consumed yet — the file isn't done loading");

  // More entries land on a later chunk (grows scrollHeight, as a real
  // parse tick would) while still mid-load.
  Object.defineProperty(tableBody, "scrollHeight", { value: 5000, configurable: true });
  w.renderTable();
  assert(tableBody.scrollTop === 5000, "still-loading: keeps re-trailing to the NEW bottom as more entries stream in, not stuck at the old one");
  assert(node._openScrollToEnd === true, "still-loading: flag still held");

  // Loading finishes for real.
  delete node.loadFraction;
  w.renderTable();
  assert(tableBody.scrollTop === 5000, "load finished: settles at the true final bottom");
  assert(node._openScrollToEnd === undefined, "load finished: the one-shot flag is NOW consumed");

  // One-shot, still: a later re-render (e.g. switching away and back) must
  // not re-trigger the jump now that the flag is gone (same guarantee
  // GROUP 111d already covers for the non-chunked case).
  tableBody.scrollTop = 0;
  w.renderTable();
  assert(tableBody.scrollTop !== 5000, "post-completion re-render does not re-force the scroll back to the bottom (flag already consumed)");

  select.value = "start";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
});

await withApp(async (w, d, T) => {
  section("112c. Bugfix: loading a second file no longer leaves a stale multi-selected highlight on the first file's row");

  const f1 = await w.addFile("app-1.log", makeLog(0, 5), () => {});
  w.render();

  // A plain (non-Ctrl) click on a file's own tree row — completely
  // ordinary navigation, e.g. switching to inspect it — sets
  // state.multiSelect to that row alone (renderNode's click handler).
  const row1 = d.querySelector('.tree-row[data-node-id="' + f1.id + '"]');
  fireClick(row1, w);
  assert(T.state.multiSelect.has(f1.id) && T.state.multiSelect.size === 1, "sanity: clicking app-1.log's tree row sets multiSelect to just that row");

  // Select a log entry too, matching the person's own repro description.
  const logRow = d.querySelector(".log-row");
  if (logRow) fireClick(logRow, w);

  // Load a second file (drag-and-drop and the file input both funnel
  // through loadFileDescriptors -> createFileNode/activateQueuedFileNode).
  const f2 = await w.addFile("app-2.log", makeLog(100, 3), () => {});
  w.render();

  assert(T.state.activeId === f2.id, "sanity: app-2.log is now the active file");
  assert(!T.state.multiSelect.has(f1.id), "loading app-2.log clears the stale multiSelect entry pointing at app-1.log's row");

  const rows = [...d.querySelectorAll(".tree-row")];
  const highlighted = rows.filter(r => r.classList.contains("active") || r.classList.contains("multi-selected"));
  assert(highlighted.length === 1, "exactly one tree row carries an active/selected visual state after loading the second file, got " + highlighted.length);
  assert(highlighted[0].dataset.nodeId === f2.id, "...and it's the newly loaded, genuinely active file's row");
});
