// GROUP 256 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 256 — Bug fix: #tableSpacer's declared height (and every
   scroll-position read/write for #tableBody) is now capped and rescaled
   under a safe, per-session feature-detected ceiling — a real,
   empirically-confirmed browser limitation (Chromium hard-clamps at
   exactly 33,554,428px; Firefox instead discards an oversized declaration
   entirely, falling back to height:auto -> 0px for #tableSpacer, since
   its only content is absolutely-positioned #tableRows, which doesn't
   count toward auto-sizing) that a large enough merge's old, uncapped
   `entries.length * ROW_HEIGHT` math could exceed. jsdom has no real
   layout engine, so detectMaxTableScrollPx's own probe never actually
   clamps there — T.forceTableScrollCap pins the cap directly for a
   deterministic, fast-in-jsdom test.
   ============================================================ */
group(256);
await withApp(async (w, d, T) => {
  section("256a. computeTableSpacerContentHeight caps #tableSpacer's height and tracks a scale factor once the true content exceeds the detected safe ceiling");
  T.forceTableScrollCap(1000000);
  const N = 50000; // 50,000 * 28 = 1,400,000 > the forced 1,000,000 cap
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const spacerHeight = parseInt(d.querySelector("#tableSpacer").style.height, 10);
  assert(spacerHeight <= 1000000 + 22, "the spacer height is capped at the forced ceiling — got " + spacerHeight);
  // Range-based (viewport-aware), not a raw content-height ratio — see 256f.
  // The physical range is (cap + TABLE_SPACER_PAD) - viewportH, matching the
  // REAL declared/rendered spacer height (every call site sets it to
  // computeTableSpacerContentHeight(...) + TABLE_SPACER_PAD, never the bare
  // cap) — see 256i for the regression this specifically guards against.
  const viewportH = d.querySelector("#tableBody").clientHeight;
  const expectedScale = (1000000 + T.TABLE_SPACER_PAD - viewportH) / (N * T.ROW_HEIGHT - viewportH);
  assert(Math.abs(T.tableScrollHeightScale - expectedScale) < 1e-9, "tableScrollHeightScale reflects the true/capped range ratio — got " + T.tableScrollHeightScale);
});

await withApp(async (w, d, T) => {
  section("256b. renderVisibleRows resolves the correct row range from a physical scrollTop partway through the compressed range");
  T.forceTableScrollCap(1000000);
  const N = 50000;
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const physicalTarget = 500000;
  tableBody.scrollTop = physicalTarget;
  w.renderVisibleRows();

  const logicalScrollTop = physicalTarget / T.tableScrollHeightScale;
  const expectedStartIdx = Math.max(0, Math.floor(logicalScrollTop / T.ROW_HEIGHT) - T.BUFFER_ROWS);
  const expectedEntry = fa.entries[expectedStartIdx];
  assert(d.querySelector('#tableRows [data-entry-id="' + expectedEntry.id + '"]'),
    "the row range resolved from the compressed physicalToLogicalScrollPx round trip matches the expected logical row (index " + expectedStartIdx + ")");

  // tableRows' own physical `top` should equal the logical start offset
  // converted back through the same scale (logicalToPhysicalScrollPx).
  const expectedPhysicalTop = (expectedStartIdx * T.ROW_HEIGHT) * T.tableScrollHeightScale;
  const actualTop = parseFloat(d.querySelector("#tableRows").style.top);
  assert(Math.abs(actualTop - expectedPhysicalTop) < 1, "tableRows' physical top offset matches logicalToPhysicalScrollPx(start*ROW_HEIGHT) — got " + actualTop + ", expected ~" + expectedPhysicalTop);
});

await withApp(async (w, d, T) => {
  section("256c. scrollToIndex scrolling to a deep index still reveals the right entry under compression");
  T.forceTableScrollCap(1000000);
  const N = 50000;
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const deepIndex = 40000;
  w.scrollToIndex(deepIndex, { center: true });
  const targetEntry = fa.entries[deepIndex];
  assert(d.querySelector('#tableRows [data-entry-id="' + targetEntry.id + '"]'),
    "scrollToIndex(40000, {center:true}) renders the target entry despite the compressed physical scroll range");
});

