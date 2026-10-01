// GROUP 162 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 162 — Statistics panel: Table-only, Entry-Detail-style pin/hover
   Origin: this session (2026-09-03), fully replaced (2026-09-05,
   person-requested): the Statistics panel moved out of #extractToolbar
   entirely into its own #statsPanel, positioned and behaving (including
   pin-or-hover, mirroring #detailPanel) — but only for the Table view; Plot
   lost the Statistics panel completely. Default is pinned open (no more
   separate show/hide button — the panel's own header toggle is it).
   ============================================================ */
group(162);
await withApp(async (w, d, T) => {
  section("162a. Defaults to pinned open, with no localStorage entry yet");

  assert(w.localStorage.getItem("philogg-stats-collapsed") === null, "sanity: nothing persisted yet");
  assert(!d.querySelector("#statsPanel").classList.contains("collapsed"), "the panel is expanded by default");
});

await withApp(async (w, d, T) => {
  section("162b. Statistics panel shows on Table, is entirely absent (display:none) on Plot");

  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"score=${i}.5"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const statsPanel = d.querySelector("#statsPanel");
  assert(statsPanel.style.display === "flex", "shown while on Table");
  assert(d.querySelector("#extractStatsContent").textContent.includes("score"), "the chip content is rendered");
  assert(!d.querySelector("#tableToolbar").querySelector("#statsToggleTable"), "sanity: the old per-tab toggle button is gone from Table's toolbar");

  w.applyFhView("plot");
  assert(statsPanel.style.display === "none", "hidden entirely while on Plot — Plot has no Statistics panel anymore");
  assert(!d.querySelector("#plotToolbar").querySelector("#statsTogglePlot"), "sanity: the old per-tab toggle button is gone from Plot's toolbar too");

  w.applyFhView("table");
  assert(statsPanel.style.display === "flex", "shown again switching back to Table");
});

await withApp(async (w, d, T) => {
  section("162c. Header toggle collapses/pins the panel, same mechanic as Entry Detail's own toggle, persisted across app restart");

  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"score=${i}.5"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const statsPanel = d.querySelector("#statsPanel");
  assert(!statsPanel.classList.contains("collapsed"), "sanity: starts expanded (pinned)");

  fireClick(d.querySelector("#statsToggle"), w);
  assert(statsPanel.classList.contains("collapsed"), "clicking the header toggle collapses it");
  assert(w.localStorage.getItem("philogg-stats-collapsed") === "1", "collapsed state persisted to localStorage");

  fireClick(d.querySelector("#statsToggle"), w);
  assert(!statsPanel.classList.contains("collapsed"), "clicking again re-expands (pins) it");
  assert(w.localStorage.getItem("philogg-stats-collapsed") === "0", "expanded state persisted to localStorage");
});

await withApp(async (w, d, T) => {
  section("162d. Collapsed + hover peeks the panel open, same as Entry Detail (hoverExpandDetail governs both)");

  const log = [0, 1, 2]
    .map(i => `2024-01-15 10:00:0${i},000\tINFO\t"main"\tC:\\src\\Foo.cs\tline ${i}\t[DoWork]\t"score=${i}.5"`)
    .join("\n") + "\n";
  const f = await w.addFile("a.log", log, () => {});
  const node = w.createFilterNode(f.id, "text", "score=[*:float]");
  T.state.activeId = node.id;
  w.render();
  w.applyFhView("table");

  const statsPanel = d.querySelector("#statsPanel");
  fireClick(d.querySelector("#statsToggle"), w);
  assert(statsPanel.classList.contains("collapsed"), "sanity: collapsed");

  statsPanel.dispatchEvent(new w.Event("mouseenter", { bubbles: true }));
  assert(statsPanel.classList.contains("peeking"), "hovering a collapsed panel peeks it open");

  statsPanel.dispatchEvent(new w.Event("mouseleave", { bubbles: true }));
  assert(!statsPanel.classList.contains("peeking"), "leaving drops the peek again");
  assert(statsPanel.classList.contains("collapsed"), "sanity: still collapsed, only the peek ended");
});
