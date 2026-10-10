// GROUP 226 — loaded by philogg.regression.test.js (tests/README.md →
// "Group files"): runs inside its main async function, so every harness
// helper (withApp, waitFor, assert, section, fs, path, ...) is in scope.

/* ============================================================
   GROUP 226 — Minimap binning mode: entries-based bar layout (Settings ->
   Timeline minimap, FEATURE_BACKLOG.md #2, person-approved design this
   session: "Minimap: line-based instead of time-based"). A new
   `minimapBinningMode` ("time" | "entries", default "time") switches the
   minimap's bar LAYOUT between positioning bars by timestamp (existing
   behavior — a bar's x is proportional to where its ts sits in
   [minimapTMin, minimapTMax]) and positioning them by ENTRY INDEX among
   the root file's entries instead (x proportional to position in
   0..entryCount-1) — so a burst of fast activity spreads out evenly across
   the width instead of compressing into a few pixels, and a long idle
   stretch stops eating most of the width just because it covers a lot of
   wall-clock time.
   Deliberately visualization-only, confirmed by the project owner: every
   INTERACTION (click-to-jump, drag-select, the range-indicator boxes, the
   hover tooltip, the selection marker) keeps working completely unchanged,
   because none of them contain their own notion of "where in time/space is
   this pixel" — they all route through minimapTsToX/minimapXToTs/
   minimapBucketOf, the only three functions this mode is ever branched on.
   A click that used to resolve to an interpolated point in time now
   resolves to a REAL entry's exact timestamp in entries mode (minimapXToTs
   looks the index up in minimapRootEntries directly) — existing downstream
   logic already handles a real timestamp correctly, so nothing above this
   conversion layer needed a single line changed.
   Covers: the Settings select persists to localStorage and drives
   minimapBinningMode, and re-hydrates on (re-)init the same way
   initMinimapFullRangeSetting's own coverage (Group 119a) does; with an
   irregular-gap fixture (a 20-entry burst one millisecond apart, then a
   20-minute idle gap, then 19 more entries a second apart) minimapTsToX
   resolves the post-gap entry's x by TIME proportion (~98%, dominated by
   the idle gap) in time mode and by INDEX proportion (~51%, entry 20 of
   39) in entries mode — visibly different x positions for the exact same
   entry, and the rendered SVG bar for a lone matched entry sits at the
   same index-proportional bucket minimapBucketOf computes; click-to-jump,
   drag-select (-> a real "timerange" filter from two real entries' own
   timestamps), and the hover tooltip (-> the real hovered entry's own
   formatTime) all still resolve correctly with entries mode active. Every
   EXISTING minimap group (31/32/34/95/119/120/197/...) keeps passing
   unchanged, since "time" stays the default and none of them touch the
   new setting.
   ============================================================ */
group(226);
await withApp(async (w, d, T) => {
  section("226a. Settings toggle: minimapBinningMode persists to localStorage and re-hydrates on (re-)init");

  const f = await w.addFile("a.log", makeLog(0, 10), () => {});
  T.state.activeId = f.id;
  w.render();

  assert(T.minimapBinningMode === "time", "sanity: default binning mode is \"time\"");
  const select = d.querySelector("#settingsMinimapBinningMode");
  assert(select && select.value === "time", "Settings select starts on \"Time-based\"");

  select.value = "entries";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.minimapBinningMode === "entries", "changing the select drives minimapBinningMode");
  assert(w.localStorage.getItem("philogg-minimap-binning-mode") === "entries", "...and persists it to localStorage under its own key");

  // Persisted flag honored on (re-)init, same path real boot uses — same
  // pattern initMinimapFullRangeSetting's own coverage (Group 119a) uses.
  select.value = "time";
  T.minimapBinningMode = "time";
  w.localStorage.setItem("philogg-minimap-binning-mode", "entries");
  w.initMinimapBinningModeSetting();
  assert(T.minimapBinningMode === "entries", "re-hydrating from a persisted \"entries\" value restores it");
  assert(select.value === "entries", "...and reflects it back into the select");

  w.localStorage.setItem("philogg-minimap-binning-mode", "time");
  w.initMinimapBinningModeSetting();
  assert(T.minimapBinningMode === "time" && select.value === "time", "re-hydrating from a persisted \"time\" value restores the default");

  // Restore the toggle itself back to the default via the real change path
  // so the persisted value matches what the select shows.
  select.value = "time";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.minimapBinningMode === "time" && w.localStorage.getItem("philogg-minimap-binning-mode") === "time", "switching back to \"time\" persists too");
});