await withApp(async (w, d, T) => {
  section("256d. setTableScroll(tableBody.scrollHeight) — the tail-follow 'scroll to true bottom' idiom — still reaches the true physical max unaffected by compression");
  T.forceTableScrollCap(1000000);
  const N = 50000;
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  // jsdom has no real layout engine, so scrollHeight isn't naturally
  // non-zero — stub it to what a real browser would report once
  // #tableSpacer is capped at the forced 1,000,000px ceiling (same idiom
  // other groups already use for this).
  Object.defineProperty(tableBody, "scrollHeight", { value: 1000000 + 22, configurable: true });
  w.setTableScroll(tableBody.scrollHeight);
  assert(tableBody.scrollTop === tableBody.scrollHeight, "scrollTop reaches the DOM's own (capped) scrollHeight exactly — no double-compression");

  const lastEntry = fa.entries[N - 1];
  w.renderVisibleRows();
  assert(d.querySelector('#tableRows [data-entry-id="' + lastEntry.id + '"]'), "the last real entry is reachable at the physical max");
});

await withApp(async (w, d, T) => {
  section("256e. detectMaxTableScrollPx is a cached, self-consistent probe");
  T.resetTableScrollCap();
  const first = T.detectMaxTableScrollPx();
  assert(typeof first === "number" && first > 0, "returns a plausible positive number — got " + first);
  const second = T.detectMaxTableScrollPx();
  assert(second === first, "caches on a second call rather than re-probing");
});

await withApp(async (w, d, T) => {
  section("256f. computeTableSpacerContentHeight's range-based scale (accounts for viewport height) maps the true native scrollTop max exactly onto the true logical bottom — the old content-ratio-only scale (cap/contentPx) left this short by clientHeight*(contentPx/cap - 1) px, meaning End never actually revealed the last rows even once the native scrollbar was fully at its ceiling (person-reported follow-up)");
  T.forceTableScrollCap(1000000);
  const N = 50000;
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const viewportH = tableBody.clientHeight;
  const contentPx = N * T.ROW_HEIGHT;
  const cap = 1000000;
  // The native scrollTop range is scrollHeight - clientHeight, and the REAL
  // declared/rendered spacer height is cap + TABLE_SPACER_PAD (every call
  // site adds it) — see 256i for the regression this line itself guards.
  const nativeMaxScrollTop = (cap + T.TABLE_SPACER_PAD) - viewportH;

  const logicalAtNativeMax = nativeMaxScrollTop / T.tableScrollHeightScale;
  const trueLogicalMax = contentPx - viewportH;
  assert(Math.abs(logicalAtNativeMax - trueLogicalMax) < 1e-6, "the native scrollTop max converts to the true logical bottom under the viewport-aware scale — got " + logicalAtNativeMax + ", expected " + trueLogicalMax);

  // Sanity check: the old (unfixed) content-ratio-only scale would have
  // left a real, multi-row gap here — confirms this is a non-trivial fix.
  const oldScale = cap / contentPx;
  const oldLogicalAtNativeMax = nativeMaxScrollTop / oldScale;
  assert(trueLogicalMax - oldLogicalAtNativeMax > T.ROW_HEIGHT, "the old content-ratio scale would have undershot the true bottom by more than a row — got a gap of " + (trueLogicalMax - oldLogicalAtNativeMax));
});

