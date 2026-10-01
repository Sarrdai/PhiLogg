// GROUP 292 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 292 — Sortable Δt column: "where is the most time lost" without
   a threshold (2026-09-26, follow-up to GROUP 289). The Filtered view's
   Δt header sorts by each row's CHRONOLOGICAL Δt (captured before the
   sort, buildViewDeltaMap) — first click largest first, rows without a Δt
   last in both directions; on a filter node it's the gap within that
   result, on a gap node the measured per-group gap (Gap ≥ 0 per Thread =
   a ranking of the longest per-thread pauses).
   ============================================================ */
group(292);
await withApp(async (w, d, T) => {
  section("292. Sortable Δt column (largest first, chronological Δt, gap nodes)");
  const rows = [[0, "A", "start"], [1, "B", "tick"], [5, "A", "work"], [6, "B", "tick"], [20, "A", "done"]];
  const log = rows.map(([sec, th, msg]) => `2024-01-15 10:00:${String(sec).padStart(2, "0")},000\tINFO\t"${th}"\tFoo.cs\tline 0\t[DoWork]\t"${msg} ${sec}"`).join("\n") + "\n";
  const f = await w.addFile("sort.log", log, () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.revealFilteredView();
  w.render();
  const th = () => d.querySelector('#tableHeader .th-sortable[data-sort="delta"]');
  assert(!!th(), "the Δt header is sortable");
  const view = () => T.currentViewEntries.map(e => e.message).join("|");
  const cells = () => [...d.querySelectorAll("#tableRows .col-delta")].map(c => c.textContent).join("|");
  fireClick(th(), w);
  assert(T.state.sortColumn === "delta" && T.state.sortDir === "desc", "first click sorts Δt largest first");
  assert(view() === "done 20|work 5|tick 1|tick 6|start 0", "largest gap first, the first entry (no Δt) last, got " + view());
  assert(cells() === "+14.0s|+4.0s|+1.0s|+1.0s|—", "each row keeps its chronological Δt, got " + cells());
  assert(th().querySelector(".th-sort-arrow").textContent === "▼", "descending arrow");
  fireClick(th(), w);
  assert(T.state.sortDir === "asc" && view() === "tick 1|tick 6|work 5|done 20|start 0", "ascending: smallest first, no-Δt row still last, got " + view());

  // On a filter node: Δt within that result.
  w.createFilterNode(f.id, "text", "A", false, null, true, ["thread"]); // thread "A" only
  T.state.sortDir = "desc";
  w.render();
  assert(view() === "done 20|work 5|start 0" && cells() === "+15.0s|+5.0s|—", "filter node: Δt between its own rows, got " + view() + " / " + cells());

  // On a gap node (threshold 0, per Thread): the per-thread pauses ranked.
  w.createGapNode(f.id, { ms: 0, per: "thread" });
  w.render();
  assert(view() === "done 20|work 5|tick 6" && cells() === "+15.0s|+5.0s|+5.0s", "Gap ≥ 0 per Thread sorted by Δt ranks the per-thread pauses, got " + view() + " / " + cells());
});
