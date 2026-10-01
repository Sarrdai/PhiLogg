// GROUP 266 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 266 — Log view scrolling (2026-09-24, measured in headless
   Chromium on a 650k-entry file): (a) detectMaxTableScrollPx read
   Chromium's exponent serialization of a computed height ("2e+07px") with
   parseInt, so the cap came out 950,000px and every view above ~34k rows
   was scroll-compressed (650k rows ~19x: one wheel notch moved ~68 rows,
   every render snapped the content); (b) the 100ms scroll-render throttle
   became one render per frame with a cost-based backoff; (c) a scroll
   render keeps the rows still in its window and builds only the new ones,
   with a one-screen overscan.
   ============================================================ */
group(266);
{
  // Stand-ins for how an engine reports a probe element's computed height:
  // Chromium clamps at 33,554,428px and prints 6 significant digits in
  // exponent form from 1e6px up; Firefox drops an oversized declaration
  // (height:auto -> 0px for the empty probe).
  const chromiumHeight = h => {
    const used = Math.min(h, 33554428);
    if (used < 1e6) return used + "px";
    return used.toPrecision(6).replace(/\.?0+e/, "e").replace(/e\+(\d)$/, "e+0$1") + "px";
  };
  const firefoxHeight = h => (h > 17895697 ? 0 : h) + "px";
  async function probeWith(w, T, fmt) {
    const real = w.getComputedStyle;
    w.getComputedStyle = function (elm) {
      const h = parseFloat(elm.style && elm.style.height);
      if (!(h >= 1e6)) return real.apply(this, arguments);
      return { height: fmt(h) };
    };
    try {
      T.resetTableScrollCap();
      return T.detectMaxTableScrollPx();
    } finally {
      w.getComputedStyle = real;
    }
  }

  await withApp(async (w, d, T) => {
    section("266a. detectMaxTableScrollPx reads Chromium's exponent-form computed heights (was: 950,000px cap, compressing every view above ~34k rows)");
    assert(chromiumHeight(20000000) === "2e+07px" && chromiumHeight(40000000) === "3.35544e+07px", "sanity: the stand-in prints what Chromium prints");
    const cap = await probeWith(w, T, chromiumHeight);
    assert(cap > 0.94 * 33554428 && cap <= 33554428, "Chromium: cap is ~95% of its real 33,554,428px ceiling, got " + cap);
    assert(650000 * T.ROW_HEIGHT < cap, "a 650k-row file fits uncompressed under that cap");

    const ffCap = await probeWith(w, T, firefoxHeight);
    assert(ffCap > 0.94 * 17895697 && ffCap <= 17895697, "Firefox (declaration dropped above its ceiling): cap is ~95% of it, got " + ffCap);

    // End to end: 40k rows (1.12M px) is past the old 950,000px cap.
    await probeWith(w, T, chromiumHeight);
    const f = await w.addFile("a.log", makeLog(0, 40000), () => {});
    T.state.activeId = f.id;
    w.render();
    assert(T.tableScrollHeightScale === 1, "a 40k-row view is not compressed any more, scale " + T.tableScrollHeightScale);
    assert(parseInt(d.querySelector("#tableSpacer").style.height, 10) === 40000 * T.ROW_HEIGHT + T.TABLE_SPACER_PAD, "the spacer has the true content height");
  });

  await withApp(async (w, d, T) => {
    section("266b. Scroll renders run every frame, not every 100ms; an expensive render backs off");
    const f = await w.addFile("a.log", makeLog(0, 2000), () => {});
    T.state.activeId = f.id;
    w.render();
    const tableBody = d.querySelector("#tableBody");
    const orig = w.renderVisibleRows;
    let calls = 0, lastArg;

    // This half is about CHEAP renders. A real one can still cross
    // SCROLL_RENDER_BUDGET_MS on a loaded machine and then legitimately
    // trigger the back-off below, so the render's own time is taken off the
    // page's clock (performance.now, which the scheduler measures cost with):
    // it sees a zero-cost render every time, however busy the machine is.
    const realNow = w.performance.now.bind(w.performance);
    let hiddenMs = 0;
    const offClock = fn => function () { const t = realNow(); try { return fn.apply(this, arguments); } finally { hiddenMs += realNow() - t; } };
    const origMinimapRange = w.updateMinimapRenderedRange;
    w.performance.now = () => realNow() - hiddenMs;
    w.updateMinimapRenderedRange = offClock(origMinimapRange);
    w.renderVisibleRows = offClock(function (reuse) { calls++; lastArg = reuse; return orig.apply(this, arguments); });

    // Three scroll events 50ms apart: each renders before the next arrives.
    // The old throttle held the 2nd and 3rd until ~100ms after the 1st.
    for (let i = 1; i <= 3; i++) {
      tableBody.scrollTop = T.ROW_HEIGHT * 20 * i;
      tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
      await sleep(50);
      assert(calls === i, "scroll event " + i + " rendered within 50ms (" + calls + " renders)");
    }
    assert(lastArg === true, "the scroll listener asks renderVisibleRows to reuse rows");
    delete w.performance.now; // back to the real clock: the back-off half measures real cost
    w.updateMinimapRenderedRange = origMinimapRange;

    // A render costing 30ms (> SCROLL_RENDER_BUDGET_MS) holds the next one
    // off for 3x its cost; per-frame rendering would manage ~8 in 300ms.
    w.renderVisibleRows = function () {
      calls++;
      const until = Date.now() + 30;
      while (Date.now() < until) { /* an expensive render */ }
      return orig.apply(this, arguments);
    };
    calls = 0;
    const t0 = Date.now();
    let top = T.ROW_HEIGHT * 100;
    while (Date.now() - t0 < 300) {
      top += T.ROW_HEIGHT;
      tableBody.scrollTop = top;
      tableBody.dispatchEvent(new w.Event("scroll", { bubbles: true }));
      await sleep(8);
    }
    const inBurst = calls;
    assert(inBurst >= 1 && inBurst <= 4, "expensive renders back off during the burst: " + inBurst + " renders in 300ms");
    await waitFor(() => d.querySelector('#tableRows [data-entry-id="' + f.entries[Math.floor(top / T.ROW_HEIGHT)].id + '"]'), { timeout: 1000 });
    assert(d.querySelector('#tableRows [data-entry-id="' + f.entries[Math.floor(top / T.ROW_HEIGHT)].id + '"]'), "the pending render still lands and shows the final position");
    w.renderVisibleRows = orig;
  });

  await withApp(async (w, d, T) => {
    section("266c. A scroll render keeps the rows still in its window, builds only the new ones, and matches a full rebuild");
    const f = await w.addFile("a.log", makeLog(0, 2000), () => {});
    T.state.activeId = f.id;
    w.render();
    const tableBody = d.querySelector("#tableBody");
    const rows = () => [...d.querySelectorAll("#tableRows > *")];
    const ids = () => rows().map(r => r.dataset.entryId);
    const rowOf = i => d.querySelector('#tableRows [data-entry-id="' + f.entries[i].id + '"]');
    const expectIds = (from, to) => f.entries.slice(from, to).map(e => e.id);
    const screenRows = Math.ceil(400 / T.ROW_HEIGHT); // clientHeight is stubbed to 400

    // A jump past the previous window: nothing to reuse -> small full rebuild.
    tableBody.scrollTop = T.ROW_HEIGHT * 500;
    w.renderVisibleRows(true);
    assert(JSON.stringify(ids()) === JSON.stringify(expectIds(500 - T.BUFFER_ROWS, 500 + screenRows + T.BUFFER_ROWS)), "a jump renders the BUFFER_ROWS window");
    const kept = rowOf(505);

    // Five rows further: reuse, with a one-screen overscan on each side.
    tableBody.scrollTop = T.ROW_HEIGHT * 505;
    w.renderVisibleRows(true);
    const lo = 505 - screenRows, hi = lo + screenRows * 3;
    assert(JSON.stringify(ids()) === JSON.stringify(expectIds(lo, hi)), "the window widens to a screen of overscan per side, rows in order");
    assert(rowOf(505) === kept, "a row still in the window is the SAME element, not rebuilt");
    assert(parseFloat(d.querySelector("#tableRows").style.top) === lo * T.ROW_HEIGHT, "#tableRows moved to the new window's top");

    // Back up past the old top: rows are prepended, the bottom trimmed.
    tableBody.scrollTop = T.ROW_HEIGHT * 480;
    w.renderVisibleRows(true);
    assert(JSON.stringify(ids()) === JSON.stringify(expectIds(480 - screenRows, 480 + screenRows * 2)), "scrolling up prepends and trims, rows in order");
    assert(rowOf(505) === kept, "...and keeps the rows that are still in range");
    const reusedHtml = new Map(rows().map(r => [r.dataset.entryId, r.outerHTML]));

    // Any other caller rebuilds everything, and its rows look the same.
    w.renderVisibleRows();
    assert(rowOf(485) && rowOf(485) !== kept, "a plain renderVisibleRows() rebuilds every row");
    const mismatch = rows().filter(r => reusedHtml.get(r.dataset.entryId) !== r.outerHTML).map(r => r.dataset.entryId);
    assert(mismatch.length === 0, "reused/incrementally built rows are identical to a full rebuild's: mismatches " + mismatch.join(","));

    // A new list (any render()) is never reused from.
    tableBody.scrollTop = T.ROW_HEIGHT * 482;
    w.renderVisibleRows(true);
    const before = rowOf(485);
    T.state.levelFilter = new Set(["INFO"]);
    w.render();
    tableBody.scrollTop = T.ROW_HEIGHT * 10;
    w.renderVisibleRows(true);
    assert(rows().every(r => T.currentViewEntries.some(e => e.id === r.dataset.entryId)), "after the list changed, only rows of the new list are shown");
    assert(rowOf(485) !== before, "no row element survives from the old list");
    T.state.levelFilter = new Set();
    w.render();

    // Rows cleared behind its back (the no-files path empties #tableRows):
    // not reused either.
    tableBody.scrollTop = T.ROW_HEIGHT * 300;
    w.renderVisibleRows();
    d.querySelector("#tableRows").innerHTML = "";
    tableBody.scrollTop = T.ROW_HEIGHT * 302;
    w.renderVisibleRows(true);
    assert(rowOf(302) && ids().length > screenRows, "rows removed by someone else are rebuilt, not assumed present");
  });

  await withApp(async (w, d, T) => {
    section("266d. Row reuse keeps a note row with its entry, and drops both together");
    const f = await w.addFile("a.log", makeLog(0, 2000), () => {});
    T.state.activeId = f.id;
    T.state.notes.set(f.entries[500].id, "note on 500");
    T.state.notes.set(f.entries[515].id, "note on 515");
    T.state.showNotes = true;
    w.render();
    const tableBody = d.querySelector("#tableBody");
    const noteRows = () => [...d.querySelectorAll("#tableRows > .note-row")];
    const pairedWithEntry = () => noteRows().every(n => n.previousElementSibling && n.previousElementSibling.classList.contains("log-row") &&
      n.previousElementSibling.dataset.entryId === n.dataset.entryId);

    w.scrollToIndex(505);
    w.renderVisibleRows();
    tableBody.scrollTop = tableBody.scrollTop + T.ROW_HEIGHT * 3;
    w.renderVisibleRows(true);
    assert(noteRows().length === 2 && pairedWithEntry(), "both notes rendered, each right after its entry's row");
    for (let k = 0; k < 6; k++) {
      tableBody.scrollTop = tableBody.scrollTop + T.ROW_HEIGHT * 8;
      w.renderVisibleRows(true);
      assert(pairedWithEntry(), "step " + k + ": no orphaned or misplaced note row");
    }
    assert(!d.querySelector('#tableRows [data-entry-id="' + f.entries[500].id + '"]'), "500 scrolled out of the window...");
    assert(noteRows().every(n => n.dataset.entryId !== f.entries[500].id), "...and took its note row with it");
  });
}
