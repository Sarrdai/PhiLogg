// GROUP 58 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 58 — Log view column visibility / width (FEATURE_BACKLOG.md item)
   Origin: this session. #btnColumns opens #columnsPanel with checkboxes for
   Δt/Thread/Location/Method (Time/Level/Message always shown); each header
   column also has a drag handle (#tableHeader .col-resize-handle) that
   resizes it live. Both are applied purely via the --row-grid CSS custom
   property (applyRowGrid) — no per-row DOM changes — and persist through
   the session cache like state.multilineMessages (global, not per-file).
   ============================================================ */
group(58);
await withApp(async (w, d, T) => {
  section("58a. Column visibility toggle + reset widths");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const rootStyle = d.documentElement.style;
  assert(rootStyle.getPropertyValue("--row-grid") === "5px 178px 72px 66px 92px 158px 168px 1fr",
    "default --row-grid matches the original hardcoded default, got " + rootStyle.getPropertyValue("--row-grid"));

  const btnColumns = d.querySelector(".toggle-columns");
  const columnsPanel = d.querySelector("#columnsPanel");
  assert(columnsPanel.classList.contains("hidden"), "columns popup starts hidden");
  fireClick(btnColumns, w);
  assert(!columnsPanel.classList.contains("hidden"), "clicking #btnColumns opens the popup");
  const threadCb = d.querySelector('#columnsList input[data-col="thread"]');
  assert(threadCb.checked === true, "checkbox reflects the current (default-visible) state when opened");

  threadCb.checked = false;
  threadCb.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.columnVisible.thread === false, "unchecking the Thread checkbox updates state.columnVisible.thread");
  assert(rootStyle.getPropertyValue("--row-grid") === "5px 178px 72px 66px 0px 158px 168px 1fr",
    "Thread's track collapses to 0px in --row-grid, got " + rootStyle.getPropertyValue("--row-grid"));
  const threadHandle = d.querySelector('.col-resize-handle[data-col="thread"]');
  assert(threadHandle.style.display === "none", "the hidden column's own resize handle is hidden too (nothing meaningful to drag)");

  // Re-show it
  threadCb.checked = true;
  threadCb.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.state.columnVisible.thread === true && rootStyle.getPropertyValue("--row-grid").includes("92px"),
    "re-checking restores the track to its remembered width (92px default), not a fresh default");
  assert(threadHandle.style.display === "", "handle reappears once the column is visible again");

  // --- Reset widths ---
  T.state.columnWidths.method = 300; // simulate a prior resize
  w.applyRowGrid();
  fireClick(d.querySelector("#btnResetColumns"), w);
  assert(T.state.columnWidths.method === 168, "Reset widths restores FIXED_COLUMN_WIDTHS");
  assert(rootStyle.getPropertyValue("--row-grid") === "5px 178px 72px 66px 92px 158px 168px 1fr",
    "…and --row-grid reflects the reset defaults");
});

await withApp(async (w, d, T) => {
  section("58b. Drag-resize a column header handle");

  const f = await w.addFile("a.log", makeLog(0, 5), () => {});
  T.state.activeId = f.id;
  w.render();

  const handle = d.querySelector('.col-resize-handle[data-col="location"]');
  assert(handle, "Location's resize handle exists in #tableHeader");
  assert(handle.style.left === (5 + 12 + 178 + 12 + 72 + 12 + 66 + 12 + 92 + 12 + 158) + "px",
    "handle is positioned at the cumulative right edge of its own column, got " + handle.style.left);

  handle.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 500 }));
  assert(handle.classList.contains("dragging"), "mousedown starts the drag (handle gets .dragging)");
  d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: 540 })); // +40px
  assert(T.state.columnWidths.location === 198, "dragging 40px right grows Location's width by 40px (158 -> 198), got " + T.state.columnWidths.location);
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("198px"), "--row-grid reflects the live drag width");

  // Shrinking below COLUMN_MIN_WIDTH clamps rather than going negative/zero
  d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: -900 }));
  assert(T.state.columnWidths.location === 40, "drag clamps at COLUMN_MIN_WIDTH (40px), never below it, got " + T.state.columnWidths.location);

  d.dispatchEvent(new w.MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  assert(!handle.classList.contains("dragging"), "mouseup ends the drag");

  // A mousemove with no active drag is a no-op (no leftover state from the previous drag)
  const widthBefore = T.state.columnWidths.location;
  d.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: 999 }));
  assert(T.state.columnWidths.location === widthBefore, "mousemove after mouseup no longer affects the column width");
});

await withApp(async (w, d, T) => {
  section("58d. Phone-width viewport forces Δt/Thread/Location/Method hidden regardless of state.columnVisible (replaces the old @media rule)");

  const f = await w.addFile("a.log", makeLog(0, 3), () => {});
  T.state.activeId = f.id;
  w.render();
  assert(T.state.columnVisible.thread === true, "sanity: Thread is visible by default");
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("92px"), "sanity: Thread's track is non-zero at the default (wide) viewport");

  w.innerWidth = 500; // phone tier (< 600): Δt and every middle column forced to 0px
  w.dispatchEvent(new w.Event("resize"));
  assert(T.state.columnVisible.thread === true, "narrow viewport does NOT mutate the stored preference...");
  assert(d.documentElement.style.getPropertyValue("--row-grid") === "5px 178px 0px 66px 0px 0px 0px 1fr",
    "...but --row-grid forces Δt/Thread/Location/Method to 0px anyway, got " + d.documentElement.style.getPropertyValue("--row-grid"));

  w.innerWidth = 1024;
  w.dispatchEvent(new w.Event("resize"));
  assert(d.documentElement.style.getPropertyValue("--row-grid").includes("92px"), "widening back past the breakpoint restores the remembered widths");
});

section("58c. Column visibility/width persist through the session cache (global setting, survives a reload)");
{
  const factory = new IDBFactory();
  await withApp(async (w, d, T) => {
    const f = await w.addFile("a.log", makeLog(0, 3), () => {});
    T.state.columnVisible.method = false;
    T.state.columnWidths.time = 220;
    w.applyRowGrid();
    await w.persistFileNode(f);
    await w.persistMetaNow();
    const meta = await w.cacheStoreOp("meta", "readonly", s => s.get("session"));
    assert(meta.settings.columnVisible.method === false, "cache: columnVisible written into the settings record");
    assert(meta.settings.columnWidths.time === 220, "cache: columnWidths written into the settings record");
  }, { indexedDB: factory });

  await withApp(async (w, d, T) => {
    await T.bootRestore; // exact barrier: restore + restoreWatchedFolders have settled
    assert(T.state.rootIds.length === 1, "sanity: file came back via boot-time restore");
    assert(T.state.columnVisible.method === false, "restore: columnVisible.method restored");
    assert(T.state.columnWidths.time === 220, "restore: columnWidths.time restored");
    assert(d.documentElement.style.getPropertyValue("--row-grid").startsWith("5px 220px"),
      "restore: --row-grid reflects the restored width immediately (applyRowGrid called from the restore's finally block)");
    assert(d.documentElement.style.getPropertyValue("--row-grid").includes(" 0px 1fr"),
      "restore: Method's track is collapsed (0px), got " + d.documentElement.style.getPropertyValue("--row-grid"));
  }, { indexedDB: factory });
}
