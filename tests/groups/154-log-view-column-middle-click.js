// GROUP 154 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 154 — Log view column: middle-click header to hide, double-click a
   resize handle to auto-fit width to content (this session).
   Middle-click a hideable header title (Δt/Thread/Location/Method) sets
   state.columnVisible[key] = false, the same effect as unchecking it in
   #columnsPanel — wired on both #tableHeader and #highlightHeader since
   they share --row-grid. Double-click a .col-resize-handle auto-fits that
   column's width to the WIDEST value across the whole active file's
   entries (state.nodes[fileId].entries), not just the currently filtered
   view.
   ============================================================ */
group(154);
await withApp(async (w, d, T) => {
  section("154a. Middle-click a header title hides that column (Filter view)");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const threadTh = d.querySelector('#tableHeader .th[data-col="thread"]');
  assert(threadTh, "Thread header carries data-col=\"thread\"");
  assert(T.state.columnVisible.thread === true, "sanity: Thread starts visible");

  threadTh.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
  assert(T.state.columnVisible.thread === false, "middle-click sets columnVisible.thread = false");
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("0px"),
    "Thread's track collapses to 0px in --row-grid, same as unchecking it in the panel");
  // Open the Columns panel so its checkboxes exist (JS-rendered on open —
  // see renderColumnsPanel), then check it reflects the middle-click.
  fireClick(d.querySelector(".toggle-columns"), w);
  const threadCb = d.querySelector('#columnsList input[data-col="thread"]');
  assert(threadCb.checked === false, "the Columns panel checkbox reflects the middle-click too");

  // Non-middle button is a no-op.
  const locTh = d.querySelector('#tableHeader .th[data-col="location"]');
  locTh.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 2 }));
  assert(T.state.columnVisible.location === true, "auxclick with a non-middle button does not hide the column");

  // Always-visible columns (Time/Level/Message) have no data-col and are unaffected.
  const timeTh = d.querySelector('#tableHeader .th[data-sort="time"]');
  assert(!timeTh.dataset.col, "Time header has no data-col (never hideable)");
  timeTh.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("178px"), "Time's track is untouched by a middle-click on it");
});

await withApp(async (w, d, T) => {
  section("154b. Middle-click on the Highlight (Full) view header hides the same shared column");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const methodTh = d.querySelector('#highlightHeader .th[data-col="method"]');
  assert(methodTh, "Method header in #highlightHeader carries data-col=\"method\"");
  methodTh.dispatchEvent(new w.MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
  assert(T.state.columnVisible.method === false, "middle-click on the Highlight header's Method title hides it too (shared state.columnVisible)");
  assert(d.querySelector('#tableHeader .col-resize-handle[data-col="method"]').style.display === "none",
    "the Filter view's own resize handle for Method reacts to the same change");
});

await withApp(async (w, d, T) => {
  section("154c. Double-click a resize handle auto-fits the column to the WHOLE file's content, not just the filtered view");

  // Two lines, sharing makeLog's short thread ("main") except line 1's
  // thread is overridden to a much longer name straight in the raw text.
  let text = makeLog(0, 2);
  text = text.replace('"main"\tC:\\src\\Foo.cs\tline 1', '"a-very-long-thread-name-indeed"\tC:\\src\\Foo.cs\tline 1');
  const f = await w.addFile("a.log", text, () => {});
  T.state.activeId = f.id;
  w.render();
  assert(f.entries.length === 2, "sanity: both lines parsed");
  assert(f.entries[1].thread === "a-very-long-thread-name-indeed", "sanity: the long-thread line parsed as expected");

  const widthBefore = T.state.columnWidths.thread;
  const handle = d.querySelector('.col-resize-handle[data-col="thread"]');
  handle.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  assert(T.state.columnWidths.thread > widthBefore,
    "double-click grows Thread's width beyond its default, got " + T.state.columnWidths.thread + " (was " + widthBefore + ")");
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes(T.state.columnWidths.thread + "px"),
    "--row-grid reflects the auto-fit width immediately");

  // Auto-fit again on a column whose longest value never got hidden by a
  // filter (Method: constant "DoWork" everywhere) should still land on a
  // sane, non-zero width no smaller than COLUMN_MIN_WIDTH.
  const methodHandle = d.querySelector('.col-resize-handle[data-col="method"]');
  methodHandle.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  assert(T.state.columnWidths.method >= 40, "auto-fit never goes below COLUMN_MIN_WIDTH, got " + T.state.columnWidths.method);
});