await withApp(async (w, d, T) => {
  section("256g. renderVisibleRows() bottom-anchors #tableRows at the tail so its TRUE (uncompressed) rendered box never overhangs #tableSpacer's own capped height — person-reported follow-up: End landed short of the true last row with blank space below it in Firefox, because the old top-anchored math (start offset back by BUFFER_ROWS) could push tableRows' real bottom edge past the capped spacer, inflating the browser's own real scrollHeight beyond what computeTableSpacerContentHeight assumed");
  T.forceTableScrollCap(1000000);
  const N = 50000;
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const viewportH = tableBody.clientHeight;
  const cap = 1000000;
  tableBody.scrollTop = cap - viewportH; // the true native scrollTop max
  w.renderVisibleRows();

  const physicalTop = parseFloat(d.querySelector("#tableRows").style.top);
  const renderedCount = d.querySelectorAll('#tableRows [data-entry-id]').length;
  const trueRenderedHeight = renderedCount * T.ROW_HEIGHT + 22;
  assert(physicalTop + trueRenderedHeight <= cap + 22 + 1, "tableRows' true (uncompressed) rendered box stays within #tableSpacer's own capped declared height — top " + physicalTop + " + height " + trueRenderedHeight + " should be <= " + (cap + 22));

  const lastEntry = fa.entries[N - 1];
  assert(d.querySelector('#tableRows [data-entry-id="' + lastEntry.id + '"]'), "the true last entry is still rendered at the native scrollTop max — no blank space where it should be");
});

await withApp(async (w, d, T) => {
  section("256h. renderVisibleRows() degrades to a sane, non-empty last-page render when scrollTop is set beyond the assumed physical max (e.g. a real browser's scrollHeight momentarily inflated past what computeTableSpacerContentHeight assumed) — defensive upper clamp on start/centerIdx, which previously had none");
  T.forceTableScrollCap(1000000);
  const N = 50000;
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const viewportH = tableBody.clientHeight;
  const cap = 1000000;
  // Deliberately past the assumed physical max (cap - viewportH) — simulates
  // a real scrollTop the browser reports beyond what our own math expects.
  tableBody.scrollTop = cap - viewportH + 50000;
  w.renderVisibleRows();

  const renderedCount = d.querySelectorAll('#tableRows [data-entry-id]').length;
  assert(renderedCount > 0, "the render window is non-empty even for an out-of-assumed-range scrollTop — got " + renderedCount + " rows");
  const lastEntry = fa.entries[N - 1];
  assert(d.querySelector('#tableRows [data-entry-id="' + lastEntry.id + '"]'), "the true last entry is still reachable — the render clamps to a sane last page instead of overshooting past total");
});

await withApp(async (w, d, T) => {
  section("256i. computeTableSpacerContentHeight's physical range accounts for TABLE_SPACER_PAD, not just cap — person-reported follow-up: real Firefox telemetry showed the render collapsing to a single row exactly at/near the true native scrollTop max, because the old physicalRange (cap - clientHeight) was 22px SHORT of the real native range (tableSpacer.style.height is always cap + TABLE_SPACER_PAD, never the bare cap), pushing the converted logical position just past total and tripping the 256h defensive clamp prematurely");
  T.forceTableScrollCap(1000000);
  const N = 50000;
  const fa = await w.addFile("a.log", makeLog(0, N));
  T.state.activeId = fa.id;
  w.render();

  const tableBody = d.querySelector("#tableBody");
  const viewportH = tableBody.clientHeight;
  const cap = 1000000;
  // Same idiom as 256d/256g: stub scrollHeight to what a real browser
  // reports once #tableSpacer is capped — cap + TABLE_SPACER_PAD, never the
  // bare cap. Scroll to the TRUE native max derived from that real value.
  Object.defineProperty(tableBody, "scrollHeight", { value: cap + T.TABLE_SPACER_PAD, configurable: true });
  tableBody.scrollTop = tableBody.scrollHeight - viewportH;
  w.renderVisibleRows();

  const maxVisible = Math.ceil(viewportH / T.ROW_HEIGHT) + T.BUFFER_ROWS * 2;
  const renderedCount = d.querySelectorAll('#tableRows [data-entry-id]').length;
  assert(renderedCount >= maxVisible - T.BUFFER_ROWS, "the render at the TRUE native scrollTop max is a healthy last page, not collapsed to a handful of rows by a premature defensive clamp — got " + renderedCount + " rows, expected at least " + (maxVisible - T.BUFFER_ROWS));
  const lastEntry = fa.entries[N - 1];
  assert(d.querySelector('#tableRows [data-entry-id="' + lastEntry.id + '"]'), "the true last entry is rendered at the true native scrollTop max");
});
