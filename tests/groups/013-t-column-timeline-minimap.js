// GROUP 13 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 13 — Δt column + Timeline minimap
   Origin: b647f247 (27-check jsdom suite, incl. a scenario with burst
   traffic, a 6-second stall, and an isolated error — re-created here).
   ============================================================ */
group(13);
await withApp(async (w, d, T) => {
  section("13. Δt column + Timeline minimap");
  // Build: 5 rapid entries (burst), then a 6s stall, then 1 more entry.
  const lines = [];
  const push = (sec, level, msg) => lines.push(`2024-01-15 10:00:${String(sec).padStart(2, "0")},000\t${level}\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`);
  for (let i = 0; i < 5; i++) push(i, "INFO", "burst " + i); // 0..4s
  push(10, "ERROR", "isolated error");                        // 6s stall before this one
  const f = await w.addFile("delta.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  const deltaCells = [...d.querySelectorAll("#tableRows .col-delta")];
  assert(deltaCells[0].textContent === "—", "first row has no Δt (no previous row)");
  // DELTA_WARN_MS is exactly 1000 and our burst entries are 1s apart (>=
  // threshold), so they're correctly flagged warn — assert that instead of
  // "not flagged", which was the wrong expectation for this fixture.
  assert(deltaCells[1].className.includes("delta-warn"), "a 1s gap between burst entries hits the warn threshold (DELTA_WARN_MS=1000), classes: " + deltaCells[1].className);
  const stallCell = deltaCells[5];
  assert(stallCell.className.includes("delta-error"), "a 6s stall is flagged as delta-error (>5s threshold), classes: " + stallCell.className);

  // Δt suppressed under column sort
  fireClick([...d.querySelectorAll(".th-sortable")].find(th => th.dataset.sort === "level"), w);
  // Under a column sort each row keeps its own CHRONOLOGICAL Δt (captured
  // before sorting, buildViewDeltaMap) — updated 2026-09-26: it used to be
  // dashed out, since the row above is no longer its predecessor.
  {
    const cells = [...d.querySelectorAll("#tableRows .col-delta")];
    const byMsg = m => cells[T.currentViewEntries.findIndex(e => e.message.startsWith(m))].textContent;
    assert(byMsg("isolated error") === "+6.0s" && byMsg("burst 0") === "—" && byMsg("burst 3") === "+1.0s",
      "under a level sort each row shows its chronological Δt, got " + cells.map(c => c.textContent).join(","));
  }
  T.state.sortColumn = null; w.render();

  // Timeline minimap: background bars for the whole file, overlay for the current view
  assert(d.querySelectorAll("#timelineMinimapSvg .minimap-bg-bar").length > 0, "minimap renders background density bars");
  assert(d.querySelectorAll("#timelineMinimapSvg .minimap-ov-bar").length > 0, "minimap renders overlay bars for the current view");
  assert(d.querySelector("#timelineMinimapMeta").textContent.includes("Start") && d.querySelector("#timelineMinimapMeta").textContent.includes("Duration"),
    "Start/End/Duration meta line renders above the bars");

  // Click-to-jump via lowerBoundByTs + selectEntry
  const ts = w.minimapXToTs ? null : null; // minimapXToTs isn't exported on window (top-level function — it IS, since function decls land on window)
  const clickTs = f.entries[3].ts;
  const x = w.minimapTsToX ? w.minimapTsToX(clickTs) : 0;
  d.querySelector("#timelineMinimapSvg").dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x, clientY: 10 }));
  assert(T.state.selectedId != null, "clicking the minimap selects the nearest entry");

  // Level-toggle overlay recompute (overlay bars reflect the level quick-filter)
  // — pinned to "explicit" mode so the click still goes through the classic
  // state.levelFilter path this test predates (see FEATURE_BACKLOG.md #10 /
  // GROUP 94 for the new default "auto" tree-node behavior).
  T.levelFilterTreeMode = "explicit";
  const errBtn = [...d.querySelectorAll("#levelBar .level-btn")].find(b => b.textContent.includes("ERROR"));
  fireClick(errBtn, w);
  const ovBarsAfter = d.querySelectorAll("#timelineMinimapSvg .minimap-ov-bar").length;
  assert(ovBarsAfter >= 1, "minimap overlay updates after a level-filter toggle");
  fireClick(errBtn, w);
});
