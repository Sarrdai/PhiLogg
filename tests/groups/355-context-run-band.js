// GROUP 355 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fireClick, makeLog, ...) is in scope.

/* ============================================================
   GROUP 355 — Context view run band: continuous rounded band with grips
   Origin: 2026-10-09 (person-requested, variant C of the run-line mockup):
   the per-row slices of a revealed run (.ctx-run-line) used to stop at the
   row's padding box and read as a dashed line. They now overlap the row's
   1px border-bottom, carry a down/up caret grip at the first/last slice (a
   single-row run is both and gets one i-collapse-in grip), a tooltip with
   the line count and time range, and highlight the whole run on focus too.
   ============================================================ */
group(355);
await withApp(async (w, d, T) => {
  section("355. Context run band: seamless slices, grips, tooltip, whole-run focus, click collapses");

  // "hit" on entries 0, 8 and 10 -> a 7-line gap (1..7 revealed as one run)
  // and a 1-line gap (entry 9, a single-row run).
  const f = await w.addFile("band.log", makeLog(0, 20, { suffix: i => ([0, 8, 10].includes(i) ? "hit" : "other") }), () => {});
  const hitFilter = w.createFilterNode(f.id, "text", "hit");
  T.state.activeId = hitFilter.id;
  w.render();
  w.applyFhView("highlight");

  const fillers = () => [...d.querySelectorAll("#highlightRows .ctx-gap-placeholder")];
  const slices = () => [...d.querySelectorAll("#highlightRows .ctx-run-line")];
  // Time column text minus the leading date (the tooltip shows the time of day only).
  const rowTime = btn => btn.closest(".log-row").querySelector(".col-time").textContent.trim().replace(/^\d{4}-\d\d-\d\d[ T]/, "");
  const iconOf = btn => [...btn.querySelectorAll("use")].map(u => u.getAttribute("href"));

  // --- multi-row run -------------------------------------------------------
  fireClick(fillers()[0], w); // the 7-line gap between entry 0 and entry 8
  await waitFor(() => slices().length >= 2, "the multi-row run renders its slices");
  const run = T.contextRuns[0];
  const n = run.lastRow - run.firstRow + 1;
  assert(n > 1, "sanity: the first revealed run spans several rows, got " + n);
  const all = slices();
  assert(all.length === n, "every row of the run carries a slice, got " + all.length + " of " + n);
  const first = all.find(s => s.classList.contains("ctx-run-top"));
  const last = all.find(s => s.classList.contains("ctx-run-bottom"));
  assert(first && last && first !== last, "the run has distinct first and last slices");
  const middle = all.filter(s => s !== first && s !== last);
  assert(!first.classList.contains("ctx-run-bottom") && !last.classList.contains("ctx-run-top"),
    "a multi-row run's ends are exclusively first / last");
  assert(all.filter(s => s !== last).every(s => w.getComputedStyle(s).bottom === "-1px"),
    "every slice but the last extends over the row's 1px border-bottom (no gap at row borders)");
  assert(w.getComputedStyle(last).bottom !== "-1px", "the last slice stops inside its row (rounded end)");
  assert(JSON.stringify(iconOf(first)) === '["#i-caret-down"]', "the first slice carries the down grip, got " + JSON.stringify(iconOf(first)));
  assert(JSON.stringify(iconOf(last)) === '["#i-caret-up"]', "the last slice carries the up grip, got " + JSON.stringify(iconOf(last)));
  assert(middle.every(s => s.querySelector("svg") === null), "middle slices carry no grip");

  const expectTip = "Collapse " + n + " lines (" + rowTime(first) + " – " + rowTime(last) + ")";
  assert(first.title === expectTip && last.title === expectTip && middle.every(s => s.title === expectTip),
    "every slice's tooltip is '" + expectTip + "', got '" + first.title + "'");
  assert(/^Collapse 7 lines \(\S+ – \S+\)$/.test(first.title), "…with the count, a spaced en dash and two times, got '" + first.title + "'");

  // --- focus highlights the whole run ---------------------------------------
  middle[0].dispatchEvent(new w.FocusEvent("focus"));
  assert(slices().every(s => s.classList.contains("ctx-run-hover")), "focusing a slice highlights every rendered slice of its run");
  middle[0].dispatchEvent(new w.FocusEvent("blur"));
  assert(slices().every(s => !s.classList.contains("ctx-run-hover")), "…and blur clears it again");

  // --- click collapses the run ----------------------------------------------
  T.state.selectedId = null;
  fireClick(middle[0], w);
  assert(T.contextRuns.length === 0 && T.currentHighlightViewEntries.length === 3,
    "clicking the band collapses the whole run, got " + T.currentHighlightViewEntries.length + " rows");
  assert(T.state.selectedId === null, "…without selecting the row underneath");

  // --- single-row run -------------------------------------------------------
  const oneGap = fillers().find(el => /\b1 line\b/.test(el.textContent));
  assert(oneGap, "sanity: the 1-line gap's filler exists");
  fireClick(oneGap, w);
  await waitFor(() => slices().length === 1, "the single-row run renders exactly one slice");
  const one = slices()[0];
  assert(one.classList.contains("ctx-run-top") && one.classList.contains("ctx-run-bottom"),
    "a single-row run is both first and last");
  assert(JSON.stringify(iconOf(one)) === '["#i-collapse-in"]', "…and shows exactly one i-collapse-in grip, got " + JSON.stringify(iconOf(one)));
  assert(one.title === "Collapse 1 line", "a one-row run's tooltip has no time range, got '" + one.title + "'");
  assert(w.getComputedStyle(one).justifyContent === "center", "…and its grip is centred");
  fireClick(one, w);
  assert(slices().length === 0, "clicking a single-row band collapses it");
});