await withApp(async (w, d, T) => {
  section("226b. Entries mode positions bars by ENTRY INDEX, not by timestamp — irregular-gap fixture, plus every interaction stays correct");

  // Burst: 20 entries one millisecond apart (10:00:00,000 .. 10:00:00,019).
  // Idle gap: entry 20 lands 20 minutes later (10:20:00,000). Tail: 19 more
  // entries one second apart (10:20:01 .. 10:20:19). 40 entries total,
  // indices 0..39 — deliberately lopsided in TIME (the 20-minute gap alone
  // is ~98% of the file's whole time span) but perfectly even in INDEX.
  const pad2 = v => String(v).padStart(2, "0");
  const pad3 = v => String(v).padStart(3, "0");
  const lines = [];
  const push = (h, m, s, ms, msg) => lines.push(`2024-01-15 ${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}\tINFO\t"main"\tFoo.cs\tline 0\t[DoWork]\t"${msg}"`);
  for (let i = 0; i < 20; i++) push(10, 0, 0, i, "burst " + i); // indices 0-19
  push(10, 20, 0, 0, "post-gap 20"); // index 20 — first entry after the idle gap
  for (let i = 1; i <= 19; i++) push(10, 20, i, 0, "tail " + i); // indices 21-39

  const f = await w.addFile("gap.log", lines.join("\n") + "\n", () => {});
  T.state.activeId = f.id;
  T.state.sortColumn = null;
  w.render();

  assert(f.entries.length === 40, "sanity: fixture has 40 entries, got " + f.entries.length);
  const target = f.entries[20]; // the first entry after the 20-minute idle gap

  // --- Time mode (default): x is skewed hard toward the right, dominated
  // by the idle gap's share of the file's whole time span. ---
  const xTime = w.minimapTsToX(target.ts);
  const expectedTimeFrac = (target.ts - f.entries[0].ts) / (f.entries[39].ts - f.entries[0].ts);
  assert(expectedTimeFrac > 0.9, "sanity: the idle gap dominates the time span (fixture is genuinely lopsided in time), got fraction " + expectedTimeFrac);
  assert(Math.abs(xTime - expectedTimeFrac * T.minimapWidth) < 0.5,
    "time mode: x is proportional to the entry's TIME position, got " + xTime + " vs expected ~" + (expectedTimeFrac * T.minimapWidth));

  // --- Entries mode: same entry now sits at ~51% width (index 20 of 39),
  // regardless of the huge time gap. ---
  d.querySelector("#settingsMinimapBinningMode").value = "entries";
  d.querySelector("#settingsMinimapBinningMode").dispatchEvent(new w.Event("change", { bubbles: true }));
  assert(T.minimapBinningMode === "entries", "sanity: switched to entries mode");

  const xEntries = w.minimapTsToX(target.ts);
  const expectedIdxFrac = 20 / 39;
  assert(Math.abs(xEntries - expectedIdxFrac * T.minimapWidth) < 0.5,
    "entries mode: x is proportional to the entry's INDEX position (20/39), got " + xEntries + " vs expected ~" + (expectedIdxFrac * T.minimapWidth));
  assert(Math.abs(xEntries - xTime) > T.minimapWidth * 0.3,
    "the exact same entry lands at a visibly different x in the two modes, got time=" + xTime + " entries=" + xEntries);

  // minimapXToTs inverts an x back to the REAL entry's own timestamp (not an
  // interpolated point) — the crux of why click/drag/etc. below need no
  // changes of their own to work correctly in this mode.
  assert(w.minimapXToTs(xEntries) === target.ts, "minimapXToTs resolves the x back to the exact real entry's timestamp in entries mode");

  // --- The rendered SVG bar itself reflects the same index-proportional
  // placement: the bucket a lone matched entry's overlay bar sits in must
  // equal minimapBucketOf's own index-based formula, not the time-based one. ---
  const soloFilter = w.createFilterNode(f.id, "text", "post-gap 20");
  T.state.activeId = soloFilter.id;
  w.render();
  const ovBars = [...d.querySelectorAll("#timelineMinimapSvg .minimap-ov-bar")];
  assert(ovBars.length === 1, "exactly one overlay path for the single matched entry, got " + ovBars.length);
  const barX = parseFloat(/^M([\d.]+) /.exec(ovBars[0].getAttribute("d"))[1]); // one path per level, a sub-path per bucket
  const expectedBucket = Math.min(T.minimapBucketCount - 1, Math.floor((20 / 40) * T.minimapBucketCount));
  const expectedBarX = expectedBucket * (T.minimapWidth / T.minimapBucketCount);
  assert(Math.abs(barX - expectedBarX) < 0.5,
    "the rendered overlay bar sits at the index-proportional bucket, got x=" + barX + " expected ~" + expectedBarX);

  // --- Click-to-jump still selects the correct entry in entries mode
  // (unchanged code — see the group banner's "conversion layer" note). ---
  T.state.activeId = f.id;
  T.state.selectedId = null;
  w.render();
  const svg = d.querySelector("#timelineMinimapSvg");
  const jumpX = w.minimapTsToX(target.ts);
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: jumpX, clientY: 10 }));
  assert(T.state.selectedId === target.id, "click-to-jump in entries mode still selects the correct entry (post-gap index 20), got selectedId " + T.state.selectedId);

  // --- Drag-select still creates a correct "timerange" filter from two REAL
  // timestamps (entries mode routes through the exact same handler, just
  // with a mode-aware minimapXToTs/minimapTsToX underneath it). ---
  const beforeChildCount = f.children.length;
  const x1 = w.minimapTsToX(f.entries[5].ts), x2 = w.minimapTsToX(f.entries[25].ts);
  svg.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles: true, clientX: x1, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("pointermove", { bubbles: true, clientX: x2, clientY: 10 }));
  w.dispatchEvent(new w.MouseEvent("pointerup", { bubbles: true, clientX: x2, clientY: 10 }));
  svg.dispatchEvent(new w.MouseEvent("click", { bubbles: true, clientX: x2, clientY: 10 }));
  d.querySelector('#timelineMinimapDraftBar [data-act="filter"]').click(); // drag leaves a draft window, Filter turns it into the node
  assert(f.children.length === beforeChildCount + 1, "drag-select still creates exactly one new filter child in entries mode, got " + f.children.length);
  const rangeNode = f.children.map(id => T.state.nodes[id]).find(n => n.filterType === "timerange");
  assert(rangeNode, "the created node has filterType \"timerange\"");
  assert(rangeNode.value.from === f.entries[5].ts && rangeNode.value.to === f.entries[25].ts,
    "the range's bounds are the two REAL dragged entries' own timestamps, got " + JSON.stringify(rangeNode.value));

  // --- Hover tooltip resolves the correct bucket/entry in entries mode too
  // (now routed through minimapXToTs/minimapBucketOf instead of a hand-
  // rolled time-proportion formula — see the philogg.html comment). ---
  T.state.activeId = f.id;
  w.render();
  const hoverX = w.minimapTsToX(target.ts);
  svg.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: hoverX, clientY: 10 }));
  const tooltipText = d.querySelector("#timelineMinimapTooltip").textContent;
  assert(tooltipText.includes(w.formatTime(target.ts)), "hover tooltip in entries mode shows the real hovered entry's own time, got " + JSON.stringify(tooltipText));
});
