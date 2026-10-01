// GROUP 4 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 4 — Tree / status strip / severity bar / level quick-filter dual-view
   Origin: 765d68a9 (sortable columns, status strip, severity bar) +
   32e282b4 follow-up (level quick-filter updates BOTH Full and Filtered
   views in one click, not just Filtered — Full's own re-render, not its
   filtering). Updated this session (2026-08-19, person-requested, German:
   "die Log Level Filter sollen sich nicht mehr auf das full Log auswirken.
   stattdessen soll ein andern der Log Level Filter auch zu einem
   automatischen Sprung von Full nach Filtered führen"): the level
   quick-filter no longer narrows the Context view's own entry list AT ALL
   (only the Filtered view) — Full stays a stable "whole file" reference
   regardless of the level filter. In exchange, changing the level filter
   while on the Context tab now auto-reveals Filtered, same as switching to
   another filter already does (revealFilteredView).
   ============================================================ */
group(4);
await withApp(async (w, d, T) => {
  section("4. Tree / severity bar / dual-view level filter");
  const f = await w.addFile("a.log", makeLog(0, 30, { levels: ["ERROR", "INFO", "INFO", "INFO", "INFO"] }), () => {});
  w.render();

  // Sortable Time/Level/Thread/Location column headers
  const timeHeader = [...d.querySelectorAll(".th-sortable")].find(th => th.dataset.sort === "level");
  fireClick(timeHeader, w);
  assert(T.state.sortColumn === "level" && T.state.sortDir === "asc", "clicking a sortable header sets sortColumn/sortDir");
  fireClick(timeHeader, w);
  assert(T.state.sortDir === "desc", "clicking the same header again flips direction");
  fireClick(timeHeader, w);
  T.state.sortColumn = null; w.render(); // reset for later groups' Δt/context assumptions

  // Severity bar column exists (widened 3px -> 5px in that session; just check presence)
  assert(d.querySelector("#tableRows .col-bar") !== null, "severity color bar column renders on rows");

  // Level quick-filter: toggling ERROR updates the Filtered (#tableRows) view
  // immediately; the Full (#highlightRows) view re-renders in the SAME click
  // (bugfix from 32e282b4 — previously only renderTable() was called,
  // leaving Full stale until an unrelated render happened to touch it) but
  // deliberately does NOT narrow its own entry list (this session's change —
  // see GROUP 61e below for the auto-reveal-Filtered half of that change).
  T.levelFilterTreeMode = "explicit"; // pin the classic state.levelFilter path (see GROUP 94 for the new default "auto" tree-node behavior)
  w.applyFhView("stacked"); // both panels rendered so we can inspect both
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  const filteredLevels = [...d.querySelectorAll("#tableRows .level-badge")].map(b => b.textContent);
  assert(filteredLevels.length > 0 && filteredLevels.every(l => l === "ERROR"), "Filtered view narrows to ERROR immediately");
  // Asserted on the entry LIST, not on the rendered rows: the Context view is
  // row-virtualized off an offsets array now (gap strips make row heights
  // variable), so how many rows happen to be in the DOM depends on the stubbed
  // viewport height rather than on what the view actually holds.
  assert(T.currentHighlightViewEntries.length === 30 &&
    T.currentHighlightViewEntries.some(e => e.level === "INFO"),
    "Context view is unaffected by the level quick-filter — a file node is active, so it holds the whole file");
  fireClick(errBtn, w); // reset
});
